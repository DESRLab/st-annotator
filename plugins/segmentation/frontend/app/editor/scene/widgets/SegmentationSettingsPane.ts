import { cloneDeep } from "lodash";
import { PaneElementFactoryBuilder, withPaneState } from "sta/app/editor";
import type {
  PaneControllerDataProcessor,
  PaneElementFactory,
  PaneElementParams,
  ColorRGB,
} from "sta/app/editor";

export interface SegmentationSettingsInputtedData {
  useAssistant: boolean;
  timePathRange: number;
  showTooltips: boolean;
  showPerceivedClass: boolean;
  showOcclusion: boolean;
  showDistinctiveness: boolean;
  showTimestampDiff: boolean;
  showTrackSegId: boolean;
  selectionTransparency: boolean;
  selectionOpacity: number;
  brushDiameter: number;
  brushHueStyle: number;
  strokeColor: ColorRGB;
  hoveredSelectionColor: ColorRGB;
  selectedSelectionColor: ColorRGB;
}

export interface SegmentationSettingsPaneSettings {
  disabled: boolean;
  hidden: boolean;
  isAssistantAvailable: boolean;
  maxTimePathRange: number;
  maxBrushDiameter: number;
  maxBrushHueStyle: number;
}

export interface SegmentationSettings {
  useAssistant: boolean;
  timePathRange: number;
  showTooltips: boolean;
  showPerceivedClass: boolean;
  showOcclusion: boolean;
  showDistinctiveness: boolean;
  showTimestampDiff: boolean;
  showTrackSegId: boolean;
  selectionTransparency: boolean;
  selectionOpacity: number;
  brushDiameter: number;
  brushHueStyle: number;
  strokeColor: Readonly<ColorRGB>;
  hoveredSelectionColor: Readonly<ColorRGB>;
  selectedSelectionColor: Readonly<ColorRGB>;
}

export interface SegmentationSettingsPaneControllerParams {
  inputtedData: SegmentationSettingsInputtedData;
  computedData: {};
  settings: SegmentationSettingsPaneSettings;
  internalData: {};
  outputData: SegmentationSettings;
}

/** The maximum range of time-path frames the settings pane allows. */
export const segmentationSettingsPaneMaxTimePathRange = 10;

/** The maximum brush diameter the settings pane allows. */
export const segmentationSettingsPaneMaxBrushDiameter = 100;

/** The maximum brush hue style the settings pane allows. */
export const segmentationSettingsPaneMaxBrushHueStyle = 1;
const OPACITY_STEP = 0.01;

type SegmentationSettingsPaneElementParams =
  PaneElementParams<SegmentationSettingsPaneControllerParams>;

/**
 * Represents a UI to configure the settings for an {@link SegmentationView}.
 *
 */
/** Dummy arguments to pass into {@link PaneElementFactoryBuilder}. */
export const segmentationSettingsPaneFactoryParams = {
  inputtedData: {
    useAssistant: false,
    timePathRange: 5,
    showTooltips: false,
    brushDiameter: 40,
    brushHueStyle: 0.3,
    showPerceivedClass: false,
    showOcclusion: true,
    showDistinctiveness: false,
    showTimestampDiff: false,
    showTrackSegId: false,
    selectionTransparency: true,
    selectionOpacity: 0.5,
    strokeColor: { r: 1, g: 0, b: 0 }, // red
    hoveredSelectionColor: { r: 1, g: 0, b: 0 }, // red
    selectedSelectionColor: { r: 1, g: 1, b: 0 }, // yellow
  },
  computedData: {},
  settings: {
    disabled: false,
    hidden: false,
    isAssistantAvailable: false,
    maxTimePathRange: 10,
    maxBrushDiameter: 100,
    maxBrushHueStyle: 1,
  },
};

/**
 * Obtains the settings for the use assistant checkbox.
 *
 * The parameters of the pane.
 */
export function getSegmentationUseAssistantCheckboxSettings({
  settings: { hidden },
}: Readonly<SegmentationSettingsPaneElementParams>): {
  label: string;
  disabled: boolean;
  hidden: boolean;
} {
  return {
    label: "Use Assistant",
    // This is a preference, not an interaction with the loaded label data.
    // Keep it editable while data loads or the one-time health probe settles;
    // the layer separately gates assistant interaction on availability.
    disabled: false,
    hidden,
  };
}

