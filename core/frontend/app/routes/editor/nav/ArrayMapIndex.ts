import _ from "lodash";

import { CollectionUtils, type Hashable } from "sta/common";

/**
 * Represents an index that supports value lookup by index and key.
 */
export class ArrayMapIndex<
  K extends Hashable | number | string | null | undefined,
  V,
> {
  #index: CollectionUtils.ReadonlyArrayMap<K, V>;

  /**
   * A function that returns the corresponding key of a value. This is also used
   * to sort the elements.
   */
  get getKey(): (value: V) => K {
    return this.#index.getKey;
  }

  /**
   * An array containing the elements, sorted by {@link ArrayMapIndex#getKey}.
   */
  get elements(): readonly V[] {
    return this.#index.elements;
  }

  /**
   * The number of elements in this index.
   */
  get length(): number {
    return this.#index.length;
  }

  /**
   * The number of elements in this index.
   */
  get size(): number {
    return this.#index.size;
  }

  /**
   * Creates a new index by copying from an existing array.
   *
   * @param getKey A function that returns the corresponding key of a value.
   * This is also used to sort the elements.
   * @param elements The reference array containing the elements to index,
   * from which a shallow copy is made.
   */
  constructor(
    getKey: (value: V) => K,
    elements: readonly V[] = [],
    getSortKey: (value: V) => unknown = getKey,
  ) {
    const sortedElems = _.sortBy(elements, getSortKey);
    this.#index = new CollectionUtils.ReadonlyArrayMap(getKey, sortedElems);
  }

  /**
   * Tests whether an element exists in the collection.
   *
   * Elements are matched according to the corresponding key.
   *
   * @param element The query element.
   * @returns `true` if the element exists; otherwise, `false`.
   */
  hasKeyOf(element: V): boolean {
    return this.#index.hasKeyOf(element);
  }

  /**
   * Gets an element by its index in the array.
   *
   * @param idx The query index.
   * @returns The element at the index.
   * @throws {Error} If the element is not found.
   */
  getByIdx(idx: number): V {
    if (!Number.isInteger(idx) || idx < 0 || idx >= this.length) {
      throw new Error(`There is no element with the given index: ${idx}`);
    }
    const element = this.#index.getByIdx(idx);
    if (element === undefined) {
      throw new Error(`There is no element with the given index: ${idx}`);
    }

    return element;
  }

  /**
   * Gets an element by its key in the mapping.
   *
   * @param key The query key.
   * @returns The element matching the key.
   * @throws {Error} If the element is not found.
   */
  getByKey(key: K): V {
    const element = this.#index.getByKey(key);
    if (element === undefined) {
      throw new Error(
        `There is no element with the given key: ${JSON.stringify(key)}`,
      );
    }

    return element;
  }

  /**
   * Gets the index of a key in the mapping.
   *
   * @param key The query key.
   * @returns The requested index, or `undefined` if not found.
   * @throws {Error} If the key is not in the index.
   */
  getIdxOfKey(key: K): number {
    const idx = this.#index.getIdxOfKey(key);
    if (idx === undefined) {
      throw new Error(`Missing key: ${JSON.stringify(key)}`);
    }

    return idx;
  }
}
