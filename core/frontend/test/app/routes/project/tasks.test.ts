/**
 * Tests for the task batch dialog's route adapter.
 *
 * A bulk write applies one payload to every selected task and replaces the
 * assignment outright, so what matters is which keys reach the request: an
 * attribute the batch did not opt into must be absent (its rows keep their own
 * list), while an opted-in empty list must be present (that is a real clear).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  bulkUpdateTasks: vi.fn(),
  readProject: vi.fn(),
}));

vi.mock("../../../../client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../client")>()),
  bulkUpdateTasksTasksBulkPatch: sdk.bulkUpdateTasks,
  readProjectProjectsIdGet: sdk.readProject,
}));

import {
  action,
  describeBatchAssignees,
} from "../../../../app/routes/project/tasks";
import { commitSession, getSession } from "../../../../app/sessions";
import type { TaskPublic as Task } from "../../../../client";

beforeEach(() => {
  sdk.readProject.mockResolvedValue({
    data: { id: 1, name: "project", members: [] },
  });
});

afterEach(() => vi.clearAllMocks());

async function submit(formData: FormData) {
  const session = await getSession();
  session.set("token", { access_token: "access", token_type: "bearer" });
  session.set("user", {
    id: 1,
    username: "manager",
    roles: ["project-manager"],
  });

  return await action({
    request: new Request("http://localhost/projects/1/tasks", {
      method: "POST",
      body: formData,
      headers: { Cookie: await commitSession(session) },
    }),
    params: { projectId: "1" },
  } as never);
}

/**
 * The shape the dialog posts. Each `BatchSection` toggle is a `SubmittedCheckbox`,
 * so an unchecked attribute submits ["false"] and a checked one ["false", "true"].
 */
