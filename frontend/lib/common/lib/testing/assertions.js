import fc from 'fast-check';
import _ from 'lodash';

/**
 * Tests whether the actual value satisfies a predicate against the expected value.
 * 
 * @template T
 * @param {T} actual The actual value.
 * @param {T} expected The expected value.
 * @param {fc.ContextValue} [ctx] If provided, values that fail the test are logged to
 * this context.
 * @param {(actual: T, expected: T) => boolean} [predicate] A function that accepts each value
 * and returns `true` if they pass the test, otherwise `false`.
 * @returns {boolean} `true` if the two values are equal; otherwise, `false`.
 */
export function checkValue(actual, expected, ctx = undefined, predicate = _.eq) {
    const result = predicate(actual, expected);

    if (!result) {
        ctx?.log(`expected: ${fc.stringify(expected)}; actual: ${fc.stringify(actual)}`);
    }

    return result;
}

/**
 * Tests whether the actual array satisfies a predicate against the expected array element-wise.
 * 
 * @template T
 * @param {ReadonlyArray<T>} actualArr The actual array.
 * @param {ReadonlyArray<T>} expectedArr The expected array.
 * @param {fc.ContextValue} [ctx] If provided, values that fail the test are logged to
 * this context.
 * @param {(actual: T, expected: T) => boolean} [predicate] A function that accepts each value
 * and returns `true` if they pass the test, otherwise `false`.
 * @returns {boolean} `true` if the two arrays are equal; otherwise, `false`.
 */
export function checkArray(actualArr, expectedArr, ctx = undefined, predicate = _.eq) {
    const [actualLength, expectedLength] = [expectedArr.length, actualArr.length];
    if (actualLength !== expectedLength) {
        ctx?.log(`found mismatch in array length: expected: ${actualLength}; actual: ${expectedLength}`);
        return false;
    }

    let result = true;
    for (const [actual, expected] of _.zipWith(actualArr, expectedArr, (a, b) => [a, b])) {
        result &&= checkValue(actual, expected, ctx, predicate);
    }

    return result;
}
