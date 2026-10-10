import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";

import type { EditorStore } from "./createEditorStore";
import type { EditorState } from "./types";

// The context carries the state type with plugin slices erased; the
// composition root supplies the concrete `EditorState<TPluginSlices>` and
// selectors narrow it again. `any` here is deliberate: it lets base
// components read the non-plugin slices fully typed without depending on the
// plugin packages (which depend on base, not the reverse).

const EditorStoreContext = createContext<EditorStore<EditorState<any>> | null>(
  null,
);

export interface EditorStoreProviderProps<TPluginSlices extends {} = {}> {
  store: EditorStore<EditorState<TPluginSlices>>;
  children?: ReactNode;
}

/** Provides the editor state store to the React tree. */
export function EditorStoreProvider<TPluginSlices extends {} = {}>({
  store,
  children,
}: EditorStoreProviderProps<TPluginSlices>): React.JSX.Element {
  return (
    <EditorStoreContext.Provider value={store as EditorStore<EditorState<any>>}>
      {children}
    </EditorStoreContext.Provider>
  );
}

export interface OptionalEditorStoreProviderProps<
  TPluginSlices extends {} = {},
> {
  store: EditorStore<EditorState<TPluginSlices>> | null;
  children?: ReactNode;
}

/**
 * Provides the editor state store when one exists, and `null` before the
 * runtime owns a store. The route wraps its WHOLE tree, including the
 * scene display and overlay host mounted before the runtime exists, in
 * this provider so the tree shape stays stable; store-reading components
 * (the layer overlay inspector containers) only mount once the store
 * exists.
 */
export function OptionalEditorStoreProvider<TPluginSlices extends {} = {}>({
  store,
  children,
}: OptionalEditorStoreProviderProps<TPluginSlices>): React.JSX.Element {
  return (
    <EditorStoreContext.Provider
      value={store as EditorStore<EditorState<any>> | null}
    >
      {children}
    </EditorStoreContext.Provider>
  );
}

/** Returns the editor state store provided by {@link EditorStoreProvider}. */
export function useEditorStore<TPluginSlices extends {} = {}>(): EditorStore<
  EditorState<TPluginSlices>
> {
  const store = useContext(EditorStoreContext) as EditorStore<
    EditorState<TPluginSlices>
  > | null;
  if (store == null) {
    throw new Error("useEditorStore must be used inside EditorStoreProvider");
  }
  return store;
}

/**
 * Reads a slice of the editor state snapshot, re-rendering only when the
 * selected value changes.
 *
 * The selector's result is memoized with `isEqual` (default
 * `Object.is`), so returning a structurally-shared slice reference avoids
 * spurious re-renders even when other parts of the snapshot change.
 *
 * TypeScript has no partial type-argument inference: when `TPluginSlices`
 * is passed explicitly, `TSelected` must be too (it otherwise falls back to
 * `unknown`). Plugin components should prefer the per-plugin selector hook
 * built with {@link createPluginSliceSelectorHook}, which infers it.
 *
 * @param selector Maps the snapshot to the value this component needs.
 * @param isEqual Compares consecutive selected values.
 */
export function useEditorSelector<
  TPluginSlices extends {} = {},
  TSelected = unknown,
>(
  selector: (state: EditorState<TPluginSlices>) => TSelected,
  isEqual: (a: TSelected, b: TSelected) => boolean = Object.is,
): TSelected {
  const store = useEditorStore<TPluginSlices>();

  // Keep the latest selector/comparator without destabilizing getSnapshot.
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const isEqualRef = useRef(isEqual);
  isEqualRef.current = isEqual;

  const cacheRef = useRef<{
    store: EditorStore<EditorState<TPluginSlices>> | null;
    hasValue: boolean;
    selected: TSelected;
  }>({ store: null, hasValue: false, selected: undefined as TSelected });

  const subscribe = useCallback(
    (onStoreChange: () => void): (() => void) => store.subscribe(onStoreChange),
    [store],
  );

  const getSnapshot = useCallback((): TSelected => {
    const cache = cacheRef.current;
    if (cache.store !== store) {
      cacheRef.current = {
        store,
        hasValue: false,
        selected: undefined as TSelected,
      };
    }
    const next = selectorRef.current(store.getSnapshot());
    const current = cacheRef.current;
    if (current.hasValue && isEqualRef.current(current.selected, next)) {
      return current.selected;
    }
    cacheRef.current = { store, hasValue: true, selected: next };
    return next;
  }, [store]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Creates a selector hook for one plugin slice of the editor state.
 *
 * TypeScript has no partial type-argument inference, so a plugin component
 * cannot spell `useEditorSelector<ItsSlices>` while keeping the selected
 * value inferred. Each plugin builds its own hook once at module scope and
 * then selects from its slice with full inference:
 *
 * ```ts
 * export const useMyPluginSelector = createPluginSliceSelectorHook<'myPlugin', MyPluginSlice>('myPlugin');
 * ```
 *
 * @param key The layer key the plugin slice is merged under.
 */
export function createPluginSliceSelectorHook<TKey extends string, TSlice>(
  key: TKey,
): <TSelected>(
  selector: (slice: TSlice) => TSelected,
  isEqual?: (a: TSelected, b: TSelected) => boolean,
) => TSelected {
  return function usePluginSliceSelector<TSelected>(
    selector: (slice: TSlice) => TSelected,
    isEqual?: (a: TSelected, b: TSelected) => boolean,
  ): TSelected {
    return useEditorSelector<Record<TKey, TSlice>, TSelected>(
      (state) => selector(state.layers[key]),
      isEqual,
    );
  };
}
