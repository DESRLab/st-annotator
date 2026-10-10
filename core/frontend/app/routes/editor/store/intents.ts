import type { CommitID } from "../labelset";

/**
 * The base editor intents, shared by every composition: the write-side
 * counterpart of the non-plugin slices of the editor state snapshot.
 *
 * Components never mutate the snapshot or the scene directly: they call these
 * intents, which run through the imperative controllers and notify, and the
 * mapper re-reads the resulting state on the next snapshot.
 */
export interface EditorBaseIntents {
  /** Activates the layer with the given key. */
  activateLayer(key: string): void;
  /** Enables or disables the layer with the given key. */
  setLayerEnabled(key: string, enabled: boolean): void;
  /** Enables or disables every layer of the collection. */
  setAllLayersEnabled(enabled: boolean): void;

  /** Navigates to the task with the given id, or clears the selection. */
  setTask(taskId: number | null): void;
  /** Navigates to the source group with the given id, or clears the selection. */
  setSourceGroup(sourceGroupId: number | null): void;
  /** Navigates to the label branch with the given id, or clears the selection. */
  setLabelBranch(branchId: number | null): void;
  /** Marks the current frame complete or incomplete. */
  setFrameStatus(isComplete: boolean): void;

  /** Saves the unsaved changes of the current label branch. */
  saveLabelset(): void;
  /** Rebases the current label branch onto the history entry with the given id. */
  rebaseLabelset(historyId: CommitID): void;
}

/**
 * The write-side counterpart of the editor state snapshot.
 *
 * `TPluginIntents` merges per-plugin intent groups keyed by layer key
 * (e.g. `intents.myPlugin.setAction(...)`), mirroring how
 * `EditorState<TPluginSlices>` merges the plugin slices into `layers`.
 * It is derived from the layers implementing `EditorIntentsContributor`,
 * discovered structurally at the composition root.
 */
export type EditorIntents<TPluginIntents extends {} = {}> = EditorBaseIntents &
  TPluginIntents;
