import { useEffect, useMemo } from "react";

import {
  createEditorStore,
  isEditorSliceContributor,
  subscribeToLayerCollection,
} from "../index";
import type { EditorState, MutableEditorStore } from "../index";
import type { EditorRuntime } from "../runtime";

import { createEditorMapper } from "./mapEditorState";
import type {
  EditorMapperCounters,
  EditorPluginSlices,
} from "./mapEditorState";

/** Event types on the scene context that change navigation state. */
const NAVIGATION_EVENTS = [
  "nav-frame",
  "nav-source-group",
  "nav-label-branch",
  "isNavigating-changed",
  "edit-frame",
  "edit-branch",
] as const;

/**
 * Creates and maintains the editor state store for the lifetime of a runtime.
 *
 * The store lazily maps the imperative runtime into a plain
 * {@link EditorState} snapshot. This hook wires the mapper's invalidation
 * counters to the runtime's event sources:
 * - navigation is re-fingerprinted from the navigator indexes on context
 *   navigation events;
 * - the labelset slice is invalidated on branch `afterchange` (and when the
 *   branch itself changes);
 * - the layers/UI slices are invalidated on layer activation and enable/disable;
 * - the UI hint is invalidated on the app's `hint-change`;
 * - each plugin slice is invalidated through its layer's `subscribeEditorSlice`
 *   subscription (see `EditorSliceContributor`).
 *
 * Returns `null` while there is no runtime.
 */
export function useEditorStoreRuntime(
  runtime: EditorRuntime | null,
): MutableEditorStore<EditorState<EditorPluginSlices>> | null {
  const bundle = useMemo(() => {
    if (runtime == null) return null;
    const counters: EditorMapperCounters = {
      navigation: 0,
      labelset: 0,
      layers: 0,
      hint: 0,
      plugins: {},
    };
    const store = createEditorStore(createEditorMapper(runtime, counters));
    return { counters, store };
  }, [runtime]);

  useEffect(() => {
    if (runtime == null || bundle == null) return undefined;

    const { counters, store } = bundle;
    const invalidate = (): void => store.invalidate();

    // Navigation: the mapper re-derives the slice from the navigator
    // index references, so a plain invalidation suffices, except for
    // `edit-frame`, where frame contents change in place (frame status)
    // and the navigation counter must break the reference fingerprint.
    // `edit-branch` also bumps the labelset counter: it fires for EVERY
    // branch (e.g. a background save settling on a branch the user
    // navigated away from), not only the one the labelset listeners
    // currently follow.
    const navListeners = NAVIGATION_EVENTS.map((eventType) => {
      const listener = (): void => {
        if (eventType === "edit-frame") counters.navigation += 1;
        if (eventType === "edit-branch") counters.labelset += 1;
        invalidate();
      };
      runtime.context.addEventListener(eventType, listener);
      return () => runtime.context.removeEventListener(eventType, listener);
    });

    // Layers: activation and enable/disable change the layers/UI slices.
    const disposeLayers = subscribeToLayerCollection(runtime.layers, () => {
      counters.layers += 1;
      invalidate();
    });

    // Plugin slices: each contributor layer reports its own changes.
    const pluginDisposers: (() => void)[] = [];
    for (const { key, layer } of runtime.layers.layerEntries) {
      if (!isEditorSliceContributor(layer)) continue;
      pluginDisposers.push(
        layer.subscribeEditorSlice(() => {
          counters.plugins[key] = (counters.plugins[key] ?? 0) + 1;
          invalidate();
        }),
      );
    }

    // Hint.
    const hintListener = (): void => {
      counters.hint += 1;
      invalidate();
    };
    runtime.app.addEventListener("hint-change", hintListener);

    // Labelset: follow the current branch, invalidating on its changes and
    // re-subscribing whenever the selected branch changes. Both
    // `beforechange` and `afterchange` matter: the former flips `isSaving`
    // when an update starts, the latter settles the saved state.
    let branch = runtime.context.currentLabelBranch;
    const labelsetListener = (): void => {
      counters.labelset += 1;
      invalidate();
    };
    branch?.addEventListener("beforechange", labelsetListener);
    branch?.addEventListener("afterchange", labelsetListener);
    const branchListener = (): void => {
      branch?.removeEventListener("beforechange", labelsetListener);
      branch?.removeEventListener("afterchange", labelsetListener);
      branch = runtime.context.currentLabelBranch;
      branch?.addEventListener("beforechange", labelsetListener);
      branch?.addEventListener("afterchange", labelsetListener);
      counters.labelset += 1;
      invalidate();
    };
    runtime.context.addEventListener("nav-label-branch", branchListener);

    return (): void => {
      runtime.context.removeEventListener("nav-label-branch", branchListener);
      branch?.removeEventListener("beforechange", labelsetListener);
      branch?.removeEventListener("afterchange", labelsetListener);
      runtime.app.removeEventListener("hint-change", hintListener);
      for (const dispose of pluginDisposers) dispose();
      disposeLayers();
      for (const dispose of navListeners) dispose();
      store.dispose();
    };
  }, [bundle, runtime]);

  return bundle?.store ?? null;
}
