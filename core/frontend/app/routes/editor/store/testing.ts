import { createEditorStore } from "./createEditorStore";
import type { MutableEditorStore } from "./createEditorStore";
import type { EditorIntents } from "./intents";
import type {
  EditorState,
  LabelsetSlice,
  LayersDomainSlice,
  LayerViewSlots,
  NavigationSlice,
  UiSlice,
} from "./types";

/** No-op controls source for fixture layers. */
function createFixtureControls(): LayerViewSlots["controls"] {
  return {
    controlsSections: null,
    controlsView: null,
    addEventListener(): void {},
    removeEventListener(): void {},
  };
}

/** Empty view slots for fixture layers. */
function createFixtureViewSlots(): LayerViewSlots {
  return {
    actionsView: null,
    toolsView: null,
    prefsView: null,
    objectTreeView: null,
    controls: createFixtureControls(),
  };
}

function createFixtureNavigation(): NavigationSlice {
  return {
    projectId: 1,
    task: {
      items: [
        { id: 1, name: "E2E SemanticKITTI Annotation" },
        { id: 2, name: "E2E SemanticKITTI Review" },
      ],
      currentId: 1,
    },
    sourceGroup: {
      items: [{ id: 1, name: "SemanticKITTI" }],
      currentId: 1,
    },
    labelBranch: {
      items: [{ id: 1, name: "main" }],
      currentId: 1,
    },
    frames: {
      byId: new Map([
        [1, { id: 1, isComplete: true }],
        [2, { id: 2, isComplete: false }],
      ]),
      ids: [1, 2],
      activeId: 1,
    },
    isNavigating: false,
    bounds: null,
  };
}

function createFixtureLabelset(): LabelsetSlice {
  return {
    branchId: 1,
    history: [],
    hasUnsavedChanges: false,
    isSaving: false,
    unsavedBranchIds: new Set<number>(),
  };
}

/** One fixture layer of {@link createEditorStateFixture}. */
export interface FixtureLayerDescriptor {
  key: string;
  name: string;
  kind: "source" | "label";
}

// Deliberately plugin-agnostic; plugin tests pass their own descriptors.
const DEFAULT_FIXTURE_LAYER_DESCRIPTORS: readonly FixtureLayerDescriptor[] = [
  { key: "source", name: "Source Layer", kind: "source" },
  { key: "label", name: "Label Layer", kind: "label" },
];

function createFixtureLayers(
  descriptors: readonly FixtureLayerDescriptor[],
): LayersDomainSlice {
  const metadata = new Map(
    descriptors.map((descriptor) => [descriptor.key, descriptor]),
  );
  const views = new Map(
    descriptors.map((descriptor) => [descriptor.key, createFixtureViewSlots()]),
  );
  return {
    metadata,
    order: descriptors.map((descriptor) => descriptor.key),
    views,
  };
}

function createFixtureUi(
  descriptors: readonly FixtureLayerDescriptor[],
): UiSlice {
  const activeKey =
    descriptors.find((descriptor) => descriptor.kind === "label")?.key ??
    descriptors.at(0)?.key ??
    null;
  return {
    layers: new Map(
      descriptors.map((descriptor) => [
        descriptor.key,
        { active: descriptor.key === activeKey, enabled: true },
      ]),
    ),
    activeLayerKey: activeKey,
    hint: null,
  };
}

/**
 * Builds a complete plain {@link EditorState} fixture.
 *
 * The defaults mimic the with-data e2e seed (SemanticKITTI project/task/branch
 * names) with one generic source and one label layer; pass `layerDescriptors`
 * to model a specific layer set. Each slice is shallow-merged over its
 * default, so callers override only the slice fields they care about.
 */
export function createEditorStateFixture(
  overrides: {
    navigation?: Partial<NavigationSlice>;
    labelset?: Partial<LabelsetSlice>;
    layers?: Partial<LayersDomainSlice>;
    ui?: Partial<UiSlice>;
    layerDescriptors?: readonly FixtureLayerDescriptor[];
  } = {},
): EditorState {
  const descriptors =
    overrides.layerDescriptors ?? DEFAULT_FIXTURE_LAYER_DESCRIPTORS;
  return {
    navigation: { ...createFixtureNavigation(), ...overrides.navigation },
    labelset: { ...createFixtureLabelset(), ...overrides.labelset },
    layers: { ...createFixtureLayers(descriptors), ...overrides.layers },
    ui: { ...createFixtureUi(descriptors), ...overrides.ui },
  };
}

export interface MockEditorStore {
  /** The store to pass to `EditorStoreProvider`. */
  readonly store: MutableEditorStore<EditorState>;
  /** Replaces the snapshot and notifies subscribers. */
  setState(next: EditorState): void;
}

/**
 * Creates an editor store backed by a plain fixture snapshot for unit tests.
 *
 * The snapshot is whatever the test supplies (usually from
 * {@link createEditorStateFixture}); {@link MockEditorStore.setState} swaps it
 * and invalidates, exactly as the route wiring does on model notifications.
 */
export function createMockEditorStore(initial: EditorState): MockEditorStore {
  let state = initial;
  const store = createEditorStore<EditorState>(() => state);
  return {
    store,
    setState(next: EditorState): void {
      state = next;
      store.invalidate();
    },
  };
}

/** Intents that do nothing; tests override the members they assert against. */
export const noopEditorIntents: EditorIntents = {
  activateLayer(): void {},
  setLayerEnabled(): void {},
  setAllLayersEnabled(): void {},
  setTask(): void {},
  setSourceGroup(): void {},
  setLabelBranch(): void {},
  setFrameStatus(): void {},
  saveLabelset(): void {},
  rebaseLabelset(): void {},
};
