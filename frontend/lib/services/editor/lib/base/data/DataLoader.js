/**
 * @typedef {import('../labelset').EditableBranch} EditableBranch
 */

/**
 * @typedef {import('../nav').EditableFrame} EditableFrame
 */

/**
 * @typedef {import('../scene').SceneContext<any>} SceneContext
 */

/**
 * @typedef {import('../views').EditorViews} EditorViews
 */

/**
 * @template {{} | null} D
 * @typedef {import('./DataLookup').BaseDataLookup<D>} BaseDataLookup
 */

/**
 * @template {{} | null} D
 * @typedef {import('./DataLookup').BulkDataLookup<D>} BulkDataLookup
 */

/**
 * Interface for classes that load data for a given frame.
 * 
 * @interface
 * @template {{} | null} D The type of data to fetch.
 */
export class DataLoader {

    /**
     * Requests that data be loaded in memory for a frame, and returns it.
     * 
     * @param {EditableFrame} frame The frame to load the data for.
     * @returns {Promise<D>} A promise that resolves to the requested data.
     * @abstract
     */
    getData(frame) {
        throw new Error('Not implemented');
    }

    /**
     * Tests whether the data for a frame is in the cache.
     * 
     * @param {EditableFrame} frame The frame to load the data for.
     * @returns {boolean} `true` if the data for a frame is in the cache; otherwise, `false`.
     * @abstract
     */
    isCached(frame) {
        throw new Error('Not implemented');
    }
}

/**
 * Given a frame, loads data for that single frame.
 * 
 * @template {{} | null} D The type of data to load.
 * @implements {DataLoader<D>}
 */
export class UnitDataLoader {

    /**
     * Finds the data for each frame.
     * 
     * @readonly
     * @type {BaseDataLookup<D>}
     */
    lookup;

    /**
     * Creates a new data loader for single frames.
     * 
     * @param {BaseDataLookup<D>} lookup Finds the data for each frame.
     */
    constructor(lookup) {
        this.lookup = lookup;
    }

    /**
     * Requests that data be loaded in memory for a frame, and returns it.
     * 
     * @param {EditableFrame} frame The frame to load the data for.
     * @returns {Promise<D>} A promise that resolves to the requested data.
     */
    async getData(frame) {
        return this.lookup.getData(frame);
    }

    /**
     * Tests whether the data for a frame is in the cache.
     * 
     * @param {EditableFrame} frame The frame to load the data for.
     * @returns {boolean} `true` if the data for a frame is in the cache; otherwise, `false`.
     */
    isCached(frame) {
        return this.lookup.isCached(frame);
    }
}

/**
 * Given a frame, loads data composed from the data for that single frame as well as that
 * for neighbouring frames.
 * 
 * @template {{} | null} W The type of data that represents the sliding window.
 * (This is usually a container that consists of `U` from any number of frames.)
 * @template {{} | null} U The type of data to display for an individual frame.
 * (This corresponds to a unit in the window.)
 * @implements {DataLoader<W>}
 */
export class WindowDataLoader {

    /**
     * Finds the data for each frame.
     * 
     * @readonly
     * @type {BulkDataLookup<U>}
     */
    lookup;

    /**
     * Represents the active scene.
     * 
     * @readonly
     * @type {SceneContext}
     */
    context;

    /**
     * The width of the window along the time axis, i.e., the maximum distance (inclusive,
     * according to time index) from the active frame for which to load the data.
     * 
     * @type {number}
     */
    timeWidth;

    /**
     * Creates a new data loader for a sliding window of frames.
     * 
     * @param {BulkDataLookup<U>} lookup Finds the data for each frame.
     * @param {SceneContext} context Represents the active scene.
     * @param {number} timeWidth The width of the window along the time axis.
     */
    constructor(lookup, context, timeWidth) {
        this.lookup = lookup;
        this.context = context;
        this.timeWidth = timeWidth;
    }

    /**
     * Combines the data from individual frames into a window.
     * 
     * @protected
     * @param {ReadonlyArray<U>} windowData The data to combine.
     * @returns {W} The combined data.
     * @abstract
     */
    combineData(windowData) {
        throw new Error('Not implemented');
    }

    /**
     * Gets the window centered around a frame.
     * 
     * @param {EditableFrame} frame The query frame.
     * @returns {ReadonlyArray<EditableFrame>} An array containing each frame
     * within {@link WindowDataLoader#timeWidth} timesteps of the given `frame`.
     */
    getFramesInWindow(frame) {
        return this.context.frames.axes.tb.findInRangeOfFrame(frame, this.timeWidth);
    }

    /**
     * Requests that data be loaded in memory for a frame, and returns it.
     * 
     * @param {EditableFrame} frame The frame to load the data for.
     * @returns {Promise<W>} A promise that resolves to the requested data.
     */
    async getData(frame) {
        const framesInWindow = this.getFramesInWindow(frame);
        const dataInWindow = await this.lookup.bulkGetData(framesInWindow);

        return this.combineData(dataInWindow);
    }

    /**
     * Tests whether the data for a frame is in the cache.
     * 
     * @param {EditableFrame} frame The frame to load the data for.
     * @returns {boolean} `true` if the data for a frame is in the cache; otherwise, `false`.
     */
    isCached(frame) {
        return this.lookup.isCached(frame);
    }
}
