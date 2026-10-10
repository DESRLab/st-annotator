import { describe, expect, it } from "vitest";

import type { EditorState } from "../../../../../app/routes/editor";

import { createEditorMapper } from "../../../../../app/routes/editor/store/mapEditorState";
import type { EditorMapperCounters } from "../../../../../app/routes/editor/store/mapEditorState";

function mockTask(id: number, name: string) {
  return { id, name };
}

function mockBranch(id: number, name: string) {
  return {
    id,
    name,
    hasUnsavedChanges: false,
    isUpdating: false,
    getHistory: () => [],
  };
}

interface TestSlice {
  tag: string;
  version: number;
}

interface TestPluginSlices {
  "label-a": TestSlice;
  "label-b": TestSlice;
}

/** A layer that contributes a plugin slice; counts how often it is mapped. */
function createContributorLayer(name: string, tag: string) {
  let mapCalls = 0;
  return {
    name,
    state: { enabled: true },
    get mapCalls() {
      return mapCalls;
    },
    mapEditorSlice(previous: TestSlice | null): TestSlice {
      mapCalls += 1;
      return { tag, version: (previous?.version ?? 0) + 1 };
    },
    subscribeEditorSlice(listener: () => void): () => void {
      return (): void => {};
    },
  };
}

function createMockRuntime(
  overrides: {
    tasks?: unknown[];
    frames?: { id: number; is_complete: boolean }[];
    currentFrameId?: number | null;
    labelEntries?: { key: string; layer: unknown }[];
    labelDataLayers?: unknown[];
    activeLayer?: unknown;
    hintText?: unknown;
  } = {},
) {
  const tasks = overrides.tasks ?? [mockTask(1, "Task 1")];
  const frames = overrides.frames ?? [{ id: 10, is_complete: true }];
  const labelEntries = overrides.labelEntries ?? [];
  const branch = mockBranch(100, "main");
  return {
    context: {
      tasks: { elements: tasks },
      sourceGroups: { elements: [] },
      labelBranches: { elements: [branch] },
      frames: { elements: frames },
      currentTaskId: 1,
      currentSourceGroupId: null,
      currentLabelBranchId: 100,
      currentFrameId: overrides.currentFrameId ?? 10,
      currentFrame: { id: overrides.currentFrameId ?? 10 },
      currentLabelBranch: branch,
      isNavigating: false,
      currentXBounds: null,
      currentYBounds: null,
      currentZBounds: null,
      currentTBounds: null,
      views: { projectId: 5 },
    },
    layers: {
      layerEntries: labelEntries,
      labelDataLayers: overrides.labelDataLayers ?? [],
      activeLayer: overrides.activeLayer ?? null,
    },
    app: { hintText: overrides.hintText ?? null },
  };
}

function createCounters(): EditorMapperCounters {
  return { navigation: 0, labelset: 0, layers: 0, hint: 0, plugins: {} };
}

