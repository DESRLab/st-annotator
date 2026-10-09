import { TypeUtils } from 'sta/common/utils';

/**
 * @template T
 * @typedef {import('sta/common/utils').TypeUtils.Immutable<T>} Immutable
 */

/**
 * @typedef {import('sta/services/editor/base').EditorConfig} EditorConfig
 */

/**
 * @typedef {import('../scene/widgets/GroundMeshSettingsPane')
 * .GroundMeshSettingsInputtedData} GroundMeshSettingsInputtedData
 */

export const SENDER_KEY = 'gmesh';

/**
 * @type {Immutable<GroundMeshSettingsInputtedData>}
 */
export const DEFAULT_SETTINGS = {
    showWireframe: false,
    opacity: 0.3,
    blender: {
        blenderType: 'apply-colormap',
        applyColormap: {
            colormapName: 'hsv',
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
 * Extracts the settings for ground mesh from a configuration.
 * 
 * @param {EditorConfig} config The configuration to extract from.
 * @returns {GroundMeshSettingsInputtedData} The requested settings.
 */
export function getSettings(config) {
    return TypeUtils.mergeObjects(config.forLayer(SENDER_KEY), DEFAULT_SETTINGS);
}
