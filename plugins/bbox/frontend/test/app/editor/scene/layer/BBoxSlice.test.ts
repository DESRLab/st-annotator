import { describe, expect, it } from "vitest";

import type {
  ReadonlyLabelBox,
  ReadonlyLabelClass,
  ReadonlyLabelTrack,
} from "../../../../../app/editor/scene/data";
import { mapBBoxSlice } from "../../../../../app/editor/scene/layer/BBoxSlice";
import type {
  BBoxSliceInput,
  BBoxSliceLabelsSource,
} from "../../../../../app/editor/scene/layer/BBoxSlice";

function createSettingsInput() {
  return {
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

function createFakeBox(
  overrides: Record<string, unknown> = {},
): ReadonlyLabelBox {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    boxType: "cuboid",
    center: { x: 1, y: 2, z: 3 },
    size: { x: 4, y: 5, z: 6 },
    angle: 0.5,
    entityId: null,
    perceivedClassId: null,
    perceivedClass: null,
    gtClass: null,
    distinctiveLv: makeLevel(null),
    occlusionLv: makeLevel(null),
    ...overrides,
  } as unknown as ReadonlyLabelBox;
}

function createFakeTrack(
  overrides: Record<string, unknown> = {},
): ReadonlyLabelTrack {
  return {
    id: "00000000-0000-0000-0000-0000000000a1",
    gtClass: null,
    gtClassId: null,
    isBlack: false,
    ...overrides,
  } as unknown as ReadonlyLabelTrack;
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
  boxes = [],
  tracks = [],
  classes = [],
}: {
  boxes?: readonly ReadonlyLabelBox[];
  tracks?: readonly ReadonlyLabelTrack[];
  classes?: readonly ReadonlyLabelClass[];
} = {}): BBoxSliceLabelsSource {
  return {
    iterLabelBoxes: () => boxes.values() as IterableIterator<ReadonlyLabelBox>,
    iterLabelTracks: () =>
      tracks.values() as IterableIterator<ReadonlyLabelTrack>,
    iterLabelClasses: () =>
      classes.values() as IterableIterator<ReadonlyLabelClass>,
  };
}

function createInput(overrides: Partial<BBoxSliceInput> = {}): BBoxSliceInput {
  return {
    action: "edit",
    drawMode: "corner2corner",
    disabled: false,
    selectedBoxId: null,
    selectedTrackId: null,
    autoTracks: false,
    drawBoxActive: false,
    boxInspectorDisabled: false,
    trackInspectorDisabled: false,
    clipboard: { disableCopy: true, disablePaste: true },
    settings: {
      values: SETTINGS_VALUES,
      disabled: false,
      disallowRelativeElevation: false,
    },
    labels: createFakeLabels(),
    ...overrides,
  };
}

