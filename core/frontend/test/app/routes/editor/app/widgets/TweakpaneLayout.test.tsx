/* @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";

import { renderTestView as renderView } from "../../../../../../lib/common/lib/testing/react";

import {
  TweakpaneRack,
  TweakpaneSeparator,
} from "../../../../../../app/routes/editor/app/widgets/TweakpaneLayout.react.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
});

describe("TweakpaneRack", () => {
  it("matches the titleless Tweakpane root and content structure", async () => {
    const view = await renderView(
      <TweakpaneRack className="custom-rack">
        <span>Pane content</span>
      </TweakpaneRack>,
    );

    const rack = view.container.querySelector(".tp-rotv");
    const content = view.container.querySelector<HTMLElement>(".tp-rotv_c");
    expect(rack?.classList.contains("tp-rotv-expanded")).toBe(true);
    expect(rack?.classList.contains("tp-rotv-not")).toBe(true);
    expect(rack?.classList.contains("custom-rack")).toBe(true);
    expect(content?.style.height).toBe("auto");
    expect(content?.textContent).toBe("Pane content");

    await view.unmount();
  });
});

describe("TweakpaneSeparator", () => {
  it("matches Tweakpane separator markup and optional spacing", async () => {
    const view = await renderView(
      <>
        <TweakpaneSeparator />
        <TweakpaneSeparator paddingTop="2px" />
      </>,
    );

    const separators = view.container.querySelectorAll<HTMLElement>(".tp-sprv");
    expect(separators).toHaveLength(2);
    expect(separators[0].querySelector(".tp-sprv_r")).not.toBeNull();
    expect(separators[0].hasAttribute("style")).toBe(false);
    expect(separators[1].style.paddingTop).toBe("2px");

    await view.unmount();
  });
});
