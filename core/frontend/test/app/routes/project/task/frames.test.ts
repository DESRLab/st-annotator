import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  bulkUpdateFrames: vi.fn(),
  initBranch: vi.fn(),
  listAccounts: vi.fn(),
  listFrames: vi.fn(),
  listLabelBranches: vi.fn(),
  listAllLabelBranches: vi.fn(),
  listLabelGroups: vi.fn(),
  listSourceGroups: vi.fn(),
  listAllSourceGroups: vi.fn(),
  listFrameIds: vi.fn(),
  readProject: vi.fn(),
  readBranch: vi.fn(),
  readTask: vi.fn(),
}));

vi.mock("../../../../../client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../../client")>()),
  bulkUpdateFramesFramesBulkPatch: sdk.bulkUpdateFrames,
  initBranchLabelRepoInitPost: sdk.initBranch,
  listAccountsAccountsGet: sdk.listAccounts,
  listFrameIdsFramesIdsGet: sdk.listFrameIds,
  listFramesFramesGet: sdk.listFrames,
  listTaskLabelBranchesEditorTaskLabelBranchesGet: sdk.listLabelBranches,
  listTaskSourceGroupsEditorTaskSourceGroupsGet: sdk.listSourceGroups,
  listBranchesLabelRepoBranchesGet: sdk.listAllLabelBranches,
  listGroupsLabelGroupsGet: sdk.listLabelGroups,
  listGroupsSourceGroupsGet: sdk.listAllSourceGroups,
  readProjectProjectsIdGet: sdk.readProject,
  readBranchLabelRepoBranchesIdGet: sdk.readBranch,
  readTaskTasksIdGet: sdk.readTask,
}));

import {
  action,
  buildFramesQuery,
  canInitializeLabelBranch,
  getInitialBranchPermissions,
  hasRequiredBranchAccess,
  loader,
  mapInBatches,
} from "../../../../../app/routes/project/task/frames";
import { frameFormSchema } from "../../../../../app/routes/project/task/frame-domain";
import { formatLabelBranchOption } from "../../../../../app/routes/project/task/frame-form-fields";
import { restrictSTBoundsToAxes } from "../../../../../app/routes/project/task/components";
import { commitSession, getSession } from "../../../../../app/sessions";
import { PartialSTBounds } from "sta/common";

afterEach(() => vi.clearAllMocks());

describe("formatLabelBranchOption", () => {
  it("includes the label group and branch names", () => {
    expect(
      formatLabelBranchOption({
        name: "production",
        group: { name: "vehicles" },
      } as Parameters<typeof formatLabelBranchOption>[0]),
    ).toBe("vehicles / production");
  });
});

describe("hasRequiredBranchAccess", () => {
  const branches = [{ perm_lv_by_user_id: { "5": 2, "6": 3 } }] as Parameters<
    typeof hasRequiredBranchAccess
  >[0];

  it("requires Write for annotation and Write Elevated for review", () => {
    expect(hasRequiredBranchAccess(branches, 5, "annotate")).toBe(true);
    expect(hasRequiredBranchAccess(branches, 5, "review")).toBe(false);
    expect(hasRequiredBranchAccess(branches, 6, "review")).toBe(true);
  });
});

describe("canInitializeLabelBranch", () => {
  it("requires the data-manager role", () => {
    expect(
      canInitializeLabelBranch({ roles: ["project-manager"] } as never),
    ).toBe(false);
    expect(canInitializeLabelBranch({ roles: ["data-manager"] } as never)).toBe(
      true,
    );
  });
});

describe("getInitialBranchPermissions", () => {
  it("keeps a selected current user at Admin", () => {
    expect(getInitialBranchPermissions(4, 4, "annotate")).toEqual({ "4": 4 });
    expect(getInitialBranchPermissions(4, 4, "review")).toEqual({ "4": 4 });
  });
});

describe("restrictSTBoundsToAxes", () => {
  it("leaves only the enabled data-derived axes bounded", () => {
    const sourceBounds = PartialSTBounds.fromJSON({
      min_coords: { x: "1", y: "2", z: "3" },
      max_coords: { x: "4", y: "5", z: "6" },
      min_timestamp: "2026-01-01T00:00:00.000Z",
      max_timestamp: "2026-01-02T00:00:00.000Z",
    });

    const result = restrictSTBoundsToAxes(sourceBounds, {
      x: true,
      y: false,
      z: true,
      t: false,
    });

    expect(result.min_coords).toMatchObject({ x: "1", y: null, z: "3" });
    expect(result.max_coords).toMatchObject({ x: "4", y: null, z: "6" });
    expect(result.min_timestamp).toBeNull();
    expect(result.max_timestamp).toBeNull();
  });
});

