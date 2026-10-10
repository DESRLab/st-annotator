/* @vitest-environment jsdom */

import {
  act,
  default as React,
  type JSX,
  useEffect,
  useLayoutEffect,
  useMemo,
} from "react";
import { createRoot } from "react-dom/client";
import { EventDispatcher, Vector3 } from "three";
import { afterEach, describe, expect, it } from "vitest";

import {
  Placeholder,
  usePaneState,
  VanillaEventDispatcher,
} from "sta/app/editor";

import { LabelBoxInspectorPaneView } from "../../../../app/editor/scene/widgets/LabelBoxInspector.react.tsx";
import {
  LabelBoxInspector,
  getLabelBoxInspectorPaneParams,
} from "../../../../app/editor/scene/widgets/LabelBoxInspector.tsx";
import type {
  BBoxInspectorLabelsView,
  LabelBoxInspectorHandle,
} from "../../../../app/editor/scene/widgets/LabelBoxInspector.tsx";
import { cloneLabelBoxInspectorInputtedData } from "../../../../app/editor/scene/widgets/LabelBoxInspectorPane.ts";
import { LabelTrackInspectorPaneView } from "../../../../app/editor/scene/widgets/LabelTrackInspector.react.tsx";
import {
  createLabelTrackInspector,
  getLabelTrackInspectorPaneParams,
} from "../../../../app/editor/scene/widgets/LabelTrackInspector.tsx";
import type { LabelTrackInspectorHandle } from "../../../../app/editor/scene/widgets/LabelTrackInspector.tsx";
import {
  DistinctiveLevel as BBoxDistinctiveLevel,
  OcclusionLevel as BBoxOcclusionLevel,
} from "../../../../models";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const CLASS_CAR = { id: 1, name: "Car" };
const CLASS_PEDESTRIAN = { id: 2, name: "Pedestrian" };
const TRACK_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_TRACK_ID = "33333333-3333-4333-8333-333333333333";
const BOX_ID = "11111111-1111-4111-8111-111111111111";

type BBoxQualityLevel =
  (typeof BBoxDistinctiveLevel)[keyof typeof BBoxDistinctiveLevel];

interface FakeClassEntity {
  id: number;
  name: string;
}

interface FakeTrackEntity {
  id: string;
  gtClassId: number | null;
  gtClass: FakeClassEntity | null;
  isBlack: boolean;
  elements: FakeBoxEntity[];
}

interface FakeBoxEntity {
  id: string;
  boxType: string;
  center: Vector3;
  size: Vector3;
  angle: number;
  entityId: string | null;
  entity: FakeTrackEntity | null;
  perceivedClassId: number | null;
  perceivedClass: FakeClassEntity | null;
  distinctiveLv: BBoxQualityLevel;
  occlusionLv: BBoxQualityLevel;
}

function findSelectByOptionText(
  dom: HTMLElement,
  text: string,
): HTMLSelectElement | undefined {
  return [...dom.querySelectorAll("select")].find((select) =>
    [...select.options].some((option) => option.textContent?.includes(text)),
  );
}

function findSelectByRowLabel(
  dom: HTMLElement,
  label: string,
): HTMLSelectElement | undefined {
  return (
    [...dom.querySelectorAll<HTMLElement>(".tp-lblv")]
      .find((row) => row.querySelector(".tp-lblv_l")?.textContent === label)
      ?.querySelector("select") ?? undefined
  );
}

