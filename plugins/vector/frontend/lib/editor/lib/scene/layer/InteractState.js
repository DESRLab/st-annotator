import { ComposableKeybindHandler } from 'sta/services/editor/base';

/**
 * @typedef {import('sta/services/editor/base').Keybind} Keybind
 */

/**
 * @typedef {import('./InteractContext').MainWindowMapper} MainWindowMapper
 */

/**
 * @template {MainWindowMapper} WM
 * @typedef {import('./InteractContext').InteractContext<WM>} InteractContext
 */

/**
 * @typedef {import('./InteractContext').InteractContextUsage} InteractContextUsage
 */

/**
 * @template {MainWindowMapper} WM The windows defined in the scene display.
 * @typedef {object} InteractStateParams
 * @property {InteractContext<WM>} context The context containing the state.
 * @property {ReadonlyArray<Keybind>} [keydownBinds=[]] Keybinds that activate
 * when a key is pressed in the menu.
 * @property {ReadonlyArray<Keybind>} [keyupBinds=[]] Keybinds that activate
 * when a key is released in the menu.
 */

/**
 * Represents a state that a {@link InteractContext} can take.
 * 
 * @template {MainWindowMapper} WM The windows defined in the scene display.
 */
export class InteractState {

    /**
     * The context containing this state.
     * 
     * @readonly
     * @type {InteractContext<WM>}
     */
    context;

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
     * Creates a new state instance.
     * 
     * This is called right before the state of the context is transitioned to this one.
     * 
     * @param {InteractStateParams<WM>} params The parameters of the state.
     */
    constructor({ context, keydownBinds = [], keyupBinds = [] }) {
        this.context = context;
        this.keydownHandler = new ComposableKeybindHandler(keydownBinds);
        this.keyupHandler = new ComposableKeybindHandler(keyupBinds);
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     * 
     * This is called right before the state of the context is transitioned from this one.
     */
    dispose() {
        this.keydownHandler.dispose();
        this.keyupHandler.dispose();
    }

    /**
     * Specifies how this state uses the context.
     * 
     * This is called during each animation frame, and when an event is emitted by a component.
     * 
     * @abstract
     * @param {boolean} isReadonly `true` if the labels cannot be edited; otherwise, `false`.
     * @returns {InteractContextUsage} The requested information.
     */
    getUsage(isReadonly) {
        throw new Error('Not implemented');
    }

    /**
     * Gets the text to display as a hint to the user when this layer is active.
     * 
     * If the text is an empty string, no hint is displayed.
     * 
     * @abstract
     * @param {boolean} isReadonly `true` if the labels cannot be edited; otherwise, `false`.
     * @returns {string} The requested hint.
     */
    getHint(isReadonly) {
        throw new Error('Not implemented');
    }
}
