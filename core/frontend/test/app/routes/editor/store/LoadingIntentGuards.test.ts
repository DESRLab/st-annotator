import { describe, expect, it, vi } from "vitest";

import { HistoryItemStatus } from "../../../../../app/routes/editor";
import type { CommitID } from "../../../../../app/routes/editor";
import type { EditorRuntime } from "../../../../../app/routes/editor/runtime";
import { createEditorIntents } from "../../../../../app/routes/editor/store/createEditorIntents";
import { markErrorSurfaced } from "../../../../../app/errors";

/**
 * Builds a runtime mock whose scene context is in the given loading shape.
 * The default mirrors the initial runtime mount: no task, source group,
 * label branch, or frame has been loaded yet.
 */
function createRuntime(
  overrides: {
    context?: Record<string, unknown>;
    layers?: Record<string, unknown>;
    layersByKey?: Record<string, unknown>;
  } = {},
) {
  const context = {
    currentTaskId: null as number | null,
    currentTask: null,
    currentLabelBranch: null as {
      hasUnsavedChanges: boolean;
      isUpdating: boolean;
      pushActive: ReturnType<typeof vi.fn>;
      getHistory: () => {
        id: CommitID;
        status: string;
        isSavepoint: boolean;
      }[];
      rebase: ReturnType<typeof vi.fn>;
    } | null,
    currentFrame: null as {
      updateIsComplete: ReturnType<typeof vi.fn>;
    } | null,
    tasks: { elements: [] },
    sourceGroups: { elements: [] as { id: number }[] },
    labelBranches: { elements: [] as { id: number }[] },
    displayTaskById: vi.fn().mockResolvedValue(undefined),
    displaySourceGroup: vi.fn().mockResolvedValue(undefined),
    displayLabelBranch: vi.fn().mockResolvedValue(undefined),
    ...overrides.context,
  };
  const layers = {
    activateLayer: vi.fn(),
    setLayerEnabled: vi.fn(),
    setAllLayersEnabled: vi.fn(),
    ...overrides.layers,
  };
  return {
    context,
    layers,
    runtime: {
      app: {},
      context,
      layers,
      layersByKey: overrides.layersByKey ?? {},
    } as unknown as EditorRuntime,
  };
}

function createDirtyBranch(
  overrides: {
    hasUnsavedChanges?: boolean;
    isUpdating?: boolean;
    history?: { id: CommitID; status: string; isSavepoint: boolean }[];
  } = {},
) {
  class FakeCommitID {}
  const history = overrides.history ?? [];
  return {
    FakeCommitID,
    branch: {
      hasUnsavedChanges: overrides.hasUnsavedChanges ?? true,
      isUpdating: overrides.isUpdating ?? false,
      pushActive: vi.fn().mockResolvedValue(undefined),
      rebase: vi.fn().mockResolvedValue(undefined),
      getHistory: () => history,
    },
  };
}

