/**
 * Tests for the point cloud specification route: the group assignment rules the
 * form enforces before a write, and the signals it needs to keep the picker
 * honest after one.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  createSpec: vi.fn(),
  updateSpec: vi.fn(),
  bulkUpdateSpec: vi.fn(),
}));
vi.mock("sta/app/loaders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("sta/app/loaders")>()),
  loadAccessTokenSession: async () => ({
    session: {},
    token: { access_token: "access" },
  }),
}));
vi.mock("sta/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("sta/client")>()),
  createSpecSourceSpecPcdSpecsPost: api.createSpec,
  updateSpecSourceSpecPcdSpecsIdPatch: api.updateSpec,
  bulkUpdateSpecsSourceSpecPcdSpecsBulkPatch: api.bulkUpdateSpec,
}));

import type { SourceSpecPublic as PointCloudSpec } from "sta/client";

import {
  action,
  describeBatchGroupConflicts,
  describeGroupOwnerConflicts,
} from "../../../../app/source/specs/specs";

afterEach(() => {
  vi.clearAllMocks();
});

function spec(id: number, name: string, groupIds: number[]): PointCloudSpec {
  return {
    id,
    name,
    groups: groupIds.map((groupId) => ({ id: groupId, name: `g${groupId}` })),
  };
}

function specForm(
  actionType: "create" | "update",
  groupIds: unknown[],
  overrides: Record<string, string> = {},
): FormData {
  const form = new FormData();
  form.set("_action", actionType);
  form.set("name", "pcd spec");
  form.set("description", "");
  form.set("group_ids", JSON.stringify(groupIds));
  form.set("dtype", "float32");
  form.set("channel_headers", "x\ny\nz\nintensity");
  form.set("width", "");
  form.set("height", "");
  form.set("preprocessors", "[]");
  if (actionType === "update") {
    form.set("id", "3");
    form.set("issued_at", "2026-01-01T00:00:00+00:00");
  }
  for (const [name, value] of Object.entries(overrides)) {
    form.set(name, value);
  }
  return form;
}

async function submit(form: FormData) {
  return (await action({
    request: new Request("http://localhost/source/specs/pcd", {
      method: "POST",
      body: form,
    }),
  } as any)) as {
    error?: string;
    success?: string;
    resyncGroups?: boolean;
  };
}

describe("describeGroupOwnerConflicts", () => {
  const specs = [spec(1, "S1", [10]), spec(2, "S2", [20, 21])];

  it("accepts a group no other specification claims", () => {
    expect(describeGroupOwnerConflicts([10, 30], specs, 1)).toBeNull();
  });

  it("ignores the groups the specification already owns", () => {
    expect(describeGroupOwnerConflicts([20], specs, 2)).toBeNull();
  });

  it("names both the group and the specification that holds it", () => {
    expect(describeGroupOwnerConflicts([10, 21], specs, 2)).toContain(
      "g10 from S1",
    );
  });
});

describe("describeBatchGroupConflicts", () => {
  const specs = [spec(1, "S1", [10]), spec(2, "S2", [20])];

  it("treats clearing every group as always valid", () => {
    expect(describeBatchGroupConflicts([1, 2], [], specs)).toBeNull();
  });

  it("refuses to give one group list to several specifications", () => {
    expect(describeBatchGroupConflicts([1, 2], [10], specs)).toContain(
      "one specification at a time",
    );
  });

  it("checks ownership for a single selected specification", () => {
    expect(describeBatchGroupConflicts([1], [20], specs)).toContain(
      "g20 from S2",
    );
    expect(describeBatchGroupConflicts([1], [30], specs)).toBeNull();
  });
});

describe("point cloud specification group writes", () => {
  it("creates a specification assigned to no group", async () => {
    api.createSpec.mockResolvedValue({ data: spec(1, "pcd spec", []) });

    const result = await submit(specForm("create", []));

    expect(result.error).toBeUndefined();
    expect(api.createSpec).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ group_ids: [] }),
      }),
    );
  });

  it("creates a specification assigned to several groups", async () => {
    api.createSpec.mockResolvedValue({ data: spec(1, "pcd spec", [10, 11]) });

    const result = await submit(specForm("create", [10, 11]));

    expect(result.error).toBeUndefined();
    expect(api.createSpec).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ group_ids: [10, 11] }),
      }),
    );
  });

  it("asks the form to reload the groups it could not assign", async () => {
    api.updateSpec.mockResolvedValue({
      error: {
        detail: "Groups already have a specification of this type: [20]",
      },
    });

    const result = await submit(specForm("update", [10, 20]));

    expect(result.error).toContain("specification of this type");
    expect(result.resyncGroups).toBe(true);
  });

  it("keeps the draft when validation rejects the write before the backend", async () => {
    const result = await submit(specForm("create", [10], { name: "" }));

    expect(result.error).toBeDefined();
    expect(result.resyncGroups).toBeUndefined();
    expect(api.createSpec).not.toHaveBeenCalled();
  });
});

type SpecBatchToggle =
  "update_name" | "update_description" | "update_groups" | "update_config";

const SPEC_BATCH_TOGGLES: SpecBatchToggle[] = [
  "update_name",
  "update_description",
  "update_groups",
  "update_config",
];

/** Which inputs a "Update ..." section contributes while it is ticked. */
const SPEC_BATCH_SECTION_FIELDS: Record<SpecBatchToggle, string[]> = {
  update_name: ["name"],
  update_description: ["description"],
  update_groups: [],
  update_config: [
    "dtype",
    "channel_headers",
    "width",
    "height",
    "preprocessors",
  ],
};

