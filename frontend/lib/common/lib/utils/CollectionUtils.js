import * as Collections from 'typescript-collections';

/**
 * @typedef {import('./interfaces').Hashable} Hashable
 */

/**
 * Tests whether every element in the provided collection matches a predicate.
 * 
 * Note that this method returns `true` for empty collections.
 * 
 * @template T The type of element in the collection.
 * @param {Iterable<T>} collection The collection to iterate over.
 * @param {(v: T) => boolean} predicate The predicate to test.
 * @returns {boolean} `true` if all elements pass the predicate check, else `false`.
 */
export function every(collection, predicate) {
    for (const v of collection) {
        if (!predicate(v)) return false;
    }

    return true;
}

/**
 * Tests whether any element in the provided collection matches a predicate.
 * 
 * Note that this method returns `false` for empty collections.
 * 
 * @template T The type of element in the collection.
 * @param {Iterable<T>} collection The collection to iterate over.
 * @param {(v: T) => boolean} predicate The predicate to test.
 * @returns {boolean} `true` if any element passes the predicate check, else `false`.
 */
export function some(collection, predicate) {
    for (const v of collection) {
        if (predicate(v)) return true;
    }

    return false;
}

/**
 * A set-like view of the keys in a {@link Map}.
 * 
 * Changes to the underlying map are reflected in this object.
 * 
 * @template K The data type of the keys.
 * @implements {ReadonlySet<K>}
 */
export class KeyView {

    /**
     * The map containing the keys.
     * 
     * @readonly
     * @type {ReadonlyMap<K, unknown>}
     */
    map;

    /**
     * Creates a live view of the keys of a {@link Map}.
     * 
     * @param {ReadonlyMap<K, unknown>} map The map containing the keys.
     */
    constructor(map) {
        this.map = map;
    }

    /**
     * @type {(
     *     callbackfn: (value: K, value2: K, set: this) => void,
     *     thisArg?: any
     * ) => void}
     */
    forEach(callbackfn, thisArg = undefined) {
        this.map.forEach((v, k) => callbackfn(k, k, this), thisArg);
    }

    /**
     * @type {(value: K) => boolean}
     */
    has(value) { return this.map.has(value); }

    /**
     * @type {number}
     */
    get size() { return this.map.size; }

    /**
     * @type {() => IterableIterator<K>}
     */
    [Symbol.iterator]() { return this.values(); }

    /**
     * @type {() => IterableIterator<K>}
     */
    values() { return this.map.keys(); }

    /**
     * @type {() => IterableIterator<K>}
     */
    keys() { return this.values(); }

