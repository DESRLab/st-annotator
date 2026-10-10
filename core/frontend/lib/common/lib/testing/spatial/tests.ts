import _ from "lodash";

import type {
  OptionalVector3,
  OptionalDecimalVector3Data,
  DecimalVector3Data,
  OptionalVector3Data,
  Vector3Data,
} from "../../spatial/vectors";
import {
  DEFAULT_APPROX_OPTS,
  floatApprox,
  type FloatApproxOptions,
} from "../utils";

/**
 * Tests whether two vectors or matrices are sufficiently close to each other
 * to be equivalent using component-wise comparison.
 *
 * If both values are `null`, {@link NaN} or +/-{@link Infinity}, they are also considered to be
 * equivalent.
 *
 * @param actual The actual value.
 * @param expected The expected value.
 * @param opts The options to apply for float approximations.
 * @returns `true` if the two values are equivalent; otherwise, `false`.
 */
export function optionalTensorApprox<T extends OptionalVector3>(
  actual: T,
  expected: T,
  opts: FloatApproxOptions = DEFAULT_APPROX_OPTS,
): boolean {
  return _.zipWith(actual.toArray(), expected.toArray(), (a, b) => [
    a,
    b,
  ]).every(([a, b]) => {
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
 * @param actual The actual value.
 * @param expected The expected value.
 * @param opts The options to apply for float approximations.
 * @returns `true` if the two values are equivalent; otherwise, `false`.
 */
export function optionalTensorDataApprox<
  T extends OptionalDecimalVector3Data | OptionalVector3Data,
>(
  actual: T,
  expected: T,
  opts: FloatApproxOptions = DEFAULT_APPROX_OPTS,
): boolean {
  return _.zipWith(
    [actual.x, actual.y, actual.z],
    [expected.x, expected.y, expected.z],
    (a, b) => [a, b],
  ).every(([a, b]) => {
    if (a == null) return b == null;
    if (b == null) return false;

    if (typeof a === "number" && typeof b === "number") {
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
 * @param actual The actual value.
 * @param expected The expected value.
 * @param opts The options to apply for float approximations.
 * @returns `true` if the two values are equivalent; otherwise, `false`.
 */
export function tensorDataApprox<T extends DecimalVector3Data | Vector3Data>(
  actual: T,
  expected: T,
  opts: FloatApproxOptions = DEFAULT_APPROX_OPTS,
): boolean {
  return _.zipWith(
    [actual.x, actual.y, actual.z],
    [expected.x, expected.y, expected.z],
    (a, b) => [a, b],
  ).every(([a, b]) => {
    if (typeof a === "number" && typeof b === "number") {
      return floatApprox(a, b, opts);
    }

    return a === b;
  });
}