describe("createEditorIntents loading guards", () => {
  it("makes write intents safe no-ops during the initial runtime mount", () => {
    const { context, runtime } = createRuntime();
    const intents = createEditorIntents(runtime);

    // No task, source group, branch, or frame is loaded yet; write
    // intents must not throw nor dispatch any mutation.
    expect(() => intents.saveLabelset()).not.toThrow();
    expect(() => intents.setFrameStatus(true)).not.toThrow();
    expect(() =>
      intents.rebaseLabelset(new (class {})() as CommitID),
    ).not.toThrow();

    expect(context.displaySourceGroup).not.toHaveBeenCalled();
    expect(context.displayLabelBranch).not.toHaveBeenCalled();
  });

  it("resolves unknown selections to a clear instead of a stale navigation", async () => {
    const sourceGroup = { id: 1 };
    const branch = { id: 2 };
    const { context, runtime } = createRuntime({
      context: {
        sourceGroups: { elements: [sourceGroup] },
        labelBranches: { elements: [branch] },
      },
    });
    const intents = createEditorIntents(runtime);

    // Selections whose id is not part of the loaded index never reach
    // the navigators as-is; they resolve to `null` (a clear).
    intents.setSourceGroup(999);
    intents.setLabelBranch(999);
    expect(context.displaySourceGroup).toHaveBeenCalledWith(null);
    expect(context.displayLabelBranch).toHaveBeenCalledWith(null);

    intents.setSourceGroup(1);
    intents.setLabelBranch(2);
    intents.setTask(3);
    expect(context.displaySourceGroup).toHaveBeenLastCalledWith(sourceGroup);
    expect(context.displayLabelBranch).toHaveBeenLastCalledWith(branch);
    expect(context.displayTaskById).toHaveBeenCalledWith(3);
  });

  it("routes frame status through the current frame only when one is loaded", () => {
    const frame = {
      updateIsComplete: vi.fn().mockResolvedValue(undefined),
    };
    const { runtime } = createRuntime({ context: { currentFrame: frame } });
    const intents = createEditorIntents(runtime);

    intents.setFrameStatus(true);
    expect(frame.updateIsComplete).toHaveBeenCalledWith(true);
  });

  it("saves the label branch only when it is loaded, dirty, and idle", () => {
    const { branch } = createDirtyBranch();
    const { runtime } = createRuntime({
      context: { currentTaskId: 4, currentLabelBranch: branch },
    });
    const intents = createEditorIntents(runtime);

    intents.saveLabelset();
    expect(branch.pushActive).toHaveBeenCalledWith(4);

    branch.pushActive.mockClear();
    branch.hasUnsavedChanges = false;
    intents.saveLabelset();
    expect(branch.pushActive).not.toHaveBeenCalled();

    branch.hasUnsavedChanges = true;
    branch.isUpdating = true;
    intents.saveLabelset();
    expect(branch.pushActive).not.toHaveBeenCalled();

    // Without a loaded task there is nothing to push into.
    branch.isUpdating = false;
    const { runtime: noTaskRuntime } = createRuntime({
      context: { currentLabelBranch: branch },
    });
    createEditorIntents(noTaskRuntime).saveLabelset();
    expect(branch.pushActive).not.toHaveBeenCalled();
  });

  it("rebases only loaded history entries that may be re-applied", () => {
    const savedId = new (class {})() as CommitID;
    const activeId = new (class {})() as CommitID;
    const { branch } = createDirtyBranch({
      history: [
        {
          id: savedId,
          status: HistoryItemStatus.SAVED,
          isSavepoint: false,
        },
        {
          id: activeId,
          status: HistoryItemStatus.ACTIVE,
          isSavepoint: true,
        },
      ],
    });
    const { runtime } = createRuntime({
      context: { currentLabelBranch: branch },
    });
    const intents = createEditorIntents(runtime);

    intents.rebaseLabelset(new (class {})() as CommitID);
    expect(branch.rebase).not.toHaveBeenCalled();

    // Saved non-savepoint entries cannot be re-applied locally.
    intents.rebaseLabelset(savedId);
    expect(branch.rebase).not.toHaveBeenCalled();

    intents.rebaseLabelset(activeId);
    expect(branch.rebase).toHaveBeenCalledWith(activeId);
  });

  it("reports rejected fire-and-forget rebases", async () => {
    const activeId = new (class {})() as CommitID;
    const failure = new Error("undo failed");
    const { branch } = createDirtyBranch({
      history: [
        {
          id: activeId,
          status: HistoryItemStatus.ACTIVE,
          isSavepoint: true,
        },
      ],
    });
    branch.rebase.mockRejectedValue(failure);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { runtime } = createRuntime({
      context: { currentLabelBranch: branch },
    });

    createEditorIntents(runtime).rebaseLabelset(activeId);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(error).toHaveBeenCalledWith(
      "Failed to rebase the labelset:",
      failure,
    );
  });

  it("does not start a rebase while the branch is saving", () => {
    const activeId = new (class {})() as CommitID;
    const { branch } = createDirtyBranch({
      isUpdating: true,
      history: [
        {
          id: activeId,
          status: HistoryItemStatus.ACTIVE,
          isSavepoint: true,
        },
      ],
    });
    const { runtime } = createRuntime({
      context: { currentLabelBranch: branch },
    });
    const intents = createEditorIntents(runtime);

    // The savepoint can move underneath a rebase while a save is in
    // flight, so history navigation is blocked until it settles.
    intents.rebaseLabelset(activeId);
    expect(branch.rebase).not.toHaveBeenCalled();
  });

  it("forwards layer intents and merges plugin intent groups from contributor layers", () => {
    const annotationLayer = {
      createEditorIntents: vi.fn(() => ({
        annotations: { setAction: vi.fn() },
      })),
    };
    const dataLayer = { name: "Source Data" };
    const geometryLayer = {
      createEditorIntents: vi.fn(() => ({
        geometry: { selectItem: vi.fn() },
      })),
    };
    const { layers, runtime } = createRuntime({
      layersByKey: {
        annotations: annotationLayer,
        data: dataLayer,
        geometry: geometryLayer,
      },
    });
    const intents = createEditorIntents(runtime) as ReturnType<
      typeof createEditorIntents
    > & {
      annotations: { setAction: ReturnType<typeof vi.fn> };
      geometry: { selectItem: ReturnType<typeof vi.fn> };
    };

    // Each contributor builds its group exactly once, receiving the runtime.
    expect(annotationLayer.createEditorIntents).toHaveBeenCalledWith(runtime);
    expect(geometryLayer.createEditorIntents).toHaveBeenCalledWith(runtime);

    intents.annotations.setAction("draw");
    expect(
      annotationLayer.createEditorIntents.mock.results[0].value.annotations
        .setAction,
    ).toHaveBeenCalledWith("draw");
    intents.geometry.selectItem("item-1");
    expect(
      geometryLayer.createEditorIntents.mock.results[0].value.geometry
        .selectItem,
    ).toHaveBeenCalledWith("item-1");

    // Base intents still reach the layer collection.
    intents.activateLayer("annotations");
    intents.setLayerEnabled("data", false);
    intents.setAllLayersEnabled(true);
    expect(layers.activateLayer).toHaveBeenCalledWith("annotations");
    expect(layers.setLayerEnabled).toHaveBeenCalledWith("data", false);
    expect(layers.setAllLayersEnabled).toHaveBeenCalledWith(true);
  });
});

