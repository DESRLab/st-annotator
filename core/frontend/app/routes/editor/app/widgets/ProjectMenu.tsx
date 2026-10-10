import { HistoryItemStatus } from "../../labelset";
import type { EditableBranch, HistoryItem } from "../../labelset";
import type { SceneContext } from "../../scene";
import { FramePlayback } from "../FramePlayback";
import { ComposableKeybindHandler } from "../Keybinds";
import type { Keybind } from "../Keybinds";

export interface LabelsetEditorState {
  taskId: number | null;
  branch: EditableBranch | null;
}

/**
 * Enables the user to edit the history of a labelset.
 *
 * Owns only the labelset keybinds and their actions; the labelset UI state is
 * read from the editor state snapshot (`labelset` slice) and written through
 * the editor intents.
 */
export class LabelsetEditor {
  keydownHandler: ComposableKeybindHandler;
  keyupHandler: ComposableKeybindHandler;

  #state: LabelsetEditorState;

  get state(): LabelsetEditorState {
    return this.#state;
  }

  set state(value: LabelsetEditorState) {
    if (this.#state === value) return;

    this.#state = value;
  }

  get isSaving(): boolean {
    return this.#state.branch?.isUpdating ?? false;
  }

  get isNavigationDisabled(): boolean {
    return this.#state.branch == null || this.#state.branch.isUpdating;
  }

  get isSaveDisabled(): boolean {
    return this.#state.branch == null || !this.#state.branch.hasUnsavedChanges;
  }

  async rebaseHistoryItem(historyItem: HistoryItem): Promise<void> {
    // While a save is in flight the savepoint can move underneath a
    // queued rebase; history navigation is blocked until it settles.
    if (this.isNavigationDisabled) return;

    const { id, status, isSavepoint } = historyItem;
    if (status === HistoryItemStatus.SAVED && !isSavepoint) return;

    await this.state.branch?.rebase(id);
  }

  KEYDOWN_BINDS: readonly Keybind[] = [
    {
      keyCombo: "ctrl + z",
      name: "Undo change",
      handler: (): void => {
        this.stepUndo();
      },
    },
    {
      keyCombo: "ctrl + y",
      name: "Redo change",
      handler: (): void => {
        this.stepRedo();
      },
    },
    {
      keyCombo: "ctrl + s",
      name: "Save changes",
      handler: (): void => {
        this.clickSaveButton();
      },
    },
  ];

  constructor(state: LabelsetEditorState) {
    this.#state = state;
    this.keydownHandler = new ComposableKeybindHandler();
    this.keyupHandler = new ComposableKeybindHandler();
    for (const keybind of this.KEYDOWN_BINDS) {
      this.keydownHandler.register(keybind);
    }
  }

  dispose(): void {
    this.keydownHandler.dispose();
    this.keyupHandler.dispose();
  }

  stepUndo(): void {
    const history = this.state.branch?.getHistory() ?? [];
    const currentIdx = history.findIndex(
      (historyItem) => historyItem.isCurrent,
    );
    if (currentIdx === -1 || currentIdx === 0) return;
    this.rebaseHistoryItem(history[currentIdx - 1]).catch((error) =>
      console.error("Failed to undo labelset change:", error),
    );
  }

  stepRedo(): void {
    const history = this.state.branch?.getHistory() ?? [];
    const currentIdx = history.findIndex(
      (historyItem) => historyItem.isCurrent,
    );
    if (currentIdx === -1 || currentIdx === history.length - 1) return;
    this.rebaseHistoryItem(history[currentIdx + 1]).catch((error) =>
      console.error("Failed to redo labelset change:", error),
    );
  }

  save(): void {
    const { taskId, branch } = this.state;
    if (
      taskId == null ||
      branch == null ||
      this.isSaving ||
      this.isSaveDisabled
    )
      return;
    // A failed push keeps the branch dirty and re-enables saving; report
    // the error instead of letting the fire-and-forget push escape unhandled.
    branch
      .pushActive(taskId)
      .catch((error) => console.error("Failed to save the labelset:", error));
  }

  clickSaveButton(): void {
    this.save();
  }
}

/**
 * Allows the user to navigate the currently open project.
 *
 * Owns the navigation keybinds, the frame playback and the labelset editor;
 * the Project panel UI state is read from the editor state snapshot and
 * written through the editor intents.
 */
export class ProjectMenu {
  readonly labelsetEditor: LabelsetEditor;
  readonly keydownHandler = new ComposableKeybindHandler();
  readonly keyupHandler = new ComposableKeybindHandler();

  #playback: FramePlayback;

  /**
   * Represents the active scene.
   */
  readonly context: SceneContext<any>;

