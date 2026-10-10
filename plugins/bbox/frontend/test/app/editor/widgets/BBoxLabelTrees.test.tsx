/* @vitest-environment jsdom */

import { act, default as React, type JSX } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorIntentsProvider, EditorStoreProvider } from "sta/app/editor";
import {
  createEditorStateFixture,
  createMockEditorStore,
  noopEditorIntents,
} from "sta/app/editor/testing";
import type { LayersDomainSlice } from "sta/app/editor";

import type {
  BBoxEntity,
  BBoxIntents,
  BBoxSlice,
  BBoxTrackEntity,
} from "../../../../app/editor/scene/layer/BBoxSlice";
import { BBoxLabelsTreeHost } from "../../../../app/editor/scene/widgets/BBoxLabelsTree.react.tsx";

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

const CLASS_CAR = { id: 1, name: "Car" };
const TRACK_ID = "22222222-2222-4222-8222-222222222222";
const BOX_ID = "11111111-1111-4111-8111-111111111111";
const ORPHAN_BOX_ID = "66666666-6666-4666-8666-666666666666";

async function renderPane(
  layerKey: string,
  slice: object,
  intents: typeof noopEditorIntents,
  node: JSX.Element,
) {
  // The fixture builder only knows the base slices; the plugin slice is
  // merged into `layers` exactly as the route mapper does.
  const state = createEditorStateFixture({
    layerDescriptors: BBOX_LAYER_DESCRIPTORS,
    layers: { [layerKey]: slice } as unknown as Partial<LayersDomainSlice>,
  });
  const { store, setState } = createMockEditorStore(state);

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <EditorStoreProvider store={store}>
        <EditorIntentsProvider intents={intents}>{node}</EditorIntentsProvider>
      </EditorStoreProvider>,
    );
  });

  return {
    container,
    setState,
    unmount: async (): Promise<void> => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function queryButton(
  dom: HTMLElement,
  kind: string,
  id: string | null,
): HTMLButtonElement {
  const button = dom.querySelector<HTMLButtonElement>(
    'button[data-label-kind="' +
      kind +
      '"][data-label-id="' +
      (id ?? "") +
      '"]',
  );
  expect(button, `button ${kind} ${String(id)}`).toBeTruthy();
  return button!;
}

describe("bbox labels tree container", () => {
  function createBBoxSlice(overrides: Partial<BBoxSlice> = {}): BBoxSlice {
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
        values: {} as BBoxSlice["settings"]["values"],
        disabled: false,
        disallowRelativeElevation: false,
      },
      boxes: [],
      tracks: [],
      classes: [],
      ...overrides,
    };
  }

  function createBBoxIntents(): typeof noopEditorIntents & {
    bbox: Record<keyof BBoxIntents, ReturnType<typeof vi.fn>>;
  } {
    return {
      ...noopEditorIntents,
      bbox: {
        setAction: vi.fn(),
        setDrawMode: vi.fn(),
        setSettings: vi.fn(),
        setBoxHidden: vi.fn(),
        applyBoxInspectorInput: vi.fn(),
        applyTrackInspectorInput: vi.fn(),
        selectBox: vi.fn(),
        selectTrack: vi.fn(),
        boxInspectorPaneEvent: vi.fn(),
        trackInspectorPaneEvent: vi.fn(),
      },
    };
  }

  function createTrackEntity(
    overrides: Partial<BBoxTrackEntity> = {},
  ): BBoxTrackEntity {
    return {
      id: TRACK_ID,
      text: `T{${TRACK_ID.slice(0, 4)}} [Car]`,
      gtClassId: CLASS_CAR.id,
      isBlack: false,
      ...overrides,
    };
  }

  function createBoxEntity(overrides: Partial<BBoxEntity> = {}): BBoxEntity {
    return {
      id: BOX_ID,
      text: `B{${BOX_ID.slice(0, 4)}} [Car]`,
      boxType: "cuboid",
      hidden: false,
      center: { x: 1, y: 2, z: 3 },
      size: { x: 4, y: 5, z: 6 },
      angle: 0.5,
      entityId: TRACK_ID,
      perceivedClassId: CLASS_CAR.id,
      distinctiveLv: 1,
      occlusionLv: null,
      ...overrides,
    };
  }

  it("renders tracks and boxes from the slice, grouping orphan boxes under (No track)", async () => {
    const intents = createBBoxIntents();
    const view = await renderPane(
      "bbox",
      createBBoxSlice({
        tracks: [createTrackEntity()],
        boxes: [
          createBoxEntity(),
          createBoxEntity({
            id: ORPHAN_BOX_ID,
            entityId: null,
            perceivedClassId: null,
            text: `B{${ORPHAN_BOX_ID.slice(0, 4)}} <Unclassified>`,
          }),
        ],
      }),
      intents,
      <BBoxLabelsTreeHost />,
    );

    expect(view.container.querySelector(".bbox-tree")).toBeTruthy();
    expect(view.container.textContent).toContain("(All Labels)");
    expect(view.container.textContent).toContain("(No track)");
    expect(
      queryButton(view.container, "track", TRACK_ID).textContent,
    ).toContain("[Car]");
    expect(
      queryButton(view.container, "box", ORPHAN_BOX_ID).textContent,
    ).toContain("<Unclassified>");

    // Windowed rows retain hierarchy through ARIA levels and a stable
    // parent-track index without nesting every box in the DOM.
    const trackButton = queryButton(view.container, "track", TRACK_ID);
    const trackedBoxButton = queryButton(view.container, "box", BOX_ID);
    const orphanTrackButton = queryButton(view.container, "track", null);
    const orphanBoxButton = queryButton(view.container, "box", ORPHAN_BOX_ID);
    expect(trackButton.getAttribute("aria-level")).toBe("1");
    expect(trackedBoxButton.getAttribute("aria-level")).toBe("2");
    expect(trackedBoxButton.dataset.trackIndex).toBe(
      trackButton.dataset.trackIndex,
    );
    expect(orphanBoxButton.dataset.trackIndex).toBe(
      orphanTrackButton.dataset.trackIndex,
    );

    await view.unmount();
  });

  it("dispatches selection intents on click and deselects on a second click", async () => {
    const intents = createBBoxIntents();
    const view = await renderPane(
      "bbox",
      createBBoxSlice({
        tracks: [createTrackEntity()],
        boxes: [createBoxEntity()],
      }),
      intents,
      <BBoxLabelsTreeHost />,
    );

    await act(async () => {
      queryButton(view.container, "track", TRACK_ID).click();
    });
    expect(intents.bbox.selectTrack).toHaveBeenCalledWith(TRACK_ID);

    await act(async () => {
      queryButton(view.container, "box", BOX_ID).click();
    });
    expect(intents.bbox.selectBox).toHaveBeenCalledWith(BOX_ID);

    // Once the slice echoes the selection, clicking again deselects.
    await act(async () => {
      view.setState(
        createEditorStateFixture({
          layerDescriptors: BBOX_LAYER_DESCRIPTORS,
          layers: {
            bbox: createBBoxSlice({
              tracks: [createTrackEntity()],
              boxes: [createBoxEntity()],
              ui: {
                ...createBBoxSlice().ui,
                selectedBoxId: BOX_ID,
                selectedTrackId: TRACK_ID,
              },
            }),
          } as unknown as Partial<LayersDomainSlice>,
        }),
      );
    });
    expect(
      queryButton(view.container, "track", TRACK_ID).getAttribute(
        "aria-selected",
      ),
    ).toBe("true");
    expect(
      queryButton(view.container, "box", BOX_ID).getAttribute("aria-selected"),
    ).toBe("true");

    await act(async () => {
      queryButton(view.container, "track", TRACK_ID).click();
    });
    expect(intents.bbox.selectTrack.mock.calls.at(-1)?.[0]).toBeNull();
    await act(async () => {
      queryButton(view.container, "box", BOX_ID).click();
    });
    expect(intents.bbox.selectBox.mock.calls.at(-1)?.[0]).toBeNull();

    await view.unmount();
  });

  it("disables the tree while either inspector is disabled", async () => {
    const intents = createBBoxIntents();
    const view = await renderPane(
      "bbox",
      createBBoxSlice({
        tracks: [createTrackEntity()],
        boxes: [createBoxEntity()],
        ui: { ...createBBoxSlice().ui, boxInspectorDisabled: true },
      }),
      intents,
      <BBoxLabelsTreeHost />,
    );

    expect(
      view.container.querySelector(".bbox-tree")?.getAttribute("aria-disabled"),
    ).toBe("true");
    const buttons = [...view.container.querySelectorAll("button")];
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) expect(button.disabled).toBe(true);

    await view.unmount();
  });

  it("keeps mounted rows bounded for a large track collection", async () => {
    const tracks = Array.from({ length: 50_000 }, (_, index) =>
      createTrackEntity({
        id: `track-${index}` as any,
        text: `Track ${index}`,
      }),
    );
    const view = await renderPane(
      "bbox",
      createBBoxSlice({ tracks, boxes: [] }),
      createBBoxIntents(),
      <BBoxLabelsTreeHost />,
    );

    expect(
      view.container.querySelectorAll('[role="treeitem"]').length,
    ).toBeLessThanOrEqual(18);
    await view.unmount();
  });
});
