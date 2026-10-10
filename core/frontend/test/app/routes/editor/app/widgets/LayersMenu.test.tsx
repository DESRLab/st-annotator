/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LayersMenuView } from "../../../../../../app/routes/editor/app/widgets/LayersMenu.react.tsx";
import { EditorIntentsProvider } from "../../../../../../app/routes/editor/store/EditorIntents.react.tsx";
import { EditorStoreProvider } from "../../../../../../app/routes/editor/store/EditorStore.react.tsx";
import {
  createEditorStateFixture,
  createMockEditorStore,
  noopEditorIntents,
} from "../../../../../../app/routes/editor/store/testing";
import type {
  EditorState,
  LayerViewSlots,
} from "../../../../../../app/routes/editor/store/types";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function createActionView(name: string): React.JSX.Element {
  return <button type="button">{name} action</button>;
}

function createLayersState(): EditorState {
  const descriptors = [
    { key: "source-a", name: "Source A", kind: "source" as const },
    { key: "source-b", name: "Source B", kind: "source" as const },
    { key: "label-a", name: "Label A", kind: "label" as const },
    { key: "label-b", name: "Label B", kind: "label" as const },
  ];
  const controls: LayerViewSlots["controls"] = {
    controlsSections: null,
    controlsView: null,
    addEventListener(): void {},
    removeEventListener(): void {},
  };

  return createEditorStateFixture({
    layers: {
      metadata: new Map(
        descriptors.map((descriptor) => [descriptor.key, descriptor]),
      ),
      order: descriptors.map((descriptor) => descriptor.key),
      views: new Map(
        descriptors.map((descriptor) => [
          descriptor.key,
          {
            actionsView: createActionView(descriptor.name),
            toolsView: null,
            prefsView: null,
            objectTreeView: null,
            controls,
          },
        ]),
      ),
    },
    ui: {
      layers: new Map(
        descriptors.map((descriptor) => [
          descriptor.key,
          { active: false, enabled: true },
        ]),
      ),
      activeLayerKey: null,
      hint: null,
    },
  });
}

function createTestIntents() {
  return {
    ...noopEditorIntents,
    activateLayer: vi.fn(),
    setLayerEnabled: vi.fn(),
    setAllLayersEnabled: vi.fn(),
  };
}

async function renderView() {
  const store = createMockEditorStore(createLayersState());
  const intents = createTestIntents();

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <EditorStoreProvider store={store.store}>
        <EditorIntentsProvider intents={intents}>
          <LayersMenuView />
        </EditorIntentsProvider>
      </EditorStoreProvider>,
    );
  });

  return {
    container,
    intents,
    store,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function setLayerUi(
  state: EditorState,
  key: string,
  ui: { active: boolean; enabled: boolean },
): EditorState {
  const layers = new Map(state.ui.layers);
  layers.set(key, ui);
  return {
    ...state,
    ui: {
      ...state.ui,
      layers,
      activeLayerKey: ui.active
        ? key
        : ([...layers.entries()].find(([, value]) => value.active)?.[0] ??
          null),
    },
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("LayersMenuView", () => {
  it("activates an enabled layer from the selected tab", async () => {
    const view = await renderView();

    await act(async () => {
      [...view.container.querySelectorAll(".tp-tbiv")]
        .find((tab) => tab.textContent === "Source Data")
        .querySelector("button")
        .click();
    });

    const row = view.container.querySelector(
      '[data-test="editor-layer-row-source-a"]',
    );
    const name = row.querySelector('[data-test="editor-layer-name"]');

    await act(async () => {
      name.click();
    });

    expect(view.intents.activateLayer).toHaveBeenCalledWith("source-a");

    // Once the activation round-trips through the store, the row renders
    // as active and keeps its Actions content.
    await act(async () => {
      view.store.setState(
        setLayerUi(createLayersState(), "source-a", {
          active: true,
          enabled: true,
        }),
      );
    });

    const activeRow = view.container.querySelector(
      '[data-test="editor-layer-row-source-a"]',
    );
    const activeName = activeRow.querySelector(
      '[data-test="editor-layer-name"]',
    );
    expect(activeName.classList.contains("active")).toBe(true);
    const action = [...activeRow.querySelectorAll("button")].find(
      (button) => button.textContent === "Source A action",
    );
    expect(action).not.toBeNull();
    expect(action.textContent).toBe("Source A action");

    await view.unmount();
  });

  it("mirrors external layer activation and enabled state changes", async () => {
    const view = await renderView();

    await act(async () => {
      view.store.setState(
        setLayerUi(createLayersState(), "label-a", {
          active: true,
          enabled: true,
        }),
      );
    });

    let row = view.container.querySelector(
      '[data-test="editor-layer-row-label-a"]',
    );
    let name = row.querySelector('[data-test="editor-layer-name"]');
    expect(name.classList.contains("active")).toBe(true);

    // Disabling the active layer deactivates it and unchecks its row.
    const next = setLayerUi(createLayersState(), "label-a", {
      active: false,
      enabled: false,
    });
    await act(async () => {
      view.store.setState(next);
    });

    row = view.container.querySelector(
      '[data-test="editor-layer-row-label-a"]',
    );
    name = row.querySelector('[data-test="editor-layer-name"]');
    const checkbox = row.querySelector('input[type="checkbox"]');
    expect(name.classList.contains("active")).toBe(false);
    expect(checkbox.checked).toBe(false);

    await view.unmount();
  });

  it("toggles all layers in the active tab", async () => {
    const view = await renderView();

    await act(async () => {
      [
        ...view.container.querySelectorAll(
          ".tp-tabv_c > .tp-tbpv:not(.tp-v-hidden) .tp-btnv_b",
        ),
      ]
        .find((button) => button.textContent === "Disable All")
        .click();
    });

    // The Label Data tab is active, so only its layers are toggled.
    expect(view.intents.setLayerEnabled).toHaveBeenCalledWith("label-a", false);
    expect(view.intents.setLayerEnabled).toHaveBeenCalledWith("label-b", false);
    expect(view.intents.setLayerEnabled).not.toHaveBeenCalledWith(
      "source-a",
      expect.anything(),
    );
    expect(view.intents.setLayerEnabled).not.toHaveBeenCalledWith(
      "source-b",
      expect.anything(),
    );

    const disabled = createLayersState();
    await act(async () => {
      view.store.setState(
        setLayerUi(
          setLayerUi(disabled, "label-a", {
            active: false,
            enabled: false,
          }),
          "label-b",
          { active: false, enabled: false },
        ),
      );
    });

    await act(async () => {
      [
        ...view.container.querySelectorAll(
          ".tp-tabv_c > .tp-tbpv:not(.tp-v-hidden) .tp-btnv_b",
        ),
      ]
        .find((button) => button.textContent === "Enable All")
        .click();
    });

    expect(view.intents.setLayerEnabled).toHaveBeenCalledWith("label-a", true);
    expect(view.intents.setLayerEnabled).toHaveBeenCalledWith("label-b", true);

    await view.unmount();
  });
});

describe("LayersMenuView composition", () => {
  it("renders directly in a parent React tree", async () => {
    const view = await renderView();

    expect(
      view.container.querySelector('[data-test="editor-layers-menu"]'),
    ).not.toBeNull();

    await view.unmount();
  });
});
