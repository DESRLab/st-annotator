import { describe, expect, it } from "vitest";

import type {
  ReadonlyLabelClass,
  ReadonlyLabelVector,
} from "../../../../../app/editor/scene/data";
import { mapVectorSlice } from "../../../../../app/editor/scene/layer/VectorSlice";
import type {
  VectorSliceInput,
  VectorSliceLabelsSource,
} from "../../../../../app/editor/scene/layer/VectorSlice";

function createSettingsInput() {
  return {
    showTooltips: false,
    showVectorId: false,
    strokeWidth: 3,
    strokeColor: { r: 1, g: 0, b: 0 },
    hoveredVectorColor: { r: 1, g: 1, b: 0 },
    selectedVectorColor: { r: 0, g: 0, b: 1 },
  };
}

// The layer keeps one committed settings object until it changes, so the
// fixture reuses a single reference to exercise reference-based sharing.
const SETTINGS_VALUES = createSettingsInput();

function createFakeVector(
  overrides: Record<string, unknown> = {},
): ReadonlyLabelVector {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    gtClass: null,
    gtClassId: null,
    ...overrides,
  } as unknown as ReadonlyLabelVector;
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
  vectors = [],
  classes = [],
}: {
  vectors?: readonly ReadonlyLabelVector[];
  classes?: readonly ReadonlyLabelClass[];
} = {}): VectorSliceLabelsSource {
  return {
    iterLabelVectors: () =>
      vectors.values() as IterableIterator<ReadonlyLabelVector>,
    iterLabelClasses: () =>
      classes.values() as IterableIterator<ReadonlyLabelClass>,
  };
}

function createInput(
  overrides: Partial<VectorSliceInput> = {},
): VectorSliceInput {
  return {
    action: "edit",
    drawMode: "polyline",
    disabled: false,
    selectedVectorId: null,
    drawVectorActive: false,
    vectorInspectorDisabled: false,
    clipboard: { disableCopy: true, disablePaste: true },
    settings: {
      values: SETTINGS_VALUES,
      disabled: false,
    },
    labels: createFakeLabels(),
    ...overrides,
  };
}

