import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { PartialSTBounds } from "sta/common";

import { EditableBranch } from "../../../../../app/routes/editor/labelset/EditableBranch";
import {
  FrameState,
  SourceGroupState,
  TaskState,
} from "../../../../../app/routes/editor/models";
import { ArrayMapIndex } from "../../../../../app/routes/editor/nav/ArrayMapIndex";
import { EditableFrame } from "../../../../../app/routes/editor/nav/EditableFrame";
import { FrameNavigator } from "../../../../../app/routes/editor/nav/FrameNavigator";
import {
  FramePath,
  FrameSortFunction,
} from "../../../../../app/routes/editor/nav/FramePath";
import { LabelsetNavigator } from "../../../../../app/routes/editor/nav/LabelsetNavigator";
import { ProjectNavigator } from "../../../../../app/routes/editor/nav/ProjectNavigator";
import {
  FrameIndex,
  SceneNavigator,
} from "../../../../../app/routes/editor/nav/SceneNavigator";
import { SourcesetNavigator } from "../../../../../app/routes/editor/nav/SourcesetNavigator";
import type { EditorViews } from "../../../../../app/routes/editor/views";

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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("ArrayMapIndex", () => {
  it("sorts by key and rejects missing indices and keys", () => {
    const index = new ArrayMapIndex(
      (value: { id: number }) => value.id,
      [{ id: 3 }, { id: 1 }],
    );
    expect(index.elements.map(({ id }) => id)).toEqual([1, 3]);
    expect(index.getByKey(3)).toEqual({ id: 3 });
    expect(index.getIdxOfKey(3)).toBe(1);
    expect(() => index.getByIdx(-1)).toThrow("There is no element");
    expect(() => index.getByKey(2)).toThrow("There is no element");
    expect(() => index.getIdxOfKey(2)).toThrow("Missing key");
  });
});

describe("FramePath and FrameIndex", () => {
  it("builds alternative axes on first read and reuses each axis", () => {
    const index = new FrameIndex([frame({} as EditorViews, 1, 0, 10)]);
    expect(
      Object.getOwnPropertyDescriptor(index.axes, "tc")?.value,
    ).toBeDefined();
    for (const name of ["xb", "yb", "zb", "tb", "xc", "yc", "zc"] as const) {
      expect(Object.getOwnPropertyDescriptor(index.axes, name)?.get).toBeTypeOf(
        "function",
      );
      const first = index.axes[name];
      expect(index.axes[name]).toBe(first);
      expect(Object.getOwnPropertyDescriptor(index.axes, name)?.value).toBe(
        first,
      );
    }
  });

  it("caches derived bounds shared by lookup axes and center calculations", () => {
    const item = frame({} as EditorViews, 1, 5, 10);
    const spatialSpy = vi.spyOn(PartialSTBounds.prototype, "getSpatialBounds");
    const timestampSpy = vi.spyOn(
      PartialSTBounds.prototype,
      "getTimestampBounds",
    );

    expect(item.getSpatialBounds()).toBe(item.getSpatialBounds());
    expect(Object.isFrozen(item.getSpatialBounds())).toBe(true);
    expect(Object.isFrozen(item.getSpatialBounds().xBounds)).toBe(true);
    expect(item.getSpatialCenter().x).toBe(5.5);
    expect(item.getTimestampBounds()).toBe(item.getTimestampBounds());
    expect(item.getTimestampCenter()?.getTime()).toBe(10_500);
    expect(item.containsPoint(new THREE.Vector3(5.5, 0.5, 0.5))).toBe(true);
    expect(item.containsTimestamp(item.getTimestampCenter())).toBe(true);
    expect(spatialSpy).toHaveBeenCalledOnce();
    expect(timestampSpy).toHaveBeenCalledOnce();
  });

  it("handles empty, missing, first, and last frame boundaries", () => {
    const views = {} as EditorViews;
    const first = frame(views, 1, 0, 10);
    const last = frame(views, 2, 5, 20);
    const path = new FramePath([first, last]);

    expect(new FramePath().getFrameAtOffset(first, 1)).toBeNull();
    expect(path.getFrameAtOffset(first, -1)).toBeNull();
    expect(path.getFrameAtOffset(last, 1)).toBeNull();
    expect(path.getFrameAtOffset(first, 1)).toBe(last);
    expect(path.getFrameAtOffset(frame(views, 99, 0, 0))).toBeNull();
  });

  it("rebuilds paths under different sort axes and supports exact/fuzzy range lookup", () => {
    const views = {} as EditorViews;
    const lateLeft = frame(views, 1, 0, 30);
    const earlyRight = frame(views, 2, 10, 10);
    const index = new FrameIndex([earlyRight, lateLeft]);

    expect(
      FrameSortFunction.XYT.sortedFrames(index).map(({ id }) => id),
    ).toEqual([1, 2]);
    expect(
      FrameSortFunction.TXY.sortedFrames(index).map(({ id }) => id),
    ).toEqual([2, 1]);
    expect(
      index.axes.xc.findInRangeOfFrame(lateLeft, 0).map(({ id }) => id),
    ).toEqual([1]);
    expect(index.axes.xc.getValueIdx(5, { fuzzy: true })).toBe(1);
    expect(() => index.getById(99)).toThrow("There is no frame with ID: 99");
  });

  it("orders frames with equal axis values by numeric ID", () => {
    const views = {} as EditorViews;
    const index = new FrameIndex([
      frame(views, 10, 0, 10),
      frame(views, 2, 0, 10),
      frame(views, 1, 0, 10),
    ]);

    expect(index.elements.map(({ id }) => id)).toEqual([1, 2, 10]);
    expect(
      FrameSortFunction.TXY.sortedFrames(index).map(({ id }) => id),
    ).toEqual([1, 2, 10]);
  });
});

