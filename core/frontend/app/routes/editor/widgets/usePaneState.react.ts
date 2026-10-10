import { useCallback, useLayoutEffect, useRef, useState } from "react";

import type { PaneControllerDataTypes } from "./pane";
import { useSourceEventVersion } from "./useSourceEvent.react.ts";

/** Event registration surface required to synchronize a pane with its source. */
export interface PaneStateSource {
  addEventListener(eventType: string, listener: () => void): void;
  removeEventListener(eventType: string, listener: () => void): void;
}

/** The minimum pane parameter shape kept as a visible draft in React. */
export type PaneStateParams = Pick<
  PaneControllerDataTypes,
  "inputtedData" | "settings"
>;

/**
 * How {@link usePaneState} incorporates user input into the visible draft:
 * `'optimistic'` merges `inputtedData` into the draft before forwarding it to
 * the source; `'reread'` forwards it first, then re-reads the authoritative
 * params from the source.
 */
export type PaneInputChangePolicy = "optimistic" | "reread";

export interface UsePaneStateOptions<TParams extends PaneStateParams> {
  /** The event that notifies the source changed the pane params. */
  eventType: string;
  /** Reads the current pane params from the source. */
  getPaneParams: () => TParams;
  /** How user input updates the visible draft. */
  inputChangePolicy: PaneInputChangePolicy;
  /** Forwards user input to the source. */
  onInputChange: (inputtedData: TParams["inputtedData"]) => void;
  /** The source that owns the pane's domain state. */
  source: PaneStateSource;
}

export interface PaneState<TParams extends PaneStateParams> {
  onInputChange(inputtedData: TParams["inputtedData"]): void;
  paneParams: TParams;
}

/**
 * Keeps the visible pane draft in React while the source owns domain state.
 *
 * Source observation is routed through {@link useSourceEventVersion}, the
 * canonical editor bridge. The draft itself is React state by design: pane
 * input is applied optimistically before the source round-trips, which a
 * notify-only external store cannot express.
 */
export function usePaneState<TParams extends PaneStateParams>({
  eventType,
  getPaneParams,
  inputChangePolicy,
  onInputChange,
  source,
}: UsePaneStateOptions<TParams>): PaneState<TParams> {
  const [paneParams, setPaneParams] = useState(getPaneParams);

  const getPaneParamsRef = useRef(getPaneParams);
  getPaneParamsRef.current = getPaneParams;
  const onInputChangeRef = useRef(onInputChange);
  onInputChangeRef.current = onInputChange;

  const syncPaneParams = useCallback((): void => {
    setPaneParams(getPaneParamsRef.current());
  }, []);

  useSourceEventVersion(source, eventType, syncPaneParams);

  // Re-read immediately when the source (or its event) changes, so a
  // switched source never leaves the draft showing the previous one's data.
  useLayoutEffect(() => {
    syncPaneParams();
  }, [source, eventType, syncPaneParams]);

  const handleInputChange = useCallback(
    (inputtedData: TParams["inputtedData"]): void => {
      if (inputChangePolicy === "optimistic") {
        setPaneParams((previous) => ({ ...previous, inputtedData }));
        onInputChangeRef.current(inputtedData);
      } else {
        onInputChangeRef.current(inputtedData);
        setPaneParams(getPaneParamsRef.current());
      }
    },
    [inputChangePolicy],
  );

  return { onInputChange: handleInputChange, paneParams };
}
