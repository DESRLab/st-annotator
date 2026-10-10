import type { ReactNode } from "react";

/**
 * A contributor of React views rendered inside the plugin's overlay slot DOM.
 *
 * Implemented by plugin layers whose overlay slot (declared through the
 * plugin registration's `editor.overlayDoms`) hosts React-owned content in
 * addition to the raw DOM, e.g. a brush cursor rendered inside its cursor
 * div. The display shell discovers contributors
 * structurally ({@link isEditorOverlayViewsContributor}), re-rendering them
 * on the layer's standard `overlay-change` event; no plugin package is
 * imported statically.
 */
export interface EditorOverlayViewsContributor {
  /**
   * The views to render, keyed by the overlay slot DOM key declared in the
   * plugin registration (only `div` hosts render children).
   */
  readonly editorOverlayViews: Readonly<Record<string, ReactNode>>;
}

/** Structurally detects an {@link EditorOverlayViewsContributor} without imports. */
export function isEditorOverlayViewsContributor(
  value: unknown,
): value is EditorOverlayViewsContributor {
  if (value == null || typeof value !== "object") return false;
  const views = (value as EditorOverlayViewsContributor).editorOverlayViews;
  return views != null && typeof views === "object";
}
