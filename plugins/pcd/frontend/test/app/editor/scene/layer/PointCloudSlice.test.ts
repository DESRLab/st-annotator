import { describe, expect, it } from "vitest";

import type { ColorBlenderPaneControllerParams } from "sta/app/editor";

import { mapPointCloudSlice } from "../../../../../app/editor/scene/layer/PointCloudSlice";
import type { PointCloudSliceInput } from "../../../../../app/editor/scene/layer/PointCloudSlice";
import { pointCloudSettingsPaneFactoryParams } from "../../../../../app/editor/scene/widgets/PointCloudSettingsPane.react.tsx";

// The mapper compares the target by reference only, so a stand-in suffices.
const SETTINGS_TARGET = {
  buffer: {},
  channelNames: ["x", "y", "z"],
} as unknown as ColorBlenderPaneControllerParams["internalData"];

function createInput(
  overrides: Partial<PointCloudSliceInput> = {},
): PointCloudSliceInput {
  return {
    viewMode: "2D",
    orbitPoint: false,
    settings: {
      values: pointCloudSettingsPaneFactoryParams.inputtedData,
      disabled: false,
      target: SETTINGS_TARGET,
    },
    ...overrides,
  };
}

describe("mapPointCloudSlice", () => {
  it("maps the main camera and settings state to its plain slice", () => {
    const slice = mapPointCloudSlice(
      createInput({ viewMode: "3D", orbitPoint: true }),
      null,
    );

    expect(slice.camera).toEqual({ viewMode: "3D", orbitPoint: true });
    expect(slice.settings).toEqual({
      values: pointCloudSettingsPaneFactoryParams.inputtedData,
      disabled: false,
      target: SETTINGS_TARGET,
    });
  });

  it("reuses the previous slice when nothing changed (structural sharing)", () => {
    const previous = mapPointCloudSlice(createInput(), null);
    const next = mapPointCloudSlice(createInput(), previous);

    expect(next).toBe(previous);
    expect(next.camera).toBe(previous.camera);
    expect(next.settings).toBe(previous.settings);
  });

  it("rebuilds the camera sub-slice when any camera field changes", () => {
    const previous = mapPointCloudSlice(createInput(), null);

    expect(
      mapPointCloudSlice(createInput({ viewMode: "3D" }), previous),
    ).not.toBe(previous);
    expect(
      mapPointCloudSlice(createInput({ orbitPoint: true }), previous),
    ).not.toBe(previous);
    expect(
      mapPointCloudSlice(createInput({ viewMode: "3D" }), previous).settings,
    ).toBe(previous.settings);
  });

  it("rebuilds the settings sub-slice when any settings field changes", () => {
    const previous = mapPointCloudSlice(createInput(), null);
    const { settings } = createInput();

    const nextValues = mapPointCloudSlice(
      createInput({
        settings: {
          ...settings,
          values: { ...settings.values, pointSize: 3 },
        },
      }),
      previous,
    );
    expect(nextValues).not.toBe(previous);
    expect(nextValues.camera).toBe(previous.camera);

    const nextDisabled = mapPointCloudSlice(
      createInput({
        settings: { ...settings, disabled: true },
      }),
      previous,
    );
    expect(nextDisabled).not.toBe(previous);
    expect(nextDisabled.settings.disabled).toBe(true);

    const nextTarget = mapPointCloudSlice(
      createInput({
        settings: { ...settings, target: null },
      }),
      previous,
    );
    expect(nextTarget).not.toBe(previous);
    expect(nextTarget.settings.target).toBeNull();
  });
});