    /**
     * @type {() => IterableIterator<[K, K]>}
     */
    * entries() {
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
 * 
 * @template K The data type of the keys.
 * @template V The data type of the values.
 * @augments {Map<K, V>}
 */
export class DefaultMap extends Map {

    /**
     * Constructs the default value assigned to a missing key when {@link DefaultMap#get} is called.
     * 
     * @type {() => V}
     */
    defaultFactory;

    /**
     * Creates a new {@link Map} that creates and returns a default value when
     * {@link DefaultMap#get} is called for a key that does not exist.
     * 
     * @param {() => (V)} defaultFactory Constructs the default value assigned to a missing key
     * when {@link DefaultMap.get} is called.
     * @param {?Iterable<[K, V]>} entries An iterable object whose elements are key-value pairs.
     * Each key-value pair is added to the new map.
     */
    constructor(defaultFactory, entries = null) {
        super(entries);

        this.defaultFactory = defaultFactory;
    }

    /**
     * @type {(key: K) => V}
     */
    get(key) {
        if (!this.has(key)) {
            this.set(key, this.defaultFactory());
        }

        // TypeScript cannot infer that the value is guaranteed to exist
        // @ts-expect-error
        return super.get(key);
    }
}

/**
 * A {@link Map} where key equality is computed according to {@link Hashable#hash},
 * instead of object equality.
 * 
 * TODO: Use {@link Hashable#equals} instead.
 * 
 * @template {Hashable | string | number | null | undefined} K The data type of the keys.
 * @template V The data type of the values.
 * @implements {Map<K, V>}
 */
export class HashMap {

    /**
     * Converts a key into a string.
     * 
     * @param {Hashable | string | number | null | undefined} key The input key.
     * @returns {string} The converted string.
     */
    static tryStringify(key) {
        if (typeof key === 'string') return key;
        if (typeof key === 'number') return key.toString();
        if (key == null) return String(key);

        return key.hash();
    }

    /**
     * @type {(key: K) => string}
     */
    #keyToString = (key) => HashMap.tryStringify(key);

    /**
     * @type {Collections.Dictionary<K, V>}
     */
    #map = new Collections.Dictionary(this.#keyToString);

    /**
     * Creates a new {@link Map} where keys are hashed according to a custom function.
     * 
     * @param {?Iterable<[K, V]>} entries An iterable object whose elements are key-value pairs.
     * Each key-value pair is added to the new map.
     */
    constructor(entries = null) {
        if (entries != null) {
            for (const [k, v] of entries) {
                this.set(k, v);
            }
        }
    }

    clear() {
        this.#map.clear();
    }

    /**
     * @type {(key: K) => boolean}
     */
    delete(key) {
        return this.#map.remove(key) === undefined;
    }

    /**
     * @type {(
     *     callbackfn: (value: V, key: K, map: Map<K, V>) => void,
     *     thisArg?: any
     * ) => void}
     */
    forEach(callbackfn) {
        this.#map.forEach((k, v) => callbackfn(v, k, this));
    }

    /**
     * @type {(key: K) => V | undefined}
     */
    get(key) {
        return this.#map.getValue(key);
    }

    /**
     * @type {(key: K) => boolean}
     */
    has(key) {
        return this.#map.containsKey(key);
    }

    /**
     * @type {(key: K, value: V) => this}
     */
    set(key, value) {
        this.#map.setValue(key, value);
        return this;
    }

    /**
     * @type {number}
     */
    get size() { return this.#map.size(); }

    /**
     * @type {() => IterableIterator<[K, V]>}
     */
    [Symbol.iterator]() { return this.entries(); }

    get [Symbol.toStringTag]() { return 'HashableMap'; }

    /**
     * @type {() => IterableIterator<V>}
     */
    * values() {
        for (const v of this.#map.values()) {
            yield v;
        }
    }

    /**
     * @type {() => IterableIterator<K>}
     */
    * keys() {
        for (const k of this.#map.keys()) {
            yield k;
        }
    }

    /**
     * @type {() => IterableIterator<[K, V]>}
     */
    * entries() {
        for (const k of this.#map.keys()) {
            // TypeScript cannot infer that the value is guaranteed to exist
            // @ts-expect-error
            yield [k, this.#map.getValue(k)];
        }
    }
}

/**
 * An read-only collection with elements accessible by array index or map key.
 * 
 * @template {Hashable | number | string | null | undefined} K The data type of the keys.
 * @template V The data type of the values.
 */
export class ReadonlyArrayMap {

    /**
     * A function that computes key of an element to use in the mapping.
     * 
     * @readonly
     * @type {(v: V) => K}
     */
    getKey;

    /**
     * An array containing each element.
     * 
     * @readonly
     * @type {ReadonlyArray<V>}
     */
    elements;

    /**
     * @readonly
     * @type {HashMap<K, number>}
     */
    #keyToIdx;

    /**
     * Creates a new read-only collection with elements accessible by array index or map key.
     * 
     * @param {(v: V) => K} getKey A function that computes the key of an element to use in the
     * mapping. This key should be immutable and unique among all of the elements.
     * @param {ReadonlyArray<V>} elements The array containing each element. A shallow copy of
     * the array is made to this object.
     */
    constructor(getKey, elements = []) {
        this.getKey = getKey;
        this.elements = [...elements];

        this.#keyToIdx = new HashMap();
        this.elements.forEach((v, i) => {
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
     * 
     * @param {V} element The query element.
     * @returns {boolean} `true` if the element exists; otherwise, `false`.
     */
    hasKeyOf(element) {
        const key = this.getKey(element);
        return this.#keyToIdx.has(key);
    }

    /**
     * Gets an element by its index in the array.
     * 
     * @param {number} idx The query index.
     * @returns {V | undefined} The element at the index, or `undefined` if not found.
     */
    getByIdx(idx) {
        return this.elements.at(idx);
    }

    /**
     * Gets an element by its key in the mapping.
     * 
     * @param {K} key The query key.
     * @returns {V | undefined} The element matching the key, or `undefined` if not found.
     */
    getByKey(key) {
        const idx = this.#keyToIdx.get(key);
        if (idx === undefined) return undefined;

        return this.getByIdx(idx);
    }

    /**
     * Gets the index of a key in the mapping.
     * 
     * @param {K} key The query key.
     * @returns {number | undefined} The requested index, or `undefined` if not found.
     */
    getIdxOfKey(key) {
        return this.#keyToIdx.get(key);
    }

    /**
     * The number of elements in this collection.
     * 
     * @type {number}
     */
    get length() { return this.elements.length; }

    /**
     * The number of elements in this collection.
     * 
     * @type {number}
     */
    get size() { return this.length; }

    /**
     * @yields {V} Each element in this collection.
     */
    * [Symbol.iterator]() {
        for (const element of this.elements) {
            yield element;
        }
    }
}
