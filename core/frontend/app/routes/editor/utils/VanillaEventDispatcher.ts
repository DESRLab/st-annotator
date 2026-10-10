/**
 * The minimal basic event that can be dispatched by a {@link VanillaEventDispatcher}.
 * Mirrors `THREE.BaseEvent` so the two dispatchers stay type-compatible.
 */
export interface BaseEvent<TEventType extends string = string> {
  readonly type: TEventType;
}

/**
 * The minimal expected contract of an event fired by a {@link VanillaEventDispatcher}.
 * Mirrors `THREE.Event`; `target` is the dispatcher during dispatch and `null` afterwards.
 */
export interface VanillaEvent<
  TEventType extends string = string,
  TTarget = unknown,
> {
  readonly type: TEventType;
  readonly target: TTarget;
}

/** Listener for events of a {@link VanillaEventDispatcher}, typed by event map entry. */
export type EventListener<TEventData, TEventType extends string, TTarget> = (
  event: TEventData & VanillaEvent<TEventType, TTarget>,
) => void;

/**
 * A three-free event dispatcher, behavior-compatible with `THREE.EventDispatcher`
 * (mrdoob/eventdispatcher.js): duplicate listeners are ignored, listeners removed
 * or added mid-dispatch do not affect the current dispatch round (the listener
 * list is snapshotted), listeners are invoked with the dispatcher as `this`, and
 * `event.target` is set to the dispatcher for the duration of the dispatch and
 * reset to `null` afterwards.
 *
 * It exists so modules outside the scene layer can emit events without importing
 * `three`; it is structurally interchangeable with `THREE.EventDispatcher`
 * through the {@link TypedEventTarget} contract.
 */
export class VanillaEventDispatcher<TEventMap extends object = {}> {
  // The implementation signatures widen to `any` (the generic `this` target
  // and event-map index access of the public overloads cannot be named in a
  // single implementation signature); the overloads keep the event-map typing.
  #listeners: Record<string, EventListener<any, any, any>[]> | undefined;

  addEventListener<T extends Extract<keyof TEventMap, string>>(
    type: T,
    listener: EventListener<TEventMap[T], T, this>,
  ): void;
  addEventListener<T extends string>(
    type: T,
    listener: EventListener<{}, T, this>,
  ): void;
  addEventListener(type: string, listener: EventListener<any, any, any>): void {
    if (this.#listeners === undefined) this.#listeners = {};
    const listeners = this.#listeners;

    listeners[type] ??= [];

    if (!listeners[type].includes(listener)) {
      listeners[type].push(listener);
    }
  }

  hasEventListener<T extends Extract<keyof TEventMap, string>>(
    type: T,
    listener: EventListener<TEventMap[T], T, this>,
  ): boolean;
  hasEventListener<T extends string>(
    type: T,
    listener: EventListener<{}, T, this>,
  ): boolean;
  hasEventListener(
    type: string,
    listener: EventListener<any, any, any>,
  ): boolean {
    if (this.#listeners === undefined) return false;
    const listeners = this.#listeners;

    return listeners[type]?.includes(listener) ?? false;
  }

  removeEventListener<T extends Extract<keyof TEventMap, string>>(
    type: T,
    listener: EventListener<TEventMap[T], T, this>,
  ): void;
  removeEventListener<T extends string>(
    type: T,
    listener: EventListener<{}, T, this>,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListener<any, any, any>,
  ): void {
    if (this.#listeners === undefined) return;
    const listeners = this.#listeners;
    const listenerArray = listeners[type];

    if (listenerArray !== undefined) {
      const index = listenerArray.indexOf(listener);
      if (index !== -1) {
        listenerArray.splice(index, 1);
      }
    }
  }

  dispatchEvent<T extends Extract<keyof TEventMap, string>>(
    event: BaseEvent<T> & TEventMap[T],
  ): void {
    if (this.#listeners === undefined) return;
    const listeners = this.#listeners;
    const listenerArray = listeners[event.type];

    if (listenerArray !== undefined) {
      // The dispatch contract mutates the event in place, as three's does.
      const targetEvent = event as { target?: unknown };
      targetEvent.target = this;

      // Make a copy, in case listeners are removed while iterating.
      const array = listenerArray.slice(0);

      for (let idx = 0, length = array.length; idx < length; idx++) {
        array[idx].call(this, event);
      }

      targetEvent.target = null;
    }
  }
}
