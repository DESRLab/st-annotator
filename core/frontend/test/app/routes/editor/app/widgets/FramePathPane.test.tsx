/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { FramePathPaneView } from "../../../../../../app/routes/editor/app/widgets/FramePathPane.react.tsx";
import { FrameSortFunction } from "../../../../../../app/routes/editor/nav";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type FramePathPaneViewProps = Parameters<typeof FramePathPaneView>[0];

function paneParams(
  overrides: Partial<{
    inputtedData: Partial<FramePathPaneViewProps["paneParams"]["inputtedData"]>;
    computedData: Partial<
      NonNullable<FramePathPaneViewProps["paneParams"]["computedData"]>
    >;
    settings: Partial<FramePathPaneViewProps["paneParams"]["settings"]>;
  }> = {},
) {
  return {
    inputtedData: {
      sortFunc: FrameSortFunction.TXY,
      stride: 5,
      showAllFrames: true,
      currentId: 101,
      currentIdx: 0,
      fps: 3,
      ...overrides.inputtedData,
    },
    computedData: {
      minIdx: 0,
      maxIdx: 3,
      playPauseText: "Play Video",
      statusText: "Paused",
      bufferText: "[0/0]",
      ...overrides.computedData,
    },
    settings: {
      disabled: false,
      hidden: false,
      disablePlayPause: false,
      disableNav: false,
      disableStepPrev: false,
      disableStepNext: false,
      ...overrides.settings,
    },
  };
}

async function renderView(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<FramePathPaneView {...props} />);
  });

  return {
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

describe("FramePathPaneView", () => {
  it("hosts React frame rows in the native Tweakpane container and emits compatible input changes", async () => {
    const changes = [];
    const view = await renderView({
      children: <div data-test="frame-path-react-child">frame row</div>,
      paneParams: paneParams(),
      onInputChange: (change) => changes.push(change),
      onStepPrev: () => {},
      onPlayPause: () => {},
      onStepNext: () => {},
    });

    const pathChild = view.container.querySelector(
      '[data-test="frame-path-react-child"]',
    );
    expect(pathChild).not.toBeNull();
    expect(
      pathChild.parentElement.parentElement.classList.contains(
        "tp-htmlcontainerv_t",
      ),
    ).toBe(true);
    expect(
      view.container.querySelector<HTMLElement>(".tp-rotv_c").style.height,
    ).toBe("auto");
    expect(view.container.querySelectorAll(".tp-sprv_r")).toHaveLength(2);
    expect(
      view.container.querySelector("select").classList.contains("tp-lstv_s"),
    ).toBe(true);
    expect(
      view.container.querySelector("input").classList.contains("tp-txtv_i"),
    ).toBe(true);
    expect(view.container.querySelectorAll(".tp-fldv")).toHaveLength(3);

    const currentFrameRow = [
      ...view.container.querySelectorAll(".tp-lblv"),
    ].find((row) => row.textContent.includes("Current Frame ID"));
    const currentFrameInput = currentFrameRow.querySelector("input");
    await act(async () => {
      currentFrameInput.value = "202";
      currentFrameInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(changes.at(-1)).toEqual({ currentId: 202 });

    await view.unmount();
  });

  it("emits button events while respecting disabled button state", async () => {
    const clicks = [];
    const view = await renderView({
      paneParams: paneParams({ settings: { disableStepPrev: true } }),
      onInputChange: () => {},
      onStepPrev: () => clicks.push("prev"),
      onPlayPause: () => clicks.push("play"),
      onStepNext: () => clicks.push("next"),
    });

    const buttons = [
      ...view.container.querySelectorAll<HTMLButtonElement>(".tp-btnv_b"),
    ];
    expect(buttons[0].disabled).toBe(true);

    await act(async () => {
      buttons[0].click();
      buttons[1].click();
      buttons[2].click();
    });

    expect(clicks).toEqual(["play", "next"]);

    await view.unmount();
  });
});
