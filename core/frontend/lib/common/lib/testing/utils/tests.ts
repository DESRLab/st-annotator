import _ from "lodash";
import type { Euler, Matrix3, Matrix4, Vector2, Vector3, Vector4 } from "three";

import { MathUtils, ThreeUtils } from "../../utils";

/** Any vector/matrix type that exposes a `.toArray()` method. */
export type TensorLike =
  Vector2 | Vector3 | Vector4 | Euler | Matrix3 | Matrix4;

/** Options for floating-point approximation comparisons. */
export interface FloatApproxOptions {
  /** The absolute tolerance. @default 1e-6 */
  atol?: number;
  /** The relative tolerance. @default 1e-12 */
  rtol?: number;
  /** If `true`, considers {@link NaN} values to be equal to each other. @default false */
  nanOk?: boolean;
}

export const DEFAULT_APPROX_OPTS: Readonly<Required<FloatApproxOptions>> =
  Object.freeze({
    atol: 1e-6,
    rtol: 1e-12,
    nanOk: false,
  });

export const EXACT_MATCH: Readonly<Required<FloatApproxOptions>> =
  Object.freeze({
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
 * @param actual The actual value.
 * @param expected The expected value.
 * @param opts The options to apply for float approximations.
 * @returns `true` if the two values are equivalent; otherwise, `false`.
 */
export function floatApprox(
  actual: number,
  expected: number,
  opts: FloatApproxOptions = DEFAULT_APPROX_OPTS,
): boolean {
  const atol = opts.atol ?? DEFAULT_APPROX_OPTS.atol;
  const rtol = opts.rtol ?? DEFAULT_APPROX_OPTS.rtol;
  const nanOk = opts.nanOk ?? DEFAULT_APPROX_OPTS.nanOk;

  return (
    _.eq(actual, expected) ||
    ThreeUtils.isAbsClose(actual, expected, atol) ||
    ThreeUtils.isRelClose(actual, expected, rtol) ||
    (nanOk && Number.isNaN(actual) && Number.isNaN(expected))
  );
}

/**
 * Tests whether two floating-point angles are sufficiently close to each other
 * to be equivalent.
 *
 * If both values are {@link NaN} or +/-{@link Infinity}, they are also considered to be
 * equivalent.
 *
 * @param actual The actual value.
 * @param expected The expected value.
 * @param opts The options to apply for float approximations.
 * @returns `true` if the two values are equivalent; otherwise, `false`.
 */
export function angleApprox(
  actual: number,
  expected: number,
  opts: FloatApproxOptions = DEFAULT_APPROX_OPTS,
): boolean {
  const actualNormalized = MathUtils.normalizeAngle(actual);
  const expectedNormalized = MathUtils.normalizeAngle(expected);

  // Max difference between actualNormalized and expectedNormalized is MathUtils.TAU,
  // so we only consider these cases for wraparound.
  return (
    floatApprox(actualNormalized, expectedNormalized, opts) ||
    floatApprox(actualNormalized, expectedNormalized - MathUtils.TAU, opts) ||
    floatApprox(actualNormalized, expectedNormalized + MathUtils.TAU, opts)
  );
}

/**
 * Tests whether two vectors or matrices are sufficiently close to each other
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
export function tensorApprox<T extends TensorLike>(
  actual: T,
  expected: T,
  opts: FloatApproxOptions = DEFAULT_APPROX_OPTS,
): boolean {
  return _.zipWith(actual.toArray(), expected.toArray(), (a, b) => [
    a,
    b,
  ]).every(([a, b]) => {
    if (typeof a === "number" && typeof b === "number") {
      return floatApprox(a, b, opts);
    }

    return a === b;
  });
}
