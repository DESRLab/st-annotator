/** Type-level contract for the explicitly composed full distribution. */

import fullConfig from "../../../distributions/full/frontend/sta.config";

import type { EditorIntentsContributor } from "sta/app/editor";

type Plugins = typeof fullConfig.plugins;
type EditorModule<K extends keyof Plugins> = Awaited<
  ReturnType<Plugins[K]["editor"]["loader"]>
>;
type LayerOfModule<M> = M extends {
  createEditorLayer: (...args: never[]) => infer Layer;
}
  ? Layer
  : never;
type IntentsOf<Layer> =
  Layer extends EditorIntentsContributor<infer Intents> ? Intents : never;
type DerivedPluginIntents = {
  [
    K in keyof Plugins as IntentsOf<
      LayerOfModule<EditorModule<K>>
    > extends never
      ? never
      : K
  ]: IntentsOf<LayerOfModule<EditorModule<K>>>;
};

type ExpectedKeys = "bbox" | "gmesh" | "pcd" | "segmentation" | "vector";
type AssertKeys = keyof DerivedPluginIntents extends ExpectedKeys
  ? ExpectedKeys extends keyof DerivedPluginIntents
    ? true
    : never
  : never;

const keys: AssertKeys = true;

export { keys };
