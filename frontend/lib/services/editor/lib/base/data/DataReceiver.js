/**
 * @typedef {import('../config').EditorConfig} EditorConfig
 */

/**
 * @typedef {import('../labelset').EditableBranch} EditableBranch
 */

/**
 * @typedef {import('../nav').FrameLike} FrameLike
 */

/**
 * @typedef {import('../views').EditorViews} EditorViews
 */

/**
 * Interface for classes that read data from the backend.
 * 
 * @interface
 * @template {{} | null} D The type of data to fetch.
 */
export class DataReceiver {

    /**
     * Gets the data for a frame, bypassing the cache.
     * 
     * @param {FrameLike} frame The frame to load the data for.
     * @returns {Promise<D>} A promise that resolves to the requested data.
     * @abstract
     */
    getDataNoCache(frame) {
        throw new Error('Not implemented');
    }
}

/**
 * Abstract base implementation of {@link DataReceiver}.
 * 
 * @template {{} | null} D The type of data to fetch.
 * @implements {DataReceiver<D>}
 */
export class BaseDataReceiver {

    /**
     * The configuration of the application.
     * 
     * @readonly
     * @type {EditorConfig}
     */
    config;

    /**
     * The interface of the application with the backend.
     * 
     * @readonly
     * @type {EditorViews}
     */
    views;

    /**
     * Creates a new data receiver.
     * 
     * @param {EditorConfig} config The configuration of the application.
     * @param {EditorViews} views The interface of the application with the backend.
     */
    constructor(config, views) {
        this.config = config;
        this.views = views;
    }

    /**
     * Gets the data for a frame, bypassing the cache.
     * 
     * @param {FrameLike} frame The frame to load the data for.
     * @returns {Promise<D>} A promise that resolves to the requested data.
     * @abstract
     */
    getDataNoCache(frame) {
        throw new Error('Not implemented');
    }
}

/**
 * As {@link BaseDataReceiver}, but additionally supports reading a batch of data.
 * 
 * @template {{} | null} D The type of data to fetch.
 * @augments {BaseDataReceiver<D>}
 */
export class BulkDataReceiver extends BaseDataReceiver {

    /**
     * Gets the data for a frame, bypassing the cache.
     * 
     * @param {FrameLike} frame The frame to load the data for.
     * @returns {Promise<D>} A promise that resolves to the requested data.
     */
    async getDataNoCache(frame) {
        const [data] = await this.bulkGetDataNoCache([frame]);
        return data;
    }

    /**
     * Gets the data for any number of frames, bypassing the cache.
     * 
     * @param {ReadonlyArray<FrameLike>} frames Each frame to load the data for.
     * @returns {Promise<ReadonlyArray<D>>} A promise that resolves to the requested data
     * for each frame: the `i`th element corresponds to the data for the `i`th frame.
     * @abstract
     */
    bulkGetDataNoCache(frames) {
        throw new Error('Not implemented');
    }
}
