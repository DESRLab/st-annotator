import {
  applyRadiogridDisabledState,
  definePaneElements,
  paneControls,
} from "../../widgets";
import type {
  PaneControllerDataProcessor,
  PaneElementFactory,
  PaneElementParams,
} from "../../widgets";
import type { ViewMode } from "../display";

export interface ViewModeInputtedData {
  viewMode: ViewMode;
}

export interface ViewModePaneSettings {
  disabled: boolean;
  hidden: boolean;
}

export interface ViewModeState {
  viewMode: ViewMode;
}

export interface ViewModePaneParams {
  inputtedData: ViewModeInputtedData;
  computedData: {};
  settings: ViewModePaneSettings;
  internalData: {};
  outputData: ViewModeState;
}

export type ViewModePaneElementParams = PaneElementParams<ViewModePaneParams>;

export const viewModePaneGridViewModes: readonly ViewMode[] = ["2D", "3D"];

export const viewModePaneGridLabels: readonly string[] = ["2D", "3D"];

export const viewModePaneFactoryParams: Pick<
  ViewModePaneParams,
  "inputtedData" | "computedData" | "settings"
> = {
  inputtedData: { viewMode: "2D" },
  computedData: {},
  settings: { disabled: false, hidden: false },
};

export function getViewModeOutputData(
  paneParams: Readonly<ViewModePaneElementParams>,
): ViewModeState {
  return { viewMode: paneParams.inputtedData.viewMode };
}

export function getViewModeSelectSettings({
  settings: { disabled, hidden },
}: Pick<ViewModePaneParams, "settings">) {
  return {
    view: "radiogrid",
    groupName: "viewMode",
    label: "View Mode",
    size: [2, 1],
    cells: (x: number) => ({
      title: viewModePaneGridLabels[x],
      value: viewModePaneGridViewModes[x],
    }),
    disabled,
    hidden,
  };
}

export function createViewModePaneElementFactory(): PaneElementFactory<
  ViewModePaneElementParams,
  {}
> {
  const controls = paneControls<ViewModePaneElementParams>();
  return definePaneElements(
    viewModePaneFactoryParams,
    [],
    controls.sequential([
      controls.input(["inputtedData", "viewMode"], {
        options: getViewModeSelectSettings,
        modifyHTML: (element, paneParams) =>
          applyRadiogridDisabledState(element, paneParams.settings.disabled),
      }),
    ]),
  );
}

export const viewModePaneDataProcessor: PaneControllerDataProcessor<ViewModePaneParams> =
  {
    computeData: () => ({}),
    outputData: getViewModeOutputData,
  };
