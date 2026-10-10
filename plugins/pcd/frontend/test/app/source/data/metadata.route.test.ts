import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  groups: vi.fn(),
  specs: vi.fn(),
  metadata: vi.fn(),
  metadataIds: vi.fn(),
  read: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  bulkUpdate: vi.fn(),
}));
vi.mock("sta/app/loaders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("sta/app/loaders")>()),
  getCurrentSession: async () => ({
    get: (key: string) =>
      key === "token" ? { access_token: "access" } : undefined,
  }),
  getUser: () => ({ id: 1, roles: ["data-manager"] }),
  loadAccessTokenSession: async () => ({
    session: {},
    token: { access_token: "access" },
  }),
  loadAuthenticatedSession: async () => ({
    session: {},
    token: { access_token: "access" },
    user: { id: 1, roles: ["data-manager"] },
  }),
}));
vi.mock("sta/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("sta/client")>()),
  listGroupsSourceGroupsGet: api.groups,
  listMetadataIdsSourceDataPcdMetadataIdsGet: api.metadataIds,
  listSpecsSourceSpecPcdSpecsGet: api.specs,
  listMetadatasSourceDataPcdMetadataGet: api.metadata,
  readMetadataSourceDataPcdMetadataIdGet: api.read,
  createMetadataSourceDataPcdMetadataPost: api.create,
  updateMetadataSourceDataPcdMetadataIdPatch: api.update,
  bulkUpdateMetadatasSourceDataPcdMetadataBulkPatch: api.bulkUpdate,
}));

import type { PointCloudMetadataPublic as PointCloudMetadata } from "sta/client";

import {
  action,
  loader,
  pointCloudMetadataToFormState,
} from "../../../../app/source/data/metadata";

const BOUND_FIELDS = [
  "min_x",
  "min_y",
  "min_z",
  "max_x",
  "max_y",
  "max_z",
] as const;

afterEach(() => {
  vi.clearAllMocks();
});

/**
 * A Data Storage form submission. The spatial bounds inputs are rendered but disabled while
 * the "Derive spatial bounds" box is ticked, so an automatic submission carries none of them.
 */
function metadataForm(
  actionType: "create" | "update",
  options: {
    autoBounds?: string;
    blankBound?: string;
  } = {},
) {
  const form = new FormData();
  form.set("_action", actionType);
  form.set("group_id", "7");
  form.set("uri", "point-clouds/scan.pcd");
  form.set("auto_bounds", options.autoBounds ?? "true");
  for (const name of [
    "translate_x",
    "translate_y",
    "translate_z",
    "rotate_x",
    "rotate_y",
    "rotate_z",
  ]) {
    form.set(name, "0");
  }
  for (const name of ["scale_x", "scale_y", "scale_z"]) {
    form.set(name, "1");
  }
  if (options.autoBounds === "false") {
    for (const name of ["min_x", "min_y", "min_z"]) {
      form.set(name, "-1");
    }
    for (const name of ["max_x", "max_y", "max_z"]) {
      form.set(name, "1");
    }
  }
  if (options.blankBound) {
    form.set(options.blankBound, "");
  }
  if (actionType === "update") {
    form.set("id", "3");
    form.set("issued_at", "2026-01-01T00:00:00+00:00");
  }
  return form;
}

async function submit(form: FormData) {
  return (await action({
    request: new Request("http://localhost/source/data/pcd", {
      method: "POST",
      body: form,
    }),
  } as any)) as { error?: string; success?: string };
}

function storedRecord(
  overrides: Record<string, unknown> = {},
): PointCloudMetadata {
  return {
    id: 3,
    group_id: 7,
    uri: "point-clouds/scan.pcd",
    weather: null,
    auto_bounds: true,
    min_x: "-1.5",
    min_y: "-2.5",
    min_z: "-3.5",
    max_x: "1.5",
    max_y: "2.5",
    max_z: "3.5",
    ...overrides,
  } as unknown as PointCloudMetadata;
}

