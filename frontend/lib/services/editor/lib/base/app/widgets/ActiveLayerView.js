/**
 * @typedef {import('../../scene').LayerCollection<any>} LayerCollection
 */

/**
 * @typedef {import('../../scene').LayerCollectionEventMap<any>} LayerCollectionEventMap
 */

/**
 * @typedef {import('../../scene').SceneLayer<any>} SceneLayer
 */

/**
 * Displays a DOM element of the active layer.
 */
export class ActiveLayerView {

    /**
     * Contains each layer in this application.
     * 
     * @readonly
     * @type {LayerCollection}
     */
    layers;

    /**
     * A function that returns the element to display for any given layer.
     * 
     * @readonly
     * @type {(layer: SceneLayer) => HTMLDivElement}
     */
    getDisplay;

    /**
     * The DOM element representing this display.
     * 
     * @readonly
     * @type {HTMLDivElement}
     */
    dom;

    /**
     * Creates a new DOM element to use as the default value.
     * 
     * @protected
     * @param {string} text The text to display at the center of the DOM element.
     * @returns {HTMLDivElement} A newly created DOM element.
     */
    makeDefaultElem(text = '') {
        const elem = document.createElement('div');
        elem.style.width = '100%';
        elem.style.height = '100%';

        elem.style.display = 'flex';
        elem.style.justifyContent = 'center';
        elem.style.alignItems = 'center';
        elem.textContent = text;

        return elem;
    }

    /**
     * Shows the DOM element of a layer.
     * 
     * @param {?SceneLayer} layer The layer which DOM element to display. If no layer is provided,
     * a placeholder element is displayed instead.
     */
    #displayLayer(layer) {
        if (layer == null) {
            this.dom.replaceChildren(this.makeDefaultElem('(No layer selected)'));
        } else {
            this.dom.replaceChildren(this.getDisplay(layer));
        }
    }

    /**
     * Handles the event when another layer becomes active.
     * 
     * @param {LayerCollectionEventMap['layer-activate']} event The event to handle.
     */
    #onLayerActivate = (event) => {
        this.#displayLayer(event.activeLayer);
    };

    /**
     * Creates a new display for a DOM element of the active layer.
     * 
     * @param {LayerCollection} layers A collection containing the active layer.
     * @param {(layer: SceneLayer) => HTMLDivElement} getDisplay A function that returns
     * the element to display for any given layer.
     */
    constructor(layers, getDisplay) {
        this.layers = layers;
        this.layers.addEventListener('layer-activate', this.#onLayerActivate);

        this.getDisplay = getDisplay;

        this.dom = document.createElement('div');
        this.#displayLayer(this.layers.activeLayer);
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.layers.removeEventListener('layer-activate', this.#onLayerActivate);
    }
}
