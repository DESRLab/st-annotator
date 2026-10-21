import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  groups: vi.fn(),
  classes: vi.fn().mockResolvedValue({ data: [{ id: 42, name: "Chair" }] }),
  branches: vi.fn(),
  elements: vi.fn(),
  entities: vi.fn(),
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
  listObjclassesLabelSpecObjclassDefinitionsGet: api.classes,
  listBranchesLabelRepoBranchesGet: api.branches,
  listElementSummariesLabelDataSegmentationElementSummaryGet: api.elements,
  listEntitiesLabelDataSegmentationEntityGet: api.entities,
}));

import { loader } from "../../../../app/label/data/segmentation";

afterEach(() => {
  vi.clearAllMocks();
});

function setup() {
  api.groups.mockResolvedValue({ data: [{ id: 7, name: "Selections" }] });
  api.branches.mockResolvedValue({
    data: [{ name: "main", head_hash: "head", checkpoint_hash: null }],
  });
  api.elements.mockResolvedValue({ data: [{ id: "selection-1" }] });
  api.entities.mockResolvedValue({ data: [{ id: "instance-1" }] });
}

describe("segmentation label-data route adapter", () => {
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
        request: new Request(
          "http://localhost/label/data/segmentation?tab=elements",
        ),
      } as any)) as any;

      expect(api.groups).toHaveBeenCalledOnce();
      expect(result.loaderError).toContain(detail);
      expect(result.loaderError).not.toBeNull();
      expect(api.branches).not.toHaveBeenCalled();
      expect(api.elements).not.toHaveBeenCalled();
      expect(api.entities).not.toHaveBeenCalled();
    },
  );

  it("canonicalizes unknown tabs and invalid selections", async () => {
    setup();
    const response = (await loader({
      request: new Request(
        "http://localhost/label/data/segmentation?group_id=8&commit_hash=no&tab=unknown&page=9",
      ),
    } as any)) as Response;
    expect(response.headers.get("Location")).toBe(
      "/label/data/segmentation?tab=elements",
    );
    expect(api.elements).not.toHaveBeenCalled();
    expect(api.entities).not.toHaveBeenCalled();
  });

  it("loads only instance entities for the entities tab", async () => {
    setup();
    const result = (await loader({
      request: new Request(
        "http://localhost/label/data/segmentation?group_id=7&commit_hash=head&tab=entities&page=2&pageSize=25",
      ),
    } as any)) as any;
    expect(result.activeTab).toBe("entities");
    expect(result.elements).toEqual([]);
    expect(result.entities).toEqual([{ id: "instance-1" }]);
    expect(result.classNames).toEqual({ 42: "Chair" });
    expect(api.classes).toHaveBeenCalledWith({ auth: "access" });
    expect(JSON.stringify(result)).not.toContain('"accessToken"');
    expect(JSON.stringify(result)).not.toContain('"token"');
    expect(api.entities).toHaveBeenCalledWith({
      auth: "access",
      query: {
        group_id: 7,
        commit_hash: "head",
        offset: 25,
        limit: 26,
        include_total: false,
      },
    });
    expect(api.elements).not.toHaveBeenCalled();
  });
});

it.each(["elements", "entities"])(
  "forwards column filters before paginating %s",
  async (tab) => {
    setup();
    const filters = JSON.stringify([
      { columnId: "id", operator: "", searchTerms: ["abc"] },
    ]);
    const url = new URL(
      "http://localhost/label/data/segmentation?group_id=7&commit_hash=head&page=2&pageSize=25",
    );
    url.searchParams.set("tab", tab);
    url.searchParams.set("filters", filters);
    await loader({ request: new Request(url) } as any);
    const load = tab === "entities" ? api.entities : api.elements;
    expect(load).toHaveBeenLastCalledWith({
      auth: "access",
      query: {
        group_id: 7,
        commit_hash: "head",
        offset: 25,
        limit: 26,
        include_total: false,
        filters,
      },
    });
  },
);
