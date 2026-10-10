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
import type { FixtureLayerDescriptor } from "sta/app/editor/testing";

import type {
  SegmentationInstanceEntity,
  SegmentationIntents,
  SegmentationSelectionEntity,
  SegmentationSlice,
} from "../../../../app/editor/scene/layer/SegmentationSlice";
import { SegmentationLabelsTreeHost } from "../../../../app/editor/scene/widgets/SegmentationLabelsTree.react.tsx";

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

const CLASS_CAR = { id: 1, name: "Car" };
const INSTANCE_ID = "44444444-4444-4444-8444-444444444444";
const SELECTION_ID = "55555555-5555-4555-8555-555555555555";
const ORPHAN_SELECTION_ID = "77777777-7777-4777-8777-777777777777";

async function renderPane(
  layerKey: string,
  slice: object,
  intents: typeof noopEditorIntents,
  node: JSX.Element,
) {
  // The fixture builder only knows the base slices; the plugin slice is
  // merged into `layers` exactly as the route mapper does.
  const state = createEditorStateFixture({
    layerDescriptors: SEGMENTATION_LAYER_DESCRIPTORS,
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

describe("segmentation labels tree container", () => {
  function createSegmentationSlice(
    overrides: Partial<SegmentationSlice> = {},
  ): SegmentationSlice {
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
        values: {} as SegmentationSlice["settings"]["values"],
        disabled: false,
        isAssistantAvailable: false,
      },
      instances: [],
      selections: [],
      classes: [],
      ...overrides,
    };
  }

  function createSegmentationIntents(): typeof noopEditorIntents & {
    segmentation: Record<keyof SegmentationIntents, ReturnType<typeof vi.fn>>;
  } {
    return {
      ...noopEditorIntents,
      segmentation: {
        setAction: vi.fn(),
        setDrawMode: vi.fn(),
        setEditMode: vi.fn(),
        setSettings: vi.fn(),
        applyInstanceInspectorInput: vi.fn(),
        applySelectionInspectorInput: vi.fn(),
        selectInstance: vi.fn(),
        selectSelection: vi.fn(),
        instanceInspectorPaneEvent: vi.fn(),
        selectionInspectorPaneEvent: vi.fn(),
      },
    };
  }

  function createInstanceEntity(
    overrides: Partial<SegmentationInstanceEntity> = {},
  ): SegmentationInstanceEntity {
    return {
      id: INSTANCE_ID,
      text: `T{${INSTANCE_ID.slice(0, 4)}} [Car]`,
      gtClassId: CLASS_CAR.id,
      isBlack: false,
      ...overrides,
    };
  }

  function createSelectionEntity(
    overrides: Partial<SegmentationSelectionEntity> = {},
  ): SegmentationSelectionEntity {
    return {
      id: SELECTION_ID,
      text: `B{${SELECTION_ID.slice(0, 4)}} [Car]`,
      entityId: INSTANCE_ID,
      perceivedClassId: CLASS_CAR.id,
      distinctiveLv: 1,
      occlusionLv: null,
      ...overrides,
    };
  }

  it("groups selections under their instance and dispatches selection intents on click", async () => {
    const intents = createSegmentationIntents();
    const view = await renderPane(
      "segmentation",
      createSegmentationSlice({
        instances: [createInstanceEntity()],
        selections: [
          createSelectionEntity(),
          createSelectionEntity({
            id: ORPHAN_SELECTION_ID,
            entityId: null,
          }),
        ],
      }),
      intents,
      <SegmentationLabelsTreeHost />,
    );

    expect(view.container.querySelector(".segmentation-tree")).toBeTruthy();

    const buttons = [...view.container.querySelectorAll("button")];
    expect(buttons.map((button) => button.textContent)).toEqual([
      `Instance ${INSTANCE_ID.slice(0, 8)}`,
      `Selection ${SELECTION_ID.slice(0, 8)}`,
    ]);

    await act(async () => {
      buttons[0].click();
    });
    expect(intents.segmentation.selectInstance).toHaveBeenCalledWith(
      INSTANCE_ID,
    );

    await act(async () => {
      buttons[1].click();
    });
    expect(intents.segmentation.selectSelection).toHaveBeenCalledWith(
      SELECTION_ID,
    );

    // The slice selections are echoed as aria-selected.
    await act(async () => {
      view.setState(
        createEditorStateFixture({
          layerDescriptors: SEGMENTATION_LAYER_DESCRIPTORS,
          layers: {
            segmentation: createSegmentationSlice({
              instances: [createInstanceEntity()],
              selections: [createSelectionEntity()],
              ui: {
                ...createSegmentationSlice().ui,
                selectedInstanceId: INSTANCE_ID,
                selectedSelectionId: SELECTION_ID,
              },
            }),
          } as unknown as Partial<LayersDomainSlice>,
        }),
      );
    });
    const selectedButtons = [...view.container.querySelectorAll("button")];
    expect(
      selectedButtons.every(
        (button) => button.getAttribute("aria-selected") === "true",
      ),
    ).toBe(true);

    await view.unmount();
  });

  it("keeps mounted rows bounded for 250,000 instances", async () => {
    const instances = Array.from({ length: 250_000 }, (_, index) =>
      createInstanceEntity({
        id: `instance-${index}` as any,
        text: `Instance ${index}`,
      }),
    );
    const view = await renderPane(
      "segmentation",
      createSegmentationSlice({ instances }),
      createSegmentationIntents(),
      <SegmentationLabelsTreeHost />,
    );

    const list = view.container.querySelector("[data-rendered-row-count]")!;
    expect(
      Number(list.getAttribute("data-rendered-row-count")),
    ).toBeLessThanOrEqual(18);
    expect(
      view.container.querySelectorAll('[role="treeitem"]').length,
    ).toBeLessThanOrEqual(18);
    await view.unmount();
  });
});