describe("project, source-set, and scene navigators", () => {
  it("loads sorted tasks, validates selection, and resets to the first task on rebuild", async () => {
    const listTasks = vi
      .fn()
      .mockResolvedValueOnce([task(3), task(1)])
      .mockResolvedValueOnce([task(4)]);
    const nav = new ProjectNavigator({
      listTasks,
    } as unknown as EditorViews);
    await nav.load();
    expect(nav.tasks.elements.map(({ id }) => id)).toEqual([1, 3]);
    expect(nav.taskId).toBe(1);
    expect(() => {
      nav.taskId = 99;
    }).toThrow("There is no element with the given key");
    await nav.load();
    expect(nav.taskId).toBe(4);
  });

  it("does not fetch incomplete selectors and clears stale source/frame selection", async () => {
    const getSourceGroups = vi.fn().mockResolvedValue([sourceGroup(2)]);
    const sourceNav = new SourcesetNavigator({
      getSourceGroups,
    } as unknown as EditorViews);
    await sourceNav.load(null);
    expect(getSourceGroups).not.toHaveBeenCalled();
    expect(sourceNav.group).toBeNull();
    await sourceNav.load(7);
    expect(sourceNav.group?.id).toBe(2);
    await sourceNav.load(null);
    expect(sourceNav.group).toBeNull();

    const getFrames = vi.fn();
    const sceneNav = new SceneNavigator({
      getFrames,
    } as unknown as EditorViews);
    await sceneNav.load(1, null, 3);
    expect(getFrames).not.toHaveBeenCalled();
    expect(sceneNav.frame).toBeNull();
  });

  it("does not publish a stale concurrent scene rebuild", async () => {
    let resolveOld!: (frames: FrameState[]) => void;
    const oldRequest = new Promise<FrameState[]>((resolve) => {
      resolveOld = resolve;
    });
    const views = {
      getFrames: vi
        .fn()
        .mockReturnValueOnce(oldRequest)
        .mockResolvedValueOnce([frame({} as EditorViews, 2, 20, 20).toState()]),
    } as unknown as EditorViews;
    const nav = new SceneNavigator(views);
    const staleLoad = nav.load(1, 2, 3);
    await nav.load(4, 5, 6);
    resolveOld([frame({} as EditorViews, 1, 10, 10).toState()]);
    await staleLoad;

    expect(nav.taskId).toBe(4);
    expect(nav.sourceGroupId).toBe(5);
    expect(nav.labelBranchId).toBe(6);
    expect(nav.frames.elements.map(({ id }) => id)).toEqual([2]);
  });

  it("loads a deferred scene with its frames available but none displayed", async () => {
    const rawFrames = [
      frame({} as EditorViews, 10, 0, 10).toState(),
      frame({} as EditorViews, 11, 0, 20).toState(),
    ];
    const views = {
      getFrames: vi.fn().mockResolvedValue(rawFrames),
    } as unknown as EditorViews;
    const nav = new SceneNavigator(views);

    await nav.load(1, 2, 3, undefined, true);

    // The index is complete, so the caller can resolve the frame to display
    // against it, while nothing is selected yet.
    expect(nav.frames.elements.map(({ id }) => id)).toEqual([10, 11]);
    expect(nav.frameId).toBeNull();

    // Without the deferral the scene still opens on its first frame.
    await nav.load(1, 2, 3);
    expect(nav.frameId).toBe(10);
  });

  it("keeps the last selection across rapid A->B->C rebuilds completing in reverse order", async () => {
    const first = deferred<FrameState[]>();
    const second = deferred<FrameState[]>();
    const third = deferred<FrameState[]>();
    const views = {
      getFrames: vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise)
        .mockReturnValueOnce(third.promise),
    } as unknown as EditorViews;
    const nav = new SceneNavigator(views);

    const loadA = nav.load(1, 2, 3);
    const loadB = nav.load(1, 2, 4);
    const loadC = nav.load(1, 2, 5);

    // Responses arrive in reverse order of the requests.
    third.resolve([
      frame({} as EditorViews, 30, 30, 30).toState(),
      frame({} as EditorViews, 31, 31, 31).toState(),
    ]);
    await loadC;
    expect(nav.labelBranchId).toBe(5);
    expect(nav.frameId).toBe(30);

    second.resolve([frame({} as EditorViews, 20, 20, 20).toState()]);
    await loadB;
    first.resolve([frame({} as EditorViews, 10, 10, 10).toState()]);
    await loadA;

    expect(nav.taskId).toBe(1);
    expect(nav.sourceGroupId).toBe(2);
    expect(nav.labelBranchId).toBe(5);
    expect(nav.frames.elements.map(({ id }) => id)).toEqual([30, 31]);
    expect(nav.frameId).toBe(30);
  });

  it("does not publish stale concurrent project or source-set rebuilds", async () => {
    const oldTasks = deferred<TaskState[]>();
    const projectNav = new ProjectNavigator({
      listTasks: vi
        .fn()
        .mockReturnValueOnce(oldTasks.promise)
        .mockResolvedValueOnce([task(2)]),
    } as unknown as EditorViews);
    const staleProject = projectNav.load();
    await projectNav.load();
    oldTasks.resolve([task(1)]);
    await staleProject;
    expect(projectNav.tasks.elements.map(({ id }) => id)).toEqual([2]);
    expect(projectNav.taskId).toBe(2);

    const oldGroups = deferred<SourceGroupState[]>();
    const sourceNav = new SourcesetNavigator({
      getSourceGroups: vi
        .fn()
        .mockReturnValueOnce(oldGroups.promise)
        .mockResolvedValueOnce([sourceGroup(4)]),
    } as unknown as EditorViews);
    const staleSources = sourceNav.load(1);
    await sourceNav.load(2);
    oldGroups.resolve([sourceGroup(3)]);
    await staleSources;
    expect(sourceNav.taskId).toBe(2);
    expect(sourceNav.groups.elements.map(({ id }) => id)).toEqual([4]);
    expect(sourceNav.group?.id).toBe(4);
  });
});

