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

import { LabelVectorInspectorPaneView } from "../../../../app/editor/scene/widgets/LabelVectorInspector.react.tsx";
import {
  LabelVectorInspector,
  getLabelVectorInspectorPaneParams,
} from "../../../../app/editor/scene/widgets/LabelVectorInspector.tsx";
import type {
  LabelVectorInspectorHandle,
  VectorInspectorLabelsView,
} from "../../../../app/editor/scene/widgets/LabelVectorInspector.tsx";
import { cloneLabelVectorInspectorInputtedData } from "../../../../app/editor/scene/widgets/LabelVectorInspectorPane.ts";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const CLASS_CAR = { id: 1, name: "Car" };
const CLASS_PEDESTRIAN = { id: 2, name: "Pedestrian" };
const VECTOR_ID = "33333333-3333-4333-8333-333333333333";

function findSelectByOptionText(
  dom: HTMLElement,
  text: string,
): HTMLSelectElement | undefined {
  return [...dom.querySelectorAll("select")].find((select) =>
    [...select.options].some((option) => option.textContent?.includes(text)),
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

async function flush(): Promise<void> {
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

function LabelVectorInspectorHost({
  inspector,
}: {
  inspector: LabelVectorInspectorHandle;
}): JSX.Element {
  const paneState = usePaneState({
    eventType: "change",
    getPaneParams: () =>
      getLabelVectorInspectorPaneParams(
        inspector.labelsView,
        inspector.selectedVector,
        inspector.disabled,
        inspector.drawVectorActive,
      ),
    inputChangePolicy: "optimistic",
    onInputChange: inspector.onInputChange,
    source: inspector,
  });
  return (
    <LabelVectorInspectorPaneView
      {...paneState}
      onPaneEvent={inspector.onPaneEvent}
    />
  );
}

// The vector inspector is owned by its interaction context at runtime; the
// test constructs it directly (mirroring the context) and disposes it on
// unmount, the way the context disposal does.
function LabelVectorInspectorHookHost({
  labelsView,
  onInspector,
}: {
  labelsView: VectorInspectorLabelsView;
  onInspector: (inspector: LabelVectorInspectorHandle) => void;
}): JSX.Element {
  const inspector = useMemo(
    () => new LabelVectorInspector({ labelsView }),
    [labelsView],
  );
  useEffect(() => (): void => inspector.dispose(), [inspector]);
  useLayoutEffect(() => onInspector(inspector), [inspector, onInspector]);
  return <LabelVectorInspectorHost inspector={inspector} />;
}

interface FakeLabelIndexIterators {
  classes: () => IterableIterator<unknown>;
  vectors?: () => IterableIterator<unknown>;
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
  iterLabelVectors(): IterableIterator<unknown> {
    return this.#iterators.vectors?.() ?? [][Symbol.iterator]();
  }
}

class FakeVectorView extends VanillaEventDispatcher {
  data: FakeLabelIndex;
  classes = new Map<number, any>();
  vectors = new Map<string, any>();
  calls: [string, ...unknown[]][] = [];

  constructor({
    classes = [],
    vectors = [],
  }: { classes?: any[]; vectors?: any[] } = {}) {
    super();
    this.setData({ classes, vectors }, false);
  }

  setData(
    { classes = [], vectors = [] }: { classes?: any[]; vectors?: any[] } = {},
    dispatch = true,
  ): void {
    this.classes = new Map(classes.map((item) => [item.id, item]));
    this.vectors = new Map(vectors.map((item) => [item.id, item]));
    this.data = new FakeLabelIndex({
      classes: () => this.iterLabelClasses(),
      vectors: () => this.iterLabelVectors(),
    });
    if (dispatch) (this as any).dispatchEvent({ type: "afterload" });
  }

  iterLabelClasses() {
    return this.classes.values();
  }
  iterLabelVectors() {
    return this.vectors.values();
  }
  getLabelClass(id: number) {
    return this.classes.get(id);
  }
  hasLabelVector(id: string) {
    return this.vectors.has(id);
  }
  getLabelVector(id: string) {
    return this.vectors.get(id);
  }

  async updateLabelVectorGtClass(vector: any, labelClass: any): Promise<void> {
    vector.gtClassId = labelClass?.id ?? null;
    vector.gtClass = labelClass ?? null;
    this.calls.push(["updateLabelVectorGtClass", vector, labelClass]);
  }
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("vector inspector coordinators", () => {
  it("preserves placeholder IDs while cloning locally-created vector inspector input", () => {
    const vectorId = new Placeholder<string>();
    const inputtedData = {
      selection: { vectorId },
      relations: { classSelect: { classId: 1 } },
    };

    const cloned = cloneLabelVectorInspectorInputtedData(inputtedData);

    expect(cloned).not.toBe(inputtedData);
    expect(cloned.selection).not.toBe(inputtedData.selection);
    expect(cloned.selection.vectorId).toBe(vectorId);
  });

  it("keeps vector selection, class edits, draw toggles, and reload clearing wired through React panes", async () => {
    const vector = { id: VECTOR_ID, gtClassId: 1, gtClass: CLASS_CAR };
    const labelsView = new FakeVectorView({
      classes: [CLASS_CAR, CLASS_PEDESTRIAN],
      vectors: [vector],
    });
    let inspector!: LabelVectorInspectorHandle;
    const events: unknown[] = [];
    const toggles: boolean[] = [];

    const dom = document.createElement("div");
    const root = createRoot(dom);

    await act(async () => {
      root.render(
        <LabelVectorInspectorHookHost
          labelsView={labelsView as unknown as VectorInspectorLabelsView}
          onInspector={(value) => {
            inspector = value;
          }}
        />,
      );
    });
    expectNativeTweakpaneInspector(dom);
    document.body.appendChild(dom);
    inspector.addEventListener("select-vector", (event) =>
      events.push(event.value),
    );
    inspector.addEventListener("toggle-drawVector", (event) =>
      toggles.push(event.drawVectorActive),
    );
    await flush();

    expectActionButtonTooltip(dom, "D", "Toggle Draw Mode");

    const vectorSelect = findSelectByOptionText(dom, "P{");
    expect(vectorSelect).toBeTruthy();
    await selectOption(vectorSelect!, "P{");

    expect(inspector.selectedId).toBe(VECTOR_ID);
    expect(events.at(-1)).toBe(vector);

    await act(async () => {
      inspector.clickDrawVector();
    });
    expect(toggles).toEqual([true]);

    const classSelect = findSelectByOptionText(dom, "Pedestrian");
    expect(classSelect).toBeTruthy();
    await selectOption(classSelect!, "Pedestrian");

    expect(vector.gtClassId).toBe(2);
    expect(
      labelsView.calls.some(([name]) => name === "updateLabelVectorGtClass"),
    ).toBe(true);
    expect(inspector.getVectorParams()).toEqual({ gtClassId: 2 });

    await act(async () => {
      labelsView.setData({
        classes: [CLASS_CAR, CLASS_PEDESTRIAN],
        vectors: [],
      });
    });
    expect(inspector.selectedId).toBe(null);
    expect(events.at(-1)).toBe(null);

    await act(async () => {
      root.unmount();
    });
    expect(dom.innerHTML).toBe("");
  });
});

describe("vector inspector stale-selection sequence (delete versus edit)", () => {
  function makeVector(): any {
    return { id: VECTOR_ID, gtClassId: 1, gtClass: CLASS_CAR };
  }

  // The same stale-selection sequence, table-driven across the stale-edit
  // outcomes: select a vector, delete it out-of-band, then fire the input
  // change a control captured while the vector still existed.
  it.each([
    ["stale", true],
    ["live", false],
  ] as [string, boolean][])(
    "a class edit fired after the selected vector was deleted (%s control)",
    async (_label, deleted) => {
      const vector = makeVector();
      const labelsView = new FakeVectorView({
        classes: [CLASS_CAR, CLASS_PEDESTRIAN],
        vectors: [vector],
      });
      const inspector = new LabelVectorInspector({
        labelsView: labelsView as unknown as VectorInspectorLabelsView,
      });
      inspector.selectedId = VECTOR_ID;

      if (deleted) labelsView.vectors.delete(VECTOR_ID);

      const input = getLabelVectorInspectorPaneParams(
        labelsView as unknown as VectorInspectorLabelsView,
        vector,
        false,
        false,
      ).inputtedData;
      (input as any).relations.classSelect.classId = 2;
      inspector.onInputChange(input);
      await new Promise((resolve) => setTimeout(resolve, 0));

      if (deleted) {
        // The deleted vector's stale control neither throws nor mutates.
        expect(labelsView.calls).to.have.length(0);
      } else {
        // The live control still applies exactly once.
        expect(
          labelsView.calls.filter(
            ([name]) => name === "updateLabelVectorGtClass",
          ),
        ).to.have.length(1);
        expect(vector.gtClassId).toBe(2);
      }

      inspector.dispose();
    },
  );

  it("edits apply again once undo restores the deleted vector under its id", async () => {
    const vector = makeVector();
    const labelsView = new FakeVectorView({
      classes: [CLASS_CAR, CLASS_PEDESTRIAN],
      vectors: [vector],
    });
    const inspector = new LabelVectorInspector({
      labelsView: labelsView as unknown as VectorInspectorLabelsView,
    });
    inspector.selectedId = VECTOR_ID;

    // Delete, then a stale edit goes nowhere (no reload cleared the id).
    labelsView.vectors.delete(VECTOR_ID);
    let input = getLabelVectorInspectorPaneParams(
      labelsView as unknown as VectorInspectorLabelsView,
      vector,
      false,
      false,
    ).inputtedData;
    (input as any).relations.classSelect.classId = 2;
    inspector.onInputChange(input);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(labelsView.calls).to.have.length(0);

    // Undo of the delete restores the vector under the same id as a new
    // instance; a fresh edit must target the restored label.
    const restored = makeVector();
    labelsView.vectors.set(VECTOR_ID, restored);
    input = getLabelVectorInspectorPaneParams(
      labelsView as unknown as VectorInspectorLabelsView,
      restored,
      false,
      false,
    ).inputtedData;
    (input as any).relations.classSelect.classId = 2;
    inspector.onInputChange(input);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      labelsView.calls.filter(
        ([name, target]) =>
          name === "updateLabelVectorGtClass" && target === restored,
      ),
    ).to.have.length(1);

    inspector.dispose();
  });
});