async function annotatorRequest(url: string) {
  const session = await getSession();
  session.set("token", { access_token: "access", token_type: "bearer" });
  session.set("user", { id: 4, username: "annotator", roles: ["annotator"] });
  return new Request(url, {
    headers: { Cookie: await commitSession(session) },
  });
}

async function managerRequest(url: string) {
  const session = await getSession();
  session.set("token", { access_token: "access", token_type: "bearer" });
  session.set("user", {
    id: 1,
    username: "manager",
    roles: ["project-manager", "data-manager"],
  });
  return new Request(url, {
    headers: { Cookie: await commitSession(session) },
  });
}

describe("buildFramesQuery", () => {
  it("maps id filters to numeric equality and range params", () => {
    expect(
      buildFramesQuery({
        filters: [{ columnId: "id", operator: "", searchTerms: [12] }],
        sorters: [],
      }),
    ).toEqual({ id: 12 });

    expect(
      buildFramesQuery({
        filters: [
          { columnId: "id", operator: "GE", searchTerms: [3] },
          { columnId: "id", operator: "LE", searchTerms: [9] },
        ],
        sorters: [],
      }),
    ).toEqual({ id_ge: 3, id_le: 9 });
  });

  it("maps account, source group, branch, and completion filters to list params", () => {
    expect(
      buildFramesQuery({
        filters: [
          {
            columnId: "account_id",
            operator: "IN",
            searchTerms: [1, 2],
          },
          {
            columnId: "source_group_id",
            operator: "IN",
            searchTerms: [4],
          },
          {
            columnId: "label_branch_id",
            operator: "IN",
            searchTerms: [7],
          },
          {
            columnId: "is_complete",
            operator: "IN",
            searchTerms: [true],
          },
        ],
        sorters: [],
      }),
    ).toEqual({
      account_id: ["1", "2"],
      source_group_id: ["4"],
      label_branch_id: ["7"],
      is_complete: ["true"],
    });
  });

  it("maps timestamp column filters to date range params", () => {
    expect(
      buildFramesQuery({
        filters: [
          {
            columnId: "min_timestamp",
            operator: "RangeInclusive",
            searchTerms: ["2026-08-01", "2026-08-04"],
          },
          {
            columnId: "max_timestamp",
            operator: "RangeInclusive",
            searchTerms: [null, "2026-08-31"],
          },
          {
            columnId: "last_viewed_at",
            operator: "RangeInclusive",
            searchTerms: ["2026-08-02", null],
          },
        ],
        sorters: [],
      }),
    ).toEqual({
      min_timestamp_ge: "2026-08-01",
      min_timestamp_lt: "2026-08-05",
      max_timestamp_lt: "2026-09-01",
      last_viewed_at_ge: "2026-08-02",
    });
  });

  it("ignores filters for unknown columns", () => {
    expect(
      buildFramesQuery({
        filters: [
          {
            columnId: "not_a_column",
            operator: "Contains",
            searchTerms: ["x"],
          },
        ],
        sorters: [],
      }),
    ).toEqual({});
  });

  it("applies whitelisted sorters and drops the rest", () => {
    expect(
      buildFramesQuery({
        filters: [],
        sorters: [{ columnId: "min_timestamp", direction: "desc" }],
      }),
    ).toEqual({ sort_by: "min_timestamp", sort_dir: "desc" });

    expect(
      buildFramesQuery({
        filters: [],
        sorters: [{ columnId: "min_x", direction: "asc" }],
      }),
    ).toEqual({});
  });
});

