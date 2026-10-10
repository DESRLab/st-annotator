import type { EditorConfig } from "sta/app/editor";
import { TypeUtils } from "sta/common";

import type { BBoxSettingsInputtedData } from "../scene/widgets/BBoxSettingsPane.react.tsx";

export const SENDER_KEY = "bbox";

const DEFAULT_SETTINGS: Readonly<BBoxSettingsInputtedData> = {
  timePathRange: 2,
  maintainRelativeElevation: true,
  showPerceivedClass: true,
  showTooltips: false,
  showDistinctiveness: false,
  showOcclusion: false,
  showTimestampDiff: false,
  showTrackBoxId: false,
  boxTransparency: false,
  boxOpacity: 0.2,
  hoveredBoxColor: { r: 1, g: 0, b: 0 }, // red
  selectedBoxColor: { r: 0, g: 0, b: 1 }, // blue
};

/**
 * Extracts the settings for point cloud from a configuration.
 *
 * @param config The configuration to extract from.
 * @returns The requested settings.
 */
export function getSettings(config: EditorConfig): BBoxSettingsInputtedData {
  return TypeUtils.mergeObjects(config.forLayer(SENDER_KEY), DEFAULT_SETTINGS);
}

/** Whether the project enables automatic track assignment for box labels. */
export function getAutoTracks(config: EditorConfig): boolean {
  return config.getOption("auto_tracks") === true;
}
