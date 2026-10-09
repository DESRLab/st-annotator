import { Keystrokes, parseKeyCombo, stringifyKeyCombo } from '@rwh/keystrokes';
import * as THREE from 'three';

/**
 * @template E
 * @typedef {import('@rwh/keystrokes').HandlerFn<E>} HandlerFn
 */

/**
 * @template E
 * @typedef {import('@rwh/keystrokes').HandlerObj<E>} HandlerObj
 */

/**
 * @template T
 * @typedef {import('../../../../../common/lib/utils').TypeUtils.Expand<T>} Expand
 */

const keystrokes = new Keystrokes({
    keyRemap: {
        ' ': 'space',
        control: 'ctrl',
        os: 'meta',     // For Firefox
    },
});

/**
 * Normalizes the string representation of a key combo.
 * 
 * This is to circumvent the error where `normalizeKeyCombo` provided by the `.cjs`
 * module fails to resolve `this`.
 * 
 * @param {string} keyComboStr The input key combo.
 * @returns {string} The normalized key combo.
 */
export function normalizeKeyCombo(keyComboStr) {
    return stringifyKeyCombo(parseKeyCombo(keyComboStr));
}

/**
 * Gets the HTML text to display for a key combo.
 * 
 * @param {string} keyCombo A string representation of the key combo.
 * The key names should be in lowercase. Use `'space'` for spacebar and `'ctrl'` for control key.
 * @returns {string} The text to display for the given key combo.
 */
export function getKeyComboHTMLText(keyCombo) {
    const comboArr = parseKeyCombo(keyCombo);

    return comboArr.map((sequence) => {
        const sequenceStr = sequence.map(
            (group) => group.map((unit) => unit.toUpperCase()).join('+'),
        ).join(' > ');

        return `<kbd>${sequenceStr}</kbd>`;
    }).join(' ');
}

/**
 * Gets the HTML text to display for a keybind.
 * 
 * @param {Keybind} keybind The input keybind.
 * @returns {string} The text to display for the given keyhind.
 */
export function getKeybindHTMLText(keybind) {
    return `${getKeyComboHTMLText(keybind.keyCombo)} ${keybind.name}`;
}

/**
 * @typedef {Parameters<Keystrokes['bindKeyCombo']>[1]} KeyComboEventHandler
 */

/**
 * @typedef {Extract<KeyComboEventHandler, HandlerFn<any>>} KeyComboEventHandlerFn
 */

/**
 * @typedef {Extract<KeyComboEventHandler, HandlerObj<any>>} KeyComboEventHandlerObj
 */

/**
 * @typedef {KeyComboEventHandlerFn extends HandlerFn<infer E> ? E : never} KeyComboEvent
 */

/**
 * @typedef {object} Keybind
 * @property {string} keyCombo The combination of keys that triggers the keybind.
 * The key names should be in lowercase. Use `'space'` for spacebar and `'ctrl'` for control key.
 * @property {string} name The name of the keybind.
 * @property {KeyComboEventHandlerFn} handler Handles the event when the keybind is activated.
 */

/**
 * @interface
 * @see KeybindHandler
 */
export class _KeybindHandler {

    /**
     * The keybinds that have been registered to this handler.
     * 
     * @type {IterableIterator<Keybind>}
     * @abstract
     */
    get keybinds() { throw new Error('Not implemented'); }

    /**
     * Handles the given key event by matching it against the keybinds in this handler.
     * 
     * @param {KeyComboEvent} event The event to handle.
     * @returns {boolean} `true` if the event was handled by this handler.
     * @abstract
     */
    handle(event) {
        throw new Error('Not implemented');
    }
}

/**
 * Defines each event that can be dispatched by {@link KeybindHandler}.
 * 
 * @typedef {object} KeybindHandlerEventMap
 * @property {{}} change The event when the keybinds registered to the handler have been changed.
 */

/**
 * Represents an object that can handle keyboard events.
 * 
 * @typedef {Expand<_KeybindHandler & THREE.EventDispatcher<KeybindHandlerEventMap>>} KeybindHandler
 */

/**
 * Helper class to handle keyboard events.
 * 
 * @augments THREE.EventDispatcher<KeybindHandlerEventMap>
 * @implements {KeybindHandler}
 */
