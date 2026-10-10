/* @vitest-environment jsdom */

import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("sta/app/editor", () => ({
  PaneElementFactoryBuilder: {
    withoutEvents: () => ({
      input: () => ({}),
      separator: () => ({}),
      sequential: () => ({}),
    }),
  },
  withPaneState: () => ({ attach: () => {} }),
  definePane: () => ({}),
  TweakpanePaneHost: () => null,
}));

import {
  createSegmentationSettingsPaneElementFactory,
  segmentationSettingsPaneDataProcessor,
  segmentationSettingsPaneFactoryParams,
  getSegmentationUseAssistantCheckboxSettings,
  getSegmentationShowTooltipsCheckboxSettings,
} from "../../../../app/editor/scene/widgets/SegmentationSettingsPane.react.tsx";

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

describe("SegmentationSettingsPane", () => {
  it("uses Tweakpane rows and updates segmentation settings with plugin-specific toggles", async () => {
    const paneParams = {
      inputtedData: {
        ...segmentationSettingsPaneFactoryParams.inputtedData,
        showTooltips: true,
        showPerceivedClass: true,
      },
      computedData: {},
      internalData: {},
      settings: segmentationSettingsPaneFactoryParams.settings,
    };

    expect(createSegmentationSettingsPaneElementFactory()).toHaveProperty(
      "attach",
    );
    expect(getSegmentationShowTooltipsCheckboxSettings(paneParams).label).toBe(
      "Show tooltips",
    );
    expect(getSegmentationUseAssistantCheckboxSettings(paneParams)).toEqual({
      label: "Use Assistant",
      disabled: false,
      hidden: false,
    });

    const output = segmentationSettingsPaneDataProcessor.outputData(paneParams);
    expect(output.useAssistant).toBe(false);
    expect(output.showTooltips).toBe(true);
    expect(output.showPerceivedClass).toBe(true);
    expect(output.selectionTransparency).toBe(true);
    expect(output.selectionOpacity).toBe(0.5);
    expect(output.strokeColor).not.toBe(paneParams.inputtedData.strokeColor);
  });

  it("keeps the opacity level when transparency is toggled off", () => {
    const paneParams = {
      inputtedData: {
        ...segmentationSettingsPaneFactoryParams.inputtedData,
        selectionTransparency: false,
        selectionOpacity: 0.25,
      },
      computedData: {},
      internalData: {},
      settings: segmentationSettingsPaneFactoryParams.settings,
    };
    const output = segmentationSettingsPaneDataProcessor.outputData(paneParams);

    expect(output.selectionTransparency).toBe(false);
    expect(output.selectionOpacity).toBe(0.25);
  });

  it("enables the assistant toggle when the service is available", () => {
    const paneParams = {
      inputtedData: {
        ...segmentationSettingsPaneFactoryParams.inputtedData,
        useAssistant: true,
      },
      computedData: {},
      internalData: {},
      settings: {
        ...segmentationSettingsPaneFactoryParams.settings,
        isAssistantAvailable: true,
      },
    };

    expect(getSegmentationUseAssistantCheckboxSettings(paneParams)).toEqual({
      label: "Use Assistant",
      disabled: false,
      hidden: false,
    });
    expect(
      segmentationSettingsPaneDataProcessor.outputData(paneParams).useAssistant,
    ).toBe(true);
  });

  it("keeps the assistant preference clickable while label data is loading", () => {
    const paneParams = {
      inputtedData: segmentationSettingsPaneFactoryParams.inputtedData,
      computedData: {},
      internalData: {},
      settings: {
        ...segmentationSettingsPaneFactoryParams.settings,
        disabled: true,
      },
    };

    expect(getSegmentationUseAssistantCheckboxSettings(paneParams)).toEqual({
      label: "Use Assistant",
      disabled: false,
      hidden: false,
    });
  });
});
