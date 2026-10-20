import type { EditorLayerFactoryEnv } from "sta/app/editor";
import { RelationLayer } from "./RelationLayer";
export { RelationLayer } from "./RelationLayer";
export type {
  RelationSlice,
  RelationIntents,
  RelationPluginIntents,
} from "./RelationSlice";
export function createEditorLayer(env: EditorLayerFactoryEnv): RelationLayer {
  return new RelationLayer(env);
}
export { RelationIndex } from "./RelationIndex";
export type { Relation, RelationClass, RelationGroup } from "./RelationIndex";
export type { RelationSettings } from "./RelationSettings";
export {
  RelationView,
  RelationLoader,
  RelationOperation,
} from "./RelationView";
export type { RelationParams, RelationUpdateField } from "./RelationView";
