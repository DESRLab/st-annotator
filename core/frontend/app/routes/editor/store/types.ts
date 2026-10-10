import type { ReactNode } from "react";

import type { CoordBounds } from "sta/common";

import type { HistoryItem } from "../labelset";
import type { LayerControlsSection } from "../scene/layer/LayerControlsContent.react.tsx";

/**
 * Plain description of a selectable entity (id + display label), used for
 * navigation lists and any option lists rendered from the snapshot.
 */
export interface SelectableItem {
  readonly id: number;
  readonly name: string;
}

/**
 * The dataset-position state: which project / task / source group / label
 * branch / frame the editor is currently on.
 */
export interface NavigationSlice {
  /** The id of the project the editor was opened for. */
  readonly projectId: number;
  /** The available tasks and the selected one. */
  readonly task: {
    readonly items: readonly SelectableItem[];
    readonly currentId: number | null;
  };
  /** The available source groups and the selected one. */
  readonly sourceGroup: {
    readonly items: readonly SelectableItem[];
    readonly currentId: number | null;
  };
  /** The available label branches and the selected one. */
  readonly labelBranch: {
    readonly items: readonly SelectableItem[];
    readonly currentId: number | null;
  };
  /** The frames of the current task and the displayed one. */
  readonly frames: {
    readonly byId: ReadonlyMap<number, NavigationFrame>;
    readonly ids: readonly number[];
    readonly activeId: number | null;
  };
  /** `true` while a navigation operation is in progress. */
  readonly isNavigating: boolean;
  /** The spatial/temporal bounds of the selected frame, if any. */
  readonly bounds: {
    readonly x: CoordBounds | null;
    readonly y: CoordBounds | null;
    readonly z: CoordBounds | null;
    readonly t: CoordBounds | null;
  } | null;
}

/** Plain snapshot of a frame for navigation purposes. */
export interface NavigationFrame {
  readonly id: number;
  readonly isComplete: boolean;
}

/**
 * The version-control state of the selected label branch.
 */
export interface LabelsetSlice {
  /** The id of the branch being edited, or `null` if none. */
  readonly branchId: number | null;
  /** The commit history, oldest first; the current commit has `isCurrent`. */
  readonly history: readonly HistoryItem[];
  /** `true` if there are local changes not yet saved. */
  readonly hasUnsavedChanges: boolean;
  /** `true` while a save is in progress. */
  readonly isSaving: boolean;
  /** The ids of the branches with unsaved changes. */
  readonly unsavedBranchIds: ReadonlySet<number>;
}

/** Plain descriptor of a layer (what it is, not how the user configured it). */
export interface LayerMetadata {
  readonly key: string;
  readonly name: string;
  readonly kind: "source" | "label";
}

/**
 * The narrow subscription source required to render the React-owned controls
 * of a single layer.
 */
export interface LayerControlsSource {
  readonly controlsSections: readonly LayerControlsSection[] | null;
  readonly controlsView: ReactNode;
  addEventListener(eventType: "controls-change", listener: () => void): void;
  removeEventListener(eventType: "controls-change", listener: () => void): void;
}

/**
 * The opaque per-layer React views produced by the imperative layer models.
 *
 * These values are carried through the snapshot as opaque elements (they are
 * rendered, never inspected), alongside the plain layer metadata.
 */
export interface LayerViewSlots {
  readonly actionsView: ReactNode;
  readonly toolsView: ReactNode;
  readonly prefsView: ReactNode;
  readonly objectTreeView: ReactNode;
  readonly controls: LayerControlsSource;
}

/**
 * The structural layer state: which layers exist and their order.
 *
 * Plugin domain slices are merged into `layers` alongside these fields (see
 * {@link EditorState}); the user's interaction with layers lives under
 * `ui.layers` instead.
 */
export interface LayersDomainSlice {
  readonly metadata: ReadonlyMap<string, LayerMetadata>;
  readonly order: readonly string[];
  readonly views: ReadonlyMap<string, LayerViewSlots>;
}

/** The user's interaction state for a single layer. */
export interface LayerUiState {
  readonly active: boolean;
  readonly enabled: boolean;
}

/**
 * Cross-cutting, shell-owned UI state.
 */
export interface UiSlice {
  /** Per-layer interaction state, keyed by layer key. */
  readonly layers: ReadonlyMap<string, LayerUiState>;
  /** The key of the active layer, or `null` if none. */
  readonly activeLayerKey: string | null;
  /** The hint shown at the top of the editor, if any. */
  readonly hint: ReactNode;
}

/**
 * The full plain read model of the editor.
 *
 * `TPluginSlices` merges the per-plugin domain + UI slices into `layers`
 * (e.g. `layers.myPlugin`). It is filled in by the composition root (the
 * editor route) from the layer types contributed by the plugin registrations.
 */
export interface EditorState<TPluginSlices extends {} = {}> {
  readonly navigation: NavigationSlice;
  readonly labelset: LabelsetSlice;
  readonly layers: LayersDomainSlice & TPluginSlices;
  readonly ui: UiSlice;
}