  /**
   * Traverses the sequence of frames.
   */
  get playback(): FramePlayback {
    return this.#playback;
  }

  /**
   * `true` if the current frame is complete or `null`; otherwise, `false`.
   */
  get isComplete(): boolean {
    return this.context.currentFrame?.is_complete ?? true;
  }

  /**
   * Whether the frame status input is enabled.
   *
   * The input is enabled when a frame is open and no navigation is in
   * progress.
   */
  get isFrameStatusInputEnabled(): boolean {
    return !this.context.isNavigating && this.context.currentFrame != null;
  }

  /**
   * Updates whether the current frame is complete or not.
   */
  async setIsComplete(value: boolean): Promise<void> {
    await this.context.currentFrame?.updateIsComplete(value);
  }

  /**
   * Handles the event when the active branch is switched to a different one.
   */
  #onNavBranch = (): void => {
    this.labelsetEditor.state = {
      taskId: this.context.currentTaskId,
      branch: this.context.currentLabelBranch,
    };
  };

  #clickStepPrev = (): void => {
    const currentIdx = this.#playback.currentIdx;
    if (
      this.#playback.isPlaying ||
      this.context.isNavigating ||
      currentIdx == null ||
      currentIdx <= 0
    )
      return;

    this.#playback.currentIdx = Math.max(0, currentIdx - 1);
  };

  #clickStepNext = (): void => {
    const currentIdx = this.#playback.currentIdx;
    const maxIdx = this.#playback.path.length - 1;
    if (
      this.#playback.isPlaying ||
      this.context.isNavigating ||
      currentIdx == null ||
      currentIdx >= maxIdx
    )
      return;

    this.#playback.currentIdx = Math.min(maxIdx, currentIdx + 1);
  };

  #clickPlayPause = (): void => {
    if (this.#playback.path.length <= 1) return;
    this.#playback.isPlaying = !this.#playback.isPlaying;
  };

  #cycleStatusAndStepPrev = async (): Promise<void> => {
    await this.cycleStatusAsync();

    this.#clickStepPrev();
  };

  #cycleStatusAndStepNext = async (): Promise<void> => {
    await this.cycleStatusAsync();

    this.#clickStepNext();
  };

  readonly KEYDOWN_BINDS: readonly Keybind[] = [
    {
      keyCombo: "z",
      name: "Step previous frame",
      handler: () => {
        this.#clickStepPrev();
      },
    },
    {
      keyCombo: "shift + z",
      name: "Cycle frame status; step previous frame",
      handler: (): void => {
        void this.#cycleStatusAndStepPrev();
      },
    },
    {
      keyCombo: "c",
      name: "Step next frame",
      handler: () => {
        this.#clickStepNext();
      },
    },
    {
      keyCombo: "shift + c",
      name: "Cycle frame status; step next frame",
      handler: (): void => {
        void this.#cycleStatusAndStepNext();
      },
    },
    {
      keyCombo: "space",
      name: "Play/Pause video",
      handler: (): void => {
        this.#clickPlayPause();
      },
    },
  ];

  /**
   * Creates a new menu for navigating the currently open project.
   *
   */
  constructor(context: SceneContext<any>) {
    for (const keybind of this.KEYDOWN_BINDS) {
      this.keydownHandler.register(keybind);
    }

    this.context = context;

    this.#playback = new FramePlayback(context);

    this.labelsetEditor = new LabelsetEditor({
      taskId: this.context.currentTaskId,
      branch: this.context.currentLabelBranch,
    });
    this.keydownHandler.appendChild(this.labelsetEditor.keydownHandler);
    this.keyupHandler.appendChild(this.labelsetEditor.keyupHandler);

    this.context.addEventListener("nav-label-branch", this.#onNavBranch);
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose(): void {
    this.context.removeEventListener("nav-label-branch", this.#onNavBranch);

    this.labelsetEditor.dispose();
    this.#playback.dispose();

    this.keydownHandler.dispose();
    this.keyupHandler.dispose();
  }

  /**
   * Cycles to the next frame status.
   *
   * This is a no-op if the input is disabled.
   */
  cycleStatus(): void {
    if (!this.isFrameStatusInputEnabled) return;
    // A failed update keeps the frame's local state (and the retry path);
    // report it instead of letting the update escape unhandled.
    this.setIsComplete(!this.isComplete).catch((error) =>
      console.error("Failed to update frame status:", error),
    );
  }

  /**
   * Cycles to the next frame status.
   *
   * This is a no-op if the input is disabled.
   */
  async cycleStatusAsync(): Promise<void> {
    if (!this.isFrameStatusInputEnabled) return;
    try {
      await this.setIsComplete(!this.isComplete);
    } catch (error) {
      console.error("Failed to update frame status:", error);
    }
  }
}
