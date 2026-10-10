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

import {
  VectorActionsView,
  VectorDrawModeView,
  VectorInspectorView,
  VectorPreferencesView,
} from "../../../../app/editor/scene/layer/VectorLayer.react.tsx";
import type {
  VectorEntity,
  VectorIntents,
  VectorSlice,
} from "../../../../app/editor/scene/layer/VectorSlice";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  // The settings pane's color blades draw onto a canvas; jsdom has no 2D
  // context.
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

const VECTOR_LAYER_DESCRIPTORS: readonly FixtureLayerDescriptor[] = [
  { key: "vector", name: "Vector", kind: "label" },
];

const SETTINGS_VALUES = {
  showTooltips: false,
  showVectorId: false,
  strokeWidth: 3,
  strokeColor: { r: 1, g: 0, b: 0 },
  hoveredVectorColor: { r: 1, g: 1, b: 0 },
  selectedVectorColor: { r: 0, g: 0, b: 1 },
};

function createVectorSlice(overrides: Partial<VectorSlice> = {}): VectorSlice {
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
      values: SETTINGS_VALUES,
      disabled: false,
    },
    vectors: [],
    classes: [],
    ...overrides,
  };
}

function createRecordingIntents(): typeof noopEditorIntents & {
  vector: Record<keyof VectorIntents, ReturnType<typeof vi.fn>>;
} {
  return {
    ...noopEditorIntents,
    vector: {
      setAction: vi.fn(),
      setDrawMode: vi.fn(),
      setSettings: vi.fn(),
      applyVectorInspectorInput: vi.fn(),
      selectVector: vi.fn(),
      vectorInspectorPaneEvent: vi.fn(),
    },
  };
}

const CLASS_CAR = { id: 1, name: "Car" };
const CLASS_PEDESTRIAN = { id: 2, name: "Pedestrian" };
const CLASS_TRUCK = { id: 3, name: "Truck" };
const VECTOR_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_VECTOR_ID = "66666666-6666-4666-8666-666666666666";