/** The batch form seeds the config inputs with the same defaults as the create form. */
const SPEC_BATCH_DEFAULTS: Record<string, string> = {
  dtype: "float32",
  channel_headers: "x\ny\nz\nintensity",
  width: "",
  height: "",
  preprocessors: "[]",
};

/**
 * The shape the batch modal posts. Every `update_*` flag is an unconditionally rendered
 * hidden input, `BatchSection` renders a group's inputs only while its checkbox is
 * ticked, and the group picker's `group_ids` hidden input sits outside the sections, so
 * it always travels.
 */
function batchSpecForm(
  ticked: SpecBatchToggle[],
  options: {
    ids?: string;
    groupIds?: unknown[];
    values?: Record<string, string>;
  } = {},
): FormData {
  const form = new FormData();
  form.set("_action", "batch_update");
  form.set("selectedIds", options.ids ?? "[1,2]");
  form.set("group_ids", JSON.stringify(options.groupIds ?? []));
  for (const toggle of SPEC_BATCH_TOGGLES) {
    form.set(toggle, ticked.includes(toggle) ? "true" : "false");
  }
  for (const toggle of ticked) {
    for (const field of SPEC_BATCH_SECTION_FIELDS[toggle]) {
      form.set(
        field,
        options.values?.[field] ?? SPEC_BATCH_DEFAULTS[field] ?? "",
      );
    }
  }
  return form;
}

