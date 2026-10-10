/* @vitest-environment jsdom */

import { act, default as React } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  drawModePaneFactoryParams,
  DrawModePaneView,
} from "../../../../app/editor/scene/widgets/DrawModePane.react.tsx";
import {
  transformerSettingsPaneFactoryParams,
  TransformerSettingsPaneView,
} from "../../../../app/editor/scene/widgets/TransformerSettingsPane.react.tsx";
import {
  vectorSettingsPaneFactoryParams,
  VectorSettingsPaneView,
} from "../../../../app/editor/scene/widgets/VectorSettingsPane.react.tsx";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  value: () => null,
});

const panes = [
  [
    "vector draw mode",
    { FACTORY_PARAMS: drawModePaneFactoryParams },
    DrawModePaneView,
  ],
  [
    "vector transformer settings",
    { FACTORY_PARAMS: transformerSettingsPaneFactoryParams },
    TransformerSettingsPaneView,
  ],
  [
    "vector settings",
    { FACTORY_PARAMS: vectorSettingsPaneFactoryParams },
    VectorSettingsPaneView,
  ],
];

function clone(value: any): any {
  if (value == null || typeof value !== "object") return value;
  if (typeof value.clone === "function") return value.clone();
  if (Array.isArray(value)) return value.map(clone);
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, clone(entry)]),
  );
}

async function render(View: any, Controller: any) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const changes: unknown[] = [];

  await act(async () => {
    root.render(
      <View
        onInputChange={(value: unknown) => changes.push(value)}
        paneParams={{
          inputtedData: clone(Controller.FACTORY_PARAMS.inputtedData),
          settings: clone(Controller.FACTORY_PARAMS.settings),
        }}
      />,
    );
  });

  return {
    changes,
    container,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("TweakpanePaneHost", () => {
  it.each(panes as any[])(
    "hosts %s through React while retaining native Tweakpane DOM",
    async (_, Controller, View) => {
      const view = await render(View, Controller);

      expect(view.container.querySelector(".tp-rotv")).not.toBeNull();
      expect(
        view.container.querySelector(".tp-lblv, .tp-selectgridv"),
      ).not.toBeNull();

      await view.unmount();
      expect(view.container.innerHTML).toBe("");
    },
  );
});
