import * as Collections from "typescript-collections";

import type { Hashable } from "./interfaces/Hashable";

/**
 * Tests whether every element in the provided collection matches a predicate.
 *
 * Note that this method returns `true` for empty collections.
 */
export function every<T>(
  collection: Iterable<T>,
  predicate: (v: T) => boolean,
): boolean {
  for (const v of collection) {
    if (!predicate(v)) return false;
  }

  return true;
}

/**
 * Tests whether any element in the provided collection matches a predicate.
 *
 * Note that this method returns `false` for empty collections.
 */
export function some<T>(
  collection: Iterable<T>,
  predicate: (v: T) => boolean,
): boolean {
  for (const v of collection) {
    if (predicate(v)) return true;
  }

  return false;
}

/**
 * A set-like view of the keys in a {@link Map}.
 *
 * Changes to the underlying map are reflected in this object.
 */
export class KeyView<K> implements ReadonlySet<K> {
  /**
   * The map containing the keys.
   */
  readonly map: ReadonlyMap<K, unknown>;

  /**
   * Creates a live view of the keys of a {@link Map}.
   */
  constructor(map: ReadonlyMap<K, unknown>) {
    this.map = map;
  }

  // @ts-expect-error - intentional override with different callback signature
  forEach(
    callbackfn: (value: K, value2: K, set: this) => void,
    thisArg?: any,
  ): void {
    this.map.forEach((v: unknown, k: K) => callbackfn(k, k, this), thisArg);
  }

  has(value: K): boolean {
    return this.map.has(value);
  }

  get size(): number {
    return this.map.size;
  }

  // @ts-expect-error - intentional override returning different iterator type
  [Symbol.iterator](): IterableIterator<K> {
    return this.values();
  }

  // @ts-expect-error - intentional override returning different iterator type
  values(): IterableIterator<K> {
    return this.map.keys();
  }

  // @ts-expect-error - intentional override returning different iterator type
  keys(): IterableIterator<K> {
    return this.values();
  }

  // @ts-expect-error - intentional override returning different iterator type
  *entries(): IterableIterator<[K, K]> {
    for (const v of this.values()) {
      yield [v, v];
    }
  }
}

/**
 * A {@link Map} that creates and returns a default value when {@link DefaultMap#get} is called
 * for a key that does not exist.
 *
 * Note that this does not affect other methods such as {@link DefaultMap#has}.
 */
export class DefaultMap<K, V> extends Map<K, V> {
  /**
   * Constructs the default value assigned to a missing key when {@link DefaultMap#get} is called.
   */
  defaultFactory: () => V;

  /**
   * Creates a new {@link Map} that creates and returns a default value when
   * {@link DefaultMap#get} is called for a key that does not exist.
   */
  constructor(
    defaultFactory: () => V,
    entries: Iterable<[K, V]> | null = null,
  ) {
    super(entries ?? []);

    this.defaultFactory = defaultFactory;
  }

  get(key: K): V {
    if (!this.has(key)) {
      this.set(key, this.defaultFactory());
    }

    // @ts-expect-error - TypeScript cannot infer that the value is guaranteed to exist
    return super.get(key);
  }
}

/**
 * A {@link Map} where key equality is computed according to {@link Hashable#hash},
 * instead of object equality.
 *
 * TODO: Use {@link Hashable#equals} instead.
 */
export class HashMap<
  K extends Hashable | string | number | null | undefined,
  V,
