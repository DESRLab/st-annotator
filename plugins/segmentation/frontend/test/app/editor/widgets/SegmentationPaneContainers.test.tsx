/* @vitest-environment jsdom */

import { act, default as React, type JSX } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { EditorIntentsProvider, EditorStoreProvider } from "sta/app/editor";
import {
  createEditorStateFixture,
  createMockEditorStore,
  noopEditorIntents,
} from "sta/app/editor/testing";
import type { LayersDomainSlice } from "sta/app/editor";
import type { FixtureLayerDescriptor } from "sta/app/editor/testing";

import { SelectionEditControlsView } from "../../../../app/editor/scene/controls/SelectionEditControl.react.tsx";
import {
  SegmentationActionsView,
  SegmentationDrawModeView,
  SegmentationInstanceInspectorView,
  SegmentationPreferencesView,
  SegmentationSelectionInspectorView,
} from "../../../../app/editor/scene/layer/SegmentationLayer.react.tsx";
import type {
  SegmentationInstanceEntity,
  SegmentationIntents,
  SegmentationSelectionEntity,
  SegmentationSlice,
} from "../../../../app/editor/scene/layer/SegmentationSlice";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  // The settings color blades draw onto a canvas; jsdom has no 2D context.
  HTMLCanvasElement.prototype.getContext = (() => ({
    beginPath() {},
    clearRect() {},
    createLinearGradient() {
      return { addColorStop() {} };
    },
    fill() {},
    fillRect() {},
    getImageData() {
      return { data: [0, 0, 0, 255] };
    },
    lineTo() {},
    moveTo() {},
    putImageData() {},
    rect() {},
    stroke() {},
  })) as any;
});

afterEach(() => {
  document.body.replaceChildren();
});

const SEGMENTATION_LAYER_DESCRIPTORS: readonly FixtureLayerDescriptor[] = [
  { key: "segmentation", name: "Segmentation", kind: "label" },
];

const SETTINGS_VALUES = {
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
};

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
      values: SETTINGS_VALUES,
      disabled: false,
      isAssistantAvailable: false,
    },
    instances: [],
    selections: [],
    classes: [],
    ...overrides,
  };
}