describe("mapVectorSlice", () => {
  it("maps the vector interaction state to its plain slice", () => {
    const settings = {
      values: createSettingsInput(),
      disabled: true,
    };
    const slice = mapVectorSlice(
      createInput({
        action: "draw",
        drawMode: "polygon",
        disabled: true,
        selectedVectorId: "vector-1",
        clipboard: { disableCopy: false, disablePaste: false },
        settings,
      }),
      null,
    );

    expect(slice.ui).toEqual({
      action: "draw",
      drawMode: "polygon",
      disabled: true,
      selectedVectorId: "vector-1",
      canCopy: true,
      canPaste: true,
      drawVectorActive: false,
      vectorInspectorDisabled: false,
    });
    expect(slice.settings).toBe(settings);
  });

  it("maps the inspector interaction state into the slice", () => {
    const slice = mapVectorSlice(
      createInput({
        drawVectorActive: true,
        vectorInspectorDisabled: true,
      }),
      null,
    );

    expect(slice.ui.drawVectorActive).toBe(true);
    expect(slice.ui.vectorInspectorDisabled).toBe(true);
  });

  it("inverts the clipboard view state into copy/paste affordances", () => {
    const slice = mapVectorSlice(
      createInput({
        clipboard: { disableCopy: false, disablePaste: true },
      }),
      null,
    );

    expect(slice.ui.canCopy).toBe(true);
    expect(slice.ui.canPaste).toBe(false);
  });

  it("reuses the previous slice when nothing changed (structural sharing)", () => {
    const previous = mapVectorSlice(createInput(), null);
    const next = mapVectorSlice(createInput(), previous);

    expect(next).toBe(previous);
  });

  it("rebuilds the slice when any field changes", () => {
    const previous = mapVectorSlice(createInput(), null);

    expect(
      mapVectorSlice(createInput({ action: "select" }), previous),
    ).not.toBe(previous);
    expect(
      mapVectorSlice(createInput({ drawMode: "point" }), previous),
    ).not.toBe(previous);
    expect(mapVectorSlice(createInput({ disabled: true }), previous)).not.toBe(
      previous,
    );
    expect(
      mapVectorSlice(createInput({ selectedVectorId: "vector-1" }), previous),
    ).not.toBe(previous);
    expect(
      mapVectorSlice(createInput({ drawVectorActive: true }), previous),
    ).not.toBe(previous);
    expect(
      mapVectorSlice(createInput({ vectorInspectorDisabled: true }), previous),
    ).not.toBe(previous);
    expect(
      mapVectorSlice(
        createInput({
          clipboard: { disableCopy: false, disablePaste: true },
        }),
        previous,
      ),
    ).not.toBe(previous);
    expect(
      mapVectorSlice(
        createInput({
          settings: { ...previous.settings, disabled: true },
        }),
        previous,
      ),
    ).not.toBe(previous);
    expect(
      mapVectorSlice(
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
    const previous = mapVectorSlice(createInput(), null);
    const next = mapVectorSlice(createInput({ action: "select" }), previous);

    expect(next).not.toBe(previous);
    expect(next.settings).toBe(previous.settings);
  });

  it("keeps the unchanged interaction state reference when only settings change", () => {
    const previous = mapVectorSlice(createInput(), null);
    const next = mapVectorSlice(
      createInput({
        settings: { ...previous.settings, disabled: true },
      }),
      previous,
    );

    expect(next).not.toBe(previous);
    expect(next.ui).toBe(previous.ui);
  });

  it("projects the entity lists into plain DTOs", () => {
    const gtClass = createFakeClass({ id: 7, name: "Car" });
    const slice = mapVectorSlice(
      createInput({
        labels: createFakeLabels({
          vectors: [createFakeVector({ gtClass, gtClassId: 7 })],
          classes: [gtClass],
        }),
      }),
      null,
    );

    expect(slice.vectors).toEqual([
      {
        id: "00000000-0000-0000-0000-000000000001",
        text: expect.stringContaining("[Car]"),
        gtClassId: 7,
      },
    ]);
    expect(slice.classes).toEqual([{ id: 7, name: "Car" }]);
  });

  it("projects missing relations as null", () => {
    const slice = mapVectorSlice(
      createInput({
        labels: createFakeLabels({
          vectors: [createFakeVector()],
        }),
      }),
      null,
    );

    expect(slice.vectors[0].gtClassId).toBeNull();
    expect(slice.vectors[0].text).toContain("<Unclassified>");
  });

  it("publishes empty lists while no labels are loaded", () => {
    const slice = mapVectorSlice(createInput(), null);

    expect(slice.vectors).toEqual([]);
    expect(slice.classes).toEqual([]);
  });

  it("publishes empty lists when the labels source is unavailable mid-load", () => {
    const previous = mapVectorSlice(
      createInput({
        labels: createFakeLabels({
          vectors: [createFakeVector()],
          classes: [createFakeClass()],
        }),
      }),
      null,
    );

    const next = mapVectorSlice(createInput({ labels: null }), previous);

    expect(next).not.toBe(previous);
    expect(next.vectors).toEqual([]);
    expect(next.classes).toEqual([]);
  });

  it("reuses unchanged entity records and lists across mappings (structural sharing)", () => {
    const labels = createFakeLabels({
      vectors: [createFakeVector()],
      classes: [createFakeClass()],
    });
    const previous = mapVectorSlice(createInput({ labels }), null);
    const next = mapVectorSlice(createInput({ labels }), previous);

    expect(next).toBe(previous);
    expect(next.vectors).toBe(previous.vectors);
    expect(next.vectors[0]).toBe(previous.vectors[0]);
    expect(next.classes).toBe(previous.classes);
  });

  it("rebuilds only the changed entity record and keeps the others shared", () => {
    const unchanged = createFakeVector();
    const changed = createFakeVector({
      id: "00000000-0000-0000-0000-000000000002",
    });
    const previous = mapVectorSlice(
      createInput({
        labels: createFakeLabels({ vectors: [unchanged, changed] }),
      }),
      null,
    );

    const next = mapVectorSlice(
      createInput({
        labels: createFakeLabels({
          vectors: [
            unchanged,
            createFakeVector({
              id: "00000000-0000-0000-0000-000000000002",
              gtClassId: 7,
            }),
          ],
        }),
      }),
      previous,
    );

    expect(next).not.toBe(previous);
    expect(next.vectors).not.toBe(previous.vectors);
    expect(next.vectors[0]).toBe(previous.vectors[0]);
    expect(next.vectors[1]).not.toBe(previous.vectors[1]);
    expect(next.vectors[1].gtClassId).toBe(7);
  });

  it("reprojects dependent text when a linked class changes", () => {
    // The vector itself is unchanged; only its ground truth class name is.
    const vector = (className: string) =>
      createFakeVector({
        gtClass: createFakeClass({ name: className }),
        gtClassId: 1,
      });
    const previous = mapVectorSlice(
      createInput({
        labels: createFakeLabels({ vectors: [vector("Car")] }),
      }),
      null,
    );

    const next = mapVectorSlice(
      createInput({
        labels: createFakeLabels({ vectors: [vector("Pedestrian")] }),
      }),
      previous,
    );

    expect(next.vectors).not.toBe(previous.vectors);
    expect(next.vectors[0]).not.toBe(previous.vectors[0]);
    expect(next.vectors[0].text).toContain("[Pedestrian]");
  });

  it("treats a resolved placeholder id as a new record", () => {
    const previous = mapVectorSlice(
      createInput({
        labels: createFakeLabels({
          vectors: [createFakeVector({ id: "placeholder-1" })],
        }),
      }),
      null,
    );

    const next = mapVectorSlice(
      createInput({
        labels: createFakeLabels({
          vectors: [
            createFakeVector({
              id: "00000000-0000-0000-0000-000000000001",
            }),
          ],
        }),
      }),
      previous,
    );

    expect(next.vectors).not.toBe(previous.vectors);
    expect(next.vectors[0]).not.toBe(previous.vectors[0]);
    expect(next.vectors[0].id).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("rebuilds the lists when entities are added or deleted", () => {
    const first = createFakeVector();
    const second = createFakeVector({
      id: "00000000-0000-0000-0000-000000000002",
    });

    const previous = mapVectorSlice(
      createInput({
        labels: createFakeLabels({ vectors: [first] }),
      }),
      null,
    );

    const added = mapVectorSlice(
      createInput({
        labels: createFakeLabels({ vectors: [first, second] }),
      }),
      previous,
    );
    expect(added.vectors).not.toBe(previous.vectors);
    expect(added.vectors[0]).toBe(previous.vectors[0]);

    const deleted = mapVectorSlice(
      createInput({
        labels: createFakeLabels({ vectors: [second] }),
      }),
      added,
    );
    expect(deleted.vectors).not.toBe(added.vectors);
    expect(deleted.vectors).toHaveLength(1);
  });

  it("keeps the entity list references when only interaction state changes", () => {
    const labels = createFakeLabels({
      vectors: [createFakeVector()],
      classes: [createFakeClass()],
    });
    const previous = mapVectorSlice(createInput({ labels }), null);
    const next = mapVectorSlice(
      createInput({ labels, action: "select" }),
      previous,
    );

    expect(next).not.toBe(previous);
    expect(next.vectors).toBe(previous.vectors);
    expect(next.classes).toBe(previous.classes);
  });

  it("keeps the entity list references when only inspector state changes", () => {
    const labels = createFakeLabels({
      vectors: [createFakeVector()],
      classes: [createFakeClass()],
    });
    const previous = mapVectorSlice(createInput({ labels }), null);

    const drawActive = mapVectorSlice(
      createInput({ labels, drawVectorActive: true }),
      previous,
    );
    expect(drawActive).not.toBe(previous);
    expect(drawActive.ui).not.toBe(previous.ui);
    expect(drawActive.vectors).toBe(previous.vectors);
    expect(drawActive.classes).toBe(previous.classes);

    const inspectorDisabled = mapVectorSlice(
      createInput({ labels, vectorInspectorDisabled: true }),
      previous,
    );
    expect(inspectorDisabled).not.toBe(previous);
    expect(inspectorDisabled.ui).not.toBe(previous.ui);
    expect(inspectorDisabled.vectors).toBe(previous.vectors);
    expect(inspectorDisabled.classes).toBe(previous.classes);
  });
});
