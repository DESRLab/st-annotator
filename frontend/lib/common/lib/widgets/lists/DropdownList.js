import * as THREE from 'three';

import { SelectableList, SimpleList } from './BaseList';
import { BaseListItem } from './ListItem';

/**
 * @typedef {import('../../utils').EquatableValue} EquatableValue
 */

/**
 * @template {{} | null} T
 * @typedef {import('./BaseList').BaseListParams<T>} BaseListParams
 */

/**
 * @template {EquatableValue | null} T
 * @typedef {import('./BaseList').SelectableListEventMap<T>} SelectableListEventMap
 */

/**
 * @template {{} | null} T
 * @typedef {import('./ListItem').ListItemParams<T>} ListItemParams
 */

/**
 * Represents an item that can be selected in a drop-down list.
 * 
 * @template {{} | null} T The type of value stored in the item.
 * @augments {BaseListItem<HTMLOptionElement, T>}
 */
export class DropdownListItem extends BaseListItem {

    /**
     * Constructs the DOM element representing this item.
     * 
     * Note: This is called during object construction, so the function should not
     * depend on any state of the class instance.
     * 
     * @protected
     * @returns {HTMLOptionElement} The newly constructed HTML element.
     */
    makeDom() {
        const dom = document.createElement('option');
        dom.classList.add('dropdownlist-item');

        return dom;
    }

    /**
     * Updates this item to match its parameters.
     * 
     * @protected
     * @param {Required<ListItemParams<T>>} params The parameters of the item.
     */
    render(params) {
        this.dom.textContent = params.text;
        this.dom.title = params.description;
        this.dom.disabled = params.disabled;
        this.dom.hidden = params.hidden;

        params.modifyHTML(this.dom);
    }
}

/**
 * Represents a drop-down list of items.
 * 
 * @template {EquatableValue | null} T The type of value stored in each item.
 * @augments {SimpleList<T, DropdownListItem<T>, HTMLSelectElement>}
 */
class SimpleDropdownList extends SimpleList {

    /**
     * Manages the events of this item.
     * 
     * @readonly
     * @type {THREE.EventDispatcher<SelectableListEventMap<T>>}
     */
    events = new THREE.EventDispatcher();

    /**
     * Constructs the DOM element representing this list.
     * 
     * Note: This is called during object construction, so the function should not
     * depend on any state of the class instance.
     * 
     * @protected
     * @returns {HTMLSelectElement} The newly constructed HTML element.
     */
    makeDom() {
        const dom = document.createElement('select');
        dom.classList.add('dropdownlist', 'form-select');
        dom.addEventListener('change', () => {
            this.events.dispatchEvent({
                type: 'select',
                value: this.items[dom.selectedIndex].value,
            });
        });

        return dom;
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
     * @returns {ReadonlyArray<DropdownListItem<T>>} The newly created items.
     */
    makeItems(params) {
        return params.items.map((itemParams) => new DropdownListItem(itemParams));
    }

    /**
     * Disposes of each item in the list.
     * 
     * @protected
     * @param {ReadonlyArray<DropdownListItem<T>>} items The items to dispose,
     * originally constructed by {@link makeItems}.
     */
    disposeItems(items) {
        this.dom.replaceChildren();
    }
}

/**
 * Represents a drop-down list of selectable items.
 * 
 * @template {EquatableValue | null} T The type of value stored in each item.
 * @augments {SelectableList<T, DropdownListItem<T>, HTMLSelectElement, SimpleDropdownList<T>>}
 */
export class DropdownSelectList extends SelectableList {

    /**
     * Constructs the base list to wrap.
     * 
     * Note: This is called during object construction, so the function should not
     * depend on any state of the class instance.
     * 
     * @protected
     * @param {BaseListParams<T>} params The parameters to pass to the base list.
     * @returns {SimpleDropdownList<T>} The newly constructed base list.
     */
    makeBaseList(params) {
        const baseList = new SimpleDropdownList(params);
        baseList.events.addEventListener('select', (e) => {
            this.value = e.value;

            // select event
            this.dispatchEvent({ ...e });
        });

        return baseList;
    }

    /**
     * Updates this list to match the current value.
     * 
     * @protected
     */
    render() {
        this.baseList.dom.selectedIndex = this.selectedIdx;
    }
}