function batchForm(
  overrides: Partial<Record<string, string | string[]>> = {},
): FormData {
  const values: Record<string, string | string[]> = {
    _action: "batch_update",
    selectedIds: "[11,12]",
    updateSupervisors: "false",
    supervisor_ids: "[]",
    updateAnnotators: "false",
    annotator_ids: "[]",
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

describe("task batch update", () => {
  it("refuses a batch that opted into no attribute", async () => {
    expect(await submit(batchForm())).toEqual({
      error: "Select at least one attribute to update",
    });
    expect(sdk.bulkUpdateTasks).not.toHaveBeenCalled();
  });

  it("sends only the assignment the batch opted into", async () => {
    sdk.bulkUpdateTasks.mockResolvedValue({ data: {} });

    expect(
      await submit(
        batchForm({
          updateSupervisors: ["false", "true"],
          supervisor_ids: "[3,7]",
        }),
      ),
    ).toEqual({ success: "Updated 2 tasks." });

    const body = sdk.bulkUpdateTasks.mock.calls[0][0].body;
    expect(body).toEqual({
      ids: [11, 12],
      data: { supervisor_ids: [3, 7] },
    });
  });

  it.each([
    [403, "Forbidden"],
    [404, "Not Found"],
  ])(
    "preserves a %i backend refusal without claiming success",
    async (status, detail) => {
      sdk.bulkUpdateTasks.mockResolvedValue({
        error: { detail },
        response: new Response(null, { status }),
      });

      const result = await submit(
        batchForm({
          updateAnnotators: ["false", "true"],
          annotator_ids: "[5]",
        }),
      );

      expect(sdk.bulkUpdateTasks).toHaveBeenCalledOnce();
      expect(result).toEqual({ error: detail });
      expect(result).not.toHaveProperty("success");
    },
  );

  it("keeps the other assignment off the request so each task keeps its own", async () => {
    sdk.bulkUpdateTasks.mockResolvedValue({ data: {} });

    await submit(
      batchForm({
        updateAnnotators: ["false", "true"],
        annotator_ids: "[5]",
      }),
    );

    // Absence is the mechanism: a `supervisor_ids` key would overwrite every
    // selected task's supervisors with the untouched empty picker.
    const { data } = sdk.bulkUpdateTasks.mock.calls[0][0].body;
    expect(data).toEqual({ annotator_ids: [5] });
    expect(data).not.toHaveProperty("supervisor_ids");
  });

  it("treats an opted-in empty list as an explicit unassign", async () => {
    sdk.bulkUpdateTasks.mockResolvedValue({ data: {} });

    await submit(
      batchForm({
        updateSupervisors: ["false", "true"],
        supervisor_ids: "[]",
      }),
    );

    expect(sdk.bulkUpdateTasks.mock.calls[0][0].body.data).toEqual({
      supervisor_ids: [],
    });
  });

  it("applies the same payload to the whole selection in one request", async () => {
    sdk.bulkUpdateTasks.mockResolvedValue({ data: {} });

    await submit(
      batchForm({
        updateSupervisors: ["false", "true"],
        supervisor_ids: "[3]",
        updateAnnotators: ["false", "true"],
        annotator_ids: "[4]",
      }),
    );

    const call = sdk.bulkUpdateTasks.mock.calls[0][0];
    expect(sdk.bulkUpdateTasks).toHaveBeenCalledOnce();
    expect(call.auth).toBe("access");
    expect(call.body).toEqual({
      ids: [11, 12],
      data: { supervisor_ids: [3], annotator_ids: [4] },
    });
  });

  it("reports a rejected batch without claiming it was applied", async () => {
    sdk.bulkUpdateTasks.mockResolvedValue({
      error: { detail: "annotator is not a project member" },
    });

    expect(
      await submit(
        batchForm({
          updateAnnotators: ["false", "true"],
          annotator_ids: "[9]",
        }),
      ),
    ).toEqual({ error: "annotator is not a project member" });
  });

  it("rejects a malformed selection before reaching the backend", async () => {
    expect(await submit(batchForm({ selectedIds: "not-json" }))).toEqual({
      error: expect.stringContaining("batch task form data"),
    });
    expect(sdk.bulkUpdateTasks).not.toHaveBeenCalled();
  });
});

const person = (id: number, username: string) => ({ id, username });
const task = (
  supervisors: ReturnType<typeof person>[],
  annotators: ReturnType<typeof person>[],
) => ({ supervisors, annotators }) as unknown as Task;
const accounts = new Map<number, { username: string }>([
  [1, { username: "alice" }],
  [2, { username: "bruna" }],
]);

describe("describeBatchAssignees", () => {
  it("compares the shared list against the union of the selection", () => {
    const preview = describeBatchAssignees({
      tasks: [
        task([person(1, "alice"), person(2, "bruna")], []),
        task([person(2, "bruna"), person(3, "carol")], []),
      ],
      accounts,
      role: "supervisors",
      ids: [3],
      enabled: true,
    });

    expect(preview.currentIds).toEqual([1, 2, 3]);
    expect(preview.droppedIds).toEqual([1, 2]);
    expect(preview.addedIds).toEqual([]);
  });

  it("reports nothing while the attribute is left opted out", () => {
    const preview = describeBatchAssignees({
      tasks: [task([], [person(1, "alice")])],
      accounts,
      role: "annotators",
      ids: [3],
      enabled: false,
    });

    // The picker starts empty, so a preview computed unconditionally would tell the actor
    // they are about to lose annotators they never opted to change.
    expect(preview.droppedIds).toEqual([]);
    expect(preview.addedIds).toEqual([]);
    expect(preview.currentIds).toEqual([1]);
  });

  it("reads an empty list as taking the role away from everyone", () => {
    const preview = describeBatchAssignees({
      tasks: [task([person(1, "alice")], []), task([person(2, "bruna")], [])],
      accounts,
      role: "supervisors",
      ids: [],
      enabled: true,
    });

    expect(preview.droppedIds).toEqual([1, 2]);
    expect(preview.format(preview.droppedIds)).toBe("alice, bruna");
  });

  it("names an account the picker did not list from the row that carries it", () => {
    const preview = describeBatchAssignees({
      tasks: [task([person(1, "alice"), person(9, "dave")], [])],
      accounts,
      role: "supervisors",
      ids: [],
      enabled: true,
    });

    expect(preview.format(preview.currentIds)).toBe("alice, dave");
    expect(preview.format([42])).toBe("user #42");
  });
});
