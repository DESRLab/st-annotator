import { describe, expect, it, vi } from "vitest";

import { subscribeDataIndexLifecycle } from "../../../../../app/routes/editor/data/dataIndexLifecycle";

const EVENT_TYPES = ["box-add", "box-delete", "box-update", "bulk-add"];

function createFakeIndex() {
  const listenersByType = new Map<string, Set<() => void>>();
  return {
    addEventListener(eventType: string, listener: () => void): void {
      const listeners = listenersByType.get(eventType) ?? new Set();
      listeners.add(listener);
      listenersByType.set(eventType, listeners);
    },
    removeEventListener(eventType: string, listener: () => void): void {
      listenersByType.get(eventType)?.delete(listener);
    },
    listenerCount(eventType: string): number {
      return listenersByType.get(eventType)?.size ?? 0;
    },
    dispatch(eventType: string): void {
      for (const listener of listenersByType.get(eventType) ?? []) listener();
    },
    totalListeners(): number {
      let total = 0;
      for (const listeners of listenersByType.values()) total += listeners.size;
      return total;
    },
  };
}

type FakeIndex = ReturnType<typeof createFakeIndex>;

function createFakeView(initial: FakeIndex | null = null) {
  const handlersByType = new Map<"beforeload" | "afterload", Set<() => void>>();
  return {
    data: initial as FakeIndex | null,
    addEventListener(
      eventType: "beforeload" | "afterload",
      listener: () => void,
    ): void {
      const handlers = handlersByType.get(eventType) ?? new Set();
      handlers.add(listener);
      handlersByType.set(eventType, handlers);
    },
    removeEventListener(
      eventType: "beforeload" | "afterload",
      listener: () => void,
    ): void {
      handlersByType.get(eventType)?.delete(listener);
    },
    notify(eventType: "beforeload" | "afterload"): void {
      for (const handler of handlersByType.get(eventType) ?? []) handler();
    },
    handlerCount(eventType: "beforeload" | "afterload"): number {
      return handlersByType.get(eventType)?.size ?? 0;
    },
  };
}

function subscribe(
  view: ReturnType<typeof createFakeView>,
  listener: () => void,
  setLoading: (loading: boolean) => void,
) {
  return subscribeDataIndexLifecycle({
    view,
    eventTypes: EVENT_TYPES,
    listener,
    setLoading,
  });
}

describe("subscribeDataIndexLifecycle", () => {
  it("attaches the listener to every event of the initial index", () => {
    const index = createFakeIndex();
    const view = createFakeView(index);
    const listener = vi.fn();

    subscribe(view, listener, vi.fn());

    for (const eventType of EVENT_TYPES)
      expect(index.listenerCount(eventType)).toBe(1);

    index.dispatch("box-update");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("publishes the full beforeload -> data=null -> afterload lifecycle", () => {
    // Regression: DataView dispatches `beforeload` BEFORE clearing its
    // data. The subscription must detach from the old index and publish
    // loading state at `beforeload`, reattaching to the old index and
    // mapping its stale entities is exactly what this guards against.
    const oldIndex = createFakeIndex();
    const view = createFakeView(oldIndex);
    const listener = vi.fn();
    const setLoading = vi.fn();

    subscribe(view, listener, setLoading);
    listener.mockClear();

    // beforeload fires while the old index is still set.
    view.notify("beforeload");
    expect(setLoading).toHaveBeenLastCalledWith(true);
    expect(oldIndex.totalListeners()).toBe(0);
    expect(listener).toHaveBeenCalledTimes(1);

    // DataView nulls its data after dispatching beforeload; nothing may
    // reattach to the obsolete index or notify until afterload.
    view.data = null;
    listener.mockClear();
    oldIndex.dispatch("box-update");
    expect(listener).not.toHaveBeenCalled();

    // afterload fires once the new index is loaded.
    const newIndex = createFakeIndex();
    view.data = newIndex;
    view.notify("afterload");
    expect(setLoading).toHaveBeenLastCalledWith(false);
    expect(oldIndex.totalListeners()).toBe(0);
    for (const eventType of EVENT_TYPES)
      expect(newIndex.listenerCount(eventType)).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);

    newIndex.dispatch("box-add");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps publishing empty state when the load yields no index", () => {
    const oldIndex = createFakeIndex();
    const view = createFakeView(oldIndex);
    const listener = vi.fn();
    const setLoading = vi.fn();

    subscribe(view, listener, setLoading);

    view.notify("beforeload");
    view.data = null;
    view.notify("afterload");

    expect(setLoading).toHaveBeenLastCalledWith(false);
    expect(oldIndex.totalListeners()).toBe(0);
    expect(view.data).toBeNull();
  });

  it("removes every subscription at both levels on disposal", () => {
    const index = createFakeIndex();
    const view = createFakeView(index);

    const dispose = subscribe(view, vi.fn(), vi.fn());
    dispose();

    expect(view.handlerCount("beforeload")).toBe(0);
    expect(view.handlerCount("afterload")).toBe(0);
    expect(index.totalListeners()).toBe(0);
  });
});
