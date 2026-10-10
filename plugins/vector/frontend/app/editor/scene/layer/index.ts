import "./styles/vector-layer-styles.css";

export { VectorLayer } from "./VectorLayer.tsx";
export type { MainWindowMapper } from "./InteractContext.tsx";
export {
  mapVectorSlice,
  projectVectorClassEntity,
  projectVectorEntity,
} from "./VectorSlice";
export type {
  VectorClassEntity,
  VectorEntity,
  VectorIntents,
  VectorPluginIntents,
  VectorPluginSlices,
  VectorSlice,
  VectorSliceInput,
  VectorSliceLabelsSource,
} from "./VectorSlice";
export { useVectorSelector } from "./VectorSlice.react.ts";
