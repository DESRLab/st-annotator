import type { EditorConfig } from "sta/app/editor";
import { TypeUtils } from "sta/common";

import type { PointCloudSettingsInputtedData } from "../scene/widgets/PointCloudSettingsPane.react.tsx";

export const SENDER_KEY = "pcd";

export const DEFAULT_SETTINGS: Readonly<PointCloudSettingsInputtedData> = {
  removeBackground: true,
  cropArea: true,
  pointSize: 2,
  blender: {
    blenderType: "apply-colormap",
    applyColormap: {
      // colormapName: 'viridis'
      colormapName: "rainbow",
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

/** Extracts the settings for point cloud from a configuration. */
export function getSettings(
  config: EditorConfig,
): PointCloudSettingsInputtedData {
  return TypeUtils.mergeObjects(config.forLayer(SENDER_KEY), DEFAULT_SETTINGS);
}
