/* @vitest-environment jsdom */

import { act, default as React, type JSX } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { EditorIntentsProvider, EditorStoreProvider } from "sta/app/editor";
import {
  createEditorStateFixture,
  createMockEditorStore,
  noopEditorIntents,
} from "sta/app/editor/testing";
import type { LayersDomainSlice } from "sta/app/editor";
import type { FixtureLayerDescriptor } from "sta/app/editor/testing";

import { VectorLayerOverlayView } from "../../../../app/editor/scene/layer/VectorLayer.react.tsx";
import type { VectorSlice } from "../../../../app/editor/scene/layer/VectorSlice";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
});

const VECTOR_LAYER_DESCRIPTORS: readonly FixtureLayerDescriptor[] = [
  { key: "vector", name: "Vector", kind: "label" },
];

function createVectorSlice(): VectorSlice {
  return {
    ui: {
      action: "edit",
      drawMode: "polyline",
      disabled: false,
      selectedVectorId: null,
      canCopy: false,
      canPaste: false,
      drawVectorActive: false,
      vectorInspectorDisabled: false,
    },
    settings: {
      values: {
        showTooltips: false,
        showVectorId: false,
        strokeWidth: 3,
        strokeColor: { r: 1, g: 0, b: 0 },
        hoveredVectorColor: { r: 1, g: 1, b: 0 },
        selectedVectorColor: { r: 0, g: 0, b: 1 },
      },
      disabled: false,
    },
    vectors: [],
    classes: [],
  };
}

function createOverlaySource(isActive: boolean) {
  return { overlaySnapshot: { isActive, tooltips: [] } };
}

async function renderOverlay(slice: unknown, node: JSX.Element) {
  // The inspector containers inside the overlay read their plugin slice
  // from the store, so merge it exactly as the route mapper does.
  const state = createEditorStateFixture({
    layerDescriptors: VECTOR_LAYER_DESCRIPTORS,
    layers: { vector: slice } as unknown as Partial<LayersDomainSlice>,
  });
  const { store } = createMockEditorStore(state);

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <EditorStoreProvider store={store}>
        <EditorIntentsProvider intents={noopEditorIntents}>
          {node}
        </EditorIntentsProvider>
      </EditorStoreProvider>,
    );
  });

  return {
    container,
    unmount: async (): Promise<void> => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function expectPanel(
  container: HTMLElement,
  slug: string,
  hidden: boolean,
): void {
  const panel = container.querySelector<HTMLElement>(
    `[data-test="editor-panel-${slug}"]`,
  );
  expect(panel, `panel editor-panel-${slug}`).not.toBeNull();
  expect(panel?.hidden).toBe(hidden);
}

describe("vector layer overlays", () => {
  it("shows the vector inspector panel only while the vector layer is active", async () => {
    const active = await renderOverlay(
      createVectorSlice(),
      <VectorLayerOverlayView source={createOverlaySource(true)} />,
    );
    expectPanel(active.container, "vector-objects", false);
    await active.unmount();

    const inactive = await renderOverlay(
      createVectorSlice(),
      <VectorLayerOverlayView source={createOverlaySource(false)} />,
    );
    expectPanel(inactive.container, "vector-objects", true);
    await inactive.unmount();
  });
});