/**
 * Obtains the settings for the show tooltips checkbox.
 *
 * The parameters of the pane.
 */
export function getSegmentationShowTooltipsCheckboxSettings({
  settings: { disabled, hidden },
}: Readonly<SegmentationSettingsPaneElementParams>): {
  label: string;
  disabled: boolean;
  hidden: boolean;
} {
  return { label: "Show tooltips", disabled, hidden };
}

/**
 * Obtains the settings for the show occlusion checkbox.
 *
 * The parameters of the pane.
 */
export function getSegmentationShowOcclusionCheckboxSettings({
  settings: { disabled, hidden },
}: Readonly<SegmentationSettingsPaneElementParams>): {
  label: string;
  disabled: boolean;
  hidden: boolean;
} {
  return { label: "Show Occlusion", disabled, hidden };
}

/**
 * Obtains the settings for the show distinctiveness checkbox.
 *
 * The parameters of the pane.
 */
export function getSegmentationShowDistinctivenessCheckboxSettings({
  settings: { disabled, hidden },
}: Readonly<SegmentationSettingsPaneElementParams>): {
  label: string;
  disabled: boolean;
  hidden: boolean;
} {
  return { label: "Show Distinctiveness", disabled, hidden };
}

/**
 * Obtains the settings for the show Timestamp Diff. checkbox.
 *
 * The parameters of the pane.
 */
export function getSegmentationShowTimestampDiffCheckboxSettings({
  settings: { disabled, hidden },
}: Readonly<SegmentationSettingsPaneElementParams>): {
  label: string;
  disabled: boolean;
  hidden: boolean;
} {
  return { label: "Show Timestamp Diff.", disabled, hidden };
}

/**
 * Obtains the settings for the show track and segment IDs checkbox.
 *
 * The parameters of the pane.
 */
export function getSegmentationShowTrackSegIdCheckboxSettings({
  settings: { disabled, hidden },
}: Readonly<SegmentationSettingsPaneElementParams>): {
  label: string;
  disabled: boolean;
  hidden: boolean;
} {
  return { label: "Show Track & Segment IDs", disabled, hidden };
}

/**
 * Creates a {@link PaneElementFactory} that constructs a pane element for
 * {@link SegmentationSettingsPaneElementParams}.
 *
 * The resulting pane element factory.
 */