describe("point cloud specification batch edit", () => {
  it("refuses a batch that ticks no attribute", async () => {
    expect(await submit(batchSpecForm([]))).toEqual({
      error: "Select at least one field group to update.",
    });
    expect(api.bulkUpdateSpec).not.toHaveBeenCalled();
  });

  it("sends only the ticked attributes", async () => {
    // The save reports the sweep it started, which is what lets the page offer to show
    // them rather than guess whether the queue took anything on.
    api.bulkUpdateSpec.mockResolvedValue({ data: { job_ids: [41] } });

    expect(
      await submit(
        batchSpecForm(["update_description"], {
          values: { description: "Velodyne sweeps" },
        }),
      ),
    ).toEqual({
      success: "2 point cloud sources updated successfully.",
      queuedJobIds: [41],
    });

    const { body } = api.bulkUpdateSpec.mock.calls[0][0];
    // Absence is what preserves a stored value: an unticked name or config must survive
    // on every selected row, so the batch says nothing about them.
    expect(body.data).toEqual({ description: "Velodyne sweeps" });
  });

  it("clears a ticked description left blank", async () => {
    api.bulkUpdateSpec.mockResolvedValue({ data: [] });

    await submit(batchSpecForm(["update_description"]));

    // The spec model holds a plain string here, so blank clears with "" where the
    // metadata dialogs clear with null.
    expect(api.bulkUpdateSpec.mock.calls[0][0].body.data).toEqual({
      description: "",
    });
  });

  it("replaces the group list, including with the empty list", async () => {
    api.bulkUpdateSpec.mockResolvedValue({ data: [] });

    await submit(batchSpecForm(["update_groups"], { groupIds: [10, 11] }));
    expect(api.bulkUpdateSpec.mock.calls[0][0].body.data).toEqual({
      group_ids: [10, 11],
    });

    await submit(batchSpecForm(["update_groups"], { groupIds: [] }));
    // An empty selection is the "unassign everywhere" answer, not a no-op.
    expect(api.bulkUpdateSpec.mock.calls[1][0].body.data).toEqual({
      group_ids: [],
    });
  });

  it("rejects an unparseable group list", async () => {
    const form = batchSpecForm(["update_groups"]);
    form.set("group_ids", "10, 11");

    expect((await submit(form)).error).toBe(
      "Specification groups are invalid.",
    );
    expect(api.bulkUpdateSpec).not.toHaveBeenCalled();
  });

  it("parses the selectedIds hidden input into body.ids", async () => {
    // A response that names no jobs is an empty list, never `undefined`: the caller
    // distinguishes "nothing was queued" from "the server did not say".
    api.bulkUpdateSpec.mockResolvedValue({ data: {} });

    expect(
      await submit(
        batchSpecForm(["update_description"], {
          ids: "[4,5,6]",
          values: { description: "sweeps" },
        }),
      ),
    ).toEqual({
      success: "3 point cloud sources updated successfully.",
      queuedJobIds: [],
    });
    expect(api.bulkUpdateSpec.mock.calls[0][0].body.ids).toEqual([4, 5, 6]);

    expect(
      await submit(
        batchSpecForm(["update_description"], {
          ids: "[6]",
          values: { description: "sweeps" },
        }),
      ),
    ).toEqual({
      success: "Point cloud source updated successfully.",
      queuedJobIds: [],
    });
  });

  it("refuses an empty or unparseable selection before building a payload", async () => {
    expect(
      await submit(batchSpecForm(["update_config"], { ids: "[]" })),
    ).toEqual({ error: "Select at least one point cloud source to update." });
    expect(
      await submit(batchSpecForm(["update_config"], { ids: "not-json" })),
    ).toEqual({ error: "Select at least one point cloud source to update." });
    expect(api.bulkUpdateSpec).not.toHaveBeenCalled();
  });

  it("builds the whole config from a ticked config section", async () => {
    api.bulkUpdateSpec.mockResolvedValue({ data: [] });

    await submit(
      batchSpecForm(["update_config"], {
        values: {
          dtype: "uint16",
          channel_headers: "x,y,z",
          width: "64",
          height: "32",
          preprocessors: '[{"op_name":"denoise","op_params":{"radius":0.5}}]',
        },
      }),
    );

    expect(api.bulkUpdateSpec.mock.calls[0][0].body.data).toEqual({
      config: {
        dtype: "uint16",
        channel_headers: ["x", "y", "z"],
        width: 64,
        height: 32,
        preprocessors: [{ op_name: "denoise", op_params: { radius: 0.5 } }],
      },
    });
  });

  it("aborts the batch on malformed preprocessor JSON", async () => {
    const result = await submit(
      batchSpecForm(["update_config", "update_description"], {
        values: { description: "kept", preprocessors: "{ not json" },
      }),
    );

    expect(result.error).toBe("Config: Preprocessors must be valid JSON.");
    // One rejected group aborts the whole batch, so the ticked description is not applied.
    expect(api.bulkUpdateSpec).not.toHaveBeenCalled();
  });

  it("aborts the batch on an unsupported preprocessor op", async () => {
    const result = await submit(
      batchSpecForm(["update_config"], {
        values: { preprocessors: '[{"op_name":"spin","op_params":{}}]' },
      }),
    );

    expect(result.error).toContain("Preprocessor 1 must use one of");
    expect(api.bulkUpdateSpec).not.toHaveBeenCalled();
  });

  it("aborts the batch on a blank name while other groups are ticked", async () => {
    const result = await submit(
      batchSpecForm(["update_name", "update_config"]),
    );

    expect(result.error).toBe(
      "Name: The name cannot be blank and may be at most 255 characters long.",
    );
    expect(api.bulkUpdateSpec).not.toHaveBeenCalled();
  });

  it("applies a ticked name together with the description it was ticked with", async () => {
    api.bulkUpdateSpec.mockResolvedValue({ data: [] });

    await submit(
      batchSpecForm(["update_name", "update_description"], {
        values: { name: "roof sweep", description: "reprocessed" },
      }),
    );

    expect(api.bulkUpdateSpec.mock.calls[0][0].body.data).toEqual({
      name: "roof sweep",
      description: "reprocessed",
    });
  });
});
