/**
 * Contains the framework of the annotation editor frontend.
 *
 * @module app/editor
 */

export * from "./app";
export * from "./colors";
export * from "./config";
export * from "./data";
export * from "./labelset";
export * from "./nav";
export * from "./points";
export * from "./scene";
export * from "./store";
export * from "./utils";
export * from "./views";
export * from "./widgets";

export { isEditorE2EProbeTargetsContributor } from "./e2eProbeContributors";
export type { EditorE2EProbeTargetsContributor } from "./e2eProbeContributors";
export { isE2EProbeEnabled } from "./e2eProbeEnabled";
export type {
  E2EProbeDbPoint,
  E2EProbeLabelTarget,
  E2EProbeLayerTarget,
  E2EProbeRaycastResult,
  E2EProbeSelectorState,
  E2EProbeTransformTarget,
  E2EProbeViewportPoint,
  ProbeWindowMapper,
  StaE2EProbe,
} from "./e2eProbe";
export {
  findEditorLayer,
  isEditorLayerContributor,
  isEditorPreferencesMenuContributor,
} from "./moduleContributors";
export type {
  EditorLayerContributor,
  EditorLayerFactoryEnv,
  EditorPreferencesMenu,
  EditorPreferencesMenuContributor,
  EditorPreferencesMenuFactoryEnv,
} from "./moduleContributors";
export { isEditorOverlayViewsContributor } from "./overlayContributors";
export type { EditorOverlayViewsContributor } from "./overlayContributors";
export type { Plugins } from "../../config";
export type {
  ContributedLayer,
  EditorApp,
  EditorLayerCollection,
  EditorLayers,
  EditorLoadOptions,
  EditorMode,
  EditorOverlayDom,
  EditorPluginRegistry,
  EditorRuntime,
  EditorSceneContext,
  EditorWindowMapper,
} from "./runtime";
