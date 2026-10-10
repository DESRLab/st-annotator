import { cloneDeep } from "lodash";
import * as math from "mathjs";

import type { Expand } from "sta/common";

import { ALL_CMAPS } from "../../colors";
import type { Colormap } from "../../colors";
import { PaneElementFactoryBuilder, withPaneState } from "../../widgets";
import type {
  PaneControllerDataProcessor,
  PaneElementFactory,
  PaneElementParams,
  ParamsMapper,
} from "../../widgets";
import { NormalizedValueFunc, ApplyColormap, ComposeRGB } from "../data";
import type { ColorBlender, PointBuffer } from "../data";

export interface NormalizedValueFuncInputtedData {
  channelIdx: number;
  vmin: number;
  vmax: number;
  useZScore: boolean;
}

export interface NormalizedValueFuncComputedData {
  channelNames: readonly string[];
  min: number;
  max: number;
  mean: number;
  std: number;
}

export interface NormalizedValueFuncPaneSettings {
  disabled: boolean;
  hidden: boolean;
}

export interface NormalizedValueFuncTarget {
  buffer: Readonly<PointBuffer>;
  channelNames: readonly string[];
}

export interface NormalizedValueFuncPaneControllerParams {
  inputtedData: NormalizedValueFuncInputtedData;
  computedData: NormalizedValueFuncComputedData;
  settings: NormalizedValueFuncPaneSettings;
  internalData: NormalizedValueFuncTarget | null;
  outputData: NormalizedValueFunc | null;
}

export type NormalizedValueFuncPaneElementParams =
  PaneElementParams<NormalizedValueFuncPaneControllerParams>;

export interface ApplyColormapInputtedData {
  colormapName: string;
  valueFunc: NormalizedValueFuncPaneControllerParams["inputtedData"];
}

export interface ApplyColormapComputedData {
  colormaps: ReadonlyMap<string, Colormap>;
  valueFunc: NormalizedValueFuncPaneControllerParams["computedData"];
}

export type ApplyColormapPaneSettings =
  NormalizedValueFuncPaneControllerParams["settings"];

export type ApplyColormapTarget =
  NormalizedValueFuncPaneControllerParams["internalData"];

export interface ApplyColormapPaneControllerParams {
  inputtedData: ApplyColormapInputtedData;
  computedData: ApplyColormapComputedData;
  settings: ApplyColormapPaneSettings;
  internalData: ApplyColormapTarget | null;
  outputData: ApplyColormap | null;
}

export type ApplyColormapPaneElementParams =
  PaneElementParams<ApplyColormapPaneControllerParams>;

export interface ComposeRGBInputtedData {
  valueFuncR: NormalizedValueFuncPaneControllerParams["inputtedData"];
  valueFuncG: NormalizedValueFuncPaneControllerParams["inputtedData"];
  valueFuncB: NormalizedValueFuncPaneControllerParams["inputtedData"];
}

export interface ComposeRGBComputedData {
  valueFuncR: NormalizedValueFuncPaneControllerParams["computedData"];
  valueFuncG: NormalizedValueFuncPaneControllerParams["computedData"];
  valueFuncB: NormalizedValueFuncPaneControllerParams["computedData"];
}

export type ComposeRGBPaneSettings =
  NormalizedValueFuncPaneControllerParams["settings"];

export type ComposeRGBTarget =
  NormalizedValueFuncPaneControllerParams["internalData"];

export interface ComposeRGBPaneControllerParams {
  inputtedData: ComposeRGBInputtedData;
  computedData: ComposeRGBComputedData;
  settings: ComposeRGBPaneSettings;
  internalData: ComposeRGBTarget | null;
  outputData: ComposeRGB | null;
}

export type ComposeRGBPaneElementParams =
  PaneElementParams<ComposeRGBPaneControllerParams>;

export interface ColorBlenderInputtedData {
  blenderType: "apply-colormap" | "compose-rgb";
  applyColormap: ApplyColormapPaneControllerParams["inputtedData"];
  composeRGB: ComposeRGBPaneControllerParams["inputtedData"];
}

export interface ColorBlenderComputedData {
  applyColormap: ApplyColormapPaneControllerParams["computedData"];
  composeRGB: ComposeRGBPaneControllerParams["computedData"];
}

