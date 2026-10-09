import _ from 'lodash';
import LRU from 'lru-cache';

import { FuncUtils } from '../../../../../common/lib/utils';

/**
 * @typedef {import('../nav').FrameLike} FrameLike
 */

/**
 * @template {{} | null} D
 * @typedef {import('./DataReceiver').DataReceiver<D>} DataReceiver
 */

/**
 * @template {{} | null} D
 * @typedef {import('./DataReceiver').BulkDataReceiver<D>} BulkDataReceiver
 */

/**
 * Interface for objects that find data for a given frame.
 * 
 * @interface
 * @template {{} | null} D The type of data to load.
 */
export class DataLookup {

    /**
     * Gets the data for a frame.
     * 
     * @param {FrameLike} frame The frame to load the data for.
     * @param {boolean} useCache If `true` and the data has been cached, loads it
     * from the cache; otherwise, the data is loaded from the backend, updating the cache.
     * @returns {Promise<D>} A promise that resolves to the requested data.
     * @abstract
     */
    getData(frame, useCache = true) {
        throw new Error('Not implemented');
    }

    /**
     * Tests whether the data for a frame is in the cache.
     * 
     * @param {FrameLike} frame The frame to load the data for.
     * @returns {boolean} `true` if the data for a frame is in the cache; otherwise, `false`.
     * @abstract
     */
    isCached(frame) {
        throw new Error('Not implemented');
    }

    /**
     * Clears the data cache.
     * 
     * @abstract
     */
    clearCache() {
        throw new Error('Not implemented');
    }
}

/**
 * @typedef {(frame: FrameLike) => string} CacheKeyFunc
 */

/**
 * Abstract base implementation of {@link DataLookup}.
 * 
 * @template {{} | null} D The type of data to load.
 * @implements {DataLookup<D>}
 */
export class BaseDataLookup {

    /**
     * Obtains the key to use in the data cache.
     * 
     * @readonly
     * @param {FrameLike} frame The frame to load the data for.
     * @returns {string} The requested key.
     */
    buildCacheKey;

    /**
     * Receives the data from the backend to be loaded by this object.
     * 
     * @readonly
     * @type {DataReceiver<D>}
     */
    receiver;

    /**
     * Caches label data once they are loaded from the backend.
     * 
     * @protected
     * @readonly
     * @type {LRU<string, D>}
     */
    _cache;

    /**
     * The maximum size of the data cache.
     * 
     * @type {number}
     */
    get maxCacheSize() { return this._cache.max; }

    /**
     * Creates a new data lookup.
     * 
     * (Ideally this constructor should be protected, but TypeScript incorrectly generates
     * one with no parameters)
     * Subclasses should construct this class with `buildCacheKey` automatically provided.
     * 
     * @param {CacheKeyFunc} buildCacheKey A function that obtains the
     * key to use in the data cache that corresponds to a given frame.
     * @param {DataReceiver<D>} receiver Receives the data to be loaded from the backend.
     * @param {number} maxCacheSize The maximum size of the data cache.
     */
    constructor(buildCacheKey, receiver, maxCacheSize) {
        this.buildCacheKey = buildCacheKey;
        this.receiver = receiver;

        this._cache = new LRU({ max: maxCacheSize });
    }

    /**
     * Contains standard implementations of {@link BaseDataLookup#buildCacheKey}.
     */
    static BUILD_CACHE_KEY = {
        /** @type {CacheKeyFunc} */
        GLOBAL_DATA: ({ task }) => `${task.id}`,
        /** @type {CacheKeyFunc} */
        SOURCE_DATA: ({ task, source_group_id: sourceGroupId, st_bounds }) => `${task.id}_${sourceGroupId}_${JSON.stringify(st_bounds)}`,
        /** @type {CacheKeyFunc} */
        LABEL_DATA: ({ task, label_branch_id: labelBranchId, st_bounds }) => `${task.id}_${labelBranchId}_${JSON.stringify(st_bounds)}`,
    };

    /**
     * Gets the data for a frame.
     * 
     * @param {FrameLike} frame The frame to load the data for.
     * @param {boolean} useCache If `true` and the data has been cached, loads it
     * from the cache; otherwise, the data is loaded from the backend, updating the cache.
     * @returns {Promise<D>} A promise that resolves to the requested data.
     */
    #getData = async (frame, useCache = true) => {
        const cacheKey = this.buildCacheKey(frame);

        if (useCache) {
            const cacheData = this._cache.get(cacheKey);
            if (cacheData !== undefined) return cacheData;
        }

