import * as THREE from 'three';

import { Equatable } from '../../utils';

import { SimpleList, SelectableList } from './BaseList';
import { BaseListItem } from './ListItem';

/**
 * @typedef {import('../../utils').EquatableValue} EquatableValue
 */

/**
 * @template T
 * @typedef {import('../../utils').TypeUtils.Expand<T>} Expand
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
 * Represents the event when the pointer is activated on an item in the list.
 * - `value`: The value stored in the item that the pointer is activated on.
 * - `pointerEvent`: The original event that was emitted.
 * 
 * @template {{} | null} T The type of value stored in each item.
 * @typedef {{ value: T; pointerEvent: PointerEvent }} ScrollListPointerDownEvent
 */

/**
 * Defines each event that can be dispatched by {@link ScrollListItem} and {@link ScrollList}.
 * 
 * @template {{} | null} T The type of value stored in each item.
 * @typedef {object} ScrollListEventMap
 * @property {ScrollListPointerDownEvent<T>} pointerdown The event when the form is submitted.
 */

/**
 * Represents an item that can be selected in a scrollable list.
 * 
 * @template {{} | null} T The type of value stored in the item.
 * @augments {BaseListItem<HTMLDivElement, T>}
 */
export class ScrollListItem extends BaseListItem {

    /**
     * Manages the events of this item.
     * 
     * @readonly
     * @type {THREE.EventDispatcher<ScrollListEventMap<T>>}
     */
    events = new THREE.EventDispatcher();

    /**
     * Constructs the DOM element representing this item.
     * 
     * Note: This is called during object construction, so the function should not
     * depend on any state of the class instance.
     * 
     * @protected
     * @returns {HTMLDivElement} The newly constructed HTML element.
     */
    makeDom() {
        const dom = document.createElement('div');
        dom.classList.add('scrolllist-item');
        dom.addEventListener('pointerdown', (e) => {
            if (this.disabled) return;

            this.events.dispatchEvent({ type: 'pointerdown', value: this.value, pointerEvent: e });
        });
        dom.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

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

        if (params.disabled) {
            this.dom.classList.add('disabled');
        } else {
            this.dom.classList.remove('disabled');
        }

        this.dom.hidden = params.hidden;

        if (params.selected) {
            this.dom.classList.add('selected');
        } else {
            this.dom.classList.remove('selected');
        }

        params.modifyHTML(this.dom);
    }
}

/**
 * Represents a scrollable list of items.
 * 
 * @template {{} | null} T The type of value stored in each item.
 * @augments {SimpleList<T, ScrollListItem<T>, HTMLDivElement>}
 */
class SimpleScrollList extends SimpleList {

    /**
     * Manages the events of this list.
     * 
     * @readonly
     * @type {THREE.EventDispatcher<ScrollListEventMap<T>>}
     */
    events = new THREE.EventDispatcher();

    /**
     * Constructs the DOM element representing this list.
     * 
     * Note: This is called during object construction, so the function should not
     * depend on any state of the class instance.
     * 
     * @protected
     * @returns {HTMLDivElement} The newly constructed HTML element.
     */
    makeDom() {
        const dom = document.createElement('div');
        dom.style.overflowX = 'hidden';
        dom.style.overflowY = 'scroll';
        dom.style.resize = 'vertical';
        dom.classList.add('scrolllist');

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
     * @returns {ReadonlyArray<ScrollListItem<T>>} The newly created items.
     */
    makeItems(params) {
        const items = params.items.map((itemParams) => new ScrollListItem(itemParams));

        for (const item of items) {
            item.events.addEventListener('pointerdown', (e) => {
                if (this.disabled) return;

                this.events.dispatchEvent({ ...e });
            });
        }

        return items;
    }

    /**
     * Disposes of each item in the list.
     * 
     * @protected
     * @param {ReadonlyArray<ScrollListItem<T>>} items The items to dispose,
     * originally constructed by {@link makeItems}.
     */
    disposeItems(items) {
        // No need to explicitly remove event listeners since they should be garbage collected
        // after being detacted from the DOM
        this.dom.replaceChildren();
    }
}

/**
 * @template {EquatableValue | null} T The type of value stored in each item.
 * @typedef {Expand<SelectableListEventMap<T>
 * & { select: ScrollListPointerDownEvent<T> }>} SelectableScrollListEventMap
 */

/**
 * Represents a scrollable list of selectable items.
 * 
 * @template {EquatableValue | null} T The type of value stored in each item.
 * @augments {SelectableList<T, ScrollListItem<T>, HTMLDivElement, SimpleScrollList<T>,
 * SelectableScrollListEventMap<T>>}
 */
export class SelectableScrollList extends SelectableList {

    /**
     * Constructs the base list to wrap.
     * 
     * Note: This is called during object construction, so the function should not
     * depend on any state of the class instance.
     * 
     * @protected
     * @param {BaseListParams<T>} params The parameters to pass to the base list.
     * @returns {SimpleScrollList<T>} The newly constructed base list.
     */
    makeBaseList(params) {
        const baseList = new SimpleScrollList(params);
        baseList.events.addEventListener('pointerdown', (e) => {
            this.value = e.value;

            this.dispatchEvent({
                type: 'select',
                value: e.value,
                pointerEvent: e.pointerEvent,
            });
        });

        return baseList;
    }

    /**
     * Updates this list to match the current value.
     * 
     * @protected
     */
    render() {
        const { value } = this;

        for (const item of this.baseList.items) {
            item.selected = (value === undefined) ? false
                : Equatable.equalsNullable(item.value, value);
        }
    }

    /**
     * Sets the items included in this scrollable list, as well as the selected item.
     * 
     * This enables the option to maintain the same scroll position of the selected item.
     * 
     * @param {ReadonlyArray<ListItemParams<T>>} items The parameters for
     * each item to include in this scrollable list.
     * @param {T | undefined} value The new value to set.
     * @param {boolean} scrollToSelection If `true`, after recreating the items,
     * automatically scrolls the list so that the selected item is in view. If the
     * selected item was previously in view, instead scrolls to the existing position
     * relative to the top border of the list.
     */
    setItemsAndValue(items, value, scrollToSelection = false) {
        const prevItemToSelect = (value === undefined) ? undefined
            : this.items.find((item) => Equatable.equalsNullable(item.value, value));

        /**
         * @type {?number}
         */
        let distanceFromTopBorder = null;
        if (scrollToSelection && prevItemToSelect !== undefined) {
            const thisRect = this.dom.getBoundingClientRect();
            const itemRect = prevItemToSelect.dom.getBoundingClientRect();
            if (thisRect.top <= itemRect.top && itemRect.bottom <= thisRect.bottom) {
                distanceFromTopBorder = itemRect.top - thisRect.top;
            }
        }

        this.setItems(items);
        this.value = value;

        const nextItemToSelect = (value === undefined) ? undefined
            : this.items.find((item) => Equatable.equalsNullable(item.value, value));
        if (scrollToSelection && nextItemToSelect !== undefined) {
            if (distanceFromTopBorder == null) {
                nextItemToSelect.dom.scrollIntoView({ block: 'nearest' });
            } else {
                const thisRect = this.dom.getBoundingClientRect();
                const itemRect = nextItemToSelect.dom.getBoundingClientRect();

                // Visually move the element downward by scrolling up
                // such that the scroll position itemRect.top - thisRect.top is preserved
                this.dom.scrollTop -= distanceFromTopBorder - (itemRect.top - thisRect.top);
            }
        }
    }
}