export type ColorBlenderPaneSettings = Expand<
  ApplyColormapPaneControllerParams["settings"]
>;

export type ColorBlenderTarget = Expand<
  ApplyColormapPaneControllerParams["internalData"]
>;

export interface ColorBlenderPaneControllerParams {
  inputtedData: ColorBlenderInputtedData;
  computedData: ColorBlenderComputedData;
  settings: ColorBlenderPaneSettings;
  internalData: ColorBlenderTarget | null;
  outputData: ColorBlender | null;
}

export type ColorBlenderPaneElementParams =
  PaneElementParams<ColorBlenderPaneControllerParams>;

export const normalizedValueFuncPaneFactoryParams: Pick<
  NormalizedValueFuncPaneControllerParams,
  "inputtedData" | "computedData" | "settings"
> = {
  inputtedData: { channelIdx: 0, vmin: -2, vmax: +2, useZScore: true },
  computedData: { channelNames: [""], min: -10, max: +10, mean: 0, std: 1 },
  settings: { disabled: false, hidden: false },
};

const normalizedValueFuncPaneDefaultComputedData: NormalizedValueFuncComputedData =
  {
    channelNames: ["X", "Y", "Z"],
    min: -10,
    max: +10,
    mean: 0,
    std: 1,
  };

export function createNormalizedValueFuncPaneElementFactory(): PaneElementFactory<
  NormalizedValueFuncPaneElementParams,
  {}
> {
  const builder = PaneElementFactoryBuilder.withoutEvents(
    normalizedValueFuncPaneFactoryParams,
  );

  return withPaneState(
    builder.sequential([
      builder.input(["inputtedData", "channelIdx"], {
        options: ({
          computedData: { channelNames },
          settings: { disabled, hidden },
        }) => ({
          label: "Channel",
          options: channelNames.map((v, i) => ({
            text: i + " (" + v + ")",
            value: i,
          })),
          disabled,
          hidden,
        }),
      }),
      builder.input(["inputtedData", "vmin"], {
        options: ({
          inputtedData: { useZScore },
          computedData: { min, max, mean, std },
          settings: { disabled, hidden },
        }) => ({
          label: useZScore ? "Min. Z-Score" : "Min. Value",
          min: useZScore ? (min - mean) / std : min,
          max: useZScore ? (max - mean) / std : max,
          step: 0.1,
          disabled,
          hidden,
        }),
      }),
      builder.input(["inputtedData", "vmax"], {
        options: ({
          inputtedData: { useZScore },
          computedData: { min, max, mean, std },
          settings: { disabled, hidden },
        }) => ({
          label: useZScore ? "Max. Z-Score" : "Max. Value",
          min: useZScore ? (min - mean) / std : min,
          max: useZScore ? (max - mean) / std : max,
          step: 0.1,
          disabled,
          hidden,
        }),
      }),
      builder.input(["inputtedData", "useZScore"], {
        options: ({ settings: { disabled, hidden } }) => ({
          label: "Use Z-Score",
          disabled,
          hidden,
        }),
      }),
    ]),
    ({ params: prevParams, state: prevState }, params) => {
      const nextParams = cloneDeep(params);
      const nextState = cloneDeep(prevState);

      if (prevParams.inputtedData.useZScore !== params.inputtedData.useZScore) {
        const nextUseZScore = params.inputtedData.useZScore;
        if (
          prevParams.computedData.mean === params.computedData.mean &&
          prevParams.computedData.std === params.computedData.std
        ) {
          const { mean, std } = params.computedData;
          if (std !== 0) {
            const transformBound = nextUseZScore
              ? (bound: number) => (bound - mean) / std
              : (bound: number) => bound * std + mean;
            nextParams.inputtedData.vmin = transformBound(
              params.inputtedData.vmin,
            );
            nextParams.inputtedData.vmax = transformBound(
              params.inputtedData.vmax,
            );
          }
        }
      }
      return { params: nextParams, state: nextState };
    },
    {},
  );
}

