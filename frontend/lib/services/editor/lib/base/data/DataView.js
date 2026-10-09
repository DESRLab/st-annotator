import { Queue } from 'async-await-queue';
import * as THREE from 'three';

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
 * @template {{} | null} D
 * @typedef {import('./DataLoader').DataLoader<D>} DataLoader
 */

/**
 * Defines each event that can be dispatched by {@link DataView}.
 * 
 * @typedef {object} DataViewEventMap
 * @property {{}} beforeload The event right before the data is cleared and reloaded.
 * @property {{}} afterload The event right after the data is reloaded.
 */

/**
 * Interface for objects that provide a view of data that updates based on the active frame.
 * 
 * @interface
 * @template {{} | null} D The type of data to display.
 * @augments {THREE.EventDispatcher<DataViewEventMap>}
 */
export class DataView extends THREE.EventDispatcher {

    /**
     * The data to display, if any.
     * 
     * @type {?D}
     * @abstract
     */
    get data() { throw new Error('Not implemented'); }

    /**
     * The frame for which the data is displayed.
     * 
     * @type {?EditableFrame}
     * @abstract
     */
    get frame() { throw new Error('Not implemented'); }

    /**
     * `true` if the data to display is being loaded; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get isLoading() { throw new Error('Not implemented'); }

    /**
     * Displays the data for the given frame, loading the corresponding data if necessary.
     * 
     * @param {?EditableFrame} frame The frame to display the data for.
     * @returns {Promise<void>} A promise representing the task.
     * @abstract
     */
    async setFrame(frame) {
        throw new Error('Not implemented');
    }

    /**
     * Requests that data be loaded in memory for a frame, and returns it.
     * 
     * @param {EditableFrame} frame The frame to load the data for.
     * @returns {Promise<?D>} A promise that resolves to the requested data; fallbacks
     * to `null` if the request has failed.
     * @abstract
     */
    async getData(frame) {
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
 * Represents a view of some data that updates based on the active frame.
 * 
 * @template {{} | null} D The type of data to display.
 * @implements {DataView<D>}
 * @augments THREE.EventDispatcher<DataViewEventMap>
 */
export class BaseDataView extends THREE.EventDispatcher {

    /**
     * @type {?D}
     */
    #data;

    /**
     * The data to display, if any.
     * 
     * @type {?D}
     */
    get data() { return this.#data; }

    /**
     * @protected
     * @type {?EditableFrame}
     */
    _frame;

    /**
     * The frame for which the data is displayed.
     * 
     * @type {?EditableFrame}
     */
    get frame() { return this._frame; }

    /**
     * Ensures that all load operations are run sequentially.
     * 
     * @type {Queue<symbol>}
     */
    #loadQueue = new Queue(1, 0);

    /**
     * `true` if the data to display is being loaded; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get isLoading() {
        const { waiting, running } = this.#loadQueue.stat();
        return waiting > 0 || running > 0;
    }

    /**
     * Creates a new view of some data that updates based on the active frame.
     * 
     * @param {DataLoader<D>} loader Loads the data from the server on demand.
     */
    constructor(loader) {
        super();

        this.loader = loader;

        this.#data = null;
        this._frame = null;
    }

    /**
     * Updates the data stored in this layer according to its current state.
     * 
     * Note that display data is set to `null` while waiting for it to load.
     * You can listen to this change through the `'beforeload'` event.
     * 
     * @protected
     * @returns {Promise<void>} A promise representing the task.
     */
    async _reloadData() {
        return this.#loadQueue.run(async () => {
            this.dispatchEvent({ type: 'beforeload' });

            this.#data = null;

            if (this.frame != null) {
                this.#data = await this.getData(this.frame);
            }
        }).finally(() => {
            this.dispatchEvent({ type: 'afterload' });
        });
    }

    /**
     * Displays the data for the given frame, loading the corresponding data if necessary.
     * 
     * @param {?EditableFrame} frame The frame to display the data for.
     * @returns {Promise<void>} A promise representing the task.
     * @abstract
     */
    async setFrame(frame) {
        if (this._frame?.id === frame?.id) return;

        // Set before loading the data so that repeated calls only invoke _reloadData once
        this._frame = frame;

        await this._reloadData();
    }

    /**
     * Requests that data be loaded in memory for a frame, and returns it.
     * 
     * @param {EditableFrame} frame The frame to load the data for.
     * @returns {Promise<?D>} A promise that resolves to the requested data; fallbacks
     * to `null` if the request has failed.
     */
    async getData(frame) {
        return this.loader.getData(frame).catch((reason) => {
            console.error('Failed to get data at:', { frame }, 'Reason:', reason);
            return null;
        });
    }

    /**
     * Tests whether the data for a frame is in the cache.
     * 
     * @param {EditableFrame} frame The frame to load the data for.
     * @returns {boolean} `true` if the data for a frame is in the cache; otherwise, `false`.
     */
    isCached(frame) {
        return this.loader.isCached(frame);
    }
}

/**
 * Represents a view of source data that updates based on the active frame.
 * 
 * @template {{} | null} D The type of source data to load.
 * @augments {BaseDataView<D>}
 */
export class SourceDataView extends BaseDataView {

    /**
     * Creates a new view of source data that updates based on the active frame.
     * 
     * @param {DataLoader<D>} loader Loads the data from the server on demand.
     */
    constructor(loader) {
        super(loader);
    }
}

/**
 * Represents a view of label data that updates based on the active frame.
 * 
 * @template {{} | null} D The type of label data to load.
 * @augments {BaseDataView<D>}
 */
export class LabelDataView extends BaseDataView {

    /**
     * A handle to the state of the scene.
     * 
     * @readonly
     * @type {SceneContext}
     */
    context;

    /**
     * The currently selected label branch, or `null` if none.
     * 
     * @type {?EditableBranch}
     */
    get currentBranch() { return this.context.currentLabelBranch; }

    /**
     * Creates a new view of label data that updates based on the active frame.
     * 
     * @param {DataLoader<D>} loader Loads the data from the server on demand.
     * @param {SceneContext} context A handle to the state of the scene.
     */
    constructor(loader, context) {
        super(loader);

        this.context = context;
    }
}
