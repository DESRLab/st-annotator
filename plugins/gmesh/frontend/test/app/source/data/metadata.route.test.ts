import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  groups: vi.fn(),
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
  bulkUpdateMetadatasSourceDataGmeshMetadataBulkPatch: api.bulkUpdate,
  createMetadataSourceDataGmeshMetadataPost: api.create,
  listGroupsSourceGroupsGet: api.groups,
  listMetadataIdsSourceDataGmeshMetadataIdsGet: api.metadataIds,
  listMetadatasSourceDataGmeshMetadataGet: api.metadata,
  readMetadataSourceDataGmeshMetadataIdGet: api.read,
  updateMetadataSourceDataGmeshMetadataIdPatch: api.update,
}));

import { action, loader } from "../../../../app/source/data/metadata";

const SPATIAL_BOUNDS = ["min_x", "min_y", "min_z", "max_x", "max_y", "max_z"];

/**
 * The shape the create/edit modal posts: the transform inputs are always rendered,
 * `auto_bounds` rides along as an unconditionally rendered hidden input, and the six
 * bound inputs are rendered but disabled unless the box is hand-set, which keeps them
 * out of the submission entirely.
 */
function metadataForm(
  actionName: string,
  overrides: Record<string, string> = {},
): FormData {
  const form = new FormData();
  const values: Record<string, string> = {
    _action: actionName,
    group_id: "7",
    uri: "meshes/terrain.obj",
    auto_bounds: "true",
    translate_x: "0",
    translate_y: "0",
    translate_z: "0",
    rotate_x: "0",
    rotate_y: "0",
    rotate_z: "0",
    scale_x: "1",
    scale_y: "1",
    scale_z: "1",
    ...overrides,
  };
  for (const [name, value] of Object.entries(values)) {
    form.set(name, value);
  }
  return form;
}

function manualBoundsForm(
  actionName: string,
  overrides: Record<string, string> = {},
): FormData {
  const form = metadataForm(actionName, {
    auto_bounds: "false",
    ...overrides,
  });
  for (const name of ["min_x", "min_y", "min_z"]) form.set(name, "-1");
  for (const name of ["max_x", "max_y", "max_z"]) form.set(name, "1");
  return form;
}

async function post(form: FormData): Promise<Record<string, unknown>> {
  return (await action({
    request: new Request("http://localhost/source/data/gmesh", {
      method: "POST",
      body: form,
    }),
  } as any)) as unknown as Record<string, unknown>;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("ground-mesh metadata route adapter", () => {
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

      const result = await post(metadataForm("create"));

      expect(api.create).toHaveBeenCalledOnce();
      expect(result).toEqual({ error: detail });
      expect(result).not.toHaveProperty("success");
      expect(api.update).not.toHaveBeenCalled();
      expect(api.bulkUpdate).not.toHaveBeenCalled();
    },
  );

  it("returns an empty state for no selection and canonicalizes invalid groups", async () => {
    api.groups.mockResolvedValue({ data: [{ id: 7, name: "A" }] });
    const empty = (await loader({
      request: new Request("http://localhost/source/data/gmesh"),
    } as any)) as any;
    expect(empty.dataset).toEqual([]);
    expect(empty.pagination.totalItems).toBe(0);
    expect(api.metadata).not.toHaveBeenCalled();
    expect(api.metadataIds).not.toHaveBeenCalled();

    const response = (await loader({
      request: new Request(
        "http://localhost/source/data/gmesh?group_id=99&page=4",
      ),
    } as any)) as Response;
    expect(response.headers.get("Location")).toBe("/source/data/gmesh?");
    expect(api.metadata).not.toHaveBeenCalled();
    expect(api.metadataIds).not.toHaveBeenCalled();
  });

  it("loads a selected page and normalizes upstream errors", async () => {
    api.groups.mockResolvedValue({ data: [{ id: 7, name: "A" }] });
    api.metadata.mockResolvedValue({
      data: [],
      error: { detail: "mesh unavailable" },
    });
    api.metadataIds.mockResolvedValue({ data: [10, 11, 12] });
    const result = (await loader({
      request: new Request(
        "http://localhost/source/data/gmesh?group_id=7&page=3&pageSize=25",
      ),
    } as any)) as any;
    expect(result.loaderError).toContain("mesh unavailable");
    expect(api.metadata).toHaveBeenCalledWith({
      auth: "access",
      query: { group_id: 7, offset: 50, limit: 25 },
    });
    expect(api.metadata).toHaveBeenCalledOnce();
    expect(api.metadataIds).toHaveBeenCalledWith({
      auth: "access",
      query: { group_id: 7 },
    });
    expect(result.allSelectableIds).toEqual([10, 11, 12]);
  });

  it("validates mutation identity and unknown actions", async () => {
    const invalidUpdate = new Request("http://localhost/source/data/gmesh", {
      method: "POST",
      body: new URLSearchParams({ _action: "update", id: "bad" }),
    });
    expect(await action({ request: invalidUpdate } as any)).toEqual({
      error: "A valid ground mesh ID is required.",
    });
    const unknown = new Request("http://localhost/source/data/gmesh", {
      method: "POST",
      body: new URLSearchParams({ _action: "unknown" }),
    });
    expect(await action({ request: unknown } as any)).toEqual({
      error: "Unknown action.",
    });
  });
});

