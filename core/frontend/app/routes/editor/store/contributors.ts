import type { EditorRuntime } from "../runtime";

/**
 * A contributor of one plugin slice to the editor state snapshot.
 *
 * Implemented by plugin layers. The composition root discovers contributors
 * structurally ({@link isEditorSliceContributor}), so the store wiring never
 * imports plugin packages statically (they are loaded dynamically with the
 * runtime).
 */
export interface EditorSliceContributor<TSlice = unknown> {
  /**
   * Maps this slice's plain state from the plugin's imperative state,
   * reusing sub-references of `previous` for unchanged parts (structural
   * sharing).
   */
  mapEditorSlice(previous: TSlice | null): TSlice;

  /**
   * Subscribes `listener` to every change that may affect the mapped
   * slice, and returns the unsubscribe function.
   */
  subscribeEditorSlice(listener: () => void): () => void;
}

/** Structurally detects an {@link EditorSliceContributor} without imports. */
export function isEditorSliceContributor(
  value: unknown,
): value is EditorSliceContributor {
  if (value == null || typeof value !== "object") return false;
  const candidate = value as EditorSliceContributor;
  return (
    typeof candidate.mapEditorSlice === "function" &&
    typeof candidate.subscribeEditorSlice === "function"
  );
}

/**
 * A contributor of one plugin intent group to the editor intents.
 *
 * Implemented by plugin layers. The composition root discovers contributors
 * structurally ({@link isEditorIntentsContributor}), so the store wiring
 * never imports plugin packages statically (they are loaded dynamically with
 * the runtime).
 */
export interface EditorIntentsContributor<TIntents = unknown> {
  /**
   * Builds this layer's intent group: the write-side methods of the
   * plugin's panes and tools, delegating to the layer's imperative
   * controllers.
   */
  createEditorIntents(runtime: EditorRuntime): TIntents;
}

/** Structurally detects an {@link EditorIntentsContributor} without imports. */
export function isEditorIntentsContributor(
  value: unknown,
): value is EditorIntentsContributor {
  if (value == null || typeof value !== "object") return false;
  return (
    typeof (value as EditorIntentsContributor).createEditorIntents ===
    "function"
  );
}
