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
 * @typedef {import('../scene/widgets/SegmentationSettingsPane')
 * .SegmentationSettingsInputtedData} SegmentationSettingsInputtedData
 */

export const SENDER_KEY = 'segmentation';

/**
 * @type {Immutable<SegmentationSettingsInputtedData>}
 */
const DEFAULT_SETTINGS = {
    timeIdxRange: 5,
    showTooltips: false,
    showPerceivedClass: false,
    brushDiameter: 40,
    brushHueStyle: 0.2,
    strokeColor: new THREE.Color('red'),
    hoveredSelectionColor: new THREE.Color('red'),
    selectedSelectionColor: new THREE.Color('yellow'),
};

/**
 * Extracts the settings for point cloud from a configuration.
 * 
 * @param {EditorConfig} config The configuration to extract from.
 * @returns {SegmentationSettingsInputtedData} The requested settings.
 */
export function getSettings(config) {
    return TypeUtils.mergeObjects(config.forLayer(SENDER_KEY), DEFAULT_SETTINGS);
}