export function createSegmentationSettingsPaneElementFactory(): PaneElementFactory<SegmentationSettingsPaneElementParams> {
  const builder = PaneElementFactoryBuilder.withoutEvents(
    segmentationSettingsPaneFactoryParams,
  );

  return withPaneState(
    builder.sequential([
      builder.input(["inputtedData", "useAssistant"], {
        options: getSegmentationUseAssistantCheckboxSettings,
      }),
      builder.separator({
        options: ({ settings: { disabled, hidden } }) => ({
          disabled,
          hidden,
        }),
      }),
      builder.input(["inputtedData", "timePathRange"], {
        options: ({ settings: { disabled, hidden, maxTimePathRange } }) => ({
          label: "Time-Path Range",
          min: 0,
          max: maxTimePathRange,
          step: 1,
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
      builder.input(["inputtedData", "showTooltips"], {
        options: getSegmentationShowTooltipsCheckboxSettings,
      }),
      builder.input(["inputtedData", "showOcclusion"], {
        options: getSegmentationShowOcclusionCheckboxSettings,
      }),
      builder.input(["inputtedData", "showDistinctiveness"], {
        options: getSegmentationShowDistinctivenessCheckboxSettings,
      }),
      builder.input(["inputtedData", "showTimestampDiff"], {
        options: getSegmentationShowTimestampDiffCheckboxSettings,
      }),
      builder.input(["inputtedData", "showTrackSegId"], {
        options: getSegmentationShowTrackSegIdCheckboxSettings,
      }),
      builder.separator({
        options: ({ settings: { disabled, hidden } }) => ({
          disabled,
          hidden,
        }),
      }),
      builder.input(["inputtedData", "showPerceivedClass"], {
        options: getSegmentationShowPerceivedClassCheckboxSettings,
      }),
      builder.input(["inputtedData", "selectionTransparency"], {
        options: ({ settings: { disabled, hidden } }) => ({
          label: "Transparent Points",
          disabled,
          hidden,
        }),
      }),
      builder.input(["inputtedData", "selectionOpacity"], {
        options: ({
          inputtedData: { selectionTransparency },
          settings: { disabled, hidden },
        }) => ({
          label: "Point opacity",
          min: 0,
          max: 1,
          step: OPACITY_STEP,
          disabled: disabled || !selectionTransparency,
          hidden,
        }),
      }),
      builder.separator({
        options: ({ settings: { disabled, hidden } }) => ({
          disabled,
          hidden,
        }),
      }),
      builder.input(["inputtedData", "brushDiameter"], {
        options: ({ settings: { disabled, hidden, maxBrushDiameter } }) => ({
          label: "Brush Diameter",
          min: 10,
          max: maxBrushDiameter,
          step: 1,
          disabled: disabled,
          hidden: hidden,
        }),
      }),
      builder.input(["inputtedData", "brushHueStyle"], {
        options: ({ settings: { disabled, hidden, maxBrushHueStyle } }) => ({
          label: "Brush Hue",
          min: 0.1,
          max: maxBrushHueStyle,
          step: 0.1,
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
      builder.input(["inputtedData", "hoveredSelectionColor"], {
        options: ({ settings: { disabled, hidden } }) => ({
          color: { alpha: false, type: "float" },
          label: "Hover color",
          disabled: disabled,
          hidden: hidden,
        }),
      }),
      builder.input(["inputtedData", "selectedSelectionColor"], {
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

export const segmentationSettingsPaneDataProcessor: PaneControllerDataProcessor<SegmentationSettingsPaneControllerParams> =
  {
    computeData: (
      inputtedData: SegmentationSettingsPaneControllerParams["inputtedData"],
      internalData: SegmentationSettingsPaneControllerParams["internalData"],
    ) => ({}),
    outputData: (
      paneParams: Readonly<SegmentationSettingsPaneElementParams>,
    ) => {
      const {
        inputtedData: {
          useAssistant,
          timePathRange,
          showTooltips,
          showPerceivedClass,
          showOcclusion,
          showDistinctiveness,
          showTimestampDiff,
          showTrackSegId,
          selectionTransparency,
          selectionOpacity,
          brushDiameter,
          brushHueStyle,
          strokeColor,
          hoveredSelectionColor,
          selectedSelectionColor,
        },
      } = paneParams;

      return {
        useAssistant: useAssistant,
        timePathRange: timePathRange,
        showTooltips: showTooltips,
        showPerceivedClass: showPerceivedClass,
        showOcclusion: showOcclusion,
        showDistinctiveness: showDistinctiveness,
        showTimestampDiff: showTimestampDiff,
        showTrackSegId: showTrackSegId,
        selectionTransparency,
        selectionOpacity,
        brushDiameter: brushDiameter,
        brushHueStyle: brushHueStyle,
        strokeColor: { ...strokeColor },
        hoveredSelectionColor: { ...hoveredSelectionColor },
        selectedSelectionColor: { ...selectedSelectionColor },
      };
    },
  };

export function getSegmentationSettingsOutputData(
  paneParams: Readonly<SegmentationSettingsPaneElementParams>,
): SegmentationSettings {
  return segmentationSettingsPaneDataProcessor.outputData(paneParams);
}

/**
 * Obtains the settings for the show perceived class checkbox.
 *
 * The parameters of the pane.
 */
export function getSegmentationShowPerceivedClassCheckboxSettings({
  settings: { disabled, hidden },
}: Readonly<SegmentationSettingsPaneElementParams>): {
  label: string;
  disabled: boolean;
  hidden: boolean;
} {
  return { label: "Show perceived class", disabled, hidden };
}

/**
 * Creates a new UI to configure the settings for an {@link SegmentationView}.
 *
 * The initial state to set.
 */
