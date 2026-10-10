import type { TpPluginBundle } from "tweakpane";

import {
  HTMLContainerApi,
  HTMLContainerPlugin,
  htmlContainerCss,
} from "./HTMLContainerPlugin";
import { SelectGridPlugin, selectGridCss } from "./SelectGridPlugin";

export type { HTMLContainerParams } from "./HTMLContainerPlugin";
export type {
  SelectGridValue,
  SelectGridInputParams,
  SelectCellConfig,
} from "./SelectGridPlugin";

export { applyRadiogridDisabledState } from "./RadiogridDisabledPatch";

const CustomPlugins: TpPluginBundle = {
  id: "sta-editor",
  css: htmlContainerCss + selectGridCss,
  plugins: [HTMLContainerPlugin, SelectGridPlugin],
};

export { HTMLContainerApi, CustomPlugins };
