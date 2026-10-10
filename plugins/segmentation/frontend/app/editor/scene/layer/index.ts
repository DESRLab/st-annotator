import "./styles/segmentation-layer-styles.css";

export { SegmentationLayer } from "./SegmentationLayer.tsx";
export type { MainWindowMapper } from "./InteractContext.tsx";
export {
  mapSegmentationSlice,
  projectSegmentationClassEntity,
  projectSegmentationInstanceEntity,
  projectSegmentationSelectionEntity,
} from "./SegmentationSlice";
export type {
  QualityLevelValue,
  SegmentationClassEntity,
  SegmentationInstanceEntity,
  SegmentationIntents,
  SegmentationPluginIntents,
  SegmentationPluginSlices,
  SegmentationSelectionEntity,
  SegmentationSlice,
  SegmentationSliceInput,
  SegmentationSliceLabelsSource,
} from "./SegmentationSlice";
export { useSegmentationSelector } from "./SegmentationSlice.react.ts";
