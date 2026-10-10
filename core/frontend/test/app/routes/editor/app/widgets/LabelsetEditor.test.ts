import { describe, expect, it, vi } from "vitest";

import { LabelsetBranchState } from "../../../../../../app/routes/editor/models";

import { LabelsetEditor } from "../../../../../../app/routes/editor/app/widgets/ProjectMenu";
import {
  EditableBranch,
  HistoryItemStatus,
} from "../../../../../../app/routes/editor/labelset";
import type { Operation } from "../../../../../../app/routes/editor/labelset";
import type { EditorViews } from "../../../../../../app/routes/editor/views";

/** An op whose only observable behavior is its local apply/undo calls. */
class RecordingOperation implements Operation<{ value: number }, null> {
  applyCalls = 0;
  undoCalls = 0;

  constructor(readonly displayName: string) {}

  get opName(): string {
    return "test-op";
  }

  get opParams(): { value: number } {
    return { value: 1 };
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

/** Exposes the protected constructor without the async commit-graph load. */
class TestBranch extends EditableBranch {
  static create(views: EditorViews, state: LabelsetBranchState): TestBranch {
    return new TestBranch(views, state);
  }
}

function makeBranchStateJson() {
  return {
    id: 1,
    group: { id: 1, name: "Test Group" },
    name: "main",
    head: {
      group: { id: 1, name: "Test Group" },
      hash_: "head-hash",
      author_id: 0,
      timestamp: "2026-08-13T00:00:00+00:00",
      op_config: { op_name: "open-editor", op_params: null },
    },
  };
}

async function makeEditor(
  taskId: number | null = 1,
): Promise<{ editor: LabelsetEditor; branch: TestBranch }> {
  const views = {
    getCommitGraph: vi.fn().mockResolvedValue(null),
    pushCommits: vi.fn().mockResolvedValue({
      op_results: [],
      branch: LabelsetBranchState.fromJSON(makeBranchStateJson()),
    }),
  } as unknown as EditorViews;
  const branch = TestBranch.create(
    views,
    LabelsetBranchState.fromJSON(makeBranchStateJson()),
  );
  const editor = new LabelsetEditor({ taskId, branch });

  await branch.apply(new RecordingOperation("First Edit"));
  await branch.apply(new RecordingOperation("Second Edit"));

  return { editor, branch };
}

/** Waits for the fire-and-forget rebase scheduled by the editor. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function pushResult() {
  return {
    op_results: [] as unknown[],
    branch: LabelsetBranchState.fromJSON(makeBranchStateJson()),
  };
}

/** Builds an editor whose save requests stay pending until the test settles them. */
async function makeHeldEditor() {
  const firstAttempt = deferred<ReturnType<typeof pushResult>>();
  const retryAttempt = deferred<ReturnType<typeof pushResult>>();
  const pushCommits = vi
    .fn()
    .mockReturnValueOnce(firstAttempt.promise)
    .mockReturnValueOnce(retryAttempt.promise);
  const views = {
    getCommitGraph: vi.fn().mockResolvedValue(null),
    pushCommits: pushCommits,
  } as unknown as EditorViews;
  const branch = TestBranch.create(
    views,
    LabelsetBranchState.fromJSON(makeBranchStateJson()),
  );
  const editor = new LabelsetEditor({ taskId: 1, branch });

  await branch.apply(new RecordingOperation("First Edit"));
  await branch.apply(new RecordingOperation("Second Edit"));

  return { editor, branch, pushCommits, firstAttempt, retryAttempt };
}

describe("LabelsetEditor", () => {
  it("registers the undo/redo/save keybinds by name", () => {
    const editor = new LabelsetEditor({ taskId: null, branch: null });

    const keybinds = [...editor.keydownHandler.iterSubtreeKeybinds()];
    expect(keybinds.map(({ keyCombo, name }) => [keyCombo, name])).toEqual([
      ["ctrl + z", "Undo change"],
      ["ctrl + y", "Redo change"],
      ["ctrl + s", "Save changes"],
    ]);
  });

  it("wires each keybind handler to its action", async () => {
    const { editor } = await makeEditor();

    const stepUndo = vi.spyOn(editor, "stepUndo");
    const stepRedo = vi.spyOn(editor, "stepRedo");
    const save = vi.spyOn(editor, "save");

    const byCombo = new Map(
      [...editor.keydownHandler.iterSubtreeKeybinds()].map((keybind) => [
        keybind.keyCombo,
        keybind,
      ]),
    );
    byCombo.get("ctrl + z")?.handler({} as never);
    byCombo.get("ctrl + y")?.handler({} as never);
    byCombo.get("ctrl + s")?.handler({} as never);
    // Let the fire-and-forget save triggered by the keybind settle.
    await flush();

    expect(stepUndo).toHaveBeenCalledOnce();
    expect(stepRedo).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledOnce();
  });

  it("steps undo and redo through the branch history", async () => {
    const { editor, branch } = await makeEditor();

    expect(branch.getHistory().at(-1)?.isCurrent).toBe(true);

    editor.stepUndo();
    await flush();

    const undone = branch.getHistory();
    expect(undone[1].isCurrent).toBe(true);
    expect(undone[2].status).toBe(HistoryItemStatus.INACTIVE);

    editor.stepRedo();
    await flush();

    const redone = branch.getHistory();
    expect(redone[2].isCurrent).toBe(true);
    expect(redone[2].status).toBe(HistoryItemStatus.ACTIVE);
  });

  it("reports rejected keyboard history navigation", async () => {
    const { editor } = await makeEditor();
    const failure = new Error("undo failed");
    vi.spyOn(editor, "rebaseHistoryItem").mockRejectedValue(failure);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    editor.stepUndo();
    await flush();

    expect(error).toHaveBeenCalledWith(
      "Failed to undo labelset change:",
      failure,
    );
  });

  it("does not step past either end of the history", async () => {
    const { editor, branch } = await makeEditor();

    editor.stepUndo();
    await flush();
    editor.stepUndo();
    await flush();
    // Both edits can be undone, landing on the Open Editor dummy commit;
    // stepUndo never steps below it.
    expect(branch.getHistory()[0].isCurrent).toBe(true);

    editor.stepUndo();
    await flush();
    expect(branch.getHistory()[0].isCurrent).toBe(true);

    editor.stepRedo();
    await flush();
    editor.stepRedo();
    await flush();
    editor.stepRedo();
    await flush();
    expect(branch.getHistory().at(-1)?.isCurrent).toBe(true);
  });

  it("skips SAVED non-savepoint items when rebasing from the history panel", async () => {
    const pushCommits = vi.fn().mockResolvedValue({
      op_results: [],
      branch: LabelsetBranchState.fromJSON(makeBranchStateJson()),
    });
    const views = {
      getCommitGraph: vi.fn().mockResolvedValue(null),
      pushCommits: pushCommits,
    } as unknown as EditorViews;
    const branch = TestBranch.create(
      views,
      LabelsetBranchState.fromJSON(makeBranchStateJson()),
    );
    const editor = new LabelsetEditor({ taskId: 1, branch });

    // Save the first edit so the dummy commit becomes a SAVED non-savepoint,
    // then apply a second (active) edit on top.
    await branch.apply(new RecordingOperation("Saved Edit"));
    await branch.pushActive(1);
    await branch.apply(new RecordingOperation("Active Edit"));

    const staleSavedItem = branch.getHistory()[0];
    expect(staleSavedItem.status).toBe(HistoryItemStatus.SAVED);
    expect(staleSavedItem.isSavepoint).toBe(false);

    await editor.rebaseHistoryItem(staleSavedItem);
    await flush();

    // The item is skipped, so the active edit stays current and nothing
    // was pushed again.
    expect(branch.getHistory().at(-1)?.isCurrent).toBe(true);
    expect(pushCommits).toHaveBeenCalledOnce();
  });

  it("saves only when a task is open and the branch has unsaved changes", async () => {
    const pushCommits = vi.fn().mockResolvedValue({
      op_results: [],
      branch: LabelsetBranchState.fromJSON(makeBranchStateJson()),
    });
    const views = {
      getCommitGraph: vi.fn().mockResolvedValue(null),
      pushCommits: pushCommits,
    } as unknown as EditorViews;
    const branch = TestBranch.create(
      views,
      LabelsetBranchState.fromJSON(makeBranchStateJson()),
    );

    const editor = new LabelsetEditor({ taskId: null, branch });
    await branch.apply(new RecordingOperation("First Edit"));

    // Unsaved changes exist, but no task is open, so saving is refused.
    expect(editor.isSaveDisabled).toBe(false);
    editor.save();
    await flush();
    expect(pushCommits).not.toHaveBeenCalled();

    editor.state = { taskId: 1, branch };
    expect(editor.isSaveDisabled).toBe(false);
    editor.save();
    await flush();
    expect(pushCommits).toHaveBeenCalledOnce();
    expect(branch.hasUnsavedChanges).toBe(false);
  });

  it("saves once when save is double-invoked from two UI routes in the same tick", async () => {
    const { editor, branch, pushCommits, firstAttempt } =
      await makeHeldEditor();

    // The button route and the keybind route fire before any re-render.
    editor.save();
    editor.keydownHandler.handle({ keyCombo: "ctrl + s" } as never);

    expect(editor.isSaving).toBe(true);
    await vi.waitFor(() => expect(pushCommits).toHaveBeenCalledTimes(1));

    firstAttempt.resolve(pushResult());
    await flush();

    expect(pushCommits).toHaveBeenCalledTimes(1);
    expect(editor.isSaving).toBe(false);
    expect(branch.hasUnsavedChanges).toBe(false);

    // Exactly one transition of the history to saved.
    const history = branch.getHistory();
    expect(
      history.filter((item) => item.status === HistoryItemStatus.SAVED),
    ).toHaveLength(3);
    expect(history.at(-1)?.isSavepoint).toBe(true);
    expect(history.at(-1)?.isCurrent).toBe(true);
  });

  it("accepts exactly one retry after a rejected save", async () => {
    const conflict = new Error("409: branch head changed");
    const { editor, branch, pushCommits, firstAttempt, retryAttempt } =
      await makeHeldEditor();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    editor.save();
    editor.save();
    await vi.waitFor(() => expect(pushCommits).toHaveBeenCalledTimes(1));

    firstAttempt.reject(conflict);
    await flush();

    // The failure is reported, and leaves the branch dirty and the editor idle.
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]).toContain(conflict);
    expect(branch.hasUnsavedChanges).toBe(true);
    expect(editor.isSaving).toBe(false);
    expect(editor.isSaveDisabled).toBe(false);

    // A double-invoked retry still sends exactly one request.
    editor.save();
    editor.clickSaveButton();
    await vi.waitFor(() => expect(pushCommits).toHaveBeenCalledTimes(2));

    retryAttempt.resolve(pushResult());
    await flush();

    expect(pushCommits).toHaveBeenCalledTimes(2);
    expect(branch.hasUnsavedChanges).toBe(false);
    expect(branch.getHistory().at(-1)?.status).toBe(HistoryItemStatus.SAVED);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    errorSpy.mockRestore();
  });

  it("blocks undo/redo while a save is in flight and unblocks new edits after it settles", async () => {
    const { editor, branch, pushCommits, firstAttempt } =
      await makeHeldEditor();

    editor.save();
    await vi.waitFor(() => expect(pushCommits).toHaveBeenCalledTimes(1));

    const currentIdxBefore = branch
      .getHistory()
      .findIndex((item) => item.isCurrent);
    editor.stepUndo();
    editor.stepRedo();
    await flush();

    // Nothing was queued against the in-flight save.
    expect(branch.getHistory().findIndex((item) => item.isCurrent)).toBe(
      currentIdxBefore,
    );
    expect(branch.hasUnsavedChanges).toBe(true);

    firstAttempt.resolve(pushResult());
    await flush();
    expect(
      branch
        .getHistory()
        .every((item) => item.status === HistoryItemStatus.SAVED),
    ).toBe(true);

    // Once settled, new edits can be undone again (down to the savepoint).
    await branch.apply(new RecordingOperation("Third Edit"));
    editor.stepUndo();
    await flush();

    const history = branch.getHistory();
    expect(history.at(-1)?.status).toBe(HistoryItemStatus.INACTIVE);
    expect(history[2].isCurrent).toBe(true);
    expect(history[2].isSavepoint).toBe(true);
  });
});
