import { UnitDataLoader, SourceDataView } from 'sta/services/editor/base';

import { PointCloudLookup } from './PointCloudLookup';

/**
 * @template {WindowMapper} WM
 * @typedef {import('sta/services/editor/base').SceneContext<WM>} SceneContext
 */

/**
 * @typedef {import('sta/services/editor/base').WindowMapper} WindowMapper
 */

/**
 * @typedef {import('./PointCloud').PointCloud} PointCloud
 */

/**
 * Given a frame, loads point cloud data for that single frame.
 * 
 * @augments UnitDataLoader<?PointCloud>
 */
export class PointCloudLoader extends UnitDataLoader {

    /**
     * Finds the data for each frame.
     * 
     * @readonly
     * @type {PointCloudLookup}
     */
    #lookup;

    /**
     * `true` if background removal is applied server-side; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get removeBackground() { return this.#lookup.removeBackground; }

    set removeBackground(value) { this.#lookup.removeBackground = value; }

    /**
     * `true` if area cropping is applied server-side; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get cropArea() { return this.#lookup.cropArea; }

    set cropArea(value) { this.#lookup.cropArea = value; }

    /**
     * Creates a new data loader for single frames.
     * 
     * @param {PointCloudLookup} lookup Finds the data for each frame.
     */
    constructor(lookup) {
        super(lookup);

        this.#lookup = lookup;
    }
}

/**
 * Represents a view of a point cloud that updates based on the active frame.
 * 
 * @augments SourceDataView<?PointCloud>
 */
export class PointCloudView extends SourceDataView {

    /**
     * Loads the data from the backend on demand.
     * 
     * @readonly
     * @type {PointCloudLoader}
     */
    #loader;

    /**
     * `true` if background removal is applied server-side; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get removeBackground() { return this.#loader.removeBackground; }

    /**
     * `true` if area cropping is applied server-side; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get cropArea() { return this.#loader.cropArea; }

    /**
     * Sets the options for which the data is displayed, loading the corresponding data
     * if necessary.
     * 
     * @param {boolean} removeBackground `true` if background removal is applied server-side;
     * otherwise, `false`.
     * @param {boolean} cropArea `true` if area cropping is applied server-side;
     * otherwise, `false`.
     * @returns {Promise<void>} A promise representing the task.
     */
    async setOptions(removeBackground, cropArea) {
        if (this.#loader.removeBackground === removeBackground
            && this.#loader.cropArea === cropArea) return;

        this.#loader.removeBackground = removeBackground;
        this.#loader.cropArea = cropArea;

        await this._reloadData();
    }

    /**
     * Creates a new view of point cloud data that updates based on the active frame.
     * 
     * @param {SceneContext<any>} context A handle to the state of the scene.
     * @param {number} [maxCacheSize] The maximum size of the data cache. Defaults to the value
     * provided in `context.config`.
     * @returns {PointCloudView} The newly created data view.
     */
    static create(context, maxCacheSize = undefined) {
        const { config, views } = context;
        const lookup = PointCloudLookup.create(config, views, maxCacheSize);
        const loader = new PointCloudLoader(lookup);

        return new PointCloudView(loader);
    }

    /**
     * Creates a new view of point cloud data that updates based on the active frame.
     * 
     * @param {PointCloudLoader} loader Loads the data from the server on demand.
     */
    constructor(loader) {
        super(loader);

        this.#loader = loader;
    }
}
