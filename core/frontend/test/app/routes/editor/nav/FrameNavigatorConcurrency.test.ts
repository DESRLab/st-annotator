/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { EditorConfig } from "../../../../../app/routes/editor/config";
import {
  EditableBranch,
  HistoryItemStatus,
} from "../../../../../app/routes/editor/labelset/EditableBranch";
import type { Operation } from "../../../../../app/routes/editor/labelset/Operation";
import {
  FrameState,
  LabelsetBranchState,
  ProjectConfig,
  SourceGroupState,
  TaskState,
} from "../../../../../app/routes/editor/models";
import { EditableFrame } from "../../../../../app/routes/editor/nav/EditableFrame";
import { FrameNavigator } from "../../../../../app/routes/editor/nav/FrameNavigator";
import { FrameSortFunction } from "../../../../../app/routes/editor/nav/FramePath";
import {
  SceneContext,
  type NavFrameEvent,
} from "../../../../../app/routes/editor/scene/SceneContext";
import { EditorViews } from "../../../../../app/routes/editor/views";
import type { PushCommitsData } from "../../../../../app/routes/editor/views";

function task(id: number) {
  return TaskState.fromJSON({ id, project_id: 1, name: `task-${id}` });
}

function sourceGroup(id: number) {
  return SourceGroupState.fromJSON({
    id,
    name: `source-${id}`,
    description: "",
  });
}

function frame(views: EditorViews, id: number, x: number, timestamp: number) {
  return new EditableFrame(
    views,
    FrameState.fromJSON({
      id,
      task: task(1),
      account_id: 1,
      source_group_id: 2,
      label_branch_id: 3,
      min_x: x,
      max_x: x + 1,
      min_y: 0,
      max_y: 1,
      min_z: 0,
      max_z: 1,
      min_timestamp: new Date(timestamp * 1000).toISOString(),
      max_timestamp: new Date((timestamp + 1) * 1000).toISOString(),
      work_type: "annotate",
    }),
  );
}

