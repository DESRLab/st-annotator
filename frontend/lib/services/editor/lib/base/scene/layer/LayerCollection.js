import * as THREE from 'three';

import { DataLayer, LabelDataLayer, SourceDataLayer } from './DataLayer';

import { ComposableKeybindHandler } from '../../app/Keybinds';

/**
 * @template T
 * @typedef {import('../../../../../../common/lib/utils').TypeUtils.TypeGuard<T>} TypeGuard
 */

/**
 * @typedef {import('../display').WindowMapper} WindowMapper
 */

/**
 * @template {WindowMapper} WM
 * @typedef {import('./SceneLayer').SceneLayer<WM>} SceneLayer
 */

/**
 * @template {WindowMapper} WM The windows defined in the scene display.
 * @typedef {Record<string, SceneLayer<WM>>} LayerMapper
 */

/**
 * Represents an event dispatched by {@link LayerCollection}.
 * 
 * @template {WindowMapper} WM The windows defined in the scene display.
 * @typedef {object} LayerCollectionEventMap
 * @property {{ activeLayer: ?SceneLayer<WM> }} layer-activate The event when another layer
 * becomes active.
 */

/**
 * Represents a collection of layers.
 * 
 * @template {WindowMapper} WM The windows defined in the scene display.
 * @augments {THREE.EventDispatcher<LayerCollectionEventMap<WM>>}
 */
export class LayerCollection extends THREE.EventDispatcher {

    /**
     * The {@link THREE.Object3D#renderOrder} applied to each layer depending on
     * its status.
     */
    static RENDER_ORDER = {
        SOURCE_DATA: -1,
        DEFAULT: 0,
        LABEL_DATA: 1,
        ACTIVE: 2,
    };

    /**
     * Handles the event when a key is pressed in this menu.
     * 
     * @readonly
     * @type {ComposableKeybindHandler}
     */
    keydownHandler;

    /**
     * Handles the event when a key is released in this menu.
     * 
     * @readonly
     * @type {ComposableKeybindHandler}
     */
    keyupHandler;

    /**
     * Contains each layer in this collection.
     * 
     * @readonly
     * @type {LayerMapper<WM>}
     */
    #layers;