export class BaseKeybindHandler extends THREE.EventDispatcher {

    /**
     * @readonly
     * @type {Map<string, Keybind>}
     */
    #keybindsByNormalizedCombo;

    /**
     * The keybinds that have been registered to this handler.
     * 
     * @type {IterableIterator<Keybind>}
     */
    get keybinds() { return this.#keybindsByNormalizedCombo.values(); }

    /**
     * Creates a new handler for keyboard events.
     * 
     * @param {Iterable<Keybind>} keybinds The keybinds to register to this handler.
     */
    constructor(keybinds = []) {
        super();

        this.#keybindsByNormalizedCombo = new Map();

        for (const keybind of keybinds) {
            this.register(keybind);
        }
    }

    /**
     * Registers a keybind to this handler.
     * 
     * @param {Keybind} keybind The keybind to register.
     * @throws {Error} If such a keybind is already registered.
     */
    register(keybind) {
        const normalizedCombo = normalizeKeyCombo(keybind.keyCombo);
        if (this.#keybindsByNormalizedCombo.has(normalizedCombo)) {
            throw new Error(`Keybind already registed for keyCombo: ${normalizedCombo}`);
        }

        this.#keybindsByNormalizedCombo.set(normalizedCombo, keybind);

        this.dispatchEvent({ type: 'change' });
    }

    /**
     * Deregisters a keybind from this handler.
     * 
     * @param {Keybind} keybind The keybind to deregister.
     * @throws {Error} If no such keybind is registered.
     */
    deregister(keybind) {
        const normalizedCombo = normalizeKeyCombo(keybind.keyCombo);
        if (this.#keybindsByNormalizedCombo.has(normalizedCombo)) {
            throw new Error(`Keybind not registed for keyCombo: ${normalizedCombo}`);
        }

        this.#keybindsByNormalizedCombo.delete(normalizedCombo);

        this.dispatchEvent({ type: 'change' });
    }

    /**
     * Handles the given key event.
     * 
     * @param {KeyComboEvent} event The event to handle.
     * @returns {boolean} `true` if the event was handled by this handler.
     */
    handle(event) {
        const normalizedCombo = normalizeKeyCombo(event.keyCombo);
        const keybind = this.#keybindsByNormalizedCombo.get(normalizedCombo);
        if (keybind == null) return false;

        keybind.handler(event);
        return true;
    }
}

/**
 * Helper class to handle keyboard events.
 * 
 * Can be composed via {@link ComposableKeybindHandler#children}.
 * 
 * @augments BaseKeybindHandler
 */
export class ComposableKeybindHandler extends BaseKeybindHandler {

    /**
     * The children of this handler; if none of the keybinds in this handler are triggered,
     * the keyboard event is propagated to its children.
     * 
     * Note that elements that come first in the array have higher priority.
     * 
     * @type {ComposableKeybindHandler[]}
     */
    #children;

