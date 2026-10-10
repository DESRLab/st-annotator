/* @vitest-environment jsdom */

import { act, default as React } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { createTestPaneParams } from "../../../../../../../core/frontend/lib/common/lib/testing/panes";
import { renderTestView } from "../../../../../../../core/frontend/lib/common/lib/testing/react";

import { ActionPaneView as SegmentationActionPaneView } from "../../../../app/editor/scene/widgets/ActionPane.ts";
import {
  drawModePaneFactoryParams as segmentationDrawModePaneFactoryParams,
  DrawModePaneView as SegmentationDrawModePaneView,
} from "../../../../app/editor/scene/widgets/DrawModePane.react.tsx";
import {
  createEditModePaneElementFactory,
  EditModePaneView as SegmentationEditModePaneView,
} from "../../../../app/editor/scene/widgets/EditModePane.react.tsx";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
});

describe("SegmentationDrawModePaneView", () => {
  it("keeps segmentation draw-mode defaults and selections", async () => {
    const segmentationChanges: { drawMode: string }[] = [];
    const segmentation = await renderTestView(
      <SegmentationDrawModePaneView
        paneParams={createTestPaneParams(segmentationDrawModePaneFactoryParams)}
        onInputChange={(value: { drawMode: string }) =>
          segmentationChanges.push(value)
        }
      />,
    );

    expect(
      segmentation.container.querySelectorAll<HTMLInputElement>(
        'input[type="radio"]',
      )[3].checked,
    ).toBe(true);

    await act(async () => {
      segmentation.container
        .querySelectorAll<HTMLInputElement>('input[type="radio"]')[0]
        .click();
    });

    expect(segmentationChanges).toEqual([{ drawMode: "brush" }]);
    await segmentation.unmount();
  });
});

describe("SegmentationEditModePane", () => {
  it("renders edit modes and forwards selection changes", async () => {
    const changes: { editMode: string }[] = [];
    const view = await renderTestView(
      <SegmentationEditModePaneView
        paneParams={{
          inputtedData: { editMode: "add" },
          computedData: {},
          settings: { disabled: false, hidden: false },
        }}
        onInputChange={(value: { editMode: string }) => changes.push(value)}
      />,
    );

    await act(async () => {
      view.container
        .querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]
        .click();
    });
    expect(changes).toEqual([{ editMode: "erase" }]);
    expect(view.container.querySelector(".tp-lblv")).not.toBeNull();
    await view.unmount();

    expect(createEditModePaneElementFactory()).toHaveProperty("attach");
  });
});

describe("SegmentationActionPaneView", () => {
  it("preserves the segmentation default action in the controlled view", async () => {
    const changes: { action: string }[] = [];
    const segmentation = await renderTestView(
      <SegmentationActionPaneView
        paneParams={createTestPaneParams({
          inputtedData: { action: "navigate" },
        })}
        onInputChange={(value: { action: string }) => changes.push(value)}
      />,
    );
    await act(async () => {
      [
        ...segmentation.container.querySelectorAll<HTMLElement>(
          ".tp-selectbtnv_b",
        ),
      ]
        .find((button) => button.textContent === "S")
        ?.click();
    });
    expect(changes).toEqual([{ action: "select" }]);
    await segmentation.unmount();
  });
});