describe("createEditorMapper", () => {
  it("maps the navigation slice", () => {
    const runtime = createMockRuntime();
    const counters = createCounters();
    const map = createEditorMapper(runtime as never, counters);

    const state = map();
    expect(state.navigation.projectId).toBe(5);
    expect(state.navigation.task.items).toEqual([{ id: 1, name: "Task 1" }]);
    expect(state.navigation.task.currentId).toBe(1);
    expect(state.navigation.frames.ids).toEqual([10]);
    expect(state.navigation.frames.byId.get(10)).toEqual({
      id: 10,
      isComplete: true,
    });
    expect(state.navigation.frames.activeId).toBe(10);
    expect(state.navigation.isNavigating).toBe(false);
  });

  it("maps the labelset slice", () => {
    const runtime = createMockRuntime();
    const counters = createCounters();
    const map = createEditorMapper(runtime as never, counters);

    const state = map();
    expect(state.labelset.branchId).toBe(100);
    expect(state.labelset.hasUnsavedChanges).toBe(false);
    expect(state.labelset.isSaving).toBe(false);
    expect(state.labelset.history).toEqual([]);
    expect(state.labelset.unsavedBranchIds).toEqual(new Set<number>());
  });

  it("marks branches with unsaved changes in the labelset slice", () => {
    const runtime = createMockRuntime();
    (
      runtime.context.currentLabelBranch as ReturnType<typeof mockBranch>
    ).hasUnsavedChanges = true;
    const counters = createCounters();
    const map = createEditorMapper(runtime as never, counters);

    const state = map();
    expect(state.labelset.hasUnsavedChanges).toBe(true);
    expect(state.labelset.unsavedBranchIds).toEqual(new Set([100]));
  });

  it("rebuilds the unsaved-branch indicators for non-current branches on labelset counter changes", () => {
    // The current branch is 100; branch 200 is dirty in the background
    // (e.g. a save racing a branch switch settles on it later).
    const runtime = createMockRuntime();
    const otherBranch = mockBranch(200, "other");
    otherBranch.hasUnsavedChanges = true;
    runtime.context.labelBranches.elements = [
      runtime.context.labelBranches.elements[0],
      otherBranch,
    ];
    const counters = createCounters();
    const map = createEditorMapper(runtime as never, counters);

    const first = map();
    expect(first.labelset.branchId).toBe(100);
    expect(first.labelset.unsavedBranchIds).toEqual(new Set([200]));

    // Without a counter change the cached slice stays stale, even though
    // the background branch settled.
    otherBranch.hasUnsavedChanges = false;
    const unchanged = map();
    expect(unchanged.labelset).toBe(first.labelset);
    expect(unchanged.labelset.unsavedBranchIds).toEqual(new Set([200]));

    // The wiring bumps the labelset counter on `edit-branch`, which the
    // settled save dispatches for EVERY branch, not only the current one.
    counters.labelset += 1;
    const second = map();
    expect(second.labelset).not.toBe(first.labelset);
    expect(second.labelset.branchId).toBe(100);
    expect(second.labelset.unsavedBranchIds).toEqual(new Set());
    // The other slices keep their references.
    expect(second.navigation).toBe(first.navigation);
    expect(second.layers).toBe(first.layers);
    expect(second.ui).toBe(first.ui);
  });

  it("maps the layers domain and ui slices", () => {
    const labelLayer = {
      name: "Label A",
      state: { enabled: true },
      actionsView: "label-a-actions",
    };
    const sourceLayer = {
      name: "Source A",
      state: { enabled: false },
      actionsView: "source-a-actions",
    };
    const runtime = createMockRuntime({
      labelEntries: [
        { key: "source-a", layer: sourceLayer },
        { key: "label-a", layer: labelLayer },
      ],
      labelDataLayers: [labelLayer],
      activeLayer: labelLayer,
      hintText: "hint",
    });
    const counters = createCounters();
    const map = createEditorMapper(runtime as never, counters);

    const state = map();
    expect(state.layers.order).toEqual(["source-a", "label-a"]);
    expect(state.layers.metadata.get("label-a")).toEqual({
      key: "label-a",
      name: "Label A",
      kind: "label",
    });
    expect(state.layers.metadata.get("source-a")).toEqual({
      key: "source-a",
      name: "Source A",
      kind: "source",
    });
    expect(state.layers.views.get("label-a")?.actionsView).toBe(
      "label-a-actions",
    );
    expect(state.layers.views.get("source-a")?.actionsView).toBe(
      "source-a-actions",
    );
    expect(state.layers.views.get("label-a")?.controls).toBe(labelLayer);
    expect(state.ui.activeLayerKey).toBe("label-a");
    expect(state.ui.layers.get("label-a")).toEqual({
      active: true,
      enabled: true,
    });
    expect(state.ui.layers.get("source-a")).toEqual({
      active: false,
      enabled: false,
    });
    expect(state.ui.hint).toBe("hint");
  });

  it("reuses unchanged slice references across mappings (structural sharing)", () => {
    const runtime = createMockRuntime();
    const counters = createCounters();
    const map = createEditorMapper(runtime as never, counters);

    const first = map();
    const second = map();
    expect(second.navigation).toBe(first.navigation);
    expect(second.labelset).toBe(first.labelset);
    expect(second.layers).toBe(first.layers);
    expect(second.ui).toBe(first.ui);
  });

  it("rebuilds only the layers/ui slices when the layers counter changes", () => {
    const runtime = createMockRuntime();
    const counters = createCounters();
    const map = createEditorMapper(runtime as never, counters);

    const first = map();
    counters.layers += 1;
    const second = map();

    expect(second.navigation).toBe(first.navigation);
    expect(second.labelset).toBe(first.labelset);
    expect(second.layers).not.toBe(first.layers);
    expect(second.ui).not.toBe(first.ui);
  });

  it("rebuilds only the labelset slice when the labelset counter changes", () => {
    const runtime = createMockRuntime();
    const counters = createCounters();
    const map = createEditorMapper(runtime as never, counters);

    const first = map();
    counters.labelset += 1;
    const second = map();

    expect(second.navigation).toBe(first.navigation);
    expect(second.labelset).not.toBe(first.labelset);
    expect(second.layers).toBe(first.layers);
    expect(second.ui).toBe(first.ui);
  });

  it("rebuilds only the navigation slice when a frame changes in place (edit-frame)", () => {
    const runtime = createMockRuntime();
    const counters = createCounters();
    const map = createEditorMapper(runtime as never, counters);

    const first = map();
    // The frames index array reference is stable; only the frame's
    // is_complete flips. The navigation counter breaks the fingerprint.
    (
      runtime.context.frames.elements[0] as { is_complete: boolean }
    ).is_complete = false;
    counters.navigation += 1;
    const second = map();

    expect(second.navigation).not.toBe(first.navigation);
    expect(second.navigation.frames.byId.get(10)?.isComplete).toBe(false);
    expect(second.labelset).toBe(first.labelset);
    expect(second.layers).toBe(first.layers);
    expect(second.ui).toBe(first.ui);
  });

  it("merges plugin slices contributed by layers", () => {
    const labelLayerA = createContributorLayer("Label A", "label-a");
    const labelLayerB = createContributorLayer("Label B", "label-b");
    const plainLayer = { name: "Source A", state: { enabled: true } };
    const runtime = createMockRuntime({
      labelEntries: [
        { key: "source-a", layer: plainLayer },
        { key: "label-a", layer: labelLayerA },
        { key: "label-b", layer: labelLayerB },
      ],
      labelDataLayers: [labelLayerA, labelLayerB],
    });
    const counters = createCounters();
    const map = createEditorMapper(
      runtime as never,
      counters,
    ) as () => EditorState<TestPluginSlices>;

    const state = map();
    expect(state.layers["label-a"]).toEqual({ tag: "label-a", version: 1 });
    expect(state.layers["label-b"]).toEqual({ tag: "label-b", version: 1 });
    expect("source-a" in state.layers).toBe(false);
    // The domain fields survive the merge.
    expect(state.layers.order).toEqual(["source-a", "label-a", "label-b"]);
    expect(labelLayerA.mapCalls).toBe(1);
    expect(labelLayerB.mapCalls).toBe(1);
  });

  it("rebuilds only the plugin slice whose counter changed", () => {
    const labelLayerA = createContributorLayer("Label A", "label-a");
    const labelLayerB = createContributorLayer("Label B", "label-b");
    const runtime = createMockRuntime({
      labelEntries: [
        { key: "label-a", layer: labelLayerA },
        { key: "label-b", layer: labelLayerB },
      ],
      labelDataLayers: [labelLayerA, labelLayerB],
    });
    const counters = createCounters();
    const map = createEditorMapper(
      runtime as never,
      counters,
    ) as () => EditorState<TestPluginSlices>;

    const first = map();
    counters.plugins["label-a"] = 1;
    const second = map();

    expect(second.navigation).toBe(first.navigation);
    expect(second.labelset).toBe(first.labelset);
    expect(second.ui).toBe(first.ui);
    // The merged layers object is rebuilt, but only the changed plugin
    // slice is remapped; the domain fields keep their references.
    expect(second.layers).not.toBe(first.layers);
    expect(second.layers.metadata).toBe(first.layers.metadata);
    expect(second.layers.order).toBe(first.layers.order);
    expect(second.layers.views).toBe(first.layers.views);
    expect(second.layers["label-a"]).not.toBe(first.layers["label-a"]);
    expect(second.layers["label-a"]).toEqual({
      tag: "label-a",
      version: 2,
    });
    expect(second.layers["label-b"]).toBe(first.layers["label-b"]);
    expect(labelLayerA.mapCalls).toBe(2);
    expect(labelLayerB.mapCalls).toBe(1);
  });
});
