import { definePaneElements, paneControls } from "sta/app/editor";
import type {
  PaneControllerDataProcessor,
  PaneElementFactory,
  PaneElementParams,
} from "sta/app/editor";

export type PromptMode = "foreground" | "background";

export interface PromptModeInputtedData {
  promptMode: PromptMode;
  numPrompts: number;
  maskThreshold: number;
}

export interface PromptModePaneSettings {
  disabled: boolean;
  hidden: boolean;
  maxPrompts: number;
  maxMaskThreshold: number;
}

export interface PromptModeState {
  promptMode: PromptMode;
  numPrompts: number;
  maskThreshold: number;
}

export interface PromptModePaneControllerParams {
  inputtedData: PromptModeInputtedData;
  computedData: {};
  settings: PromptModePaneSettings;
  internalData: {};
  outputData: PromptModeState;
}

export type PromptModePaneElementParams =
  PaneElementParams<PromptModePaneControllerParams>;

export function getPromptModeOutputData(
  paneParams: Readonly<PromptModePaneElementParams>,
): PromptModeState {
  const { promptMode, numPrompts, maskThreshold } = paneParams.inputtedData;

  return { promptMode, numPrompts, maskThreshold };
}

export const promptModePaneFactoryParams: PromptModePaneElementParams = {
  inputtedData: {
    promptMode: "foreground",
    numPrompts: 1,
    maskThreshold: 0.5,
  },
  computedData: {},
  settings: {
    disabled: false,
    hidden: false,
    maxPrompts: 20,
    maxMaskThreshold: 1,
  },
};

export const promptModePaneModes: readonly PromptMode[] = [
  "foreground",
  "background",
];
export const promptModePaneLabels: readonly string[] = [
  "Foreground",
  "Background",
];

export function getPromptModeSelectSettings({
  settings: { disabled, hidden },
}: Readonly<PromptModePaneElementParams>) {
  return {
    view: "radiogrid",
    groupName: "promptMode",
    label: "Prompt Mode",
    size: [2, 1],
    cells: (x: number) => ({
      title: promptModePaneLabels[x],
      value: promptModePaneModes[x],
    }),
    disabled,
    hidden,
  };
}

export function createPromptModePaneElementFactory(): PaneElementFactory<PromptModePaneElementParams> {
  const controls = paneControls<PromptModePaneElementParams>();
  return definePaneElements(
    promptModePaneFactoryParams,
    [],
    controls.sequential([
      controls.input(["inputtedData", "promptMode"], {
        options: (paneParams) => getPromptModeSelectSettings(paneParams),
      }),
      controls.input(["inputtedData", "numPrompts"], {
        options: ({ settings: { disabled, hidden, maxPrompts } }) => ({
          label: "Number of Prompts",
          min: 1,
          max: maxPrompts,
          step: 1,
          disabled: disabled,
          hidden: hidden,
        }),
      }),
      controls.input(["inputtedData", "maskThreshold"], {
        options: ({ settings: { disabled, hidden, maxMaskThreshold } }) => ({
          label: "Mask Threshold",
          min: 0,
          max: maxMaskThreshold,
          step: 0.05,
          disabled: disabled,
          hidden: hidden,
        }),
      }),
    ]),
  );
}

export const promptModePaneDataProcessor: PaneControllerDataProcessor<PromptModePaneControllerParams> =
  {
    computeData: () => ({}),
    outputData: getPromptModeOutputData,
  };