// The hosted inspector renders the action button through Tweakpane, whose
// modifyHTML sets the tooltip (title attribute only, no aria-label).
function expectActionButtonTooltip(
  dom: HTMLElement,
  label: string,
  tooltip: string,
): void {
  const button = [...dom.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  expect(button).toBeTruthy();
  expect(button?.title).toBe(tooltip);
}

async function flush() {
  await act(async () => {});
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

function expectNativeTweakpaneInspector(dom: HTMLElement): void {
  expect(dom.querySelector(".tp-rotv")).not.toBeNull();
  expect(dom.querySelector(".tp-lblv, .tp-selectgridv")).not.toBeNull();
  expect(dom.querySelector('input[role="combobox"]')).not.toBeNull();
}

function LabelTrackInspectorHost({
  inspector,
}: {
  inspector: LabelTrackInspectorHandle;
}): JSX.Element {
  const paneState = usePaneState({
    eventType: "change",
    getPaneParams: () =>
      getLabelTrackInspectorPaneParams(
        inspector.labelsView,
        inspector.selectedTrack,
        inspector.disabled,
      ),
    inputChangePolicy: "optimistic",
    onInputChange: inspector.onInputChange,
    source: inspector,
  });
  return (
    <LabelTrackInspectorPaneView
      {...paneState}
      onPaneEvent={inspector.onPaneEvent}
    />
  );
}

function LabelBoxInspectorHost({
  inspector,
}: {
  inspector: LabelBoxInspectorHandle;
}): JSX.Element {
  const paneState = usePaneState({
    eventType: "change",
    getPaneParams: () =>
      getLabelBoxInspectorPaneParams(
        inspector.labelsView,
        inspector.selectedBox,
        inspector.disabled,
        inspector.autoTracks,
        inspector.drawBoxActive,
      ),
    inputChangePolicy: "optimistic",
    onInputChange: inspector.onInputChange,
    source: inspector,
  });
  return (
    <LabelBoxInspectorPaneView
      {...paneState}
      onPaneEvent={inspector.onPaneEvent}
    />
  );
}

// The bbox inspectors are owned by the interaction context at runtime; the
// tests construct them directly (mirroring the context) and dispose them on
// unmount, the way the context disposal does.
function LabelTrackInspectorHookHost({
  labelsView,
  onInspector,
}: {
  labelsView: BBoxInspectorLabelsView;
  onInspector: (inspector: LabelTrackInspectorHandle) => void;
}): JSX.Element {
  const inspector = useMemo(
    () => createLabelTrackInspector({ labelsView }),
    [labelsView],
  );
  useEffect(() => (): void => inspector.dispose(), [inspector]);
  useLayoutEffect(() => onInspector(inspector), [inspector, onInspector]);
  return <LabelTrackInspectorHost inspector={inspector} />;
}

function LabelBoxInspectorHookHost({
  labelsView,
  onInspector,
}: {
  labelsView: BBoxInspectorLabelsView;
  onInspector: (inspector: LabelBoxInspectorHandle) => void;
}): JSX.Element {
  const inspector = useMemo(
    () => new LabelBoxInspector({ labelsView }),
    [labelsView],
  );
  useEffect(() => (): void => inspector.dispose(), [inspector]);
  useLayoutEffect(() => onInspector(inspector), [inspector, onInspector]);
  return <LabelBoxInspectorHost inspector={inspector} />;
}

interface FakeLabelIndexIterators {
  classes: () => Iterator<unknown>;
  tracks?: () => Iterator<unknown>;
  boxes?: () => Iterator<unknown>;
}

class FakeLabelIndex extends EventDispatcher {
  #iterators: FakeLabelIndexIterators;

  constructor(iterators: FakeLabelIndexIterators) {
    super();
    this.#iterators = iterators;
  }

  iterLabelClasses() {
    return this.#iterators.classes();
  }
  iterLabelTracks() {
    return this.#iterators.tracks?.() ?? [][Symbol.iterator]();
  }
  iterLabelBoxes() {
    return this.#iterators.boxes?.() ?? [][Symbol.iterator]();
  }
}

class FakeBBoxView extends VanillaEventDispatcher {
  data: FakeLabelIndex;
  classes = new Map<number, FakeClassEntity>();
  tracks = new Map<string, FakeTrackEntity>();
  boxes = new Map<string, FakeBoxEntity>();
  calls: unknown[][] = [];
  #nextTrackId = "77777777-7777-4777-8777-777777777777";

  constructor({
    classes = [],
    tracks = [],
    boxes = [],
  }: {
    classes?: FakeClassEntity[];
    tracks?: FakeTrackEntity[];
    boxes?: FakeBoxEntity[];
  } = {}) {
    super();
    this.setData({ classes, tracks, boxes }, false);
  }

  setData(
    {
      classes = [],
      tracks = [],
      boxes = [],
    }: {
      classes?: FakeClassEntity[];
      tracks?: FakeTrackEntity[];
      boxes?: FakeBoxEntity[];
    },
    dispatch = true,
  ) {
    this.classes = new Map(classes.map((item) => [item.id, item]));
    this.tracks = new Map(tracks.map((item) => [item.id, item]));
    this.boxes = new Map(boxes.map((item) => [item.id, item]));
    this.data = new FakeLabelIndex({
      classes: () => this.iterLabelClasses(),
      tracks: () => this.iterLabelTracks(),
      boxes: () => this.iterLabelBoxes(),
    });
    if (dispatch) (this as any).dispatchEvent({ type: "afterload" });
  }

  iterLabelClasses() {
    return this.classes.values();
  }
  iterLabelTracks() {
    return this.tracks.values();
  }
  iterLabelBoxes() {
    return this.boxes.values();
  }
  hasLabelClass(id: number) {
    return this.classes.has(id);
  }
  getLabelClass(id: number) {
    return this.classes.get(id);
  }
  hasLabelTrack(id: string) {
    return this.tracks.has(id);
  }
  getLabelTrack(id: string) {
    return this.tracks.get(id);
  }
  hasLabelBox(id: string) {
    return this.boxes.has(id);
  }
  getLabelBox(id: string) {
    return this.boxes.get(id);
  }

  async addLabelTrack(params: any) {
    const track: FakeTrackEntity = {
      id: this.#nextTrackId,
      gtClassId: params.gtClassId ?? null,
      gtClass: this.getLabelClass(params.gtClassId) ?? null,
      isBlack: params.isBlack ?? false,
      elements: [],
    };
    this.tracks.set(track.id, track);
    this.calls.push(["addLabelTrack", params]);
    (this as any).dispatchEvent({ type: "afterload" });
    return track;
  }

  async updateLabelTrackGtClass(
    track: FakeTrackEntity,
    labelClass: FakeClassEntity | null,
  ) {
    track.gtClassId = labelClass?.id ?? null;
    track.gtClass = labelClass ?? null;
    this.calls.push(["updateLabelTrackGtClass", track, labelClass]);
  }

  async updateLabelTrackIsBlack(track: FakeTrackEntity, value: boolean) {
    track.isBlack = value;
    this.calls.push(["updateLabelTrackIsBlack", track, value]);
  }

  async updateLabelBoxType(box: FakeBoxEntity, value: string) {
    box.boxType = value;
    this.calls.push(["updateLabelBoxType", box, value]);
  }

  async updateLabelBoxTransform(box: FakeBoxEntity, mode: string, pose: any) {
    box.center.set(pose.center.x, pose.center.y, pose.center.z);
    box.size.set(pose.size.x, pose.size.y, pose.size.z);
    box.angle = pose.angle;
    this.calls.push(["updateLabelBoxTransform", box, mode, pose]);
  }

  async updateLabelBoxParentTrack(
    box: FakeBoxEntity,
    track: FakeTrackEntity | null,
  ) {
    box.entityId = track?.id ?? null;
    box.entity = track ?? null;
    this.calls.push(["updateLabelBoxParentTrack", box, track]);
  }

  async updateLabelBoxPerceivedClass(
    box: FakeBoxEntity,
    labelClass: FakeClassEntity | null,
  ) {
    box.perceivedClassId = labelClass?.id ?? null;
    box.perceivedClass = labelClass ?? null;
    this.calls.push(["updateLabelBoxPerceivedClass", box, labelClass]);
  }

  async updateLabelBoxDistinctiveLv(
    box: FakeBoxEntity,
    value: BBoxQualityLevel,
  ) {
    box.distinctiveLv = value;
    this.calls.push(["updateLabelBoxDistinctiveLv", box, value]);
  }

  async updateLabelBoxOcclusionLv(box: FakeBoxEntity, value: BBoxQualityLevel) {
    box.occlusionLv = value;
    this.calls.push(["updateLabelBoxOcclusionLv", box, value]);
  }
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("bbox inspector coordinators", () => {
  it("preserves placeholder IDs in bbox inspector input", () => {
    const boxId = new Placeholder<string>();
    const trackId = new Placeholder<string>();

    const boxClone = cloneLabelBoxInspectorInputtedData({
      selection: { boxId },
      relations: {
        trackSelect: { trackId },
        classSelect: { classId: null },
      },
    });

    expect(boxClone.selection.boxId).toBe(boxId);
    expect(boxClone.relations.trackSelect.trackId).toBe(trackId);
  });

  it("keeps bbox track selection, editing, creation, and reload clearing wired through React panes", async () => {
    const track: FakeTrackEntity = {
      id: TRACK_ID,
      gtClassId: 1,
      gtClass: CLASS_CAR,
      isBlack: false,
      elements: [],
    };
    const labelsView = new FakeBBoxView({
      classes: [CLASS_CAR, CLASS_PEDESTRIAN],
      tracks: [track],
    });
    let inspector!: LabelTrackInspectorHandle;
    const events: unknown[] = [];
    const dom = document.createElement("div");
    const root = createRoot(dom);

    await act(async () => {
      root.render(
        <LabelTrackInspectorHookHost
          labelsView={labelsView as unknown as BBoxInspectorLabelsView}
          onInspector={(value) => {
            inspector = value;
          }}
        />,
      );
    });
    expectNativeTweakpaneInspector(dom);
    document.body.appendChild(dom);
    inspector.addEventListener("select-track", (event) =>
      events.push(event.value),
    );
    await flush();

    expectActionButtonTooltip(dom, "+", "Add Track");

    const trackSelect = findSelectByOptionText(dom, "T{");
    expect(trackSelect).toBeTruthy();
    await selectOption(trackSelect!, "T{");

    expect(inspector.selectedId).toBe(TRACK_ID);
    expect(events.at(-1)).toBe(track);
    expectActionButtonTooltip(dom, "+", "Clone Track");

    const classSelect = findSelectByRowLabel(dom, "Object Class");
    expect(classSelect).toBeTruthy();
    await selectOption(classSelect!, "Pedestrian");

    expect(track.gtClassId).toBe(2);
    expect(
      labelsView.calls.some(([name]) => name === "updateLabelTrackGtClass"),
    ).toBe(true);
    expect(inspector.getTrackParams()).toEqual({
      gtClassId: 2,
      isBlack: false,
    });

    await act(async () => {
      inspector.clickCreateTrack();
    });
    expect(inspector.selectedId).toBe("77777777-7777-4777-8777-777777777777");
    expect(events.at(-1)).toBe(
      labelsView.getLabelTrack(inspector.selectedId as string),
    );

    await act(async () => {
      labelsView.setData({
        classes: [CLASS_CAR, CLASS_PEDESTRIAN],
        tracks: [],
      });
    });
    expect(inspector.selectedId).toBe(null);
    expect(events.at(-1)).toBe(null);

    await act(async () => {
      root.unmount();
    });
    expect(dom.innerHTML).toBe("");
  });

  it("keeps bbox box selection, class edits, draw toggles, and reload clearing wired through React panes", async () => {
    const track: FakeTrackEntity = {
      id: TRACK_ID,
      gtClassId: 1,
      gtClass: CLASS_CAR,
      isBlack: false,
      elements: [],
    };
    const otherTrack: FakeTrackEntity = {
      id: OTHER_TRACK_ID,
      gtClassId: 2,
      gtClass: CLASS_PEDESTRIAN,
      isBlack: false,
      elements: [],
    };
    const box: FakeBoxEntity = {
      id: BOX_ID,
      boxType: "cuboid",
      center: new Vector3(1, 2, 3),
      size: new Vector3(4, 5, 6),
      angle: 0,
      entityId: TRACK_ID,
      entity: track,
      perceivedClassId: 1,
      perceivedClass: CLASS_CAR,
      distinctiveLv: BBoxDistinctiveLevel.Excellent,
      occlusionLv: BBoxOcclusionLevel.Unknown,
    };
    track.elements = [box];
    const labelsView = new FakeBBoxView({
      classes: [CLASS_CAR, CLASS_PEDESTRIAN],
      tracks: [track, otherTrack],
      boxes: [box],
    });
    let inspector!: LabelBoxInspectorHandle;
    const toggles: unknown[] = [];
    const boxEvents: unknown[] = [];

    const dom = document.createElement("div");
    const root = createRoot(dom);

    await act(async () => {
      root.render(
        <LabelBoxInspectorHookHost
          labelsView={labelsView as unknown as BBoxInspectorLabelsView}
          onInspector={(value) => {
            inspector = value;
          }}
        />,
      );
    });
    expectNativeTweakpaneInspector(dom);
    expect(dom.querySelector('input[placeholder="(New box)"]')).not.toBeNull();
    expect(
      dom.querySelector('input[placeholder="(No track selected)"]'),
    ).not.toBeNull();
    expect(findSelectByRowLabel(dom, "Object Class")).toBeTruthy();
    document.body.appendChild(dom);
    inspector.addEventListener("toggle-drawBox", (event) =>
      toggles.push(event.drawBoxActive),
    );
    inspector.addEventListener("select-box", (event) =>
      boxEvents.push(event.value),
    );
    await flush();

    expectActionButtonTooltip(dom, "D", "Toggle Draw Mode");

    const nativePane = dom.querySelector(".tp-rotv");
    await act(async () => {
      root.render(
        <LabelBoxInspectorHookHost
          labelsView={labelsView as unknown as BBoxInspectorLabelsView}
          onInspector={(value) => {
            inspector = value;
          }}
        />,
      );
    });
    expect(dom.querySelector(".tp-rotv")).toBe(nativePane);

    const boxSelect = findSelectByOptionText(dom, "B{");
    expect(boxSelect).toBeTruthy();
    expect(
      [...boxSelect!.options].some((option) =>
        option.textContent?.includes("[Car]"),
      ),
    ).toBe(true);

    await act(async () => {
      inspector.disabled = true;
    });
    expect(
      dom.querySelector<HTMLInputElement>('input[placeholder="(New box)"]')
        ?.disabled,
    ).toBe(true);
    await act(async () => {
      inspector.disabled = false;
    });

    await selectOption(boxSelect!, "B{");

    expect(inspector.selectedId).toBe(BOX_ID);
    expect(inspector.selectedBox).toBe(box);
    expect(boxEvents.at(-1)).toBe(box);

    const relationshipTrackSelect = dom.querySelector<HTMLInputElement>(
      'input[placeholder="(No track selected)"]',
    );
    expect(relationshipTrackSelect?.disabled).toBe(false);
    await act(async () => {
      inspector.disabled = true;
    });
    expect(relationshipTrackSelect?.disabled).toBe(true);
    await act(async () => {
      inspector.disabled = false;
    });
    expect(relationshipTrackSelect?.disabled).toBe(false);

    await act(async () => {
      inspector.clickDrawBox();
    });
    expect(toggles).toEqual([true]);
    expect(inspector.drawBoxActive).toBe(true);

    const classSelect = findSelectByRowLabel(dom, "Object Class");
    expect(classSelect).toBeTruthy();
    await selectOption(classSelect!, "Pedestrian");

    expect(box.perceivedClassId).toBe(2);
    expect(
      labelsView.calls.some(
        ([name]) => name === "updateLabelBoxPerceivedClass",
      ),
    ).toBe(true);
    expect(inspector.getBoxParams()).toMatchObject({
      boxType: "cuboid",
      entityId: TRACK_ID,
      perceivedClassId: 2,
    });

    expect(relationshipTrackSelect).toBeTruthy();
    await act(async () =>
      relationshipTrackSelect!.dispatchEvent(
        new FocusEvent("focusin", { bubbles: true }),
      ),
    );
    const relationshipTrackOption = document.querySelector<HTMLButtonElement>(
      `[data-label-id="${OTHER_TRACK_ID}"]`,
    );
    expect(relationshipTrackOption?.textContent).toContain("Pedestrian");
    await act(async () => relationshipTrackOption!.click());
    expect(box.entityId).toBe(OTHER_TRACK_ID);
    expect(box.entity).toBe(otherTrack);
    expect(
      labelsView.calls.some(
        ([name, changedBox, changedTrack]) =>
          name === "updateLabelBoxParentTrack" &&
          changedBox === box &&
          changedTrack === otherTrack,
      ),
    ).toBe(true);

    await act(async () =>
      relationshipTrackSelect!.dispatchEvent(
        new FocusEvent("focusin", { bubbles: true }),
      ),
    );
    const clearRelationshipOption = [
      ...document.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    ].find((option) => option.textContent === "(No track selected)");
    expect(clearRelationshipOption).toBeTruthy();
    await act(async () => clearRelationshipOption!.click());
    expect(box.entityId).toBe(null);
    expect(box.entity).toBe(null);
    expect(
      labelsView.calls.some(
        ([name, changedBox, changedTrack]) =>
          name === "updateLabelBoxParentTrack" &&
          changedBox === box &&
          changedTrack === null,
      ),
    ).toBe(true);
    expect(findSelectByRowLabel(dom, "Object Class")).toBeTruthy();

    // Descriptor edits flow through the same input path to the labels
    // view (the box starts at BBoxOcclusionLevel.Unknown).
    const occlusionSelect = [...dom.querySelectorAll<HTMLElement>(".tp-lblv")]
      .find((row) => row.textContent?.startsWith("Occlusion Level"))
      ?.querySelector("select");
    expect(occlusionSelect).toBeTruthy();
    await selectOption(occlusionSelect!, "Poor");

    // The pane clones the level objects on the way out, so compare the
    // plain fields rather than the level constant's identity.
    expect(box.occlusionLv.name).toBe("Poor");
    expect(box.occlusionLv.value).toBe(2);
    expect(
      labelsView.calls.some(([name]) => name === "updateLabelBoxOcclusionLv"),
    ).toBe(true);

    await act(async () => {
      labelsView.setData({
        classes: [CLASS_CAR, CLASS_PEDESTRIAN],
        tracks: [track, otherTrack],
        boxes: [],
      });
    });
    expect(inspector.selectedId).toBe(null);
    expect(boxEvents.at(-1)).toBe(null);

    await act(async () => {
      root.unmount();
    });
    expect(dom.innerHTML).toBe("");
  });
});

describe("bbox inspector stale-selection sequence (delete versus edit)", () => {
  function makeBox(track: FakeTrackEntity): FakeBoxEntity {
    return {
      id: BOX_ID,
      boxType: "cuboid",
      center: new Vector3(1, 2, 3),
      size: new Vector3(4, 5, 6),
      angle: 0,
      entityId: track.id,
      entity: track,
      perceivedClassId: 1,
      perceivedClass: CLASS_CAR,
      distinctiveLv: BBoxDistinctiveLevel.Excellent,
      occlusionLv: BBoxOcclusionLevel.Unknown,
    };
  }

  function makeLabelsView(box: FakeBoxEntity): FakeBBoxView {
    const track: FakeTrackEntity = {
      id: TRACK_ID,
      gtClassId: 1,
      gtClass: CLASS_CAR,
      isBlack: false,
      elements: [box],
    };
    const otherTrack: FakeTrackEntity = {
      id: OTHER_TRACK_ID,
      gtClassId: 2,
      gtClass: CLASS_PEDESTRIAN,
      isBlack: false,
      elements: [],
    };
    return new FakeBBoxView({
      classes: [CLASS_CAR, CLASS_PEDESTRIAN],
      tracks: [track, otherTrack],
      boxes: [box],
    });
  }

  // The same stale-selection sequence, table-driven across each inspector
  // mutation route: select a box, delete it out-of-band, then fire the
  // input change a control captured while the box still existed.
  const mutations: [
    string,
    (
      input: ReturnType<typeof getLabelBoxInspectorPaneParams>["inputtedData"],
    ) => void,
    string,
  ][] = [
    [
      "geometry transform",
      (input) => {
        (input as any).geometry.center.x += 10;
      },
      "updateLabelBoxTransform",
    ],
    [
      "geometry type",
      (input) => {
        (input as any).geometry.boxType = "cylinder";
      },
      "updateLabelBoxType",
    ],
    [
      "perceived class",
      (input) => {
        (input as any).relations.classSelect.classId = 2;
      },
      "updateLabelBoxPerceivedClass",
    ],
    [
      "track reassignment",
      (input) => {
        (input as any).relations.trackSelect.trackId = OTHER_TRACK_ID;
      },
      "updateLabelBoxParentTrack",
    ],
    [
      "occlusion descriptor",
      (input) => {
        (input as any).descriptors.occlusionLv = BBoxOcclusionLevel.Poor;
      },
      "updateLabelBoxOcclusionLv",
    ],
    [
      "distinctiveness descriptor",
      (input) => {
        (input as any).descriptors.distinctiveLv = BBoxDistinctiveLevel.Poor;
      },
      "updateLabelBoxDistinctiveLv",
    ],
  ];

  it.each(mutations)(
    "a stale %s after the selected box was deleted is a no-op",
    async (name, mutate, callName) => {
      const box = makeBox({
        id: TRACK_ID,
        gtClassId: 1,
        gtClass: CLASS_CAR,
        isBlack: false,
        elements: [],
      });
      const labelsView = makeLabelsView(box);
      const inspector = new LabelBoxInspector({
        labelsView: labelsView as unknown as BBoxInspectorLabelsView,
      });

      // The same input applied while the box exists mutates exactly once...
      inspector.selectedId = BOX_ID;
      let input = getLabelBoxInspectorPaneParams(
        labelsView as unknown as BBoxInspectorLabelsView,
        box as never,
        false,
        false,
        false,
      ).inputtedData;
      mutate(input);
      inspector.onInputChange(input);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(
        labelsView.calls.filter(([called]) => called === callName),
      ).to.have.length(1);
      labelsView.calls.length = 0;

      // ...but once the box is deleted, the identical stale input from a
      // control captured earlier neither throws nor reaches the view.
      labelsView.boxes.delete(BOX_ID);
      input = getLabelBoxInspectorPaneParams(
        labelsView as unknown as BBoxInspectorLabelsView,
        box as never,
        false,
        false,
        false,
      ).inputtedData;
      mutate(input);
      inspector.onInputChange(input);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(
        labelsView.calls.filter(([called]) => called === callName),
      ).to.have.length(0);

      inspector.dispose();
    },
  );

  it("edits apply again once undo restores the deleted box under its id", async () => {
    const box = makeBox({
      id: TRACK_ID,
      gtClassId: 1,
      gtClass: CLASS_CAR,
      isBlack: false,
      elements: [],
    });
    const labelsView = makeLabelsView(box);
    const inspector = new LabelBoxInspector({
      labelsView: labelsView as unknown as BBoxInspectorLabelsView,
    });
    inspector.selectedId = BOX_ID;

    // Delete, then a stale edit goes nowhere (no reload cleared the id).
    labelsView.boxes.delete(BOX_ID);
    let input = getLabelBoxInspectorPaneParams(
      labelsView as unknown as BBoxInspectorLabelsView,
      box as never,
      false,
      false,
      false,
    ).inputtedData;
    (input as any).relations.classSelect.classId = 2;
    inspector.onInputChange(input);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(labelsView.calls).to.have.length(0);

    // Undo of the delete restores the box under the same id as a new
    // instance; a fresh edit must target the restored label.
    const restored: FakeBoxEntity = {
      ...box,
      perceivedClassId: 1,
      perceivedClass: CLASS_CAR,
    };
    labelsView.boxes.set(BOX_ID, restored);
    input = getLabelBoxInspectorPaneParams(
      labelsView as unknown as BBoxInspectorLabelsView,
      restored as never,
      false,
      false,
      false,
    ).inputtedData;
    (input as any).relations.classSelect.classId = 2;
    inspector.onInputChange(input);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      labelsView.calls.filter(
        ([called, target]) =>
          called === "updateLabelBoxPerceivedClass" && target === restored,
      ),
    ).to.have.length(1);

    inspector.dispose();
  });
});
