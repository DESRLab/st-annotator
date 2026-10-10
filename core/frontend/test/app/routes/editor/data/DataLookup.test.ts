import { describe, expect, it, vi } from "vitest";

import {
  BaseDataLookup,
  BulkDataLookup,
} from "../../../../../app/routes/editor/data/DataLookup";

const frame = (id: number) => ({ id }) as never;
const key = ({ id }: { id: number }) => String(id);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("BaseDataLookup", () => {
  it("deduplicates equivalent in-flight frames by cache key, not object identity", async () => {
    const pending = deferred<string>();
    const receiver = { getDataNoCache: vi.fn(() => pending.promise) };
    const lookup = new BaseDataLookup(key as never, receiver as never, 4);

    const first = lookup.getData(frame(1));
    const duplicate = lookup.getData(frame(1));
    expect(receiver.getDataNoCache).toHaveBeenCalledOnce();

    pending.resolve("one");
    await expect(Promise.all([first, duplicate])).resolves.toEqual([
      "one",
      "one",
    ]);
  });

  it("evicts heavy values when the estimated byte budget is exceeded", async () => {
    const receiver = {
      getDataNoCache: vi.fn(async ({ id }: { id: number }) => "x".repeat(id)),
    };
    const lookup = new BaseDataLookup(key as never, receiver as never, {
      maxEntries: 10,
      maxSize: 5,
      sizeCalculation: (value: string) => value.length,
    });

    await lookup.getData(frame(3));
    await lookup.getData(frame(4));

    expect(lookup.isCached(frame(3))).toBe(false);
    expect(lookup.isCached(frame(4))).toBe(true);
  });

  it("does not let a cancelled foreground request poison another consumer", async () => {
    const receiver = {
      getDataNoCache: vi.fn(
        (_frame: unknown, signal?: AbortSignal) =>
          new Promise<string>((resolve, reject) => {
            if (signal == null) resolve("prefetched");
            else
              signal.addEventListener("abort", () =>
                reject(new DOMException("cancelled", "AbortError")),
              );
          }),
      ),
    };
    const lookup = new BaseDataLookup(key as never, receiver as never, 4);
    const controller = new AbortController();

    const foreground = lookup.getData(frame(1), true, controller.signal);
    const prefetch = lookup.getData(frame(1));
    controller.abort();

    await expect(foreground).rejects.toMatchObject({ name: "AbortError" });
    await expect(prefetch).resolves.toBe("prefetched");
    expect(receiver.getDataNoCache).toHaveBeenCalledTimes(2);
  });

  it("does not repopulate a cleared cache from an older pending request", async () => {
    const pending = deferred<string>();
    const receiver = { getDataNoCache: vi.fn(() => pending.promise) };
    const lookup = new BaseDataLookup(key as never, receiver as never, 4);

    const request = lookup.getData(frame(1));
    lookup.clearCache();
    pending.resolve("stale");

    await expect(request).resolves.toBe("stale");
    expect(lookup.isCached(frame(1))).toBe(false);
  });
});

describe("BulkDataLookup", () => {
  it("does not call the receiver when every requested frame is cached", async () => {
    const receiver = {
      getDataNoCache: vi.fn(),
      bulkGetDataNoCache: vi.fn(async (frames: { id: number }[]) =>
        frames.map(({ id }) => `data-${id}`),
      ),
    };
    const lookup = new BulkDataLookup(key as never, receiver as never, 4);

    await lookup.bulkGetData([frame(1), frame(2)]);
    receiver.bulkGetDataNoCache.mockClear();

    await expect(lookup.bulkGetData([frame(1), frame(2)])).resolves.toEqual([
      "data-1",
      "data-2",
    ]);
    expect(receiver.bulkGetDataNoCache).not.toHaveBeenCalled();
  });

  it("deduplicates overlapping bulk calls by individual cache key", async () => {
    const firstBatch = deferred<readonly string[]>();
    const receiver = {
      getDataNoCache: vi.fn(),
      bulkGetDataNoCache: vi
        .fn()
        .mockReturnValueOnce(firstBatch.promise)
        .mockResolvedValueOnce(["data-3"]),
    };
    const lookup = new BulkDataLookup(key as never, receiver as never, 4);

    const first = lookup.bulkGetData([frame(1), frame(2)]);
    const overlapping = lookup.bulkGetData([frame(2), frame(3)]);

    expect(receiver.bulkGetDataNoCache).toHaveBeenCalledTimes(2);
    expect(receiver.bulkGetDataNoCache.mock.calls[1][0]).toEqual([{ id: 3 }]);
    firstBatch.resolve(["data-1", "data-2"]);

    await expect(first).resolves.toEqual(["data-1", "data-2"]);
    await expect(overlapping).resolves.toEqual(["data-2", "data-3"]);
  });

  it("returns an empty result without making an empty backend request", async () => {
    const receiver = {
      getDataNoCache: vi.fn(),
      bulkGetDataNoCache: vi.fn(),
    };
    const lookup = new BulkDataLookup(key as never, receiver as never, 4);

    await expect(lookup.bulkGetData([])).resolves.toEqual([]);
    expect(receiver.bulkGetDataNoCache).not.toHaveBeenCalled();
  });

  it("does not repopulate a cleared cache from an older bulk request", async () => {
    const pending = deferred<readonly string[]>();
    const receiver = {
      getDataNoCache: vi.fn(),
      bulkGetDataNoCache: vi.fn(() => pending.promise),
    };
    const lookup = new BulkDataLookup(key as never, receiver as never, 4);

    const request = lookup.bulkGetData([frame(1)]);
    lookup.clearCache();
    pending.resolve(["stale"]);

    await expect(request).resolves.toEqual(["stale"]);
    expect(lookup.isCached(frame(1))).toBe(false);
  });
});
