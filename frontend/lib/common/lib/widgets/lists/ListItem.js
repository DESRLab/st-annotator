/**
 * Represents an item that can be selected in a list.
 * 
 * @template {HTMLElement} D The type of DOM element representing this item.
 * @template {{} | null} T The type of value stored in the item.
 * @interface
 */
export class ListItem {

    /**
     * A DOM element representing this item.
     * 
     * @type {D}
     * @abstract
     */
    get dom() { throw new Error('Not implemented'); }

    /**
     * The value stored in this item.
     * 
     * @type {T}
     * @abstract
     */
    get value() { throw new Error('Not implemented'); }

    /**
     * The text to display for this item.
     * 
     * @type {string}
     * @abstract
     */
    get text() { throw new Error('Not implemented'); }

    /**
     * The description to display for this item.
     * 
     * @type {string}
     * @abstract
     */
    get description() { throw new Error('Not implemented'); }

    /**
     * If `true`, this item cannot be interacted by the user.
     * 
     * @type {boolean}
     * @abstract
     */
    get disabled() { throw new Error('Not implemented'); }

    set disabled(disabled) { throw new Error('Not implemented'); }

    /**
     * If `true`, this item is not displayed to the user.
     * 
     * @type {boolean}
     * @abstract
     */
    get hidden() { throw new Error('Not implemented'); }

    set hidden(hidden) { throw new Error('Not implemented'); }

    /**
     * If `true`, the item is selected by the user.
     * 
     * @type {boolean}
     * @abstract
     */
    get selected() { throw new Error('Not implemented'); }

    set selected(selected) { throw new Error('Not implemented'); }

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
 * @template {{} | null} T The type of value stored in the item.
 * @typedef {object} ListItemParams
 * @property {T} value The value stored in the item.
 * @property {string} text The text to display for the item.
 * @property {string} [description] The description to display for the item.
 * Defaults to `text`.
 * @property {boolean} [disabled=false] If `true`, the item cannot be interacted by the user.
 * @property {boolean} [hidden=false] If `true`, the item is not displayed to the user.
 * @property {boolean} [selected=false] If `true`, the item is selected by the user.
 * @property {(dom: HTMLElement) => void} [modifyHTML] If given, after applying all other
 * params, this function is called to further customize the DOM element representing the item.
 */

/**
 * Represents an item that can be selected in a list.
 * 
 * @template {HTMLElement} D The type of DOM element representing this item.
 * @template {{} | null} T The type of value stored in the item.
 * @implements {ListItem<D, T>}
 */
export class BaseListItem {

    /**
     * A DOM element representing this item.
     * 
     * @readonly
     * @type {D}
     */
    dom;

    /**
     * @type {Required<ListItemParams<T>>}
     */
    #params;

    /**
     * The value stored in this item.
     * 
     * @type {T}
     */
    get value() { return this.#params.value; }

    /**
     * The text to display for this item.
     * 
     * @type {string}
     */
    get text() { return this.#params.text; }

    /**
     * The description to display for this item.
     * 
     * @type {string}
     */
    get description() { return this.#params.description; }

    /**
     * If `true`, this item cannot be interacted by the user.
     * 
     * @type {boolean}
     */
    get disabled() { return this.#params.disabled; }

    set disabled(disabled) {
        if (this.disabled !== disabled) {
            this.#params.disabled = disabled;

            this.render(this.#params);
        }
    }

    /**
     * If `true`, this item is not displayed to the user.
     * 
     * @type {boolean}
     */
    get hidden() { return this.#params.hidden; }

    set hidden(hidden) {
        if (this.hidden !== hidden) {
            this.#params.hidden = hidden;

            this.render(this.#params);
        }
    }

    /**
     * If `true`, the item is selected by the user.
     * 
     * @type {boolean}
     */
    get selected() { return this.#params.selected; }

    set selected(selected) {
        if (this.selected !== selected) {
            this.#params.selected = selected;

            this.render(this.#params);
        }
    }

    /**
     * Creates a new item in a list.
     * 
     * @param {ListItemParams<T>} params The parameters of the item.
     */
    constructor(params) {
        this.dom = this.makeDom();

        this.#params = {
            value: params.value,
            text: params.text,
            description: params.description ?? params.text,
            disabled: params.disabled ?? false,
            hidden: params.hidden ?? false,
            selected: params.selected ?? false,
            modifyHTML: params.modifyHTML ?? (() => {}),
        };

        this.render(this.#params);
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.disposeDom(this.dom);
    }

    /**
     * Constructs the DOM element representing this item.
     * 
     * Note: This is called during object construction, so the function should not
     * depend on any state of the class instance.
     * 
     * @protected
     * @returns {D} The newly constructed HTML element.
     * @abstract
     */
    makeDom() {
        throw new Error('Not implemented');
    }

    /**
     * Disposes the DOM element representing this item.
     * 
     * @protected
     * @param {D} dom The DOM element to dispose, originally constructed by
     * {@link makeDom}.
     */
    disposeDom(dom) {
        dom.remove();
    }

    /**
     * Updates this item to match its parameters.
     * 
     * @protected
     * @param {Required<ListItemParams<T>>} params The parameters of the item.
     * @abstract
     */
    render(params) {
        throw new Error('Not implemented');
    }
}
