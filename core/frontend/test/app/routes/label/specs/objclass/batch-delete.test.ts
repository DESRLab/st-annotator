import { afterEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ definitions: vi.fn(), selections: vi.fn() }));
vi.mock("../../../../../../app/loaders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../../../app/loaders")>()),
  loadAccessTokenSession: async () => ({ token: { access_token: "access" } }),
}));
vi.mock("../../../../../../client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../../../client")>()),
  bulkDeleteObjclassesLabelSpecObjclassDefinitionsBulkDelete: api.definitions,
  bulkDeleteSelectionsLabelSpecObjclassSelectionsBulkDelete: api.selections,
}));

import { action as deleteDefinitions } from "../../../../../../app/routes/label/specs/objclass/definitions";
import { action as deleteSelections } from "../../../../../../app/routes/label/specs/objclass/selections";

afterEach(() => vi.resetAllMocks());

it.each([
  ["definitions", deleteDefinitions],
  ["selections", deleteSelections],
] as const)(
  "submits every selected object-class %s ID and preserves API errors",
  async (kind, action) => {
    const form = new FormData();
    form.set("_action", "batch_delete");
    form.set("selectedIds", "[1,2,3]");
    const submit = () =>
      action({
        request: new Request("http://localhost/", {
          method: "POST",
          body: form,
        }),
      } as any);
    api[kind].mockResolvedValue({ data: { success: true } });
    expect(await submit()).toEqual({
      success: `3 object class ${kind} deleted successfully.`,
    });
    expect(api[kind]).toHaveBeenLastCalledWith({
      auth: "access",
      body: [1, 2, 3],
    });
    api[kind].mockResolvedValue({ error: { detail: "Forbidden" } });
    expect(await submit()).toEqual({ error: "Forbidden" });
  },
);

it.each(["[]", "[1]", "[1,1]", "[1,-2]", '[1,"2"]', "invalid"])(
  "refuses invalid batch IDs %s before issuing a delete",
  async (value) => {
    for (const action of [deleteDefinitions, deleteSelections]) {
      const form = new FormData();
      form.set("_action", "batch_delete");
      form.set("selectedIds", value);
      expect(
        await action({
          request: new Request("http://localhost/", {
            method: "POST",
            body: form,
          }),
        } as any),
      ).toEqual({ error: "Select at least two valid records to delete." });
    }
    expect(api.definitions).not.toHaveBeenCalled();
    expect(api.selections).not.toHaveBeenCalled();
  },
);
