import { isEditorSliceContributor } from "../index";
import type {
  EditorSliceContributor,
  EditorState,
  LabelsetSlice,
  LayerMetadata,
  LayersDomainSlice,
  LayerViewSlots,
  NavigationFrame,
  NavigationSlice,
  SelectableItem,
  UiSlice,
} from "../index";
import type { EditorRuntime } from "../runtime";

/**
 * Per-source invalidation counters maintained by the store wiring and read by
 * the mapper to reuse unchanged slices (structural sharing).
 *
 * `navigation` is memoized primarily by reference fingerprints of the
 * navigator indexes (stable until rebuilt); the `navigation` counter covers
 * in-place index-content changes the references cannot see (frame status
 * edits, relayed as `edit-frame`).
 */
export interface EditorMapperCounters {
  /** Bumped when frame contents change in place (`edit-frame`). */
  navigation: number;
  /** Bumped when the label branch history / save state changes. */
  labelset: number;
  /** Bumped on layer activation or enable/disable. */
  layers: number;
  /** Bumped when the app hint changes. */
  hint: number;
  /** Bumped per plugin layer key when its contributed slice changes. */
  plugins: Record<string, number>;
}

/** The slice type contributed by a layer, if it is a slice contributor. */
type SliceOf<L> = L extends EditorSliceContributor<infer S> ? S : never;

/**
 * The plugin slices merged into `layers` by the composition root, derived
 * from which layers of the runtime implement {@link EditorSliceContributor}.
 */
export type EditorPluginSlices<R extends EditorRuntime = EditorRuntime> = {
  [
    K in keyof R["layersByKey"] as R["layersByKey"][K] extends EditorSliceContributor
      ? K
      : never
  ]: SliceOf<R["layersByKey"][K]>;
};

interface SliceCache<TKey, TSlice> {
  key: TKey | undefined;
  slice: TSlice | undefined;
}

function mapNavigation(runtime: EditorRuntime): NavigationSlice {
  const { context } = runtime;
  const tasks = context.tasks.elements;
  const sourceGroups = context.sourceGroups.elements;
  const labelBranches = context.labelBranches.elements;
  const frames = context.frames.elements;

  const taskItems: readonly SelectableItem[] = tasks.map((task) => ({
    id: task.id,
    name: task.name,
  }));
  const sourceGroupItems: readonly SelectableItem[] = sourceGroups.map(
    (group) => ({ id: group.id, name: group.name }),
  );
  const labelBranchItems: readonly SelectableItem[] = labelBranches.map(
    (branch) => ({ id: branch.id, name: branch.name }),
  );

  const frameById = new Map<number, NavigationFrame>();
  const frameIds: number[] = [];
  for (const frame of frames) {
    frameById.set(frame.id, {
      id: frame.id,
      isComplete: frame.is_complete,
    });
    frameIds.push(frame.id);
  }

  const hasFrame = context.currentFrame != null;

  return {
    projectId: context.views.projectId ?? 0,
    task: { items: taskItems, currentId: context.currentTaskId },
    sourceGroup: {
      items: sourceGroupItems,
      currentId: context.currentSourceGroupId,
    },
    labelBranch: {
      items: labelBranchItems,
      currentId: context.currentLabelBranchId,
    },
    frames: {
      byId: frameById,
      ids: frameIds,
      activeId: context.currentFrameId,
    },
    isNavigating: context.isNavigating,
    bounds: hasFrame
      ? {
          x: context.currentXBounds,
          y: context.currentYBounds,
          z: context.currentZBounds,
          t: context.currentTBounds,
        }
      : null,
  };
}

function mapLabelset(runtime: EditorRuntime): LabelsetSlice {
  const branch = runtime.context.currentLabelBranch;
  const unsavedBranchIds = new Set<number>();
  for (const candidate of runtime.context.labelBranches.elements) {
    if (candidate.hasUnsavedChanges) unsavedBranchIds.add(candidate.id);
  }
  return {
    branchId: branch?.id ?? null,
    history: branch?.getHistory() ?? [],
    hasUnsavedChanges: branch?.hasUnsavedChanges ?? false,
    isSaving: branch?.isUpdating ?? false,
    unsavedBranchIds,
  };
}

function mapLayersDomain(runtime: EditorRuntime): LayersDomainSlice {
  const layers = runtime.layers;
  const metadata = new Map<string, LayerMetadata>();
  const views = new Map<string, LayerViewSlots>();
  const order: string[] = [];
  for (const { key, layer } of layers.layerEntries) {
    const kind: LayerMetadata["kind"] = layers.labelDataLayers.some(
      (labelLayer) => labelLayer === layer,
    )
      ? "label"
      : "source";
    metadata.set(key, { key, name: layer.name, kind });
    views.set(key, {
      actionsView: layer.actionsView,
      toolsView: layer.toolsView,
      prefsView: layer.prefsView,
      objectTreeView: layer.objectTreeView,
      controls: layer,
    });
    order.push(key);
  }
  return { metadata, order, views };
}

function mapUi(runtime: EditorRuntime): UiSlice {
  const layers = runtime.layers;
  const activeLayer = layers.activeLayer;
  const layerUi = new Map<string, { active: boolean; enabled: boolean }>();
  let activeLayerKey: string | null = null;
  for (const { key, layer } of layers.layerEntries) {
    const isActive = layer === activeLayer;
    if (isActive) activeLayerKey = key;
    layerUi.set(key, { active: isActive, enabled: layer.state.enabled });
  }
  return {
    layers: layerUi,
    activeLayerKey,
    hint: runtime.app.hintText,
  };
}

