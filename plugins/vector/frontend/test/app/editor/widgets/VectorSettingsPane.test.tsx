/* @vitest-environment jsdom */

import { act, default as React } from "react";
import { beforeAll, describe, expect, it } from "vitest";
import { renderTestView } from "../../../../../../../core/frontend/lib/common/lib/testing/react";

import {
  TransformerSettingsPaneView,
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
  it("renders transformer options and forwards native selections through the React host", async () => {
    const paneParams = {
      inputtedData: { isTransformSelected: { vertex: true, vertices: true } },
      computedData: {},
      settings: { disabled: false, hidden: false },
    };
    const changes: unknown[] = [];
    const view = await renderTestView(
      <TransformerSettingsPaneView
        paneParams={paneParams}
        onInputChange={(value) => changes.push(value)}
      />,
    );
    expect(view.container.querySelector(".tp-rotv")).not.toBeNull();
    const buttons = [
      ...view.container.querySelectorAll<HTMLButtonElement>(".tp-selectbtnv_b"),
    ];
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Vertex",
      "Vertices",
    ]);
    expect(
      transformerSettingsPaneDataProcessor.outputData(paneParams)
        .isTransformSelected.vertex,
    ).toBe(true);
    await act(async () => buttons[0].click());
    expect(changes).toEqual([
      { isTransformSelected: { vertex: false, vertices: true } },
    ]);
    await view.unmount();
    expect(view.container.innerHTML).toBe("");
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
