/** Type-level contract for the explicitly composed full distribution. */

import fullConfig from "../../../distributions/full/frontend/sta.config";

import type { EditorIntentsContributor } from "sta/app/editor";
import type { RelationPluginIntents } from "sta-relation/app";

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

type ExpectedKeys =
  "bbox" | "gmesh" | "pcd" | "segmentation" | "vector" | "relation";
type AssertKeys = keyof DerivedPluginIntents extends ExpectedKeys
  ? ExpectedKeys extends keyof DerivedPluginIntents
    ? true
    : never
  : never;

const keys: AssertKeys = true;

type RelationGroup = IntentsOf<LayerOfModule<EditorModule<"relation">>>;
type AssertRelationGroup = RelationGroup extends RelationPluginIntents
  ? true
  : never;
const relationGroup: AssertRelationGroup = true;

export { keys, relationGroup };