describe("mapBBoxSlice", () => {
  it("maps the bbox interaction state to its plain slice", () => {
    const settings = {
      values: createSettingsInput(),
      disabled: true,
      disallowRelativeElevation: true,
    };
    const slice = mapBBoxSlice(
      createInput({
        action: "draw",
        drawMode: "center2front",
        disabled: true,
        selectedBoxId: "00000000-0000-0000-0000-000000000001",
        autoTracks: true,
        clipboard: { disableCopy: false, disablePaste: false },
        settings,
      }),
      null,
    );

    expect(slice.ui).toEqual({
      action: "draw",
      drawMode: "center2front",
      disabled: true,
      selectedBoxId: "00000000-0000-0000-0000-000000000001",
      selectedTrackId: null,
      canCopy: true,
      canPaste: true,
      autoTracks: true,
      drawBoxActive: false,
      boxInspectorDisabled: false,
      trackInspectorDisabled: false,
    });
    expect(slice.settings).toBe(settings);
  });

  it("inverts the clipboard view state into copy/paste affordances", () => {
    const slice = mapBBoxSlice(
      createInput({
        clipboard: { disableCopy: false, disablePaste: true },
      }),
      null,
    );

    expect(slice.ui.canCopy).toBe(true);
    expect(slice.ui.canPaste).toBe(false);
  });

  it("maps the inspector interaction state into the slice", () => {
    const slice = mapBBoxSlice(
      createInput({
        selectedTrackId: "00000000-0000-0000-0000-0000000000a1",
        drawBoxActive: true,
        boxInspectorDisabled: true,
        trackInspectorDisabled: true,
      }),
      null,
    );

    expect(slice.ui.selectedTrackId).toBe(
      "00000000-0000-0000-0000-0000000000a1",
    );
    expect(slice.ui.drawBoxActive).toBe(true);
    expect(slice.ui.boxInspectorDisabled).toBe(true);
    expect(slice.ui.trackInspectorDisabled).toBe(true);
  });

  it("tracks selected-track transitions across edit, box-only edit, and draw/navigation", () => {
    // Editing a track: both ids set.
    const trackEdit = mapBBoxSlice(
      createInput({
        selectedBoxId: "00000000-0000-0000-0000-000000000001",
        selectedTrackId: "00000000-0000-0000-0000-0000000000a1",
      }),
      null,
    );
    expect(trackEdit.ui.selectedTrackId).toBe(
      "00000000-0000-0000-0000-0000000000a1",
    );

    // Editing a box without a track: the track id clears.
    const boxEdit = mapBBoxSlice(
      createInput({
        selectedBoxId: "00000000-0000-0000-0000-000000000001",
        selectedTrackId: null,
      }),
      trackEdit,
    );
    expect(boxEdit.ui.selectedTrackId).toBeNull();
    expect(boxEdit.ui.selectedBoxId).toBe(
      "00000000-0000-0000-0000-000000000001",
    );

    // Draw/navigation: no stale prior edit-state value.
    const drawing = mapBBoxSlice(createInput({ action: "draw" }), boxEdit);
    expect(drawing.ui.selectedTrackId).toBeNull();
    expect(drawing.ui.selectedBoxId).toBeNull();
  });

  it("reuses the previous slice when nothing changed (structural sharing)", () => {
    const previous = mapBBoxSlice(createInput(), null);
    const next = mapBBoxSlice(createInput(), previous);

    expect(next).toBe(previous);
  });

  it("rebuilds the slice when any field changes", () => {
    const previous = mapBBoxSlice(createInput(), null);

    expect(mapBBoxSlice(createInput({ action: "select" }), previous)).not.toBe(
      previous,
    );
    expect(
      mapBBoxSlice(createInput({ drawMode: "center2front" }), previous),
    ).not.toBe(previous);
    expect(mapBBoxSlice(createInput({ disabled: true }), previous)).not.toBe(
      previous,
    );
    expect(
      mapBBoxSlice(
        createInput({
          selectedBoxId: "00000000-0000-0000-0000-000000000001",
        }),
        previous,
      ),
    ).not.toBe(previous);
    expect(mapBBoxSlice(createInput({ autoTracks: true }), previous)).not.toBe(
      previous,
    );
    expect(
      mapBBoxSlice(
        createInput({
          clipboard: { disableCopy: false, disablePaste: true },
        }),
        previous,
      ),
    ).not.toBe(previous);
    expect(
      mapBBoxSlice(
        createInput({
          settings: { ...previous.settings, disabled: true },
        }),
        previous,
      ),
    ).not.toBe(previous);
    expect(
      mapBBoxSlice(
        createInput({
          settings: {
            ...previous.settings,
            disallowRelativeElevation: true,
          },
        }),
        previous,
      ),
    ).not.toBe(previous);
    expect(
      mapBBoxSlice(
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
    const previous = mapBBoxSlice(createInput(), null);
    const next = mapBBoxSlice(createInput({ action: "select" }), previous);

    expect(next).not.toBe(previous);
    expect(next.settings).toBe(previous.settings);
  });

  it("keeps the unchanged interaction state reference when only settings change", () => {
    const previous = mapBBoxSlice(createInput(), null);
    const next = mapBBoxSlice(
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
    const slice = mapBBoxSlice(
      createInput({
        labels: createFakeLabels({
          boxes: [
            createFakeBox({
              perceivedClass,
              perceivedClassId: 7,
              entityId: "00000000-0000-0000-0000-0000000000a1",
              distinctiveLv: makeLevel(1),
              occlusionLv: makeLevel(2),
            }),
          ],
          tracks: [
            createFakeTrack({
              gtClass: perceivedClass,
              gtClassId: 7,
              isBlack: true,
            }),
          ],
          classes: [perceivedClass],
        }),
      }),
      null,
    );

    expect(slice.boxes).toEqual([
      {
        id: "00000000-0000-0000-0000-000000000001",
        text: expect.stringContaining("[Car]"),
        boxType: "cuboid",
        center: { x: 1, y: 2, z: 3 },
        size: { x: 4, y: 5, z: 6 },
        angle: 0.5,
        entityId: "00000000-0000-0000-0000-0000000000a1",
        perceivedClassId: 7,
        distinctiveLv: 1,
        occlusionLv: 2,
      },
    ]);
    expect(slice.tracks).toEqual([
      {
        id: "00000000-0000-0000-0000-0000000000a1",
        text: expect.stringContaining("[Car]"),
        gtClassId: 7,
        isBlack: true,
      },
    ]);
    expect(slice.classes).toEqual([{ id: 7, name: "Car" }]);
  });

  it("projects unknown quality levels and missing relations as null", () => {
    const slice = mapBBoxSlice(
      createInput({
        labels: createFakeLabels({
          boxes: [createFakeBox()],
          tracks: [createFakeTrack()],
        }),
      }),
      null,
    );

    expect(slice.boxes[0].distinctiveLv).toBeNull();
    expect(slice.boxes[0].occlusionLv).toBeNull();
    expect(slice.boxes[0].entityId).toBeNull();
    expect(slice.boxes[0].perceivedClassId).toBeNull();
    expect(slice.boxes[0].text).toContain("<Unclassified>");
    expect(slice.tracks[0].gtClassId).toBeNull();
    expect(slice.tracks[0].text).toContain("<Unclassified>");
  });

  it("publishes empty lists while no labels are loaded", () => {
    const slice = mapBBoxSlice(createInput(), null);

    expect(slice.boxes).toEqual([]);
    expect(slice.tracks).toEqual([]);
    expect(slice.classes).toEqual([]);
  });

  it("publishes empty lists when the labels source is unavailable mid-load", () => {
    const previous = mapBBoxSlice(
      createInput({
        labels: createFakeLabels({
          boxes: [createFakeBox()],
          classes: [createFakeClass()],
        }),
      }),
      null,
    );

    const next = mapBBoxSlice(createInput({ labels: null }), previous);

    expect(next).not.toBe(previous);
    expect(next.boxes).toEqual([]);
    expect(next.tracks).toEqual([]);
    expect(next.classes).toEqual([]);
  });

  it("reuses unchanged entity records and lists across mappings (structural sharing)", () => {
    const labels = createFakeLabels({
      boxes: [createFakeBox()],
      classes: [createFakeClass()],
    });
    const previous = mapBBoxSlice(createInput({ labels }), null);
    const next = mapBBoxSlice(createInput({ labels }), previous);

    expect(next).toBe(previous);
    expect(next.boxes).toBe(previous.boxes);
    expect(next.boxes[0]).toBe(previous.boxes[0]);
    expect(next.classes).toBe(previous.classes);
  });

  it("rebuilds only the changed entity record and keeps the others shared", () => {
    const unchanged = createFakeBox();
    const changed = createFakeBox({
      id: "00000000-0000-0000-0000-000000000002",
    });
    const previous = mapBBoxSlice(
      createInput({
        labels: createFakeLabels({ boxes: [unchanged, changed] }),
      }),
      null,
    );

    const next = mapBBoxSlice(
      createInput({
        labels: createFakeLabels({
          boxes: [
            unchanged,
            createFakeBox({
              id: "00000000-0000-0000-0000-000000000002",
              angle: 1.5,
            }),
          ],
        }),
      }),
      previous,
    );

    expect(next).not.toBe(previous);
    expect(next.boxes).not.toBe(previous.boxes);
    expect(next.boxes[0]).toBe(previous.boxes[0]);
    expect(next.boxes[1]).not.toBe(previous.boxes[1]);
    expect(next.boxes[1].angle).toBe(1.5);
  });

  it("reprojects dependent text when a linked class changes", () => {
    // The box itself is unchanged; only its perceived class name is.
    const box = (className: string) =>
      createFakeBox({
        perceivedClass: createFakeClass({ name: className }),
        perceivedClassId: 1,
      });
    const previous = mapBBoxSlice(
      createInput({
        labels: createFakeLabels({ boxes: [box("Car")] }),
      }),
      null,
    );

    const next = mapBBoxSlice(
      createInput({
        labels: createFakeLabels({ boxes: [box("Pedestrian")] }),
      }),
      previous,
    );

    expect(next.boxes).not.toBe(previous.boxes);
    expect(next.boxes[0]).not.toBe(previous.boxes[0]);
    expect(next.boxes[0].text).toContain("[Pedestrian]");
  });

  it("treats a resolved placeholder id as a new record", () => {
    const previous = mapBBoxSlice(
      createInput({
        labels: createFakeLabels({
          boxes: [createFakeBox({ id: "placeholder-1" })],
        }),
      }),
      null,
    );

    const next = mapBBoxSlice(
      createInput({
        labels: createFakeLabels({
          boxes: [
            createFakeBox({
              id: "00000000-0000-0000-0000-000000000001",
            }),
          ],
        }),
      }),
      previous,
    );

    expect(next.boxes).not.toBe(previous.boxes);
    expect(next.boxes[0]).not.toBe(previous.boxes[0]);
    expect(next.boxes[0].id).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("rebuilds the lists when entities are added or deleted", () => {
    const first = createFakeBox();
    const second = createFakeBox({
      id: "00000000-0000-0000-0000-000000000002",
    });

    const previous = mapBBoxSlice(
      createInput({
        labels: createFakeLabels({ boxes: [first] }),
      }),
      null,
    );

    const added = mapBBoxSlice(
      createInput({
        labels: createFakeLabels({ boxes: [first, second] }),
      }),
      previous,
    );
    expect(added.boxes).not.toBe(previous.boxes);
    expect(added.boxes[0]).toBe(previous.boxes[0]);

    const deleted = mapBBoxSlice(
      createInput({
        labels: createFakeLabels({ boxes: [second] }),
      }),
      added,
    );
    expect(deleted.boxes).not.toBe(added.boxes);
    expect(deleted.boxes).toHaveLength(1);
  });

  it("keeps the entity list references when only interaction state changes", () => {
    const labels = createFakeLabels({
      boxes: [createFakeBox()],
      tracks: [createFakeTrack()],
    });
    const previous = mapBBoxSlice(createInput({ labels }), null);
    const next = mapBBoxSlice(
      createInput({ labels, action: "select" }),
      previous,
    );

    expect(next).not.toBe(previous);
    expect(next.boxes).toBe(previous.boxes);
    expect(next.tracks).toBe(previous.tracks);
    expect(next.classes).toBe(previous.classes);
  });
});
