/* @vitest-environment jsdom */

import { act, default as React } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { createTestPaneParams } from "../../../../../../../core/frontend/lib/common/lib/testing/panes";
import { renderTestView } from "../../../../../../../core/frontend/lib/common/lib/testing/react";

import {
  ActionPaneView,
  actionPaneFactoryParams,
} from "../../../../app/editor/scene/widgets/ActionPane.ts";
import {
  drawModePaneFactoryParams,
  DrawModePaneView,
} from "../../../../app/editor/scene/widgets/DrawModePane.react.tsx";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
});

describe("DrawModePaneView", () => {
  it("keeps vector draw-mode defaults and selections", async () => {
    const vectorChanges: unknown[] = [];
    const vector = await renderTestView(
      <DrawModePaneView
        paneParams={createTestPaneParams(drawModePaneFactoryParams)}
        onInputChange={(value: unknown) => vectorChanges.push(value)}
      />,
    );

    expect(
      vector.container.querySelectorAll<HTMLInputElement>(
        'input[type="radio"]',
      )[0].checked,
    ).toBe(true);

    await act(async () => {
      vector.container
        .querySelectorAll<HTMLInputElement>('input[type="radio"]')[2]
        .click();
    });

    expect(vectorChanges).toEqual([{ drawMode: "point" }]);
    await vector.unmount();
  });
});

describe("ActionPaneView", () => {
  it("preserves the vector default action in controlled views", async () => {
    const changes: unknown[] = [];
    const vector = await renderTestView(
      <ActionPaneView
        paneParams={createTestPaneParams(actionPaneFactoryParams)}
        onInputChange={(value: unknown) => changes.push(value)}
      />,
    );
    await act(async () => {
      [...vector.container.querySelectorAll<HTMLElement>(".tp-selectbtnv_b")]
        .find((button) => button.textContent === "D")
        ?.click();
    });
    expect(changes).toEqual([{ action: "draw" }]);
    await vector.unmount();
  });
});
