/** Type-level state-slice contract for the explicitly composed distribution. */

import fullConfig from "../../../distributions/full/frontend/sta.config";

import type { EditorSliceContributor } from "sta/app/editor";

type Plugins = typeof fullConfig.plugins;
type EditorModule<K extends keyof Plugins> = Awaited<
  ReturnType<Plugins[K]["editor"]["loader"]>
>;
type LayerOfModule<M> = M extends {
  createEditorLayer: (...args: never[]) => infer Layer;
}
  ? Layer
  : never;
type SliceOf<Layer> =
  Layer extends EditorSliceContributor<infer Slice> ? Slice : never;
type DerivedSlices = {
  [
    K in keyof Plugins as SliceOf<LayerOfModule<EditorModule<K>>> extends never
      ? never
      : K
  ]: SliceOf<LayerOfModule<EditorModule<K>>>;
};

type ExpectedKeys = "bbox" | "gmesh" | "pcd" | "segmentation" | "vector";
type AssertKeys = keyof DerivedSlices extends ExpectedKeys
  ? ExpectedKeys extends keyof DerivedSlices
    ? true
    : never
  : never;
type AssertSlice<K extends keyof DerivedSlices> =
  keyof DerivedSlices[K] extends never ? never : true;

const keys: AssertKeys = true;
const bboxSlice: AssertSlice<"bbox"> = true;
const groundMeshSlice: AssertSlice<"gmesh"> = true;
const vectorSlice: AssertSlice<"vector"> = true;
const pointCloudSlice: AssertSlice<"pcd"> = true;
const segmentationSlice: AssertSlice<"segmentation"> = true;

export {
  keys,
  bboxSlice,
  groundMeshSlice,
  vectorSlice,
  pointCloudSlice,
  segmentationSlice,
};
