import * as THREE from 'three';

import { TypeUtils } from 'sta/common/utils';

/**
 * @template T
 * @typedef {import('sta/common/utils').TypeUtils.Immutable<T>} Immutable
 */

/**
 * @typedef {import('sta/services/editor/base').EditorConfig} EditorConfig
 */

/**
 * @typedef {import('../scene/widgets/BBoxSettingsPane')
 * .BBoxSettingsInputtedData} BBoxSettingsInputtedData
 */

export const SENDER_KEY = 'bbox';

/**
 * @type {Immutable<BBoxSettingsInputtedData>}
 */
const DEFAULT_SETTINGS = {
    timeIdxRange: 2,
    maintainRelativeElevation: true,
    showPerceivedClass: true,
    showTooltips: false,
    showDistinctiveness: false,
    showOcclusion: false,
    showTimestampDiff: false,
    showTrackBoxId: false,
    boxTransparency: false,
    boxOpacity: 0.2,
    hoveredBoxColor: new THREE.Color('red'),
    selectedBoxColor: new THREE.Color('blue'),
};

/**
 * Extracts the settings for point cloud from a configuration.
 * 
 * @param {EditorConfig} config The configuration to extract from.
 * @returns {BBoxSettingsInputtedData} The requested settings.
 */
export function getSettings(config) {
    return TypeUtils.mergeObjects(config.forLayer(SENDER_KEY), DEFAULT_SETTINGS);
}
