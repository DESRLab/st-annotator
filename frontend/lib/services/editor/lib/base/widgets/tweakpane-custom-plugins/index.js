/**
 * @typedef {import('tweakpane').TpPluginBundle} TpPluginBundle
 */

/**
 * @typedef {import('./HTMLContainerPlugin').HTMLContainerParams} HTMLContainerParams
 */

import { HTMLContainerApi, HTMLContainerPlugin } from './HTMLContainerPlugin';

/**
 * @template {string} K
 * @typedef {import('./SelectGridPlugin').SelectGridValue<K>} SelectGridValue
 */

/**
 * @template {string} K
 * @typedef {import('./SelectGridPlugin').SelectGridInputParams<K>} SelectGridInputParams
 */

import { SelectGridPlugin } from './SelectGridPlugin';

/**
 * @type {TpPluginBundle}
 */
const CustomPlugins = { plugins: [HTMLContainerPlugin, SelectGridPlugin] };

export {
    HTMLContainerApi,
    CustomPlugins,
};
