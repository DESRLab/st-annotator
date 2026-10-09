/**
 * @typedef {import('./Equatable').Equatable} Equatable
 */

/**
 * Interface for hashable objects.
 * 
 * @implements {Equatable}
 * @interface
 */
export class Hashable {

    /**
     * Hashes this object to a string so that it can be used as a key in a mapping.
     * 
     * @returns {string} The resulting hash.
     * @abstract
     */
    hash() {
        throw new Error('Not implemented');
    }

    /**
     * Tests whether two objects are equal to each other.
     * 
     * This should agree with {@link hash}; that is, two equal objects must
     * have the same hash, although two objects with the same hash need not be equal.
     *
     * @param {object} other The object to compare against.
     * @returns {boolean} `true` if the two objects are equal; otherwise, `false`.
     * @abstract
     */
    equals(other) {
        throw new Error('Not implemented');
    }
}
