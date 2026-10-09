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
 * @typedef {import('../scene/widgets/VectorSettingsPane')
 * .VectorSettingsInputtedData} VectorSettingsInputtedData
 */

export const SENDER_KEY = 'vector';

/**
 * @type {Immutable<VectorSettingsInputtedData>}
 */
const DEFAULT_SETTINGS = {
    showTooltips: false,
    strokeWidth: 2,
    strokeColor: new THREE.Color('red'),
    hoveredVectorColor: new THREE.Color('yellow'),
    selectedVectorColor: new THREE.Color('blue'),
};

/**
 * Extracts the settings for point cloud from a configuration.
 * 
 * @param {EditorConfig} config The configuration to extract from.
 * @returns {VectorSettingsInputtedData} The requested settings.
 */
export function getSettings(config) {
    return TypeUtils.mergeObjects(config.forLayer(SENDER_KEY), DEFAULT_SETTINGS);
}
