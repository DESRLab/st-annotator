/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";

import { CoordinateFormat } from "../../../../../../app/routes/editor/config";
import {
  ApplyColormap,
  PointBuffer,
} from "../../../../../../app/routes/editor/points/data";
import {
  colorBlenderPaneDataProcessor,
  colorBlenderPaneFactoryParams,
  createApplyColormapPaneElementFactory,
  createColorBlenderPaneElementFactory,
  createComposeRGBPaneElementFactory,
  createNormalizedValueFuncPaneElementFactory,
} from "../../../../../../app/routes/editor/points/widgets/ColorBlenderPane.tsx";

function createTarget() {
  return {
    buffer: new PointBuffer(
      new Float32Array([0, 10, 20, 30, 40, 50, 60, 70, 80]),
      CoordinateFormat.XYZ,
      3,
    ),
    channelNames: ["X", "Y", "Z"],
  };
}

describe("ColorBlender pane store", () => {
  it("provides factories and output processors without controller facades", () => {
    expect(createNormalizedValueFuncPaneElementFactory()).toBeTruthy();
    expect(createApplyColormapPaneElementFactory()).toBeTruthy();
    expect(createComposeRGBPaneElementFactory()).toBeTruthy();
    expect(createColorBlenderPaneElementFactory()).toBeTruthy();

    const computedData = colorBlenderPaneDataProcessor.computeData(
      colorBlenderPaneFactoryParams.inputtedData,
      createTarget(),
    );
    const output = colorBlenderPaneDataProcessor.outputData({
      inputtedData: colorBlenderPaneFactoryParams.inputtedData,
      computedData,
      settings: colorBlenderPaneFactoryParams.settings,
    });

    expect(output).toBeInstanceOf(ApplyColormap);
  });
});
