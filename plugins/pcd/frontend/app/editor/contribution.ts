import { findEditorLayer } from "sta/app/editor";
import type {
  EditorLayerFactoryEnv,
  EditorPreferencesMenuFactoryEnv,
  EditorWindowMapper,
} from "sta/app/editor";

import { PointCloudLayer } from "./scene";
import { MainCameraPreferencesMenu } from "./widgets";

/** Contributes the point cloud layer; depends on no other layers. */
export function createEditorLayer(
  env: EditorLayerFactoryEnv,
): PointCloudLayer<EditorWindowMapper> {
  return PointCloudLayer.create(env.context, "Point Cloud");
}

/**
 * Contributes the main camera settings menu as the app's preferences menu.
 * The menu is the write path of this plugin's camera intents, so it is
 * attached to the layer exposing them.
 */
export function createEditorPreferencesMenu(
  env: EditorPreferencesMenuFactoryEnv,
): MainCameraPreferencesMenu<EditorWindowMapper> {
  const pointCloudLayer = findEditorLayer<PointCloudLayer<EditorWindowMapper>>(
    env.layersByKey,
    PointCloudLayer,
  );
  if (pointCloudLayer == null) {
    throw new Error("The pcd preferences menu requires the point cloud layer.");
  }

  const menu = new MainCameraPreferencesMenu(
    env.layers,
    env.context.display.windows.main,
    pointCloudLayer,
  );
  pointCloudLayer.mainCameraMenu = menu;
  return menu;
}
