/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import type { CoordBounds } from "../../../../../../lib/common/lib/spatial";

import {
  FrameInspectorPaneView,
  formatCoordBounds,
  formatTimestampBounds,
  parseCoordBounds,
} from "../../../../../../app/routes/editor/app/widgets/FrameInspectorPane.react.tsx";
import type { FrameInspectorPaneParams } from "../../../../../../app/routes/editor/app/widgets/FrameInspectorPane.react.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const xBounds = { min: 1, max: 2 };
const yBounds = { min: null, max: 3 };

function paneParams(
  overrides: Partial<{
    inputtedData: Partial<FrameInspectorPaneParams["inputtedData"]>;
    computedData: Partial<FrameInspectorPaneParams["computedData"]>;
    settings: Partial<FrameInspectorPaneParams["settings"]>;
  }> = {},
) {
  return {
    inputtedData: {
      xBounds,
      yBounds,
      zBounds: null,
      tBounds: null,
      status: "incomplete",
      ...overrides.inputtedData,
    },
    computedData: {},
    settings: {
      disabled: false,
      hidden: false,
      disableSTInput: false,
      ...overrides.settings,
    },
  };
}

async function renderView(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<FrameInspectorPaneView {...props} />);
  });

  return {
    container,
    rerender: async (nextProps) => {
      await act(async () => {
        root.render(<FrameInspectorPaneView {...nextProps} />);
      });
    },
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("frame bounds formatting", () => {
  it("matches the previous bounds text format", () => {
    expect(formatCoordBounds(xBounds as unknown as CoordBounds)).toBe("[1, 2]");
    expect(formatCoordBounds(null)).toBe("[null, null]");
    expect(formatTimestampBounds(null)).toBe("[null, null]");
    expect(parseCoordBounds("[1, null]").min).toBe(1);
    expect(parseCoordBounds("[1, null]").max).toBeNull();
    expect(Object.isFrozen(parseCoordBounds("[1, null]"))).toBe(true);
  });
});

describe("FrameInspectorPaneView", () => {
  it("renders compatible rows and emits status changes", async () => {
    const changes = [];
    const view = await renderView({
      paneParams: paneParams(),
      onInputChange: (change) => changes.push(change),
    });

    const rows = view.container.querySelectorAll(".tp-lblv");
    expect(
      view.container.querySelector<HTMLElement>(".tp-rotv_c").style.height,
    ).toBe("auto");
    expect(rows).toHaveLength(5);
    expect(rows[0].textContent).toContain("X Bounds");
    expect(rows[4].textContent).toContain("Frame Status");
    expect(
      view.container
        .querySelector('input[type="text"]')
        .classList.contains("tp-txtv_i"),
    ).toBe(true);
    expect(
      view.container
        .querySelector('input[type="radio"]')
        .classList.contains("tp-radv_i"),
    ).toBe(true);

    const completeButton = rows[4].querySelectorAll<HTMLInputElement>(
      'input[type="radio"]',
    )[1];
    await act(async () => {
      completeButton.checked = true;
      completeButton.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(changes).toEqual([{ status: "complete" }]);
    expect(view.container.querySelectorAll(".tp-sprv_r")).toHaveLength(1);

    await view.unmount();
  });

  it("disables bounds independently from status", async () => {
    const view = await renderView({
      paneParams: paneParams({ settings: { disableSTInput: true } }),
      onInputChange: () => {},
    });

    expect(
      view.container.querySelector<HTMLInputElement>("input").disabled,
    ).toBe(true);
    expect(
      view.container.querySelector<HTMLInputElement>('input[type="radio"]')
        .disabled,
    ).toBe(false);

    await view.unmount();
  });

  it("disables the status radiogrid itself when the pane is disabled", async () => {
    const changes = [];
    const view = await renderView({
      paneParams: paneParams({ settings: { disabled: true } }),
      onInputChange: (change) => changes.push(change),
    });

    expect(
      view.container
        .querySelector(".tp-radgridv")
        ?.classList.contains("tp-v-disabled"),
    ).toBe(true);

    const radios = view.container.querySelectorAll<HTMLInputElement>(
      'input[type="radio"]',
    );
    expect(radios).toHaveLength(2);
    for (const radio of radios) {
      expect(radio.disabled).toBe(true);
      expect(radio.tabIndex).toBe(-1);
    }

    await act(async () => {
      radios[1].click();
    });
    expect(changes).toEqual([]);

    await view.unmount();
  });

  it("applies the radiogrid disabled state as the setting changes", async () => {
    const view = await renderView({
      paneParams: paneParams(),
      onInputChange: () => {},
    });
    expect(
      view.container.querySelector<HTMLInputElement>('input[type="radio"]')
        .disabled,
    ).toBe(false);
    expect(
      view.container
        .querySelector(".tp-radgridv")
        ?.classList.contains("tp-v-disabled"),
    ).toBe(false);

    await view.rerender({
      paneParams: paneParams({ settings: { disabled: true } }),
      onInputChange: () => {},
    });
    expect(
      view.container.querySelector<HTMLInputElement>('input[type="radio"]')
        .disabled,
    ).toBe(true);
    expect(
      view.container
        .querySelector(".tp-radgridv")
        ?.classList.contains("tp-v-disabled"),
    ).toBe(true);

    await view.rerender({
      paneParams: paneParams(),
      onInputChange: () => {},
    });
    expect(
      view.container.querySelector<HTMLInputElement>('input[type="radio"]')
        .disabled,
    ).toBe(false);
    expect(
      view.container
        .querySelector(".tp-radgridv")
        ?.classList.contains("tp-v-disabled"),
    ).toBe(false);

    await view.unmount();
  });
});