export const normalizedValueFuncPaneDataProcessor: PaneControllerDataProcessor<NormalizedValueFuncPaneControllerParams> =
  {
    computeData: (inputtedData, internalData) => {
      const { channelIdx } = inputtedData;
      if (internalData == null)
        return normalizedValueFuncPaneDefaultComputedData;
      const { buffer, channelNames } = internalData;
      const values = buffer.getChannel(channelIdx);
      if (values.length === 0)
        return normalizedValueFuncPaneDefaultComputedData;
      return {
        channelNames,
        min: math.min(values),
        max: math.max(values),
        mean: math.mean(values),
        std: math.std(values),
      };
    },
    outputData: (paneParams) => {
      const {
        inputtedData: { channelIdx, vmin, vmax, useZScore },
      } = paneParams;
      return new NormalizedValueFunc(
        channelIdx,
        useZScore ? NormalizedValueFunc.fromStdScore(vmin) : vmin,
        useZScore ? NormalizedValueFunc.fromStdScore(vmax) : vmax,
      );
    },
  };

const applyColormapPaneColormaps: ReadonlyMap<string, Colormap> = new Map(
  ALL_CMAPS.map((v) => [v.name, v]),
);

export const applyColormapPaneFactoryParams: Pick<
  ApplyColormapPaneControllerParams,
  "inputtedData" | "computedData" | "settings"
> = {
  inputtedData: {
    colormapName: "viridis",
    valueFunc: normalizedValueFuncPaneFactoryParams.inputtedData,
  },
  computedData: {
    colormaps: applyColormapPaneColormaps,
    valueFunc: normalizedValueFuncPaneFactoryParams.computedData,
  },
  settings: { ...normalizedValueFuncPaneFactoryParams.settings },
};

const applyColormapPaneValueFuncParamsMapper: ParamsMapper<
  ApplyColormapPaneElementParams,
  NormalizedValueFuncPaneElementParams
> = {
  outerToInner: (outer) => ({
    inputtedData: outer.inputtedData.valueFunc,
    computedData: outer.computedData.valueFunc,
    settings: outer.settings,
  }),
  innerToOuter: (inner) => ({
    inputtedData: { valueFunc: inner.inputtedData },
  }),
};

export function createApplyColormapPaneElementFactory(): PaneElementFactory<
  ApplyColormapPaneElementParams,
  {}
> {
  const builder = PaneElementFactoryBuilder.withoutEvents(
    applyColormapPaneFactoryParams,
  );
  return builder.sequential([
    builder.input(["inputtedData", "colormapName"], {
      options: ({
        computedData: { colormaps },
        settings: { disabled, hidden },
      }) => ({
        label: "Colormap",
        options: Array.from(colormaps.keys(), (v) => ({
          text: v,
          value: v,
        })),
        disabled,
        hidden,
      }),
    }),
    builder.mapped(
      createNormalizedValueFuncPaneElementFactory(),
      applyColormapPaneValueFuncParamsMapper,
      builder.identityEventMapper(),
    ),
  ]);
}

export const applyColormapPaneDataProcessor: PaneControllerDataProcessor<ApplyColormapPaneControllerParams> =
  {
    computeData: (inputtedData, internalData) => {
      const valueFuncComputedData =
        normalizedValueFuncPaneDataProcessor.computeData(
          inputtedData.valueFunc,
          internalData,
        );
      return {
        colormaps: applyColormapPaneColormaps,
        valueFunc: valueFuncComputedData,
      };
    },
    outputData: (paneParams) => {
      const {
        inputtedData: { colormapName },
        computedData: { colormaps },
      } = paneParams;
      const colormap = colormaps.get(colormapName);
      if (colormap == null) return null;
      const valueFunc = normalizedValueFuncPaneDataProcessor.outputData(
        applyColormapPaneValueFuncParamsMapper.outerToInner(paneParams),
      );
      if (valueFunc == null) return null;
      return new ApplyColormap(colormap, valueFunc);
    },
  };

export const composeRGBPaneFactoryParams: Pick<
  ComposeRGBPaneControllerParams,
  "inputtedData" | "computedData" | "settings"
> = {
  inputtedData: {
    valueFuncR: normalizedValueFuncPaneFactoryParams.inputtedData,
    valueFuncG: normalizedValueFuncPaneFactoryParams.inputtedData,
    valueFuncB: normalizedValueFuncPaneFactoryParams.inputtedData,
  },
  computedData: {
    valueFuncR: normalizedValueFuncPaneFactoryParams.computedData,
    valueFuncG: normalizedValueFuncPaneFactoryParams.computedData,
    valueFuncB: normalizedValueFuncPaneFactoryParams.computedData,
  },
  settings: { ...normalizedValueFuncPaneFactoryParams.settings },
};

