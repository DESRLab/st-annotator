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

export interface GroundMeshSettingsInputtedData {
  showWireframe: boolean;
  opacity: number;
  blender: ColorBlenderPaneControllerParams["inputtedData"];
}

export interface GroundMeshSettingsComputedData {
  blender: ColorBlenderPaneControllerParams["computedData"];
}

export interface GroundMeshSettingsPaneSettings {
  disabled: boolean;
  hidden: boolean;
}

export interface GroundMeshSettings {
  showWireframe: boolean;
  opacity: number;
  blender: ColorBlender | null;
}

export interface GroundMeshSettingsPaneControllerParams {
  inputtedData: GroundMeshSettingsInputtedData;
  computedData: GroundMeshSettingsComputedData;
  settings: GroundMeshSettingsPaneSettings;
  internalData: ColorBlenderPaneControllerParams["internalData"];
  outputData: GroundMeshSettings;
}

type GroundMeshSettingsPaneElementParams =
  PaneElementParams<GroundMeshSettingsPaneControllerParams>;

/**
 * Represents a UI to configure the settings for a ground mesh.
 *
 */
/** Dummy arguments to pass into {@link PaneElementFactoryBuilder}. */
export const groundMeshSettingsPaneFactoryParams = {
  inputtedData: {
    showWireframe: true,
    opacity: 0.3,
    blender: colorBlenderPaneFactoryParams.inputtedData,
  },
  computedData: {
    blender: colorBlenderPaneFactoryParams.computedData,
  },
  settings: {
    ...colorBlenderPaneFactoryParams.settings,
  },
};

const groundMeshSettingsPaneColorBlenderParamsMapper: ParamsMapper<
  GroundMeshSettingsPaneElementParams,
  PaneElementParams<ColorBlenderPaneControllerParams>
> = {
  outerToInner: (outer) => ({
    inputtedData: outer.inputtedData.blender,
    computedData: outer.computedData.blender,
    settings: outer.settings,
  }),
  innerToOuter: (inner) => ({
    inputtedData: { blender: inner.inputtedData },
  }),
};

/**
 * Creates a {@link PaneElementFactory} that constructs a pane element for
 * {@link GroundMeshSettingsPaneElementParams}.
 *
 * The resulting pane element factory.
 */
export function createGroundMeshSettingsPaneElementFactory(): PaneElementFactory<
  GroundMeshSettingsPaneElementParams,
  {}
> {
  const builder = PaneElementFactoryBuilder.withoutEvents(
    groundMeshSettingsPaneFactoryParams,
  );

  return builder.sequential([
    builder.input(["inputtedData", "showWireframe"], {
      options: ({ settings: { disabled, hidden } }) => ({
        label: "Show Wireframe",
        disabled: disabled,
        hidden: hidden,
      }),
    }),
    builder.input(["inputtedData", "opacity"], {
      options: ({ settings: { disabled, hidden } }) => ({
        label: "Opacity",
        min: 0,
        max: 1,
        step: 0.01,
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
      groundMeshSettingsPaneColorBlenderParamsMapper,
      builder.identityEventMapper(),
    ),
  ]);
}

export const groundMeshSettingsPaneDataProcessor: PaneControllerDataProcessor<GroundMeshSettingsPaneControllerParams> =
  {
    computeData: (
      inputtedData: GroundMeshSettingsInputtedData,
      internalData: GroundMeshSettingsPaneControllerParams["internalData"],
    ): GroundMeshSettingsComputedData => {
      const blender = colorBlenderPaneDataProcessor.computeData(
        inputtedData.blender,
        internalData,
      );
      return { blender };
    },
    outputData: (
      paneParams: GroundMeshSettingsPaneElementParams,
    ): GroundMeshSettings => {
      const {
        inputtedData: { showWireframe, opacity },
      } = paneParams;
      const blender = colorBlenderPaneDataProcessor.outputData(
        groundMeshSettingsPaneColorBlenderParamsMapper.outerToInner(paneParams),
      );
      return { showWireframe, opacity, blender };
    },
  };