describe("ground-mesh metadata spatial bounds payload", () => {
  it("states auto_bounds and withholds the six coordinates when creating derived bounds", async () => {
    api.create.mockResolvedValueOnce({ data: { id: 1 } });

    expect(await post(metadataForm("create"))).toEqual({
      success: "Ground mesh metadata created successfully.",
    });

    const body = api.create.mock.calls[0][0].body;
    expect(body.auto_bounds).toBe(true);
    for (const bound of SPATIAL_BOUNDS) {
      expect(body).not.toHaveProperty(bound);
    }
    // Only the spatial box is withheld; the caller-owned fields stay put.
    expect(body).toMatchObject({ group_id: 7, uri: "meshes/terrain.obj" });
  });

  it("detects a timestamp from the filename only when requested", async () => {
    api.create.mockResolvedValue({ data: { id: 3 } });
    const form = metadataForm("create", {
      uri: "meshes/scan_20240203_040506.obj",
      auto_timestamp: "true",
      timestamp_pattern: "scan_%Y%m%d_%H%M%S",
    });

    await post(form);

    const timestamp = new Date(2024, 1, 3, 4, 5, 6)
      .toISOString()
      .replace(".000Z", ".000000Z");
    expect(api.create.mock.calls[0][0].body).toMatchObject({
      min_timestamp: timestamp,
      max_timestamp: timestamp,
    });
  });

  it("still derives when the six bound inputs are present but blank", async () => {
    api.create.mockResolvedValueOnce({ data: { id: 1 } });

    const blank = metadataForm("create");
    for (const bound of SPATIAL_BOUNDS) blank.set(bound, "");

    expect(await post(blank)).toEqual({
      success: "Ground mesh metadata created successfully.",
    });
    const body = api.create.mock.calls[0][0].body;
    expect(body.auto_bounds).toBe(true);
    for (const bound of SPATIAL_BOUNDS) {
      expect(body).not.toHaveProperty(bound);
    }
  });

  it("sends the six coordinates together with auto_bounds false when hand-set", async () => {
    api.create.mockResolvedValueOnce({ data: { id: 1 } });

    await post(manualBoundsForm("create"));

    const body = api.create.mock.calls[0][0].body;
    expect(body.auto_bounds).toBe(false);
    expect(body).toMatchObject({
      min_x: "-1",
      min_y: "-1",
      min_z: "-1",
      max_x: "1",
      max_y: "1",
      max_z: "1",
    });
  });

  it("stores an override that leaves one axis unbounded", async () => {
    api.create.mockResolvedValueOnce({ data: { id: 1 } });

    const partial = manualBoundsForm("create");
    partial.set("min_z", "");

    expect(await post(partial)).toEqual({
      success: "Ground mesh metadata created successfully.",
    });

    // A blank field is an answer, not a gap: the request carries no bound for that
    // component, so the row stores NULL and spatial filters pass that axis.
    const body = api.create.mock.calls[0][0].body;
    expect(body.min_z).toBeUndefined();
    expect(body).toMatchObject({ auto_bounds: false, min_x: "-1", max_z: "1" });
  });

  it("clears a stored bound whose override field is left blank", async () => {
    api.update.mockResolvedValueOnce({ data: { id: 3 } });

    const cleared = manualBoundsForm("update", {
      id: "3",
      issued_at: "2026-01-01",
    });
    cleared.set("max_x", "");

    await post(cleared);

    // An edit has to state the absence, otherwise the stored bound survives.
    const body = api.update.mock.calls[0][0].body;
    expect(body).toMatchObject({
      auto_bounds: false,
      max_x: null,
      min_x: "-1",
    });
  });

  it("still rejects a malformed component of a hand-set box", async () => {
    const invalid = manualBoundsForm("create");
    invalid.set("min_x", "1.2.3");

    expect((await post(invalid)).error).toContain("Minimum coordinates");
    expect(api.create).not.toHaveBeenCalled();
  });

  it("rejects a hand-set box whose minimum exceeds its maximum", async () => {
    const inverted = manualBoundsForm("create");
    inverted.set("min_z", "5");

    expect((await post(inverted)).error).toContain(
      "The minimum Z coordinate cannot be greater than the maximum Z coordinate.",
    );
    expect(api.create).not.toHaveBeenCalled();
  });

  it("keeps an edit derived by stating the flag without the prefilled box", async () => {
    api.update.mockResolvedValueOnce({ data: { id: 3 } });

    await post(metadataForm("update", { id: "3", issued_at: "2026-01-01" }));

    const { body, path } = api.update.mock.calls[0][0];
    expect(path).toEqual({ id: 3 });
    expect(body.auto_bounds).toBe(true);
    for (const bound of SPATIAL_BOUNDS) {
      expect(body).not.toHaveProperty(bound);
    }
  });

  it("persists an override on edit, which is how it survives later writes", async () => {
    api.update.mockResolvedValueOnce({ data: { id: 3 } });

    await post(
      manualBoundsForm("update", { id: "3", issued_at: "2026-01-01" }),
    );

    const body = api.update.mock.calls[0][0].body;
    expect(body.auto_bounds).toBe(false);
    for (const bound of SPATIAL_BOUNDS) {
      expect(body).toHaveProperty(bound);
    }
  });

  it("lets a batch bounds toggle install an override without stating the flag", async () => {
    api.bulkUpdate.mockResolvedValueOnce({ data: [] });

    const form = metadataForm("batch_update", {
      auto_bounds: "false",
      selectedIds: "[3]",
      update_group: "false",
      update_min_bounds: "true",
      update_max_bounds: "true",
      update_timestamps: "false",
      update_translate: "false",
      update_rotate: "false",
      update_scale: "false",
      min_x: "-1",
      min_y: "-1",
      min_z: "-1",
      max_x: "1",
      max_y: "1",
      max_z: "1",
    });

    await post(form);

    const body = api.bulkUpdate.mock.calls[0][0].body.data;
    for (const bound of SPATIAL_BOUNDS) {
      expect(body).toHaveProperty(bound);
    }
  });
});