describe("frames loader pagination", () => {
  it("loads only the requested page when more filtered frames exist", async () => {
    sdk.readProject.mockResolvedValue({ data: { id: 7, name: "Project" } });
    sdk.readTask.mockResolvedValue({
      data: { id: 9, name: "Task", annotators: [], supervisors: [] },
    });
    sdk.listFrames.mockResolvedValue({
      data: [],
      response: new Response(null, {
        headers: { "Content-Range": "frames 25-49/1000" },
      }),
    });
    sdk.listAccounts.mockResolvedValue({ data: [] });
    sdk.listSourceGroups.mockResolvedValue({ data: [] });
    sdk.listLabelBranches.mockResolvedValue({ data: [] });
    sdk.listAllSourceGroups.mockResolvedValue({ data: [] });
    sdk.listAllLabelBranches.mockResolvedValue({ data: [] });
    sdk.listLabelGroups.mockResolvedValue({ data: [] });
    sdk.listFrameIds.mockResolvedValue({ data: [10, 11, 12, 13] });

    const result = (await loader({
      request: await annotatorRequest(
        "http://localhost/projects/7/tasks/9/frames/annotate?page=2&pageSize=25",
      ),
      params: { projectId: "7", taskId: "9", workType: "annotate" },
    } as any)) as any;

    expect(sdk.listFrames).toHaveBeenCalledTimes(1);
    expect(sdk.listFrames).toHaveBeenCalledWith({
      auth: "access",
      query: {
        task_id: 9,
        work_type: "annotate",
        account_id: [4],
        offset: 25,
        limit: 25,
      },
    });
    expect(result.pagination.totalItems).toBe(1000);
    expect(sdk.listFrameIds).toHaveBeenCalledOnce();
    expect(sdk.listFrameIds).toHaveBeenCalledWith({
      auth: "access",
      query: {
        task_id: 9,
        work_type: "annotate",
        account_id: [4],
      },
    });
    expect(result.allSelectableIds).toEqual([10, 11, 12, 13]);
  });

  it("loads every current branch and label group for an existing task", async () => {
    const oldBranch = { id: 21, group_id: 31, name: "old" };
    const newBranch = { id: 22, group_id: 32, name: "new" };
    sdk.readProject.mockResolvedValue({ data: { id: 7, name: "Project" } });
    sdk.readTask.mockResolvedValue({
      data: {
        id: 9,
        name: "Task",
        annotators: [{ id: 1, username: "manager" }],
        supervisors: [],
      },
    });
    sdk.listFrames.mockResolvedValue({ data: [] });
    sdk.listFrameIds.mockResolvedValue({ data: [] });
    sdk.listSourceGroups.mockResolvedValue({ data: [] });
    sdk.listAllSourceGroups.mockResolvedValue({ data: [] });
    sdk.listLabelBranches.mockResolvedValue({ data: [oldBranch] });
    sdk.listAllLabelBranches.mockResolvedValue({
      data: [oldBranch, newBranch],
    });
    sdk.listLabelGroups.mockResolvedValue({
      data: [
        { id: 31, name: "Old repository" },
        { id: 32, name: "New repository" },
      ],
    });

    const result = (await loader({
      request: await managerRequest(
        "http://localhost/projects/7/tasks/9/frames/annotate?account_id=1",
      ),
      params: { projectId: "7", taskId: "9", workType: "annotate" },
    } as any)) as any;

    expect(sdk.listAllLabelBranches).toHaveBeenCalledOnce();
    expect(result.labelBranches).toEqual([oldBranch, newBranch]);
    expect(result.labelGroups).toEqual([
      { id: 31, name: "Old repository" },
      { id: 32, name: "New repository" },
    ]);
  });
});

describe("mapInBatches", () => {
  it("caps active operations at the requested batch size", async () => {
    let active = 0;
    let maxActive = 0;
    const items = Array.from({ length: 23 }, (_, index) => index + 1);

    const results = await mapInBatches(items, 10, async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return item * 2;
    });

    expect(maxActive).toBe(10);
    expect(results).toEqual(items.map((item) => item * 2));
  });

  it("rejects invalid batch sizes", async () => {
    await expect(mapInBatches([1], 0, async (item) => item)).rejects.toThrow(
      RangeError,
    );
  });
});

describe("frameFormBounds", () => {
  const baseForm = {
    sourceGroupId: "",
    labelBranchId: "",
    completionOnly: ["false"],
    minX: "0",
    minY: "",
    minZ: "",
    maxX: "10",
    maxY: "",
    maxZ: "",
    minTimestamp: "",
    maxTimestamp: "",
    isComplete: ["false"],
  };

  function issuePaths(result: ReturnType<typeof frameFormSchema.safeParse>) {
    if (result.success) return null;
    return result.error.issues.map((issue) => issue.path.join("."));
  }

  it("accepts an ordered bounds set", () => {
    expect(issuePaths(frameFormSchema.safeParse(baseForm))).toBeNull();
  });

  it.each([
    ["minX", "maxX"],
    ["minY", "maxY"],
    ["minZ", "maxZ"],
  ])("rejects %s greater than %s", (minKey, maxKey) => {
    expect(
      issuePaths(
        frameFormSchema.safeParse({
          ...baseForm,
          [minKey]: "20",
          [maxKey]: "10",
        }),
      ),
    ).toContain(minKey);
  });

  it("skips a pair whose retained side is empty", () => {
    expect(
      issuePaths(
        frameFormSchema.safeParse({ ...baseForm, minX: "20", maxX: "" }),
      ),
    ).toBeNull();
  });

  it("rejects an inverted timestamp pair but accepts an ordered one", () => {
    expect(
      issuePaths(
        frameFormSchema.safeParse({
          ...baseForm,
          minTimestamp: "2026-01-02T00:00",
          maxTimestamp: "2026-01-01T00:00",
        }),
      ),
    ).toContain("minTimestamp");

    expect(
      issuePaths(
        frameFormSchema.safeParse({
          ...baseForm,
          minTimestamp: "2026-01-01T00:00",
          maxTimestamp: "2026-01-02T00:00",
        }),
      ),
    ).toBeNull();
  });
});

