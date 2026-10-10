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

import {
  BBoxActionsView,
  BBoxDrawModeView,
  BBoxInspectorView,
  BBoxPreferencesView,
  BBoxTrackInspectorView,
} from "../../../../app/editor/scene/layer/BBoxLayer.react.tsx";
import type {
  BBoxEntity,
  BBoxIntents,
  BBoxSlice,
  BBoxTrackEntity,
} from "../../../../app/editor/scene/layer/BBoxSlice";

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

const SETTINGS_VALUES = {
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
};

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
      values: SETTINGS_VALUES,
      disabled: false,
      disallowRelativeElevation: false,
    },
    boxes: [],
    tracks: [],
    classes: [],
    ...overrides,
  };
}

function createRecordingIntents(): typeof noopEditorIntents & {
  bbox: Record<keyof BBoxIntents, ReturnType<typeof vi.fn>>;
} {
  return {
    ...noopEditorIntents,
    bbox: {
      setAction: vi.fn(),
      setDrawMode: vi.fn(),
      setSettings: vi.fn(),
      applyBoxInspectorInput: vi.fn(),
      applyTrackInspectorInput: vi.fn(),
      selectBox: vi.fn(),
      selectTrack: vi.fn(),
      boxInspectorPaneEvent: vi.fn(),
      trackInspectorPaneEvent: vi.fn(),
    },
  };
}

const CLASS_CAR = { id: 1, name: "Car" };
const CLASS_PEDESTRIAN = { id: 2, name: "Pedestrian" };
const TRACK_ID = "22222222-2222-4222-8222-222222222222";
const BOX_ID = "11111111-1111-4111-8111-111111111111";

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

function findSelectByOptionText(
  dom: HTMLElement,
  text: string,
): HTMLSelectElement | undefined {
  return [...dom.querySelectorAll("select")].find((select) =>
    [...select.options].some((option) => option.textContent?.includes(text)),
  );
}

