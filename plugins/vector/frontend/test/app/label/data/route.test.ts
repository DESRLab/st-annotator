import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  groups: vi.fn(),
  branches: vi.fn(),
  elements: vi.fn(),
}));
vi.mock("sta/app/loaders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("sta/app/loaders")>()),
  getCurrentSession: async () => ({
    get: (key: string) =>
      key === "token" ? { access_token: "access" } : undefined,
  }),
  getUser: () => ({ id: 1, roles: ["annotator"] }),
  loadAuthenticatedSession: async () => ({
    session: {},
    token: { access_token: "access" },
    user: { id: 1, roles: ["annotator"] },
  }),
}));
vi.mock("sta/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("sta/client")>()),
  listGroupsLabelGroupsGet: api.groups,
  listBranchesLabelRepoBranchesGet: api.branches,
  listElementSummariesLabelDataVectorElementSummaryGet: api.elements,
}));

import { loader } from "../../../../app/label/data/vector";

afterEach(() => {
  vi.clearAllMocks();
});

describe("vector label-data route adapter", () => {
  it.each([
    [403, "Forbidden"],
    [404, "Not Found"],
  ])(
    "preserves a %i group refusal without loading protected rows",
    async (status, detail) => {
      api.groups.mockResolvedValue({
        error: { detail },
        response: new Response(null, { status }),
      });

      const result = (await loader({
        request: new Request("http://localhost/label/data/vector"),
      } as any)) as any;

      expect(api.groups).toHaveBeenCalledOnce();
      expect(result.loaderError).toContain(detail);
      expect(result.loaderError).not.toBeNull();
      expect(api.branches).not.toHaveBeenCalled();
      expect(api.elements).not.toHaveBeenCalled();
    },
  );

  it("handles empty groups and invalid query parameters without loading elements", async () => {
    api.groups.mockResolvedValue({ data: [] });
    const response = (await loader({
      request: new Request(
        "http://localhost/label/data/vector?group_id=nope&commit_hash=bad&page=3",
      ),
    } as any)) as Response;
    expect(response.headers.get("Location")).toBe("/label/data/vector?");
    expect(api.elements).not.toHaveBeenCalled();
  });

  it("loads the selected commit page and surfaces upstream errors", async () => {
    api.groups.mockResolvedValue({ data: [{ id: 7, name: "Vectors" }] });
    api.branches.mockResolvedValue({
      data: [{ name: "main", head_hash: "head", checkpoint_hash: null }],
    });
    api.elements.mockResolvedValue({
      data: [{ id: "vector-1" }],
      error: { detail: "partial failure" },
    });
    const result = (await loader({
      request: new Request(
        "http://localhost/label/data/vector?group_id=7&commit_hash=head&page=2&pageSize=25",
      ),
    } as any)) as any;
    expect(result.elements).toEqual([{ id: "vector-1" }]);
    expect(JSON.stringify(result)).not.toContain('"accessToken"');
    expect(JSON.stringify(result)).not.toContain('"token"');
    expect(result.loaderError).toContain("partial failure");
    expect(api.elements).toHaveBeenCalledWith({
      auth: "access",
      query: {
        group_id: 7,
        commit_hash: "head",
        offset: 25,
        limit: 25,
      },
    });
  });
});