> implements Map<K, V> {
  /**
   * Converts a key into a string.
   */
  static tryStringify(
    key: Hashable | string | number | null | undefined,
  ): string {
    if (typeof key === "string") return key;
    if (typeof key === "number") return key.toString();
    if (key == null) return String(key);

    return key.hash();
  }

  #keyToString = (key: K): string => HashMap.tryStringify(key);

  #map = new Collections.Dictionary<K, V>(this.#keyToString);

  /**
   * Creates a new {@link Map} where keys are hashed according to a custom function.
   */
  constructor(entries: Iterable<[K, V]> | null = null) {
    if (entries != null) {
      for (const [k, v] of entries) {
        this.set(k, v);
      }
    }
  }

  clear(): void {
    this.#map.clear();
  }

  delete(key: K): boolean {
    return this.#map.remove(key) === undefined;
  }

  forEach(
    callbackfn: (value: V, key: K, map: Map<K, V>) => void,
    thisArg?: any,
  ): void {
    // @ts-expect-error - `this` is HashMap, not a native Map, but satisfies the callback contract
    this.#map.forEach((k: K, v: V) => callbackfn(v, k, this));
  }

  get(key: K): V | undefined {
    return this.#map.getValue(key);
  }

  has(key: K): boolean {
    return this.#map.containsKey(key);
  }

  set(key: K, value: V): this {
    this.#map.setValue(key, value);
    return this;
  }

  get size(): number {
    return this.#map.size();
  }

  // @ts-expect-error - intentional override with generator-based iterator
  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.entries();
  }

  get [Symbol.toStringTag](): string {
    return "HashableMap";
  }

  // @ts-expect-error - intentional override with generator-based iterator
  *values(): IterableIterator<V> {
    for (const v of this.#map.values()) {
      yield v;
    }
  }

  // @ts-expect-error - intentional override with generator-based iterator
  *keys(): IterableIterator<K> {
    for (const k of this.#map.keys()) {
      yield k;
    }
  }

  // @ts-expect-error - intentional override with generator-based iterator
  *entries(): IterableIterator<[K, V]> {
    for (const k of this.#map.keys()) {
      // @ts-expect-error - TypeScript cannot infer that the value is guaranteed to exist
      yield [k, this.#map.getValue(k)];
    }
  }
}

/**
 * An read-only collection with elements accessible by array index or map key.
 */
export class ReadonlyArrayMap<
  K extends Hashable | number | string | null | undefined,
  V,
> {
  /**
   * A function that computes key of an element to use in the mapping.
   */
  readonly getKey: (v: V) => K;

  /**
   * An array containing each element.
   */
  readonly elements: readonly V[];

  readonly #keyToIdx: HashMap<K, number>;

  /**
   * Creates a new read-only collection with elements accessible by array index or map key.
   *
   * @param getKey A function that computes the key of an element to use in the
   * mapping. This key should be immutable and unique among all of the elements.
   * @param elements The array containing each element. A shallow copy of
   * the array is made to this object.
   */
  constructor(getKey: (v: V) => K, elements: readonly V[] = []) {
    this.getKey = getKey;
    this.elements = [...elements];

    this.#keyToIdx = new HashMap();
    this.elements.forEach((v: V, i: number) => {
      const key = getKey(v);
      if (this.#keyToIdx.has(key)) {
        throw new Error(`Found duplicate key: ${JSON.stringify(key)}`);
      }

      this.#keyToIdx.set(key, i);
    });
  }

  /**
   * Tests whether an element exists in the collection.
   *
   * Elements are matched according to the corresponding key.
   */
  hasKeyOf(element: V): boolean {
    const key = this.getKey(element);
    return this.#keyToIdx.has(key);
  }

  /**
   * Gets an element by its index in the array.
   */
  getByIdx(idx: number): V | undefined {
    return this.elements.at(idx);
  }

  /**
   * Gets an element by its key in the mapping.
   */
  getByKey(key: K): V | undefined {
    const idx = this.#keyToIdx.get(key);
    if (idx === undefined) return undefined;

    return this.getByIdx(idx);
  }

  /**
   * Gets the index of a key in the mapping.
   */
  getIdxOfKey(key: K): number | undefined {
    return this.#keyToIdx.get(key);
  }

  /**
   * The number of elements in this collection.
   */
  get length(): number {
    return this.elements.length;
  }

  /**
   * The number of elements in this collection.
   */
  get size(): number {
    return this.length;
  }

  *[Symbol.iterator](): IterableIterator<V> {
    for (const element of this.elements) {
      yield element;
    }
  }
}
