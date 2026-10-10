import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  token: { access_token: "access" } as any,
  user: { id: 1, roles: ["annotator"] } as any,
  groups: vi.fn(),
  branches: vi.fn(),
  elements: vi.fn(),
  entities: vi.fn(),
}));
vi.mock("sta/app/loaders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("sta/app/loaders")>()),
  getCurrentSession: async () => ({
    get: (key: string) => (key === "token" ? state.token : undefined),
  }),
  getUser: () => state.user,
  loadAuthenticatedSession: async () => ({
    session: {},
    token: state.token,
    user: state.user,
  }),
}));
vi.mock("sta/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("sta/client")>()),
  listGroupsLabelGroupsGet: state.groups,
  listBranchesLabelRepoBranchesGet: state.branches,
  listElementSummariesLabelDataBboxElementSummaryGet: state.elements,
  listEntitiesLabelDataBboxEntityGet: state.entities,
}));

import { loader } from "../../../../app/label/data/bbox";

afterEach(() => {
  vi.clearAllMocks();
  state.token = { access_token: "access" };
  state.user = { id: 1, roles: ["annotator"] };
});

function setup(error?: unknown) {
  state.groups.mockResolvedValue({ data: [{ id: 7, name: "Boxes" }], error });
  state.branches.mockResolvedValue({
    data: [{ name: "main", head_hash: "head", checkpoint_hash: "base" }],
  });
  state.elements.mockResolvedValue({ data: [{ id: "box-1" }] });
  state.entities.mockResolvedValue({ data: [{ id: "track-1" }] });
}

describe("bbox label-data route adapter", () => {
  it.each([
    [403, "Forbidden"],
    [404, "Not Found"],
  ])(
    "preserves a %i group refusal without loading protected rows",
    async (status, detail) => {
      state.groups.mockResolvedValue({
        error: { detail },
        response: new Response(null, { status }),
      });

      const result = (await loader({
        request: new Request("http://localhost/label/data/bbox?tab=elements"),
      } as any)) as any;

      expect(state.groups).toHaveBeenCalledOnce();
      expect(result.loaderError).toContain(detail);
      expect(result.loaderError).not.toBeNull();
      expect(state.branches).not.toHaveBeenCalled();
      expect(state.elements).not.toHaveBeenCalled();
      expect(state.entities).not.toHaveBeenCalled();
    },
  );

  it("canonicalizes invalid filters and clears stale pagination", async () => {
    setup();
    const response = (await loader({
      request: new Request(
        "http://localhost/label/data/bbox?group_id=99&commit_hash=bad&tab=bad&page=4&pageSize=25",
      ),
    } as any)) as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "/label/data/bbox?tab=elements",
    );
    expect(state.elements).not.toHaveBeenCalled();
  });

  it("loads only the selected tab with preserved pagination and bearer auth", async () => {
    setup();
    const result = (await loader({
      request: new Request(
        "http://localhost/label/data/bbox?group_id=7&commit_hash=head&tab=entities&page=2&pageSize=25",
      ),
    } as any)) as any;
    expect(result.activeTab).toBe("entities");
    expect(result.elements).toEqual([]);
    expect(result.entities).toEqual([{ id: "track-1" }]);
    expect(JSON.stringify(result)).not.toContain('"accessToken"');
    expect(JSON.stringify(result)).not.toContain('"token"');
    expect(state.entities).toHaveBeenCalledWith({
      auth: "access",
      query: {
        group_id: 7,
        commit_hash: "head",
        offset: 25,
        limit: 25,
      },
    });
    expect(state.elements).not.toHaveBeenCalled();
  });

  it("normalizes upstream errors into loader data", async () => {
    setup({ detail: "groups unavailable" });
    const result = (await loader({
      request: new Request("http://localhost/label/data/bbox?tab=elements"),
    } as any)) as any;
    expect(result.loaderError).toContain("groups unavailable");
    expect(result.elementsPagination.totalItems).toBe(0);
  });
});
