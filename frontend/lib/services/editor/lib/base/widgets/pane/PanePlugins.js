import * as EssentialsPlugin from '@tweakpane/plugin-essentials';
import * as TweakpaneTablePlugin from 'tweakpane-table';

import { CustomPlugins } from '../tweakpane-custom-plugins';

/**
 * @typedef {import('tweakpane').Pane} Pane
 */

/**
 * Registers each plugin that is used by this library.
 * 
 * @param {Pane} pane The pane to register the plugins for.
 */
export function registerPlugins(pane) {
    // To support builder.input with views from tweakpane-essentials
    pane.registerPlugin(EssentialsPlugin);

    // To support builder.tableHead and builder.tableRow
    pane.registerPlugin(TweakpaneTablePlugin);

    // To support builder.htmlContainer and builder.selectGrid
    pane.registerPlugin(CustomPlugins);
}
