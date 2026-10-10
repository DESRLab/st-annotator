/**
 * A helper type that indicates the data flow for a hosted pane definition.
 *
 * [Data flow]
 *
 * inputtedData  -----------------------
 *                                    \                    \
 * internalData  ----> computedData ------> PaneElement.render()
 *                                                         /
 * settings      -----------------------
 *
 * PaneElement.updateParams() --> inputtedData ---------------------
 *                \                                      \                                 \
 *                 \                  internalData ----> computedData ----> outputData
 *                  \                                                                      /
 *                   ---------------> settings -------------------------
 */
export interface PaneControllerDataTypes {
  inputtedData: {};
  computedData: unknown;
  settings: {};
  internalData: unknown;
  outputData: unknown;
}

/** Specifies the parameters passed to a hosted pane element. */
export type PaneElementParams<P extends PaneControllerDataTypes> = Pick<
  P,
  "inputtedData" | "computedData" | "settings"
>;

/**
 * Processes data for a hosted pane definition.
 *
 * Computed and output data are provided on demand and must not be used as
 * persistent pane state.
 */
export interface PaneControllerDataProcessor<
  P extends PaneControllerDataTypes,
> {
  /** Generates computed data for the pane. */
  computeData(
    inputtedData: Readonly<P["inputtedData"]>,
    internalData: Readonly<P["internalData"]>,
  ): Readonly<P["computedData"]>;

  /** Generates the pane output data. */
  outputData(paneParams: Readonly<PaneElementParams<P>>): P["outputData"];
}

/** Represents a user-driven output change event for a hosted pane definition. */
export interface PaneControllerChangeEvent<P extends PaneControllerDataTypes> {
  prevOutputData: P["outputData"];
  outputData: P["outputData"];
}

/** Defines the events emitted by a hosted pane definition. */
export interface PaneControllerEventMap<P extends PaneControllerDataTypes> {
  change: PaneControllerChangeEvent<P>;
}