describe("PCD metadata route adapter", () => {
  it.each([
    [403, "Forbidden"],
    [404, "Not Found"],
  ])(
    "preserves a %i create refusal without reporting success",
    async (status, detail) => {
      api.create.mockResolvedValue({
        error: { detail },
        response: new Response(null, { status }),
      });

      const result = await submit(metadataForm("create"));

      expect(api.create).toHaveBeenCalledOnce();
      expect(result).toEqual({ error: detail });
      expect(result).not.toHaveProperty("success");
      expect(api.update).not.toHaveBeenCalled();
      expect(api.bulkUpdate).not.toHaveBeenCalled();
    },
  );

  it("canonicalizes invalid groups and avoids an unnecessary data request", async () => {
    api.groups.mockResolvedValue({ data: [{ id: 7, name: "A" }] });
    api.specs.mockResolvedValue({ data: [] });
    const response = (await loader({
      request: new Request(
        "http://localhost/source/data/pcd?group_id=99&page=4",
      ),
    } as any)) as Response;
    expect(response.headers.get("Location")).toBe("/source/data/pcd?");
    expect(api.metadata).not.toHaveBeenCalled();
    expect(api.metadataIds).not.toHaveBeenCalled();
  });

  it("preserves pagination, computes eligible groups, and surfaces metadata errors", async () => {
    api.groups.mockResolvedValue({ data: [{ id: 7, name: "A" }] });
    api.specs.mockResolvedValue({
      data: [{ groups: [{ id: 7 }, { id: 8 }] }, { groups: [{ id: 7 }] }],
    });
    api.metadata.mockResolvedValue({
      data: [],
      error: { detail: "metadata unavailable" },
    });
    api.metadataIds.mockResolvedValue({ data: [20, 21, 22] });
    const result = (await loader({
      request: new Request(
        "http://localhost/source/data/pcd?group_id=7&page=2&pageSize=25",
      ),
    } as any)) as any;
    expect(result.eligibleSourceGroupIds).toEqual([7, 8]);
    expect(result.loaderError).toContain("metadata unavailable");
    expect(api.metadata).toHaveBeenCalledWith({
      auth: "access",
      query: { group_id: 7, offset: 25, limit: 25 },
    });
    expect(api.metadata).toHaveBeenCalledOnce();
    expect(api.metadataIds).toHaveBeenCalledWith({
      auth: "access",
      query: { group_id: 7 },
    });
    expect(result.allSelectableIds).toEqual([20, 21, 22]);
  });

  it("rejects unknown mutations", async () => {
    const request = new Request("http://localhost/source/data/pcd", {
      method: "POST",
      body: new URLSearchParams({ _action: "unknown" }),
    });
    expect(await action({ request } as any)).toEqual({
      error: "Unknown action.",
    });
  });
});