function createVectorEntity(
  overrides: Partial<VectorEntity> = {},
): VectorEntity {
  return {
    id: VECTOR_ID,
    text: `P{${VECTOR_ID.slice(0, 4)}} [Car]`,
    gtClassId: CLASS_CAR.id,
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
  slice: VectorSlice,
  intents: typeof noopEditorIntents,
  node: JSX.Element,
) {
  // The fixture builder only knows the base slices; the plugin slice is
  // merged into `layers` exactly as the route mapper does.
  const state = createEditorStateFixture({
    layerDescriptors: VECTOR_LAYER_DESCRIPTORS,
    layers: { vector: slice } as unknown as Partial<LayersDomainSlice>,
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

describe("vector pane containers", () => {
  it("reads the action from the snapshot and writes it back through the vector intents", async () => {
    const intents = createRecordingIntents();
    const view = await renderPane(
      createVectorSlice(),
      intents,
      <VectorActionsView />,
    );

    const drawButton = findButtonByText(view.container, "D");
    expect(drawButton).toBeTruthy();
    expect(drawButton?.classList.contains("tp-selectbtnv_b-selected")).toBe(
      false,
    );

    await act(async () => {
      drawButton?.click();
    });
    expect(intents.vector.setAction).toHaveBeenCalledWith("draw");

    // The imperative round-trip lands in the snapshot; the pane follows.
    await act(async () => {
      view.setState(
        createEditorStateFixture({
          layerDescriptors: VECTOR_LAYER_DESCRIPTORS,
          layers: {
            vector: createVectorSlice({
              ui: { ...createVectorSlice().ui, action: "draw" },
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

  it("reads the draw mode from the snapshot and writes it back through the vector intents", async () => {
    const intents = createRecordingIntents();
    const view = await renderPane(
      createVectorSlice(),
      intents,
      <VectorDrawModeView />,
    );

    // The draw-mode pane is a plugin-essentials radiogrid: one labeled
    // radio item per mode.
    const polygonItem = [
      ...view.container.querySelectorAll<HTMLElement>(".tp-radv"),
    ].find((item) => item.textContent === "Polygon");
    const polygonInput = polygonItem?.querySelector<HTMLInputElement>(
      'input[type="radio"]',
    );
    expect(polygonInput).toBeTruthy();

    await act(async () => {
      polygonInput?.click();
    });
    expect(intents.vector.setDrawMode).toHaveBeenCalledWith("polygon");

    await view.unmount();
  });

  it("reads the committed settings from the snapshot and forwards optimistic input to the intents", async () => {
    const intents = createRecordingIntents();
    const view = await renderPane(
      createVectorSlice(),
      intents,
      <VectorPreferencesView />,
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

    expect(intents.vector.setSettings).toHaveBeenCalledOnce();
    expect(intents.vector.setSettings.mock.calls[0][0]).toMatchObject({
      showTooltips: true,
    });

    await view.unmount();
  });

  it("dispatches the Show Vector ID toggle through the vector settings intents", async () => {
    const intents = createRecordingIntents();
    const view = await renderPane(
      createVectorSlice(),
      intents,
      <VectorPreferencesView />,
    );

    const row = [
      ...view.container.querySelectorAll<HTMLElement>(".tp-lblv"),
    ].find((candidate) => candidate.textContent?.includes("Show Vector ID"));
    const checkbox = row?.querySelector('input[type="checkbox"]');
    expect(checkbox).toBeTruthy();
    expect((checkbox as HTMLInputElement).checked).toBe(false);

    await act(async () => {
      (checkbox as HTMLInputElement).click();
    });

    expect(intents.vector.setSettings.mock.calls.at(-1)?.[0]).toMatchObject({
      showVectorId: true,
    });

    await view.unmount();
  });

  it("renders the selected vector from the slice and forwards inspector input and events", async () => {
    const intents = createRecordingIntents();
    const view = await renderPane(
      createVectorSlice({
        ui: { ...createVectorSlice().ui, selectedVectorId: VECTOR_ID },
        vectors: [createVectorEntity()],
        classes: [CLASS_CAR, CLASS_PEDESTRIAN],
      }),
      intents,
      <VectorInspectorView />,
    );

    const classSelect = findSelectWithExactOption(view.container, "Car");
    expect(classSelect).toBeTruthy();
    await selectOption(classSelect!, "Pedestrian");

    expect(intents.vector.applyVectorInspectorInput).toHaveBeenCalled();
    const values =
      intents.vector.applyVectorInspectorInput.mock.calls.at(-1)?.[0];
    expect(values.selection.vectorId).toBe(VECTOR_ID);
    expect(values.relations.classSelect.classId).toBe(CLASS_PEDESTRIAN.id);

    const drawButton = [...view.container.querySelectorAll("button")].find(
      (candidate) => candidate.title === "Toggle Draw Mode",
    );
    expect(drawButton).toBeTruthy();
    await act(async () => {
      drawButton?.click();
    });
    expect(intents.vector.vectorInspectorPaneEvent).toHaveBeenCalledOnce();
    expect(
      intents.vector.vectorInspectorPaneEvent.mock.calls[0][0],
    ).toMatchObject({ type: "click-drawVector" });

    await view.unmount();
  });

  it("disables the vector inspector pane while disabled", async () => {
    const intents = createRecordingIntents();
    const view = await renderPane(
      createVectorSlice({
        ui: {
          ...createVectorSlice().ui,
          vectorInspectorDisabled: true,
        },
      }),
      intents,
      <VectorInspectorView />,
    );

    expect(
      view.container.querySelectorAll(".tp-v-disabled").length,
    ).toBeGreaterThan(0);

    await view.unmount();
  });

  it("echoes the selected vector in the selection dropdown and keeps the relationships section visible", async () => {
    const intents = createRecordingIntents();
    const view = await renderPane(
      createVectorSlice({
        ui: { ...createVectorSlice().ui, selectedVectorId: VECTOR_ID },
        vectors: [createVectorEntity()],
        classes: [CLASS_CAR],
      }),
      intents,
      <VectorInspectorView />,
    );

    // The selection dropdown echoes the selected vector instead of the
    // null-selection placeholder.
    const selectionSelect = [
      ...view.container.querySelectorAll<HTMLSelectElement>("select"),
    ].find((select) =>
      [...select.options].some((option) => option.textContent?.includes("P{")),
    );
    expect(selectionSelect).toBeTruthy();
    expect(selectionSelect?.value).not.toBe("(New vector)");
    expect(selectionSelect?.selectedOptions[0]?.textContent).toContain("P{");

    // The relationships section renders as a toggle named 'Relationships'.
    // The relationships folder renders with its title visible.
    const relationshipsTitle = [
      ...view.container.querySelectorAll<HTMLElement>(".tp-fldv_t"),
    ].find((title) => title.textContent === "Relationships");
    expect(relationshipsTitle).toBeTruthy();

    await view.unmount();

    // Without a selection the dropdown falls back to the placeholder.
    const emptyView = await renderPane(
      createVectorSlice({
        classes: [CLASS_CAR],
      }),
      intents,
      <VectorInspectorView />,
    );
    const emptySelect = [
      ...emptyView.container.querySelectorAll<HTMLSelectElement>("select"),
    ].find((select) =>
      [...select.options].some(
        (option) => option.textContent === "(New vector)",
      ),
    );
    expect(emptySelect?.value).toBe("(New vector)");

    await emptyView.unmount();
  });

  it("drops rapid inspector drafts overtaken by a selection change and never edits the new selection", async () => {
    // Plan item 21: enter multiple rapid values, navigate to another
    // selection before React reconciliation, and verify the optimistic
    // draft is dropped instead of being smuggled into the new selection.
    const intents = createRecordingIntents();
    const otherVector = createVectorEntity({
      id: OTHER_VECTOR_ID,
      text: `P{${OTHER_VECTOR_ID.slice(0, 4)}} [Pedestrian]`,
      gtClassId: CLASS_PEDESTRIAN.id,
    });
    const initialSlice = createVectorSlice({
      ui: { ...createVectorSlice().ui, selectedVectorId: VECTOR_ID },
      vectors: [createVectorEntity(), otherVector],
      classes: [CLASS_CAR, CLASS_PEDESTRIAN, CLASS_TRUCK],
    });
    const view = await renderPane(
      initialSlice,
      intents,
      <VectorInspectorView />,
    );

    const findClassSelect = (): HTMLSelectElement | undefined =>
      findSelectWithExactOption(view.container, "Car");
    const optionIndexOf = (select: HTMLSelectElement, text: string): number => {
      const index = [...select.options].findIndex((option) =>
        option.textContent?.includes(text),
      );
      expect(index).toBeGreaterThanOrEqual(0);
      return index;
    };

    const classSelect = findClassSelect();
    expect(classSelect).toBeTruthy();

    // Two rapid values, the selection change, and one delayed change
    // event from the old selection's control all land in the same task,
    // before React reconciliation runs.
    await act(async () => {
      classSelect!.selectedIndex = optionIndexOf(classSelect!, "Pedestrian");
      classSelect!.dispatchEvent(new Event("change", { bubbles: true }));
      classSelect!.selectedIndex = optionIndexOf(classSelect!, "Truck");
      classSelect!.dispatchEvent(new Event("change", { bubbles: true }));

      // Navigate to the other vector before the drafts reconcile.
      view.setState(
        createEditorStateFixture({
          layerDescriptors: VECTOR_LAYER_DESCRIPTORS,
          layers: {
            vector: createVectorSlice({
              ui: {
                ...createVectorSlice().ui,
                selectedVectorId: OTHER_VECTOR_ID,
              },
              vectors: [createVectorEntity(), otherVector],
              classes: [CLASS_CAR, CLASS_PEDESTRIAN, CLASS_TRUCK],
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
    // draft (Truck) did not survive the selection change, and the
    // selection dropdown echoes the newly selected vector.
    expect(findClassSelect()?.selectedOptions[0]?.textContent).toBe(
      "Pedestrian",
    );
    const selectionSelect = [
      ...view.container.querySelectorAll<HTMLSelectElement>("select"),
    ].find((select) =>
      [...select.options].some((option) =>
        option.textContent?.includes("P{6666"),
      ),
    );
    expect(selectionSelect?.selectedOptions[0]?.textContent).toContain(
      "P{6666",
    );

    // (b) Every forwarded edit owns the originally selected vector; the
    // delayed change never reached the new selection.
    expect(intents.vector.applyVectorInspectorInput).toHaveBeenCalledTimes(3);
    for (const [values] of intents.vector.applyVectorInspectorInput.mock
      .calls) {
      expect(values.selection.vectorId).toBe(VECTOR_ID);
    }
    expect(
      intents.vector.applyVectorInspectorInput.mock.calls[0][0].relations
        .classSelect.classId,
    ).toBe(CLASS_PEDESTRIAN.id);
    expect(
      intents.vector.applyVectorInspectorInput.mock.calls[1][0].relations
        .classSelect.classId,
    ).toBe(CLASS_TRUCK.id);
    expect(
      intents.vector.applyVectorInspectorInput.mock.calls[2][0].relations
        .classSelect.classId,
    ).toBe(CLASS_CAR.id);

    // (c) Re-selecting the original vector shows its authoritative
    // committed values; the stale draft is not resurrected.
    await act(async () => {
      view.setState(
        createEditorStateFixture({
          layerDescriptors: VECTOR_LAYER_DESCRIPTORS,
          layers: {
            vector: initialSlice,
          } as unknown as Partial<LayersDomainSlice>,
        }),
      );
    });
    expect(findClassSelect()?.selectedOptions[0]?.textContent).toBe("Car");
    expect(intents.vector.applyVectorInspectorInput).toHaveBeenCalledTimes(3);

    await view.unmount();
  });
});
