/* @vitest-environment jsdom */

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  bboxSettingsPaneFactoryParams,
  createBBoxSettingsPaneElementFactory,
  bboxSettingsPaneDataProcessor,
  getShowPerceivedClassCheckboxSettings,
} from "../../../../app/editor/scene/widgets/BBoxSettingsPane.react.tsx";

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

afterEach(() => {
  document.body.replaceChildren();
});

describe("BBoxSettingsPane", () => {
  it("preserves transparent-face opacity and relative-elevation transitions", async () => {
    const paneParams = {
      inputtedData: {
        ...bboxSettingsPaneFactoryParams.inputtedData,
        boxTransparency: true,
      },
      computedData: {},
      internalData: {},
      settings: {
        ...bboxSettingsPaneFactoryParams.settings,
        disallowRelativeElevation: true,
      },
    };

    expect(createBBoxSettingsPaneElementFactory()).toHaveProperty("attach");
    expect(getShowPerceivedClassCheckboxSettings(paneParams).label).toBe(
      "Show perceived class",
    );
    const output = bboxSettingsPaneDataProcessor.outputData(paneParams);
    expect(output.maintainRelativeElevation).toBe(false);
    expect(output.boxOpacity).toBe(0);
    expect(output.hoveredBoxColor).not.toBe(
      paneParams.inputtedData.hoveredBoxColor,
    );
  });
});
