import { describe, expect, it, vi } from "vitest";

import { createEditorStore } from "../../../../../app/routes/editor/store/createEditorStore";

describe("createEditorStore", () => {
  it("maps the initial snapshot lazily on first read", () => {
    const map = vi.fn(() => ({ value: 1 }));
    const store = createEditorStore(map);

    expect(map).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toEqual({ value: 1 });
    expect(map).toHaveBeenCalledOnce();
  });

  it("returns a stable snapshot reference between invalidations", () => {
    const map = vi.fn(() => ({ value: 1 }));
    const store = createEditorStore(map);

    const first = store.getSnapshot();
    const second = store.getSnapshot();

    expect(first).toBe(second);
    expect(map).toHaveBeenCalledOnce();
  });

  it("rebuilds the snapshot after invalidation, passing the previous one", () => {
    const previousSnapshots: unknown[] = [];
    const map = vi.fn((previous: { value: number } | null) => {
      previousSnapshots.push(previous);
      return { value: (previous?.value ?? 0) + 1 };
    });
    const store = createEditorStore(map);

    expect(store.getSnapshot()).toEqual({ value: 1 });
    store.invalidate();
    expect(store.getSnapshot()).toEqual({ value: 2 });

    expect(previousSnapshots).toEqual([null, { value: 1 }]);
  });

  it("notifies subscribers on invalidation and supports unsubscription", () => {
    const store = createEditorStore(() => ({}));
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.invalidate();
    expect(listener).toHaveBeenCalledOnce();

    unsubscribe();
    store.invalidate();
    expect(listener).toHaveBeenCalledOnce();
  });

  it("stops notifying after dispose", () => {
    const store = createEditorStore(() => ({}));
    const listener = vi.fn();
    store.subscribe(listener);

    store.dispose();
    store.invalidate();
    expect(listener).not.toHaveBeenCalled();
  });
});
