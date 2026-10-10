import { definePaneElements, paneControls } from "sta/app/editor";
import type {
  PaneControllerDataProcessor,
  PaneElementFactory,
  PaneElementParams,
  Transformation,
} from "sta/app/editor";

export interface TransformerSettingsInputtedData {
  isTransformSelected: Record<Transformation, boolean>;
}

export interface TransformerSettingsPaneSettings {
  disabled: boolean;
  hidden: boolean;
}

export interface TransformerSettings {
  isTransformSelected: Record<Transformation, boolean>;
}

export interface TransformerSettingsPaneControllerParams {
  inputtedData: TransformerSettingsInputtedData;
  computedData: {};
  settings: TransformerSettingsPaneSettings;
  internalData: {};
  outputData: TransformerSettings;
}

type TransformerSettingsPaneElementParams =
  PaneElementParams<TransformerSettingsPaneControllerParams>;

/**
 * Represents a UI to configure the settings for a {@link Transformer}.
 *
 */
/** Default parameters used to validate and compile the pane definition. */
export const transformerSettingsPaneFactoryParams = {
  inputtedData: {
    isTransformSelected: {
      translate: true,
      rotate: true,
      scale: true,
    },
  },
  computedData: {},
  settings: {
    disabled: false,
    hidden: false,
  },
};

export const transformerSettingsPaneGridTransformations: readonly Transformation[] =
  ["translate", "rotate", "scale"];

export const transformerSettingsPaneGridLabels: readonly string[] = [
  "Translate",
  "Rotate",
  "Scale",
];

/**
 * Obtains the settings for the action selector.
 *
 * The parameters of the pane.
 */
export function getTransformationSelectSettings({
  settings: { disabled, hidden },
}: TransformerSettingsPaneElementParams) {
  return {
    label: "Modes",
    size: [3, 1] as [number, number],
    cells: (x: number) => ({
      title: transformerSettingsPaneGridLabels[x],
      value: transformerSettingsPaneGridTransformations[x],
    }),
    isMultiSelect: true,
    disabled: disabled,
    hidden: hidden,
  };
}

/**
 * Creates a {@link PaneElementFactory} that constructs a pane element for
 * {@link TransformerSettingsPaneElementParams}.
 *
 * The resulting pane element factory.
 */
export function createTransformerSettingsPaneElementFactory(): PaneElementFactory<
  TransformerSettingsPaneElementParams,
  {}
> {
  const controls = paneControls<TransformerSettingsPaneElementParams>();
  return definePaneElements(
    transformerSettingsPaneFactoryParams,
    [],
    controls.sequential([
      controls.selectGrid(["inputtedData", "isTransformSelected"], {
        options: getTransformationSelectSettings,
        modifyHTML: (element) => {
          const buttonsContainer = element.querySelector(".tp-lblv_v");
          if (buttonsContainer instanceof HTMLDivElement) {
            buttonsContainer.style.width = "240px";
          } else {
            console.warn("Cannot find buttons container");
          }
        },
      }),
    ]),
  );
}

export const transformerSettingsPaneDataProcessor: PaneControllerDataProcessor<TransformerSettingsPaneControllerParams> =
  {
    computeData: (
      _inputtedData: TransformerSettingsInputtedData,
      _internalData: {},
    ): {} => ({}),
    outputData: (
      paneParams: TransformerSettingsPaneElementParams,
    ): TransformerSettings => {
      const {
        inputtedData: { isTransformSelected },
      } = paneParams;
      return { isTransformSelected };
    },
  };
