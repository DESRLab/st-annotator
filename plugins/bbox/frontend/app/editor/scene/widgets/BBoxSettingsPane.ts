import { cloneDeep } from "lodash";
import { PaneElementFactoryBuilder, withPaneState } from "sta/app/editor";
import type {
  PaneControllerDataProcessor,
  PaneElementFactory,
  PaneElementParams,
  ColorRGB,
} from "sta/app/editor";

export interface BBoxSettingsInputtedData {
  timePathRange: number;
  maintainRelativeElevation: boolean;
  showPerceivedClass: boolean;
  showTooltips: boolean;
  showOcclusion: boolean;
  showDistinctiveness: boolean;
  showTimestampDiff: boolean;
  showTrackBoxId: boolean;
  boxTransparency: boolean;
  boxOpacity: number;
  hoveredBoxColor: Readonly<ColorRGB>;
  selectedBoxColor: Readonly<ColorRGB>;
}

export interface BBoxSettingsPaneSettings {
  disabled: boolean;
  hidden: boolean;
  disallowRelativeElevation: boolean;
  maxTimePathRange: number;
}

export interface BBoxSettings {
  timePathRange: number;
  maintainRelativeElevation: boolean;
  showPerceivedClass: boolean;
  showTooltips: boolean;
  showOcclusion: boolean;
  showDistinctiveness: boolean;
  showTimestampDiff: boolean;
  showTrackBoxId: boolean;
  boxOpacity: number;
  hoveredBoxColor: Readonly<ColorRGB>;
  selectedBoxColor: Readonly<ColorRGB>;
}

export interface BBoxSettingsPaneControllerParams {
  inputtedData: BBoxSettingsInputtedData;
  computedData: {};
  settings: BBoxSettingsPaneSettings;
  internalData: {};
  outputData: BBoxSettings;
}

/** The maximum range of time-path frames the settings pane allows. */
export const bboxSettingsPaneMaxTimePathRange = 10;

interface BBoxSettingsPaneState {
  inactiveMaintainRelativeElevation: boolean | null;
  inactiveBoxOpacity: number | null;
}

type BBoxSettingsPaneElementParams =
  PaneElementParams<BBoxSettingsPaneControllerParams>;

/**
 * Represents a UI to configure the settings for an {@link BBoxView}.
 *
 */

/**
 * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
 */
export const bboxSettingsPaneFactoryParams = {
  inputtedData: {
    timePathRange: 20,
    maintainRelativeElevation: true,
    showPerceivedClass: true,
    showTooltips: false,
    boxTransparency: false,
    showOcclusion: true,
    showDistinctiveness: false,
    showTimestampDiff: false,
    showTrackBoxId: false,
    boxOpacity: 0.2,
    hoveredBoxColor: { r: 1, g: 0, b: 0 }, // red
    selectedBoxColor: { r: 0, g: 0, b: 1 }, // blue
  },
  computedData: {},
  settings: {
    disabled: false,
    hidden: false,
    disallowRelativeElevation: true,
    maxTimePathRange: 10,
  },
};

/**
 * Obtains the settings for the maintain relative elevation checkbox.
 *
 * The parameters of the pane.
 */
export function getMaintainRelElevCheckboxSettings({
  settings: { disabled, hidden, disallowRelativeElevation },
}: Readonly<BBoxSettingsPaneElementParams>): {
  label: string;
  disabled: boolean;
  hidden: boolean;
} {
  return {
    label: "Maintain elevation\nrelative to ground mesh",
    disabled: disabled || disallowRelativeElevation,
    hidden: hidden,
  };
}

/**
 * Obtains the settings for the show perceived class checkbox.
 *
 * The parameters of the pane.
 */
export function getShowPerceivedClassCheckboxSettings({
  settings: { disabled, hidden },
}: Readonly<BBoxSettingsPaneElementParams>): {
  label: string;
  disabled: boolean;
  hidden: boolean;
} {
  return {
    label: "Show perceived class",
    disabled: disabled,
    hidden: hidden,
  };
}

/**
 * Obtains the settings for the show tooltips checkbox.
 *
 * The parameters of the pane.
 */
export function getShowTooltipsCheckboxSettings({
  settings: { disabled, hidden },
}: Readonly<BBoxSettingsPaneElementParams>): {
  label: string;
  disabled: boolean;
  hidden: boolean;
} {
  return {
    label: "Show tooltips",
    disabled: disabled,
    hidden: hidden,
  };
}

/**
 * Obtains the settings for the show track info checkbox.
 *
 * The parameters of the pane.
 */
export function getShowTrackBoxIdCheckboxSettings({
  settings: { disabled, hidden },
}: Readonly<BBoxSettingsPaneElementParams>): {
  label: string;
  disabled: boolean;
  hidden: boolean;
} {
  return {
    label: "Show Track & Box IDs",
    disabled: disabled,
    hidden: hidden,
  };
}

