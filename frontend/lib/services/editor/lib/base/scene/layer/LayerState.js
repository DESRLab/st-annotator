import * as THREE from 'three';

/**
 * @template {WindowMapper} WM
 * @typedef {import('../display').SceneDisplay<WM>} SceneDisplay
 */

/**
 * @typedef {import('../display').WindowMapper} WindowMapper
 */

/**
 * @typedef {import('./SceneLayer').SceneLayer<any>} SceneLayer
 */

/**
 * Defines each event that can be dispatched by {@link LayerState}.
 * 
 * @typedef {object} LayerStateEventMap
 * @property {{}} change The event when the state of the layer has been updated.
 */

/**
 * Represents the state of a layer.
 * 
 * @template {WindowMapper} WM The windows defined in the scene display.
 * @augments THREE.EventDispatcher<LayerStateEventMap>
 */
export class LayerState extends THREE.EventDispatcher {

    /**
     * A handle to the display of the scene.
     * 
     * @readonly
     * @type {SceneDisplay<WM>}
     */
    display;

    /**
     * @type {boolean}
     */
    #enabled;

    /**
     * `true` if the layer is enabled; otherwise, `false`.
     * 
     * When the layer is disabled, its `three.js` objects are prevented from being
     * displayed in the application, regardless of the setting of {@link LayerState#isVisible}.
     * 
     * Implementators of {@link SceneLayer} should prevent user interaction with
     * the layer while it is disabled.
     * 
     * @type {boolean}
     */
    get enabled() { return this.#enabled; }

    set enabled(value) {
        if (this.#enabled !== value) {
            this.#enabled = value;

            this.dispatchEvent({ type: 'change' });
        }
    }

    /**
     * @type {Record<string, boolean>}
     */
    #visible;

    /**
     * Instantiates a new state for a layer.
     * 
     * @param {SceneDisplay<WM>} display A handle to the display of the scene.
     */
    constructor(display) {
        super();

        this.display = display;

        this.#enabled = true;

        this.#visible = Object.fromEntries(Object.keys(display.windows).map((k) => [k, true]));
    }

    /**
     * Tests whether the layer is visible in a window.
     * 
     * @param {(keyof WM) & string} key The key of the window.
     * @returns {boolean} `true` if the layer is visible in that window; otherwise, `false`.
     */
    isVisible(key) {
        return this.#visible[key];
    }

    /**
     * Sets whether the layer is visible in a window.
     * 
     * @param {(keyof WM) & string} key The key of the window.
     * @param {boolean} value `true` if the layer is visible in that window; otherwise, `false`.
     */
    setVisible(key, value) {
        if (this.#visible[key] !== value) {
            this.#visible[key] = value;

            this.dispatchEvent({ type: 'change' });
        }
    }
}