describe("PCD metadata spatial bounds mode", () => {
  it("creates derived metadata without validating or sending the six bounds", async () => {
    api.create.mockResolvedValue({ data: { id: 3 } });

    expect(await submit(metadataForm("create"))).toEqual({
      success: "Point cloud created successfully.",
    });

    const { body } = api.create.mock.calls[0][0];
    expect(body).toMatchObject({ auto_bounds: true, group_id: 7 });
    for (const bound of BOUND_FIELDS) {
      expect(body).not.toHaveProperty(bound);
    }
    // Only the derived box is withheld; the caller-owned transform stays put.
    expect(body).toMatchObject({ translate_x: "0", scale_x: "1" });
  });

  it("creates an explicit override with all six bounds", async () => {
    api.create.mockResolvedValue({ data: { id: 3 } });

    await submit(metadataForm("create", { autoBounds: "false" }));

    const { body } = api.create.mock.calls[0][0];
    expect(body).toMatchObject({
      auto_bounds: false,
      min_x: "-1",
      min_y: "-1",
      min_z: "-1",
      max_x: "1",
      max_y: "1",
      max_z: "1",
    });
  });

  it("creates an override that leaves one axis unbounded", async () => {
    api.create.mockResolvedValue({ data: { id: 3 } });

    expect(
      await submit(
        metadataForm("create", { autoBounds: "false", blankBound: "min_z" }),
      ),
    ).toEqual({ success: "Point cloud created successfully." });

    // A blank field is an answer, not a gap: the request carries no bound for that
    // component, so the row stores NULL and spatial filters pass that axis.
    const { body } = api.create.mock.calls[0][0];
    expect(body.min_z).toBeUndefined();
    expect(body).toMatchObject({ auto_bounds: false, min_x: "-1", max_z: "1" });
  });

  it("clears a stored bound whose override field is left blank", async () => {
    api.update.mockResolvedValue({ data: { id: 3 } });

    await submit(
      metadataForm("update", { autoBounds: "false", blankBound: "max_x" }),
    );

    // An edit has to state the absence, otherwise the stored bound survives.
    const { body } = api.update.mock.calls[0][0];
    expect(body).toMatchObject({
      auto_bounds: false,
      max_x: null,
      min_x: "-1",
    });
  });

  it("still rejects a malformed component of a hand-set box", async () => {
    const form = metadataForm("create", { autoBounds: "false" });
    form.set("min_x", "1.2.3");

    expect((await submit(form)).error).toContain("Minimum coordinates");
    expect(api.create).not.toHaveBeenCalled();
  });

  it("rejects a hand-set box whose minimum exceeds its maximum", async () => {
    const inverted = metadataForm("create", { autoBounds: "false" });
    inverted.set("min_y", "5");
    inverted.set("max_y", "-5");

    expect((await submit(inverted)).error).toContain(
      "The minimum Y coordinate cannot be greater than the maximum Y coordinate.",
    );
    expect(api.create).not.toHaveBeenCalled();
  });

  it("does not compare an axis the override leaves open", async () => {
    api.create.mockResolvedValue({ data: { id: 3 } });
    // min_x=5 with no max_x is unbounded above, not inverted.
    const halfOpen = metadataForm("create", {
      autoBounds: "false",
      blankBound: "max_x",
    });
    halfOpen.set("min_x", "50");

    expect((await submit(halfOpen)).error).toBeUndefined();
    expect(api.create).toHaveBeenCalledOnce();
  });

  it("updates a derived record without resending its stored box", async () => {
    api.update.mockResolvedValue({ data: { id: 3 } });

    expect(await submit(metadataForm("update"))).toEqual({
      success: "Point cloud updated successfully.",
    });

    const { body } = api.update.mock.calls[0][0];
    expect(body).toMatchObject({ auto_bounds: true });
    // Sending the prefilled box back would pin the record to stale coordinates.
    for (const bound of BOUND_FIELDS) {
      expect(body).not.toHaveProperty(bound);
    }
  });

  it("detects a timestamp from the filename only when requested", async () => {
    api.create.mockResolvedValue({ data: { id: 3 } });
    const form = metadataForm("create");
    form.set("uri", "point-clouds/scan_20240203_040506.pcd");
    form.set("auto_timestamp", "true");
    form.set("timestamp_pattern", "scan_%Y%m%d_%H%M%S");

    await submit(form);

    const timestamp = new Date(2024, 1, 3, 4, 5, 6)
      .toISOString()
      .replace(".000Z", ".000000Z");
    expect(api.create.mock.calls[0][0].body).toMatchObject({
      min_timestamp: timestamp,
      max_timestamp: timestamp,
    });
  });

  it("updates an override and states the mode so it can be switched back", async () => {
    api.update.mockResolvedValue({ data: { id: 3 } });

    await submit(metadataForm("update", { autoBounds: "false" }));

    const { body } = api.update.mock.calls[0][0];
    expect(body).toMatchObject({
      auto_bounds: false,
      min_x: "-1",
      max_z: "1",
    });
  });

  it("drops the bounds from an automatic write even when the form still carries them", async () => {
    api.update.mockResolvedValue({ data: { id: 3 } });
    // Re-ticking the box is what switches derivation back on, so values left over in the
    // inputs must not be read as an override.
    const form = metadataForm("update", { autoBounds: "false" });
    form.set("auto_bounds", "true");

    await submit(form);

    const { body } = api.update.mock.calls[0][0];
    expect(body).toMatchObject({ auto_bounds: true });
    for (const bound of BOUND_FIELDS) {
      expect(body).not.toHaveProperty(bound);
    }
  });

  it("reopens the edit form in the mode the record was saved in", () => {
    expect(pointCloudMetadataToFormState(storedRecord()).auto_bounds).toBe(
      "true",
    );
    expect(
      pointCloudMetadataToFormState(storedRecord({ auto_bounds: false })),
    ).toMatchObject({
      auto_bounds: "false",
      min_x: "-1.500000",
      max_z: "3.500000",
    });
    // A record predating the flag was always derived, so it stays derived.
    const legacy = storedRecord();
    delete (legacy as Record<string, unknown>).auto_bounds;
    expect(pointCloudMetadataToFormState(legacy).auto_bounds).toBe("true");
  });
});

