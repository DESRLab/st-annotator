/* @vitest-environment jsdom */

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  createGroundMeshSettingsPaneElementFactory,
  groundMeshSettingsPaneDataProcessor,
  groundMeshSettingsPaneFactoryParams,
} from "../../../../app/editor/scene/widgets/GroundMeshSettingsPane.react.tsx";
import {
  createTransformerSettingsPaneElementFactory as createGroundMeshTransformerSettingsPaneElementFactory,
  getTransformationSelectSettings as getGroundMeshTransformationSelectSettings,
  transformerSettingsPaneDataProcessor as groundMeshTransformerSettingsPaneDataProcessor,
} from "../../../../app/editor/scene/widgets/TransformerSettingsPane.react.tsx";
import type { TransformerSettingsPaneControllerParams } from "../../../../app/editor/scene/widgets/TransformerSettingsPane.react.tsx";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => ({
    beginPath() {},
    clearRect() {},
    createLinearGradient() {
      return { addColorStop() {} };
    },
    fill() {},
    fillRect() {},
    getImageData() {
      return { data: [0, 0, 0, 255] };
    },
    lineTo() {},
    moveTo() {},
    putImageData() {},
    rect() {},
    stroke() {},
  })) as any;
});

function transformerParams(
  overrides: Partial<{
    inputtedData: Partial<
      TransformerSettingsPaneControllerParams["inputtedData"]
    >;
    settings: Partial<TransformerSettingsPaneControllerParams["settings"]>;
  }> = {},
) {
  return {
    inputtedData: {
      isTransformSelected: {
        translate: true,
        rotate: true,
        scale: true,
        ...overrides.inputtedData?.isTransformSelected,
      },
    },
    computedData: {},
    settings: {
      disabled: false,
      hidden: false,
      ...overrides.settings,
    },
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("GroundMeshSettingsPane", () => {
  it("uses Tweakpane rows and updates output data through the old controller API", async () => {
    const paneParams = {
      inputtedData: {
        ...groundMeshSettingsPaneFactoryParams.inputtedData,
        showWireframe: false,
        opacity: 0.8,
      },
      computedData: groundMeshSettingsPaneFactoryParams.computedData,
      internalData: null,
      settings: groundMeshSettingsPaneFactoryParams.settings,
    };

    expect(createGroundMeshSettingsPaneElementFactory()).toHaveProperty(
      "attach",
    );
    expect(
      groundMeshSettingsPaneDataProcessor.outputData(paneParams).showWireframe,
    ).toBe(false);
    expect(
      groundMeshSettingsPaneDataProcessor.outputData(paneParams).opacity,
    ).toBe(0.8);
  });
});

describe("TransformerSettingsPane", () => {
  it("preserves static settings and emits output changes from Tweakpane interactions", async () => {
    const paneParams = transformerParams();

    expect(
      createGroundMeshTransformerSettingsPaneElementFactory(),
    ).toHaveProperty("attach");
    expect(
      getGroundMeshTransformationSelectSettings(transformerParams()).cells(2),
    ).toEqual({ title: "Scale", value: "scale" });
    expect(
      groundMeshTransformerSettingsPaneDataProcessor.outputData(paneParams)
        .isTransformSelected.scale,
    ).toBe(true);
  });
});
