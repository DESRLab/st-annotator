/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { AccordionPaneView } from "../../../../../app/routes/editor/widgets/AccordionPane.react.tsx";
import { TabberPaneView } from "../../../../../app/routes/editor/widgets/TabberPane.react.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
});

describe("base wrapper pane controllers", () => {
  it("renders tabs through Tweakpane and hosts React tab content", async () => {
    const dom = document.createElement("div");
    document.body.appendChild(dom);
    const root = createRoot(dom);

    await act(async () => {
      root.render(
        <TabberPaneView
          onInputChange={() => {}}
          paneParams={{
            inputtedData: {},
            settings: { disabled: false, hidden: false },
          }}
          tabs={{
            First: <div>first body</div>,
            Second: <div>second body</div>,
          }}
        />,
      );
    });
    expect(dom.querySelector('[class*="react-tabber"]')).toBeNull();
    expect(dom.textContent).toContain("First");
    expect(dom.textContent).toContain("Second");
    expect(dom.textContent).toContain("first body");
    expect(dom.textContent).toContain("second body");

    await act(async () => root.unmount());
    expect(dom.innerHTML).toBe("");
  });

  it("renders folders through Tweakpane and hosts React content", async () => {
    const dom = document.createElement("div");
    document.body.appendChild(dom);
    const root = createRoot(dom);

    await act(async () => {
      root.render(
        <AccordionPaneView
          folders={{
            Draw: <div>draw body</div>,
            Transform: <div>transform body</div>,
          }}
          onInputChange={() => {}}
          paneParams={{
            inputtedData: {},
            settings: { disabled: false, hidden: false },
          }}
        />,
      );
    });
    expect(dom.querySelector('[class*="react-accordion"]')).toBeNull();
    expect(dom.textContent).toContain("Draw");
    expect(dom.textContent).toContain("Transform");
    expect(dom.textContent).toContain("draw body");
    expect(dom.textContent).toContain("transform body");

    await act(async () => root.unmount());
    expect(dom.innerHTML).toBe("");
  });

  it("renders direct React content into an accordion folder", async () => {
    const dom = document.createElement("div");
    document.body.appendChild(dom);
    const root = createRoot(dom);

    await act(async () => {
      root.render(
        <AccordionPaneView
          folders={{ Clipboard: <button type="button">Copy</button> }}
          onInputChange={() => {}}
          paneParams={{
            inputtedData: {},
            settings: { disabled: false, hidden: false },
          }}
        />,
      );
    });

    expect(dom.textContent).toContain("Clipboard");
    expect(
      [...dom.querySelectorAll("button")].find(
        (button) => button.textContent === "Copy",
      ),
    ).toBeTruthy();

    await act(async () => root.unmount());
    expect(dom.innerHTML).toBe("");
  });
});