type BatchToggle =
  | "update_group"
  | "update_auto_bounds"
  | "update_min_bounds"
  | "update_max_bounds"
  | "update_timestamps"
  | "update_translate"
  | "update_rotate"
  | "update_scale";

const BATCH_TOGGLES: BatchToggle[] = [
  "update_group",
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

describe("ground-mesh metadata batch edit", () => {
  it("switches selected records back to derived bounds", async () => {
    api.bulkUpdate.mockResolvedValue({ data: { job_ids: [] } });
    await post(
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
      .mockResolvedValueOnce({ data: { uri: "meshes/1704164645123.obj" } })
      .mockResolvedValueOnce({ data: { uri: "meshes/plain.obj" } });
    api.bulkUpdate.mockResolvedValue({ data: { job_ids: [] } });
    const form = batchForm(["update_timestamps"]);
    form.set("auto_timestamp", "true");

    await post(form);

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
    expect(await post(batchForm([]))).toEqual({
      error: "Select at least one field group to update.",
    });
    expect(api.bulkUpdate).not.toHaveBeenCalled();
  });

  it("sends only the ticked attributes", async () => {
    // The save reports the sweep it started, which is what lets the page offer to show it.
    api.bulkUpdate.mockResolvedValue({ data: { job_ids: [88] } });

    expect(
      await post(
        batchForm(["update_group", "update_min_bounds"], {
          values: { group_id: "7", min_x: "-1", min_y: "-1", min_z: "-1" },
        }),
      ),
    ).toEqual({
      success: "2 ground mesh metadata entries updated successfully.",
      queuedJobIds: [88],
    });

    const { body } = api.bulkUpdate.mock.calls[0][0];
    expect(body.data).toEqual({
      group_id: 7,
      min_x: "-1",
      min_y: "-1",
      min_z: "-1",
    });
    // Absence is what preserves a stored value: an attribute nobody ticked must not be
    // cleared on their behalf, `auto_bounds` included, a batch never restates the mode.
    for (const key of [
      "uri",
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

  it("clears ticked timestamps left blank", async () => {
    api.bulkUpdate.mockResolvedValue({ data: [] });

    await post(batchForm(["update_timestamps"]));

    // A ticked section renders an empty input, and blank reads as "clear this on every
    // selected row", not as "say nothing".
    expect(api.bulkUpdate.mock.calls[0][0].body.data).toEqual({
      min_timestamp: null,
      max_timestamp: null,
    });
  });

  it("ignores a posted update_uri so a batch never rewrites the URI", async () => {
    api.bulkUpdate.mockResolvedValue({ data: [] });

    // The dialog no longer offers a URI section, but a crafted submission must still be
    // inert: `uri` is unique per source group, so one path cannot name several rows.
    const form = batchForm(["update_group"], { values: { group_id: "7" } });
    form.set("update_uri", "true");
    form.set("uri", "meshes/other.obj");

    expect(await post(form)).toEqual({
      success: "2 ground mesh metadata entries updated successfully.",
      queuedJobIds: [],
    });
    const { data } = api.bulkUpdate.mock.calls[0][0].body;
    expect(data).toEqual({ group_id: 7 });
    expect(data).not.toHaveProperty("uri");
  });

  it("refuses a ticked group section left on the placeholder", async () => {
    api.bulkUpdate.mockResolvedValue({ data: [] });

    // `group_id` is NOT NULL, so the placeholder is not a clear the server would accept --
    // it would come back as a 422. The dialog declines to build that request at all.
    const result = await post(batchForm(["update_group"]));

    expect(result.error).toContain("A source group is required");
    expect(api.bulkUpdate).not.toHaveBeenCalled();

    await post(batchForm(["update_group"], { values: { group_id: "7" } }));
    expect(api.bulkUpdate.mock.calls[0][0].body.data).toEqual({ group_id: 7 });
  });

  it("parses the selectedIds hidden input into body.ids", async () => {
    api.bulkUpdate.mockResolvedValue({ data: [] });

    expect(
      await post(batchForm(["update_timestamps"], { ids: "[11,12,13]" })),
    ).toEqual({
      success: "3 ground mesh metadata entries updated successfully.",
      queuedJobIds: [],
    });
    expect(api.bulkUpdate.mock.calls[0][0].body.ids).toEqual([11, 12, 13]);

    expect(
      await post(batchForm(["update_timestamps"], { ids: "[12]" })),
    ).toEqual({
      success: "Ground mesh metadata updated successfully.",
      queuedJobIds: [],
    });
  });

  it("refuses an empty or unparseable selection before building a payload", async () => {
    expect(await post(batchForm(["update_timestamps"], { ids: "[]" }))).toEqual(
      {
        error: "Select at least one ground mesh to update.",
      },
    );
    expect(
      await post(batchForm(["update_timestamps"], { ids: "not-json" })),
    ).toEqual({
      error: "Select at least one ground mesh to update.",
    });
    expect(api.bulkUpdate).not.toHaveBeenCalled();
  });

  it("aborts the batch when a ticked bound component is malformed", async () => {
    const result = await post(
      batchForm(["update_max_bounds"], { values: { max_y: "1.2.3" } }),
    );

    expect(result.error).toContain("Maximum coordinates: Y:");
    expect(api.bulkUpdate).not.toHaveBeenCalled();
  });

  it("accepts a ticked bounds group whose axes stay open", async () => {
    api.bulkUpdate.mockResolvedValue({ data: [] });

    await post(batchForm(["update_min_bounds"], { values: { min_z: "-3" } }));

    // Unlike the edit form, a batch group validates with allowEmpty, and the min/max
    // cross-check never runs because the two halves are ticked independently.
    expect(api.bulkUpdate.mock.calls[0][0].body.data).toEqual({
      min_x: null,
      min_y: null,
      min_z: "-3",
    });
  });

  it("validates a ticked scale as a size, not a coordinate", async () => {
    const result = await post(
      batchForm(["update_scale"], { values: { scale_x: "-1" } }),
    );

    expect(result.error).toContain("Scale: X:");
    expect(api.bulkUpdate).not.toHaveBeenCalled();
  });

  it("refuses a transform section with any axis left blank", async () => {
    api.bulkUpdate.mockResolvedValue({ data: [] });

    // Every transform component backs a NOT NULL column, so a blank axis is not a clear.
    const result = await post(
      batchForm(["update_scale"], { values: { scale_y: "2" } }),
    );

    expect(result.error).toBe(
      "Scale needs a value for X and Z; every component is required, so leave the box unticked to keep each ground mesh's current scale.",
    );
    expect(api.bulkUpdate).not.toHaveBeenCalled();
  });

  it("sends a complete transform vector and clears an omitted timestamp", async () => {
    api.bulkUpdate.mockResolvedValue({ data: [] });

    await post(
      batchForm(["update_timestamps", "update_translate"], {
        values: {
          min_timestamp: "2026-01-01T00:00:00+00:00",
          translate_x: "1.5",
          translate_y: "0",
          translate_z: "-3",
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
    });
  });
});
