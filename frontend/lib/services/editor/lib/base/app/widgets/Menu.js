import { ComposableKeybindHandler } from '../Keybinds';

/**
 * @typedef {import('../Keybinds').Keybind} Keybind
 */

/**
 * Interface for objects that represent a menu in the application.
 * 
 * @interface
 */
export class Menu {

    /**
     * The DOM element representing this menu.
     * 
     * @type {HTMLDivElement}
     * @abstract
     */
    get dom() { throw new Error('Not implemented'); }

    /**
     * Handles the event when a key is pressed in this menu.
     * 
     * @readonly
     * @type {ComposableKeybindHandler}
     * @abstract
     */
    get keydownHandler() { throw new Error('Not implemented'); }

    /**
     * Handles the when when a key is released in this menu.
     * 
     * @readonly
     * @type {ComposableKeybindHandler}
     * @abstract
     */
    get keyupHandler() { throw new Error('Not implemented'); }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        throw new Error('Not implemented');
    }
}

/**
 * Base implementation of {@link Menu}.
 * 
 * @implements {Menu}
 */
export class BaseMenu {

    /**
     * The DOM element representing this menu.
     * 
     * @readonly
     * @type {HTMLDivElement}
     */
    dom;

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
     * Creates a new menu in the application.
     */
    constructor() {
        this.dom = document.createElement('div');
        this.keydownHandler = new ComposableKeybindHandler();
        this.keyupHandler = new ComposableKeybindHandler();
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.keydownHandler.dispose();
        this.keyupHandler.dispose();
    }

    /**
     * Updates the `three.js` objects and the DOM elements of this layer.
     * It is called during each animation frame while this layer is displayed.
     */
    render() {
        // No-op by default
    }
}