function branch(id: number) {
  return Object.assign(new (class extends EventTarget {})(), {
    id,
    group: { id: 1 },
    hasUnsavedChanges: false,
    hash: () => JSON.stringify(id),
    equals: (other: any) => other?.id === id,
  }) as unknown as EditableBranch;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Frames served per (task, source group, branch) tuple. */
const TUPLE_FRAMES: Record<string, ((views: EditorViews) => EditableFrame)[]> =
  {
    "1:11:21": [(views) => frame(views, 100, 0, 10)],
    "1:12:21": [(views) => frame(views, 101, 0, 11)],
    "1:11:22": [(views) => frame(views, 102, 0, 12)],
    "1:12:22": [
      (views) => frame(views, 130, 0, 30),
      (views) => frame(views, 131, 0, 40),
    ],
    "2:13:31": [(views) => frame(views, 200, 0, 20)],
  };

function tupleKey(taskId: number, groupId: number, branchId: number) {
  return `${taskId}:${groupId}:${branchId}`;
}

/** Serves one response per call; `'held'` entries return a pending promise the test resolves. */
function responderFor<T>(responses: readonly (readonly T[] | "held")[]) {
  const held: ReturnType<typeof deferred<readonly T[]>>[] = [];
  let calls = 0;
  return {
    held,
    next: (): Promise<readonly T[]> => {
      const response = responses[calls] ?? responses.at(-1);
      calls += 1;
      if (response === "held") {
        const pending = deferred<readonly T[]>();
        held.push(pending);
        return pending.promise;
      }
      return Promise.resolve(response);
    },
  };
}

interface RaceViewsOptions {
  task1Groups?: readonly (readonly SourceGroupState[] | "held")[];
  task1Branches?: readonly (readonly { id: number }[] | "held")[];
  task2Groups?: readonly (readonly SourceGroupState[] | "held")[];
  task2Branches?: readonly (readonly { id: number }[] | "held")[];
}

/** Mock views with two tasks, whose per-call responses can be held pending. */
function createRaceViews(options: RaceViewsOptions = {}) {
  const task1Groups = responderFor(
    options.task1Groups ?? [[sourceGroup(11), sourceGroup(12)]],
  );
  const task1Branches = responderFor(
    options.task1Branches ?? [[{ id: 21 }, { id: 22 }]],
  );
  const task2Groups = responderFor(options.task2Groups ?? [[sourceGroup(13)]]);
  const task2Branches = responderFor(options.task2Branches ?? [[{ id: 31 }]]);
  const views = {
    getClassSelection: vi.fn().mockResolvedValue({ objclasses: [] }),
    listTasks: vi.fn().mockResolvedValue([task(1), task(2)]),
    getSourceGroups: vi.fn((taskId: number) =>
      (taskId === 2 ? task2Groups : task1Groups).next(),
    ),
    getLabelBranches: vi.fn((taskId: number) =>
      (taskId === 2 ? task2Branches : task1Branches).next(),
    ),
    getFrames: vi.fn((taskId: number, groupId: number, branchId: number) => {
      const frames = TUPLE_FRAMES[tupleKey(taskId, groupId, branchId)] ?? [];
      return Promise.resolve(
        frames.map((create) =>
          create(views as unknown as EditorViews).toState(),
        ),
      );
    }),
    syncEditorUrl: vi.fn(),
  } as unknown as EditorViews & {
    getSourceGroups: ReturnType<typeof vi.fn>;
    getFrames: ReturnType<typeof vi.fn>;
    syncEditorUrl: ReturnType<typeof vi.fn>;
  };
  return { views, task1Groups, task1Branches, task2Groups, task2Branches };
}

/**
 * Mock views for the initial-load sequence. Task 1 has two label branches, and
 * its default scene holds frames whose id order and timestamp order disagree:
 * 130 is first by id, 131 is first by the default `TXY` playback sort.
 */
function createDeepLinkViews() {
  const byBranch: Record<number, (views: EditorViews) => EditableFrame[]> = {
    21: (views) => [frame(views, 130, 0, 40), frame(views, 131, 0, 30)],
    22: (views) => [frame(views, 132, 0, 20)],
  };
  const views = {
    getClassSelection: vi.fn().mockResolvedValue({ objclasses: [] }),
    listTasks: vi.fn().mockResolvedValue([task(1)]),
    getSourceGroups: vi.fn().mockResolvedValue([sourceGroup(11)]),
    getLabelBranches: vi.fn().mockResolvedValue([{ id: 21 }, { id: 22 }]),
    getFrames: vi.fn((_taskId: number, _groupId: number, branchId: number) =>
      Promise.resolve(
        (byBranch[branchId]?.(views as unknown as EditorViews) ?? []).map(
          (editable) => editable.toState(),
        ),
      ),
    ),
    syncEditorUrl: vi.fn(),
  } as unknown as EditorViews & {
    getFrames: ReturnType<typeof vi.fn>;
    syncEditorUrl: ReturnType<typeof vi.fn>;
  };
  return views;
}

beforeEach(() => {
  vi.spyOn(EditableBranch, "create").mockImplementation(
    async (_views, data: any) => branch(data.id),
  );
});

describe("FrameNavigator conflicting navigation", () => {
  it("loads an atomic scene selection with one frame-list request", async () => {
    const { views } = createRaceViews();
    const nav = await FrameNavigator.create(views);
    await nav.loadTaskById(1);
    views.getFrames.mockClear();

    await nav.loadSceneSelection(
      nav.sourceGroups.elements.find(({ id }) => id === 12)!,
      nav.labelBranches.elements.find(({ id }) => id === 22)!,
      131,
    );

    expect(views.getFrames).toHaveBeenCalledOnce();
    expect(views.getFrames).toHaveBeenCalledWith(1, 12, 22);
    expect(nav.frameId).toBe(131);
  });

  it("rejects a stale source-group selection racing a task switch", async () => {
    const { views, task2Groups, task2Branches } = createRaceViews({
      task2Groups: ["held"],
      task2Branches: ["held"],
    });
    const nav = await FrameNavigator.create(views);
    await nav.loadTaskById(1);
    expect(nav.sourceGroup?.id).toBe(11);
    expect(nav.frameId).toBe(100);
    const staleGroup = nav.sourceGroups.elements.find(({ id }) => id === 11)!;

    // Switch to task 2, then try to apply a task-1 source group while the
    // switch is still in flight.
    const switchTask = nav.loadTaskById(2);
    const staleSelect = nav.loadSourceGroup(staleGroup);

    await vi.waitFor(() => expect(task2Groups.held).toHaveLength(1));
    await vi.waitFor(() => expect(task2Branches.held).toHaveLength(1));
    task2Groups.held[0].resolve([sourceGroup(13)]);
    task2Branches.held[0].resolve([{ id: 31 }]);
    await Promise.all([switchTask, staleSelect]);

    expect(nav.taskId).toBe(2);
    expect(nav.sourceGroup?.id).toBe(13);
    expect(nav.labelBranch?.id).toBe(31);
    // The final tuple belongs to task 2; the stale group was never applied.
    expect(nav.sourceGroupId).toBe(13);
    expect(nav.labelBranchId).toBe(31);
    expect(nav.frames.elements.map(({ id }) => id)).toEqual([200]);
    expect(nav.frameId).toBe(200);
    expect(views.getFrames).not.toHaveBeenCalledWith(2, 11, expect.anything());
  });

  it("rejects a stale label-branch selection racing a task switch", async () => {
    const { views, task2Groups, task2Branches } = createRaceViews({
      task2Groups: ["held"],
      task2Branches: ["held"],
    });
    const nav = await FrameNavigator.create(views);
    await nav.loadTaskById(1);
    const staleBranch = nav.labelBranches.elements.find(({ id }) => id === 21)!;

    const switchTask = nav.loadTaskById(2);
    const staleSelect = nav.loadLabelBranch(staleBranch);

    await vi.waitFor(() => expect(task2Groups.held).toHaveLength(1));
    await vi.waitFor(() => expect(task2Branches.held).toHaveLength(1));
    task2Groups.held[0].resolve([sourceGroup(13)]);
    task2Branches.held[0].resolve([{ id: 31 }]);
    await Promise.all([switchTask, staleSelect]);

    expect(nav.taskId).toBe(2);
    expect(nav.sourceGroup?.id).toBe(13);
    expect(nav.labelBranch?.id).toBe(31);
    expect(nav.labelBranchId).toBe(31);
    expect(nav.frames.elements.map(({ id }) => id)).toEqual([200]);
    expect(nav.frameId).toBe(200);
    expect(views.getFrames).not.toHaveBeenCalledWith(2, expect.anything(), 21);
  });

  it("keeps the last accepted tuple across task A -> B -> A with out-of-order responses", async () => {
    const { views, task1Groups, task1Branches } = createRaceViews({
      task1Groups: ["held", [sourceGroup(12)]],
      task1Branches: ["held", [{ id: 22 }]],
    });
    const nav = await FrameNavigator.create(views);

    // Load task 1 (held), switch to task 2, and back to task 1 before the
    // first task-1 responses arrive.
    const loadA1 = nav.loadTaskById(1);
    await vi.waitFor(() =>
      expect(views.getSourceGroups).toHaveBeenCalledTimes(1),
    );
    await nav.loadTaskById(2);
    expect(nav.taskId).toBe(2);
    expect(nav.frameId).toBe(200);
    await nav.loadTaskById(1);

    // The first task-1 responses arrive last and must be dropped.
    task1Groups.held[0].resolve([sourceGroup(11)]);
    task1Branches.held[0].resolve([{ id: 21 }]);
    await loadA1;

    expect(nav.taskId).toBe(1);
    expect(nav.sourceGroup?.id).toBe(12);
    expect(nav.labelBranch?.id).toBe(22);
    expect(nav.frames.elements.map(({ id }) => id)).toEqual([130, 131]);
    expect(nav.frameId).toBe(130);
  });

  it("converges overlapping source-group and branch changes to one coherent tuple", async () => {
    const { views } = createRaceViews();
    const nav = await FrameNavigator.create(views);
    await nav.loadTaskById(1);
    expect(nav.frameId).toBe(100);

    const group12 = nav.sourceGroups.elements.find(({ id }) => id === 12)!;
    const branch22 = nav.labelBranches.elements.find(({ id }) => id === 22)!;

    // Both selections start before either scene rebuild resolves; the
    // final tuple must combine them, and no intermediate tuple may leak.
    const changeGroup = nav.loadSourceGroup(group12);
    const changeBranch = nav.loadLabelBranch(branch22);
    await Promise.all([changeGroup, changeBranch]);

    expect(nav.sourceGroup?.id).toBe(12);
    expect(nav.labelBranch?.id).toBe(22);
    expect(nav.sourceGroupId).toBe(12);
    expect(nav.labelBranchId).toBe(22);
    expect(nav.frames.elements.map(({ id }) => id)).toEqual([130, 131]);
    expect(nav.frameId).toBe(130);
  });

  it("serializes overlapping context navigations and rejects stale dependent selections", async () => {
    window.history.replaceState(null, "", "/projects/1/annotate");
    const { views, task2Groups, task2Branches } = createRaceViews({
      task2Groups: ["held"],
      task2Branches: ["held"],
    });
    const nav = await FrameNavigator.create(views);
    await nav.loadTaskById(1);
    const config = new EditorConfig(
      ProjectConfig.fromJSON({ frame_cache_size: 4 }),
    );
    const context = new SceneContext(config, views, nav);
    const staleGroup = nav.sourceGroups.elements.find(({ id }) => id === 11)!;

    // Both intents fire within the same turn; the context's navigation
    // queue runs them sequentially.
    const switchTask = context.displayTaskById(2);
    const staleSelect = context.displaySourceGroup(staleGroup);

    await vi.waitFor(() => expect(task2Groups.held).toHaveLength(1));
    await vi.waitFor(() => expect(task2Branches.held).toHaveLength(1));
    task2Groups.held[0].resolve([sourceGroup(13)]);
    task2Branches.held[0].resolve([{ id: 31 }]);
    await Promise.all([switchTask, staleSelect]);

    // The stale selection is rejected: it never becomes the active group.
    expect(nav.taskId).toBe(2);
    expect(nav.sourceGroup?.id).not.toBe(11);
    expect(nav.labelBranch?.id).toBe(31);
    // The tuple stays coherent: each scene rebuild belongs to exactly one
    // task (task-1 group 11/12 or task-2 group 13), never a mix.
    for (const [taskId, groupId] of views.getFrames.mock.calls) {
      expect(taskId).toBe(groupId === 13 ? 2 : 1);
    }
    // The URL sync follows navigation, ending with the cleared frame.
    expect(views.syncEditorUrl).toHaveBeenCalled();
    expect(views.syncEditorUrl.mock.calls.at(-1)).toEqual([null]);
  });
});

describe("initial frame selection", () => {
  /** Wires a real context over the deep-link views, recording frame displays. */
  async function createContext() {
    const views = createDeepLinkViews();
    const nav = await FrameNavigator.create(views);
    const config = new EditorConfig(
      ProjectConfig.fromJSON({ frame_cache_size: 4 }),
    );
    const context = new SceneContext(config, views, nav);
    const onNavFrame = vi.fn((_event: NavFrameEvent) => {});
    context.addEventListener("nav-frame", onNavFrame);

    return { views, nav, context, onNavFrame };
  }

  it("displays the playback-first frame once when the URL names no frame", async () => {
    const { views, nav, context, onNavFrame } = await createContext();

    // Step 1 of `loadInitialEditorData` without a `frame_id`: the selectors and
    // the scene are loaded, so the playback sort can pick a frame, but none of
    // them is displayed yet.
    await context.displayTaskSelectors(task(1));
    expect(nav.frames.elements.map(({ id }) => id)).toEqual([130, 131]);
    expect(nav.frameId).toBeNull();
    expect(onNavFrame).not.toHaveBeenCalled();

    // Step 2: the first frame is 131 by timestamp, not 130 by id.
    const [firstFrame] = FrameSortFunction.TXY.sortedFrames(nav.frames);
    await context.displaySceneSelection(
      nav.sourceGroup,
      nav.labelBranch,
      firstFrame?.id ?? null,
    );

    expect(nav.frameId).toBe(131);
    expect(onNavFrame).toHaveBeenCalledOnce();
    const [event] = onNavFrame.mock.calls[0] ?? [];
    expect(event?.prevFrame).toBeNull();
    expect(event?.frame?.id).toBe(131);
    expect(views.syncEditorUrl.mock.calls).toEqual([[event?.frame]]);
    context.dispose();
  });

  it("displays a deep-linked frame from another branch once", async () => {
    const { views, nav, context, onNavFrame } = await createContext();

    await context.displayTaskSelectors(task(1));

    // Step 2 for `?task_id=1&frame_id=132`: the frame belongs to branch 22, so
    // the scene is rebuilt for it rather than showing branch 21's first frame.
    const branch = nav.labelBranches.elements.find(({ id }) => id === 22)!;
    await context.displaySceneSelection(nav.sourceGroup, branch, 132);

    expect(nav.labelBranchId).toBe(22);
    expect(nav.frameId).toBe(132);
    expect(onNavFrame).toHaveBeenCalledOnce();
    const [event] = onNavFrame.mock.calls[0] ?? [];
    expect(event?.prevFrame).toBeNull();
    expect(event?.frame?.id).toBe(132);
    expect(views.syncEditorUrl.mock.calls).toEqual([[event?.frame]]);
    context.dispose();
  });
});

/** Exposes the protected constructor without the async commit-graph load. */
class TestBranch extends EditableBranch {
  static createTest(
    views: EditorViews,
    state: LabelsetBranchState,
  ): TestBranch {
    return new TestBranch(views, state);
  }
}

/** An op whose only observable behavior is its local apply/undo calls. */
class RecordingOperation implements Operation<{ value: number }, null> {
  applyCalls = 0;
  undoCalls = 0;

  constructor(
    readonly displayName: string,
    readonly value = 1,
  ) {}

  get opName(): string {
    return "test-op";
  }

  get opParams(): { value: number } {
    return { value: this.value };
  }

  get opResult(): null {
    return null;
  }

  applyLocal(): void {
    this.applyCalls += 1;
  }

  undoLocal(): void {
    this.undoCalls += 1;
  }
}

function branchStateJson(id: number) {
  return {
    id,
    group: { id: 1, name: "Test Group" },
    name: `branch-${id}`,
    head: {
      group: { id: 1, name: "Test Group" },
      hash_: `head-hash-${id}`,
      author_id: 0,
      timestamp: "2026-08-13T00:00:00+00:00",
      op_config: { op_name: "open-editor", op_params: null },
    },
  };
}

function pushResult(branchId: number) {
  return {
    op_results: [] as unknown[],
    branch: LabelsetBranchState.fromJSON(branchStateJson(branchId)),
  };
}

interface PendingPush {
  taskId: number;
  branchId: number;
  data: PushCommitsData;
  resolve: (value: ReturnType<typeof pushResult>) => void;
  reject: (error: unknown) => void;
}

/** Frames served per (task, source group, branch) tuple for the save races. */
const SAVE_TUPLE_FRAMES: Record<
  string,
  ((views: EditorViews) => EditableFrame)[]
> = {
  "1:11:21": [(views) => frame(views, 100, 0, 10)],
  "1:11:22": [(views) => frame(views, 200, 0, 20)],
  "2:13:31": [(views) => frame(views, 300, 0, 30)],
};

/** Mock views with real editable branches and held pushes the test settles. */
function createSaveViews() {
  const pushes: PendingPush[] = [];
  const views = {
    getClassSelection: vi.fn().mockResolvedValue({ objclasses: [] }),
    listTasks: vi.fn().mockResolvedValue([task(1), task(2)]),
    getSourceGroups: vi.fn((taskId: number) =>
      Promise.resolve(taskId === 2 ? [sourceGroup(13)] : [sourceGroup(11)]),
    ),
    getLabelBranches: vi.fn((taskId: number) =>
      Promise.resolve(taskId === 2 ? [{ id: 31 }] : [{ id: 21 }, { id: 22 }]),
    ),
    getFrames: vi.fn((taskId: number, groupId: number, branchId: number) => {
      const frames =
        SAVE_TUPLE_FRAMES[`${taskId}:${groupId}:${branchId}`] ?? [];
      return Promise.resolve(
        frames.map((create) =>
          create(views as unknown as EditorViews).toState(),
        ),
      );
    }),
    getCommitGraph: vi.fn().mockResolvedValue(null),
    pushCommits: vi.fn(
      (taskId: number, branchId: number, data: PushCommitsData) => {
        let resolve!: PendingPush["resolve"];
        let reject!: PendingPush["reject"];
        const promise = new Promise<ReturnType<typeof pushResult>>(
          (res, rej) => {
            resolve = res;
            reject = rej;
          },
        );
        pushes.push({ taskId, branchId, data, resolve, reject });
        return promise;
      },
    ),
    syncEditorUrl: vi.fn(),
  } as unknown as EditorViews & {
    getFrames: ReturnType<typeof vi.fn>;
    pushCommits: ReturnType<typeof vi.fn>;
  };
  return { views, pushes };
}

describe("FrameNavigator saves across navigation", () => {
  beforeEach(() => {
    // Real branches (with a real save lifecycle) instead of the fake
    // event-target branches used by the navigation races above.
    vi.spyOn(EditableBranch, "create").mockImplementation(
      async (views: EditorViews, data: { id: number }) =>
        TestBranch.createTest(
          views,
          LabelsetBranchState.fromJSON(branchStateJson(data.id)),
        ),
    );
  });

  it("attributes an in-flight save to its branch when the user switches branches", async () => {
    const { views, pushes } = createSaveViews();
    const nav = await FrameNavigator.create(views);
    await nav.loadTaskById(1);
    expect(nav.labelBranch?.id).toBe(21);
    expect(nav.frameId).toBe(100);

    const branchA = nav.labelBranch as TestBranch;
    const branchB = nav.labelBranches.elements.find(
      ({ id }) => id === 22,
    )! as TestBranch;
    await branchA.apply(new RecordingOperation("Edit A"));

    const saving = branchA.pushActive(1);
    await vi.waitFor(() => expect(pushes).toHaveLength(1));

    // Navigate away through the context queue while A's save is in flight.
    const config = new EditorConfig(
      ProjectConfig.fromJSON({ frame_cache_size: 4 }),
    );
    const context = new SceneContext(config, views, nav);
    await context.displayLabelBranch(branchB);
    expect(nav.labelBranch?.id).toBe(22);
    expect(nav.frameId).toBe(200);

    // A's save settles afterwards.
    pushes[0].resolve(pushResult(21));
    await saving;

    // The push was addressed to A's tuple and updated A's history only.
    expect(pushes[0].taskId).toBe(1);
    expect(pushes[0].branchId).toBe(21);
    expect(branchA.hasUnsavedChanges).toBe(false);
    expect(branchA.getHistory()[1].status).toBe(HistoryItemStatus.SAVED);
    expect(branchB.getHistory()).toHaveLength(1);
    expect(branchB.hasUnsavedChanges).toBe(false);

    // B's labels and selection are untouched.
    expect(nav.labelBranch?.id).toBe(22);
    expect(nav.frameId).toBe(200);
    expect(nav.hasUnsavedChanges).toBe(false);
  });

  it("keeps a failed in-flight save attributed to the old branch without corrupting the new one", async () => {
    const { views, pushes } = createSaveViews();
    const nav = await FrameNavigator.create(views);
    await nav.loadTaskById(1);

    const branchA = nav.labelBranch as TestBranch;
    const branchB = nav.labelBranches.elements.find(
      ({ id }) => id === 22,
    )! as TestBranch;
    await branchA.apply(new RecordingOperation("Edit A"));

    const saving = branchA.pushActive(1);
    await vi.waitFor(() => expect(pushes).toHaveLength(1));
    await nav.loadLabelBranch(branchB);

    pushes[0].reject(new Error("409: branch head changed"));
    await expect(saving).rejects.toThrow("409");

    // A stays dirty; B and its displayed frame are intact.
    expect(branchA.hasUnsavedChanges).toBe(true);
    expect(branchB.getHistory()).toHaveLength(1);
    expect(branchB.hasUnsavedChanges).toBe(false);
    expect(nav.labelBranch?.id).toBe(22);
    expect(nav.frameId).toBe(200);
    expect(nav.hasUnsavedChanges).toBe(true);

    // B's save path is unaffected by A's failure.
    await branchB.apply(new RecordingOperation("Edit B"));
    const savingB = branchB.pushActive(1);
    await vi.waitFor(() => expect(pushes).toHaveLength(2));
    expect(pushes[1].taskId).toBe(1);
    expect(pushes[1].branchId).toBe(22);
    pushes[1].resolve(pushResult(22));
    await savingB;
    expect(branchB.hasUnsavedChanges).toBe(false);

    // And A can still retry its own failed save with the same commits.
    const retrying = branchA.pushActive(1);
    await vi.waitFor(() => expect(pushes).toHaveLength(3));
    expect(pushes[2].branchId).toBe(21);
    expect(pushes[2].data.commits).toEqual(pushes[0].data.commits);
    pushes[2].resolve(pushResult(21));
    await retrying;
    expect(branchA.hasUnsavedChanges).toBe(false);
    expect(nav.hasUnsavedChanges).toBe(false);
  });

  it("settles an in-flight save on its own task after a task switch", async () => {
    const { views, pushes } = createSaveViews();
    const nav = await FrameNavigator.create(views);
    await nav.loadTaskById(1);

    const branchA = nav.labelBranch as TestBranch;
    await branchA.apply(new RecordingOperation("Edit A"));

    const saving = branchA.pushActive(1);
    await vi.waitFor(() => expect(pushes).toHaveLength(1));

    // Switch tasks while the save is in flight.
    await nav.loadTaskById(2);
    expect(nav.taskId).toBe(2);
    expect(nav.labelBranch?.id).toBe(31);
    expect(nav.frameId).toBe(300);

    pushes[0].resolve(pushResult(21));
    await saving;

    // The push was addressed to task 1/branch 21, not the current task.
    expect(pushes[0].taskId).toBe(1);
    expect(pushes[0].branchId).toBe(21);
    expect(branchA.hasUnsavedChanges).toBe(false);

    // The new task's tuple stayed coherent.
    expect(nav.taskId).toBe(2);
    expect(nav.sourceGroup?.id).toBe(13);
    expect(nav.labelBranch?.id).toBe(31);
    expect(nav.frames.elements.map(({ id }) => id)).toEqual([300]);
    expect(nav.frameId).toBe(300);
  });
});
