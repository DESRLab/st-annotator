import { ActiveLayerView } from './ActiveLayerView';
import { BaseMenu } from './Menu';

/**
 * @typedef {import('../../scene').LayerCollection<any>} LayerCollection
 */

/**
 * Displays the tools of the active layer.
 */
export class ToolsMenu extends BaseMenu {

    /**
     * @readonly
     * @type {ActiveLayerView}
     */
    #activeLayerTools;

    /**
     * Contains each layer in the application.
     * 
     * @type {LayerCollection}
     */
    get layers() { return this.#activeLayerTools.layers; }

    /**
     * Creates a new menu for the tools of the active layer.
     * 
     * @param {LayerCollection} layers Contains each layer in the application.
     */
    constructor(layers) {
        super();

        this.#activeLayerTools = new ActiveLayerView(layers, (layer) => layer.toolsElem);
        this.dom.appendChild(this.#activeLayerTools.dom);
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#activeLayerTools.dispose();

        super.dispose();
    }
}
