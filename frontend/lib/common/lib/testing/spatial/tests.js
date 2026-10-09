import _ from 'lodash';

import { DEFAULT_APPROX_OPTS, floatApprox } from '../utils';

/**
 * @typedef {import('../../spatial').OptionalVector3} OptionalVector3
 */

/**
 * @typedef {import('../../spatial').OptionalDecimalVector3Data} OptionalDecimalVector3Data
 */

/**
 * @typedef {import('../../spatial').DecimalVector3Data} DecimalVector3Data
 */

/**
 * @typedef {import('../../spatial').OptionalVector3Data} OptionalVector3Data
 */

/**
 * @typedef {import('../../spatial').Vector3Data} Vector3Data
 */

/**
 * Tests whether two vectors or matrices are sufficiently close to each other
 * to be equivalent using component-wise comparison.
 * 
 * If both values are `null`, {@link NaN} or +/-{@link Infinity}, they are also considered to be
 * equivalent.
 * 
 * @template {OptionalVector3} T
 * @param {T} actual The actual value.
 * @param {T} expected The expected value.
 * @param {import('../utils').FloatApproxOptions} [opts]
 * The options to apply for float approximations.
 * @returns {boolean} `true` if the two values are equivalent; otherwise, `false`.
 */
export function optionalTensorApprox(actual, expected, opts = DEFAULT_APPROX_OPTS) {
    return _.zipWith(actual.toArray(), expected.toArray(), (a, b) => [a, b])
        .every(([a, b]) => {
            if (a == null) return b == null;
            if (b == null) return false;
            return floatApprox(a, b, opts);
        });
}

/**
 * Tests whether two vectors are sufficiently close to each other
 * to be equivalent using component-wise comparison.
 * 
 * If both values are {@link NaN} or +/-{@link Infinity}, they are also considered to be
 * equivalent.
 * 
 * @template {OptionalDecimalVector3Data | OptionalVector3Data} T
 * @param {T} actual The actual value.
 * @param {T} expected The expected value.
 * @param {import('../utils').FloatApproxOptions} [opts]
 * The options to apply for float approximations.
 * @returns {boolean} `true` if the two values are equivalent; otherwise, `false`.
 */
export function optionalTensorDataApprox(actual, expected, opts = DEFAULT_APPROX_OPTS) {
    return _.zipWith(
        [actual.x, actual.y, actual.z],
        [expected.x, expected.y, expected.z],
        (a, b) => [a, b],
    ).every(([a, b]) => {
        if (a == null) return b == null;
        if (b == null) return false;

        if (typeof a === 'number' && typeof b === 'number') {
            return floatApprox(a, b, opts);
        }

        return a === b;
    });
}

/**
 * Tests whether two vectors are sufficiently close to each other
 * to be equivalent using component-wise comparison.
 * 
 * If both values are {@link NaN} or +/-{@link Infinity}, they are also considered to be
 * equivalent.
 * 
 * @template {DecimalVector3Data | Vector3Data} T
 * @param {T} actual The actual value.
 * @param {T} expected The expected value.
 * @param {import('../utils').FloatApproxOptions} [opts]
 * The options to apply for float approximations.
 * @returns {boolean} `true` if the two values are equivalent; otherwise, `false`.
 */
export function tensorDataApprox(actual, expected, opts = DEFAULT_APPROX_OPTS) {
    return _.zipWith(
        [actual.x, actual.y, actual.z],
        [expected.x, expected.y, expected.z],
        (a, b) => [a, b],
    ).every(([a, b]) => {
        if (typeof a === 'number' && typeof b === 'number') {
            return floatApprox(a, b, opts);
        }

        return a === b;
    });
}
