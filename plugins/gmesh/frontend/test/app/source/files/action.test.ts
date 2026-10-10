import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn() }));
vi.mock("sta/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("sta/client")>()),
  listMetadatasSourceDataGmeshMetadataGet: api.list,
  bulkCreateMetadatasSourceDataGmeshMetadataBulkPost: api.create,
}));

import {
  importGroundMeshFiles,
  listGroundMeshRegistrations,
} from "../../../../app/source/files/action";

function validForm(paths = ["mesh/a.bin"]) {
  const form = new FormData();
  paths.forEach((path) => form.append("path", path));
  form.set("group_id", "7");
  for (const name of [
    "translate_x",
    "translate_y",
    "translate_z",
    "rotate_x",
    "rotate_y",
    "rotate_z",
  ])
    form.set(name, "0");
  for (const name of ["scale_x", "scale_y", "scale_z"]) form.set(name, "1");
  return form;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("ground-mesh file adapter", () => {
  it("validates inputs before contacting the API", async () => {
    expect(
      await importGroundMeshFiles({
        formData: new FormData(),
        accessToken: "token",
      }),
    ).toEqual({ error: "Select at least one file to register." });
    const noGroup = validForm();
    noGroup.delete("group_id");
    expect(
      (
        await importGroundMeshFiles({
          formData: noGroup,
          accessToken: "token",
        })
      ).error,
    ).toContain("Source group");
    const traversal = validForm(["../mesh.bin"]);
    expect(
      (
        await importGroundMeshFiles({
          formData: traversal,
          accessToken: "token",
        })
      ).error,
    ).toContain("relative");
    expect(api.list).not.toHaveBeenCalled();
  });

  it("rejects duplicates, handles API errors, and creates normalized bulk metadata", async () => {
    api.list.mockResolvedValueOnce({ data: [{ uri: "mesh/a.bin" }] });
    expect(
      (
        await importGroundMeshFiles({
          formData: validForm(),
          accessToken: "token",
        })
      ).error,
    ).toContain("already assigned");
    api.list.mockResolvedValueOnce({ data: [] });
    api.create.mockResolvedValueOnce({
      error: { detail: "cannot create" },
    });
    expect(
      (
        await importGroundMeshFiles({
          formData: validForm(),
          accessToken: "token",
        })
      ).error,
    ).toContain("cannot create");
    api.list.mockResolvedValueOnce({ data: [] });
    api.create.mockResolvedValueOnce({ data: [] });
    expect(
      (
        await importGroundMeshFiles({
          formData: validForm([" mesh/a.bin ", "mesh/b.bin"]),
          accessToken: "token",
        })
      ).success,
    ).toContain("2 ground mesh");
    expect(
      api.create.mock.calls.at(-1)[0].body.map((entry: any) => entry.uri),
    ).toEqual(["mesh/a.bin", "mesh/b.bin"]);
  });

  it("returns only requested registrations with named groups", async () => {
    api.list.mockResolvedValue({
      data: [
        { uri: "mesh/a.bin", group: { name: "Ground A" } },
        { uri: "mesh/b.bin", group: null },
        { uri: "other.bin", group: { name: "Other" } },
      ],
    });
    expect(
      await listGroundMeshRegistrations({
        accessToken: "token",
        paths: ["mesh/a.bin", "mesh/b.bin"],
      }),
    ).toEqual({
      "mesh/a.bin": ["Ground A"],
    });
  });
});
