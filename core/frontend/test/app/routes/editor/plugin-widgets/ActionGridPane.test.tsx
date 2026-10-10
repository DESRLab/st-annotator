/* @vitest-environment jsdom */

import { act, default as React } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  ActionsGridPaneView,
  createActionsGridPaneFactoryParams,
} from "../../../../../app/routes/editor/plugin-widgets/ActionGridPane.react.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const options = {
  actions: [
    { value: "move", label: "Move" },
    { value: "rotate", label: "Rotate" },
    { value: "scale", label: "Scale" },
  ],
} as const;

afterEach(() => document.body.replaceChildren());

describe("ActionsGridPaneView", () => {
  it("renders configured actions and emits single-select updates", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const changes: unknown[] = [];

    await act(async () =>
      root.render(
        <ActionsGridPaneView
          onInputChange={(value) => changes.push(value)}
          options={options}
          paneParams={createActionsGridPaneFactoryParams(options)}
        />,
      ),
    );

    const buttons = [
      ...container.querySelectorAll<HTMLElement>(".tp-selectbtnv_b"),
    ];
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Move",
      "Rotate",
      "Scale",
    ]);
    await act(async () => buttons[2].click());
    expect(changes).toEqual([
      { isActionSelected: { move: false, rotate: false, scale: true } },
    ]);

    await act(async () => root.unmount());
  });

  it("reconciles selected, hidden, and disabled state", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const paneParams = createActionsGridPaneFactoryParams(options);
    paneParams.inputtedData.isActionSelected.rotate = true;
    paneParams.settings.disabled = true;

    await act(async () =>
      root.render(
        <ActionsGridPaneView
          onInputChange={() => {}}
          options={options}
          paneParams={paneParams}
        />,
      ),
    );

    expect(
      container
        .querySelectorAll(".tp-selectbtnv_b")[1]
        .classList.contains("tp-selectbtnv_b-selected"),
    ).toBe(true);
    expect(
      container
        .querySelector(".tp-selectgridv")
        ?.classList.contains("tp-v-disabled"),
    ).toBe(true);

    await act(async () =>
      root.render(
        <ActionsGridPaneView
          onInputChange={() => {}}
          options={options}
          paneParams={{
            ...paneParams,
            settings: { disabled: false, hidden: true },
          }}
        />,
      ),
    );
    expect(container.querySelector(".tp-v-hidden")).not.toBeNull();

    await act(async () => root.unmount());
  });
});
