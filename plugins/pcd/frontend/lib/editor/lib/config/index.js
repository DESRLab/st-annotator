import { TypeUtils } from 'sta/common/utils';

/**
 * @template T
 * @typedef {import('sta/common/utils').TypeUtils.Immutable<T>} Immutable
 */

/**
 * @typedef {import('sta/services/editor/base').EditorConfig} EditorConfig
 */

/**
 * @typedef {import('../scene/widgets/PointCloudSettingsPane')
 * .PointCloudSettingsInputtedData} PointCloudSettingsInputtedData
 */

export const SENDER_KEY = 'pcd';

/**
 * @type {Immutable<PointCloudSettingsInputtedData>}
 */
export const DEFAULT_SETTINGS = {
    removeBackground: true,
    cropArea: true,
    pointSize: 2,
    blender: {
        blenderType: 'apply-colormap',
        applyColormap: {
            // colormapName: 'viridis'
            colormapName: 'rainbow',
            valueFunc: {
                channelIdx: 2,      // Color by elevation
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
 * Extracts the settings for point cloud from a configuration.
 * 
 * @param {EditorConfig} config The configuration to extract from.
 * @returns {PointCloudSettingsInputtedData} The requested settings.
 */
export function getSettings(config) {
    return TypeUtils.mergeObjects(config.forLayer(SENDER_KEY), DEFAULT_SETTINGS);
}
