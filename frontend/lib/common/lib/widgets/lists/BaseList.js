import * as THREE from 'three';

import { Equatable } from '../../utils';

/**
 * @typedef {import('../../utils').EquatableValue} EquatableValue
 */

/**
 * @template T
 * @typedef {import('../../utils').TypeUtils.Expand<T>} Expand
 */

/**
 * @template {{} | null} T
 * @typedef {import('./ListItem').ListItem<any, T>} ListItem
 */

/**
 * @template {{} | null} T
 * @typedef {import('./ListItem').ListItemParams<T>} ListItemParams
 */

/**
 * @template {{} | null} T The type of value stored in each item.
 * @typedef {object} BaseListParams
 * @property {ReadonlyArray<ListItemParams<T>>} items The parameters for each item to
 * include in the list.
 * @property {boolean} [disabled=false] If `true`, the list cannot be interacted
 * by the user.
 * @property {boolean} [hidden=false] If `true`, the list is not displayed
 * to the user.
 */

/**
 * @template {{} | null} T The type of value stored in each item.
 * @template {ListItem<T>} TItem The type of item inside the list.
 * @template {HTMLElement} D The type of DOM element representing this list.
 * @interface
 */
export class BaseList {

    /**
     * A DOM element representing this list.
     * 
     * @readonly
     * @type {D}
     * @abstract
     */
    get dom() { throw new Error('Not implemented'); }

    /**
     * The items included in this list.
     * 
     * @type {ReadonlyArray<TItem>}
     * @abstract
     */
    get items() { throw new Error('Not implemented'); }

    /**
     * Sets the items included in this list.
     * 
     * @param {ReadonlyArray<ListItemParams<T>>} items The parameters for each item to
     * include in this list.
     * @abstract
     */
    setItems(items) {
        throw new Error('Not implemented');
    }

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
     * Disposes of this object. Do not use it afterwards.
     * 
     * @abstract
     */
    dispose() {
        throw new Error('Not implemented');
    }
}

/**
 * @template {{} | null} T The type of value stored in each item.
 * @typedef {BaseListParams<T>} SimpleListParams
 */

/**
 * Represents a list of items.
 * 
 * @template {{} | null} T The type of value stored in each item.
 * @template {ListItem<T>} TItem The type of item inside the list.
 * @template {HTMLElement} D The type of DOM element representing this list.
 * @implements {BaseList<T, TItem, D>}
 */
export class SimpleList {

    /**
     * A DOM element representing this list.
     * 
     * @readonly
     * @type {D}
     */
    dom;

    /**
     * @type {Required<BaseListParams<T>>}
     */
    #params;

    /**
     * @type {ReadonlyArray<TItem>}
     */
    #items;

