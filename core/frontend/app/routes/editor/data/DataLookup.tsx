import LRU from "lru-cache";

import type { EditableFrame } from "../nav";

import type { DataReceiver, BulkDataReceiver } from "./DataReceiver";
import type { DownloadProgressListener } from "./DataLoader";

type CacheKeyFunc = (frame: EditableFrame) => string;

export interface DataCacheOptions<D> {
  /** Maximum number of cached frame entries. */
  maxEntries: number;
  /** Optional maximum estimated memory footprint. */
  maxSize?: number;
  /** Estimates one cached value's contribution to `maxSize`. */
  sizeCalculation?: (value: D, key: string) => number;
  /** Releases resources held by a value removed from the cache. */
  dispose?: (value: D, key: string) => void;
}

/**
 * Interface for objects that find data for a given frame.
 */
export interface DataLookup<D> {
  /**
   * Gets the data for a frame.
   *
   * @param frame The frame to load the data for.
   * @param useCache If `true` and the data has been cached, loads it
   * from the cache; otherwise, the data is loaded from the backend, updating the cache.
   * @returns A promise that resolves to the requested data.
   */
  getData(
    frame: EditableFrame,
    useCache?: boolean,
    signal?: AbortSignal,
    onProgress?: DownloadProgressListener,
  ): Promise<D>;

  /**
   * Tests whether the data for a frame is in the cache.
   *
   * @param frame The frame to load the data for.
   * @returns `true` if the data for a frame is in the cache; otherwise, `false`.
   */
  isCached(frame: EditableFrame): boolean;

  /**
   * Clears the data cache.
   */
  clearCache(): void;
}

/**
 * Abstract base implementation of {@link DataLookup}.
 */
export class BaseDataLookup<D> implements DataLookup<D> {
  /** Obtains the key to use in the data cache. */
  readonly buildCacheKey: CacheKeyFunc;

  /** Receives the data from the backend to be loaded by this object. */
  readonly receiver: DataReceiver<D>;

  /** Caches label data once they are loaded from the backend. */
  protected readonly _cache: LRU<string, D>;

  /** Requests currently loading, indexed by the same stable key as the LRU. */
  protected readonly _pending = new Map<string, Promise<D>>();

  /** Invalidates cache writes from requests started before the latest clear. */
  protected _cacheGeneration = 0;

  /** The maximum size of the data cache. */
  get maxCacheSize(): number {
    return this._cache.max;
  }

  /**
   * Creates a new data lookup.
   *
   * (Ideally this constructor should be protected, but TypeScript incorrectly generates
   * one with no parameters)
   * Subclasses should construct this class with `buildCacheKey` automatically provided.
   *
   * @param buildCacheKey A function that obtains the
   * key to use in the data cache that corresponds to a given frame.
   * @param receiver Receives the data to be loaded from the backend.
   * @param cacheOptions The cache capacity or detailed cache configuration.
   */
  constructor(
    buildCacheKey: CacheKeyFunc,
    receiver: DataReceiver<D>,
    cacheOptions: number | DataCacheOptions<D>,
  ) {
    this.buildCacheKey = buildCacheKey;
    this.receiver = receiver;

    const options =
      typeof cacheOptions === "number"
        ? { maxEntries: cacheOptions }
        : cacheOptions;
    this._cache = new LRU({
      max: options.maxEntries,
      maxSize: options.maxSize,
      sizeCalculation: options.sizeCalculation,
      dispose: options.dispose,
    });
  }

  /**
   * Contains standard implementations of {@link BaseDataLookup#buildCacheKey}.
   */
  static BUILD_CACHE_KEY: {
    GLOBAL_DATA: CacheKeyFunc;
    SOURCE_DATA: CacheKeyFunc;
    LABEL_DATA: CacheKeyFunc;
  } = {
    GLOBAL_DATA: ({ task }) => `${task.id}`,
    SOURCE_DATA: ({ task, source_group_id: sourceGroupId, st_bounds }) =>
      `${task.id}_${sourceGroupId}_${JSON.stringify(st_bounds)}`,
    LABEL_DATA: ({ task, label_branch_id: labelBranchId, st_bounds }) =>
      `${task.id}_${labelBranchId}_${JSON.stringify(st_bounds)}`,
  };