function sameKey(
  a: readonly unknown[] | undefined,
  b: readonly unknown[],
): boolean {
  if (a?.length !== b.length) return false;
  return b.every((value, index) => value === a[index]);
}

/**
 * Creates the editor state mapper.
 *
 * The returned function builds the plain {@link EditorState} snapshot from the
 * imperative runtime, reusing unchanged slices across calls so selector and
 * memo equality checks stay stable. Slice reuse is keyed by the
 * {@link EditorMapperCounters} (maintained by the store wiring) and, for
 * navigation, by the navigator index references.
 *
 * Layers implementing {@link EditorSliceContributor} merge their own plugin
 * slice into `layers` under their collection key (e.g. `layers.myPlugin`); each
 * plugin slice is rebuilt only when its per-key counter changes.
 */
export function createEditorMapper<R extends EditorRuntime>(
  runtime: R,
  counters: EditorMapperCounters,
): () => EditorState<EditorPluginSlices<R>> {
  const navCache: SliceCache<readonly unknown[], NavigationSlice> = {
    key: undefined,
    slice: undefined,
  };
  const labelsetCache: SliceCache<string, LabelsetSlice> = {
    key: undefined,
    slice: undefined,
  };
  const layersCache: SliceCache<number, LayersDomainSlice> = {
    key: undefined,
    slice: undefined,
  };
  const uiCache: SliceCache<string, UiSlice> = {
    key: undefined,
    slice: undefined,
  };
  const pluginCaches = new Map<string, { version: number; slice: unknown }>();
  let mergedLayersCache: {
    domain: LayersDomainSlice;
    pluginSlices: Map<string, unknown>;
    result: LayersDomainSlice & EditorPluginSlices<R>;
  } | null = null;

  return (): EditorState<EditorPluginSlices<R>> => {
    const { context } = runtime;

    // Navigation: fingerprint by the (stable-until-rebuilt) index arrays,
    // the scalar selection/navigation state, and the edit-frame counter
    // (frame contents can change in place without the arrays changing).
    const navKey: readonly unknown[] = [
      context.tasks.elements,
      context.sourceGroups.elements,
      context.labelBranches.elements,
      context.frames.elements,
      context.currentTaskId,
      context.currentSourceGroupId,
      context.currentLabelBranchId,
      context.currentFrameId,
      context.isNavigating,
      counters.navigation,
    ];
    let navigation = navCache.slice;
    if (navigation == null || !sameKey(navCache.key, navKey)) {
      navigation = mapNavigation(runtime);
      navCache.key = navKey;
      navCache.slice = navigation;
    }

    // Labelset: keyed by branch id + the wiring-maintained counter.
    const labelsetKey = `${context.currentLabelBranch?.id ?? "null"}:${counters.labelset}`;
    let labelset = labelsetCache.slice;
    if (labelset == null || labelsetCache.key !== labelsetKey) {
      labelset = mapLabelset(runtime);
      labelsetCache.key = labelsetKey;
      labelsetCache.slice = labelset;
    }

    // Layers domain: keyed by the layers counter (activation/enabled).
    let layersDomain = layersCache.slice;
    if (layersDomain == null || layersCache.key !== counters.layers) {
      layersDomain = mapLayersDomain(runtime);
      layersCache.key = counters.layers;
      layersCache.slice = layersDomain;
    }

    // UI: keyed by layers counter + hint counter.
    const uiKey = `${counters.layers}:${counters.hint}`;
    let ui = uiCache.slice;
    if (ui == null || uiCache.key !== uiKey) {
      ui = mapUi(runtime);
      uiCache.key = uiKey;
      uiCache.slice = ui;
    }

    // Plugin slices: each contributor layer maps its own slice, rebuilt only
    // when its per-key counter changes.
    const pluginSlices = new Map<string, unknown>();
    let layersChanged = mergedLayersCache?.domain !== layersDomain;
    for (const { key, layer } of runtime.layers.layerEntries) {
      if (!isEditorSliceContributor(layer)) continue;
      const version = counters.plugins[key] ?? 0;
      let pluginCache = pluginCaches.get(key);
      if (pluginCache?.version !== version) {
        pluginCache = {
          version,
          slice: layer.mapEditorSlice(pluginCache?.slice ?? null),
        };
        pluginCaches.set(key, pluginCache);
      }
      pluginSlices.set(key, pluginCache.slice);
      if (mergedLayersCache?.pluginSlices.get(key) !== pluginCache.slice)
        layersChanged = true;
    }

    let layers: LayersDomainSlice & EditorPluginSlices<R>;
    if (!layersChanged && mergedLayersCache != null) {
      layers = mergedLayersCache.result;
    } else {
      layers = {
        ...layersDomain,
        ...Object.fromEntries(pluginSlices),
      } as LayersDomainSlice & EditorPluginSlices<R>;
      mergedLayersCache = {
        domain: layersDomain,
        pluginSlices,
        result: layers,
      };
    }

    return {
      navigation,
      labelset,
      layers,
      ui,
    };
  };
}