    /**
     * The children of this handler; if none of the keybinds in this handler are triggered,
     * the keyboard event is propagated to its children.
     * 
     * Note that elements that come first in the array have higher priority.
     * 
     * @type {ReadonlyArray<ComposableKeybindHandler>}
     */
    get children() { return this.#children; }

    /**
     * Sets the children of this handler.
     * 
     * Note that elements that come first in the array have higher priority.
     * 
     * @param {ReadonlyArray<ComposableKeybindHandler>} children The children to set.
     * A copy of the array is made to this object.
     */
    setChildren(children) {
        for (const child of this.#children) {
            child.removeEventListener('change', this.#onChildChange);
        }

        this.#children = [...children];

        for (const child of this.#children) {
            child.addEventListener('change', this.#onChildChange);
        }

        this.dispatchEvent({ type: 'change' });
    }

    /**
     * Adds a child to this handler at the lowest priority.
     * 
     * @param {ComposableKeybindHandler} child The child to add.
     * @throws {Error} If the given handler is already a child of this handler.
     */
    appendChild(child) {
        if (this.children.includes(child)) {
            throw new Error('The given handler is already a child');
        }

        this.setChildren([...this.children, child]);
    }

    /**
     * Remove a child from this handler.
     * 
     * @param {ComposableKeybindHandler} child The child to remove.
     * @throws {Error} If the given handler is not a child of this handler.
     */
    removeChild(child) {
        if (!this.children.includes(child)) {
            throw new Error('The given handler is not a child');
        }

        this.setChildren(this.children.filter((c) => c !== child));
    }

    /**
     * Iterates through each keybind in this handler, including those found in its descendants.
     * 
     * @returns {IterableIterator<Keybind>} An iterator that yields each keybind.
     * @yields {Keybind} Each keybind.
     */
    * iterSubtreeKeybinds() {
        for (const keybind of this.keybinds) yield keybind;

        for (const child of this.children) {
            for (const keybind of child.iterSubtreeKeybinds()) {
                yield keybind;
            }
        }
    }

    #onChildChange = () => {
        this.dispatchEvent({ type: 'change' });
    };

    /**
     * Creates a new handler for keyboard events.
     * 
     * @param {Iterable<Keybind>} keybinds The keybinds to register to this handler.
     * @param {ReadonlyArray<ComposableKeybindHandler>} children The children of this handler.
     * A copy of this array is made to this object.
     */
    constructor(keybinds = [], children = []) {
        super(keybinds);

        this.#children = [...children];

        for (const child of this.#children) {
            child.addEventListener('change', this.#onChildChange);
        }
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        for (const child of this.#children) {
            child.removeEventListener('change', this.#onChildChange);
        }
    }

    /**
     * Handles the given key event.
     * 
     * @param {KeyComboEvent} event The event to handle.
     * @returns {boolean} `true` if the event was handled by this handler.
     */
    handle(event) {
        if (super.handle(event)) return true;

        for (const child of this.children) {
            if (child.handle(event)) return true;
        }

        return false;
    }
}

/**
 * Helper class to attach a handler to the global event listener.
 */
export class KeybindHandlerGlobalContext {

    /**
     * The handler that is attached to the global event listener.
     * 
     * @readonly
     * @type {ComposableKeybindHandler}
     */
    handler;

    /**
     * Whether to listen to `keydown` events or `keyup` events.
     * 
     * @readonly
     * @type {'keydown' | 'keyup'}
     */
    mode;

    /**
     * @readonly
     * @type {KeyComboEventHandlerObj}
     */
    #handlerObj;

    /**
     * @type {(event: KeyComboEvent) => void}
     */
    #handle = (event) => {
        event.finalKeyEvent.preventDefault();

        this.handler.handle(event);
    };

    /**
     * We do not bother with unbinding inactive key combos
     * until this object is disposed.
     * 
     * @type {Set<string>}
     */
    #seenKeyCombos = new Set();

    /**
     * Updates `this.#seenKeyCombos` and binds the newly seen key combos
     * to the global keyboard event listener.
     */
    #bindHandlerComboStrs() {
        for (const { keyCombo } of this.handler.iterSubtreeKeybinds()) {
            if (!this.#seenKeyCombos.has(keyCombo)) {
                keystrokes.bindKeyCombo(keyCombo, this.#handlerObj);

                this.#seenKeyCombos.add(keyCombo);
            }
        }
    }

    #onHandlerChange = () => {
        this.#bindHandlerComboStrs();
    };

    /**
     * Attaches a handler to the global event listener.
     * 
     * @param {ComposableKeybindHandler} handler The handler to attach.
     * @param {'keydown' | 'keyup'} mode Whether to listen to `keydown` events or `keyup` events.
     */
    constructor(handler, mode) {
        this.handler = handler;
        this.mode = mode;

        switch (mode) {
            case 'keydown': {
                this.#handlerObj = { onPressed: this.#handle };
                break;
            }
            case 'keyup': {
                this.#handlerObj = { onReleased: this.#handle };
                break;
            }
            default:
                throw new Error(`Invalid mode: ${mode}`);
        }

        this.#bindHandlerComboStrs();

        this.handler.addEventListener('change', this.#onHandlerChange);
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.handler.removeEventListener('change', this.#onHandlerChange);

        for (const keyCombo of this.#seenKeyCombos) {
            keystrokes.unbindKeyCombo(keyCombo, this.#handlerObj);
        }
    }
}