  /**
   * Gets the data for a frame.
   *
   * @param frame The frame to load the data for.
   * @param useCache If `true` and the data has been cached, loads it
   * from the cache; otherwise, the data is loaded from the backend, updating the cache.
   * @returns A promise that resolves to the requested data.
   */
  async getData(
    frame: EditableFrame,
    useCache = true,
    signal?: AbortSignal,
    onProgress?: DownloadProgressListener,
  ): Promise<D> {
    const cacheKey = this.buildCacheKey(frame);
    const cacheGeneration = this._cacheGeneration;

    if (useCache) {
      const cacheData = this._cache.get(cacheKey);
      if (cacheData !== undefined) return cacheData;

      // A cancellable foreground request owns its signal and must not
      // share lifetime with a prefetch or another consumer.
      const pendingData =
        signal == null ? this._pending.get(cacheKey) : undefined;
      if (pendingData !== undefined) return pendingData;
    }

    const request = this.receiver
      .getDataNoCache(frame, signal, onProgress)
      .then((data) => {
        if (cacheGeneration === this._cacheGeneration)
          this._cache.set(cacheKey, data);
        return data;
      })
      .finally(() => {
        if (this._pending.get(cacheKey) === request)
          this._pending.delete(cacheKey);
      });
    if (useCache && signal == null) this._pending.set(cacheKey, request);
    return request;
  }

  /**
   * Tests whether the data for a frame is in the cache.
   *
   * @param frame The frame to load the data for.
   * @returns `true` if the data for a frame is in the cache; otherwise, `false`.
   */
  isCached(frame: EditableFrame): boolean {
    const cacheKey = this.buildCacheKey(frame);
    return this._cache.has(cacheKey);
  }

  /**
   * Clears the data cache.
   */
  clearCache(): void {
    this._cacheGeneration += 1;
    this._cache.clear();
    this._pending.clear();
  }

  /**
   * Disposes of resources owned by this lookup.
   */
  dispose() {
    this.receiver.dispose?.();
    this.clearCache();
  }
}

/**
 * As {@link BaseDataLookup}, but also supports finding data for a batch of frames at once.
 */
export class BulkDataLookup<D> extends BaseDataLookup<D> {
  /** Receives the data from the backend to be loaded by this object. */
  #receiver: BulkDataReceiver<D>;

  /**
   * Creates a new bulk data lookup.
   *
   * @param buildCacheKey A function that obtains the
   * key to use in the data cache that corresponds to a given frame.
   * @param receiver Receives the data to be loaded from the backend.
   * @param cacheOptions The cache capacity or detailed cache configuration.
   */
  constructor(
    buildCacheKey: CacheKeyFunc,
    receiver: BulkDataReceiver<D>,
    cacheOptions: number | DataCacheOptions<D>,
  ) {
    super(buildCacheKey, receiver, cacheOptions);

    this.#receiver = receiver;
  }

  /**
   * Gets the data for any number of frames.
   *
   * @param frames Each frame to load the data for.
   * @param useCache If `true` and the data has been cached, loads it
   * from the cache; otherwise, the data is loaded from the backend, updating the cache.
   * @returns A promise that resolves to the requested data
   * for each frame: the `i`th element corresponds to the data for the `i`th frame.
   */
  async bulkGetData(
    frames: readonly EditableFrame[],
    useCache = true,
    signal?: AbortSignal,
    onProgress?: DownloadProgressListener,
  ): Promise<readonly D[]> {
    if (frames.length === 0) return [];

    const cacheGeneration = this._cacheGeneration;

    const promises = new Map<string, Promise<D>>();
    const missingByKey = new Map<string, EditableFrame>();
    for (const frame of frames) {
      const key = this.buildCacheKey(frame);
      const cached = useCache ? this._cache.get(key) : undefined;
      if (cached !== undefined) {
        promises.set(key, Promise.resolve(cached));
        continue;
      }
      const pending =
        useCache && signal == null ? this._pending.get(key) : undefined;
      if (pending !== undefined) promises.set(key, pending);
      else if (!missingByKey.has(key)) missingByKey.set(key, frame);
    }

    if (missingByKey.size > 0) {
      const missingEntries = [...missingByKey.entries()];
      const batch = this.#receiver.bulkGetDataNoCache(
        missingEntries.map(([, frame]) => frame),
        signal,
        onProgress,
      );
      for (const [index, [key]] of missingEntries.entries()) {
        const request = batch
          .then((values) => {
            const data = values[index];
            if (data === undefined)
              throw new Error(`Backend returned no data for cache key: ${key}`);
            if (cacheGeneration === this._cacheGeneration)
              this._cache.set(key, data);
            return data;
          })
          .finally(() => {
            if (this._pending.get(key) === request) this._pending.delete(key);
          });
        promises.set(key, request);
        if (useCache && signal == null) this._pending.set(key, request);
      }
    }

    return Promise.all(
      frames.map((frame) => {
        const key = this.buildCacheKey(frame);
        const request = promises.get(key);
        if (request === undefined)
          throw new Error(`Unable to find frame: ${JSON.stringify(frame)}`);
        return request;
      }),
    );
  }

  /**
   * Gets the data for any number of frames.
   *
   * @param frames Each frame to load the data for.
   * @param useCache If `true` and the data has been cached, loads it
   * from the cache; otherwise, the data is loaded from the backend, updating the cache.
   * @returns A promise that resolves to the requested data
   * for each frame: the `i`th element corresponds to the data for the `i`th frame.
   */
}

export type { CacheKeyFunc };