const composeRGBPaneValueFuncRParamsMapper: ParamsMapper<
  ComposeRGBPaneElementParams,
  NormalizedValueFuncPaneElementParams
> = {
  outerToInner: (outer) => ({
    inputtedData: outer.inputtedData.valueFuncR,
    computedData: outer.computedData.valueFuncR,
    settings: outer.settings,
  }),
  innerToOuter: (inner) => ({
    inputtedData: { valueFuncR: inner.inputtedData },
  }),
};
const composeRGBPaneValueFuncGParamsMapper: ParamsMapper<
  ComposeRGBPaneElementParams,
  NormalizedValueFuncPaneElementParams
> = {
  outerToInner: (outer) => ({
    inputtedData: outer.inputtedData.valueFuncG,
    computedData: outer.computedData.valueFuncG,
    settings: outer.settings,
  }),
  innerToOuter: (inner) => ({
    inputtedData: { valueFuncG: inner.inputtedData },
  }),
};
const composeRGBPaneValueFuncBParamsMapper: ParamsMapper<
  ComposeRGBPaneElementParams,
  NormalizedValueFuncPaneElementParams
> = {
  outerToInner: (outer) => ({
    inputtedData: outer.inputtedData.valueFuncB,
    computedData: outer.computedData.valueFuncB,
    settings: outer.settings,
  }),
  innerToOuter: (inner) => ({
    inputtedData: { valueFuncB: inner.inputtedData },
  }),
};

export function createComposeRGBPaneElementFactory(): PaneElementFactory<
  ComposeRGBPaneElementParams,
  {}
> {
  const builder = PaneElementFactoryBuilder.withoutEvents(
    composeRGBPaneFactoryParams,
  );
  return builder.tab(
    [
      {
        factory: builder.mapped(
          createNormalizedValueFuncPaneElementFactory(),
          composeRGBPaneValueFuncRParamsMapper,
          builder.identityEventMapper(),
        ),
        options: { title: "Red" },
      },
      {
        factory: builder.mapped(
          createNormalizedValueFuncPaneElementFactory(),
          composeRGBPaneValueFuncGParamsMapper,
          builder.identityEventMapper(),
        ),
        options: { title: "Green" },
      },
      {
        factory: builder.mapped(
          createNormalizedValueFuncPaneElementFactory(),
          composeRGBPaneValueFuncBParamsMapper,
          builder.identityEventMapper(),
        ),
        options: { title: "Blue" },
      },
    ],
    {
      options: ({ settings: { disabled, hidden } }) => ({
        disabled,
        hidden,
      }),
    },
  );
}

export const composeRGBPaneDataProcessor: PaneControllerDataProcessor<ComposeRGBPaneControllerParams> =
  {
    computeData: (inputtedData, internalData) => {
      const valueFuncRComputedData =
        normalizedValueFuncPaneDataProcessor.computeData(
          inputtedData.valueFuncR,
          internalData,
        );
      const valueFuncGComputedData =
        normalizedValueFuncPaneDataProcessor.computeData(
          inputtedData.valueFuncG,
          internalData,
        );
      const valueFuncBComputedData =
        normalizedValueFuncPaneDataProcessor.computeData(
          inputtedData.valueFuncB,
          internalData,
        );
      return {
        valueFuncR: valueFuncRComputedData,
        valueFuncG: valueFuncGComputedData,
        valueFuncB: valueFuncBComputedData,
      };
    },
    outputData: (paneParams) => {
      const valueFuncR = normalizedValueFuncPaneDataProcessor.outputData(
        composeRGBPaneValueFuncRParamsMapper.outerToInner(paneParams),
      );
      if (valueFuncR == null) return null;
      const valueFuncG = normalizedValueFuncPaneDataProcessor.outputData(
        composeRGBPaneValueFuncGParamsMapper.outerToInner(paneParams),
      );
      if (valueFuncG == null) return null;
      const valueFuncB = normalizedValueFuncPaneDataProcessor.outputData(
        composeRGBPaneValueFuncBParamsMapper.outerToInner(paneParams),
      );
      if (valueFuncB == null) return null;
      return new ComposeRGB(valueFuncR, valueFuncG, valueFuncB);
    },
  };

