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
import { EventDispatcher } from "three";
import { afterEach, describe, expect, it } from "vitest";

import {
  Placeholder,
  usePaneState,
  VanillaEventDispatcher,
} from "sta/app/editor";

import { LabelInstanceInspectorPaneView } from "../../../../app/editor/scene/widgets/LabelInstanceInspector.react.tsx";
import {
  LabelInstanceInspector,
  getLabelInstanceInspectorPaneParams,
} from "../../../../app/editor/scene/widgets/LabelInstanceInspector.tsx";
import type {
  LabelInstanceInspectorHandle,
  SegmentationInspectorLabelsView,
} from "../../../../app/editor/scene/widgets/LabelInstanceInspector.tsx";
import { cloneLabelInstanceInspectorInputtedData } from "../../../../app/editor/scene/widgets/LabelInstanceInspectorPane.ts";
import { LabelSelectionInspectorPaneView } from "../../../../app/editor/scene/widgets/LabelSelectionInspector.react.tsx";
import {
  LabelSelectionInspector,
  getLabelSelectionInspectorPaneParams,
} from "../../../../app/editor/scene/widgets/LabelSelectionInspector.tsx";
import type { LabelSelectionInspectorHandle } from "../../../../app/editor/scene/widgets/LabelSelectionInspector.tsx";
import { cloneLabelSelectionInspectorInputtedData } from "../../../../app/editor/scene/widgets/LabelSelectionInspectorPane.ts";
import {
  DistinctiveLevel as SegmentationDistinctiveLevel,
  OcclusionLevel as SegmentationOcclusionLevel,
} from "../../../../models";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const CLASS_CAR = { id: 1, name: "Car" };
const CLASS_PEDESTRIAN = { id: 2, name: "Pedestrian" };
const INSTANCE_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_INSTANCE_ID = "66666666-6666-4666-8666-666666666666";
const SELECTION_ID = "55555555-5555-4555-8555-555555555555";

