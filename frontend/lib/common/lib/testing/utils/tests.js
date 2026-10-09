import _ from 'lodash';

import { MathUtils, ThreeUtils } from '../../utils';

/**
 * @typedef {import('three')} THREE
 */

/**
 * @typedef {THREE.Vector2 | THREE.Vector3 | THREE.Vector4 | THREE.Euler
 * | THREE.Matrix3 | THREE.Matrix4} TensorLike
 */

/**
 * @typedef {object} FloatApproxOptions
 * @property {number} [atol=1e-6] The absolute tolerance.
 * @property {number} [rtol=1e-12] The relative tolerance.
 * @property {boolean} [nanOk=false] If `true`, considers {@link NaN} values to be
 * equal to each other.
 */

/**
 * @readonly
 * @type {Readonly<Required<FloatApproxOptions>>}
 */
export const DEFAULT_APPROX_OPTS = Object.freeze({
    atol: 1e-6,
    rtol: 1e-12,
    nanOk: false,
});

/**
 * @readonly
 * @type {Readonly<Required<FloatApproxOptions>>}
 */
export const EXACT_MATCH = Object.freeze({
    atol: 0,
    rtol: 0,
    nanOk: true,
});

/**
 * Tests whether two floating-point numbers are sufficiently close to each other
 * to be equivalent.
 * 
 * If both values are {@link NaN} or +/-{@link Infinity}, they are also considered to be
 * equivalent.
 * 
 * @param {number} actual The actual value.
 * @param {number} expected The expected value.
 * @param {FloatApproxOptions} [opts] The options to apply for float approximations.
 * @returns {boolean} `true` if the two values are equivalent; otherwise, `false`.
 */
export function floatApprox(actual, expected, opts = DEFAULT_APPROX_OPTS) {
    const atol = opts.atol ?? DEFAULT_APPROX_OPTS.atol;
    const rtol = opts.rtol ?? DEFAULT_APPROX_OPTS.rtol;
    const nanOk = opts.nanOk ?? DEFAULT_APPROX_OPTS.nanOk;

    return _.eq(actual, expected)
        || ThreeUtils.isAbsClose(actual, expected, atol)
        || ThreeUtils.isRelClose(actual, expected, rtol)
        || (nanOk && Number.isNaN(actual) && Number.isNaN(expected));
}

/**
 * Tests whether two floating-point angles are sufficiently close to each other
 * to be equivalent.
 * 
 * If both values are {@link NaN} or +/-{@link Infinity}, they are also considered to be
 * equivalent.
 * 
 * @param {number} actual The actual value.
 * @param {number} expected The expected value.
 * @param {FloatApproxOptions} [opts] The options to apply for float approximations.
 * @returns {boolean} `true` if the two values are equivalent; otherwise, `false`.
 */
export function angleApprox(actual, expected, opts = DEFAULT_APPROX_OPTS) {
    const actualNormalized = MathUtils.normalizeAngle(actual);
    const expectedNormalized = MathUtils.normalizeAngle(expected);

    // Max difference between actualNormalized and expectedNormalized is MathUtils.TAU,
    // so we only consider these cases for wraparound.
    return floatApprox(actualNormalized, expectedNormalized, opts)
        || floatApprox(actualNormalized, expectedNormalized - MathUtils.TAU, opts)
        || floatApprox(actualNormalized, expectedNormalized + MathUtils.TAU, opts);
}

/**
 * Tests whether two vectors or matrices are sufficiently close to each other
 * to be equivalent using component-wise comparison.
 * 
 * If both values are {@link NaN} or +/-{@link Infinity}, they are also considered to be
 * equivalent.
 * 
 * @template {TensorLike} T
 * @param {T} actual The actual value.
 * @param {T} expected The expected value.
 * @param {FloatApproxOptions} [opts] The options to apply for float approximations.
 * @returns {boolean} `true` if the two values are equivalent; otherwise, `false`.
 */
export function tensorApprox(actual, expected, opts = DEFAULT_APPROX_OPTS) {
    return _.zipWith(actual.toArray(), expected.toArray(), (a, b) => [a, b])
        .every(([a, b]) => {
            if (typeof a === 'number' && typeof b === 'number') {
                return floatApprox(a, b, opts);
            }

            return a === b;
        });
}
