import { expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  groups: vi.fn().mockResolvedValue({ data: [{ id: 7, name: "Relations" }] }),
  branches: vi.fn().mockResolvedValue({ data: [] }),
  relations: vi
    .fn()
    .mockResolvedValue({ data: [{ id: "relation", relation_class_id: 42 }] }),
  classes: vi.fn().mockResolvedValue({ data: [{ id: 42, name: "Supports" }] }),
}));

vi.mock("sta/app/loaders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("sta/app/loaders")>()),
  loadAuthenticatedSession: async () => ({ token: { access_token: "access" } }),
}));
vi.mock("sta/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("sta/client")>()),
  listGroupsLabelGroupsGet: api.groups,
  listBranchesLabelRepoBranchesGet: api.branches,
  listRelationsLabelDataRelationGet: api.relations,
  listRelclassesLabelSpecRelationClassDefinitionsGet: api.classes,
}));

import { loader } from "../../../../app/label/data/relations";

it("loads relation class names separately from object classes", async () => {
  const data = await loader({
    request: new Request(
      "http://localhost/label/data/relation?group_id=7&commit_hash=head",
    ),
  } as any);
  expect(data).toMatchObject({ classNames: { 42: "Supports" }, error: null });
  expect(api.classes).toHaveBeenCalledWith({ auth: "access" });
});

it("requests a bounded page without an exact total and detects a next page", async () => {
  api.relations.mockResolvedValueOnce({
    data: Array.from({ length: 26 }, (_, i) => ({
      id: `relation-${i}`,
      relation_class_id: 42,
    })),
    response: new Response(null, {
      headers: { "Content-Range": "relations 25-51/*" },
    }),
  });
  const data = await loader({
    request: new Request(
      "http://localhost/label/data/relation?group_id=7&commit_hash=head&page=2&pageSize=25",
    ),
  } as any);
  expect(api.relations).toHaveBeenLastCalledWith({
    auth: "access",
    query: {
      group_id: 7,
      commit_hash: "head",
      offset: 25,
      limit: 26,
      include_total: false,
    },
  });
  expect(data).toHaveProperty("rows.length", 25);
  expect(data).toMatchObject({
    pagination: { pageNumber: 2, pageSize: 25, hasNextPage: true },
  });
});

it.each(["elements"])(
  "forwards column filters before paginating %s",
  async (tab) => {
    api.groups.mockResolvedValue({ data: [{ id: 7, name: "Labels" }] });
    api.branches.mockResolvedValue({
      data: [{ name: "main", head_hash: "head", checkpoint_hash: "base" }],
    });
    api.relations.mockResolvedValue({ data: [] });
    const filters = JSON.stringify([
      { columnId: "id", operator: "", searchTerms: ["abc"] },
    ]);
    const url = new URL(
      "http://localhost/label/data/relation?group_id=7&commit_hash=head&page=2&pageSize=25",
    );
    url.searchParams.set("tab", tab);
    url.searchParams.set("filters", filters);
    await loader({ request: new Request(url) } as any);
    const load = api.relations;
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
