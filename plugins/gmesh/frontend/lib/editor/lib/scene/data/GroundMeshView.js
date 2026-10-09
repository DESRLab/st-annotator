import { UnitDataLoader, SourceDataView } from 'sta/services/editor/base';

import { GroundMeshLookup } from './GroundMeshLookup';

/**
 * @template {WindowMapper} WM
 * @typedef {import('sta/services/editor/base').SceneContext<WM>} SceneContext
 */

/**
 * @typedef {import('sta/services/editor/base').WindowMapper} WindowMapper
 */

/**
 * @typedef {import('./GroundMesh').GroundMesh} GroundMesh
 */

/**
 * Given a frame, loads ground mesh data for that single frame.
 * 
 * @augments UnitDataLoader<?GroundMesh>
 */
export class GroundMeshLoader extends UnitDataLoader {

    /**
     * Finds the data for each frame.
     * 
     * @readonly
     * @type {GroundMeshLookup}
     */
    #lookup;

    /**
     * Creates a new data loader for single frames.
     * 
     * @param {GroundMeshLookup} lookup Finds the data for each frame.
     */
    constructor(lookup) {
        super(lookup);

        this.#lookup = lookup;
    }
}

/**
 * Represents a view of a ground mesh that updates based on the active frame.
 * 
 * @augments SourceDataView<?GroundMesh>
 */
export class GroundMeshView extends SourceDataView {

    /**
     * Loads the data from the backend on demand.
     * 
     * @readonly
     * @type {GroundMeshLoader}
     */
    #loader;

    /**
     * Creates a new view of ground mesh data that updates based on the active frame.
     * 
     * @param {SceneContext<any>} context A handle to the state of the scene.
     * @param {number} [maxCacheSize] The maximum size of the data cache. Defaults to the value
     * provided in `context.config`.
     * @returns {GroundMeshView} The newly created data view.
     */
    static create(context, maxCacheSize = undefined) {
        const { config, views } = context;
        const lookup = GroundMeshLookup.create(config, views, maxCacheSize);
        const loader = new GroundMeshLoader(lookup);

        return new GroundMeshView(loader);
    }

    /**
     * Creates a new view of ground mesh data that updates based on the active frame.
     * 
     * @param {GroundMeshLoader} loader Loads the data from the server on demand.
     */
    constructor(loader) {
        super(loader);

        this.#loader = loader;
    }
}