    /**
     * The items included in this list.
     * 
     * @type {ReadonlyArray<TItem>}
     */
    get items() { return this.#items; }

    /**
     * Sets the items included in this list.
     * 
     * @param {ReadonlyArray<ListItemParams<T>>} items The parameters for each item to
     * include in this list.
     */
    setItems(items) {
        this.disposeItems(this.#items);

        this.#params.items = [...items];

        this.#items = this.makeItems(this.#params);
        this.dom.replaceChildren(...this.#items.map((item) => item.dom));
    }

    /**
     * If `true`, this item cannot be interacted by the user.
     * 
     * @type {boolean}
     */
    get disabled() { return this.#params.disabled; }

    set disabled(disabled) {
        if (this.disabled !== disabled) {
            this.#params.disabled = disabled;

            this.#applySettings();
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

            this.#applySettings();
        }
    }

    #applySettings() {
        if (this.disabled) {
            this.dom.classList.add('disabled');
        } else {
            this.dom.classList.remove('disabled');
        }

        this.dom.hidden = this.hidden;
    }

    /**
     * Creates a list of items.
     * 
     * @param {BaseListParams<T>} params The parameters of the list.
     */
    constructor(params) {
        this.dom = this.makeDom();

        this.#params = {
            items: params.items,
            disabled: params.disabled ?? false,
            hidden: params.hidden ?? false,
        };

        this.#items = this.makeItems(this.#params);
        this.dom.replaceChildren(...this.#items.map((item) => item.dom));

        this.#applySettings();
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.disposeItems(this.#items);

        this.disposeDom(this.dom);
    }

    /**
     * Constructs the DOM element representing this list.
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
     * Disposes the DOM element representing this list.
     * 
     * @protected
     * @param {D} dom The DOM element to dispose, originally constructed by
     * {@link makeDom}.
     */
    disposeDom(dom) {
        dom.remove();
    }

    /**
     * Creates each item in the list.
     * 
     * They are automatically added to the DOM element of this list.
     * 
     * Note: This is called during object construction, so the function should not
     * depend on any state of the class instance.
     * 
     * @protected
     * @param {BaseListParams<T>} params The parameters of the list.
     * @returns {ReadonlyArray<TItem>} The newly created items.
     * @abstract
     */
    makeItems(params) {
        throw new Error('Not implemented');
    }

    /**
     * Disposes of each item in the list.
     * 
     * @protected
     * @param {ReadonlyArray<TItem>} items The items to dispose,
     * originally constructed by {@link makeItems}.
     * @abstract
     */
    disposeItems(items) {
        throw new Error('Not implemented');
    }
}

/**
 * @template {EquatableValue | null} T The type of value stored in each item.
 * @typedef {object} _SelectableListParams
 * @property {T | undefined} [value] The value of the selected item, or `undefined` if
 * there is no selected item.
 */

/**
 * @template {EquatableValue | null} T The type of value stored in each item.
 * @typedef {Expand<BaseListParams<T> & _SelectableListParams<T>>} SelectableListParams
 */

/**
 * Defines each event that can be dispatched by {@link SelectableList}.
 * 
 * @template {EquatableValue | null} T The type of value stored in each item.
 * @typedef {object} SelectableListEventMap
 * @property {{ value: T }} select The event when an item in the list has been selected.
 */

/**
 * Represents a list of selectable items.
 * 
 * @template {EquatableValue | null} T The type of value stored in each item.
 * @template {ListItem<T>} TItem The type of item inside the list.
 * @template {HTMLElement} D The type of DOM element representing this list.
 * @template {BaseList<T, TItem, D>} TBaseList The type of base list to wrap.
 * @template {SelectableListEventMap<T>} [TEventMap=SelectableListEventMap<T>] Defines each event
 * that can be dispatched by the window.
 * @augments THREE.EventDispatcher<TEventMap>
 */
export class SelectableList extends THREE.EventDispatcher {

    /**
     * The wrapped base list.
     * 
     * @protected
     * @readonly
     * @type {TBaseList}
     */
    baseList;

    /**
     * A DOM element representing this item.
     * 
     * @type {D}
     */
    get dom() { return this.baseList.dom; }

    /**
     * The items included in this list.
     * 
     * @type {ReadonlyArray<TItem>}
     */
    get items() { return this.baseList.items; }

    /**
     * The selected item in this list, or `undefined` if there is no such item.
     * 
     * @type {TItem | undefined}
     */
    get selectedItem() {
        const { value } = this;
        if (value === undefined) return undefined;

        return this.items.find((item) => Equatable.equalsNullable(item.value, value));
    }

    /**
     * The index of the selected item in this list, or `-1` if no item is selected.
     * 
     * @type {number}
     */
    get selectedIdx() {
        return this.selectedItem === undefined ? -1 : this.items.indexOf(this.selectedItem);
    }

    /**
     * Sets the items included in this list.
     * 
     * @param {ReadonlyArray<ListItemParams<T>>} items The parameters for
     * each item to include in this list.
     */
    setItems(items) {
        this.baseList.setItems(items);

        this.render();
    }

    /**
     * If `true`, this item cannot be interacted by the user.
     * 
     * @type {boolean}
     */
    get disabled() { return this.baseList.disabled; }

    set disabled(disabled) { this.baseList.disabled = disabled; }

    /**
     * If `true`, this item is not displayed to the user.
     * 
     * @type {boolean}
     */
    get hidden() { return this.baseList.hidden; }

    set hidden(hidden) { this.baseList.hidden = hidden; }

    /**
     * @type {T | undefined}
     */
    #value;

    /**
     * The value of the selected item, or `undefined` if there is no selected item.
     * 
     * @type {T | undefined}
     */
    get value() { return this.#value; }

    set value(value) {
        if (this.value !== value) {
            this.#value = value;

            this.render();
        }
    }

    /**
     * Creates a list of selectable items.
     * 
     * @param {SelectableListParams<T>} params The parameters of the list.
     */
    constructor({ value, ...baseParams }) {
        super();

        this.#value = (value === undefined) ? undefined : value;
        this.baseList = this.makeBaseList(baseParams);

        this.render();
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.disposeBaseList(this.baseList);
    }

    /**
     * Disposes the wrapped base list.
     * 
     * @protected
     * @param {TBaseList} baseList The base list to dispose, originally constructed by
     * {@link makeBaseList}.
     */
    disposeBaseList(baseList) {
        baseList.dispose();
    }

    /**
     * Constructs the base list to wrap.
     * 
     * Note: This is called during object construction, so the function should not
     * depend on any state of the class instance.
     * 
     * @protected
     * @param {BaseListParams<T>} params The parameters to pass to the base list.
     * @returns {TBaseList} The newly constructed base list.
     * @abstract
     */
    makeBaseList(params) {
        throw new Error('Not implemented');
    }

    /**
     * Updates this list to match the current value.
     * 
     * @protected
     * @abstract
     */
    render() {
        throw new Error('Not implemented');
    }
}
