import { cloneDeep } from "lodash";
import { PaneElementFactoryBuilder, withPaneState } from "sta/app/editor";
import type {
  PaneControllerDataProcessor,
  PaneElementFactory,
  PaneElementParams,
  ColorRGB,
} from "sta/app/editor";

export interface VectorSettingsInputtedData {
  showTooltips: boolean;
  showVectorId: boolean;
  strokeWidth: number;
  strokeColor: Readonly<ColorRGB>;
  hoveredVectorColor: Readonly<ColorRGB>;
  selectedVectorColor: Readonly<ColorRGB>;
}

export interface VectorSettingsPaneSettings {
  disabled: boolean;
  hidden: boolean;
}

export interface VectorSettings {
  showTooltips: boolean;
  showVectorId: boolean;
  strokeWidth: number;
  strokeColor: Readonly<ColorRGB>;
  hoveredVectorColor: Readonly<ColorRGB>;
  selectedVectorColor: Readonly<ColorRGB>;
}

export interface VectorSettingsPaneControllerParams {
  inputtedData: VectorSettingsInputtedData;
  computedData: {};
  settings: VectorSettingsPaneSettings;
  internalData: {};
  outputData: VectorSettings;
}

type VectorSettingsPaneElementParams =
  PaneElementParams<VectorSettingsPaneControllerParams>;

/**
 * Represents a UI to configure the settings for an {@link VectorView}
 *
 */
/** Dummy arguments to pass into {@link PaneElementFactoryBuilder}. */
export const vectorSettingsPaneFactoryParams = {
  inputtedData: {
    showTooltips: false,
    showVectorId: false,
    strokeWidth: 3,
    strokeColor: { r: 1, g: 0, b: 0 }, // red
    hoveredVectorColor: { r: 1, g: 1, b: 0 }, // yellow
    selectedVectorColor: { r: 0, g: 0, b: 1 }, // blue
  },
  computedData: {},
  settings: {
    disabled: false,
    hidden: false,
  },
};

/**
 * Obtains the settings for the show tooltips checkbox.
 *
 * The parameters of the pane.
 */
export function getVectorShowTooltipsCheckboxSettings({
  settings: { disabled, hidden },
}: VectorSettingsPaneElementParams): {
  label: string;
  disabled: boolean;
  hidden: boolean;
} {
  return { label: "Show tooltips", disabled, hidden };
}

/**
 * Obtains the settings for the show vector id checkbox.
 *
 * The parameters of the pane.
 */
export function getVectorShowVectorIdCheckboxSettings({
  settings: { disabled, hidden },
}: VectorSettingsPaneElementParams): {
  label: string;
  disabled: boolean;
  hidden: boolean;
} {
  return { label: "Show Vector ID", disabled, hidden };
}

/**
 * Creates a {@link PaneElementFactory} that constructs a pane element for
 * {@link VectorSettingsPaneElementParams}
 *
 * The resulting pane element factory.
 */
export function createVectorSettingsPaneElementFactory(): PaneElementFactory<VectorSettingsPaneElementParams> {
  const builder = PaneElementFactoryBuilder.withoutEvents(
    vectorSettingsPaneFactoryParams,
  );

  const STROKE_WIDTH_STEP = 1;

  return withPaneState(
    builder.sequential([
      builder.input(["inputtedData", "showTooltips"], {
        options: getVectorShowTooltipsCheckboxSettings,
      }),
      builder.separator({
        options: ({ settings: { disabled, hidden } }) => ({
          disabled,
          hidden,
        }),
      }),
      builder.input(["inputtedData", "showVectorId"], {
        options: getVectorShowVectorIdCheckboxSettings,
      }),
      builder.input(["inputtedData", "strokeWidth"], {
        options: ({ settings: { disabled, hidden } }) => ({
          label: "stroke width",
          min: 1,
          max: 10,
          step: STROKE_WIDTH_STEP,
          disabled: disabled,
          hidden: hidden,
        }),
      }),
      builder.input(["inputtedData", "strokeColor"], {
        options: ({ settings: { disabled, hidden } }) => ({
          color: { alpha: false, type: "float" },
          label: "stroke color",
          disabled: disabled,
          hidden: hidden,
        }),
      }),
      builder.separator({
        options: ({ settings: { disabled, hidden } }) => ({
          disabled,
          hidden,
        }),
      }),
      builder.input(["inputtedData", "hoveredVectorColor"], {
        options: ({ settings: { disabled, hidden } }) => ({
          color: { alpha: false, type: "float" },
          label: "Hover color",
          disabled: disabled,
          hidden: hidden,
        }),
      }),
      builder.input(["inputtedData", "selectedVectorColor"], {
        options: ({ settings: { disabled, hidden } }) => ({
          color: { alpha: false, type: "float" },
          label: "Select color",
          disabled: disabled,
          hidden: hidden,
        }),
      }),
    ]),
    ({ params: prevParams, state: prevState }, params) => {
      // The color field selection tends to lose the color information [r,g,b] of selected
      // colors upon chaning color in a different field. by cloning the params we can
      // preserve the state of elements in the pane to solve this issue.

      const nextParams = cloneDeep(params);
      return { params: nextParams, state: prevState };
    },
    {},
  );
}

export const vectorSettingsPaneDataProcessor: PaneControllerDataProcessor<VectorSettingsPaneControllerParams> =
  {
    computeData: () => ({}),
    outputData: (paneParams) => {
      const {
        inputtedData: {
          showTooltips,
          showVectorId,
          strokeWidth,
          strokeColor,
          hoveredVectorColor,
          selectedVectorColor,
        },
      } = paneParams;
      return {
        showTooltips,
        showVectorId,
        strokeWidth,
        strokeColor: { ...strokeColor },
        hoveredVectorColor: { ...hoveredVectorColor },
        selectedVectorColor: { ...selectedVectorColor },
      };
    },
  };

export function getVectorSettingsOutputData(
  paneParams: Readonly<VectorSettingsPaneElementParams>,
): VectorSettings {
  return vectorSettingsPaneDataProcessor.outputData(paneParams);
}
