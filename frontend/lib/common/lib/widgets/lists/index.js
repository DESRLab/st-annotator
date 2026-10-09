/**
 * @typedef {import('../../utils').EquatableValue} EquatableValue
 */

/**
 * @template {{} | null} T The type of value stored in each item.
 * @template {ListItem<T>} TItem The type of item inside the list.
 * @typedef {import('./BaseList').BaseList<T, TItem, any>} BaseList
 */

/**
 * @template {{} | null} T The type of value stored in each item.
 * @typedef {import('./BaseList').BaseListParams<T>} BaseListParams
 */

/**
 * @template {{} | null} T The type of value stored in each item.
 * @typedef {import('./BaseList').SimpleListParams<T>} SimpleListParams
 */

/**
 * @template {EquatableValue | null} T The type of value stored in each item.
 * @typedef {import('./BaseList').SelectableListParams<T>} SelectableListParams
 */

/**
 * @template {EquatableValue | null} T The type of value stored in each item.
 * @typedef {import('./BaseList').SelectableListEventMap<T>} SelectableListEventMap
 */

/**
 * @template {{} | null} T The type of value stored in the item.
 * @typedef {import('./ListItem').ListItem<any, T>} ListItem
 */

/**
 * @template {{} | null} T The type of value stored in each item.
 * @typedef {import('./ListItem').ListItemParams<T>} ListItemParams
 */

/**
 * @template {EquatableValue | null} T The type of value stored in each item.
 * @typedef {import('./ScrollList').ScrollListPointerDownEvent<T>} ScrollListPointerDownEvent
 */

/**
 * @template {EquatableValue | null} T The type of value stored in each item.
 * @typedef {import('./ScrollList').SelectableScrollListEventMap<T>} SelectableScrollListEventMap
 */

export { DropdownSelectList } from './DropdownList';
export { SelectableScrollList } from './ScrollList';
