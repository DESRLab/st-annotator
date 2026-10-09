import _ from 'lodash';

import { CollectionUtils } from '../../../../../common/lib/utils';

/**
 * @typedef {import('../../../../../common/lib/utils').Hashable} Hashable
 */

/**
 * Represents an index that supports value lookup by index and key.
 * 
 * @template {Hashable | number | string | null | undefined} K The data type of the keys.
 * @template {{} | null} V The data type of the values.
 */
export class ArrayMapIndex {

    /**
     * @type {CollectionUtils.ReadonlyArrayMap<K, V>}
     */
    #index;

    /**
     * A function that returns the corresponding key of a value. This is also used
     * to sort the elements.
     * 
     * @returns {(value: V) => K} The requested function.
     */
    get getKey() { return this.#index.getKey; }

    /**
     * An array containing the elements, sorted by {@link ArrayMapIndex#getKey}.
     * 
     * @type {ReadonlyArray<V>}
     */
    get elements() { return this.#index.elements; }

    /**
     * The number of elements in this index.
     * 
     * @type {number}
     */
    get length() { return this.#index.length; }

    /**
     * The number of elements in this index.
     * 
     * @type {number}
     */
    get size() { return this.#index.size; }

    /**
     * Creates a new index by copying from an existing array.
     * 
     * @param {(value: V) => K} getKey A function that returns the corresponding key of a value.
     * This is also used to sort the elements.
     * @param {ReadonlyArray<V>} elements The reference array containing the elements to index,
     * from which a shallow copy is made.
     */
    constructor(getKey, elements = []) {
        const sortedElems = _.sortBy(elements, getKey);
        this.#index = new CollectionUtils.ReadonlyArrayMap(getKey, sortedElems);
    }

    /**
     * Tests whether an element exists in the collection.
     * 
     * Elements are matched according to the corresponding key.
     * 
     * @param {V} element The query element.
     * @returns {boolean} `true` if the element exists; otherwise, `false`.
     */
    hasKeyOf(element) {
        return this.#index.hasKeyOf(element);
    }

    /**
     * Gets an element by its index in the array.
     * 
     * @param {number} idx The query index.
     * @returns {V} The element at the index.
     * @throws {Error} If the element is not found.
     */
    getByIdx(idx) {
        const element = this.#index.getByIdx(idx);
        if (element === undefined) {
            throw new Error(`There is no element with the given index: ${idx}`);
        }

        return element;
    }

    /**
     * Gets an element by its key in the mapping.
     * 
     * @param {K} key The query key.
     * @returns {V} The element matching the key.
     * @throws {Error} If the element is not found.
     */
    getByKey(key) {
        const element = this.#index.getByKey(key);
        if (element === undefined) {
            throw new Error(`There is no element with the given key: ${JSON.stringify(key)}`);
        }

        return element;
    }

    /**
     * Gets the index of a key in the mapping.
     * 
     * @param {K} key The query key.
     * @returns {number} The requested index, or `undefined` if not found.
     * @throws {Error} If the key is not in the index.
     */
    getIdxOfKey(key) {
        const idx = this.#index.getIdxOfKey(key);
        if (idx === undefined) {
            throw new Error(`Missing key: ${JSON.stringify(key)}`);
        }

        return idx;
    }

    // eslint-disable-next-line jsdoc/require-returns
    /**
     * Creates a subclass that has a fixed {@link ArrayMapIndex#getKey}.
     * 
     * @template {Hashable | number | string} K The data type of the keys.
     * @template {{} | null} V The data type of the values.
     * @param {(value: V) => K} keyFn A function that returns the corresponding key of a value.
     * This is also used to sort the elements.
     */
    static withKeyFn(keyFn) {
        /**
         * @augments {ArrayMapIndex<K, V>}
         */
        class ArrayMapIndexWithKeyFn extends ArrayMapIndex {

            /**
             * Creates a new index by copying from an existing array.
             * 
             * @param {ReadonlyArray<V>} elements The reference array containing the elements to
             * index, from which a shallow copy is made.
             */
            constructor(elements = []) {
                super(keyFn, elements);
            }
        }

        return ArrayMapIndexWithKeyFn;
    }
}
