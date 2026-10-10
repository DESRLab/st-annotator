import { useCallback, useRef, useSyncExternalStore } from "react";

import type { WindowMapper } from "../scene";
import type { LayerCollection } from "../scene/layer";

export type ExternalStoreSubscribe = (listener: () => void) => () => void;

// The layer controls source now lives with the editor state schema; the
// re-export keeps existing `sta/app/editor` consumers working.
export type { LayerControlsSource } from "../store/types";

/**
 * Subscribes React to an imperative editor model without duplicating its state.
 *
 * Editor stores are notify-only, they hold no cached snapshot, so a version
 * counter advanced by each notification is the `useSyncExternalStore`
 * snapshot; reads of the model happen during render after each version change.
 *
 * @param subscribeToSource
 */
export function useExternalStoreVersion(
  subscribeToSource: ExternalStoreSubscribe,
): number {
  const versionRef = useRef(0);
  const subscribe = useCallback(
    (onStoreChange: () => void): (() => void) =>
      subscribeToSource(() => {
        versionRef.current += 1;
        onStoreChange();
      }),
    [subscribeToSource],
  );
  return useSyncExternalStore(subscribe, () => versionRef.current);
}

/**
 * Subscribes a listener to the layer-collection events that change the
 * layers/UI slices of the editor state (layer activation and per-layer
 * enable/disable).
 */
export function subscribeToLayerCollection<WM extends WindowMapper>(
  layers: LayerCollection<WM>,
  listener: () => void,
): () => void {
  const layerStates = layers.allLayers.map((layer) => layer.state);
  layers.addEventListener("layer-activate", listener);
  for (const state of layerStates) state.addEventListener("change", listener);

  return (): void => {
    for (const state of layerStates)
      state.removeEventListener("change", listener);
    layers.removeEventListener("layer-activate", listener);
  };
}