type BatchToggle =
  | "update_group"
  | "update_weather"
  | "update_auto_bounds"
  | "update_min_bounds"
  | "update_max_bounds"
  | "update_timestamps"
  | "update_translate"
  | "update_rotate"
  | "update_scale";

const BATCH_TOGGLES: BatchToggle[] = [
  "update_group",
  "update_weather",
  "update_auto_bounds",
  "update_min_bounds",
  "update_max_bounds",
  "update_timestamps",
  "update_translate",
  "update_rotate",
  "update_scale",
];

/** Which inputs a "Update ..." section contributes while it is ticked. */
const BATCH_SECTION_FIELDS: Record<BatchToggle, string[]> = {
  update_group: ["group_id"],
  update_weather: ["weather"],
  update_auto_bounds: ["auto_bounds"],
  update_min_bounds: ["min_x", "min_y", "min_z"],
  update_max_bounds: ["max_x", "max_y", "max_z"],
  update_timestamps: ["min_timestamp", "max_timestamp"],
  update_translate: ["translate_x", "translate_y", "translate_z"],
  update_rotate: ["rotate_x", "rotate_y", "rotate_z"],
  update_scale: ["scale_x", "scale_y", "scale_z"],
};

/**
 * The shape the batch modal posts. Every `update_*` flag is an unconditionally rendered
 * hidden input, so it always travels as `"true"` or `"false"`, and `BatchSection` renders
 * a group's inputs only while its checkbox is ticked, an unticked attribute is therefore
 * absent from the form entirely, exactly as it must be from the payload.
 */
function batchForm(
  ticked: BatchToggle[],
  options: { ids?: string; values?: Record<string, string> } = {},
): FormData {
  const form = new FormData();
  form.set("_action", "batch_update");
  form.set("selectedIds", options.ids ?? "[3,4]");
  for (const toggle of BATCH_TOGGLES) {
    form.set(toggle, ticked.includes(toggle) ? "true" : "false");
  }
  for (const toggle of ticked) {
    for (const field of BATCH_SECTION_FIELDS[toggle]) {
      form.set(field, options.values?.[field] ?? "");
    }
  }
  return form;
}

