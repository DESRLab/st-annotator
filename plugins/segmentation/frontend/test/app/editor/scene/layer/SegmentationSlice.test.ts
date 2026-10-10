import { describe, expect, it } from "vitest";

import type {
  ReadonlyLabelClass,
  ReadonlyLabelInstance,
  ReadonlyLabelSelection,
} from "../../../../../app/editor/scene/data";
import { mapSegmentationSlice } from "../../../../../app/editor/scene/layer/SegmentationSlice";
import type {
  SegmentationSliceInput,
  SegmentationSliceLabelsSource,
} from "../../../../../app/editor/scene/layer/SegmentationSlice";

function createSettingsInput() {
  return {
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
}

// The layer keeps one committed settings object until it changes, so the
// fixture reuses a single reference to exercise reference-based sharing.
const SETTINGS_VALUES = createSettingsInput();

/** A plain stand-in for the models' `QualityLevel` objects. */
function makeLevel(value: number | null) {
  return {
    name: "level",
    value,
    equals: (other: { value: number | null }) => other.value === value,
    toJSON: () => value,
  };
}

function createFakeInstance(
  overrides: Record<string, unknown> = {},
): ReadonlyLabelInstance {
  return {
    id: "00000000-0000-0000-0000-0000000000a1",
    gtClass: null,
    gtClassId: null,
    isBlack: false,
    ...overrides,
  } as unknown as ReadonlyLabelInstance;
}

function createFakeSelection(
  overrides: Record<string, unknown> = {},
): ReadonlyLabelSelection {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    entityId: null,
    perceivedClassId: null,
    perceivedClass: null,
    gtClass: null,
    distinctiveLv: makeLevel(null),
    occlusionLv: makeLevel(null),
    ...overrides,
  } as unknown as ReadonlyLabelSelection;
}

function createFakeClass(
  overrides: Record<string, unknown> = {},
): ReadonlyLabelClass {
  return {
    id: 1,
    name: "Car",
    ...overrides,
  } as unknown as ReadonlyLabelClass;
}

function createFakeLabels({
  instances = [],
  selections = [],
  classes = [],
}: {
  instances?: readonly ReadonlyLabelInstance[];
  selections?: readonly ReadonlyLabelSelection[];
  classes?: readonly ReadonlyLabelClass[];
} = {}): SegmentationSliceLabelsSource {
  return {
    iterLabelInstances: () =>
      instances.values() as IterableIterator<ReadonlyLabelInstance>,
    iterLabelSelections: () =>
      selections.values() as IterableIterator<ReadonlyLabelSelection>,
    iterLabelClasses: () =>
      classes.values() as IterableIterator<ReadonlyLabelClass>,
  };
}

function createInput(
  overrides: Partial<SegmentationSliceInput> = {},
): SegmentationSliceInput {
  return {
    action: "navigate",
    drawMode: "brush",
    editMode: "add",
    disabled: false,
    selectedInstanceId: null,
    selectedSelectionId: null,
    autoInstances: false,
    drawSelectionActive: false,
    instanceInspectorDisabled: false,
    selectionInspectorDisabled: false,
    settings: {
      values: SETTINGS_VALUES,
      disabled: false,
      isAssistantAvailable: false,
    },
    labels: createFakeLabels(),
    ...overrides,
  };
}