export const colorBlenderPaneFactoryParams: Pick<
  ColorBlenderPaneControllerParams,
  "inputtedData" | "computedData" | "settings"
> = {
  inputtedData: {
    blenderType: "apply-colormap",
    applyColormap: applyColormapPaneFactoryParams.inputtedData,
    composeRGB: composeRGBPaneFactoryParams.inputtedData,
  },
  computedData: {
    applyColormap: applyColormapPaneFactoryParams.computedData,
    composeRGB: composeRGBPaneFactoryParams.computedData,
  },
  settings: {
    ...applyColormapPaneFactoryParams.settings,
    ...composeRGBPaneFactoryParams.settings,
  },
};

const colorBlenderPaneApplyColormapParamsMapper: ParamsMapper<
  ColorBlenderPaneElementParams,
  ApplyColormapPaneElementParams
> = {
  outerToInner: (outer) => ({
    inputtedData: outer.inputtedData.applyColormap,
    computedData: outer.computedData.applyColormap,
    settings: {
      disabled: outer.settings.disabled,
      hidden:
        outer.settings.hidden ||
        outer.inputtedData.blenderType !== "apply-colormap",
    },
  }),
  innerToOuter: (inner) => ({
    inputtedData: { applyColormap: inner.inputtedData },
  }),
};
const colorBlenderPaneComposeRGBParamsMapper: ParamsMapper<
  ColorBlenderPaneElementParams,
  ComposeRGBPaneElementParams
> = {
  outerToInner: (outer) => ({
    inputtedData: outer.inputtedData.composeRGB,
    computedData: outer.computedData.composeRGB,
    settings: {
      disabled: outer.settings.disabled,
      hidden:
        outer.settings.hidden ||
        outer.inputtedData.blenderType !== "compose-rgb",
    },
  }),
  innerToOuter: (inner) => ({
    inputtedData: { composeRGB: inner.inputtedData },
  }),
};

export function createColorBlenderPaneElementFactory(): PaneElementFactory<
  ColorBlenderPaneElementParams,
  {}
> {
  const builder = PaneElementFactoryBuilder.withoutEvents(
    colorBlenderPaneFactoryParams,
  );
  return builder.sequential([
    builder.input(["inputtedData", "blenderType"], {
      options: ({ settings: { disabled, hidden } }) => ({
        label: "Blender Type",
        options: {
          ApplyColormap: "apply-colormap",
          ComposeRGB: "compose-rgb",
        },
        disabled,
        hidden,
      }),
    }),
    builder.mapped(
      createApplyColormapPaneElementFactory(),
      colorBlenderPaneApplyColormapParamsMapper,
      builder.identityEventMapper(),
    ),
    builder.mapped(
      createComposeRGBPaneElementFactory(),
      colorBlenderPaneComposeRGBParamsMapper,
      builder.identityEventMapper(),
    ),
  ]);
}

export const colorBlenderPaneDataProcessor: PaneControllerDataProcessor<ColorBlenderPaneControllerParams> =
  {
    computeData: (inputtedData, internalData) => {
      const applyColormapComputedData =
        applyColormapPaneDataProcessor.computeData(
          inputtedData.applyColormap,
          internalData,
        );
      const composeRGBComputedData = composeRGBPaneDataProcessor.computeData(
        inputtedData.composeRGB,
        internalData,
      );
      return {
        applyColormap: applyColormapComputedData,
        composeRGB: composeRGBComputedData,
      };
    },
    outputData: (paneParams) => {
      const {
        inputtedData: { blenderType },
      } = paneParams;
      switch (blenderType) {
        case "apply-colormap":
          return applyColormapPaneDataProcessor.outputData(
            colorBlenderPaneApplyColormapParamsMapper.outerToInner(paneParams),
          );
        case "compose-rgb":
          return composeRGBPaneDataProcessor.outputData(
            colorBlenderPaneComposeRGBParamsMapper.outerToInner(paneParams),
          );
        default:
          throw new Error("Unknown blender type: " + String(blenderType));
      }
    },
  };
