/**
 * Primitives whose strict equality checks are based on value rather than object identity.
 * 
 * @typedef {number | string | boolean} EquatablePrimitive
 */

/**
 * @typedef {Equatable | EquatablePrimitive} EquatableValue
 */

/**
 * Interface for objects that support rich equality checks.
 * 
 * @interface
 */
export class Equatable {

    /**
     * Tests whether two nullable values are equal to each other.
     *
     * @template {EquatableValue} T
     * @param {?T} a The first object, or `null`.
     * @param {?T} b The second object, or `null`.
     * @returns {boolean} `true` if the two values are equal, or if they are both
     * `null`; otherwise, `false`.
     */
    static equalsNullable(a, b) {
        if (a == null) return b == null;
        if (b == null) return false;

        return (typeof a === 'object' && typeof b === 'object') ? a.equals(b) : a === b;
    }

    /**
     * Tests whether two objects are equal to each other.
     *
     * @param {object} other The object to compare against.
     * @returns {boolean} `true` if the two objects are equal; otherwise, `false`.
     * @abstract
     */
    equals(other) {
        throw new Error('Not implemented');
    }
}
