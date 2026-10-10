import {
  applyRadiogridDisabledState,
  definePaneElements,
  paneControls,
} from "sta/app/editor";
import type {
  PaneControllerDataProcessor,
  PaneElementFactory,
  PaneElementParams,
} from "sta/app/editor";

export type EditMode = "add" | "erase";

export interface EditModeInputtedData {
  editMode: EditMode;
}

export interface EditModePaneSettings {
  disabled: boolean;
  hidden: boolean;
}

export interface EditModeState {
  editMode: EditMode;
}

export interface EditModePaneControllerParams {
  inputtedData: EditModeInputtedData;
  computedData: {};
  settings: EditModePaneSettings;
  internalData: {};
  outputData: EditModeState;
}

export type EditModePaneElementParams =
  PaneElementParams<EditModePaneControllerParams>;

export function getEditModeOutputData(
  paneParams: Readonly<EditModePaneElementParams>,
) {
  return { editMode: paneParams.inputtedData.editMode };
}

export const editModePaneFactoryParams: EditModePaneElementParams = {
  inputtedData: { editMode: "add" },
  computedData: {},
  settings: { disabled: false, hidden: false },
};

export const editModePaneModes: readonly EditMode[] = ["add", "erase"];
export const editModePaneLabels: readonly string[] = ["Add", "Erase"];

export function getEditModeSelectSettings({
  settings: { disabled, hidden },
}: Readonly<EditModePaneElementParams>) {
  return {
    view: "radiogrid",
    groupName: "editMode",
    label: "Edit Mode",
    size: [2, 1],
    cells: (x: number) => ({
      title: editModePaneLabels[x],
      value: editModePaneModes[x],
    }),
    disabled,
    hidden,
  };
}

export function createEditModePaneElementFactory(): PaneElementFactory<EditModePaneElementParams> {
  const controls = paneControls<EditModePaneElementParams>();
  return definePaneElements(
    editModePaneFactoryParams,
    [],
    controls.sequential([
      controls.input(["inputtedData", "editMode"], {
        options: (paneParams) => getEditModeSelectSettings(paneParams),
        modifyHTML: (element, paneParams) =>
          applyRadiogridDisabledState(element, paneParams.settings.disabled),
      }),
    ]),
  );
}

export const editModePaneDataProcessor: PaneControllerDataProcessor<EditModePaneControllerParams> =
  {
    computeData: () => ({}),
    outputData: getEditModeOutputData,
  };