/**
 * Obtains the settings for the show bbox descriptors checkbox.
 *
 * The parameters of the pane.
 */
export function getShowOcclusionCheckboxSettings({
  settings: { disabled, hidden },
}: Readonly<BBoxSettingsPaneElementParams>): {
  label: string;
  disabled: boolean;
  hidden: boolean;
} {
  return {
    label: "Show Occlusion",
    disabled: disabled,
    hidden: hidden,
  };
}

/**
 * Obtains the settings for the show bbox distinctiveness descriptor checkbox.
 *
 * The parameters of the pane.
 */
export function getShowDistinctivenessCheckboxSettings({
  settings: { disabled, hidden },
}: Readonly<BBoxSettingsPaneElementParams>): {
  label: string;
  disabled: boolean;
  hidden: boolean;
} {
  return {
    label: "Show Distinctiveness",
    disabled: disabled,
    hidden: hidden,
  };
}

/**
 * Obtains the settings for the show bbox Timestamp Diff. checkbox.
 *
 * The parameters of the pane.
 */
export function getShowTimestampDiffCheckboxSettings({
  settings: { disabled, hidden },
}: Readonly<BBoxSettingsPaneElementParams>): {
  label: string;
  disabled: boolean;
  hidden: boolean;
} {
  return {
    label: "Show Timestamp Diff.",
    disabled: disabled,
    hidden: hidden,
  };
}

/**
 * Obtains the settings for the box transparency checkbox.
 *
 * The parameters of the pane.
 */
export function getBoxTransparencyCheckboxSettings({
  settings: { disabled, hidden },
}: Readonly<BBoxSettingsPaneElementParams>): {
  label: string;
  disabled: boolean;
  hidden: boolean;
} {
  return {
    label: "Transparent Faces",
    disabled: disabled,
    hidden: hidden,
  };
}

/**
 * Creates a {@link PaneElementFactory} that constructs a pane element for
 * {@link BBoxSettingsPaneElementParams}.
 *
 * The resulting pane element factory.
 */