/**
 * Tests for the frame batch dialog's route adapter.
 *
 * Completion is the one attribute a frame's own account may write in bulk, and
 * unlike an assignment list it has no "absent means unchanged" reading to lose:
 * the dialog's value must reach the payload even when it is `false`, because
 * clearing a batch is the point of the control.
 */
describe("frame batch update", () => {
  beforeEach(() => {
    sdk.readProject.mockResolvedValue({ data: { id: 7, name: "Project" } });
    sdk.readTask.mockResolvedValue({
      data: { id: 9, name: "Task", annotators: [], supervisors: [] },
    });
  });

  async function submit(formData: FormData) {
    const session = await getSession();
    session.set("token", { access_token: "access", token_type: "bearer" });
    session.set("user", {
      id: 4,
      username: "annotator",
      roles: ["annotator"],
    });

    return (await action({
      request: new Request(
        "http://localhost/projects/7/tasks/9/frames/annotate",
        {
          method: "POST",
          body: formData,
          headers: { Cookie: await commitSession(session) },
        },
      ),
      params: { projectId: "7", taskId: "9", workType: "annotate" },
    } as never)) as { error?: string; success?: string };
  }

  /**
   * The shape the dialog posts. The section toggle is a `SubmittedCheckbox`, so
   * an unchecked attribute submits ["false"] and a checked one ["false",
   * "true"]. The completion select lives inside the section, so it is absent
   * until the toggle is ticked.
   */
  function batchForm(
    overrides: Partial<Record<string, string | string[]>> = {},
  ): FormData {
    const values: Record<string, string | string[]> = {
      _action: "batch_update",
      selectedIds: "[21,22]",
      updateCompletion: "false",
      ...overrides,
    };

    const form = new FormData();
    for (const [name, value] of Object.entries(values)) {
      for (const entry of Array.isArray(value) ? value : [value]) {
        form.append(name, entry);
      }
    }
    return form;
  }

  it("refuses a batch that opted into no attribute", async () => {
    expect(await submit(batchForm())).toEqual({
      error: "Select at least one attribute to update",
    });
    expect(sdk.bulkUpdateFrames).not.toHaveBeenCalled();
  });

  it("writes the chosen value to every selected frame", async () => {
    sdk.bulkUpdateFrames.mockResolvedValue({ data: {} });

    expect(
      await submit(
        batchForm({
          updateCompletion: ["false", "true"],
          completion: "true",
        }),
      ),
    ).toEqual({ success: "Updated 2 frames." });

    expect(sdk.bulkUpdateFrames).toHaveBeenCalledOnce();
    const call = sdk.bulkUpdateFrames.mock.calls[0][0];
    expect(call.auth).toBe("access");
    expect(call.body).toEqual({
      ids: [21, 22],
      data: { is_complete: true },
    });
  });

  it("sends an explicit false rather than leaving the batch alone", async () => {
    sdk.bulkUpdateFrames.mockResolvedValue({ data: {} });

    await submit(
      batchForm({
        updateCompletion: ["false", "true"],
        completion: "false",
      }),
    );

    const { data } = sdk.bulkUpdateFrames.mock.calls[0][0].body;
    expect(data).toEqual({ is_complete: false });
  });

  it.each([
    [403, "Forbidden"],
    [404, "Not Found"],
  ])(
    "preserves a %i rejected batch without claiming success",
    async (status, detail) => {
      sdk.bulkUpdateFrames.mockResolvedValue({
        error: { detail },
        response: new Response(null, { status }),
      });

      const result = await submit(
        batchForm({
          updateCompletion: ["false", "true"],
          completion: "true",
        }),
      );

      expect(sdk.bulkUpdateFrames).toHaveBeenCalledOnce();
      expect(result).toEqual({ error: detail });
      expect(result).not.toHaveProperty("success");
    },
  );

  it("rejects a malformed selection before reaching the backend", async () => {
    expect(await submit(batchForm({ selectedIds: "not-json" }))).toEqual({
      error: expect.stringContaining("batch frame form data"),
    });
    expect(sdk.bulkUpdateFrames).not.toHaveBeenCalled();
  });
});

