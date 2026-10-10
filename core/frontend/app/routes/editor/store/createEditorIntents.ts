import { HistoryItemStatus, isEditorIntentsContributor } from "../index";
import { isErrorSurfaced } from "../../../errors";
import type {
  CommitID,
  EditorIntents,
  EditorIntentsContributor,
} from "../index";
import type { EditorRuntime } from "../runtime";

type IntentsOf<L> =
  L extends EditorIntentsContributor<infer I>
    ? I extends object
      ? I
      : {}
    : {};

type UnionToIntersection<U> = (
  U extends unknown ? (value: U) => void : never
) extends (value: infer I) => void
  ? I
  : never;

/**
 * The plugin intent groups merged into the editor intents, derived from
 * which layers of the runtime implement {@link EditorIntentsContributor}.
 * Each contribution is keyed by its layer key (e.g. `{ myPlugin: ... }`).
 */
type LayerOf<R extends EditorRuntime> =
  R["layersByKey"][keyof R["layersByKey"]];

export type EditorPluginIntents<R extends EditorRuntime = EditorRuntime> =
  UnionToIntersection<IntentsOf<LayerOf<R>>>;

/**
 * Builds the editor intents for a runtime.
 *
 * Intents are the only way the React tree writes editor state: each one runs
 * through the imperative controllers (context navigation, layer collection,
 * label branch, plugin layers), which mutate and notify; the store mapper
 * then re-reads the resulting state.
 *
 * The base intents are fixed; each plugin layer contributes its own intent
 * group through the {@link EditorIntentsContributor} contract, discovered
 * structurally at runtime, no plugin package is imported here.
 */
export function createEditorIntents(
  runtime: EditorRuntime,
): EditorIntents<EditorPluginIntents> {
  const { context, layers, layersByKey } = runtime;
  const reportNavigationFailure = (label: string, error: unknown): void => {
    console.error(`Failed to ${label}:`, error);
    if (!isErrorSurfaced(error)) alert(`Failed to ${label}.\n\n${error}`);
  };

  const pluginIntents: Record<string, unknown> = {};
  for (const layer of Object.values(layersByKey)) {
    if (isEditorIntentsContributor(layer)) {
      Object.assign(pluginIntents, layer.createEditorIntents(runtime));
    }
  }

  return {
    activateLayer(key: string): void {
      layers.activateLayer(key);
    },
    setLayerEnabled(key: string, enabled: boolean): void {
      layers.setLayerEnabled(key, enabled);
    },
    setAllLayersEnabled(enabled: boolean): void {
      layers.setAllLayersEnabled(enabled);
    },

    setTask(taskId: number | null): void {
      void context
        .displayTaskById(taskId)
        .catch((error) => reportNavigationFailure("change task", error));
    },
    setSourceGroup(sourceGroupId: number | null): void {
      const sourceGroup =
        sourceGroupId == null
          ? null
          : (context.sourceGroups.elements.find(
              (candidate) => candidate.id === sourceGroupId,
            ) ?? null);
      void context
        .displaySourceGroup(sourceGroup)
        .catch((error) =>
          reportNavigationFailure("change source group", error),
        );
    },
    setLabelBranch(branchId: number | null): void {
      const branch =
        branchId == null
          ? null
          : (context.labelBranches.elements.find(
              (candidate) => candidate.id === branchId,
            ) ?? null);
      void context
        .displayLabelBranch(branch)
        .catch((error) =>
          reportNavigationFailure("change label branch", error),
        );
    },
    setFrameStatus(isComplete: boolean): void {
      const frame = context.currentFrame;
      if (frame == null) return;
      // A failed status update keeps the frame's local state (and the
      // retry path); report the error instead of letting the
      // fire-and-forget update escape unhandled.
      frame
        .updateIsComplete(isComplete)
        .catch((error) =>
          console.error("Failed to update frame status:", error),
        );
    },

    saveLabelset(): void {
      const branch = context.currentLabelBranch;
      const taskId = context.currentTaskId;
      if (
        branch == null ||
        taskId == null ||
        branch.isUpdating ||
        !branch.hasUnsavedChanges
      )
        return;
      // A failed push keeps the branch dirty and re-enables saving, so the user
      // has to be told: a rejection that only reaches the console leaves a save
      // that never landed indistinguishable from one that did. Report it through
      // the editor's user-visible error path - the same alert the view layer
      // raises for a failed save - instead of letting the fire-and-forget push
      // escape unhandled. Failures the transport already alerted stay silent
      // here, so a rejected save surfaces once rather than twice.
      branch.pushActive(taskId).catch((error) => {
        if (isErrorSurfaced(error)) return;
        console.error("Failed to save the labelset:", error);
        alert(`Failed to save changes.\n\n${error}`);
      });
    },
    rebaseLabelset(historyId: CommitID): void {
      const branch = context.currentLabelBranch;
      if (branch == null || branch.isUpdating) return;
      const historyItem = branch
        .getHistory()
        .find((candidate) => candidate.id === historyId);
      if (historyItem == null) return;
      if (
        historyItem.status === HistoryItemStatus.SAVED &&
        !historyItem.isSavepoint
      )
        return;
      branch
        .rebase(historyId)
        .catch((error) =>
          console.error("Failed to rebase the labelset:", error),
        );
    },

    ...pluginIntents,
  };
}
