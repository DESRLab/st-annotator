/* @vitest-environment jsdom */

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  createMainCameraSettingsPaneElementFactory,
  mainCameraSettingsPaneDataProcessor,
  mainCameraSettingsPaneFactoryParams,
  getMainCameraViewModeSelectSettings,
  getOrbitPointCheckboxSettings,
} from "../../../../app/editor/scene/widgets/MainCameraSettingsPane.react.tsx";
import {
  createPointCloudSettingsPaneElementFactory,
  pointCloudSettingsPaneDataProcessor,
  getCropAreaCheckboxSettings,
  getRemoveBackgroundCheckboxSettings,
  pointCloudSettingsPaneFactoryParams,
} from "../../../../app/editor/scene/widgets/PointCloudSettingsPane.react.tsx";
import type { PointCloudSettingsPaneControllerParams } from "../../../../app/editor/scene/widgets/PointCloudSettingsPane.react.tsx";

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

function pointCloudParams(
  overrides: Partial<{
    inputtedData: Partial<
      PointCloudSettingsPaneControllerParams["inputtedData"]
    >;
    settings: Partial<PointCloudSettingsPaneControllerParams["settings"]>;
  }> = {},
) {
  return {
    inputtedData: {
      ...pointCloudSettingsPaneFactoryParams.inputtedData,
      ...overrides.inputtedData,
    },
    computedData: pointCloudSettingsPaneFactoryParams.computedData,
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

describe("MainCameraSettingsPane", () => {
  it("preserves native element settings and output data", () => {
    const paneParams = {
      inputtedData: { viewMode: "3D" as const, orbitPoint: true },
      computedData: {},
      settings: mainCameraSettingsPaneFactoryParams.settings,
    };

    expect(createMainCameraSettingsPaneElementFactory()).toHaveProperty(
      "attach",
    );
    expect(getMainCameraViewModeSelectSettings(paneParams).label).toBe(
      "View Mode",
    );
    expect(getOrbitPointCheckboxSettings(paneParams).label).toBe("Orbit Point");
    expect(mainCameraSettingsPaneDataProcessor.outputData(paneParams)).toEqual({
      viewMode: "3D",
      orbitPoint: true,
    });
  });
});

describe("PointCloudSettingsPane", () => {
  it("preserves checkbox settings and updates output data through the old controller API", async () => {
    const paneParams = pointCloudParams({
      inputtedData: { removeBackground: false, pointSize: 3 },
      settings: { hidden: true },
    });

    expect(createPointCloudSettingsPaneElementFactory()).toHaveProperty(
      "attach",
    );
    expect(getRemoveBackgroundCheckboxSettings(pointCloudParams()).label).toBe(
      "RemoveBG",
    );
    expect(getCropAreaCheckboxSettings(pointCloudParams()).label).toBe(
      "CropArea",
    );

    expect(
      pointCloudSettingsPaneDataProcessor.outputData(paneParams)
        .removeBackground,
    ).toBe(false);
    expect(
      pointCloudSettingsPaneDataProcessor.outputData(paneParams).pointSize,
    ).toBe(3);
  });
});
