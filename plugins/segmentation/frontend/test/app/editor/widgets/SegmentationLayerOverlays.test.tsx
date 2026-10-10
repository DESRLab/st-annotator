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

import { SegmentationLayerOverlayView } from "../../../../app/editor/scene/layer/SegmentationLayer.react.tsx";
import type { SegmentationSlice } from "../../../../app/editor/scene/layer/SegmentationSlice";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
});

const SEGMENTATION_LAYER_DESCRIPTORS: readonly FixtureLayerDescriptor[] = [
  { key: "segmentation", name: "Segmentation", kind: "label" },
];

function createSegmentationSlice(): SegmentationSlice {
  return {
    ui: {
      action: "navigate",
      drawMode: "brush",
      editMode: "add",
      disabled: false,
      selectedInstanceId: null,
      selectedSelectionId: null,
      autoInstances: true,
      drawSelectionActive: false,
      instanceInspectorDisabled: false,
      selectionInspectorDisabled: false,
    },
    settings: {
      values: {
        useAssistant: false,
        timePathRange: 5,
        showTooltips: false,
        showPerceivedClass: false,
        showOcclusion: true,
        showDistinctiveness: false,
        showTimestampDiff: false,
        showTrackSegId: false,
        selectionTransparency: true,
        selectionOpacity: 0.5,
        brushDiameter: 40,
        brushHueStyle: 0.3,
        strokeColor: { r: 1, g: 0, b: 0 },
        hoveredSelectionColor: { r: 1, g: 0, b: 0 },
        selectedSelectionColor: { r: 1, g: 1, b: 0 },
      },
      disabled: false,
      isAssistantAvailable: false,
    },
    instances: [],
    selections: [],
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
    layerDescriptors: SEGMENTATION_LAYER_DESCRIPTORS,
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

describe("segmentation layer overlays", () => {
  it("shows the segmentation inspector panels only while the segmentation layer is active", async () => {
    const active = await renderOverlay(
      "segmentation",
      createSegmentationSlice(),
      <SegmentationLayerOverlayView source={createOverlaySource(true)} />,
    );
    expectPanel(active.container, "object-instance", false);
    expectPanel(active.container, "selection-points", false);
    await active.unmount();

    const inactive = await renderOverlay(
      "segmentation",
      createSegmentationSlice(),
      <SegmentationLayerOverlayView source={createOverlaySource(false)} />,
    );
    expectPanel(inactive.container, "object-instance", true);
    expectPanel(inactive.container, "selection-points", true);
    await inactive.unmount();
  });
});
