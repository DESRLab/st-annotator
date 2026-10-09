import _ from 'lodash';

/**
 * Checks that the input value is numeric, and throws an error otherwise.
 * 
 * @param {number} x The input value.
 * @throws {Error} If the input is not numeric.
 */
export function assertIsNumeric(x) {
    if (typeof x !== 'number') throw new Error('The input is not numeric');
}

/**
 * Checks that the input value is numeric, and throws an error otherwise.
 * 
 * @param {number} x The input value.
 * @returns {boolean} If the input is not numeric.
 */
export function isNumeric(x) {
    return (typeof x === 'number');
}

/**
 * Same as {@link Math.sign}, except that `-0` returns `-1`, `+0` returns `1`,
 * and type-checking is enabled.
 * 
 * @param {number} x The numeric expression to test.
 * @returns {number} A number representing the sign of the argument.
 * @throws {Error} If the input is not numeric.
 */
export function sign1(x) {
    assertIsNumeric(x);

    if (Object.is(x, -0)) return -1;
    if (Object.is(x, +0)) return 1;

    return Math.sign(x);
}

/**
 * Normalizes a set of values such that the interval `[vmin, vmax]` is linearly mapped to `[0, 1]`.
 * 
 * @param {number[]} values The values to normalize.
 * @param {number} vmin The value that maps to `0`.
 * @param {number} vmax The value that maps to `1`.
 * @param {boolean} clip If `true`, values outside of `[vmin, vmax]` are mapped to `0` or `1`,
 * whichever is closer.
 * @returns {number[]} The normalized values.
 */
export function normalize(values, vmin, vmax, clip = false) {
    const range = vmax - vmin;
    const normedValues = values.map((v) => (v - vmin) / range);
    return clip ? normedValues.map((v) => _.clamp(v, 0, 1)) : normedValues;
}

/**
 * A mathematical constant equivalent to 2 * {@link Math.PI}.
 */
export const TAU = 2 * Math.PI;

/**
 * Normalizes an angle such that it falls within the interval `(-pi, pi)`.
 * 
 * @param {number} angle The input angle.
 * @returns {number} The normalized input angle.
 */
export function normalizeAngle(angle) {
    assertIsNumeric(angle);

    // https://stackoverflow.com/questions/2320986/easy-way-to-keeping-angles-between-179-and-180-degrees
    return angle - Math.ceil(angle / TAU - 0.5) * TAU;
}

/**
 * Finds the (population) standard deviation of a set of values.
 * 
 * @param {ReadonlyArray<number>} values The values from which to compute the standard deviation.
 * @param {?number} precomputedMean The precomputed mean of the provided values.
 * If not provided, it is computed automatically.
 * @returns {number} The standard deviation of the given values.
 * @throws {Error} If the input array is empty, or if an element is not numeric.
 */
export function getStd(values, precomputedMean = null) {
    if (values.length === 0) throw new Error('Cannot compute standard deviation of empty array');

    const mean = precomputedMean ?? _.mean(values);

    const result = values.reduce(({ ssd, count }, v) => {
        assertIsNumeric(v);

        const diff = v - mean;
        return { ssd: ssd + diff * diff, count: count + 1 };
    }, { ssd: 0, count: 0 });

    return Math.sqrt(result.ssd / result.count);
}
