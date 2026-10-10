/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import type { LayerMenuModel } from "../../../../../../app/routes/editor/app/EditorState.react.ts";
import { LayersPaneView } from "../../../../../../app/routes/editor/app/widgets/LayersPane.react.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const NOOP_CONTROLS = {
  controlsSections: null,
  controlsView: null,
  addEventListener: (): void => {},
  removeEventListener: (): void => {},
};

function createLayerModel(
  key: string,
  name: string,
  enabled = true,
  overrides: Partial<LayerMenuModel> = {},
): LayerMenuModel {
  return {
    key,
    name,
    enabled,
    isActive: false,
    actionsView: <button type="button">{name} action</button>,
    toolsView: null,
    prefsView: null,
    objectTreeView: null,
    controls: NOOP_CONTROLS,
    ...overrides,
  };
}

function setupLayers() {
  const sourceA = createLayerModel("source-a", "Source A");
  const labelA = createLayerModel("label-a", "Label A");
  const labelB = createLayerModel("label-b", "Label B", false);

  return {
    sourceA,
    labelA,
    labelB,
    layers: [sourceA, labelA, labelB],
  };
}

type LayersPaneViewProps = Parameters<typeof LayersPaneView>[0];

function paneParams(
  overrides: Partial<{
    inputtedData: Partial<LayersPaneViewProps["paneParams"]["inputtedData"]>;
    computedData: Partial<
      NonNullable<LayersPaneViewProps["paneParams"]["computedData"]>
    >;
    settings: Partial<LayersPaneViewProps["paneParams"]["settings"]>;
  }> = {},
) {
  return {
    inputtedData: {
      layersEnabled: [true, false, true],
      ...overrides.inputtedData,
    },
    computedData: {
      activeKey: null,
      ...overrides.computedData,
    },
    settings: {
      disabled: false,
      hidden: false,
      ...overrides.settings,
    },
  };
}

async function renderView(props: Parameters<typeof LayersPaneView>[0]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<LayersPaneView {...props} />);
  });

  return {
    container,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("LayersPane helpers", () => {
  it("renders stable layer rows", async () => {
    const { layers } = setupLayers();
    const view = await renderView({
      layers,
      paneParams: paneParams(),
      onInputChange: () => {},
    });
    expect(
      view.container.querySelector('[data-test="editor-layer-row-label-a"]'),
    ).not.toBeNull();
    await view.unmount();
  });

  it("matches the old toggle-all button title logic", async () => {
    const enabledView = await renderView({
      layers: [
        createLayerModel("source-a", "Source A"),
        createLayerModel("label-b", "Label B"),
      ],
      paneParams: paneParams({
        inputtedData: { layersEnabled: [true, true] },
      }),
      onInputChange: () => {},
    });
    expect(
      [...enabledView.container.querySelectorAll(".tp-btnv_b")].find(
        (button) => button.textContent === "Disable All",
      ),
    ).toBeTruthy();
    await enabledView.unmount();

    const disabledView = await renderView({
      layers: [
        createLayerModel("source-a", "Source A"),
        createLayerModel("label-b", "Label B", false),
      ],
      paneParams: paneParams({
        inputtedData: { layersEnabled: [true, false] },
      }),
      onInputChange: () => {},
    });
    expect(
      [...disabledView.container.querySelectorAll(".tp-btnv_b")].find(
        (button) => button.textContent === "Enable All",
      ),
    ).toBeTruthy();
    await disabledView.unmount();
  });
});

describe("LayersPaneView", () => {
  it("renders compatible rows, active layer state, and React-owned action content", async () => {
    const { layers } = setupLayers();
    const changes = [];
    const clicks = [];
    const view = await renderView({
      layers,
      paneParams: paneParams({ computedData: { activeKey: "label-a" } }),
      onInputChange: (change) => changes.push(change),
      onToggleAll: () => clicks.push("toggle"),
      onClickRow: (key) => clicks.push(key),
    });

    const row = view.container.querySelector(
      '[data-test="editor-layer-row-label-a"]',
    );
    const name = row.querySelector<HTMLElement>(
      '[data-test="editor-layer-name"]',
    );
    const checkbox = row.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );

    expect(name.classList.contains("active")).toBe(true);
    expect(row.textContent).toContain("Label A action");
    expect(checkbox.checked).toBe(false);

    await act(async () => {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(changes).toEqual([{ layersEnabled: [true, true, true] }]);
    expect(view.container.querySelectorAll(".tp-sprv_r")).toHaveLength(1);

    await act(async () => {
      name.click();
    });

    expect(clicks).toEqual(["label-a"]);

    await view.unmount();
  });

  it("renders the React action in place of the default action content", async () => {
    const { layers, labelA } = setupLayers();
    labelA.actionsView = <button type="button">Label A React action</button>;

    const view = await renderView({
      layers,
      paneParams: paneParams(),
      onInputChange: () => {},
    });

    const row = view.container.querySelector(
      '[data-test="editor-layer-row-label-a"]',
    );
    expect(row.textContent).toContain("Label A React action");
    expect(row.textContent).not.toContain("(None)");

    await view.unmount();
  });

  it("does not emit row clicks for disabled layers and hides when configured", async () => {
    const { layers } = setupLayers();
    const clicks = [];
    const view = await renderView({
      layers,
      paneParams: paneParams(),
      onInputChange: () => {},
      onToggleAll: () => clicks.push("toggle"),
      onClickRow: (key) => clicks.push(key),
    });

    const disabledName = view.container.querySelector<HTMLElement>(
      '[data-test="editor-layer-row-label-b"] [data-test="editor-layer-name"]',
    );
    expect(disabledName.style.cursor).toBe("not-allowed");

    await act(async () => {
      disabledName.click();
      [...view.container.querySelectorAll<HTMLElement>(".tp-btnv_b")]
        .find((button) => button.textContent === "Enable All")
        .click();
    });

    expect(clicks).toEqual(["toggle"]);
    await view.unmount();

    const hiddenView = await renderView({
      layers,
      paneParams: paneParams({ settings: { hidden: true } }),
      onInputChange: () => {},
      onToggleAll: () => {},
      onClickRow: () => {},
    });
    expect(hiddenView.container.querySelector(".tp-v-hidden")).not.toBeNull();
    await hiddenView.unmount();
  });
});