    /**
     * An array containing each layer in this collection.
     * 
     * @type {ReadonlyArray<SceneLayer<WM>>}
     */
    get allLayers() { return Object.values(this.#layers); }

    /**
     * An array containing each data layer in this collection.
     * 
     * @type {ReadonlyArray<DataLayer<WM, any>>}
     */
    get dataLayers() {
        return this.allLayers.filter(
            /** @type {TypeGuard<DataLayer<WM, any>>} */
            ((layer) => layer instanceof DataLayer),
        );
    }

    /**
     * An array containing each source data layer in this collection.
     * 
     * @type {ReadonlyArray<SourceDataLayer<WM, any>>}
     */
    get sourceDataLayers() {
        return this.allLayers.filter(
            /** @type {TypeGuard<SourceDataLayer<WM, any>>} */
            ((layer) => layer instanceof SourceDataLayer),
        );
    }

    /**
     * An array containing each label data layer in this collection.
     * 
     * @type {ReadonlyArray<LabelDataLayer<WM, any>>}
     */
    get labelDataLayers() {
        return this.allLayers.filter(
            /** @type {TypeGuard<LabelDataLayer<WM, any>>} */
            ((layer) => layer instanceof LabelDataLayer),
        );
    }

    /**
     * @type {?SceneLayer<WM>}
     */
    #activeLayer = null;

    /**
     * The layer that is currently active, or `null` if none.
     * 
     * Note that disabled layers cannot be set as active; attempting to do so results in a no-op.
     * 
     * @type {?SceneLayer<WM>}
     */
    get activeLayer() { return this.#activeLayer; }

    set activeLayer(value) {
        if (value != null && !value.state.enabled) {
            console.warn('Cannot activate a disabled layer');
            return;
        }

        if (this.#activeLayer !== value) {
            this.#activeLayer = value;
            this.keydownHandler.setChildren((value == null) ? [] : [value.keydownHandler]);
            this.keyupHandler.setChildren((value == null) ? [] : [value.keyupHandler]);

            this.dispatchEvent({ type: 'layer-activate', activeLayer: value });
        }
    }

    /**
     * Gets the layer with the given key.
     * 
     * @param {string} key The query key.
     * @returns {SceneLayer<WM>} The corresponding layer.
     * @throws {Error} If no such layer exists.
     */
    getLayer(key) {
        if (key in this.#layers) return this.#layers[key];

        throw new Error(`Cannot find layer with key: ${key}`);
    }

    /**
     * A container of the `three.js` objects to include in the scene.
     * 
     * This container and its children should be in world space,
     * rather than being relative to the current frame.
     * 
     * @readonly
     * @type {THREE.Group}
     */
    objects;

    /**
     * A container of the overlay of each layer.
     * 
     * @readonly
     * @type {HTMLDivElement}
     */
    overlays;

    #onLayerStateUpdate = () => {
        if (this.activeLayer != null && !this.activeLayer.state.enabled) {
            this.activeLayer = null;
        }
    };

    /**
     * Creates a new collection of layers.
     * 
     * @param {LayerMapper<WM>} layers The layers to include in the collection.
     * Ownership is transferred to this object.
     * @param {?SceneLayer<WM>} activeLayer The layer to set as the active one,
     * or `null` (default) if none.
     */
    constructor(layers, activeLayer = null) {
        super();

        this.keydownHandler = new ComposableKeybindHandler();
        this.keyupHandler = new ComposableKeybindHandler();

        this.#layers = layers;
        this.activeLayer = activeLayer;     // Invoke the setter

        this.objects = new THREE.Group();

        this.overlays = document.createElement('div');
        this.overlays.id = 'overlays-container';
        this.overlays.style.position = 'absolute';
        this.overlays.style.top = '0';
        this.overlays.style.left = '0';
        this.overlays.style.width = '100%';
        this.overlays.style.height = '100%';
        this.overlays.style.pointerEvents = 'none';
        this.overlays.style.touchAction = 'none';

        for (const layer of this.allLayers) {
            this.overlays.appendChild(layer.overlayElem);
            layer.state.addEventListener('change', this.#onLayerStateUpdate);
        }
    }

    /**
     * Gets the text to display as a hint to the user.
     * 
     * If the text is an empty string, no hint is displayed.
     * 
     * @returns {string} The requested hint.
     */
    getHint() {
        return this.activeLayer?.getHint() ?? '';
    }

    /**
     * Updates the `three.js` objects and the DOM elements of each layer
     * in this collection.
     * 
     * It is called during each animation frame.
     */
    render() {
        const activeLayer = this.activeLayer;
        const RENDER_ORDER = LayerCollection.RENDER_ORDER;

        this.objects.clear();

        for (const layer of Object.values(this.#layers)) {
            layer.render();

            const layerObjects = layer.objects;
            const layerOverlay = layer.overlayElem;
            const layerWindows = layer.context.display.windows;

            for (const [key, window] of Object.entries(layerWindows)) {
                // Layers setting does not propagate to children automatically,
                // so we need to traverse the descendents and set it one by one
                if (layer.state.enabled && layer.state.isVisible(key)) {
                    layerObjects.traverse((obj) => {
                        obj.layers.enable(window.layerId);
                    });
                } else {
                    layerObjects.traverse((obj) => {
                        obj.layers.disable(window.layerId);
                    });
                }
            }

            if (layer === activeLayer) {
                layerObjects.renderOrder = RENDER_ORDER.ACTIVE;
                layerOverlay.style.zIndex = RENDER_ORDER.ACTIVE.toString();
            } else if (layer instanceof LabelDataLayer) {
                layerObjects.renderOrder = RENDER_ORDER.LABEL_DATA;
                layerOverlay.style.zIndex = RENDER_ORDER.LABEL_DATA.toString();
            } else if (layer instanceof SourceDataLayer) {
                layerObjects.renderOrder = RENDER_ORDER.SOURCE_DATA;
                layerOverlay.style.zIndex = RENDER_ORDER.SOURCE_DATA.toString();
            } else {
                layerObjects.renderOrder = RENDER_ORDER.DEFAULT;
                layerOverlay.style.zIndex = RENDER_ORDER.DEFAULT.toString();
            }

            this.objects.add(layerObjects);
        }
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        for (const layer of Object.values(this.#layers)) {
            layer.state.removeEventListener('change', this.#onLayerStateUpdate);
            layer.dispose();
        }

        this.keydownHandler.dispose();
        this.keyupHandler.dispose();
    }
}
