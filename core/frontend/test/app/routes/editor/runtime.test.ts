import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadInitialEditorData } from "../../../../app/routes/editor/runtime";
import { readFrameFramesIdGet } from "../../../../client";

vi.mock("../../../../client", () => ({
  readFrameFramesIdGet: vi.fn(),
}));

const GROUP = { id: 7 };
const BRANCH = { id: 9 };

/**
 * Fake app for the initial load.
 *
 * `openedFrameId` is the frame the context ends up displaying, which the mocked
 * display methods cannot derive themselves.
 */
function makeApp({
  groups = [],
  branches = [],
  openedFrameId = null,
}: {
  groups?: unknown[];
  branches?: unknown[];
  openedFrameId?: number | null;
} = {}) {
  const context = {
    views: {},
    tasks: { elements: [{ id: 1 }] },
    currentTaskId: 1,
    currentFrameId: openedFrameId,
    sourceGroups: { elements: groups },
    labelBranches: { elements: branches },
    frames: [{ id: 100 }, { id: 101 }],
    displayTaskSelectors: vi.fn(async () => {}),
    displayTaskById: vi.fn(async () => {}),
    displaySourceGroup: vi.fn(async () => {}),
    displayLabelBranch: vi.fn(async () => {}),
    displayFrame: vi.fn(async () => {}),
    displayFrameById: vi.fn(async () => {}),
    displaySceneSelection: vi.fn(async () => {}),
  };
  const menus = {
    project: {
      playback: {
        sortFunc: { sortedFrames: (frames: unknown[]) => frames },
      },
    },
  };

  return { context, menus };
}

function framePayload(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: 42,
      task_id: 1,
      source_group_id: GROUP.id,
      label_branch_id: BRANCH.id,
      ...overrides,
    },
    error: null,
  } as never;
}

beforeEach(() => {
  vi.mocked(readFrameFramesIdGet).mockReset();
});