describe("PCD metadata batch edit", () => {
  it("switches selected records back to derived bounds", async () => {
    api.bulkUpdate.mockResolvedValue({ data: [] });
    await submit(
      batchForm(["update_auto_bounds"], {
        values: { auto_bounds: "true" },
      }),
    );
    expect(api.bulkUpdate.mock.calls[0][0].body.data).toEqual({
      auto_bounds: true,
    });
  });

  it("derives each selected filename's timestamp separately", async () => {
    api.read
      .mockResolvedValueOnce({ data: { uri: "scans/1704164645123.pcd" } })
      .mockResolvedValueOnce({ data: { uri: "scans/plain.pcd" } });
    api.bulkUpdate.mockResolvedValue({ data: [] });
    const form = batchForm(["update_timestamps"]);
    form.set("auto_timestamp", "true");

    await submit(form);

    expect(api.read).toHaveBeenCalledTimes(2);
    expect(api.bulkUpdate).toHaveBeenCalledTimes(2);
    expect(api.bulkUpdate.mock.calls[0][0].body).toEqual({
      ids: [3],
      data: {
        min_timestamp: new Date(1704164645123).toISOString(),
        max_timestamp: new Date(1704164645123).toISOString(),
      },
    });
    expect(api.bulkUpdate.mock.calls[1][0].body).toEqual({
      ids: [4],
      data: { min_timestamp: null, max_timestamp: null },
    });
  });
  it("refuses a batch that ticks no attribute", async () => {
    expect(await submit(batchForm([]))).toEqual({
      error: "Select at least one field group to update.",
    });
    expect(api.bulkUpdate).not.toHaveBeenCalled();
  });

  it("sends only the ticked attributes", async () => {
    api.bulkUpdate.mockResolvedValue({ data: [] });

    expect(
      await submit(
        batchForm(["update_group", "update_weather"], {
          values: { group_id: "7", weather: "overcast" },
        }),
      ),
    ).toEqual({ success: "2 point clouds updated successfully." });

    const { body } = api.bulkUpdate.mock.calls[0][0];
    expect(body.data).toEqual({ group_id: 7, weather: "overcast" });
    // Absence is what preserves a stored value: an attribute nobody ticked must not be
    // cleared on their behalf, `auto_bounds` included, a batch never restates the mode.
    for (const key of [
      "uri",
      "min_x",
      "max_x",
      "min_timestamp",
      "translate_x",
      "rotate_x",
      "scale_x",
      "auto_bounds",
    ]) {
      expect(body.data).not.toHaveProperty(key);
    }
  });

  it("clears a ticked text attribute left blank", async () => {
    api.bulkUpdate.mockResolvedValue({ data: [] });

    await submit(batchForm(["update_weather"]));

    // A ticked section renders an empty input, and blank reads as "clear this on every
    // selected row", not as "say nothing".
    expect(api.bulkUpdate.mock.calls[0][0].body.data).toEqual({
      weather: null,
    });
  });

  it("refuses a ticked group section left on the placeholder", async () => {
    api.bulkUpdate.mockResolvedValue({ data: [] });

    // `group_id` is NOT NULL, so the placeholder is not a clear the server would accept --
    // it would come back as a 422. The dialog declines to build that request at all, and
    // says so, rather than sending a batch that cannot land.
    const result = await submit(batchForm(["update_group"]));

    expect(result.error).toContain("A source group is required");
    expect(api.bulkUpdate).not.toHaveBeenCalled();

    await submit(batchForm(["update_group"], { values: { group_id: "7" } }));
    expect(api.bulkUpdate.mock.calls[0][0].body.data).toEqual({ group_id: 7 });
  });

  it("refuses a transform section with any axis left blank", async () => {
    api.bulkUpdate.mockResolvedValue({ data: [] });

    // Every transform component backs a NOT NULL column, so a blank axis is not a clear.
    const result = await submit(
      batchForm(["update_translate"], { values: { translate_x: "1.5" } }),
    );

    expect(result.error).toBe(
      "Translation needs a value for Y and Z; every component is required, so leave the box unticked to keep each point cloud's current translation.",
    );
    expect(api.bulkUpdate).not.toHaveBeenCalled();
  });

  it("sends a complete transform vector and clears an omitted timestamp", async () => {
    api.bulkUpdate.mockResolvedValue({ data: [] });

    await submit(
      batchForm(["update_timestamps", "update_translate", "update_scale"], {
        values: {
          min_timestamp: "2026-01-01T00:00:00+00:00",
          translate_x: "1.5",
          translate_y: "0",
          translate_z: "-3",
          scale_x: "1",
          scale_y: "2",
          scale_z: "1",
        },
      }),
    );

    // Timestamps are nullable, so a blank one is a genuine clear; transforms must be whole.
    expect(api.bulkUpdate.mock.calls[0][0].body.data).toEqual({
      min_timestamp: "2026-01-01T00:00:00.000Z",
      max_timestamp: null,
      translate_x: "1.5",
      translate_y: "0",
      translate_z: "-3",
      scale_x: "1",
      scale_y: "2",
      scale_z: "1",
    });
  });

  it("ignores a posted update_uri so a batch never rewrites the URI", async () => {
    api.bulkUpdate.mockResolvedValue({ data: [] });

    // The dialog no longer offers a URI section, but a crafted submission must still be
    // inert: `uri` is unique per source group, so one path cannot name several rows.
    const form = batchForm(["update_weather"], {
      values: { weather: "sunny" },
    });
    form.set("update_uri", "true");
    form.set("uri", "point-clouds/other.pcd");

    expect(await submit(form)).toEqual({
      success: "2 point clouds updated successfully.",
    });
    const { data } = api.bulkUpdate.mock.calls[0][0].body;
    expect(data).toEqual({ weather: "sunny" });
    expect(data).not.toHaveProperty("uri");
  });

  it("parses the selectedIds hidden input into body.ids", async () => {
    api.bulkUpdate.mockResolvedValue({ data: [] });

    expect(
      await submit(batchForm(["update_weather"], { ids: "[11,12,13]" })),
    ).toEqual({ success: "3 point clouds updated successfully." });
    expect(api.bulkUpdate.mock.calls[0][0].body.ids).toEqual([11, 12, 13]);

    expect(
      await submit(batchForm(["update_weather"], { ids: "[12]" })),
    ).toEqual({ success: "Point cloud updated successfully." });
  });

  it("refuses an empty or unparseable selection before building a payload", async () => {
    expect(await submit(batchForm(["update_weather"], { ids: "[]" }))).toEqual({
      error: "Select at least one point cloud to update.",
    });
    expect(
      await submit(batchForm(["update_weather"], { ids: "not-json" })),
    ).toEqual({ error: "Select at least one point cloud to update." });
    expect(api.bulkUpdate).not.toHaveBeenCalled();
  });

  it("aborts the batch when a ticked bound component is malformed", async () => {
    const result = await submit(
      batchForm(["update_weather", "update_min_bounds"], {
        values: { weather: "fog", min_x: "1.2.3" },
      }),
    );

    expect(result.error).toContain("Minimum coordinates: X:");
    expect(api.bulkUpdate).not.toHaveBeenCalled();
  });

  it("accepts a ticked bounds group whose axes stay open", async () => {
    api.bulkUpdate.mockResolvedValue({ data: [] });

    await submit(batchForm(["update_min_bounds"], { values: { min_z: "-3" } }));

    // Unlike the edit form, a batch group validates with allowEmpty, and the min/max
    // cross-check never runs because the two halves are ticked independently.
    expect(api.bulkUpdate.mock.calls[0][0].body.data).toEqual({
      min_x: null,
      min_y: null,
      min_z: "-3",
    });
  });

  it("validates a ticked scale as a size, not a coordinate", async () => {
    const result = await submit(
      batchForm(["update_scale"], { values: { scale_x: "-1" } }),
    );

    expect(result.error).toContain("Scale: X:");
    expect(api.bulkUpdate).not.toHaveBeenCalled();
  });
});
