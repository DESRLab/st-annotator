import type { EditorConfig } from "sta/app/editor";
import { TypeUtils } from "sta/common";

import type { GroundMeshSettingsInputtedData } from "../scene/widgets/GroundMeshSettingsPane.react.tsx";

export const SENDER_KEY = "gmesh";

export const DEFAULT_SETTINGS: Readonly<GroundMeshSettingsInputtedData> = {
  showWireframe: false,
  opacity: 0.3,
  blender: {
    blenderType: "apply-colormap",
    applyColormap: {
      colormapName: "hsv",
      valueFunc: {
        channelIdx: 2, // Color by elevation
        vmin: -2,
        vmax: +2,
        useZScore: true,
      },
    },
    composeRGB: {
      valueFuncR: {
        channelIdx: 0,
        vmin: -2,
        vmax: +2,
        useZScore: true,
      },
      valueFuncG: {
        channelIdx: 1,
        vmin: -2,
        vmax: +2,
        useZScore: true,
      },
      valueFuncB: {
        channelIdx: 2,
        vmin: -2,
        vmax: +2,
        useZScore: true,
      },
    },
  },
};

/**
 * Extracts the settings for ground mesh from a configuration.
 */
export function getSettings(
  config: EditorConfig,
): GroundMeshSettingsInputtedData {
  return TypeUtils.mergeObjects(config.forLayer(SENDER_KEY), DEFAULT_SETTINGS);
}
