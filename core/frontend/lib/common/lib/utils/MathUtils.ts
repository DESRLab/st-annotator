import _ from "lodash";

/**
 * Checks that the input value is numeric, and throws an error otherwise.
 *
 * @throws {Error} If the input is not numeric.
 */
export function assertIsNumeric(x: number): void {
  if (typeof x !== "number") throw new Error("The input is not numeric");
}

/**
 * Checks that the input value is numeric, and throws an error otherwise.
 */
export function isNumeric(x: number): boolean {
  return typeof x === "number";
}

/**
 * Same as {@link Math.sign}, except that `-0` returns `-1`, `+0` returns `1`,
 * and type-checking is enabled.
 *
 * @throws {Error} If the input is not numeric.
 */
export function sign1(x: number): number {
  assertIsNumeric(x);

  if (Object.is(x, -0)) return -1;
  if (Object.is(x, +0)) return 1;

  return Math.sign(x);
}

/**
 * Normalizes a set of values such that the interval `[vmin, vmax]` is linearly mapped to `[0, 1]`.
 */
export function normalize(
  values: number[],
  vmin: number,
  vmax: number,
  clip = false,
): number[] {
  const range = vmax - vmin;
  const normedValues = values.map((v: number) => (v - vmin) / range);
  return clip
    ? normedValues.map((v: number) => _.clamp(v, 0, 1))
    : normedValues;
}

/**
 * A mathematical constant equivalent to 2 * {@link Math.PI}.
 */
export const TAU = 2 * Math.PI;

/**
 * Normalizes an angle such that it falls within the interval `(-pi, pi)`.
 */
export function normalizeAngle(angle: number): number {
  assertIsNumeric(angle);

  // https://stackoverflow.com/questions/2320986/easy-way-to-keeping-angles-between-179-and-180-degrees
  return angle - Math.ceil(angle / TAU - 0.5) * TAU;
}

/**
 * Finds the (population) standard deviation of a set of values.
 *
 * @throws {Error} If the input array is empty, or if an element is not numeric.
 */
export function getStd(
  values: readonly number[],
  precomputedMean: number | null = null,
): number {
  if (values.length === 0)
    throw new Error("Cannot compute standard deviation of empty array");

  const mean = precomputedMean ?? _.mean(values);

  const result = values.reduce(
    ({ ssd, count }: { ssd: number; count: number }, v: number) => {
      assertIsNumeric(v);

      const diff = v - mean;
      return { ssd: ssd + diff * diff, count: count + 1 };
    },
    { ssd: 0, count: 0 },
  );

  return Math.sqrt(result.ssd / result.count);
}
