/** An event source dispatching string-keyed events (e.g. a labels index). */
export interface DataIndexEventSource {
  addEventListener(eventType: string, listener: () => void): void;
  removeEventListener(eventType: string, listener: () => void): void;
}

/** The load lifecycle surface of a data view owning the current index. */
export interface DataIndexLifecycleView<TIndex> {
  readonly data: TIndex | null;
  addEventListener(
    eventType: "beforeload" | "afterload",
    listener: () => void,
  ): void;
  removeEventListener(
    eventType: "beforeload" | "afterload",
    listener: () => void,
  ): void;
}

export interface DataIndexLifecycleParams<TIndex extends DataIndexEventSource> {
  /** The data view whose `data` is the current index. */
  readonly view: DataIndexLifecycleView<TIndex>;
  /** Every event type the index can dispatch (e.g. its `ALL_EVENT_TYPES`). */
  readonly eventTypes: readonly string[];
  /** Notified whenever the projected state may have changed. */
  readonly listener: () => void;
  /**
   * Receives `true` while the view is between `beforeload` and
   * `afterload`, the index is unavailable and consumers must project
   * empty state, and `false` once the (possibly new) index is current.
   */
  readonly setLoading: (loading: boolean) => void;
}

/**
 * Subscribes a listener to every event of the data view's current index,
 * following the index across the view's load lifecycle.
 *
 * The load sequence matters: `DataView` dispatches `beforeload` BEFORE
 * clearing its data, then sets `data = null`, loads, and dispatches
 * `afterload`. Accordingly:
 * - on `beforeload`, every listener is detached from the OLD index and
 *   `setLoading(true)` is published, consumers project empty state while
 *   the load is in flight, and nothing stays subscribed to the obsolete
 *   index;
 * - on `afterload`, listeners are attached to the NEW index (if any) and
 *   `setLoading(false)` is published.
 *
 * The initial index (if already loaded) is attached immediately. Returns a
 * disposer removing every subscription at both levels.
 */
export function subscribeDataIndexLifecycle<
  TIndex extends DataIndexEventSource,
>({
  view,
  eventTypes,
  listener,
  setLoading,
}: DataIndexLifecycleParams<TIndex>): () => void {
  let indexDisposers: (() => void)[] = [];

  const detachIndex = (): void => {
    for (const dispose of indexDisposers) dispose();
    indexDisposers = [];
  };

  const attachIndex = (): void => {
    const index = view.data;
    if (index == null) return;
    for (const eventType of eventTypes) {
      index.addEventListener(eventType, listener);
      indexDisposers.push(() => index.removeEventListener(eventType, listener));
    }
  };

  const handleBeforeLoad = (): void => {
    setLoading(true);
    detachIndex();
    listener();
  };

  const handleAfterLoad = (): void => {
    setLoading(false);
    attachIndex();
    listener();
  };

  view.addEventListener("beforeload", handleBeforeLoad);
  view.addEventListener("afterload", handleAfterLoad);
  attachIndex();

  return (): void => {
    view.removeEventListener("beforeload", handleBeforeLoad);
    view.removeEventListener("afterload", handleAfterLoad);
    detachIndex();
  };
}
