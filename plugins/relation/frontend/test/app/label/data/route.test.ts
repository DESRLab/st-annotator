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
