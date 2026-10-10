import { definePaneElements, paneControls } from "sta/app/editor";
import type {
  PaneControllerDataProcessor,
  PaneElementFactory,
  PaneElementParams,
} from "sta/app/editor";

import type { Transformation } from "../controls";

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
 * Represents a UI to configure the settings for a {@link VectorTransformer}.
 *
 */
/**
 * Dummy arguments to pass into
 * [PaneElementFactoryBuilder](/api/frontend/classes/sta.app_editor.PaneElementFactoryBuilder.html).
 */
export const transformerSettingsPaneFactoryParams = {
  inputtedData: {
    isTransformSelected: {
      vertex: true,
      vertices: true,
    },
  },
  computedData: {},
  settings: {
    disabled: false,
    hidden: false,
  },
} as TransformerSettingsPaneElementParams;

export const transformerSettingsPaneGridTransformations: readonly Transformation[] =
  ["vertex", "vertices"];

export const transformerSettingsPaneGridLabels: readonly string[] = [
  "Vertex",
  "Vertices",
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
    label: "Translation Modes",
    size: [2, 1] as [number, number],
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
export function createTransformerSettingsPaneElementFactory(): PaneElementFactory<TransformerSettingsPaneElementParams> {
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
