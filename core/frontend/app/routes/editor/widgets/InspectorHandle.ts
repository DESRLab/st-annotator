import type { PaneControllerDataTypes } from "./pane";

export type InspectorEventType<TEventMap extends object> = Extract<
  keyof TEventMap,
  string
>;

export type InspectorEvent<
  TEventMap extends object,
  TType extends InspectorEventType<TEventMap>,
> = Readonly<{ type: TType } & TEventMap[TType]>;

export type InspectorEventListener<
  TEventMap extends object,
  TType extends InspectorEventType<TEventMap>,
> = (event: InspectorEvent<TEventMap, TType>) => void;

/** Event interface implemented by React-backed inspector handles. */
export interface InspectorEventSource<TEventMap extends object> {
  addEventListener<TType extends InspectorEventType<TEventMap>>(
    type: TType,
    listener: InspectorEventListener<TEventMap, TType>,
  ): void;
  removeEventListener<TType extends InspectorEventType<TEventMap>>(
    type: TType,
    listener: InspectorEventListener<TEventMap, TType>,
  ): void;
}

/** Stable imperative boundary exposed by a React-owned inspector. */
export interface InspectorHandle<
  TParams extends PaneControllerDataTypes,
  TEventMap extends object,
> extends InspectorEventSource<TEventMap> {
  readonly paneParams: Pick<
    TParams,
    "inputtedData" | "internalData" | "settings"
  >;
  dispose(): void;
  onInputChange(inputtedData: TParams["inputtedData"]): void;
  onPaneEvent(event: { type: string }): void;
}

export interface InspectorEventBus<
  TEventMap extends object,
> extends InspectorEventSource<TEventMap> {
  clear(): void;
  dispatchEvent<TType extends InspectorEventType<TEventMap>>(
    event: InspectorEvent<TEventMap, TType>,
  ): void;
}

/** Creates the composable event transport used by React-backed inspector handles. */
export function createInspectorEventBus<
  TEventMap extends object,
>(): InspectorEventBus<TEventMap> {
  type EventType = InspectorEventType<TEventMap>;
  type Listener = InspectorEventListener<TEventMap, EventType>;
  const listeners = new Map<EventType, Set<Listener>>();

  return {
    addEventListener(type, listener): void {
      const listenersForType = listeners.get(type) ?? new Set();
      listenersForType.add(listener as unknown as Listener);
      listeners.set(type, listenersForType);
    },
    removeEventListener(type, listener): void {
      listeners.get(type)?.delete(listener as unknown as Listener);
    },
    dispatchEvent(event): void {
      for (const listener of listeners.get(event.type) ?? []) {
        listener(event);
      }
    },
    clear(): void {
      listeners.clear();
    },
  };
}