describe("createEditorIntents failure attribution", () => {
  it("surfaces a rejected save to the user instead of only the console", async () => {
    const failure = new Error("409: branch head changed");
    const { branch } = createDirtyBranch();
    branch.pushActive.mockRejectedValue(failure);
    const alert = vi.fn();
    vi.stubGlobal("alert", alert);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { runtime } = createRuntime({
      context: { currentTaskId: 4, currentLabelBranch: branch },
    });

    createEditorIntents(runtime).saveLabelset();
    // Let the rejected push settle through the intent's catch.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // A failed push keeps the branch dirty and re-enables saving, so the user
    // has to be told: without this alert a save that never landed looks
    // exactly like one that did.
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][0]).toContain("Failed to save changes.");
    expect(alert.mock.calls[0][0]).toContain(failure.message);
    expect(error).toHaveBeenCalledWith("Failed to save the labelset:", failure);

    error.mockRestore();
    vi.unstubAllGlobals();
  });

  it("stays silent when the transport already surfaced the failure", async () => {
    const failure = new Error("409: branch head changed");
    markErrorSurfaced(failure);
    const { branch } = createDirtyBranch();
    branch.pushActive.mockRejectedValue(failure);
    const alert = vi.fn();
    vi.stubGlobal("alert", alert);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { runtime } = createRuntime({
      context: { currentTaskId: 4, currentLabelBranch: branch },
    });

    createEditorIntents(runtime).saveLabelset();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The push transport alerts and logs before rethrowing, so a second report
    // here would stack an identical modal on top of the first.
    expect(alert).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();

    error.mockRestore();
    vi.unstubAllGlobals();
  });

  it("reports a failed frame-status update instead of dropping the rejection", async () => {
    const failure = new Error("frame status rejected");
    const frame = { updateIsComplete: vi.fn().mockRejectedValue(failure) };
    const { runtime } = createRuntime({ context: { currentFrame: frame } });
    const intents = createEditorIntents(runtime);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    intents.setFrameStatus(true);
    // Let the rejected update settle through the intent's catch.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(frame.updateIsComplete).toHaveBeenCalledWith(true);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]).toContain(failure);
    errorSpy.mockRestore();
  });
});
