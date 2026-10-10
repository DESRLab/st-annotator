import { describe, expect, it, vi } from "vitest";

import { BaseDataView } from "../../../../../app/routes/editor/data/DataView";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("BaseDataView loading failures", () => {
  it("aborts the active load and starts the latest frame without waiting for stale I/O", async () => {
    const second = deferred<string>();
    const loader = {
      getData: vi.fn((frame: { id: number }, signal?: AbortSignal) => {
        if (frame.id === 2) return second.promise;
        return new Promise<string>((_resolve, reject) =>
          signal?.addEventListener(
            "abort",
            () => {
              reject(new DOMException("superseded", "AbortError"));
            },
            { once: true },
          ),
        );
      }),
      isCached: vi.fn(() => false),
    };
    const view = new BaseDataView(loader as any);

    const firstLoad = view.setFrame({ id: 1 } as any);
    await vi.waitFor(() => expect(loader.getData).toHaveBeenCalledTimes(1));
    const latestLoad = view.setFrame({ id: 2 } as any);
    await vi.waitFor(() => expect(loader.getData).toHaveBeenCalledTimes(2));

    second.resolve("frame-two");
    await Promise.all([firstLoad, latestLoad]);
    expect(view.data).toBe("frame-two");
  });

  it("never publishes a stale frame response after navigation changes target", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const loader = {
      getData: vi.fn((frame: { id: number }) =>
        frame.id === 1 ? first.promise : second.promise,
      ),
      isCached: vi.fn(() => false),
    };
    const view = new BaseDataView(loader as any);
    const events: string[] = [];
    view.addEventListener("beforeload", () => events.push("before"));
    view.addEventListener("afterload", () => events.push(`after:${view.data}`));

    const loadFirst = view.setFrame({ id: 1 } as any);
    const loadSecond = view.setFrame({ id: 2 } as any);
    first.resolve("frame-one");
    await loadFirst;

    expect(view.frame?.id).toBe(2);
    expect(view.data).toBeNull();
    expect(events).toEqual(["before"]);

    second.resolve("frame-two");
    await loadSecond;
    expect(view.data).toBe("frame-two");
    expect(events).toEqual(["before", "after:frame-two"]);
  });

  it("discards a response that becomes stale while getData is pending", async () => {
    const first = deferred<string>();
    const loader = {
      getData: vi.fn(() => first.promise),
      isCached: vi.fn(() => false),
    };
    const view = new BaseDataView(loader as any);
    const events: string[] = [];
    view.addEventListener("beforeload", () => events.push("before"));
    view.addEventListener("afterload", () => events.push("after"));

    const loadFirst = view.setFrame({ id: 1 } as any);
    await vi.waitFor(() => expect(loader.getData).toHaveBeenCalledOnce());
    const loadSecond = view.setFrame(null);
    first.resolve("frame-one");
    await Promise.all([loadFirst, loadSecond]);

    expect(view.frame).toBeNull();
    expect(view.data).toBeNull();
    expect(events).toEqual(["before", "before", "after"]);
  });

  it("publishes only the last frame across rapid A->B->C navigation with an in-flight first load", async () => {
    const first = deferred<string>();
    const third = deferred<string>();
    const loader = {
      getData: vi.fn((frame: { id: number }) =>
        frame.id === 1 ? first.promise : third.promise,
      ),
      isCached: vi.fn(() => false),
    };
    const view = new BaseDataView(loader as any);
    const events: string[] = [];
    view.addEventListener("beforeload", () =>
      events.push(`before:${view.frame?.id}`),
    );
    view.addEventListener("afterload", () => events.push(`after:${view.data}`));

    const loadA = view.setFrame({ id: 1 } as any);
    await vi.waitFor(() => expect(loader.getData).toHaveBeenCalledOnce());
    expect(view.isLoading).toBe(true);
    const loadB = view.setFrame({ id: 2 } as any);
    const loadC = view.setFrame({ id: 3 } as any);

    // Both pending requests settle after C became the target; only C may publish.
    first.resolve("frame-one");
    third.resolve("frame-three");
    await Promise.all([loadA, loadB, loadC]);

    expect(view.frame?.id).toBe(3);
    expect(view.data).toBe("frame-three");
    expect(view.isLoading).toBe(false);
    expect(events).toEqual(["before:1", "before:3", "after:frame-three"]);
    // Frame 2 never started a load; frame 1's response was dropped stale.
    expect(loader.getData).toHaveBeenCalledTimes(2);
  });

  it("does not replace the latest frame with a stale failure", async () => {
    const first = deferred<string>();
    const third = deferred<string>();
    const loader = {
      getData: vi.fn((frame: { id: number }) =>
        frame.id === 1 ? first.promise : third.promise,
      ),
      isCached: vi.fn(() => false),
    };
    const view = new BaseDataView(loader as any);
    const events: string[] = [];
    view.addEventListener("afterload", () => events.push(`after:${view.data}`));

    const loadA = view.setFrame({ id: 1 } as any);
    await vi.waitFor(() => expect(loader.getData).toHaveBeenCalledOnce());
    const loadC = view.setFrame({ id: 3 } as any);

    // The in-flight request for frame 1 fails after navigation moved on;
    // its failure must not clobber the data of the newest frame.
    first.reject(new Error("stale source failure"));
    await loadA;
    expect(view.data).toBeNull();
    expect(events).toEqual([]);

    third.resolve("frame-three");
    await loadC;
    expect(view.frame?.id).toBe(3);
    expect(view.data).toBe("frame-three");
    expect(events).toEqual(["after:frame-three"]);
  });

  it("keeps a retry to the same frame clean when the failed load settles late", async () => {
    const first = deferred<string>();
    const retry = deferred<string>();
    const loader = {
      getData: vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(retry.promise),
      isCached: vi.fn(() => false),
    };
    const view = new BaseDataView(loader as any);
    const events: string[] = [];
    view.addEventListener("afterload", () => events.push(`after:${view.data}`));

    // Frame 1 starts loading; the user navigates away and then retries
    // frame 1 while the first request is still in flight.
    const loadFirst = view.setFrame({ id: 1 } as any);
    await vi.waitFor(() => expect(loader.getData).toHaveBeenCalledTimes(1));
    const loadInterim = view.setFrame({ id: 2 } as any);
    const loadRetry = view.setFrame({ id: 1 } as any);

    // The first request fails late. The failure is reported scoped to the
    // failed request's frame, but it must NOT publish: the retry returned
    // to the same frame id, and a stale failure may never overwrite it.
    first.reject(new Error("transient source failure"));
    await Promise.all([loadFirst, loadInterim]);
    expect(view.loadError).toBeNull();

    // The retry then succeeds: the stale failure published nothing, and
    // the data ends up as the retry's.
    retry.resolve("frame-one-retry");
    await loadRetry;

    expect(view.frame?.id).toBe(1);
    expect(view.data).toBe("frame-one-retry");
    expect(view.isLoading).toBe(false);
    expect(events).toEqual(["after:frame-one-retry"]);
    expect(loader.getData).toHaveBeenCalledTimes(2);
  });

  it("exposes a failed source and retries the same frame", async () => {
    const error = new Error("plugin source unavailable");
    const loader = {
      getData: vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce("healthy-source"),
      isCached: vi.fn(() => false),
      dispose: vi.fn(),
    };
    const view = new BaseDataView(loader as any);
    const events: string[] = [];
    view.addEventListener("beforeload", () => events.push("before"));
    view.addEventListener("afterload", () => events.push(`after:${view.data}`));

    await expect(view.setFrame({ id: 1 } as any)).resolves.toBeUndefined();
    expect(view.data).toBeNull();
    expect(events).toEqual(["before", "after:null"]);
    expect(view.loadError).toBe("plugin source unavailable");

    await view.retry();
    expect(view.data).toBe("healthy-source");
    expect(view.frame?.id).toBe(1);
    expect(view.loadError).toBeNull();
    expect(loader.getData).toHaveBeenCalledTimes(2);
    view.dispose();
    expect(loader.dispose).toHaveBeenCalledOnce();
  });
});
