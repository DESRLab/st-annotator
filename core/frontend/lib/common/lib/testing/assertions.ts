import fc from "fast-check";
import _ from "lodash";

/**
 * Tests whether the actual value satisfies a predicate against the expected value.
 *
 * @param actual The actual value.
 * @param expected The expected value.
 * @param ctx If provided, values that fail the test are logged to this context.
 * @param predicate A function that accepts each value and returns `true` if they
 * pass the test, otherwise `false`.
 * @returns `true` if the two values are equal; otherwise, `false`.
 */
export function checkValue<T>(
  actual: T,
  expected: T,
  ctx: fc.ContextValue | undefined = undefined,
  predicate: (actual: T, expected: T) => boolean = _.eq.bind(_) as (
    a: T,
    b: T,
  ) => boolean,
): boolean {
  const result = predicate(actual, expected);

  if (!result) {
    ctx?.log(
      `expected: ${fc.stringify(expected)}; actual: ${fc.stringify(actual)}`,
    );
  }

  return result;
}

/**
 * Tests whether the actual array satisfies a predicate against the expected array element-wise.
 *
 * @param actualArr The actual array.
 * @param expectedArr The expected array.
 * @param ctx If provided, values that fail the test are logged to this context.
 * @param predicate A function that accepts each value and returns `true` if they
 * pass the test, otherwise `false`.
 * @returns `true` if the two arrays are equal; otherwise, `false`.
 */
export function checkArray<T>(
  actualArr: readonly T[],
  expectedArr: readonly T[],
  ctx: fc.ContextValue | undefined = undefined,
  predicate: (actual: T, expected: T) => boolean = _.eq.bind(_) as (
    a: T,
    b: T,
  ) => boolean,
): boolean {
  const [actualLength, expectedLength] = [expectedArr.length, actualArr.length];
  if (actualLength !== expectedLength) {
    ctx?.log(
      `found mismatch in array length: expected: ${actualLength}; actual: ${expectedLength}`,
    );
    return false;
  }

  let result = true;
  for (const [actual, expected] of _.zipWith(actualArr, expectedArr, (a, b) => [
    a,
    b,
  ])) {
    result &&= checkValue(actual, expected, ctx, predicate);
  }

  return result;
}