        const data = await this.receiver.getDataNoCache(frame);
        this._cache.set(cacheKey, data);
        return data;
    };

    /**
     * Gets the data for a frame.
     * 
     * @param {FrameLike} frame The frame to load the data for.
     * @param {boolean} useCache If `true` and the data has been cached, loads it
     * from the cache; otherwise, the data is loaded from the backend, updating the cache.
     * @returns {Promise<D>} A promise that resolves to the requested data.
     */
    getData = FuncUtils.tempMemoize(this.#getData);

    /**
     * Tests whether the data for a frame is in the cache.
     * 
     * @param {FrameLike} frame The frame to load the data for.
     * @returns {boolean} `true` if the data for a frame is in the cache; otherwise, `false`.
     */
    isCached(frame) {
        const cacheKey = this.buildCacheKey(frame);
        return this._cache.has(cacheKey);
    }

    /**
     * Clears the data cache.
     */
    clearCache() {
        this._cache.clear();
    }
}

/**
 * As {@link BaseDataLookup}, but additionally supports finding data for a batch of frames at once.
 * 
 * @template {{} | null} D The type of data to load.
 * @augments {BaseDataLookup<D>}
 */
export class BulkDataLookup extends BaseDataLookup {

    /**
     * Receives the data from the backend to be loaded by this object.
     * 
     * @readonly
     * @type {BulkDataReceiver<D>}
     */
    #receiver;

    /**
     * Creates a new bulk data lookup.
     * 
     * @param {CacheKeyFunc} buildCacheKey A function that obtains the
     * key to use in the data cache that corresponds to a given frame.
     * @param {BulkDataReceiver<D>} receiver Receives the data to be loaded from the backend.
     * @param {number} maxCacheSize The maximum size of the data cache.
     */
    constructor(buildCacheKey, receiver, maxCacheSize) {
        super(buildCacheKey, receiver, maxCacheSize);

        this.#receiver = receiver;
    }

    /**
     * Gets the data for any number of frames.
     * 
     * @param {ReadonlyArray<FrameLike>} frames Each frame to load the data for.
     * @param {boolean} useCache If `true` and the data has been cached, loads it
     * from the cache; otherwise, the data is loaded from the backend, updating the cache.
     * @returns {Promise<ReadonlyArray<D>>} A promise that resolves to the requested data
     * for each frame: the `i`th element corresponds to the data for the `i`th frame.
     */
    #bulkGetData = async (frames, useCache = true) => {
        const cacheKeysByFrame = new Map(frames.map(
            (frame) => [frame, this.buildCacheKey(frame)],
        ));
        const cacheDataByFrame = new Map(Array.from(
            cacheKeysByFrame,
            useCache ? ([frame, cacheKey]) => [frame, this._cache.get(cacheKey)]
                : ([frame]) => [frame, undefined],
        ));

        /**
         * @type {[[FrameLike, D][], [FrameLike, undefined][]]}
         */
        // @ts-expect-error
        const [cachedEntries, missingEntries] = _.partition(
            [...cacheDataByFrame],
            ([, cacheKey]) => cacheKey !== undefined,
        );

        const missingFrames = missingEntries.map(([frame]) => frame);
        const missingDatas = await this.#receiver.bulkGetDataNoCache(missingFrames);

        /**
         * @type {[FrameLike, D][]}
         */
        const queriedEntries = missingFrames.map((frame, i) => [frame, missingDatas[i]]);

        for (const [frame, queriedData] of queriedEntries) {
            const cacheKey = cacheKeysByFrame.get(frame);
            if (cacheKey === undefined) {
                throw new Error(`Unable to find frame: ${JSON.stringify(frame)}`);
            }

            this._cache.set(cacheKey, queriedData);
        }

        const allEntries = new Map([...cachedEntries, ...queriedEntries]);
        return frames.map((frame) => {
            const data = allEntries.get(frame);
            if (data === undefined) {
                throw new Error(`Unable to find frame: ${JSON.stringify(frame)}`);
            }

            return data;
        });
    };

    /**
     * Gets the data for any number of frames.
     * 
     * @param {ReadonlyArray<FrameLike>} frames Each frame to load the data for.
     * @param {boolean} useCache If `true` and the data has been cached, loads it
     * from the cache; otherwise, the data is loaded from the backend, updating the cache.
     * @returns {Promise<ReadonlyArray<D>>} A promise that resolves to the requested data
     * for each frame: the `i`th element corresponds to the data for the `i`th frame.
     */
    bulkGetData = FuncUtils.tempMemoize(this.#bulkGetData);
}
