/**
 * @template T
 * @typedef {import('../../../../../common/lib/utils').TypeUtils.ConstructorOf<T>} ConstructorOf
 */

/**
 * @template T
 * @typedef {import('../../../../../common/lib/utils').TypeUtils.TypeGuard<T>} TypeGuard
 */

/**
 * Represents a placeholder value to be resolved.
 * 
 * @template {{} | null} T The type of value after the placeholder is resolved.
 */
export class Placeholder {

    /**
     * Tests whether an object is a placeholder value.
     * 
     * @type {TypeGuard<Placeholder<any>>}
     */
    static isPlaceholder(obj) {
        if (obj instanceof Placeholder) return true;

        if (obj?.constructor.name === 'Placeholder') {
            // Add this fuzzy comparison because webpack might bundle the plugin in a way
            // such that the Placeholder defined here is a different than the one in the plugin
            console.warn('Detected Placeholder object with a different prototype than the one in this library.');

            return true;
        }

        return false;
    }

    /**
     * This allows us to differentiate instances of this class for debugging purposes.
     * 
     * @type {number}
     */
    static #idCounter = 0;

    /**
     * This allows us to differentiate instances of this class for debugging purposes.
     * 
     * @type {number}
     */
    #id;

    /**
     * A promise that resolves to the value of this placeholder.
     * 
     * @readonly
     * @type {Promise<T>}
     */
    #promise;

    /**
     * Resolves the promise of this placeholder.
     * 
     * @type {(value: T | PromiseLike<T>) => void}
     */
    #resolve;

    /**
     * Rejects the promise of this placeholder.
     * 
     * @type {(reason?: any) => void}
     */
    #reject;

    /**
     * The resolved value, or `undefined` if it has yet to be resolved.
     * 
     * @type {T | undefined}
     */
    #value;

    /**
     * Creates a new placeholder value.
     * 
     * @param {ConstructorOf<T>} [valueType] The type of placeholder value.
     */
    constructor(valueType = undefined) {
        // eslint-disable-next-line no-plusplus
        this.#id = Placeholder.#idCounter++;

        this.#promise = new Promise((resolve, reject) => {
            this.#resolve = resolve;
            this.#reject = reject;
        });

        this.#value = undefined;
    }

    /**
     * Tests if this placeholder has been resolved to a value.
     * 
     * @param {T} value The value to test.
     * @returns {boolean} `true` if this placeholder has been resolved with a value that equals
     * to the given value; otherwise, `false`.
     */
    hasValue(value) {
        return this.#value === value;
    }

    /**
     * If this placeholder already has a value, returns it; otherwise, returns `fallback`.
     * 
     * @param {T} fallback The fallback value.
     * @returns {T} The value in this placeholder; if it does not exist, `fallback`.
     */
    orElse(fallback) {
        if (this.#value !== undefined) {
            return this.#value;
        }

        return fallback;
    }

    /**
     * If this placeholder already has a value, returns it; otherwise, invokes
     * `fallback` to generate a fallback value.
     * 
     * @param {() => T} fallback A function that generates the fallback value.
     * @returns {T} The value in this placeholder; if it does not exist, the
     * output of `fallback`.
     */
    orElseGet(fallback) {
        if (this.#value !== undefined) {
            return this.#value;
        }

        return fallback();
    }

    /**
     * Returns a promise that resolves to the value in this placeholder.
     * 
     * @returns {Promise<T>} The requested promise.
     */
    getAsync() {
        if (this.#value !== undefined) {
            return Promise.resolve(this.#value);
        }

        return this.#promise;
    }

    /**
     * Resolves this placeholder with the given value.
     * 
     * @param {T} value The resolved value of this placeholder.
     */
    put(value) {
        if (this.#value !== undefined) {
            throw new Error('This placeholder has already been resolved');
        }

        this.#value = value;
        this.#resolve(value);
    }

    /**
     * Returns a string representation of this object.
     * 
     * @returns {string} The string representation of this object.
     */
    toString() {
        if (this.#value !== undefined) {
            return String(this.#value);
        }

        return `<Placeholder #${this.#id}>`;
    }

    /**
     * Used by the {@link JSON.stringify} method to enable the transformation of an object's
     * data for JavaScript Object Notation (JSON) serialization.
     * 
     * @returns {object} The JSON-compatible type.
     */
    toJSON() {
        return { placeholder_id: this.#id };
    }
}
