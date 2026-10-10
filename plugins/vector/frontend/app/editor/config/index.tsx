import type { EditorConfig } from "sta/app/editor";
import { TypeUtils } from "sta/common";

import type { VectorSettingsInputtedData } from "../scene/widgets/VectorSettingsPane.react.tsx";

export const SENDER_KEY = "vector";

const DEFAULT_SETTINGS: Readonly<VectorSettingsInputtedData> = {
  showTooltips: false,
  showVectorId: false,
  strokeWidth: 2,
  strokeColor: { r: 1, g: 0, b: 0 }, // red
  hoveredVectorColor: { r: 1, g: 1, b: 0 }, // yellow
  selectedVectorColor: { r: 0, g: 0, b: 1 }, // blue
};

/**
 * Extracts the settings for point cloud from a configuration.
 *
 * @param config The configuration to extract from.
 * @returns The requested settings.
 */
export function getSettings(config: EditorConfig): VectorSettingsInputtedData {
  return TypeUtils.mergeObjects(config.forLayer(SENDER_KEY), DEFAULT_SETTINGS);
}
