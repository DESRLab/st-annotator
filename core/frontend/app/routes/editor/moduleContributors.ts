import type { ReactNode } from "react";

import type { MenuKeybindOwner } from "./app/widgets/MenuKeybinds.ts";
import type { EditorOverlayDom, EditorWindowMapper } from "./runtime";
import type { SceneContext } from "./scene/SceneContext";
import type { LayerCollection } from "./scene/layer/LayerCollection.tsx";
import type { SceneLayer } from "./scene/layer/SceneLayer.tsx";

/**
 * The environment handed to a plugin editor module's layer factory.
 *
 * `layers` holds the layers already created (registration order), so a
 * factory can depend on layers contributed by plugins registered earlier.
 */
export interface EditorLayerFactoryEnv {
  readonly context: SceneContext<EditorWindowMapper>;
  readonly layers: Readonly<Record<string, SceneLayer<EditorWindowMapper>>>;
  /** The overlay slot DOM this plugin declared, keyed as declared. */
  readonly overlayDoms: Readonly<Record<string, EditorOverlayDom>>;
}

/**
 * A contributor of one scene layer to the editor runtime.
 *
 * Implemented by plugin editor modules. The composition root discovers
 * contributors structurally ({@link isEditorLayerContributor}) and calls
 * them in registration order, so it never imports plugin packages.
 */
export interface EditorLayerContributor {
  createEditorLayer(env: EditorLayerFactoryEnv): SceneLayer<EditorWindowMapper>;
}

/** Structurally detects an {@link EditorLayerContributor} without imports. */
export function isEditorLayerContributor(
  value: unknown,
): value is EditorLayerContributor {
  if (value == null || typeof value !== "object") return false;
  return (
    typeof (value as EditorLayerContributor).createEditorLayer === "function"
  );
}

/** Finds the constructed layer that is an instance of `layerClass`, or `null`. */
export function findEditorLayer<TLayer>(
  layers: Readonly<Record<string, SceneLayer<EditorWindowMapper>>>,
  layerClass: abstract new (...args: never[]) => TLayer,
): TLayer | null {
  for (const layer of Object.values(layers)) {
    if (layer instanceof layerClass) return layer;
  }
  return null;
}

/** The structural shape of the app's preferences menu (see `App`). */
export interface EditorPreferencesMenu extends MenuKeybindOwner {
  renderView(): ReactNode;
  dispose(): void;
}

/**
 * The environment handed to a plugin editor module's preferences menu
 * factory. The layer collection exists at this point (the menu keybinds and
 * reads layers), unlike during layer creation.
 */
export interface EditorPreferencesMenuFactoryEnv {
  readonly context: SceneContext<EditorWindowMapper>;
  readonly layers: LayerCollection<EditorWindowMapper>;
  readonly layersByKey: Readonly<
    Record<string, SceneLayer<EditorWindowMapper>>
  >;
}

/**
 * A contributor of the app's preferences menu.
 *
 * Implemented by plugin editor modules. The composition root discovers
 * contributors structurally ({@link isEditorPreferencesMenuContributor});
 * the first contributor wins.
 */
export interface EditorPreferencesMenuContributor {
  createEditorPreferencesMenu(
    env: EditorPreferencesMenuFactoryEnv,
  ): EditorPreferencesMenu;
}

/** Structurally detects an {@link EditorPreferencesMenuContributor} without imports. */
export function isEditorPreferencesMenuContributor(
  value: unknown,
): value is EditorPreferencesMenuContributor {
  if (value == null || typeof value !== "object") return false;
  return (
    typeof (value as EditorPreferencesMenuContributor)
      .createEditorPreferencesMenu === "function"
  );
}
