import fc from "fast-check";

import {
  OptionalVector3,
  OptionalDecimalVector3Data,
  DecimalVector3Data,
  OptionalVector3Data,
  Vector3Data,
} from "../../spatial";
import { assignToStringMethod } from "../arbitraries";

const DebugOptionalVector3 = assignToStringMethod(OptionalVector3, [
  "x",
  "y",
  "z",
]);

/**
 * Creates an arbitrary that returns a {@link OptionalVector3}.
 *
 * @param makeComponentArb A factory function used to create an
 * arbitrary for each specified vector component.
 * @returns The new arbitrary.
 */
export function makeOptionalVector3Arbitrary(
  makeComponentArb: () => fc.Arbitrary<number> = fc.double,
): fc.Arbitrary<OptionalVector3> {
  return fc
    .record({
      x: fc.option(makeComponentArb()),
      y: fc.option(makeComponentArb()),
      z: fc.option(makeComponentArb()),
    })
    .map(({ x, y, z }) => new DebugOptionalVector3(x, y, z));
}

const makeNumStringArbitrary = () => fc.double().map((v) => v.toString());

/**
 * Creates an arbitrary that returns a {@link OptionalDecimalVector3Data}.
 *
 * @param makeComponentArb A factory function used to create an
 * arbitrary for each specified vector component.
 * @returns The new arbitrary.
 */
export function makeOptionalDecimalVector3DataArbitrary(
  makeComponentArb: () => fc.Arbitrary<string> = makeNumStringArbitrary,
): fc.Arbitrary<OptionalDecimalVector3Data> {
  return fc
    .record({
      x: fc.option(makeComponentArb()),
      y: fc.option(makeComponentArb()),
      z: fc.option(makeComponentArb()),
    })
    .map((v) => OptionalDecimalVector3Data.create(v));
}

/**
 * Creates an arbitrary that returns a {@link DecimalVector3Data}.
 *
 * @param makeComponentArb A factory function used to create an
 * arbitrary for each specified vector component.
 * @returns The new arbitrary.
 */
export function makeDecimalVector3DataArbitrary(
  makeComponentArb: () => fc.Arbitrary<string> = makeNumStringArbitrary,
): fc.Arbitrary<DecimalVector3Data> {
  return fc
    .record({
      x: makeComponentArb(),
      y: makeComponentArb(),
      z: makeComponentArb(),
    })
    .map((v) => DecimalVector3Data.create(v));
}

/**
 * Creates an arbitrary that returns a {@link OptionalVector3Data}.
 *
 * @param makeComponentArb A factory function used to create an
 * arbitrary for each specified vector component.
 * @returns The new arbitrary.
 */
export function makeOptionalVector3DataArbitrary(
  makeComponentArb: () => fc.Arbitrary<number> = fc.double,
): fc.Arbitrary<OptionalVector3Data> {
  return fc
    .record({
      x: fc.option(makeComponentArb()),
      y: fc.option(makeComponentArb()),
      z: fc.option(makeComponentArb()),
    })
    .map((v) => OptionalVector3Data.create(v));
}

/**
 * Creates an arbitrary that returns a {@link Vector3Data}.
 *
 * @param makeComponentArb A factory function used to create an
 * arbitrary for each specified vector component.
 * @returns The new arbitrary.
 */
export function makeVector3DataArbitrary(
  makeComponentArb: () => fc.Arbitrary<number> = fc.double,
): fc.Arbitrary<Vector3Data> {
  return fc
    .record({
      x: makeComponentArb(),
      y: makeComponentArb(),
      z: makeComponentArb(),
    })
    .map((v) => Vector3Data.create(v));
}
