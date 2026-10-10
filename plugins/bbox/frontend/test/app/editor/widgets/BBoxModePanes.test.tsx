/* @vitest-environment jsdom */

import { act, default as React } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { createTestPaneParams } from "../../../../../../../core/frontend/lib/common/lib/testing/panes";
import { renderTestView } from "../../../../../../../core/frontend/lib/common/lib/testing/react";

import {
  createActionPaneElementFactory as createBBoxActionPaneElementFactory,
  actionPaneFactoryParams as bboxActionPaneFactoryParams,
  ActionPaneView as BBoxActionPaneView,
} from "../../../../app/editor/scene/widgets/ActionPane.ts";
import {
  createDrawModePaneElementFactory as createBBoxDrawModePaneElementFactory,
  drawModePaneFactoryParams as bboxDrawModePaneFactoryParams,
  getDrawModePaneSelectSettings as getBBoxDrawModePaneSelectSettings,
  DrawModePaneView as BBoxDrawModePaneView,
} from "../../../../app/editor/scene/widgets/DrawModePane.react.tsx";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
});

describe("DrawModePaneView", () => {
  it("renders bbox modes and forwards the selected mode", async () => {
    expect(createBBoxDrawModePaneElementFactory()).toHaveProperty("attach");
    expect(
      getBBoxDrawModePaneSelectSettings(
        createTestPaneParams(bboxDrawModePaneFactoryParams),
      ).cells(1),
    ).toEqual({ title: "Center", value: "center2front" });

    const changes: unknown[] = [];
    const view = await renderTestView(
      <BBoxDrawModePaneView
        paneParams={createTestPaneParams(bboxDrawModePaneFactoryParams)}
        onInputChange={(value) => changes.push(value)}
      />,
    );

    await act(async () => {
      view.container
        .querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]
        .click();
    });

    expect(changes).toEqual([{ drawMode: "center2front" }]);
    await view.unmount();
  });
});

describe("ActionPaneView", () => {
  it("maps action state to the grid and back", async () => {
    const changes: unknown[] = [];
    const view = await renderTestView(
      <BBoxActionPaneView
        paneParams={createTestPaneParams(bboxActionPaneFactoryParams)}
        onInputChange={(value) => changes.push(value)}
      />,
    );

    await act(async () => {
      [...view.container.querySelectorAll<HTMLElement>(".tp-selectbtnv_b")]
        .find((button) => button.textContent === "D")
        ?.click();
    });

    expect(changes).toEqual([{ action: "draw" }]);
    await view.unmount();
  });

  it("preserves the bbox default action in the action pane descriptors", () => {
    expect(createBBoxActionPaneElementFactory()).toHaveProperty("attach");
  });
});