function createRecordingIntents(): typeof noopEditorIntents & {
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

const CLASS_CAR = { id: 1, name: "Car" };
const CLASS_PEDESTRIAN = { id: 2, name: "Pedestrian" };
const INSTANCE_ID = "44444444-4444-4444-8444-444444444444";
const SELECTION_ID = "55555555-5555-4555-8555-555555555555";
const OTHER_SELECTION_ID = "88888888-8888-4888-8888-888888888888";

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

function findSelectWithExactOption(
  dom: HTMLElement,
  text: string,
): HTMLSelectElement | undefined {
  return [...dom.querySelectorAll("select")].find((select) =>
    [...select.options].some((option) => option.textContent?.trim() === text),
  );
}

async function selectOption(
  select: HTMLSelectElement,
  text: string,
): Promise<void> {
  const selectedIndex = [...select.options].findIndex((option) =>
    option.textContent?.includes(text),
  );
  expect(selectedIndex).toBeGreaterThanOrEqual(0);

  await act(async () => {
    select.selectedIndex = selectedIndex;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
  });
}

async function renderPane(
  slice: SegmentationSlice,
  intents: typeof noopEditorIntents,
  node: JSX.Element,
) {
  // The fixture builder only knows the base slices; the plugin slice is
  // merged into `layers` exactly as the route mapper does.
  const state = createEditorStateFixture({
    layerDescriptors: SEGMENTATION_LAYER_DESCRIPTORS,
    layers: {
      segmentation: slice,
    } as unknown as Partial<LayersDomainSlice>,
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

function findButtonByText(
  container: HTMLElement,
  text: string,
): HTMLElement | undefined {
  return [...container.querySelectorAll<HTMLElement>(".tp-selectbtnv_b")].find(
    (button) => button.textContent === text,
  );
}

function findRadioItemByText(
  container: HTMLElement,
  text: string,
): HTMLElement | undefined {
  // The draw-mode/edit-mode panes are plugin-essentials radiogrids: one
  // labeled radio item per mode.
  return [...container.querySelectorAll<HTMLElement>(".tp-radv")].find(
    (item) => item.textContent === text,
  );
}

describe("segmentation pane containers", () => {
  it("reads the action from the snapshot and writes it back through the segmentation intents", async () => {
    const intents = createRecordingIntents();
    const view = await renderPane(
      createSegmentationSlice(),
      intents,
      <SegmentationActionsView />,
    );

    const drawButton = findButtonByText(view.container, "D");
    expect(drawButton).toBeTruthy();
    expect(drawButton?.classList.contains("tp-selectbtnv_b-selected")).toBe(
      false,
    );

    await act(async () => {
      drawButton?.click();
    });
    expect(intents.segmentation.setAction).toHaveBeenCalledWith("draw");

    // The imperative round-trip lands in the snapshot; the pane follows.
    await act(async () => {
      view.setState(
        createEditorStateFixture({
          layerDescriptors: SEGMENTATION_LAYER_DESCRIPTORS,
          layers: {
            segmentation: createSegmentationSlice({
              ui: {
                ...createSegmentationSlice().ui,
                action: "draw",
              },
            }),
          } as unknown as Partial<LayersDomainSlice>,
        }),
      );
    });
    expect(
      findButtonByText(view.container, "D")?.classList.contains(
        "tp-selectbtnv_b-selected",
      ),
    ).toBe(true);

    await view.unmount();
  });

  it("reads the draw mode from the snapshot and writes it back through the segmentation intents", async () => {
    const intents = createRecordingIntents();
    const view = await renderPane(
      createSegmentationSlice(),
      intents,
      <SegmentationDrawModeView />,
    );

    const lassoItem = findRadioItemByText(view.container, "lasso");
    const lassoInput = lassoItem?.querySelector<HTMLInputElement>(
      'input[type="radio"]',
    );
    expect(lassoInput).toBeTruthy();

    await act(async () => {
      lassoInput?.click();
    });
    expect(intents.segmentation.setDrawMode).toHaveBeenCalledWith("lasso");

    await view.unmount();
  });

  it("reads the edit mode from the snapshot and writes it back through the segmentation intents", async () => {
    const intents = createRecordingIntents();
    const view = await renderPane(
      createSegmentationSlice(),
      intents,
      <SelectionEditControlsView />,
    );

    const eraseItem = findRadioItemByText(view.container, "Erase");
    const eraseInput = eraseItem?.querySelector<HTMLInputElement>(
      'input[type="radio"]',
    );
    expect(eraseInput).toBeTruthy();

    await act(async () => {
      eraseInput?.click();
    });
    expect(intents.segmentation.setEditMode).toHaveBeenCalledWith("erase");

    await view.unmount();
  });

  it("disables the edit mode pane while the layer is disabled", async () => {
    const intents = createRecordingIntents();
    const view = await renderPane(
      createSegmentationSlice({
        ui: { ...createSegmentationSlice().ui, disabled: true },
      }),
      intents,
      <SelectionEditControlsView />,
    );

    // The radiogrid honors `disabled` through the disabled-state patch:
    // the grid carries the disabled class and each radio input is inert.
    const grid = view.container.querySelector(".tp-radgridv");
    expect(grid?.classList.contains("tp-v-disabled")).toBe(true);
    const radios =
      view.container.querySelectorAll<HTMLInputElement>(".tp-radv_i");
    expect(radios.length).toBeGreaterThan(0);
    for (const radio of radios) expect(radio.disabled).toBe(true);

    await view.unmount();
  });

  it("reads the committed settings from the snapshot and forwards optimistic input to the intents", async () => {
    const intents = createRecordingIntents();
    const view = await renderPane(
      createSegmentationSlice(),
      intents,
      <SegmentationPreferencesView />,
    );

    const tooltipRow = [
      ...view.container.querySelectorAll<HTMLElement>(".tp-lblv"),
    ].find((row) => row.textContent?.includes("Show tooltips"));
    const checkbox = tooltipRow?.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    expect(checkbox).toBeTruthy();
    expect(checkbox?.checked).toBe(false);

    await act(async () => {
      checkbox?.click();
    });

    expect(intents.segmentation.setSettings).toHaveBeenCalledOnce();
    expect(intents.segmentation.setSettings.mock.calls[0][0]).toMatchObject({
      showTooltips: true,
    });

    await view.unmount();
  });

  it("dispatches segmentation preference toggles through settings intents", async () => {
    const intents = createRecordingIntents();
    const view = await renderPane(
      createSegmentationSlice(),
      intents,
      <SegmentationPreferencesView />,
    );

    const toggles: readonly [label: string, field: string][] = [
      ["Show tooltips", "showTooltips"],
      ["Show perceived class", "showPerceivedClass"],
      ["Show Track & Segment IDs", "showTrackSegId"],
      ["Show Occlusion", "showOcclusion"],
      ["Show Distinctiveness", "showDistinctiveness"],
      ["Show Timestamp Diff.", "showTimestampDiff"],
      ["Transparent Points", "selectionTransparency"],
    ];

    for (const [label, field] of toggles) {
      const row = [
        ...view.container.querySelectorAll<HTMLElement>(".tp-lblv"),
      ].find((candidate) => candidate.textContent?.includes(label));
      const checkbox = row?.querySelector('input[type="checkbox"]');
      expect(checkbox, label).toBeTruthy();
      const initial = (checkbox as HTMLInputElement).checked;

      await act(async () => {
        (checkbox as HTMLInputElement).click();
      });

      // Each toggle dispatches the merged settings with its own field
      // flipped (earlier toggles stay in the optimistic draft).
      const payload = intents.segmentation.setSettings.mock.calls.at(-1)?.[0];
      expect(payload, label).toMatchObject({ [field]: !initial });
    }

    await view.unmount();
  });

  it("disables point opacity when transparent points are turned off", async () => {
    const view = await renderPane(
      createSegmentationSlice(),
      createRecordingIntents(),
      <SegmentationPreferencesView />,
    );
    const row = (label: string): HTMLElement | undefined =>
      [...view.container.querySelectorAll<HTMLElement>(".tp-lblv")].find(
        (candidate) => candidate.textContent?.includes(label),
      );
    const opacityInput =
      row("Point opacity")?.querySelector<HTMLInputElement>("input");
    const transparencyInput = row(
      "Transparent Points",
    )?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(opacityInput).toBeTruthy();
    expect(transparencyInput).toBeTruthy();
    expect(opacityInput?.disabled).toBe(false);

    await act(async () => {
      transparencyInput?.click();
    });
    expect(
      row("Point opacity")?.querySelector<HTMLInputElement>("input")?.disabled,
    ).toBe(true);
    await view.unmount();
  });

  it("renders the selected instance from the slice and forwards instance inspector input and events", async () => {
    const intents = createRecordingIntents();
    const view = await renderPane(
      createSegmentationSlice({
        ui: {
          ...createSegmentationSlice().ui,
          selectedInstanceId: INSTANCE_ID,
        },
        instances: [createInstanceEntity()],
        classes: [CLASS_CAR, CLASS_PEDESTRIAN],
      }),
      intents,
      <SegmentationInstanceInspectorView />,
    );

    const classSelect = findSelectWithExactOption(view.container, "Car");
    expect(classSelect).toBeTruthy();
    await selectOption(classSelect!, "Pedestrian");

    expect(intents.segmentation.applyInstanceInspectorInput).toHaveBeenCalled();
    const values =
      intents.segmentation.applyInstanceInspectorInput.mock.calls.at(-1)?.[0];
    expect(values.selection.instanceId).toBe(INSTANCE_ID);
    expect(values.relations.classSelect.classId).toBe(CLASS_PEDESTRIAN.id);

    const createButton = [...view.container.querySelectorAll("button")].find(
      (candidate) => candidate.title?.includes("Instance"),
    );
    expect(createButton).toBeTruthy();
    await act(async () => {
      createButton?.click();
    });
    expect(
      intents.segmentation.instanceInspectorPaneEvent,
    ).toHaveBeenCalledOnce();
    expect(
      intents.segmentation.instanceInspectorPaneEvent.mock.calls[0][0],
    ).toMatchObject({ type: "click-createInstance" });

    await view.unmount();
  });

  it("renders the selected selection from the slice and forwards selection inspector input and events", async () => {
    const intents = createRecordingIntents();
    const view = await renderPane(
      createSegmentationSlice({
        ui: {
          ...createSegmentationSlice().ui,
          selectedSelectionId: SELECTION_ID,
        },
        instances: [createInstanceEntity()],
        selections: [createSelectionEntity()],
        classes: [CLASS_CAR, CLASS_PEDESTRIAN],
      }),
      intents,
      <SegmentationSelectionInspectorView />,
    );

    // The scalar distinctiveLv (1) is readapted to the pane's
    // QualityLevel contract ('Satisfactory').
    const distinctiveSelect = [
      ...view.container.querySelectorAll("select"),
    ].find((select) =>
      [...select.options].some((option) =>
        option.textContent?.includes("Satisfactory"),
      ),
    );
    expect(distinctiveSelect).toBeTruthy();
    const parentRow = view.container.querySelector(
      ".react-label-selection-row",
    );
    expect(parentRow?.textContent).toContain("Object Instance");
    expect(
      parentRow?.querySelector<HTMLElement>(".tp-lblv_v")?.style.width,
    ).toBe("var(--bld-vw)");

    const classSelect = findSelectWithExactOption(view.container, "Car");
    expect(classSelect).toBeTruthy();
    await selectOption(classSelect!, "Pedestrian");

    expect(
      intents.segmentation.applySelectionInspectorInput,
    ).toHaveBeenCalled();
    const values =
      intents.segmentation.applySelectionInspectorInput.mock.calls.at(-1)?.[0];
    expect(values.selection.selectionId).toBe(SELECTION_ID);
    expect(values.relations.classSelect.classId).toBe(CLASS_PEDESTRIAN.id);

    const drawButton = [...view.container.querySelectorAll("button")].find(
      (candidate) => candidate.title === "Toggle Draw Mode",
    );
    expect(drawButton).toBeTruthy();
    await act(async () => {
      drawButton?.click();
    });
    expect(
      intents.segmentation.selectionInspectorPaneEvent,
    ).toHaveBeenCalledOnce();
    expect(
      intents.segmentation.selectionInspectorPaneEvent.mock.calls[0][0],
    ).toMatchObject({ type: "click-drawSelection" });

    await view.unmount();
  });

  it("disables the segmentation inspector panes while disabled", async () => {
    const intents = createRecordingIntents();
    const view = await renderPane(
      createSegmentationSlice({
        ui: {
          ...createSegmentationSlice().ui,
          instanceInspectorDisabled: true,
          selectionInspectorDisabled: true,
        },
      }),
      intents,
      <SegmentationSelectionInspectorView />,
    );

    expect(
      view.container.querySelectorAll(".tp-v-disabled").length,
    ).toBeGreaterThan(0);

    await view.unmount();
  });

  it("disables the instance inspector pane while instance-inspector disabled", async () => {
    const intents = createRecordingIntents();
    const view = await renderPane(
      createSegmentationSlice({
        ui: {
          ...createSegmentationSlice().ui,
          instanceInspectorDisabled: true,
          selectionInspectorDisabled: false,
        },
      }),
      intents,
      <SegmentationInstanceInspectorView />,
    );

    expect(
      view.container.querySelectorAll(".tp-v-disabled").length,
    ).toBeGreaterThan(0);

    await view.unmount();

    // And the pane is NOT disabled when the slice says enabled, the
    // instance pane reads `instanceInspectorDisabled` specifically.
    const enabledView = await renderPane(
      createSegmentationSlice({
        ui: {
          ...createSegmentationSlice().ui,
          instanceInspectorDisabled: false,
          selectionInspectorDisabled: true,
        },
      }),
      intents,
      <SegmentationInstanceInspectorView />,
    );
    expect(
      enabledView.container.querySelectorAll(".tp-v-disabled").length,
    ).toBe(0);

    await enabledView.unmount();
  });

  it("drops rapid inspector drafts overtaken by a selection change and never edits the new selection", async () => {
    // Plan item 21: enter multiple rapid values, navigate to another
    // selection before React reconciliation, and verify the optimistic
    // draft is dropped instead of being smuggled into the new selection.
    const intents = createRecordingIntents();
    const otherSelection = createSelectionEntity({
      id: OTHER_SELECTION_ID,
      text: `B{${OTHER_SELECTION_ID.slice(0, 4)}} [Car]`,
      distinctiveLv: 0,
      occlusionLv: null,
    });
    const initialSlice = createSegmentationSlice({
      ui: {
        ...createSegmentationSlice().ui,
        selectedSelectionId: SELECTION_ID,
      },
      instances: [createInstanceEntity()],
      selections: [createSelectionEntity(), otherSelection],
      classes: [CLASS_CAR, CLASS_PEDESTRIAN],
    });
    const view = await renderPane(
      initialSlice,
      intents,
      <SegmentationSelectionInspectorView />,
    );

    const findClassSelect = (): HTMLSelectElement | undefined =>
      findSelectWithExactOption(view.container, "Car");
    const findDescriptorSelect = (
      label: string,
    ): HTMLSelectElement | undefined =>
      [...view.container.querySelectorAll<HTMLElement>(".tp-lblv")]
        .find((row) => row.textContent?.startsWith(label))
        ?.querySelector("select") ?? undefined;
    const optionIndexOf = (select: HTMLSelectElement, text: string): number => {
      const index = [...select.options].findIndex((option) =>
        option.textContent?.includes(text),
      );
      expect(index).toBeGreaterThanOrEqual(0);
      return index;
    };

    const classSelect = findClassSelect();
    const occlusionSelect = findDescriptorSelect("Occlusion Level");
    expect(classSelect).toBeTruthy();
    expect(occlusionSelect).toBeTruthy();

    // Two rapid values, the selection change, and one delayed change
    // event from the old selection's control all land in the same task,
    // before React reconciliation runs.
    await act(async () => {
      classSelect!.selectedIndex = optionIndexOf(classSelect!, "Pedestrian");
      classSelect!.dispatchEvent(new Event("change", { bubbles: true }));
      occlusionSelect!.selectedIndex = optionIndexOf(occlusionSelect!, "Poor");
      occlusionSelect!.dispatchEvent(new Event("change", { bubbles: true }));

      // Navigate to the other selection before the drafts reconcile.
      view.setState(
        createEditorStateFixture({
          layerDescriptors: SEGMENTATION_LAYER_DESCRIPTORS,
          layers: {
            segmentation: createSegmentationSlice({
              ui: {
                ...createSegmentationSlice().ui,
                selectedSelectionId: OTHER_SELECTION_ID,
              },
              instances: [createInstanceEntity()],
              selections: [createSelectionEntity(), otherSelection],
              classes: [CLASS_CAR, CLASS_PEDESTRIAN],
            }),
          } as unknown as Partial<LayersDomainSlice>,
        }),
      );

      // A delayed change event still carrying the old selection's
      // control value arrives after the navigation was committed.
      classSelect!.selectedIndex = optionIndexOf(classSelect!, "Car");
      classSelect!.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // (a) The pane follows the new authoritative committed values: the
    // draft (Pedestrian / Poor) did not survive the selection change,
    // and the descriptors show the newly selected selection's levels.
    expect(findClassSelect()?.selectedOptions[0]?.textContent).toBe("Car");
    expect(
      findDescriptorSelect("Occlusion Level")?.selectedOptions[0]?.textContent,
    ).toBe("Unknown");
    expect(
      findDescriptorSelect("Distinctiveness Level")?.selectedOptions[0]
        ?.textContent,
    ).toBe("Excellent");

    // (b) Every forwarded edit owns the originally selected selection;
    // the delayed change never reached the new selection.
    expect(
      intents.segmentation.applySelectionInspectorInput,
    ).toHaveBeenCalledTimes(3);
    for (const [values] of intents.segmentation.applySelectionInspectorInput
      .mock.calls) {
      expect(values.selection.selectionId).toBe(SELECTION_ID);
    }
    expect(
      intents.segmentation.applySelectionInspectorInput.mock.calls[0][0]
        .relations.classSelect.classId,
    ).toBe(CLASS_PEDESTRIAN.id);
    expect(
      intents.segmentation.applySelectionInspectorInput.mock.calls[1][0]
        .descriptors.occlusionLv.name,
    ).toBe("Poor");
    expect(
      intents.segmentation.applySelectionInspectorInput.mock.calls[2][0]
        .relations.classSelect.classId,
    ).toBe(CLASS_CAR.id);

    // (c) Re-selecting the original selection shows its authoritative
    // committed values; the stale draft is not resurrected.
    await act(async () => {
      view.setState(
        createEditorStateFixture({
          layerDescriptors: SEGMENTATION_LAYER_DESCRIPTORS,
          layers: {
            segmentation: initialSlice,
          } as unknown as Partial<LayersDomainSlice>,
        }),
      );
    });
    expect(findClassSelect()?.selectedOptions[0]?.textContent).toBe("Car");
    expect(
      findDescriptorSelect("Occlusion Level")?.selectedOptions[0]?.textContent,
    ).toBe("Unknown");
    expect(
      findDescriptorSelect("Distinctiveness Level")?.selectedOptions[0]
        ?.textContent,
    ).toBe("Satisfactory");
    expect(
      intents.segmentation.applySelectionInspectorInput,
    ).toHaveBeenCalledTimes(3);

    await view.unmount();
  });
});
