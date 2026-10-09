/**
 * @typedef {import('../../../utils').Equatable} Equatable
 */

/**
 * @typedef {import('../../../utils').Hashable} Hashable
 */

/**
 * @implements {Equatable}
 */
export class EquatableStub {

    /**
     * Tests whether two objects are equal to each other.
     *
     * @param {object} other The object to compare against.
     * @returns {boolean} `true` if the two objects are equal; otherwise, `false`.
     */
    equals(other) {
        return this === other;
    }
}

/**
 * @implements {Hashable}
 */
export class HashableStub extends EquatableStub {

    static #maxId = 0;

    #id = 0;

    constructor() {
        super();

        this.#id = HashableStub.#maxId;

        HashableStub.#maxId += 1;
    }

    /**
     * Hashes this object to a string so that it can be used as a key in a mapping.
     * 
     * @returns {string} The resulting hash.
     */
    hash() {
        return this.#id.toString();
    }
}
