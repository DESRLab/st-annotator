import {
  PaneElementFactoryBuilder,
  createViewModePaneElementFactory,
  getViewModeSelectSettings,
  viewModePaneDataProcessor,
} from "sta/app/editor";
import type {
  PaneControllerDataProcessor,
  PaneElementFactory,
  PaneElementParams,
  ParamsMapper,
  ViewMode,
  ViewModePaneParams,
} from "sta/app/editor";

export interface MainCameraSettingsInputtedData {
  viewMode: ViewMode;
  orbitPoint: boolean;
}

export interface MainCameraSettingsPaneSettings {
  disabled: boolean;
  hidden: boolean;
}

export interface MainCameraSettings {
  viewMode: ViewMode;
  orbitPoint: boolean;
}

export interface MainCameraSettingsPaneControllerParams {
  inputtedData: MainCameraSettingsInputtedData;
  computedData: {};
  settings: MainCameraSettingsPaneSettings;
  internalData: {};
  outputData: MainCameraSettings;
}

type MainCameraSettingsPaneElementParams =
  PaneElementParams<MainCameraSettingsPaneControllerParams>;

/** Dummy arguments to pass into {@link PaneElementFactoryBuilder}. */
export const mainCameraSettingsPaneFactoryParams = {
  inputtedData: {
    viewMode: "2D" as ViewMode,
    orbitPoint: false,
  },
  computedData: {},
  settings: {
    disabled: false,
    hidden: false,
  },
};

const mainCameraSettingsPaneViewModeParamsMapper: ParamsMapper<
  MainCameraSettingsPaneElementParams,
  PaneElementParams<ViewModePaneParams>
> = {
  outerToInner: (outer: Readonly<MainCameraSettingsPaneElementParams>) => ({
    inputtedData: { viewMode: outer.inputtedData.viewMode },
    computedData: outer.computedData,
    settings: outer.settings,
  }),
  innerToOuter: (inner: Readonly<PaneElementParams<ViewModePaneParams>>) => ({
    inputtedData: inner.inputtedData,
  }),
};

/** Obtains the settings for the view mode selector. */
export function getMainCameraViewModeSelectSettings(
  paneParams: Readonly<MainCameraSettingsPaneElementParams>,
) {
  const selectParams =
    mainCameraSettingsPaneViewModeParamsMapper.outerToInner(paneParams);
  return getViewModeSelectSettings(selectParams);
}

/** Obtains the settings for the orbit point checkbox. */
export function getOrbitPointCheckboxSettings({
  settings: { disabled, hidden },
}: {
  settings: MainCameraSettingsPaneSettings;
}): { label: string; disabled: boolean; hidden: boolean } {
  return { label: "Orbit Point", disabled, hidden };
}

/** Creates a {@link PaneElementFactory} for {@link MainCameraSettingsPaneElementParams}. */
export function createMainCameraSettingsPaneElementFactory(): PaneElementFactory<MainCameraSettingsPaneElementParams> {
  const builder = PaneElementFactoryBuilder.withoutEvents(
    mainCameraSettingsPaneFactoryParams,
  );

  return builder.sequential([
    builder.mapped(
      createViewModePaneElementFactory(),
      mainCameraSettingsPaneViewModeParamsMapper,
      builder.identityEventMapper(),
    ),
    builder.input(["inputtedData", "orbitPoint"], {
      options: getOrbitPointCheckboxSettings,
    }),
  ]);
}

export const mainCameraSettingsPaneDataProcessor: PaneControllerDataProcessor<MainCameraSettingsPaneControllerParams> =
  {
    computeData: (
      _inputtedData: Readonly<MainCameraSettingsInputtedData>,
      _internalData: Readonly<{}>,
    ) => ({}),
    outputData: (
      paneParams: Readonly<
        PaneElementParams<MainCameraSettingsPaneControllerParams>
      >,
    ) => {
      const {
        inputtedData: { orbitPoint },
      } = paneParams;
      const { viewMode } = viewModePaneDataProcessor.outputData(
        mainCameraSettingsPaneViewModeParamsMapper.outerToInner(paneParams),
      );
      return { viewMode, orbitPoint };
    },
  };
