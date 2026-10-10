import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorConfig, ProjectConfig } from "sta/app/editor";

import {
  PointCloudLookup,
  PointCloudReceiver,
  estimatePointCloudCacheSize,
} from "../../../../../app/editor/scene/data/PointCloudLookup";

const config = new EditorConfig(
  ProjectConfig.fromJSON({ frame_cache_size: 2 }),
);
const frame = {
  id: 9,
  task: { id: 1 },
  source_group_id: 2,
  st_bounds: {},
} as any;

function pointResponse(
  values: number[],
  numPoints: number,
  numChannels: number,
  headers = ["x", "y", "z"],
) {
  return new Response(new Float32Array(values).buffer, {
    headers: {
      "X-Num-Points": String(numPoints),
      "X-Num-Channels": String(numChannels),
      "X-Channel-Headers": JSON.stringify(headers),
    },
  });
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve: Deferred<T>["resolve"] = () => {};
  let reject: Deferred<T>["reject"] = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * A fake backend transport whose completion order the test controls
 * explicitly. Like the real transport, aborting a request whose response
 * has not arrived yet rejects it; a response that already arrived before
 * the abort keeps resolving, exactly the race window under test.
 */
function createTransport() {
  const calls: {
    options: { remove_bg: boolean; crop_area: boolean };
    signal: AbortSignal;
    deferred: Deferred<Response>;
  }[] = [];
  const bulkGetSourceData = vi.fn(
    (
      _senderKey: string,
      _frameIds: number[],
      options: { remove_bg: boolean; crop_area: boolean },
      signal: AbortSignal,
    ) => {
      const deferred = createDeferred<Response>();
      signal.addEventListener("abort", () =>
        deferred.reject(new DOMException("aborted", "AbortError")),
      );
      calls.push({ options, signal, deferred });
      return deferred.promise;
    },
  );
  return { bulkGetSourceData, calls };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PointCloudReceiver", () => {
  it("returns null when the server reports no content and propagates filter options", async () => {
    // HTTP 204 means the server has nothing to serve for this request at all;
    // it is distinct from an empty cloud, which the backend reports as a 200
    // with `X-Num-Points: 0` (see the test below).
    const bulkGetSourceData = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const receiver = new PointCloudReceiver(
      config,
      { bulkGetSourceData } as any,
      false,
      true,
    );
    expect(await receiver.getDataNoCache(frame)).toBeNull();
    expect(bulkGetSourceData).toHaveBeenCalledWith(
      "pcd",
      [9],
      { remove_bg: false, crop_area: true },
      expect.any(AbortSignal),
    );
  });

  it("loads an empty point cloud for the backend's zero-point 200 response", async () => {
    // When frame bounds contain no scans (or all scan files are missing) the
    // backend answers 200 with `X-Num-Points: 0` and an empty body. That is a
    // legal, non-null source response, not a missing source.
    const bulkGetSourceData = vi
      .fn()
      .mockResolvedValue(pointResponse([], 0, 3));
    const receiver = new PointCloudReceiver(config, {
      bulkGetSourceData,
    } as any);

    const cloud = await receiver.getDataNoCache(frame);
    expect(cloud).not.toBeNull();
    expect(cloud?.buffer.numPoints).toBe(0);
    expect(cloud?.buffer.numChannels).toBe(3);
  });

  it("parses a valid point buffer and rejects missing or inconsistent metadata", async () => {
    const bulkGetSourceData = vi
      .fn()
      .mockResolvedValueOnce(pointResponse([1, 2, 3], 1, 3));
    const receiver = new PointCloudReceiver(config, {
      bulkGetSourceData,
    } as any);
    const cloud = await receiver.getDataNoCache(frame);
    expect(cloud?.buffer.getCoords()).toHaveLength(1);
    expect(new Set(cloud?.buffer.getCoords()[0].toArray())).toEqual(
      new Set([1, 2, 3]),
    );

    vi.spyOn(console, "error").mockImplementation(() => {});
    bulkGetSourceData.mockResolvedValueOnce(
      new Response(new Float32Array([1, 2, 3]).buffer),
    );
    await expect(receiver.getDataNoCache(frame)).rejects.toThrow(
      "Invalid headers",
    );
    bulkGetSourceData.mockResolvedValueOnce(pointResponse([1, 2, 3, 4], 2, 3));
    await expect(receiver.getDataNoCache(frame)).rejects.toThrow(
      "metadata does not match",
    );
    bulkGetSourceData.mockResolvedValueOnce(
      pointResponse([1, 2], 1, 2, ["x", "y"]),
    );
    await expect(receiver.getDataNoCache(frame)).rejects.toThrow(
      "metadata does not match",
    );
  });

  it("drops superseded responses that arrive across rapid setting changes (A -> B -> A)", async () => {
    const { bulkGetSourceData, calls } = createTransport();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const receiver = new PointCloudReceiver(
      config,
      { bulkGetSourceData } as any,
      true,
      true,
    );

    // Setting A: the response arrives, but the user toggles to setting B
    // before the response is processed.
    const forA = receiver.getDataNoCache(frame);
    calls[0].deferred.resolve(pointResponse([1, 2, 3], 1, 3));
    receiver.abortPending();
    receiver.removeBackground = false;

    // Setting B: the same race again, toggling back to setting A.
    const forB = receiver.getDataNoCache(frame);
    expect(bulkGetSourceData).toHaveBeenLastCalledWith(
      "pcd",
      [9],
      { remove_bg: false, crop_area: true },
      expect.any(AbortSignal),
    );
    calls[1].deferred.resolve(pointResponse([4, 5, 6], 1, 3));
    receiver.abortPending();
    receiver.removeBackground = true;

    // Setting A again: the winning request is issued last.
    const forAAgain = receiver.getDataNoCache(frame);
    expect(bulkGetSourceData).toHaveBeenLastCalledWith(
      "pcd",
      [9],
      { remove_bg: true, crop_area: true },
      expect.any(AbortSignal),
    );
    calls[2].deferred.resolve(pointResponse([7, 8, 9], 1, 3));

    // The superseded responses settle out of order (B, then A) and must be
    // dropped silently; only the last setting's data is returned.
    await expect(forB).rejects.toMatchObject({ name: "AbortError" });
    await expect(forA).rejects.toMatchObject({ name: "AbortError" });

    const cloud = await forAAgain;
    expect(cloud?.buffer.getCoords()).toHaveLength(1);
    expect(new Set(cloud?.buffer.getCoords()[0].toArray())).toEqual(
      new Set([7, 8, 9]),
    );
    expect(bulkGetSourceData).toHaveBeenCalledTimes(3);
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe("estimatePointCloudCacheSize", () => {
  /** Builds a real cloud from a source response for the size estimate. */
  async function cloudFor(values: number[], numChannels: number) {
    const receiver = new PointCloudReceiver(config, {
      bulkGetSourceData: vi
        .fn()
        .mockResolvedValue(
          pointResponse(values, values.length / numChannels, numChannels),
        ),
    } as any);
    return receiver.getDataNoCache(frame);
  }

  it("assigns a positive cache size to null and empty clouds", async () => {
    // `lru-cache` rejects a size of 0 or a non-integer, so a zero-point cloud
    // must still receive a positive size or it can never be cached.
    const empty = await cloudFor([], 3);
    expect(empty?.buffer.numPoints).toBe(0);

    for (const cloud of [null, empty]) {
      const size = estimatePointCloudCacheSize(cloud);
      expect(Number.isSafeInteger(size)).toBe(true);
      expect(size).toBeGreaterThan(0);
    }
    expect(estimatePointCloudCacheSize(null)).toBe(1);
    expect(estimatePointCloudCacheSize(empty)).toBe(1);
  });

  it("estimates a non-empty cloud from its source plus rendered channels", async () => {
    const cloud = await cloudFor([1, 2, 3, 4, 5, 6, 7, 8, 9], 3);

    // 3 source channels + 6 rendered (XYZ and RGB) per point.
    expect(estimatePointCloudCacheSize(cloud)).toBe(
      3 * (3 + 6) * Float32Array.BYTES_PER_ELEMENT,
    );
  });
});

describe("PointCloudLookup", () => {
  it("caches a frame and clears the cache when either server filter changes", async () => {
    const receiver = new PointCloudReceiver(config, {} as any, true, true);
    vi.spyOn(receiver, "getDataNoCache").mockResolvedValue(null);
    const lookup = new PointCloudLookup(() => "frame", receiver, 2);
    await lookup.getData(frame);
    await lookup.getData(frame);
    expect(receiver.getDataNoCache).toHaveBeenCalledOnce();
    lookup.removeBackground = false;
    await lookup.getData(frame);
    expect(receiver.getDataNoCache).toHaveBeenCalledTimes(2);
    lookup.cropArea = false;
    await lookup.getData(frame);
    expect(receiver.getDataNoCache).toHaveBeenCalledTimes(3);
  });

  it("aborts an in-flight request when filter options change or the lookup is disposed", async () => {
    const signals: AbortSignal[] = [];
    const bulkGetSourceData = vi.fn(
      (_key, _ids, _args, signal: AbortSignal) => {
        signals.push(signal);
        return new Promise<Response>((_resolve, reject) =>
          signal.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          ),
        );
      },
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const receiver = new PointCloudReceiver(
      config,
      { bulkGetSourceData } as any,
      true,
      true,
    );
    const lookup = new PointCloudLookup(() => "frame", receiver, 2);
    const first = lookup.getData(frame);
    lookup.removeBackground = false;
    expect(signals[0].aborted).toBe(true);
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    const second = lookup.getData(frame);
    lookup.dispose();
    expect(signals[1].aborted).toBe(true);
    await expect(second).rejects.toMatchObject({ name: "AbortError" });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("never returns or caches a stale response for a superseded setting", async () => {
    const { bulkGetSourceData, calls } = createTransport();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const receiver = new PointCloudReceiver(
      config,
      { bulkGetSourceData } as any,
      true,
      true,
    );
    const lookup = new PointCloudLookup(() => "frame", receiver, 2);

    // The initial load for setting A settles and fills the cache.
    const initial = lookup.getData(frame);
    calls[0].deferred.resolve(pointResponse([1, 2, 3], 1, 3));
    const cloudA = await initial;
    expect(cloudA).not.toBeNull();
    expect(lookup.isCached(frame)).toBe(true);

    // Toggle to setting B: the cache is cleared and a new request starts.
    lookup.removeBackground = false;
    expect(lookup.isCached(frame)).toBe(false);
    const forB = lookup.getData(frame);
    expect(calls[1].options).toMatchObject({ remove_bg: false });

    // B's response arrives just before the user toggles back to setting A,
    // so the abort only lands once the response is already in flight.
    calls[1].deferred.resolve(pointResponse([4, 5, 6], 1, 3));
    lookup.removeBackground = true;

    // The superseded request must reject instead of returning B's data,
    // and must not pollute the setting-agnostic cache key.
    await expect(forB).rejects.toMatchObject({ name: "AbortError" });
    expect(lookup.isCached(frame)).toBe(false);

    // The winning request for the restored setting settles last and owns
    // the cache; later reads return the winner, not the stale response.
    const forA = lookup.getData(frame);
    calls[2].deferred.resolve(pointResponse([7, 8, 9], 1, 3));
    const winner = await forA;
    expect(new Set(winner?.buffer.getCoords()[0].toArray())).toEqual(
      new Set([7, 8, 9]),
    );
    expect(lookup.isCached(frame)).toBe(true);
    expect(await lookup.getData(frame)).toBe(winner);
    expect(bulkGetSourceData).toHaveBeenCalledTimes(3);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("caches a zero-point source response in the size-bounded production cache", async () => {
    // Unlike the numeric constructor used by the other specs, `create` is the
    // path the app takes: it wires a size-bounded LRU whose `sizeCalculation`
    // `lru-cache` rejects unless it returns a positive integer. A 200 response
    // carrying zero points is legal, so the load must resolve and be cached;
    // otherwise `isCached` stays false and segmentation interaction for the
    // frame is permanently disabled.
    const bulkGetSourceData = vi
      .fn()
      .mockResolvedValue(pointResponse([], 0, 3));
    const lookup = PointCloudLookup.create(config, {
      bulkGetSourceData,
    } as any);

    try {
      const cloud = await lookup.getData(frame);
      expect(cloud).not.toBeNull();
      expect(cloud?.buffer.numPoints).toBe(0);
      expect(lookup.isCached(frame)).toBe(true);

      // The empty frame is served from the cache, not re-requested.
      expect(await lookup.getData(frame)).toBe(cloud);
      expect(bulkGetSourceData).toHaveBeenCalledOnce();
    } finally {
      lookup.dispose();
    }
  });
});
