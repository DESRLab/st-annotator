import { BaseSceneLayer } from './SceneLayer';

/**
 * @template {{} | null} D
 * @typedef {import('../../data').DataView<D>} DataView
 */

/**
 * @typedef {import('../display').WindowMapper} WindowMapper
 */

/**
 * @template {WindowMapper} WM
 * @typedef {import('../SceneContext').SceneContext<WM>} SceneContext
 */

/**
 * Represents a layer that displays data in the scene.
 * 
 * @template {WindowMapper} WM The windows defined in the scene display.
 * @template {{} | null} D The type of data to display.
 * @augments {BaseSceneLayer<WM>}
 */
export class DataLayer extends BaseSceneLayer {

    /**
     * A view of the data to display in this layer.
     * 
     * @readonly
     * @type {DataView<D>}
     */
    dataView;

    /**
     * Contains logic to run before the data to display is switched to a different one.
     * 
     * @protected
     */
    onBeforeUpdateData() {}

    /**
     * Contains logic to run after the data to display is switched to a different one.
     * 
     * @protected
     */
    onAfterUpdateData() {}

    /**
     * Handles the event before the data to display is switched to a different one.
     */
    #onBeforeUpdateData = () => {
        this.onBeforeUpdateData();
    };

    /**
     * Handles the event after the data to display is switched to a different one.
     */
    #onAfterUpdateData = () => {
        this.onAfterUpdateData();
    };

    /**
     * Creates a new data layer.
     * 
     * @param {SceneContext<WM>} context A handle to the state of the scene.
     * @param {string} name The display name of this layer.
     * @param {DataView<D>} dataView A view of the data to display in the layer.
     */
    constructor(context, name, dataView) {
        super(context, name);

        this.dataView = dataView;
        this.dataView.addEventListener('beforeload', this.#onBeforeUpdateData);
        this.dataView.addEventListener('afterload', this.#onAfterUpdateData);
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.dataView.removeEventListener('beforeload', this.#onBeforeUpdateData);
        this.dataView.removeEventListener('afterload', this.#onAfterUpdateData);

        super.dispose();
    }
}

/**
 * Represents a layer that displays source data in the scene.
 * 
 * @template {WindowMapper} WM The windows defined in the scene display.
 * @template {{} | null} D The type of data to display.
 * @augments {DataLayer< WM, D>}
 */
export class SourceDataLayer extends DataLayer {}

/**
 * Represents a layer that displays label data in the scene.
 * 
 * @template {WindowMapper} WM The windows defined in the scene display.
 * @template {{} | null} D The type of data to display.
 * @augments {DataLayer<WM, D>}
 */
export class LabelDataLayer extends DataLayer {}
