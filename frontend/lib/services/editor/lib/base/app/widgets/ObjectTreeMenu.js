import { ActiveLayerView } from './ActiveLayerView';
import { BaseMenu } from './Menu';

/**
 * @typedef {import('../../scene').LayerCollection<any>} LayerCollection
 */

/**
 * Displays the objects in the active layer.
 */
export class ObjectTreeMenu extends BaseMenu {

    /**
     * @readonly
     * @type {ActiveLayerView}
     */
    #activeLayerObjectTree;

    /**
     * Contains each layer in the application.
     * 
     * @type {LayerCollection}
     */
    get layers() { return this.#activeLayerObjectTree.layers; }

    /**
     * Creates a new menu for the objects in the active layer.
     * 
     * @param {LayerCollection} layers Contains each layer in the application.
     */
    constructor(layers) {
        super();

        this.#activeLayerObjectTree = new ActiveLayerView(layers, (layer) => layer.objectTreeElem);
        this.dom.appendChild(this.#activeLayerObjectTree.dom);
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#activeLayerObjectTree.dispose();

        super.dispose();
    }
}
