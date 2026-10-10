import { describe, expect, it } from "vitest";

import type { ColorBlenderPaneControllerParams } from "sta/app/editor";

import { mapGroundMeshSlice } from "../../../../../app/editor/scene/layer/GroundMeshSlice";
import type { GroundMeshSliceInput } from "../../../../../app/editor/scene/layer/GroundMeshSlice";
import { groundMeshSettingsPaneFactoryParams } from "../../../../../app/editor/scene/widgets/GroundMeshSettingsPane.react.tsx";

// The mapper compares the target by reference only, so a stand-in suffices.
const SETTINGS_TARGET = {
  buffer: {},
  channelNames: ["x", "y", "z"],
} as unknown as ColorBlenderPaneControllerParams["internalData"];

function createInput(
  overrides: Partial<GroundMeshSliceInput> = {},
): GroundMeshSliceInput {
  return {
    settings: {
      values: groundMeshSettingsPaneFactoryParams.inputtedData,
      disabled: false,
      target: SETTINGS_TARGET,
    },
    ...overrides,
  };
}

describe("mapGroundMeshSlice", () => {
  it("maps the ground mesh settings state to its plain slice", () => {
    const slice = mapGroundMeshSlice(createInput(), null);

    expect(slice.ui).toEqual({});
    expect(slice.settings).toEqual({
      values: groundMeshSettingsPaneFactoryParams.inputtedData,
      disabled: false,
      target: SETTINGS_TARGET,
    });
  });

  it("reuses the previous slice when nothing changed (structural sharing)", () => {
    const previous = mapGroundMeshSlice(createInput(), null);
    const next = mapGroundMeshSlice(createInput(), previous);

    expect(next).toBe(previous);
    expect(next.ui).toBe(previous.ui);
    expect(next.settings).toBe(previous.settings);
  });

  it("rebuilds the settings sub-slice when any settings field changes", () => {
    const previous = mapGroundMeshSlice(createInput(), null);
    const { settings } = createInput();

    const nextValues = mapGroundMeshSlice(
      createInput({
        settings: {
          ...settings,
          values: { ...settings.values, opacity: 0.8 },
        },
      }),
      previous,
    );
    expect(nextValues).not.toBe(previous);
    expect(nextValues.ui).toBe(previous.ui);

    const nextDisabled = mapGroundMeshSlice(
      createInput({
        settings: { ...settings, disabled: true },
      }),
      previous,
    );
    expect(nextDisabled).not.toBe(previous);
    expect(nextDisabled.settings.disabled).toBe(true);

    const nextTarget = mapGroundMeshSlice(
      createInput({
        settings: { ...settings, target: null },
      }),
      previous,
    );
    expect(nextTarget).not.toBe(previous);
    expect(nextTarget.settings.target).toBeNull();
  });
});