// The class selects' options are bare class names, unlike the selection
// rows' `B{...} [Car]` texts, an exact match disambiguates them.
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
  slice: BBoxSlice,
  intents: typeof noopEditorIntents,
  node: JSX.Element,
) {
  // The fixture builder only knows the base slices; the plugin slice is
  // merged into `layers` exactly as the route mapper does.
  const state = createEditorStateFixture({
    layerDescriptors: BBOX_LAYER_DESCRIPTORS,
    layers: { bbox: slice } as unknown as Partial<LayersDomainSlice>,
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

describe("bbox pane containers", () => {
  it("reads the action from the snapshot and writes it back through the bbox intents", async () => {
    const intents = createRecordingIntents();
    const view = await renderPane(
      createBBoxSlice(),
      intents,
      <BBoxActionsView />,
    );

    const drawButton = findButtonByText(view.container, "D");
    expect(drawButton).toBeTruthy();
    expect(drawButton?.classList.contains("tp-selectbtnv_b-selected")).toBe(
      false,
    );

    await act(async () => {
      drawButton?.click();
    });
    expect(intents.bbox.setAction).toHaveBeenCalledWith("draw");

    // The imperative round-trip lands in the snapshot; the pane follows.
    await act(async () => {
      view.setState(
        createEditorStateFixture({
          layerDescriptors: BBOX_LAYER_DESCRIPTORS,
          layers: {
            bbox: createBBoxSlice({
              ui: { ...createBBoxSlice().ui, action: "draw" },
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

  it("reads the draw mode from the snapshot and writes it back through the bbox intents", async () => {
    const intents = createRecordingIntents();
    const view = await renderPane(
      createBBoxSlice(),
      intents,
      <BBoxDrawModeView />,
    );

    // The draw-mode pane is a plugin-essentials radiogrid: one labeled
    // radio item per mode.
    const centerItem = [
      ...view.container.querySelectorAll<HTMLElement>(".tp-radv"),
    ].find((item) => item.textContent === "Center");
    const centerInput = centerItem?.querySelector<HTMLInputElement>(
      'input[type="radio"]',
    );
    expect(centerInput).toBeTruthy();

    await act(async () => {
      centerInput?.click();
    });
    expect(intents.bbox.setDrawMode).toHaveBeenCalledWith("center2front");

    await view.unmount();
  });

  it("disables the draw mode pane while the layer is disabled", async () => {
    const intents = createRecordingIntents();
    const view = await renderPane(
      createBBoxSlice({
        ui: { ...createBBoxSlice().ui, disabled: true },
      }),
      intents,
      <BBoxDrawModeView />,
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
      createBBoxSlice(),
      intents,
      <BBoxPreferencesView />,
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

    expect(intents.bbox.setSettings).toHaveBeenCalledOnce();
    expect(intents.bbox.setSettings.mock.calls[0][0]).toMatchObject({
      showTooltips: true,
    });

    await view.unmount();
  });

  it("drops a pending settings draft when the pane becomes disabled", async () => {
    const intents = createRecordingIntents();
    const slice = createBBoxSlice();
    const view = await renderPane(slice, intents, <BBoxPreferencesView />);

    const findTooltipCheckbox = (): HTMLInputElement | null => {
      const row = [
        ...view.container.querySelectorAll<HTMLElement>(".tp-lblv"),
      ].find((candidate) => candidate.textContent?.includes("Show tooltips"));
      return (
        row?.querySelector<HTMLInputElement>('input[type="checkbox"]') ?? null
      );
    };

    // Open a draft that never round-trips (the mock intent only records).
    await act(async () => {
      findTooltipCheckbox()?.click();
    });
    expect(intents.bbox.setSettings).toHaveBeenCalledOnce();
    expect(findTooltipCheckbox()?.checked).toBe(true);

    // A disabled transition keeps the same committed values reference;
    // the draft must still be dropped so it cannot overwrite committed
    // state after a disable/reload cycle.
    await act(async () => {
      view.setState(
        createEditorStateFixture({
          layerDescriptors: BBOX_LAYER_DESCRIPTORS,
          layers: {
            bbox: createBBoxSlice({
              settings: { ...slice.settings, disabled: true },
            }),
          } as unknown as Partial<LayersDomainSlice>,
        }),
      );
    });
    expect(findTooltipCheckbox()?.checked).toBe(false);

    await view.unmount();
  });

  it("dispatches every Show-* preferences toggle through the bbox settings intents", async () => {
    const intents = createRecordingIntents();
    const view = await renderPane(
      createBBoxSlice(),
      intents,
      <BBoxPreferencesView />,
    );

    const toggles: readonly [label: string, field: string][] = [
      ["Show tooltips", "showTooltips"],
      ["Show perceived class", "showPerceivedClass"],
      ["Show Track & Box IDs", "showTrackBoxId"],
      ["Show Occlusion", "showOcclusion"],
      ["Show Distinctiveness", "showDistinctiveness"],
      ["Show Timestamp Diff.", "showTimestampDiff"],
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
      const payload = intents.bbox.setSettings.mock.calls.at(-1)?.[0];
      expect(payload, label).toMatchObject({ [field]: !initial });
    }

    await view.unmount();
  });

  it("renders the selected box from the slice and forwards inspector input to the intents", async () => {
    const intents = createRecordingIntents();
    const view = await renderPane(
      createBBoxSlice({
        ui: { ...createBBoxSlice().ui, selectedBoxId: BOX_ID },
        boxes: [createBoxEntity()],
        tracks: [createTrackEntity()],
        classes: [CLASS_CAR, CLASS_PEDESTRIAN],
      }),
      intents,
      <BBoxInspectorView />,
    );

    // The scalar distinctiveLv (1) is readapted to the pane's
    // QualityLevel contract ('Satisfactory').
    const distinctiveSelect = findSelectByOptionText(
      view.container,
      "Satisfactory",
    );
    expect(distinctiveSelect).toBeTruthy();
    const parentRow = view.container.querySelector(
      ".react-label-selection-row",
    );
    expect(parentRow?.textContent).toContain("Object Track");
    expect(
      parentRow?.querySelector<HTMLElement>(".tp-lblv_v")?.style.width,
    ).toBe("var(--bld-vw)");

    const classSelect = findSelectWithExactOption(view.container, "Car");
    expect(classSelect).toBeTruthy();
    await selectOption(classSelect!, "Pedestrian");

    expect(intents.bbox.applyBoxInspectorInput).toHaveBeenCalled();
    const values = intents.bbox.applyBoxInspectorInput.mock.calls.at(-1)?.[0];
    expect(values.selection.boxId).toBe(BOX_ID);
    expect(values.relations.classSelect.classId).toBe(CLASS_PEDESTRIAN.id);

    await view.unmount();
  });

  it("forwards box descriptor edits to the intents with the pane QualityLevel contract", async () => {
    const intents = createRecordingIntents();
    const view = await renderPane(
      createBBoxSlice({
        ui: { ...createBBoxSlice().ui, selectedBoxId: BOX_ID },
        boxes: [createBoxEntity()],
        classes: [CLASS_CAR],
      }),
      intents,
      <BBoxInspectorView />,
    );

    // The fixture box has occlusionLv null and distinctiveLv 1, readapted
    // to the pane's QualityLevel contract ('Unknown' / 'Satisfactory').
    const findDescriptorSelect = (
      label: string,
    ): HTMLSelectElement | undefined =>
      [...view.container.querySelectorAll<HTMLElement>(".tp-lblv")]
        .find((row) => row.textContent?.startsWith(label))
        ?.querySelector("select") ?? undefined;
    const occlusionSelect = findDescriptorSelect("Occlusion Level");
    expect(occlusionSelect).toBeTruthy();
    expect(
      [...occlusionSelect!.options].map((option) => option.textContent),
    ).toEqual(["Excellent", "Satisfactory", "Poor", "Unknown"]);

    await selectOption(occlusionSelect!, "Poor");
    expect(intents.bbox.applyBoxInspectorInput).toHaveBeenCalled();
    const values = intents.bbox.applyBoxInspectorInput.mock.calls.at(-1)?.[0];
    expect(values.selection.boxId).toBe(BOX_ID);
    expect(values.descriptors.occlusionLv.name).toBe("Poor");
    expect(values.descriptors.occlusionLv.value).toBe(2);

    await view.unmount();
  });

  it("forwards box inspector pane events and disables the pane while disabled", async () => {
    const intents = createRecordingIntents();
    const view = await renderPane(
      createBBoxSlice({
        ui: { ...createBBoxSlice().ui, selectedBoxId: BOX_ID },
        boxes: [createBoxEntity()],
        classes: [CLASS_CAR],
      }),
      intents,
      <BBoxInspectorView />,
    );

    const drawBoxButton = [...view.container.querySelectorAll("button")].find(
      (candidate) => candidate.title === "Toggle Draw Mode",
    );
    expect(drawBoxButton).toBeTruthy();
    await act(async () => {
      drawBoxButton?.click();
    });
    expect(intents.bbox.boxInspectorPaneEvent).toHaveBeenCalledOnce();
    expect(intents.bbox.boxInspectorPaneEvent.mock.calls[0][0]).toMatchObject({
      type: "click-drawBox",
    });

    await view.unmount();

    const disabledView = await renderPane(
      createBBoxSlice({
        ui: { ...createBBoxSlice().ui, boxInspectorDisabled: true },
      }),
      intents,
      <BBoxInspectorView />,
    );
    expect(
      disabledView.container.querySelectorAll(".tp-v-disabled").length,
    ).toBeGreaterThan(0);

    await disabledView.unmount();
  });

  it("disables the track inspector pane while track-inspector disabled", async () => {
    const intents = createRecordingIntents();
    const view = await renderPane(
      createBBoxSlice({
        ui: {
          ...createBBoxSlice().ui,
          trackInspectorDisabled: true,
          boxInspectorDisabled: false,
        },
      }),
      intents,
      <BBoxTrackInspectorView />,
    );

    expect(
      view.container.querySelectorAll(".tp-v-disabled").length,
    ).toBeGreaterThan(0);

    await view.unmount();

    // And the pane is NOT disabled when the slice says enabled, the
    // track pane reads `trackInspectorDisabled` specifically.
    const enabledView = await renderPane(
      createBBoxSlice({
        ui: {
          ...createBBoxSlice().ui,
          trackInspectorDisabled: false,
          boxInspectorDisabled: true,
        },
      }),
      intents,
      <BBoxTrackInspectorView />,
    );
    expect(
      enabledView.container.querySelectorAll(".tp-v-disabled").length,
    ).toBe(0);

    await enabledView.unmount();
  });

  it("renders the selected track from the slice and forwards track inspector input and events", async () => {
    const intents = createRecordingIntents();
    const view = await renderPane(
      createBBoxSlice({
        ui: { ...createBBoxSlice().ui, selectedTrackId: TRACK_ID },
        tracks: [createTrackEntity()],
        classes: [CLASS_CAR, CLASS_PEDESTRIAN],
      }),
      intents,
      <BBoxTrackInspectorView />,
    );

    const classSelect = findSelectWithExactOption(view.container, "Car");
    expect(classSelect).toBeTruthy();
    await selectOption(classSelect!, "Pedestrian");

    expect(intents.bbox.applyTrackInspectorInput).toHaveBeenCalled();
    const values = intents.bbox.applyTrackInspectorInput.mock.calls.at(-1)?.[0];
    expect(values.selection.trackId).toBe(TRACK_ID);
    expect(values.relations.classSelect.classId).toBe(CLASS_PEDESTRIAN.id);

    const createButton = [...view.container.querySelectorAll("button")].find(
      (candidate) => candidate.title?.includes("Track"),
    );
    expect(createButton).toBeTruthy();
    await act(async () => {
      createButton?.click();
    });
    expect(intents.bbox.trackInspectorPaneEvent).toHaveBeenCalledOnce();
    expect(intents.bbox.trackInspectorPaneEvent.mock.calls[0][0]).toMatchObject(
      { type: "click-createTrack" },
    );

    await view.unmount();
  });

  it("drops rapid inspector drafts overtaken by a selection change and never edits the new selection", async () => {
    // Plan item 21: enter multiple rapid values, navigate to another
    // selection before React reconciliation, and verify the optimistic
    // draft is dropped instead of being smuggled into the new selection.
    const intents = createRecordingIntents();
    const otherBox = createBoxEntity({
      id: "99999999-9999-4999-8999-999999999999",
      angle: 1.25,
    });
    const initialSlice = createBBoxSlice({
      ui: { ...createBBoxSlice().ui, selectedBoxId: BOX_ID },
      boxes: [createBoxEntity(), otherBox],
      classes: [CLASS_CAR, CLASS_PEDESTRIAN],
    });
    const view = await renderPane(initialSlice, intents, <BBoxInspectorView />);

    const findClassSelect = (): HTMLSelectElement | undefined =>
      findSelectWithExactOption(view.container, "Car");
    const findOcclusionSelect = (): HTMLSelectElement | undefined =>
      [...view.container.querySelectorAll<HTMLElement>(".tp-lblv")]
        .find((row) => row.textContent?.startsWith("Occlusion Level"))
        ?.querySelector("select") ?? undefined;
    const findAngleInput = (): HTMLInputElement | undefined =>
      [...view.container.querySelectorAll<HTMLInputElement>(".tp-lblv")]
        .find((row) => row.textContent?.includes("Angle"))
        ?.querySelector("input") ?? undefined;
    const optionIndexOf = (select: HTMLSelectElement, text: string): number => {
      const index = [...select.options].findIndex((option) =>
        option.textContent?.includes(text),
      );
      expect(index).toBeGreaterThanOrEqual(0);
      return index;
    };

    const classSelect = findClassSelect();
    const occlusionSelect = findOcclusionSelect();
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

      // Navigate to the other box before the drafts reconcile.
      view.setState(
        createEditorStateFixture({
          layerDescriptors: BBOX_LAYER_DESCRIPTORS,
          layers: {
            bbox: createBBoxSlice({
              ui: {
                ...createBBoxSlice().ui,
                selectedBoxId: otherBox.id,
              },
              boxes: [createBoxEntity(), otherBox],
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
    // draft (Pedestrian / Poor) did not survive the selection change.
    expect(findClassSelect()?.selectedOptions[0]?.textContent).toBe("Car");
    expect(findOcclusionSelect()?.selectedOptions[0]?.textContent).toBe(
      "Unknown",
    );
    expect(findAngleInput()?.value).toContain("1.25");

    // (b) Every forwarded edit owns the originally selected box; the
    // delayed change never reached the new selection.
    expect(intents.bbox.applyBoxInspectorInput).toHaveBeenCalledTimes(3);
    for (const [values] of intents.bbox.applyBoxInspectorInput.mock.calls) {
      expect(values.selection.boxId).toBe(BOX_ID);
    }
    expect(
      intents.bbox.applyBoxInspectorInput.mock.calls[0][0].relations.classSelect
        .classId,
    ).toBe(CLASS_PEDESTRIAN.id);
    expect(
      intents.bbox.applyBoxInspectorInput.mock.calls[1][0].descriptors
        .occlusionLv.name,
    ).toBe("Poor");
    expect(
      intents.bbox.applyBoxInspectorInput.mock.calls[2][0].relations.classSelect
        .classId,
    ).toBe(CLASS_CAR.id);

    // (c) Re-selecting the original box shows its authoritative committed
    // values; the stale draft is not resurrected.
    await act(async () => {
      view.setState(
        createEditorStateFixture({
          layerDescriptors: BBOX_LAYER_DESCRIPTORS,
          layers: {
            bbox: initialSlice,
          } as unknown as Partial<LayersDomainSlice>,
        }),
      );
    });
    expect(findClassSelect()?.selectedOptions[0]?.textContent).toBe("Car");
    expect(findOcclusionSelect()?.selectedOptions[0]?.textContent).toBe(
      "Unknown",
    );
    expect(findAngleInput()?.value).toContain("0.5");
    expect(intents.bbox.applyBoxInspectorInput).toHaveBeenCalledTimes(3);

    await view.unmount();
  });

  it("follows the snapshot when the box selection round-trips", async () => {
    const intents = createRecordingIntents();
    const otherBox = createBoxEntity({
      id: "99999999-9999-4999-8999-999999999999",
      angle: 1.25,
    });
    const view = await renderPane(
      createBBoxSlice({
        ui: { ...createBBoxSlice().ui, selectedBoxId: BOX_ID },
        boxes: [createBoxEntity(), otherBox],
        classes: [CLASS_CAR],
      }),
      intents,
      <BBoxInspectorView />,
    );

    await act(async () => {
      view.setState(
        createEditorStateFixture({
          layerDescriptors: BBOX_LAYER_DESCRIPTORS,
          layers: {
            bbox: createBBoxSlice({
              ui: {
                ...createBBoxSlice().ui,
                selectedBoxId: otherBox.id,
              },
              boxes: [createBoxEntity(), otherBox],
              classes: [CLASS_CAR],
            }),
          } as unknown as Partial<LayersDomainSlice>,
        }),
      );
    });

    // The geometry inputs now show the newly selected box's angle.
    const angleInput = [
      ...view.container.querySelectorAll<HTMLInputElement>(".tp-lblv"),
    ]
      .find((row) => row.textContent?.includes("Angle"))
      ?.querySelector("input");
    expect(angleInput?.value).toContain("1.25");

    await view.unmount();
  });
});