describe("label branch initialization", () => {
  async function submit(
    workType: "annotate" | "review",
    accountId: number,
    referenceBranchId?: number,
    omitWorkType = false,
  ) {
    const session = await getSession();
    session.set("token", { access_token: "access", token_type: "bearer" });
    session.set("user", {
      id: 1,
      username: "manager",
      roles: ["project-manager", "data-manager"],
    });
    const form = new FormData();
    form.set("_action", "init_label_branch");
    form.set("group_id", "12");
    form.set("account_id", String(accountId));
    form.set("name", workType === "review" ? "jane-review" : "john-annotate");
    if (referenceBranchId != null) {
      form.set("reference_branch_id", String(referenceBranchId));
    }

    return action({
      request: new Request(
        `http://localhost/projects/7/tasks/9/frames${omitWorkType ? "" : `/${workType}`}`,
        {
          method: "POST",
          body: form,
          headers: { Cookie: await commitSession(session) },
        },
      ),
      params: {
        projectId: "7",
        taskId: "9",
        workType: omitWorkType ? undefined : workType,
      },
    } as never);
  }

  beforeEach(() => {
    sdk.readProject.mockResolvedValue({ data: { id: 7, name: "Project" } });
    sdk.readTask.mockResolvedValue({
      data: {
        id: 9,
        name: "Task",
        annotators: [
          { id: 1, username: "manager" },
          { id: 5, username: "john" },
        ],
        supervisors: [{ id: 6, username: "jane" }],
      },
    });
    sdk.initBranch.mockResolvedValue({ data: { id: 20 } });
  });

  it.each([
    ["annotate", 5, 2, "john-annotate"],
    ["review", 6, 3, "jane-review"],
  ] as const)(
    "grants the required %s access and keeps the creator Admin",
    async (workType, accountId, permission, name) => {
      expect(await submit(workType, accountId)).toEqual({
        success: "Label branch initialized successfully.",
      });
      expect(sdk.initBranch).toHaveBeenCalledWith({
        auth: "access",
        body: {
          group_id: 12,
          name,
          commit_hash: null,
          perm_lv_by_user_id: { "1": 4, [accountId]: permission },
        },
      });
    },
  );

  it("defaults the optional frames route to annotation during initialization", async () => {
    await submit("annotate", 5, undefined, true);

    expect(sdk.initBranch).toHaveBeenCalledWith({
      auth: "access",
      body: {
        group_id: 12,
        name: "john-annotate",
        commit_hash: null,
        perm_lv_by_user_id: { "1": 4, "5": 2 },
      },
    });
  });

  it("refuses an account outside the task assignment", async () => {
    expect(await submit("annotate", 99)).toEqual({
      error: "The selected account is not assigned to this task",
    });
    expect(sdk.initBranch).not.toHaveBeenCalled();
  });

  it("creates only one Admin grant when the selected account is the creator", async () => {
    await submit("annotate", 1);

    expect(sdk.initBranch).toHaveBeenCalledWith({
      auth: "access",
      body: {
        group_id: 12,
        name: "john-annotate",
        commit_hash: null,
        perm_lv_by_user_id: { "1": 4 },
      },
    });
  });

  it("starts a reviewer branch at the selected reference branch head", async () => {
    sdk.readBranch.mockResolvedValue({
      data: { id: 30, group_id: 12, head_hash: "reference-head" },
    });

    await submit("review", 6, 30);

    expect(sdk.readBranch).toHaveBeenCalledWith({
      auth: "access",
      path: { id: 30 },
    });
    expect(sdk.initBranch).toHaveBeenCalledWith({
      auth: "access",
      body: {
        group_id: 12,
        name: "jane-review",
        commit_hash: "reference-head",
        perm_lv_by_user_id: { "1": 4, "6": 3 },
      },
    });
  });

  it("rejects a reference branch from another repository", async () => {
    sdk.readBranch.mockResolvedValue({
      data: { id: 30, group_id: 99, head_hash: "reference-head" },
    });

    expect(await submit("review", 6, 30)).toEqual({
      error: "Reference label branch must belong to the task's repository",
    });
    expect(sdk.initBranch).not.toHaveBeenCalled();
  });
});
