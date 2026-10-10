/**
 * A read-only external store of the editor's plain state snapshot, compatible
 * with `useSyncExternalStore`.
 */
export interface EditorStore<TState> {
  subscribe(listener: () => void): () => void;
  getSnapshot(): TState;
}

/**
 * An {@link EditorStore} whose owner can invalidate the cached snapshot and
 * notify subscribers.
 */
export interface MutableEditorStore<TState> extends EditorStore<TState> {
  /** Marks the snapshot stale and notifies all subscribers. */
  invalidate(): void;
  /** Detaches all subscribers. Do not use the store afterwards. */
  dispose(): void;
}

/**
 * Creates a store that lazily maps the editor's plain state snapshot.
 *
 * The snapshot is rebuilt only after {@link MutableEditorStore.invalidate}
 * and then cached, so `getSnapshot` returns a stable reference between
 * invalidations (as `useSyncExternalStore` requires). The mapper receives
 * the previous snapshot so it can reuse unchanged sub-references (structural
 * sharing), keeping memoized consumers and selector equality checks stable.
 *
 * @param map Builds the snapshot, given the previous one (or `null`).
 */
export function createEditorStore<TState>(
  map: (previous: TState | null) => TState,
): MutableEditorStore<TState> {
  let snapshot: TState | null = null;
  let dirty = true;
  const listeners = new Set<() => void>();

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },

    getSnapshot(): TState {
      if (dirty || snapshot == null) {
        snapshot = map(snapshot);
        dirty = false;
      }
      return snapshot;
    },

    invalidate(): void {
      dirty = true;
      for (const listener of [...listeners]) {
        listener();
      }
    },

    dispose(): void {
      listeners.clear();
    },
  };
}
