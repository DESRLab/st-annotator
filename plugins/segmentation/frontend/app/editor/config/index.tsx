import type { EditorConfig } from "sta/app/editor";
import { TypeUtils } from "sta/common";

import type { SegmentationSettingsInputtedData } from "../scene/widgets/SegmentationSettingsPane.react.tsx";

export const SENDER_KEY = "segmentation";

const DEFAULT_SETTINGS: Readonly<SegmentationSettingsInputtedData> = {
  useAssistant: false,
  timePathRange: 5,
  showTooltips: false,
  showPerceivedClass: false,
  showOcclusion: false,
  showDistinctiveness: false,
  showTimestampDiff: false,
  showTrackSegId: false,
  selectionTransparency: true,
  selectionOpacity: 0.5,
  brushDiameter: 40,
  brushHueStyle: 0.2,
  strokeColor: { r: 1, g: 0, b: 0 }, // red
  hoveredSelectionColor: { r: 1, g: 0, b: 0 }, // red
  selectedSelectionColor: { r: 1, g: 1, b: 0 }, // yellow
};

/**
 * Extracts the settings for point cloud from a configuration.
 */
export function getSettings(
  config: EditorConfig,
): SegmentationSettingsInputtedData {
  return TypeUtils.mergeObjects(config.forLayer(SENDER_KEY), DEFAULT_SETTINGS);
}
