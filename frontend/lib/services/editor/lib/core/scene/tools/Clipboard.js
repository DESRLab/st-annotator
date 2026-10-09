import * as THREE from 'three';

import { ClipboardPane } from '../widgets';

const ClipboardPaneController = ClipboardPane.ClipboardPaneController;

/**
 * @typedef {import('../widgets').ClipboardPane.ClipboardPaneController} ClipboardPaneController
 */

/**
 * Defines each event that can be dispatched by {@link Clipboard}.
 * 
 * @template D The type of data stored on the clipboard.
 * @typedef {object} ClipboardEventMap
 * @property {{ clipboard: D }} copy The event when an object is copied.
 * @property {{ clipboard: D }} paste The event when an object is pasted.
 */

/**
 * @template S The type of object that can be selected for copy and pasting.
 * @template D The type of data stored on the clipboard.
 * @typedef {object} ClipboardImpl
 * @property {(selectedObj: S) => D} objToData Given the selected object,
 * obtains the data to store in the clipboard.
 * Mutating the selected object should not affect this data.
 */

/**
 * Contains a user interface for copy and pasting objects in the scene.
 * 
 * @template S The type of object that can be selected for copy and pasting.
 * @template D The type of data stored on the clipboard.
 * @augments THREE.EventDispatcher<ClipboardEventMap<D>>
 */
export class Clipboard extends THREE.EventDispatcher {

    /**
     * The DOM element representing this object.
     * 
     * @readonly
     * @type {HTMLDivElement}
     */
    dom;

    /**
     * @readonly
     * @type {ClipboardPaneController}
     */
    #pane;

    /**
     * @type {?S}
     */
    #selectedObj = null;

    /**
     * Whether an object is selected.
     * 
     * @type {boolean}
     */
    get hasSelection() { return this.#selectedObj != null; }

    /**
     * @type {?Readonly<D>}
     */
    #clipboard = null;

    /**
     * The data in the clipboard, which is based on the selected object.
     * 
     * @type {?Readonly<D>}
     */
    get clipboard() { return this.#clipboard; }

    set clipboard(value) {
        if (this.clipboard !== value) {
            this.#clipboard = value;

            this.render();
        }
    }

    /**
     * @type {boolean}
     */
    #disabled = false;

    /**
     * `true` if the input is disabled; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get disabled() { return this.#disabled; }

    set disabled(value) {
        if (this.#disabled !== value) {
            this.#disabled = value;

            this.render();
        }
    }

    /**
     * Defines the implementation of the clipboard.
     * 
     * @readonly
     * @type {Required<ClipboardImpl<S, D>>}
     */
    #impl;

    #onCopyClick = () => {
        this.copy();
    };

    #onPasteClick = () => {
        this.paste();
    };

    /**
     * Creates a new clipboard for copy/pasting in a scene.
     * 
     * @param {ClipboardImpl<S, D>} impl Defines the implementation of the clipboard.
     */
    constructor(impl) {
        super();

        this.#impl = {
            objToData: impl.objToData,
        };

        this.dom = document.createElement('div');
        {
            this.#pane = ClipboardPaneController.create(this.dom);
            this.#pane.paneEvents.addEventListener('click-copy', this.#onCopyClick);
            this.#pane.paneEvents.addEventListener('click-paste', this.#onPasteClick);
        }

        this.render();
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#pane.paneEvents.removeEventListener('click-copy', this.#onCopyClick);
        this.#pane.paneEvents.removeEventListener('click-paste', this.#onPasteClick);
        this.#pane.dispose();
    }

    /**
     * Selects an object to copy.
     * 
     * @param {S} obj The object to copy.
     */
    select(obj) {
        this.#selectedObj = obj;

        this.render();
    }

    /**
     * Deselects the object so it can no longer be copied.
     * 
     * This is a no-op if there is no selected object.
     */
    deselect() {
        this.#selectedObj = null;

        this.render();
    }

    /**
     * Copies the selected object to the clipboard.
     * 
     * This is a no-op if the corresponding DOM is disabled.
     */
    copy() {
        if (this.#pane.isCopyDisabled) return;

        const obj = this.#selectedObj;
        if (obj == null) {
            // Supposedly the button should be disabled if this is the case,
            // but we need to satisfy the type checker
            throw new Error('No object selected');
        }

        const clipboard = this.#impl.objToData(obj);

        this.clipboard = clipboard;

        this.dispatchEvent({ type: 'copy', clipboard: clipboard });
    }

    /**
     * Pastes the clipboard, dispatching the corresponding event.
     * 
     * This is a no-op if the corresponding DOM is disabled.
     */
    paste() {
        if (this.#pane.isPasteDisabled) return;

        const clipboard = this.clipboard;
        if (clipboard == null) {
            // Supposedly the button should be disabled if this is the case,
            // but we need to satisfy the type checker
            throw new Error('Clipboard is empty');
        }

        this.dispatchEvent({ type: 'paste', clipboard: clipboard });
    }

    /**
     * Updates the DOM of this object to match its internal state.
     */
    render() {
        this.#pane.updateSettings({
            disabled: this.disabled,
            disableCopy: this.#selectedObj == null,
            disablePaste: this.clipboard == null,
        });
    }
}
