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

import { BBoxLayerOverlayView } from "../../../../app/editor/scene/layer/BBoxLayer.react.tsx";
import type { BBoxSlice } from "../../../../app/editor/scene/layer/BBoxSlice";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
});

const BBOX_LAYER_DESCRIPTORS = [
  { key: "bbox", name: "Bounding Box", kind: "label" },
] as const;

function createBBoxSlice(): BBoxSlice {
  return {
    ui: {
      action: "edit",
      drawMode: "corner2corner",
      disabled: false,
      selectedBoxId: null,
      selectedTrackId: null,
      canCopy: false,
      canPaste: false,
      autoTracks: false,
      drawBoxActive: false,
      boxInspectorDisabled: false,
      trackInspectorDisabled: false,
    },
    settings: {
      values: {
        timePathRange: 4,
        maintainRelativeElevation: true,
        showPerceivedClass: true,
        showTooltips: false,
        showOcclusion: true,
        showDistinctiveness: false,
        showTimestampDiff: false,
        showTrackBoxId: false,
        boxTransparency: false,
        boxOpacity: 0.2,
        hoveredBoxColor: { r: 1, g: 0, b: 0 },
        selectedBoxColor: { r: 0, g: 0, b: 1 },
      },
      disabled: false,
      disallowRelativeElevation: false,
    },
    boxes: [],
    tracks: [],
    classes: [],
  };
}

function createOverlaySource(isActive: boolean) {
  return { overlaySnapshot: { isActive, tooltips: [] } };
}

async function renderOverlay(
  layerKey: string,
  slice: unknown,
  node: JSX.Element,
) {
  // The inspector containers inside the overlay read their plugin slice
  // from the store, so merge it exactly as the route mapper does.
  const state = createEditorStateFixture({
    layerDescriptors: BBOX_LAYER_DESCRIPTORS,
    layers: { [layerKey]: slice } as unknown as Partial<LayersDomainSlice>,
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

describe("bbox layer overlays", () => {
  it("shows the bbox inspector panels only while the bbox layer is active", async () => {
    const active = await renderOverlay(
      "bbox",
      createBBoxSlice(),
      <BBoxLayerOverlayView source={createOverlaySource(true)} />,
    );
    expectPanel(active.container, "object-track", false);
    expectPanel(active.container, "bounding-box", false);
    await active.unmount();

    const inactive = await renderOverlay(
      "bbox",
      createBBoxSlice(),
      <BBoxLayerOverlayView source={createOverlaySource(false)} />,
    );
    expectPanel(inactive.container, "object-track", true);
    expectPanel(inactive.container, "bounding-box", true);
    await inactive.unmount();
  });
});
