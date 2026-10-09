import * as THREE from 'three';

import { LayerState } from './LayerState';

import { ComposableKeybindHandler } from '../../app/Keybinds';

/**
 * @typedef {import('../display').WindowMapper} WindowMapper
 */

/**
 * @template {WindowMapper} WM
 * @typedef {import('../SceneContext').SceneContext<WM>} SceneContext
 */

/**
 * Interface for objects that represent a layer in the scene.
 * 
 * @interface
 * @template {WindowMapper} WM The windows defined in the scene display.
 */
export class SceneLayer {

    /**
     * A handle to the state of the scene.
     * 
     * @type {SceneContext<WM>}
     * @abstract
     */
    get context() { throw new Error('Not implemented'); }

    /**
     * The display name of this layer.
     * 
     * @type {string}
     * @abstract
     */
    get name() { throw new Error('Not implemented'); }

    /**
     * The state of this layer.
     * 
     * @type {LayerState<WM>}
     * @abstract
     */
    get state() { throw new Error('Not implemented'); }

    /**
     * A container of the `three.js` objects to include in the scene
     * when this layer is displayed.
     * 
     * This container and its children should be in world space,
     * rather than being relative to the current frame.
     * 
     * @type {THREE.Group}
     * @abstract
     */
    get objects() { throw new Error('Not implemented'); }

    /**
     * A DOM element that is shown in the Actions column of the Layers panel.
     * 
     * @type {HTMLDivElement}
     * @abstract
     */
    get actionsElem() { throw new Error('Not implemented'); }

    /**
     * A DOM element that is shown over the window of the application
     * when this layer is displayed.
     * 
     * @type {HTMLDivElement}
     * @abstract
     */
    get overlayElem() { throw new Error('Not implemented'); }

    /**
     * A DOM element that is shown in the Tools panel
     * when this layer is active.
     * 
     * @type {HTMLDivElement}
     * @abstract
     */
    get toolsElem() { throw new Error('Not implemented'); }

    /**
     * A DOM element that is shown in the Preferences panel
     * when this layer is active.
     * 
     * @type {HTMLDivElement}
     * @abstract
     */
    get prefsElem() { throw new Error('Not implemented'); }

    /**
     * A DOM element that is shown in the Scene Objects panel
     * when this layer is active.
     * 
     * @type {HTMLDivElement}
     * @abstract
     */
    get objectTreeElem() { throw new Error('Not implemented'); }

    /**
     * A DOM element that is shown in the Controls panel
     * when this layer is active.
     * 
     * @type {HTMLDivElement}
     * @abstract
     */
    get controlsElem() { throw new Error('Not implemented'); }

    /**
     * Handles the event when a key is pressed in this layer.
     * 
     * @readonly
     * @type {ComposableKeybindHandler}
     * @abstract
     */
    get keydownHandler() { throw new Error('Not implemented'); }

    /**
     * Handles the when when a key is released in this layer.
     * 
     * @readonly
     * @type {ComposableKeybindHandler}
     * @abstract
     */
    get keyupHandler() { throw new Error('Not implemented'); }

    /**
     * Gets the text to display as a hint to the user when this layer is active.
     * 
     * If the text is an empty string, no hint is displayed.
     * 
     * @returns {string} The requested hint.
     * @abstract
     */
    getHint() {
        throw new Error('Not implemented');
    }

    /**
     * Updates the `three.js` objects and the DOM elements of this layer.
     * It is called during each animation frame while this layer is displayed.
     * 
     * @abstract
     */
    render() {
        throw new Error('Not implemented');
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     * 
     * @abstract
     */
    dispose() {
        throw new Error('Not implemented');
    }
}

/**
 * Abstract base implementation of {@link SceneLayer}.
 * 
 * @template {WindowMapper} WM The windows defined in the scene display.
 * @implements {SceneLayer<WM>}
 */
export class BaseSceneLayer {

    /**
     * A handle to the state of the scene.
     * 
     * @readonly
     * @type {SceneContext<WM>}
     */
    context;

    /**
     * The display name of this layer.
     * 
     * @readonly
     * @type {string}
     */
    name;

    /**
     * The state of this layer.
     * 
     * @readonly
     * @type {LayerState<WM>}
     */
    state;

    /**
     * A container of the `three.js` objects to include in the scene
     * when this layer is displayed.
     * 
     * This container and its children should be in world space,
     * rather than being relative to the current frame.
     * 
     * @readonly
     * @type {THREE.Group}
     */
    objects;

    /**
     * A DOM element that is shown in the Actions column of the Layers panel.
     * 
     * @readonly
     * @type {HTMLDivElement}
     */
    actionsElem;

    /**
     * A DOM element that is shown over the window of the application
     * when this layer is displayed.
     * 
     * @readonly
     * @type {HTMLDivElement}
     */
    overlayElem;

    /**
     * A DOM element that is shown in the Tools panel
     * when this layer is active.
     * 
     * @readonly
     * @type {HTMLDivElement}
     */
    toolsElem;

    /**
     * A DOM element that is shown in the Preferences panel
     * when this layer is active.
     * 
     * @readonly
     * @type {HTMLDivElement}
     */
    prefsElem;

    /**
     * A DOM element that is shown in the Scene Objects panel
     * when this layer is active.
     * 
     * @readonly
     * @type {HTMLDivElement}
     */
    objectTreeElem;

    /**
     * A DOM element that is shown in the Controls panel
     * when this layer is active.
     * 
     * @readonly
     * @type {HTMLDivElement}
     */
    controlsElem;

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
     * `true` if this layer is the currently active one; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get isActive() { return this.context.isLayerActive(this); }

    /**
     * Creates a new data layer.
     * 
     * @protected
     * @param {SceneContext<WM>} context A handle to the state of the scene.
     * @param {string} name The display name of this layer.
     */
    constructor(context, name) {
        this.context = context;
        this.name = name;
        this.state = new LayerState(context.display);

        this.objects = new THREE.Group();

        this.actionsElem = this.makeDefaultElem('(None)');
        this.actionsElem.style.justifyContent = '';

        this.overlayElem = document.createElement('div');
        this.overlayElem.style.position = 'absolute';
        this.overlayElem.style.top = '0';
        this.overlayElem.style.left = '0';
        this.overlayElem.style.width = '100%';
        this.overlayElem.style.height = '100%';

        this.toolsElem = this.makeDefaultElem('(No tools available)');
        this.prefsElem = this.makeDefaultElem('(No options available)');
        this.objectTreeElem = this.makeDefaultElem('(No objects available)');
        this.controlsElem = this.makeDefaultElem('(No controls available)');

        this.keydownHandler = new ComposableKeybindHandler();
        this.keyupHandler = new ComposableKeybindHandler();
    }

    /**
     * Gets the text to display as a hint to the user when this layer is active.
     * 
     * If the text is an empty string, no hint is displayed.
     * 
     * @returns {string} The requested hint.
     */
    getHint() {
        return '';
    }

    /**
     * Updates the `three.js` objects and the DOM elements of this layer.
     * It is called during each animation frame while this layer is displayed.
     */
    render() {
        // No-op by default
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.keydownHandler.dispose();
        this.keyupHandler.dispose();
    }
}
