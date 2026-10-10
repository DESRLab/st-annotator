import { useCallback, useRef, useState } from "react";

import type { PaneState, PaneStateParams } from "./usePaneState.react.ts";

export interface UseOptimisticPaneParamsOptions<
  TParams extends PaneStateParams,
> {
  /** The committed pane params mapped from the editor state snapshot. */
  committedParams: TParams;
  /** Forwards user input to the editor intents. */
  onInputChange: (inputtedData: TParams["inputtedData"]) => void;
}

/**
 * Layers an optimistic local draft over committed pane params selected from
 * the editor state store.
 *
 * The committed params (from `useEditorSelector`) are canonical; user input
 * is merged into a local draft before being forwarded, so the pane keeps
 * showing the input until the imperative write path round-trips through the
 * models and the snapshot re-maps it (or an outside change arrives). The
 * draft is dropped as soon as the committed params object changes identity:
 * the store rebuilds it whenever ANY committed field changes (values or
 * settings metadata such as `disabled`), so a pending draft can never
 * survive a disable/reload transition and overwrite later committed state.
 * This is the selector-side successor of the `'optimistic'` `usePaneState`
 * policy: pane drafts stay local React state and are never merged into the
 * snapshot.
 */
export function useOptimisticPaneParams<TParams extends PaneStateParams>({
  committedParams,
  onInputChange,
}: UseOptimisticPaneParamsOptions<TParams>): PaneState<TParams> {
  const [draft, setDraft] = useState<{
    base: TParams;
    data: TParams["inputtedData"];
  } | null>(null);

  const committedParamsRef = useRef(committedParams);
  committedParamsRef.current = committedParams;

  const onInputChangeRef = useRef(onInputChange);
  onInputChangeRef.current = onInputChange;

  // The committed state caught up with (or overtook) the draft; drop the
  // draft so the canonical value wins. Setting state during render is the
  // sanctioned derived-state pattern: React re-renders before commit.
  if (draft != null && draft.base !== committedParams) {
    setDraft(null);
  }

  const handleInputChange = useCallback(
    (inputtedData: TParams["inputtedData"]): void => {
      setDraft({ base: committedParamsRef.current, data: inputtedData });
      onInputChangeRef.current(inputtedData);
    },
    [],
  );

  const paneParams: TParams =
    draft == null
      ? committedParams
      : { ...committedParams, inputtedData: draft.data };

  return { onInputChange: handleInputChange, paneParams };
}
