import { cloneDeepWith, isPlainObject } from "lodash";
import {
  default as React,
  useLayoutEffect,
  useRef,
  type JSX,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { Pane } from "tweakpane";

import type {
  PaneControllerDataProcessor,
  PaneControllerDataTypes,
  PaneElementFactory,
  PaneElementParams,
} from "./pane";
import type { PaneElement } from "./pane/PaneElement";
import { registerPlugins } from "./pane/PanePlugins";

export interface PaneChangeEvent<TOutputData, TInputtedData = unknown> {
  inputtedData: TInputtedData;
  outputData: TOutputData;
  prevOutputData: TOutputData;
}

/**
 * The externally-visible event objects of a pane, derived from its event map:
 * each event carries its name as `type` along with the mapped payload.
 */
export type PaneEventOf<
  TEventMap extends {},
  TKey extends Extract<keyof TEventMap, string> = Extract<
    keyof TEventMap,
    string
  >,
> = {
  [K in TKey]: { type: K } & TEventMap[K];
}[TKey];

/** A stable definition for a native Tweakpane element tree and its data processor. */
export interface TweakpanePaneDefinition<
  TParams extends PaneControllerDataTypes,
  TEventMap extends {} = {},
> {
  factory: PaneElementFactory<PaneElementParams<TParams>, TEventMap>;
  dataProcessor: PaneControllerDataProcessor<TParams>;
}

export function definePane<
  TParams extends PaneControllerDataTypes,
  TEventMap extends {} = {},
>(
  definition: TweakpanePaneDefinition<TParams, TEventMap>,
): TweakpanePaneDefinition<TParams, TEventMap> {
  return Object.freeze(definition);
}

export type TweakpanePaneParams<TParams extends PaneControllerDataTypes> = Pick<
  TParams,
  "inputtedData" | "settings"
> &
  Partial<Pick<TParams, "internalData">>;

export interface TweakpanePaneHostProps<
  TParams extends PaneControllerDataTypes,
  TChangeData = unknown,
  TEventMap extends {} = {},
> {
  definition:
    | TweakpanePaneDefinition<TParams, TEventMap>
    | ((
        slots: Readonly<Record<string, HTMLDivElement>>,
      ) => TweakpanePaneDefinition<TParams, TEventMap>);
  mapOutputChange?: (
    event: PaneChangeEvent<TParams["outputData"], TParams["inputtedData"]>,
  ) => TChangeData;
  onInputChange: (outputData: TChangeData) => void;
  onPaneEvent?: (event: PaneEventOf<TEventMap>) => void;
  paneEventTypes?: readonly Extract<keyof TEventMap, string>[];
  paneParams: TweakpanePaneParams<TParams>;
  slots?: Readonly<Record<string, React.ReactNode>>;
}

/** Allocates native Tweakpane slots and renders their React content. */
export function useTweakpaneSlots(
  slots: Readonly<Record<string, React.ReactNode>>,
): {
  elements: Readonly<Record<string, HTMLDivElement>>;
  portals: React.JSX.Element;
} {
  // Tweakpane uses insertion order to choose the initially selected tab.
  // Preserve the caller's order, as the former component-local hosts did.
  const slotNames = Object.keys(slots);
  const slotElementsRef = useRef<Record<string, HTMLDivElement>>({});
  for (const name of Object.keys(slotElementsRef.current)) {
    if (!Object.hasOwn(slots, name)) delete slotElementsRef.current[name];
  }
  for (const name of slotNames) {
    slotElementsRef.current[name] ??= document.createElement("div");
  }

  return {
    elements: slotElementsRef.current,
    portals: (
      <>
        {slotNames.map((name) =>
          createPortal(slots[name], slotElementsRef.current[name], name),
        )}
      </>
    ),
  };
}

interface NativeTweakpanePaneBindings<
  TParams extends PaneControllerDataTypes,
  TEventMap extends {},
> {
  // Tweakpane requires stable mutable bindings; React props remain canonical.
  inputtedData: TParams["inputtedData"];
  isRendering: boolean;
  pane: Pane;
  paneElement: PaneElement<PaneElementParams<TParams>, TEventMap>;
  settings: TParams["settings"];
}

export type NativeTweakpanePaneHostProps<
  TParams extends PaneControllerDataTypes,
  TChangeData,
  TEventMap extends {},
> = Omit<
  TweakpanePaneHostProps<TParams, TChangeData, TEventMap>,
  "definition"
> & {
  definition: TweakpanePaneDefinition<TParams, TEventMap>;
};

interface NativePaneEventTarget<TEventMap extends {}> {
  addEventListener<K extends Extract<keyof TEventMap, string>>(
    type: K,
    handler: (event: PaneEventOf<TEventMap>) => void,
  ): void;
  removeEventListener<K extends Extract<keyof TEventMap, string>>(
    type: K,
    handler: (event: PaneEventOf<TEventMap>) => void,
  ): void;
}

function assignPaneData<TData extends object>(
  target: TData,
  props: Partial<TData>,
): boolean {
  let updated = false;
  for (const [key, value] of Object.entries(props)) {
    if (key in target && value !== target[key as keyof TData]) {
      target[key as keyof TData] = value as TData[keyof TData];
      updated = true;
    }
  }
  return updated;
}

/** Clones editable pane records without corrupting domain objects with private state. */
function clonePaneData<TData>(value: TData): TData {
  return cloneDeepWith(value, (nestedValue) => {
    if (
      nestedValue != null &&
      typeof nestedValue === "object" &&
      !Array.isArray(nestedValue) &&
      (!isPlainObject(nestedValue) ||
        Object.values(nestedValue).some((entry) => typeof entry === "function"))
    ) {
      return nestedValue;
    }

    return undefined;
  });
}

function getNativePaneParams<
  TParams extends PaneControllerDataTypes,
  TEventMap extends {},
>(
  bindings: NativeTweakpanePaneBindings<TParams, TEventMap>,
  dataProcessor: PaneControllerDataProcessor<TParams>,
  paneParams: TweakpanePaneParams<TParams>,
): PaneElementParams<TParams> {
  return {
    inputtedData: bindings.inputtedData,
    computedData: dataProcessor.computeData(
      bindings.inputtedData,
      paneParams.internalData!,
    ),
    settings: bindings.settings,
  };
}

function renderNativePane<
  TParams extends PaneControllerDataTypes,
  TEventMap extends {},
>(
  bindings: NativeTweakpanePaneBindings<TParams, TEventMap>,
  dataProcessor: PaneControllerDataProcessor<TParams>,
  paneParams: TweakpanePaneParams<TParams>,
): void {
  bindings.isRendering = true;
  try {
    bindings.paneElement.render(
      getNativePaneParams(bindings, dataProcessor, paneParams),
    );
  } finally {
    bindings.isRendering = false;
  }
}

function reconcileNativePaneBindings<
  TParams extends PaneControllerDataTypes,
  TEventMap extends {},
>(
  bindings: NativeTweakpanePaneBindings<TParams, TEventMap>,
  paneParams: TweakpanePaneParams<TParams>,
  dataProcessor: PaneControllerDataProcessor<TParams>,
): void {
  assignPaneData(bindings.inputtedData, clonePaneData(paneParams.inputtedData));
  assignPaneData(bindings.settings, clonePaneData(paneParams.settings));
  renderNativePane(bindings, dataProcessor, paneParams);
}

function withPaneContext<
  TReturn,
  TParams extends PaneControllerDataTypes,
  TEventMap extends {},
>(
  definition: TweakpanePaneDefinition<TParams, TEventMap>,
  operation: string,
  run: () => TReturn,
): TReturn {
  try {
    return run();
  } catch (error) {
    console.error("Tweakpane operation failed", {
      operation,
      pane: definition.factory.debugContext,
    });
    throw error;
  }
}

/**
 * Hosts a native definition in a React effect while retaining Tweakpane's
 * generated markup and keeping React as the owner of its lifecycle.
 *
 */
export function useTweakpane<
  TParams extends PaneControllerDataTypes,
  TChangeData,
  TEventMap extends {},
>({
  definition,
  mapOutputChange,
  onInputChange,
  onPaneEvent,
  paneEventTypes = [],
  paneParams,
}: NativeTweakpanePaneHostProps<
  TParams,
  TChangeData,
  TEventMap
>): RefObject<HTMLDivElement | null> {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const bindingsRef = useRef<NativeTweakpanePaneBindings<
    TParams,
    TEventMap
  > | null>(null);
  const latestPaneParamsRef = useRef(paneParams);
  const lastOutputDataRef = useRef<TParams["outputData"] | null>(null);
  const callbacksRef = useRef({
    mapOutputChange,
    onInputChange,
    onPaneEvent,
  });
  const paneEventTypesKey = paneEventTypes.join("\u0000");
  callbacksRef.current = { mapOutputChange, onInputChange, onPaneEvent };
  latestPaneParamsRef.current = paneParams;

  useLayoutEffect((): void | (() => void) => {
    if (hostRef.current == null) return undefined;

    const pane = new Pane({ container: hostRef.current });
    registerPlugins(pane);
    const bindings: NativeTweakpanePaneBindings<TParams, TEventMap> = {
      inputtedData: clonePaneData(paneParams.inputtedData),
      isRendering: false,
      pane,
      paneElement: undefined as unknown as PaneElement<
        PaneElementParams<TParams>,
        TEventMap
      >,
      settings: clonePaneData(paneParams.settings),
    };
    bindings.paneElement = withPaneContext(definition, "attach", () =>
      definition.factory.attach(
        pane,
        getNativePaneParams(bindings, definition.dataProcessor, paneParams),
      ),
    );
    lastOutputDataRef.current = definition.dataProcessor.outputData(
      getNativePaneParams(bindings, definition.dataProcessor, paneParams),
    );
    bindingsRef.current = bindings;

    const handlePaneChange = (): void => {
      if (bindings.isRendering) return;

      const nextPaneParams = getNativePaneParams(
        bindings,
        definition.dataProcessor,
        latestPaneParamsRef.current,
      );
      withPaneContext(definition, "change", () => {
        bindings.paneElement.updateParams(nextPaneParams);
        renderNativePane(
          bindings,
          definition.dataProcessor,
          latestPaneParamsRef.current,
        );
      });

      const prevOutputData =
        lastOutputDataRef.current ??
        definition.dataProcessor.outputData(nextPaneParams);
      const outputData = definition.dataProcessor.outputData(
        getNativePaneParams(
          bindings,
          definition.dataProcessor,
          latestPaneParamsRef.current,
        ),
      );
      lastOutputDataRef.current = outputData;
      const event = {
        inputtedData: clonePaneData(nextPaneParams.inputtedData),
        outputData,
        prevOutputData,
      };
      const change =
        callbacksRef.current.mapOutputChange?.(event) ??
        (outputData as TChangeData);
      callbacksRef.current.onInputChange(change);
    };
    pane.on("change", handlePaneChange);

    const paneEventHandlers = paneEventTypes.map((type) => ({
      type,
      handler: (event: PaneEventOf<TEventMap>): void =>
        callbacksRef.current.onPaneEvent?.(event),
    }));
    const paneEventTarget: NativePaneEventTarget<TEventMap> =
      bindings.paneElement;
    for (const { type, handler } of paneEventHandlers) {
      paneEventTarget.addEventListener(type, handler);
    }

    return (): void => {
      for (const { type, handler } of paneEventHandlers) {
        paneEventTarget.removeEventListener(type, handler);
      }
      // PaneElement owns wrapper subscriptions and adapter state; Pane owns native blades.
      bindings.paneElement.dispose();
      pane.dispose();
      if (bindingsRef.current === bindings) bindingsRef.current = null;
      lastOutputDataRef.current = null;
    };
  }, [definition, paneEventTypesKey]);

  useLayoutEffect((): void => {
    const bindings = bindingsRef.current;
    if (bindings == null) return;

    withPaneContext(definition, "render", () =>
      reconcileNativePaneBindings(
        bindings,
        paneParams,
        definition.dataProcessor,
      ),
    );
    lastOutputDataRef.current = definition.dataProcessor.outputData(
      getNativePaneParams(bindings, definition.dataProcessor, paneParams),
    );
  }, [
    definition.dataProcessor,
    paneParams.inputtedData,
    paneParams.internalData,
    paneParams.settings,
  ]);

  return hostRef;
}

function NativeTweakpanePaneHost<
  TParams extends PaneControllerDataTypes,
  TChangeData,
  TEventMap extends {},
>(
  props: NativeTweakpanePaneHostProps<TParams, TChangeData, TEventMap>,
): JSX.Element {
  const hostRef = useTweakpane(props);
  return <div ref={hostRef} />;
}

/**
 * Hosts a native Tweakpane definition while React owns its lifecycle.
 *
 */
export function TweakpanePaneHost<
  TParams extends PaneControllerDataTypes,
  TChangeData = unknown,
  TEventMap extends {} = {},
>(props: TweakpanePaneHostProps<TParams, TChangeData, TEventMap>): JSX.Element {
  const slots = props.slots ?? {};
  const { elements: slotElements, portals } = useTweakpaneSlots(slots);
  const slotNamesKey = Object.keys(slots).join("\u0000");
  const definition = React.useMemo(
    () =>
      typeof props.definition === "function"
        ? props.definition(slotElements)
        : props.definition,
    [props.definition, slotElements, slotNamesKey],
  );

  return (
    <>
      <NativeTweakpanePaneHost {...props} definition={definition} />
      {portals}
    </>
  );
}