export function createBBoxSettingsPaneElementFactory(): PaneElementFactory<BBoxSettingsPaneElementParams> {
  const builder = PaneElementFactoryBuilder.withoutEvents(
    bboxSettingsPaneFactoryParams,
  );

  const OPACITY_STEP = 0.01;

  return withPaneState<
    BBoxSettingsPaneElementParams,
    {},
    BBoxSettingsPaneState
  >(
    builder.sequential([
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
      builder.input(["inputtedData", "maintainRelativeElevation"], {
        options: getMaintainRelElevCheckboxSettings,
      }),
      builder.separator({
        options: ({ settings: { disabled, hidden } }) => ({
          disabled,
          hidden,
        }),
      }),
      builder.input(["inputtedData", "showPerceivedClass"], {
        options: getShowPerceivedClassCheckboxSettings,
      }),
      builder.input(["inputtedData", "showTooltips"], {
        options: getShowTooltipsCheckboxSettings,
      }),
      builder.input(["inputtedData", "showOcclusion"], {
        options: getShowOcclusionCheckboxSettings,
      }),
      builder.input(["inputtedData", "showDistinctiveness"], {
        options: getShowDistinctivenessCheckboxSettings,
      }),
      builder.input(["inputtedData", "showTimestampDiff"], {
        options: getShowTimestampDiffCheckboxSettings,
      }),
      builder.input(["inputtedData", "showTrackBoxId"], {
        options: getShowTrackBoxIdCheckboxSettings,
      }),
      builder.separator({
        options: ({ settings: { disabled, hidden } }) => ({
          disabled,
          hidden,
        }),
      }),
      builder.input(["inputtedData", "boxTransparency"], {
        options: getBoxTransparencyCheckboxSettings,
      }),
      builder.input(["inputtedData", "boxOpacity"], {
        options: ({
          inputtedData: { boxTransparency },
          settings: { disabled, hidden },
        }) => ({
          label: "Face opacity",
          min: 0,
          max: 1,
          step: OPACITY_STEP,
          disabled: disabled || boxTransparency,
          hidden: hidden,
        }),
      }),
      builder.separator({
        options: ({ settings: { disabled, hidden } }) => ({
          disabled,
          hidden,
        }),
      }),
      builder.input(["inputtedData", "hoveredBoxColor"], {
        options: ({ settings: { disabled, hidden } }) => ({
          color: { alpha: false, type: "float" },
          label: "Hover color",
          disabled: disabled,
          hidden: hidden,
        }),
      }),
      builder.input(["inputtedData", "selectedBoxColor"], {
        options: ({ settings: { disabled, hidden } }) => ({
          color: { alpha: false, type: "float" },
          label: "Select color",
          disabled: disabled,
          hidden: hidden,
        }),
      }),
    ]),
    ({ params: prevParams, state: prevState }, params) => {
      const nextParams = cloneDeep(params);

      const nextState = cloneDeep(prevState) as BBoxSettingsPaneState;

      // Manage interactions between [disallow/maintain]RelativeElevation
      {
        const prevDisallowRE = prevParams.settings.disallowRelativeElevation;
        const prevMaintainRE =
          prevParams.inputtedData.maintainRelativeElevation;
        const prevInactiveMaintainRE =
          prevState.inactiveMaintainRelativeElevation;

        const disallowRE = params.settings.disallowRelativeElevation;
        const maintainRE = params.inputtedData.maintainRelativeElevation;

        const updateDisallowRE = prevDisallowRE !== disallowRE;
        const updateMaintainRE = prevMaintainRE !== maintainRE;

        let nextMaintainRE;

        let nextInactiveMaintainRE;

        if (updateDisallowRE) {
          if (prevInactiveMaintainRE == null) {
            // disallowRelativeElevation: false -> true
            nextInactiveMaintainRE = prevMaintainRE;
            nextMaintainRE = false;
          } else {
            // disallowRelativeElevation: true -> false
            nextMaintainRE = updateMaintainRE
              ? maintainRE
              : prevInactiveMaintainRE;
            nextInactiveMaintainRE = null;
          }
        } else {
          nextMaintainRE = maintainRE;
          nextInactiveMaintainRE = updateMaintainRE
            ? null
            : prevInactiveMaintainRE;
        }

        nextParams.inputtedData.maintainRelativeElevation = nextMaintainRE;
        nextState.inactiveMaintainRelativeElevation = nextInactiveMaintainRE;
      }

      // Manage interactions between box[Transparency/Opacity]
      {
        const prevTransparency = prevParams.inputtedData.boxTransparency;
        const prevOpacity = prevParams.inputtedData.boxOpacity;
        const prevInactiveOpacity = prevState.inactiveBoxOpacity;

        const transparency = params.inputtedData.boxTransparency;
        const opacity = params.inputtedData.boxOpacity;

        const updateTransparency = prevTransparency !== transparency;
        const updateOpacity =
          Math.abs(prevOpacity - opacity) >= OPACITY_STEP / 2;

        let nextOpacity;

        let nextInactiveOpacity;

        if (updateTransparency) {
          if (prevInactiveOpacity == null) {
            // boxTransparency: false -> true
            nextInactiveOpacity = prevOpacity;
            nextOpacity = 0;
          } else {
            // boxTransparency: true -> false
            nextOpacity = updateOpacity ? opacity : prevInactiveOpacity;
            nextInactiveOpacity = null;
          }
        } else {
          nextOpacity = opacity;
          nextInactiveOpacity = updateOpacity ? null : prevInactiveOpacity;
        }

        nextParams.inputtedData.boxOpacity = nextOpacity;
        nextState.inactiveBoxOpacity = nextInactiveOpacity;
      }

      return { params: nextParams, state: nextState };
    },
    {
      inactiveMaintainRelativeElevation: null,
      inactiveBoxOpacity: null,
    },
  );
}

export const bboxSettingsPaneDataProcessor: PaneControllerDataProcessor<BBoxSettingsPaneControllerParams> =
  {
    computeData: (
      inputtedData: BBoxSettingsPaneControllerParams["inputtedData"],
      internalData: BBoxSettingsPaneControllerParams["internalData"],
    ) => ({}),
    outputData: (paneParams: Readonly<BBoxSettingsPaneElementParams>) => {
      const {
        inputtedData: {
          timePathRange,
          maintainRelativeElevation,
          showPerceivedClass,
          showTooltips,
          showOcclusion,
          showDistinctiveness,
          showTimestampDiff,
          showTrackBoxId: showTrackId,
          boxTransparency,
          boxOpacity,
          hoveredBoxColor,
          selectedBoxColor,
        },
        settings: { disallowRelativeElevation },
      } = paneParams;

      return {
        timePathRange: timePathRange,
        maintainRelativeElevation: disallowRelativeElevation
          ? false
          : maintainRelativeElevation,
        showPerceivedClass: showPerceivedClass,
        showTooltips: showTooltips,
        showOcclusion: showOcclusion,
        showDistinctiveness: showDistinctiveness,
        showTimestampDiff: showTimestampDiff,
        showTrackBoxId: showTrackId,
        boxOpacity: boxTransparency ? 0 : boxOpacity,
        hoveredBoxColor: { ...hoveredBoxColor },
        selectedBoxColor: { ...selectedBoxColor },
      };
    },
  };

export function getBBoxSettingsOutputData(
  paneParams: Readonly<BBoxSettingsPaneElementParams>,
): BBoxSettings {
  return bboxSettingsPaneDataProcessor.outputData(paneParams);
}