describe("mapSegmentationSlice", () => {
  it("maps the segmentation interaction state to its plain slice", () => {
    const settings = {
      values: createSettingsInput(),
      disabled: true,
      isAssistantAvailable: true,
    };
    const slice = mapSegmentationSlice(
      createInput({
        action: "draw",
        drawMode: "polygon",
        editMode: "erase",
        disabled: true,
        selectedInstanceId: "instance-1",
        selectedSelectionId: "selection-1",
        autoInstances: true,
        settings,
      }),
      null,
    );

    expect(slice.ui).toEqual({
      action: "draw",
      drawMode: "polygon",
      editMode: "erase",
      disabled: true,
      selectedInstanceId: "instance-1",
      selectedSelectionId: "selection-1",
      autoInstances: true,
      drawSelectionActive: false,
      instanceInspectorDisabled: false,
      selectionInspectorDisabled: false,
    });
    expect(slice.settings).toBe(settings);
  });

  it("maps the inspector interaction state into the slice", () => {
    const slice = mapSegmentationSlice(
      createInput({
        selectedInstanceId: "instance-1",
        drawSelectionActive: true,
        instanceInspectorDisabled: true,
        selectionInspectorDisabled: true,
      }),
      null,
    );

    expect(slice.ui.selectedInstanceId).toBe("instance-1");
    expect(slice.ui.drawSelectionActive).toBe(true);
    expect(slice.ui.instanceInspectorDisabled).toBe(true);
    expect(slice.ui.selectionInspectorDisabled).toBe(true);
  });

  it("reuses the previous slice when nothing changed (structural sharing)", () => {
    const previous = mapSegmentationSlice(createInput(), null);
    const next = mapSegmentationSlice(createInput(), previous);

    expect(next).toBe(previous);
  });

  it("rebuilds the slice when any field changes", () => {
    const previous = mapSegmentationSlice(createInput(), null);

    expect(
      mapSegmentationSlice(createInput({ action: "select" }), previous),
    ).not.toBe(previous);
    expect(
      mapSegmentationSlice(createInput({ drawMode: "lasso" }), previous),
    ).not.toBe(previous);
    expect(
      mapSegmentationSlice(createInput({ editMode: "erase" }), previous),
    ).not.toBe(previous);
    expect(
      mapSegmentationSlice(createInput({ disabled: true }), previous),
    ).not.toBe(previous);
    expect(
      mapSegmentationSlice(
        createInput({ selectedInstanceId: "instance-1" }),
        previous,
      ),
    ).not.toBe(previous);
    expect(
      mapSegmentationSlice(
        createInput({ selectedSelectionId: "selection-1" }),
        previous,
      ),
    ).not.toBe(previous);
    expect(
      mapSegmentationSlice(createInput({ autoInstances: true }), previous),
    ).not.toBe(previous);
    expect(
      mapSegmentationSlice(
        createInput({ drawSelectionActive: true }),
        previous,
      ),
    ).not.toBe(previous);
    expect(
      mapSegmentationSlice(
        createInput({ instanceInspectorDisabled: true }),
        previous,
      ),
    ).not.toBe(previous);
    expect(
      mapSegmentationSlice(
        createInput({ selectionInspectorDisabled: true }),
        previous,
      ),
    ).not.toBe(previous);
    expect(
      mapSegmentationSlice(
        createInput({
          settings: { ...previous.settings, disabled: true },
        }),
        previous,
      ),
    ).not.toBe(previous);
    expect(
      mapSegmentationSlice(
        createInput({
          settings: {
            ...previous.settings,
            values: {
              ...previous.settings.values,
              showTooltips: true,
            },
          },
        }),
        previous,
      ),
    ).not.toBe(previous);
  });

  it("keeps the unchanged settings reference when only interaction state changes", () => {
    const previous = mapSegmentationSlice(createInput(), null);
    const next = mapSegmentationSlice(
      createInput({ action: "select" }),
      previous,
    );

    expect(next).not.toBe(previous);
    expect(next.settings).toBe(previous.settings);
  });

  it("keeps the unchanged interaction state reference when only settings change", () => {
    const previous = mapSegmentationSlice(createInput(), null);
    const next = mapSegmentationSlice(
      createInput({
        settings: { ...previous.settings, disabled: true },
      }),
      previous,
    );

    expect(next).not.toBe(previous);
    expect(next.ui).toBe(previous.ui);
  });

  it("projects the entity lists into plain DTOs", () => {
    const perceivedClass = createFakeClass({ id: 7, name: "Car" });
    const slice = mapSegmentationSlice(
      createInput({
        labels: createFakeLabels({
          instances: [
            createFakeInstance({
              gtClass: perceivedClass,
              gtClassId: 7,
              isBlack: true,
            }),
          ],
          selections: [
            createFakeSelection({
              perceivedClass,
              perceivedClassId: 7,
              entityId: "00000000-0000-0000-0000-0000000000a1",
              distinctiveLv: makeLevel(1),
              occlusionLv: makeLevel(2),
            }),
          ],
          classes: [perceivedClass],
        }),
      }),
      null,
    );

    expect(slice.instances).toEqual([
      {
        id: "00000000-0000-0000-0000-0000000000a1",
        text: expect.stringContaining("[Car]"),
        gtClassId: 7,
        isBlack: true,
      },
    ]);
    expect(slice.selections).toEqual([
      {
        id: "00000000-0000-0000-0000-000000000001",
        text: expect.stringContaining("[Car]"),
        entityId: "00000000-0000-0000-0000-0000000000a1",
        perceivedClassId: 7,
        distinctiveLv: 1,
        occlusionLv: 2,
      },
    ]);
    expect(slice.classes).toEqual([{ id: 7, name: "Car" }]);
  });

  it("projects unknown quality levels and missing relations as null", () => {
    const slice = mapSegmentationSlice(
      createInput({
        labels: createFakeLabels({
          instances: [createFakeInstance()],
          selections: [createFakeSelection()],
        }),
      }),
      null,
    );

    expect(slice.selections[0].distinctiveLv).toBeNull();
    expect(slice.selections[0].occlusionLv).toBeNull();
    expect(slice.selections[0].entityId).toBeNull();
    expect(slice.selections[0].perceivedClassId).toBeNull();
    expect(slice.selections[0].text).toContain("<Unclassified>");
    expect(slice.instances[0].gtClassId).toBeNull();
    expect(slice.instances[0].text).toContain("<Unclassified>");
  });

  it("projects a selection without a perceived class as inheriting the instance class text", () => {
    const slice = mapSegmentationSlice(
      createInput({
        labels: createFakeLabels({
          selections: [
            createFakeSelection({
              gtClass: createFakeClass({ name: "Car" }),
            }),
          ],
        }),
      }),
      null,
    );

    expect(slice.selections[0].text).toContain("<Inherited>");
  });

  it("publishes empty lists while no labels are loaded", () => {
    const slice = mapSegmentationSlice(createInput(), null);

    expect(slice.instances).toEqual([]);
    expect(slice.selections).toEqual([]);
    expect(slice.classes).toEqual([]);
  });

  it("publishes empty lists when the labels source is unavailable mid-load", () => {
    const previous = mapSegmentationSlice(
      createInput({
        labels: createFakeLabels({
          instances: [createFakeInstance()],
          selections: [createFakeSelection()],
          classes: [createFakeClass()],
        }),
      }),
      null,
    );

    const next = mapSegmentationSlice(createInput({ labels: null }), previous);

    expect(next).not.toBe(previous);
    expect(next.instances).toEqual([]);
    expect(next.selections).toEqual([]);
    expect(next.classes).toEqual([]);
  });

  it("reuses unchanged entity records and lists across mappings (structural sharing)", () => {
    const labels = createFakeLabels({
      instances: [createFakeInstance()],
      classes: [createFakeClass()],
    });
    const previous = mapSegmentationSlice(createInput({ labels }), null);
    const next = mapSegmentationSlice(createInput({ labels }), previous);

    expect(next).toBe(previous);
    expect(next.instances).toBe(previous.instances);
    expect(next.instances[0]).toBe(previous.instances[0]);
    expect(next.classes).toBe(previous.classes);
  });

  it("rebuilds only the changed entity record and keeps the others shared", () => {
    const unchanged = createFakeSelection();
    const changed = createFakeSelection({
      id: "00000000-0000-0000-0000-000000000002",
    });
    const previous = mapSegmentationSlice(
      createInput({
        labels: createFakeLabels({ selections: [unchanged, changed] }),
      }),
      null,
    );

    const next = mapSegmentationSlice(
      createInput({
        labels: createFakeLabels({
          selections: [
            unchanged,
            createFakeSelection({
              id: "00000000-0000-0000-0000-000000000002",
              perceivedClassId: 7,
            }),
          ],
        }),
      }),
      previous,
    );

    expect(next).not.toBe(previous);
    expect(next.selections).not.toBe(previous.selections);
    expect(next.selections[0]).toBe(previous.selections[0]);
    expect(next.selections[1]).not.toBe(previous.selections[1]);
    expect(next.selections[1].perceivedClassId).toBe(7);
  });

  it("reprojects dependent text when a linked class changes", () => {
    // The instance itself is unchanged; only its ground truth class name is.
    const instance = (className: string) =>
      createFakeInstance({
        gtClass: createFakeClass({ name: className }),
        gtClassId: 1,
      });
    const previous = mapSegmentationSlice(
      createInput({
        labels: createFakeLabels({ instances: [instance("Car")] }),
      }),
      null,
    );

    const next = mapSegmentationSlice(
      createInput({
        labels: createFakeLabels({
          instances: [instance("Pedestrian")],
        }),
      }),
      previous,
    );

    expect(next.instances).not.toBe(previous.instances);
    expect(next.instances[0]).not.toBe(previous.instances[0]);
    expect(next.instances[0].text).toContain("[Pedestrian]");
  });

  it("reprojects dependent selection text when only a linked instance changes", () => {
    // The selection itself is unchanged; only its inherited (instance)
    // ground truth class is.
    const selection = (gtClass: ReadonlyLabelClass | null) =>
      createFakeSelection({ gtClass });
    const previous = mapSegmentationSlice(
      createInput({
        labels: createFakeLabels({ selections: [selection(null)] }),
      }),
      null,
    );

    const next = mapSegmentationSlice(
      createInput({
        labels: createFakeLabels({
          selections: [selection(createFakeClass({ name: "Car" }))],
        }),
      }),
      previous,
    );

    expect(next.selections).not.toBe(previous.selections);
    expect(next.selections[0]).not.toBe(previous.selections[0]);
    expect(next.selections[0].text).toContain("<Inherited>");
  });

  it("treats a resolved placeholder id as a new record", () => {
    const previous = mapSegmentationSlice(
      createInput({
        labels: createFakeLabels({
          selections: [createFakeSelection({ id: "placeholder-1" })],
        }),
      }),
      null,
    );

    const next = mapSegmentationSlice(
      createInput({
        labels: createFakeLabels({
          selections: [
            createFakeSelection({
              id: "00000000-0000-0000-0000-000000000001",
            }),
          ],
        }),
      }),
      previous,
    );

    expect(next.selections).not.toBe(previous.selections);
    expect(next.selections[0]).not.toBe(previous.selections[0]);
    expect(next.selections[0].id).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("rebuilds the lists when entities are added or deleted", () => {
    const first = createFakeSelection();
    const second = createFakeSelection({
      id: "00000000-0000-0000-0000-000000000002",
    });

    const previous = mapSegmentationSlice(
      createInput({
        labels: createFakeLabels({ selections: [first] }),
      }),
      null,
    );

    const added = mapSegmentationSlice(
      createInput({
        labels: createFakeLabels({ selections: [first, second] }),
      }),
      previous,
    );
    expect(added.selections).not.toBe(previous.selections);
    expect(added.selections[0]).toBe(previous.selections[0]);

    const deleted = mapSegmentationSlice(
      createInput({
        labels: createFakeLabels({ selections: [second] }),
      }),
      added,
    );
    expect(deleted.selections).not.toBe(added.selections);
    expect(deleted.selections).toHaveLength(1);
  });

  it("keeps the entity list references when only interaction state changes", () => {
    const labels = createFakeLabels({
      instances: [createFakeInstance()],
      selections: [createFakeSelection()],
    });
    const previous = mapSegmentationSlice(createInput({ labels }), null);
    const next = mapSegmentationSlice(
      createInput({ labels, action: "select" }),
      previous,
    );

    expect(next).not.toBe(previous);
    expect(next.instances).toBe(previous.instances);
    expect(next.selections).toBe(previous.selections);
    expect(next.classes).toBe(previous.classes);
  });
});
