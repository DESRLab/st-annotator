import * as EssentialsPlugin from "@tweakpane/plugin-essentials";
import type { Pane } from "tweakpane";
import * as TweakpaneTablePlugin from "tweakpane-table";

import { CustomPlugins } from "../tweakpane-custom-plugins";

/**
 * Registers each plugin that is used by by this library.
 */
export function registerPlugins(pane: Pane): void {
  // To support builder.input with views from tweakpane-essentials
  pane.registerPlugin(EssentialsPlugin);

  // To support builder.tableHead and builder.tableRow
  pane.registerPlugin(TweakpaneTablePlugin.plugins);

  // To support builder.htmlContainer and builder.selectGrid
  pane.registerPlugin(CustomPlugins);
}
