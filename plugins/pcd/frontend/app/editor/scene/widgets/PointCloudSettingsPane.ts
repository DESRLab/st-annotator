import {
  PaneElementFactoryBuilder,
  colorBlenderPaneDataProcessor,
  colorBlenderPaneFactoryParams,
  createColorBlenderPaneElementFactory,
} from "sta/app/editor";
import type {
  PaneControllerDataProcessor,
  PaneElementFactory,
  PaneElementParams,
  ParamsMapper,
  ColorBlender,
  ColorBlenderPaneControllerParams,
} from "sta/app/editor";

export interface PointCloudSettingsInputtedData {
  removeBackground: boolean;
  cropArea: boolean;
  pointSize: number;
  blender: ColorBlenderPaneControllerParams["inputtedData"];
}

export interface PointCloudSettingsComputedData {
  blender: ColorBlenderPaneControllerParams["computedData"];
}

export interface PointCloudSettingsPaneSettings {
  disabled: boolean;
  hidden: boolean;
}

export interface PointCloudSettings {
  removeBackground: boolean;
  cropArea: boolean;
  pointSize: number;
  blender: ColorBlender | null;
}

/**
 * The pane data flow for the point cloud settings.
 *
 * Note `internalData` is the plain color blender target of the loaded point
 * cloud, not the point cloud model itself, so these params can safely flow
 * through React.
 */
export interface PointCloudSettingsPaneControllerParams {
  inputtedData: PointCloudSettingsInputtedData;
  computedData: PointCloudSettingsComputedData;
  settings: PointCloudSettingsPaneSettings;
  internalData: ColorBlenderPaneControllerParams["internalData"];
  outputData: PointCloudSettings;
}

type PointCloudSettingsPaneElementParams =
  PaneElementParams<PointCloudSettingsPaneControllerParams>;

/** Dummy arguments to pass into {@link PaneElementFactoryBuilder}. */
export const pointCloudSettingsPaneFactoryParams = {
  inputtedData: {
    removeBackground: true,
    cropArea: true,
    pointSize: 2,
    blender: colorBlenderPaneFactoryParams.inputtedData,
  },
  computedData: {
    blender: colorBlenderPaneFactoryParams.computedData,
  },
  settings: {
    ...colorBlenderPaneFactoryParams.settings,
  },
};

const pointCloudSettingsPaneColorBlenderParamsMapper: ParamsMapper<
  PointCloudSettingsPaneElementParams,
  PaneElementParams<ColorBlenderPaneControllerParams>
> = {
  outerToInner: (outer: Readonly<PointCloudSettingsPaneElementParams>) => ({
    inputtedData: outer.inputtedData.blender,
    computedData: outer.computedData.blender,
    settings: outer.settings,
  }),
  innerToOuter: (
    inner: Readonly<PaneElementParams<ColorBlenderPaneControllerParams>>,
  ) => ({ inputtedData: { blender: inner.inputtedData } }),
};

/** Obtains the settings for the remove background checkbox. */
export function getRemoveBackgroundCheckboxSettings({
  settings: { disabled, hidden },
}: {
  settings: PointCloudSettingsPaneSettings;
}): { label: string; disabled: boolean; hidden: boolean } {
  return { label: "RemoveBG", disabled, hidden };
}

/** Obtains the settings for the crop area checkbox. */
export function getCropAreaCheckboxSettings({
  settings: { disabled, hidden },
}: {
  settings: PointCloudSettingsPaneSettings;
}): { label: string; disabled: boolean; hidden: boolean } {
  return { label: "CropArea", disabled, hidden };
}

/** Creates a {@link PaneElementFactory} for {@link PointCloudSettingsPaneElementParams}. */
export function createPointCloudSettingsPaneElementFactory(): PaneElementFactory<PointCloudSettingsPaneElementParams> {
  const builder = PaneElementFactoryBuilder.withoutEvents(
    pointCloudSettingsPaneFactoryParams,
  );

  return builder.sequential([
    builder.input(["inputtedData", "removeBackground"], {
      options: getRemoveBackgroundCheckboxSettings,
    }),
    builder.input(["inputtedData", "cropArea"], {
      options: getCropAreaCheckboxSettings,
    }),
    builder.input(["inputtedData", "pointSize"], {
      options: ({ settings: { disabled, hidden } }) => ({
        label: "Point Size",
        min: 0,
        max: 4,
        step: 0.1,
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
    builder.mapped(
      createColorBlenderPaneElementFactory(),
      pointCloudSettingsPaneColorBlenderParamsMapper,
      builder.identityEventMapper(),
    ),
  ]);
}

export const pointCloudSettingsPaneDataProcessor: PaneControllerDataProcessor<PointCloudSettingsPaneControllerParams> =
  {
    computeData: (
      inputtedData: Readonly<PointCloudSettingsInputtedData>,
      internalData: Readonly<
        PointCloudSettingsPaneControllerParams["internalData"]
      >,
    ) => ({
      blender: colorBlenderPaneDataProcessor.computeData(
        inputtedData.blender,
        internalData,
      ),
    }),
    outputData: (
      paneParams: Readonly<
        PaneElementParams<PointCloudSettingsPaneControllerParams>
      >,
    ) => {
      const {
        inputtedData: { removeBackground, cropArea, pointSize },
      } = paneParams;
      const blender = colorBlenderPaneDataProcessor.outputData(
        pointCloudSettingsPaneColorBlenderParamsMapper.outerToInner(paneParams),
      );
      return { removeBackground, cropArea, pointSize, blender };
    },
  };
