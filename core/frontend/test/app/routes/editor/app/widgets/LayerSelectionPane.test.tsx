/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import type { LayerMenuModel } from "../../../../../../app/routes/editor/app/EditorState.react.ts";
import { LayerSelectionPaneView } from "../../../../../../app/routes/editor/app/widgets/LayerSelectionPane.react.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function createLayerModel(key: string, name: string): LayerMenuModel {
  return {
    key,
    name,
    enabled: true,
    isActive: false,
    actionsView: null,
    toolsView: null,
    prefsView: null,
    objectTreeView: null,
    controls: {
      controlsSections: null,
      controlsView: null,
      addEventListener: (): void => {},
      removeEventListener: (): void => {},
    },
  };
}

const layers = [
  createLayerModel("source-a", "Source A"),
  createLayerModel("label-a", "Label A"),
];

async function renderView(
  props: React.ComponentProps<typeof LayerSelectionPaneView>,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async (): Promise<void> => {
    root.render(<LayerSelectionPaneView {...props} />);
  });

  return {
    container,
    unmount: async (): Promise<void> => {
      await act(async (): Promise<void> => {
        root.unmount();
      });
      container.remove();
    },
  };
}

afterEach((): void => {
  document.body.replaceChildren();
});

describe("LayerSelectionPaneView", () => {
  it("uses the native Configure Layer selector and hosts React content", async () => {
    const changes: (string | null)[] = [];
    const view = await renderView({
      children: (
        <div data-test="layer-selection-content">Source A controls</div>
      ),
      onInputChange: ({ selectedKey }): void => changes.push(selectedKey),
      paneParams: {
        computedData: { layers },
        inputtedData: { selectedKey: "source-a" },
        settings: { disabled: false, hidden: false },
      },
    });

    const row = view.container.querySelector(".tp-lblv");
    const select = view.container.querySelector<HTMLSelectElement>("select");
    const content = view.container.querySelector(
      '[data-test="layer-selection-content"]',
    );

    expect(row?.querySelector(".tp-lblv_l")?.textContent).toBe(
      "Configure Layer:",
    );
    expect(select?.classList.contains("tp-lstv_s")).toBe(true);
    expect(
      content?.parentElement?.parentElement?.classList.contains(
        "tp-htmlcontainerv_t",
      ),
    ).toBe(true);

    await act(async (): Promise<void> => {
      if (select == null) throw new Error("Layer selector was not rendered");
      select.selectedIndex = 2;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(changes).toEqual(["label-a"]);
    await view.unmount();
  });
});