function findSelectByOptionText(
  dom: HTMLElement,
  text: string,
): HTMLSelectElement | undefined {
  return [...dom.querySelectorAll("select")].find((select) =>
    [...select.options].some(
      (option) => option.textContent?.includes(text) ?? false,
    ),
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
}

function LabelInstanceInspectorHost({
  inspector,
}: {
  inspector: LabelInstanceInspectorHandle;
}): JSX.Element {
  const paneState = usePaneState({
    eventType: "change",
    getPaneParams: () =>
      getLabelInstanceInspectorPaneParams(
        inspector.labelsView,
        inspector.selectedInstance,
        inspector.disabled,
      ),
    inputChangePolicy: "optimistic",
    onInputChange: inspector.onInputChange,
    source: inspector,
  });
  return (
    <LabelInstanceInspectorPaneView
      {...paneState}
      onPaneEvent={inspector.onPaneEvent}
    />
  );
}

function LabelSelectionInspectorHost({
  inspector,
}: {
  inspector: LabelSelectionInspectorHandle;
}): JSX.Element {
  const paneState = usePaneState({
    eventType: "change",
    getPaneParams: () =>
      getLabelSelectionInspectorPaneParams(
        inspector.labelsView,
        inspector.selectedSelection,
        inspector.disabled,
        inspector.autoInstances,
        inspector.drawSelectionActive,
      ),
    inputChangePolicy: "optimistic",
    onInputChange: inspector.onInputChange,
    source: inspector,
  });
  return (
    <LabelSelectionInspectorPaneView
      {...paneState}
      onPaneEvent={inspector.onPaneEvent}
    />
  );
}

// The segmentation inspectors are owned by their interaction contexts at
// runtime; the tests construct them directly (mirroring the context) and
// dispose them on unmount, the way the context disposal does.
function LabelInstanceInspectorHookHost({
  labelsView,
  onInspector,
}: {
  labelsView: SegmentationInspectorLabelsView;
  onInspector: (inspector: LabelInstanceInspectorHandle) => void;
}): JSX.Element {
  const inspector = useMemo(
    () => new LabelInstanceInspector({ labelsView }),
    [labelsView],
  );
  useEffect(() => (): void => inspector.dispose(), [inspector]);
  useLayoutEffect(() => onInspector(inspector), [inspector, onInspector]);
  return <LabelInstanceInspectorHost inspector={inspector} />;
}

function LabelSelectionInspectorHookHost({
  labelsView,
  onInspector,
}: {
  labelsView: SegmentationInspectorLabelsView;
  onInspector: (inspector: LabelSelectionInspectorHandle) => void;
}): JSX.Element {
  const inspector = useMemo(
    () => new LabelSelectionInspector({ labelsView }),
    [labelsView],
  );
  useEffect(() => (): void => inspector.dispose(), [inspector]);
  useLayoutEffect(() => onInspector(inspector), [inspector, onInspector]);
  return <LabelSelectionInspectorHost inspector={inspector} />;
}

interface FakeLabelIndexIterators {
  classes(): IterableIterator<unknown>;
  tracks?(): IterableIterator<unknown>;
  boxes?(): IterableIterator<unknown>;
  vectors?(): IterableIterator<unknown>;
  instances?(): IterableIterator<unknown>;
  selections?(): IterableIterator<unknown>;
}

class FakeLabelIndex extends EventDispatcher {
  #iterators: FakeLabelIndexIterators;

  constructor(iterators: FakeLabelIndexIterators) {
    super();
    this.#iterators = iterators;
  }

  iterLabelClasses(): IterableIterator<unknown> {
    return this.#iterators.classes();
  }
  iterLabelTracks(): IterableIterator<unknown> {
    return this.#iterators.tracks?.() ?? [][Symbol.iterator]();
  }
  iterLabelBoxes(): IterableIterator<unknown> {
    return this.#iterators.boxes?.() ?? [][Symbol.iterator]();
  }
  iterLabelVectors(): IterableIterator<unknown> {
    return this.#iterators.vectors?.() ?? [][Symbol.iterator]();
  }
  iterLabelInstances(): IterableIterator<unknown> {
    return this.#iterators.instances?.() ?? [][Symbol.iterator]();
  }
  iterLabelSelections(): IterableIterator<unknown> {
    return this.#iterators.selections?.() ?? [][Symbol.iterator]();
  }
}

interface FakeSegmentationViewInput {
  classes?: any[];
  instances?: any[];
  selections?: any[];
}

class FakeSegmentationView extends VanillaEventDispatcher {
  data: FakeLabelIndex;
  classes = new Map<number, any>();
  instances = new Map<string, any>();
  selections = new Map<string, any>();
  calls: [string, ...unknown[]][] = [];
  #nextInstanceId = "88888888-8888-4888-8888-888888888888";

  constructor({
    classes = [],
    instances = [],
    selections = [],
  }: FakeSegmentationViewInput = {}) {
    super();
    this.setData({ classes, instances, selections }, false);
  }

  setData(
    {
      classes = [],
      instances = [],
      selections = [],
    }: FakeSegmentationViewInput,
    dispatch = true,
  ): void {
    this.classes = new Map(classes.map((item) => [item.id, item]));
    this.instances = new Map(instances.map((item) => [item.id, item]));
    this.selections = new Map(selections.map((item) => [item.id, item]));
    this.data = new FakeLabelIndex({
      classes: () => this.iterLabelClasses(),
      instances: () => this.iterLabelInstances(),
      selections: () => this.iterLabelSelections(),
    });
    if (dispatch) (this as any).dispatchEvent({ type: "afterload" });
  }

  iterLabelClasses() {
    return this.classes.values();
  }
  iterLabelInstances() {
    return this.instances.values();
  }
  iterLabelSelections() {
    return this.selections.values();
  }
  getLabelClass(id: number) {
    return this.classes.get(id);
  }
  hasLabelInstance(id: string) {
    return this.instances.has(id);
  }
  getLabelInstance(id: string) {
    return this.instances.get(id);
  }
  hasLabelSelection(id: string) {
    return this.selections.has(id);
  }
  getLabelSelection(id: string) {
    return this.selections.get(id);
  }

  async addLabelInstance(params: any): Promise<any> {
    const instance = {
      id: this.#nextInstanceId,
      gtClassId: params.gtClassId ?? null,
      gtClass: this.getLabelClass(params.gtClassId) ?? null,
      isBlack: params.isBlack ?? false,
    };
    this.instances.set(instance.id, instance);
    this.calls.push(["addLabelInstance", params]);
    (this as any).dispatchEvent({ type: "afterload" });
    return instance;
  }

  async updateLabelInstanceGtClass(
    instance: any,
    labelClass: any,
  ): Promise<void> {
    instance.gtClassId = labelClass?.id ?? null;
    instance.gtClass = labelClass ?? null;
    this.calls.push(["updateLabelInstanceGtClass", instance, labelClass]);
  }

  async updateLabelInstanceIsBlack(instance: any, value: any): Promise<void> {
    instance.isBlack = value;
    this.calls.push(["updateLabelInstanceIsBlack", instance, value]);
  }

  async updateLabelSelectionParentInstance(
    selection: any,
    instance: any,
  ): Promise<void> {
    selection.entityId = instance?.id ?? null;
    selection.entity = instance ?? null;
    this.calls.push([
      "updateLabelSelectionParentInstance",
      selection,
      instance,
    ]);
  }

  async updateLabelSelectionPerceivedClass(
    selection: any,
    labelClass: any,
  ): Promise<void> {
    selection.perceivedClassId = labelClass?.id ?? null;
    selection.perceivedClass = labelClass ?? null;
    this.calls.push([
      "updateLabelSelectionPerceivedClass",
      selection,
      labelClass,
    ]);
  }

  async updateLabelSelectionDistinctiveLv(
    selection: any,
    value: any,
  ): Promise<void> {
    selection.distinctiveLv = value;
    this.calls.push(["updateLabelSelectionDistinctiveLv", selection, value]);
  }

  async updateLabelSelectionOcclusionLv(
    selection: any,
    value: any,
  ): Promise<void> {
    selection.occlusionLv = value;
    this.calls.push(["updateLabelSelectionOcclusionLv", selection, value]);
  }
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("segmentation inspector coordinators", () => {
  it("preserves placeholder IDs in segmentation inspector input", () => {
    const selectionId = new Placeholder<string>();
    const instanceId = new Placeholder<string>();

    const selectionClone = cloneLabelSelectionInspectorInputtedData({
      selection: { selectionId },
      relations: {
        instanceSelect: { instanceId },
        classSelect: { classId: null },
      },
      descriptors: {
        distinctiveLv: SegmentationDistinctiveLevel.Satisfactory,
        occlusionLv: SegmentationOcclusionLevel.Poor,
      },
    });
    const instanceClone = cloneLabelInstanceInspectorInputtedData({
      selection: { instanceId },
      relations: { classSelect: { classId: null } },
    });

    expect(selectionClone.selection?.selectionId).toBe(selectionId);
    expect(selectionClone.relations?.instanceSelect.instanceId).toBe(
      instanceId,
    );
    expect(selectionClone.descriptors?.distinctiveLv).toBe(
      SegmentationDistinctiveLevel.Satisfactory,
    );
    expect(selectionClone.descriptors?.occlusionLv).toBe(
      SegmentationOcclusionLevel.Poor,
    );
    expect(instanceClone.selection?.instanceId).toBe(instanceId);
  });

  it("keeps segmentation instance selection, editing, creation, and reload clearing wired through React panes", async () => {
    const instance = {
      id: INSTANCE_ID,
      gtClassId: 1,
      gtClass: CLASS_CAR,
      isBlack: false,
    };
    const labelsView = new FakeSegmentationView({
      classes: [CLASS_CAR, CLASS_PEDESTRIAN],
      instances: [instance],
    });
    let inspector!: LabelInstanceInspectorHandle;
    const events: unknown[] = [];

    const dom = document.createElement("div");
    const root = createRoot(dom);

    await act(async () => {
      root.render(
        <LabelInstanceInspectorHookHost
          labelsView={labelsView as unknown as SegmentationInspectorLabelsView}
          onInspector={(value) => {
            inspector = value;
          }}
        />,
      );
    });
    expectNativeTweakpaneInspector(dom);
    expect(dom.querySelector('input[role="combobox"]')).not.toBeNull();
    document.body.appendChild(dom);
    inspector.addEventListener("select-instance", (event) =>
      events.push(event.value),
    );
    await flush();

    expectActionButtonTooltip(dom, "+", "Add Instance");

    const instanceSelect = findSelectByOptionText(dom, "T{");
    expect(instanceSelect).toBeTruthy();
    await selectOption(instanceSelect!, "T{");

    expect(inspector.selectedId).toBe(INSTANCE_ID);
    expect(events.at(-1)).toBe(instance);
    expectActionButtonTooltip(dom, "+", "Clone Instance");

    const classSelect = findSelectByRowLabel(dom, "Object Class");
    expect(classSelect).toBeTruthy();
    await selectOption(classSelect!, "Pedestrian");

    expect(instance.gtClassId).toBe(2);
    expect(
      labelsView.calls.some(([name]) => name === "updateLabelInstanceGtClass"),
    ).toBe(true);
    expect(inspector.getInstanceParams()).toEqual({
      gtClassId: 2,
      isBlack: false,
    });

    await act(async () => {
      inspector.clickCreateInstance();
    });
    expect(inspector.selectedId).toBe("88888888-8888-4888-8888-888888888888");
    expect(events.at(-1)).toBe(
      labelsView.getLabelInstance(inspector.selectedId as string),
    );

    await act(async () => {
      labelsView.setData({
        classes: [CLASS_CAR, CLASS_PEDESTRIAN],
        instances: [],
      });
    });
    expect(inspector.selectedId).toBe(null);
    expect(events.at(-1)).toBe(null);

    await act(async () => {
      root.unmount();
    });
    expect(dom.innerHTML).toBe("");
  });

  it("keeps segmentation selection class edits, draw toggles, and reload clearing wired through React panes", async () => {
    const instance = {
      id: INSTANCE_ID,
      gtClassId: 1,
      gtClass: CLASS_CAR,
      isBlack: false,
    };
    const otherInstance = {
      id: OTHER_INSTANCE_ID,
      gtClassId: 2,
      gtClass: CLASS_PEDESTRIAN,
      isBlack: false,
    };
    const selection = {
      id: SELECTION_ID,
      entityId: INSTANCE_ID,
      entity: instance,
      perceivedClassId: 1,
      perceivedClass: CLASS_CAR,
      distinctiveLv: SegmentationDistinctiveLevel.Excellent,
      occlusionLv: SegmentationOcclusionLevel.Unknown,
    };
    const labelsView = new FakeSegmentationView({
      classes: [CLASS_CAR, CLASS_PEDESTRIAN],
      instances: [instance, otherInstance],
      selections: [selection],
    });
    let inspector!: LabelSelectionInspectorHandle;
    const selectionEvents: unknown[] = [];
    const toggles: boolean[] = [];

    const dom = document.createElement("div");
    const root = createRoot(dom);

    await act(async () => {
      root.render(
        <LabelSelectionInspectorHookHost
          labelsView={labelsView as unknown as SegmentationInspectorLabelsView}
          onInspector={(value) => {
            inspector = value;
          }}
        />,
      );
    });
    expectNativeTweakpaneInspector(dom);
    expect(
      dom.querySelector('input[placeholder="(New selection)"]'),
    ).not.toBeNull();
    expect(
      dom.querySelector('input[placeholder="(No instance selected)"]'),
    ).not.toBeNull();
    expect(findSelectByRowLabel(dom, "Object Class")).toBeTruthy();
    document.body.appendChild(dom);
    inspector.addEventListener("select-selection", (event) =>
      selectionEvents.push(event.value),
    );
    inspector.addEventListener("toggle-drawSelection", (event) =>
      toggles.push(event.drawSelectionActive),
    );
    await flush();

    expectActionButtonTooltip(dom, "D", "Toggle Draw Mode");

    const selectionSelect = findSelectByOptionText(dom, "B{");
    expect(selectionSelect).toBeTruthy();
    await selectOption(selectionSelect!, "B{");

    expect(inspector.selectedId).toBe(SELECTION_ID);
    expect(selectionEvents.at(-1)).toBe(selection);

    await act(async () => {
      inspector.clickDrawSelection();
    });
    expect(toggles).toEqual([true]);

    const classSelect = findSelectByRowLabel(dom, "Object Class");
    expect(classSelect).toBeTruthy();
    await selectOption(classSelect!, "Pedestrian");

    expect(selection.perceivedClassId).toBe(2);
    expect(
      labelsView.calls.some(
        ([name]) => name === "updateLabelSelectionPerceivedClass",
      ),
    ).toBe(true);
    expect(inspector.getSelectionParams()).toMatchObject({
      entityId: INSTANCE_ID,
      perceivedClassId: 2,
    });

    await act(async () => {
      inspector.autoInstances = true;
    });
    const relationshipInstanceSelect = dom.querySelector<HTMLInputElement>(
      'input[placeholder="(No instance selected)"]',
    );
    expect(relationshipInstanceSelect).toBeTruthy();
    await act(async () =>
      relationshipInstanceSelect!.dispatchEvent(
        new FocusEvent("focusin", { bubbles: true }),
      ),
    );
    const relationshipInstanceOption = [
      ...document.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    ].find((option) => option.textContent?.includes("Pedestrian"));
    expect(relationshipInstanceOption?.textContent).toContain("Pedestrian");
    await act(async () => relationshipInstanceOption!.click());
    expect(selection.entityId).toBe(OTHER_INSTANCE_ID);
    expect(selection.entity).toBe(otherInstance);
    expect(
      labelsView.calls.some(
        ([name, changedSelection, changedInstance]) =>
          name === "updateLabelSelectionParentInstance" &&
          changedSelection === selection &&
          changedInstance === otherInstance,
      ),
    ).toBe(true);
    expect(findSelectByRowLabel(dom, "Object Class")).toBeTruthy();

    await act(async () => {
      labelsView.setData({
        classes: [CLASS_CAR, CLASS_PEDESTRIAN],
        instances: [instance, otherInstance],
        selections: [],
      });
    });
    expect(inspector.selectedId).toBe(null);
    expect(selectionEvents.at(-1)).toBe(null);

    await act(async () => {
      root.unmount();
    });
    expect(dom.innerHTML).toBe("");
  });
});

describe("segmentation inspector stale-selection sequence (delete versus edit)", () => {
  function makeSelection(): any {
    return {
      id: SELECTION_ID,
      entityId: INSTANCE_ID,
      entity: { id: INSTANCE_ID },
      perceivedClassId: 1,
      perceivedClass: CLASS_CAR,
      distinctiveLv: SegmentationDistinctiveLevel.Excellent,
      occlusionLv: SegmentationOcclusionLevel.Unknown,
    };
  }

  function makeLabelsView(selection: any): FakeSegmentationView {
    const instance = {
      id: INSTANCE_ID,
      gtClassId: 1,
      gtClass: CLASS_CAR,
      isBlack: false,
    };
    const otherInstance = {
      id: OTHER_INSTANCE_ID,
      gtClassId: 2,
      gtClass: CLASS_PEDESTRIAN,
      isBlack: false,
    };
    return new FakeSegmentationView({
      classes: [CLASS_CAR, CLASS_PEDESTRIAN],
      instances: [instance, otherInstance],
      selections: [selection],
    });
  }

  // The same stale-selection sequence, table-driven across each inspector
  // mutation route: select a selection, delete it out-of-band, then fire
  // the input change a control captured while it still existed.
  const mutations: [string, (input: unknown) => void, string][] = [
    [
      "perceived class",
      (input) => {
        (input as any).relations.classSelect.classId = 2;
      },
      "updateLabelSelectionPerceivedClass",
    ],
    [
      "instance reassignment",
      (input) => {
        (input as any).relations.instanceSelect.instanceId = OTHER_INSTANCE_ID;
      },
      "updateLabelSelectionParentInstance",
    ],
    [
      "occlusion descriptor",
      (input) => {
        (input as any).descriptors.occlusionLv =
          SegmentationOcclusionLevel.Poor;
      },
      "updateLabelSelectionOcclusionLv",
    ],
    [
      "distinctiveness descriptor",
      (input) => {
        (input as any).descriptors.distinctiveLv =
          SegmentationDistinctiveLevel.Poor;
      },
      "updateLabelSelectionDistinctiveLv",
    ],
  ];

  it.each(mutations)(
    "a stale %s after the selected selection was deleted is a no-op",
    async (_name, mutate, callName) => {
      const selection = makeSelection();
      const labelsView = makeLabelsView(selection);
      const inspector = new LabelSelectionInspector({
        labelsView: labelsView as unknown as SegmentationInspectorLabelsView,
      });

      // The same input applied while the selection exists mutates exactly
      // once...
      inspector.selectedId = SELECTION_ID;
      let input = getLabelSelectionInspectorPaneParams(
        labelsView as unknown as SegmentationInspectorLabelsView,
        selection,
        false,
        true,
        false,
      ).inputtedData;
      mutate(input);
      inspector.onInputChange(input);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(
        labelsView.calls.filter(([called]) => called === callName),
      ).to.have.length(1);
      labelsView.calls.length = 0;

      // ...but once the selection is deleted, the identical stale input from
      // a control captured earlier neither throws nor reaches the view.
      labelsView.selections.delete(SELECTION_ID);
      input = getLabelSelectionInspectorPaneParams(
        labelsView as unknown as SegmentationInspectorLabelsView,
        selection,
        false,
        true,
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

  it("edits apply again once undo restores the deleted selection under its id", async () => {
    const selection = makeSelection();
    const labelsView = makeLabelsView(selection);
    const inspector = new LabelSelectionInspector({
      labelsView: labelsView as unknown as SegmentationInspectorLabelsView,
    });
    inspector.selectedId = SELECTION_ID;

    // Delete, then a stale edit goes nowhere (no reload cleared the id).
    labelsView.selections.delete(SELECTION_ID);
    let input = getLabelSelectionInspectorPaneParams(
      labelsView as unknown as SegmentationInspectorLabelsView,
      selection,
      false,
      true,
      false,
    ).inputtedData;
    (input as any).relations.classSelect.classId = 2;
    inspector.onInputChange(input);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(labelsView.calls).to.have.length(0);

    // Undo of the delete restores the selection under the same id as a
    // new instance; a fresh edit must target the restored label.
    const restored = makeSelection();
    labelsView.selections.set(SELECTION_ID, restored);
    input = getLabelSelectionInspectorPaneParams(
      labelsView as unknown as SegmentationInspectorLabelsView,
      restored,
      false,
      true,
      false,
    ).inputtedData;
    (input as any).relations.classSelect.classId = 2;
    inspector.onInputChange(input);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      labelsView.calls.filter(
        ([called, target]) =>
          called === "updateLabelSelectionPerceivedClass" &&
          target === restored,
      ),
    ).to.have.length(1);

    inspector.dispose();
  });
});
