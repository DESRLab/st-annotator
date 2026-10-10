/* @vitest-environment jsdom */

import { beforeAll, describe, expect, it } from "vitest";

import {
  getTransformationSelectSettings,
  transformerSettingsPaneDataProcessor,
} from "../../../../app/editor/scene/widgets/TransformerSettingsPane.react.tsx";
import {
  createVectorSettingsPaneElementFactory,
  vectorSettingsPaneDataProcessor,
  vectorSettingsPaneFactoryParams,
  getVectorShowTooltipsCheckboxSettings,
} from "../../../../app/editor/scene/widgets/VectorSettingsPane.react.tsx";

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

describe("TransformerSettingsPane", () => {
  it("uses the vector-specific Tweakpane controller API for vector controls", async () => {
    const paneParams = {
      inputtedData: {
        isTransformSelected: { vertex: true, vertices: true },
      },
      computedData: {},
      settings: { disabled: false, hidden: false },
    };

    expect(getTransformationSelectSettings(paneParams).cells(1)).toEqual({
      title: "Vertices",
      value: "vertices",
    });
    expect(
      transformerSettingsPaneDataProcessor.outputData(paneParams)
        .isTransformSelected.vertex,
    ).toBe(true);
  });
});

describe("VectorSettingsPane", () => {
  it("uses Tweakpane rows and updates vector settings with cloned color output", async () => {
    const paneParams = {
      inputtedData: {
        ...vectorSettingsPaneFactoryParams.inputtedData,
        showTooltips: true,
      },
      computedData: {},
      internalData: {},
      settings: vectorSettingsPaneFactoryParams.settings,
    };

    expect(createVectorSettingsPaneElementFactory()).toHaveProperty("attach");
    expect(getVectorShowTooltipsCheckboxSettings(paneParams).label).toBe(
      "Show tooltips",
    );

    const output = vectorSettingsPaneDataProcessor.outputData(paneParams);
    expect(output.showTooltips).toBe(true);
    expect(output.strokeColor).not.toBe(paneParams.inputtedData.strokeColor);
  });
});
