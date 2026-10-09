import { LayerBasedPaneController } from './LayerBasedPane';

/* eslint-disable max-len */
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
 * @typedef {import('../../widgets').PaneControllerDataTypes} PaneControllerDataTypes
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('../../widgets').PaneControllerChangeEvent<P>} PaneControllerChangeEvent
 */

/**
 * @typedef {import('./LayerBasedPane').LayerBasedPaneControllerParams} LayerBasedPaneControllerParams
 */
/* eslint-enable max-len */

/**
 * A display for the information of the selected layer in a {@link LayerCollection}.
 * 
 * When another layer is selected in the {@link LayerCollection}, this display is automatically
 * updated; however, when the user selects a layer through this display, the {@link LayerCollection}
 * is not updated.
 */
export class LayerBasedView {

    /**
     * The DOM element representing this display.
     * 
     * @readonly
     * @type {HTMLDivElement}
     */
    dom;

    /**
     * A function that returns a DOM element containing the information of a layer.
     * 
     * @readonly
     * @type {(layer: SceneLayer) => HTMLElement}
     */
    getLayerDom;

    /**
     * @readonly
     * @type {LayerBasedPaneController}
     */
    #pane;

    /**
     * The collection of layers to select from.
     * 
     * @readonly
     * @type {LayerCollection}
     */
    layers;

    /**
     * @type {?SceneLayer}
     */
    #selectedLayer;

    /**
     * The layer that is being selected, if any.
     * 
     * @type {?SceneLayer}
     */
    get selectedLayer() { return this.#selectedLayer; }

    set selectedLayer(value) {
        if (this.#selectedLayer !== value) {
            this.#selectedLayer = value;

            this.#render();
        }
    }

    /**
     * @type {boolean}
     */
    #disabled = false;

    /**
     * `true` if this input is disabled; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get disabled() { return this.#disabled; }

    set disabled(value) {
        if (this.#disabled !== value) {
            this.#disabled = value;

            this.#render();
        }
    }

    /**
     * Updates the view according to the data in this object.
     */
    #render() {
        this.#pane.updateState({
            inputtedData: {
                selectedLayer: this.#selectedLayer,
            },
            settings: {
                disabled: this.#disabled,
            },
        });
    }

    /**
     * Handles the event when an input in the pane has been changed.
     * 
     * @param {PaneControllerChangeEvent<LayerBasedPaneControllerParams>} event
     * The event to handle.
     */
    #onPaneChange = (event) => {
        this.selectedLayer = event.outputData.selectedLayer;
    };

    /**
     * Handles the event when another layer becomes active.
     * 
     * @param {LayerCollectionEventMap['layer-activate']} event The event to handle.
     */
    #onLayerActivate = (event) => {
        this.selectedLayer = event.activeLayer;
    };

    /**
     * 
     * Creates a new display for the information of the selected layer in a
     * {@link LayerCollection}.
     * 
     * @param {LayerCollection} layers The collection of layers to select from.
     * @param {(layer: SceneLayer) => HTMLElement} getLayerDom A function that
     * returns a DOM element containing the information of a layer.
     */
    constructor(layers, getLayerDom) {
        this.layers = layers;
        this.getLayerDom = getLayerDom;

        this.dom = document.createElement('div');
        {
            this.#pane = LayerBasedPaneController.create(
                this.dom, this.getLayerDom,
                { internalData: { layers } },
            );
            this.#pane.addEventListener('change', this.#onPaneChange);
        }

        this.layers.addEventListener('layer-activate', this.#onLayerActivate);

        this.#selectedLayer = this.layers.activeLayer;

        this.#render();
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.layers.removeEventListener('layer-activate', this.#onLayerActivate);

        this.#pane.removeEventListener('change', this.#onPaneChange);
        this.#pane.dispose();
    }
}