describe("EditableFrame", () => {
  it("publishes successful mutations and preserves local state when the backend rejects", async () => {
    const updateFrameLastViewedAt = vi.fn().mockResolvedValue(undefined);
    const updateFrameIsComplete = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("conflict"));
    const views = {
      updateFrameLastViewedAt,
      updateFrameIsComplete,
    } as unknown as EditorViews;
    const editable = frame(views, 1, 0, 10);
    const listener = vi.fn();
    editable.addEventListener("edit", listener);

    await editable.updateLastViewedAt();
    expect(editable.last_viewed_at).not.toBeNull();
    await editable.updateIsComplete(true);
    expect(editable.is_complete).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
    await expect(editable.updateIsComplete(false)).rejects.toThrow("conflict");
    expect(editable.is_complete).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  describe("frame-status races", () => {
    /** Serves one held response per call; the test settles each in order. */
    function heldResponses() {
      const pending: {
        promise: Promise<void>;
        resolve: () => void;
        reject: (error: unknown) => void;
      }[] = [];
      const updateFrameIsComplete = vi.fn(() => {
        let resolve!: () => void;
        let reject!: (error: unknown) => void;
        const promise = new Promise<void>((res, rej) => {
          resolve = res;
          reject = rej;
        });
        pending.push({ promise, resolve, reject });
        return promise;
      });
      return { updateFrameIsComplete, pending };
    }

    it("serializes rapid toggles so the last input wins", async () => {
      const { updateFrameIsComplete, pending } = heldResponses();
      const views = { updateFrameIsComplete } as unknown as EditorViews;
      const editable = frame(views, 1, 0, 10);
      const listener = vi.fn();
      editable.addEventListener("edit", listener);

      // incomplete -> complete -> incomplete before the first request settles.
      const first = editable.updateIsComplete(true);
      const second = editable.updateIsComplete(false);

      await vi.waitFor(() => expect(pending).toHaveLength(1));
      // The second update waits for the first instead of racing it.
      expect(updateFrameIsComplete).toHaveBeenCalledTimes(1);
      expect(editable.is_complete).toBe(false);

      pending[0].resolve();
      await vi.waitFor(() => expect(pending).toHaveLength(2));
      expect(editable.is_complete).toBe(true);
      expect(listener).toHaveBeenCalledTimes(1);

      pending[1].resolve();
      await Promise.all([first, second]);

      // The backend saw both transitions in order; the final state is
      // the last requested value.
      expect(
        updateFrameIsComplete.mock.calls.map(([frameId, value]) => [
          frameId,
          value,
        ]),
      ).toEqual([
        [1, true],
        [1, false],
      ]);
      expect(editable.is_complete).toBe(false);
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it("dedupes a redundant toggle queued behind an identical in-flight one", async () => {
      const { updateFrameIsComplete, pending } = heldResponses();
      const views = { updateFrameIsComplete } as unknown as EditorViews;
      const editable = frame(views, 1, 0, 10);

      const first = editable.updateIsComplete(true);
      const duplicate = editable.updateIsComplete(true);

      await vi.waitFor(() => expect(pending).toHaveLength(1));
      pending[0].resolve();
      await Promise.all([first, duplicate]);

      // The duplicate found the value already applied and sent nothing.
      expect(updateFrameIsComplete).toHaveBeenCalledTimes(1);
      expect(editable.is_complete).toBe(true);
    });

    it("keeps the local state on a failed toggle and lets the next toggle proceed", async () => {
      const { updateFrameIsComplete, pending } = heldResponses();
      const views = { updateFrameIsComplete } as unknown as EditorViews;
      const editable = frame(views, 1, 0, 10);
      const listener = vi.fn();
      editable.addEventListener("edit", listener);

      const failed = editable.updateIsComplete(true);
      await vi.waitFor(() => expect(pending).toHaveLength(1));
      pending[0].reject(new Error("conflict"));
      await expect(failed).rejects.toThrow("conflict");

      expect(editable.is_complete).toBe(false);
      expect(listener).not.toHaveBeenCalled();

      // The failure does not poison the queue: the retry proceeds.
      const retry = editable.updateIsComplete(true);
      await vi.waitFor(() => expect(pending).toHaveLength(2));
      pending[1].resolve();
      await retry;

      expect(updateFrameIsComplete).toHaveBeenCalledTimes(2);
      expect(editable.is_complete).toBe(true);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("drops a queued toggle superseded by an earlier failure back to the same value", async () => {
      const { updateFrameIsComplete, pending } = heldResponses();
      const views = { updateFrameIsComplete } as unknown as EditorViews;
      const editable = frame(views, 1, 0, 10);

      // true (will fail) then false: after the failure the value is
      // still false, so the queued false update becomes a no-op.
      const failed = editable.updateIsComplete(true);
      const superseded = editable.updateIsComplete(false);

      await vi.waitFor(() => expect(pending).toHaveLength(1));
      pending[0].reject(new Error("conflict"));
      await expect(failed).rejects.toThrow("conflict");
      await superseded;

      expect(updateFrameIsComplete).toHaveBeenCalledTimes(1);
      expect(editable.is_complete).toBe(false);
    });
  });
});

describe("LabelsetNavigator and FrameNavigator", () => {
  function branch(id: number, dirty = false) {
    return Object.assign(new (class extends EventTarget {})(), {
      id,
      hasUnsavedChanges: dirty,
      hash: () => JSON.stringify(id),
      equals: (other: any) => other?.id === id,
    }) as unknown as EditableBranch;
  }

  it("caches editable branch identity across task reloads and reports dirty branches", async () => {
    const first = branch(3, true);
    const create = vi.spyOn(EditableBranch, "create").mockResolvedValue(first);
    const views = {
      getLabelBranches: vi.fn().mockResolvedValue([{ id: 3 }]),
    } as unknown as EditorViews;
    const nav = new LabelsetNavigator(views);
    await nav.load(1);
    expect(nav.branch).toBe(first);
    expect(nav.hasUnsavedChanges).toBe(true);
    await nav.load(null);
    expect(nav.branch).toBeNull();
    await nav.load(1);
    expect(nav.branch).toBe(first);
    expect(create).toHaveBeenCalledOnce();
  });

  it("does not publish a stale concurrent labelset rebuild", async () => {
    const oldBranches = deferred<{ id: number }[]>();
    vi.spyOn(EditableBranch, "create").mockImplementation(
      async (_views, data: any) => branch(data.id),
    );
    const views = {
      getLabelBranches: vi
        .fn()
        .mockReturnValueOnce(oldBranches.promise)
        .mockResolvedValueOnce([{ id: 4 }]),
    } as unknown as EditorViews;
    const nav = new LabelsetNavigator(views);
    const staleLoad = nav.load(1);
    await nav.load(2);
    oldBranches.resolve([{ id: 3 }]);
    await staleLoad;

    expect(nav.taskId).toBe(2);
    expect(nav.branches.elements.map(({ id }) => id)).toEqual([4]);
    expect(nav.branch?.id).toBe(4);
  });

  it("keeps a coherent tuple when overlapping branch rebuilds complete in reverse order", async () => {
    vi.spyOn(EditableBranch, "create").mockImplementation(
      async (_views, data: any) => branch(data.id),
    );
    const byBranch: Record<number, FrameState[]> = {
      11: [frame({} as EditorViews, 110, 0, 10).toState()],
      12: [frame({} as EditorViews, 120, 0, 20).toState()],
      13: [
        frame({} as EditorViews, 130, 0, 30).toState(),
        frame({} as EditorViews, 131, 0, 40).toState(),
      ],
    };
    const second = deferred<FrameState[]>();
    const third = deferred<FrameState[]>();
    const views = {
      listTasks: vi.fn().mockResolvedValue([task(1)]),
      getSourceGroups: vi.fn().mockResolvedValue([sourceGroup(2)]),
      getLabelBranches: vi
        .fn()
        .mockResolvedValue([{ id: 11 }, { id: 12 }, { id: 13 }]),
      getFrames: vi.fn(
        (_taskId: number, _groupId: number, branchId: number) => {
          if (branchId === 12) return second.promise;
          if (branchId === 13) return third.promise;
          return Promise.resolve(byBranch[11]);
        },
      ),
    } as unknown as EditorViews;
    const nav = await FrameNavigator.create(views);
    await nav.loadTaskById(1);
    expect(nav.frameId).toBe(110);

    const branch12 = nav.labelBranches.elements.find(({ id }) => id === 12)!;
    const branch13 = nav.labelBranches.elements.find(({ id }) => id === 13)!;
    const loadB12 = nav.loadLabelBranch(branch12);
    const loadB13 = nav.loadLabelBranch(branch13);

    // Responses arrive in reverse order of the requests.
    third.resolve(byBranch[13]);
    await loadB13;
    second.resolve(byBranch[12]);
    await loadB12;

    expect(nav.labelBranch?.id).toBe(13);
    expect(nav.labelBranchId).toBe(13);
    expect(nav.sourceGroupId).toBe(2);
    expect(nav.frames.elements.map(({ id }) => id)).toEqual([130, 131]);
    expect(nav.frameId).toBe(130);
    nav.dispose();
  });

  it("composes task/source/label/frame navigation and falls back from a stale restored frame ID", async () => {
    const editableBranch = branch(3);
    vi.spyOn(EditableBranch, "create").mockResolvedValue(editableBranch);
    const rawFrames = [
      frame({} as EditorViews, 10, 0, 10).toState(),
      frame({} as EditorViews, 11, 0, 20).toState(),
    ];
    const views = {
      listTasks: vi.fn().mockResolvedValue([task(1)]),
      getSourceGroups: vi.fn().mockResolvedValue([sourceGroup(2)]),
      getLabelBranches: vi.fn().mockResolvedValue([{ id: 3 }]),
      getFrames: vi.fn().mockResolvedValue(rawFrames),
    } as unknown as EditorViews;
    const nav = await FrameNavigator.create(views);
    await nav.loadTaskById(1);
    expect(nav.taskId).toBe(1);
    expect(nav.sourceGroup?.id).toBe(2);
    expect(nav.labelBranch?.id).toBe(3);
    expect(nav.frameId).toBe(10);
    await nav.loadFrameById(11);
    expect(nav.frameId).toBe(11);
    await nav.loadSceneSelection(nav.sourceGroup, nav.labelBranch, 999);
    expect(nav.frameId).toBe(10);
    nav.dispose();
  });

  /**
   * Serves a single task whose scene holds frames 10 and 11, deliberately with
   * ascending ids but descending timestamps.
   */
  function createTaskViews() {
    const rawFrames = [
      frame({} as EditorViews, 10, 0, 20).toState(),
      frame({} as EditorViews, 11, 0, 10).toState(),
    ];
    return {
      listTasks: vi.fn().mockResolvedValue([task(1)]),
      getSourceGroups: vi.fn().mockResolvedValue([sourceGroup(2)]),
      getLabelBranches: vi.fn().mockResolvedValue([{ id: 3 }]),
      getFrames: vi.fn().mockResolvedValue(rawFrames),
    } as unknown as EditorViews;
  }

  it("loads a task's selectors without displaying a frame, then opens the requested frame", async () => {
    vi.spyOn(EditableBranch, "create").mockResolvedValue(branch(3));
    const nav = await FrameNavigator.create(createTaskViews());

    await nav.loadTaskSelectors(task(1));

    // Every selector the frame resolution needs is loaded, and the scene's
    // frames are available for it to choose from, yet nothing is displayed.
    expect(nav.taskId).toBe(1);
    expect(nav.sourceGroup?.id).toBe(2);
    expect(nav.labelBranch?.id).toBe(3);
    expect(nav.frames.elements.map(({ id }) => id)).toEqual([10, 11]);
    expect(nav.frameId).toBeNull();

    await nav.loadSceneSelection(nav.sourceGroup, nav.labelBranch, 11);
    expect(nav.frameId).toBe(11);
    nav.dispose();
  });

  it("displays the scene's first frame when a task load is not deferred", async () => {
    vi.spyOn(EditableBranch, "create").mockResolvedValue(branch(3));
    const nav = await FrameNavigator.create(createTaskViews());

    await nav.loadTask(task(1));

    expect(nav.frameId).toBe(10);
    nav.dispose();
  });
});