describe("loadInitialEditorData", () => {
  it("reads the deep-linked frame while the task is loading", async () => {
    let finishTask!: () => void;
    const taskLoading = new Promise<void>((resolve) => {
      finishTask = resolve;
    });
    let finishFrame!: (value: never) => void;
    const frameLoading = new Promise<never>((resolve) => {
      finishFrame = resolve;
    });
    vi.mocked(readFrameFramesIdGet).mockReturnValue(frameLoading);
    const { context, menus } = makeApp({
      groups: [GROUP],
      branches: [BRANCH],
    });
    context.displayTaskSelectors.mockReturnValue(taskLoading);

    const loading = loadInitialEditorData(
      { mode: "annotate", projectId: 1, taskId: 1, frameId: 42 },
      { context, menus } as never,
    );
    await vi.waitFor(() => expect(readFrameFramesIdGet).toHaveBeenCalledOnce());
    // The task load and the frame read are both in flight: neither waits for
    // the other, and the task step displays no frame of its own.
    expect(context.displayTaskSelectors).toHaveBeenCalledOnce();
    expect(context.displaySceneSelection).not.toHaveBeenCalled();

    finishTask();
    finishFrame({ data: null, error: null } as never);
    expect(await loading).toBe(
      "Frame 42 could not be loaded. No frame is open.",
    );
    expect(context.displaySceneSelection).toHaveBeenCalledOnce();
  });

  it("passes missing source groups and label branches through as null, as on main", async () => {
    vi.mocked(readFrameFramesIdGet).mockResolvedValue(framePayload());
    const { context, menus } = makeApp({ openedFrameId: 42 });

    const notice = await loadInitialEditorData(
      { mode: "annotate", projectId: 1, taskId: 1, frameId: 42 },
      { context, menus } as never,
    );

    expect(context.displaySceneSelection).toHaveBeenCalledWith(null, null, 42);
    expect(context.displayFrame).not.toHaveBeenCalled();
    // The requested frame is the one on screen, so there is nothing to report.
    expect(notice).toBeNull();
  });

  it("displays the loaded frame with its source group and label branch", async () => {
    vi.mocked(readFrameFramesIdGet).mockResolvedValue(framePayload());
    const { context, menus } = makeApp({
      groups: [GROUP],
      branches: [BRANCH],
      openedFrameId: 42,
    });

    const notice = await loadInitialEditorData(
      { mode: "annotate", projectId: 1, taskId: 1, frameId: 42 },
      { context, menus } as never,
    );

    expect(context.displaySceneSelection).toHaveBeenCalledWith(
      GROUP,
      BRANCH,
      42,
    );
    expect(context.displayFrame).not.toHaveBeenCalled();
    expect(notice).toBeNull();
  });

  it("falls back to the first frame when no frame is requested", async () => {
    const { context, menus } = makeApp({
      groups: [GROUP],
      branches: [BRANCH],
      openedFrameId: 100,
    });

    const notice = await loadInitialEditorData(
      { mode: "annotate", projectId: 1, taskId: 1 },
      { context, menus } as never,
    );

    expect(readFrameFramesIdGet).not.toHaveBeenCalled();
    expect(context.displayTaskSelectors).toHaveBeenCalledWith({ id: 1 });
    expect(context.displaySceneSelection).toHaveBeenCalledWith(
      GROUP,
      BRANCH,
      100,
    );
    expect(context.displayFrameById).not.toHaveBeenCalled();
    // Nobody asked for a frame, so opening one needs no explanation.
    expect(notice).toBeNull();
  });

  it("falls back to the first frame when the requested frame belongs to another task", async () => {
    vi.mocked(readFrameFramesIdGet).mockResolvedValue(
      framePayload({ task_id: 2 }),
    );
    const { context, menus } = makeApp({
      groups: [GROUP],
      branches: [BRANCH],
      openedFrameId: 100,
    });

    const notice = await loadInitialEditorData(
      { mode: "annotate", projectId: 1, taskId: 1, frameId: 42 },
      { context, menus } as never,
    );

    // The foreign frame is never displayed: the task step selects no frame, and
    // the selection step redirects to the first frame of the task's own scene.
    expect(context.displayTaskSelectors).toHaveBeenCalledWith({ id: 1 });
    expect(context.displayFrameById).not.toHaveBeenCalled();
    expect(context.displaySceneSelection).toHaveBeenCalledWith(
      GROUP,
      BRANCH,
      100,
    );
    expect(notice).toBe(
      "Frame 42 belongs to another task. Showing frame 100 instead.",
    );
  });

  it("selects the initial frame once, after the task's selectors are loaded", async () => {
    vi.mocked(readFrameFramesIdGet).mockResolvedValue(framePayload());
    const { context, menus } = makeApp({
      groups: [GROUP],
      branches: [BRANCH],
      openedFrameId: 42,
    });

    await loadInitialEditorData(
      { mode: "annotate", projectId: 1, taskId: 1, frameId: 42 },
      { context, menus } as never,
    );

    expect(context.displayTaskSelectors).toHaveBeenCalledOnce();
    expect(context.displaySceneSelection).toHaveBeenCalledOnce();
    // The display path that selects a frame itself is unused, so the load
    // cannot display a frame before the scene selectors are known.
    expect(context.displayTaskById).not.toHaveBeenCalled();
    expect(
      context.displayTaskSelectors.mock.invocationCallOrder[0],
    ).toBeLessThan(context.displaySceneSelection.mock.invocationCallOrder[0]);
  });

  it("reports a frame the loaded scene could not open", async () => {
    vi.mocked(readFrameFramesIdGet).mockResolvedValue(framePayload());
    // The scene selection ends without the requested frame, as it does when the
    // frame's group or branch is missing from the loaded lists.
    const { context, menus } = makeApp({
      groups: [GROUP],
      branches: [BRANCH],
      openedFrameId: null,
    });

    const notice = await loadInitialEditorData(
      { mode: "annotate", projectId: 1, taskId: 1, frameId: 42 },
      { context, menus } as never,
    );

    expect(notice).toBe("Frame 42 could not be opened. No frame is open.");
  });

  it("reports a frame read the transport rejected", async () => {
    vi.mocked(readFrameFramesIdGet).mockRejectedValueOnce(
      new Error("network down"),
    );
    const { context, menus } = makeApp({
      groups: [GROUP],
      branches: [BRANCH],
      openedFrameId: 100,
    });

    const notice = await loadInitialEditorData(
      { mode: "annotate", projectId: 1, taskId: 1, frameId: 42 },
      { context, menus } as never,
    );

    // A rejected read must not be mistaken for an absent request: a frame is
    // displayed that nobody asked for.
    expect(context.displaySceneSelection).toHaveBeenCalledWith(
      GROUP,
      BRANCH,
      100,
    );
    expect(notice).toBe(
      "Frame 42 could not be loaded. Showing frame 100 instead.",
    );
  });
});
