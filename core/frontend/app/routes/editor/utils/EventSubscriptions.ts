/** Event names accepted by a {@link TypedEventTarget}. */
export type EventSubscriptionType<TEventMap extends object> = Extract<
  keyof TEventMap,
  string
>;

/** An event dispatched by a {@link TypedEventTarget}: the mapped payload tagged with its type. */
export type EventSubscriptionEvent<
  TEventMap extends object,
  TType extends EventSubscriptionType<TEventMap>,
> = Readonly<{ type: TType } & TEventMap[TType]>;

/** Listener for one event of a {@link TypedEventTarget}. */
export type EventSubscriptionListener<
  TEventMap extends object,
  TType extends EventSubscriptionType<TEventMap>,
> = (event: EventSubscriptionEvent<TEventMap, TType>) => void;

/**
 * Structural contract of a `THREE.EventDispatcher`-style event source
 * (satisfied equally by {@link VanillaEventDispatcher}), generic over its
 * event map so that event names remain literal-typed.
 */
export interface TypedEventTarget<TEventMap extends object> {
  addEventListener<TType extends EventSubscriptionType<TEventMap>>(
    type: TType,
    listener: EventSubscriptionListener<TEventMap, TType>,
  ): void;
  removeEventListener<TType extends EventSubscriptionType<TEventMap>>(
    type: TType,
    listener: EventSubscriptionListener<TEventMap, TType>,
  ): void;
}

/**
 * Bookkeeping tracker that records event listener registrations and
 * unsubscribe-style disposers, releasing them all in LIFO order upon disposal.
 *
 * Note that TypeScript cannot infer the event map from the target, so the map
 * must be given as the first explicit type argument of {@link EventSubscriptions.add}.
 */
export class EventSubscriptions {
  #disposers: (() => void)[] = [];

  /** The number of registrations and disposers currently tracked. */
  get size(): number {
    return this.#disposers.length;
  }

  /** Whether nothing is currently tracked. */
  get isEmpty(): boolean {
    return this.#disposers.length === 0;
  }

  /**
   * Registers the listener for the event on the target and records its removal.
   *
   * The event map of the target is the first type argument, the event name
   * the second, e.g. `add<MyEventMap, 'change'>(target, 'change', listener)`.
   *
   * @param target - The event source to subscribe to.
   * @param type - The event to subscribe to.
   * @param listener - The listener to register.
   */
  add<TEventMap extends object, TType extends EventSubscriptionType<TEventMap>>(
    target: TypedEventTarget<TEventMap>,
    type: TType,
    listener: EventSubscriptionListener<TEventMap, TType>,
  ): void {
    target.addEventListener(type, listener);
    this.#disposers.push(() => target.removeEventListener(type, listener));
  }

  /**
   * Records an arbitrary disposer to be run on {@link EventSubscriptions.dispose}.
   *
   * @param disposer - The callback to run upon disposal.
   */
  addDisposer(disposer: () => void): void {
    this.#disposers.push(disposer);
  }

  /**
   * Runs all recorded removals and disposers in LIFO order and clears them.
   *
   * Idempotent: further calls do nothing until new registrations are added.
   */
  dispose(): void {
    const disposers = this.#disposers;
    this.#disposers = [];

    for (let idx = disposers.length - 1; idx >= 0; idx--) {
      disposers[idx]();
    }
  }
}
