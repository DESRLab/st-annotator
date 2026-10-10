import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn() }));
vi.mock("sta/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("sta/client")>()),
  listMetadatasSourceDataPcdMetadataGet: api.list,
  bulkCreateMetadatasSourceDataPcdMetadataBulkPost: api.create,
}));

import {
  importPointCloudFiles,
  listPointCloudRegistrations,
} from "../../../../app/source/files/action";

function validForm(paths = ["cloud/a.bin"]) {
  const form = new FormData();
  paths.forEach((path) => form.append("path", path));
  form.set("group_id", "7");
  form.set("auto_bounds", "true");
  form.set("auto_timestamp", "true");
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

function manualBoundsForm(paths = ["cloud/a.bin"]) {
  const form = validForm(paths);
  form.set("auto_bounds", "false");
  for (const name of ["min_x", "min_y", "min_z"]) form.set(name, "-1");
  for (const name of ["max_x", "max_y", "max_z"]) form.set(name, "1");
  return form;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("point-cloud file adapter", () => {
  it("validates selection, group, URI, and vectors before API calls", async () => {
    expect(
      await importPointCloudFiles({
        formData: new FormData(),
        accessToken: "token",
      }),
    ).toEqual({ error: "Select at least one file to register." });
    const noGroup = validForm();
    noGroup.delete("group_id");
    expect(
      (
        await importPointCloudFiles({
          formData: noGroup,
          accessToken: "token",
        })
      ).error,
    ).toContain("Source group");
    const invalidUri = validForm(["../secret"]);
    expect(
      (
        await importPointCloudFiles({
          formData: invalidUri,
          accessToken: "token",
        })
      ).error,
    ).toContain("relative");
    const invalidScale = validForm();
    invalidScale.set("scale_x", "0");
    expect(
      (
        await importPointCloudFiles({
          formData: invalidScale,
          accessToken: "token",
        })
      ).error,
    ).toContain("Scale");
    expect(api.list).not.toHaveBeenCalled();
  });

  it("rejects duplicates and returns normalized upstream creation errors", async () => {
    api.list.mockResolvedValueOnce({ data: [{ uri: "cloud/a.bin" }] });
    expect(
      (
        await importPointCloudFiles({
          formData: validForm(),
          accessToken: "token",
        })
      ).error,
    ).toContain("already assigned");
    expect(api.create).not.toHaveBeenCalled();

    api.list.mockResolvedValueOnce({ data: [] });
    api.create.mockResolvedValueOnce({
      error: { detail: "cannot create" },
    });
    expect(
      (
        await importPointCloudFiles({
          formData: validForm(),
          accessToken: "token",
        })
      ).error,
    ).toContain("cannot create");
  });

  it("submits normalized bulk metadata and lists matching registrations", async () => {
    api.list.mockResolvedValueOnce({ data: [] });
    api.create.mockResolvedValueOnce({ data: [] });
    const result = await importPointCloudFiles({
      formData: validForm([" cloud/a.bin ", "cloud/b.bin"]),
      accessToken: "token",
    });
    expect(result.success).toContain("2 point cloud metadata");
    expect(
      api.create.mock.calls[0][0].body.map((entry: any) => entry.uri),
    ).toEqual(["cloud/a.bin", "cloud/b.bin"]);

    api.list.mockResolvedValueOnce({
      data: [
        { uri: "cloud/a.bin", group: { name: "A" } },
        { uri: "cloud/a.bin", group: { name: "B" } },
        { uri: "other.bin", group: { name: "C" } },
      ],
    });
    expect(
      await listPointCloudRegistrations({
        accessToken: "token",
        paths: ["cloud/a.bin"],
      }),
    ).toEqual({ "cloud/a.bin": ["A", "B"] });
  });

  it("leaves the spatial bounds unset so the backend derives them from the scan", async () => {
    api.list.mockResolvedValueOnce({ data: [] });
    api.create.mockResolvedValueOnce({ data: [] });

    await importPointCloudFiles({
      formData: validForm(),
      accessToken: "token",
    });

    const [entry] = api.create.mock.calls[0][0].body;
    for (const bound of [
      "min_x",
      "min_y",
      "min_z",
      "max_x",
      "max_y",
      "max_z",
    ]) {
      expect(entry).not.toHaveProperty(bound);
    }
    // The mode is stated rather than left to inference; only the spatial box is
    // withheld so the backend derives it from the scan.
    expect(entry).toHaveProperty("auto_bounds", true);
    expect(entry).toHaveProperty("group_id", 7);
  });

  it("derives each file's timestamp range from its own filename", async () => {
    api.list.mockResolvedValueOnce({ data: [] });
    api.create.mockResolvedValueOnce({ data: [] });

    await importPointCloudFiles({
      formData: validForm([
        "scans/2023_02_06=03_25_47_533.bin",
        "scans/1645208349200.bin",
        "scans/plain.pcd",
      ]),
      accessToken: "token",
    });

    const entries = api.create.mock.calls[0][0].body;
    expect(
      entries.map((entry: any) => [entry.min_timestamp, entry.max_timestamp]),
    ).toEqual([
      [
        new Date(2023, 1, 6, 3, 25, 47, 533).toISOString(),
        new Date(2023, 1, 6, 3, 25, 47, 533).toISOString(),
      ],
      ["2022-02-18T18:19:09.200Z", "2022-02-18T18:19:09.200Z"],
      [null, null],
    ]);
    for (const entry of entries) {
      expect(entry.auto_bounds).toBe(true);
      expect(entry).not.toHaveProperty("min_x");
    }
  });

  it("sets unmatched timestamps to null even if manual fields contain dates", async () => {
    api.list.mockResolvedValueOnce({ data: [] });
    api.create.mockResolvedValueOnce({ data: [] });
    const form = validForm([
      "scans/2023_02_30=03_04_05_123.pcd",
      "scans/plain-cloud.pcd",
    ]);
    form.set("min_timestamp", "2024-01-01T00:00:00");
    form.set("max_timestamp", "2024-01-02T00:00:00");

    await importPointCloudFiles({ formData: form, accessToken: "token" });

    const entries = api.create.mock.calls[0][0].body;
    expect(
      entries.map((entry: any) => [entry.min_timestamp, entry.max_timestamp]),
    ).toEqual([
      [null, null],
      [null, null],
    ]);
  });

  it("keeps manual timestamp fields authoritative when filename detection is unticked", async () => {
    api.list.mockResolvedValueOnce({ data: [] });
    api.create.mockResolvedValueOnce({ data: [] });
    const form = manualBoundsForm(["scans/2024-01-03T04:05:06Z.pcd"]);
    form.set("auto_timestamp", "false");
    form.set("min_timestamp", "2024-01-01T00:00:00");
    form.set("max_timestamp", "2024-01-02T00:00:00");

    await importPointCloudFiles({ formData: form, accessToken: "token" });

    const [entry] = api.create.mock.calls[0][0].body;
    expect(entry.min_timestamp).toBe("2024-01-01T00:00:00.000Z");
    expect(entry.max_timestamp).toBe("2024-01-02T00:00:00.000Z");
  });

  it("detects a custom filename timestamp with spatial derivation off", async () => {
    api.list.mockResolvedValueOnce({ data: [] });
    api.create.mockResolvedValueOnce({ data: [] });
    const form = manualBoundsForm(["scans/scan_20240203_040506.pcd"]);
    form.set("timestamp_pattern", "scan_%Y%m%d_%H%M%S");

    await importPointCloudFiles({ formData: form, accessToken: "token" });

    const [entry] = api.create.mock.calls[0][0].body;
    expect(entry.auto_bounds).toBe(false);
    expect(entry.min_x).toBe("-1");
    expect(entry.min_timestamp).toBe(
      new Date(2024, 1, 3, 4, 5, 6).toISOString().replace(".000Z", ".000000Z"),
    );
    expect(entry.max_timestamp).toBe(entry.min_timestamp);
  });

  it("sends hand-set bounds when derivation is unticked", async () => {
    const invalid = manualBoundsForm();
    invalid.set("min_x", "1.2.3");
    expect(
      (
        await importPointCloudFiles({
          formData: invalid,
          accessToken: "token",
        })
      ).error,
    ).toContain("Minimum coordinates");
    expect(api.create).not.toHaveBeenCalled();

    api.list.mockResolvedValueOnce({ data: [] });
    api.create.mockResolvedValueOnce({ data: [] });
    await importPointCloudFiles({
      formData: manualBoundsForm(),
      accessToken: "token",
    });

    const [entry] = api.create.mock.calls[0][0].body;
    expect(entry).toMatchObject({
      auto_bounds: false,
      min_x: "-1",
      min_y: "-1",
      min_z: "-1",
      max_x: "1",
      max_y: "1",
      max_z: "1",
    });
  });

  it("rejects a hand-set box whose minimum exceeds its maximum", async () => {
    const inverted = manualBoundsForm();
    inverted.set("min_x", "5");

    expect(
      (
        await importPointCloudFiles({
          formData: inverted,
          accessToken: "token",
        })
      ).error,
    ).toContain(
      "The minimum X coordinate cannot be greater than the maximum X coordinate.",
    );
    expect(api.create).not.toHaveBeenCalled();
  });

  it("registers every selected file unbounded on an axis left blank", async () => {
    api.list.mockResolvedValueOnce({ data: [] });
    api.create.mockResolvedValueOnce({ data: [] });

    const partial = manualBoundsForm(["cloud/a.bin", "cloud/b.bin"]);
    partial.set("min_z", "");

    await importPointCloudFiles({
      formData: partial,
      accessToken: "token",
    });

    // A blank field stores no bound, which every spatial filter reads as unbounded,
    // so the blank answer is shared by the whole batch like any other field.
    const entries = api.create.mock.calls[0][0].body as Record<
      string,
      unknown
    >[];
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(entry.min_z).toBeUndefined();
      expect(entry).toMatchObject({ auto_bounds: false, max_z: "1" });
    }
  });
});
