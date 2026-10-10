/* @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";

import {
  createViewModePaneElementFactory,
  getViewModeSelectSettings,
} from "../../../../../../app/routes/editor/scene/widgets/ViewModePane.tsx";
import type { ViewModePaneParams } from "../../../../../../app/routes/editor/scene/widgets/ViewModePane.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function viewModeParams(
  overrides: Partial<{
    inputtedData: Partial<ViewModePaneParams["inputtedData"]>;
    settings: Partial<ViewModePaneParams["settings"]>;
  }> = {},
) {
  return {
    inputtedData: {
      viewMode: "2D",
      ...overrides.inputtedData,
    },
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

describe("View mode pane store", () => {
  it("preserves static selector settings from the legacy pane", () => {
    const factory = createViewModePaneElementFactory();
    expect(factory).toHaveProperty("attach");
    expect(factory).toHaveProperty("debugContext");

    const settings = getViewModeSelectSettings(viewModeParams());

    expect(settings.label).toBe("View Mode");
    expect(settings.size).toEqual([2, 1]);
    expect(settings.cells(1)).toEqual({ title: "3D", value: "3D" });
    expect(getViewModeSelectSettings(viewModeParams())).toMatchObject({
      disabled: false,
    });
  });
});
