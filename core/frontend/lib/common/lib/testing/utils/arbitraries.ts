import { Decimal } from "decimal.js";
import fc from "fast-check";
import * as THREE from "three";

import { Timestamp } from "../../utils";
import { assignToStringMethod, makeDigitsArbitrary } from "../arbitraries";

class _DebugTimestamp extends Timestamp {
  get date() {
    return this.getDate();
  }

  get time() {
    return this.getTime();
  }
}

const DebugTimestamp = assignToStringMethod(_DebugTimestamp, ["date", "time"]);

/**
 * Creates an arbitrary that returns a random Unix timestamp
 * that can be parsed into a {@link Timestamp}.
 *
 * @param valid If `true`, only generates valid values;
 * otherwise, only generates invalid values.
 * @returns The new arbitrary.
 */
export function makeUnixTimeArbitrary(
  valid = true,
): fc.Arbitrary<number | Decimal> {
  let numberArb;

  if (valid) {
    numberArb = fc.oneof(
      fc.integer({
        min: Timestamp.MIN_UNIX_TIME,
        max: Timestamp.MAX_UNIX_TIME,
      }),
      fc.double({
        min: Timestamp.MIN_UNIX_TIME,
        max: Timestamp.MAX_UNIX_TIME,
        noNaN: true,
      }),
    );
  } else {
    numberArb = fc.oneof(
      fc.integer({
        min: Number.MIN_SAFE_INTEGER,
        max: Timestamp.MIN_UNIX_TIME - 1,
      }),
      fc.integer({
        min: Timestamp.MAX_UNIX_TIME + 1,
        max: Number.MAX_SAFE_INTEGER,
      }),
      fc.constant(NaN),
      fc
        .double({ max: Timestamp.MIN_UNIX_TIME })
        .filter((x) => x < Timestamp.MIN_UNIX_TIME),
      fc
        .double({ min: Timestamp.MAX_UNIX_TIME })
        .filter((x) => x > Timestamp.MAX_UNIX_TIME),
    );
  }

  return fc.oneof(
    numberArb,
    numberArb.map((x) => new Decimal(x)),
  );
}

/**
 * Creates an arbitrary that returns a random string
 * that can be parsed into a {@link Timestamp}.
 *
 * @returns The new arbitrary.
 */
export function makeTimestampStrArbitrary(): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.date(),
      makeDigitsArbitrary({
        maxLength: Timestamp.DECIMAL_PRECISION - 32,
      }),
    )
    .map(([date, digits]) => {
      const utcString = date.toISOString();
      if (!utcString.endsWith("Z")) {
        throw new Error("Timezone offset is not UTC");
      }

      const dateStr = utcString.slice(0, -1);
      return `${dateStr}${digits}Z`;
    });
}

/**
 * Creates an arbitrary that returns a random {@link Timestamp}.
 *
 * @returns The new arbitrary.
 */
export function makeTimestampArbitrary(): fc.Arbitrary<Timestamp> {
  return fc
    .oneof(makeUnixTimeArbitrary(), makeTimestampStrArbitrary(), fc.date())
    .map((value) => new DebugTimestamp(value));
}

const COLOR_NAMES = Object.keys(THREE.Color.NAMES);
const DebugColor = assignToStringMethod(THREE.Color, ["r", "g", "b"]);

/**
 * Creates an arbitrary that returns a random {@link THREE.Color}.
 *
 * @returns The new arbitrary.
 */
export function makeColorArbitrary(): fc.Arbitrary<THREE.Color> {
  return fc.constantFrom(...COLOR_NAMES).map((name) => new DebugColor(name));
}

const DebugVector3 = assignToStringMethod(THREE.Vector3, ["x", "y", "z"]);

/**
 * Creates an arbitrary that returns a {@link THREE.Vector3}.
 *
 * @param makeComponentArb A factory function used to create an
 * arbitrary for each vector component.
 * @returns The new arbitrary.
 */
export function makeVector3Arbitrary(
  makeComponentArb: () => fc.Arbitrary<number> = fc.double,
): fc.Arbitrary<THREE.Vector3> {
  return fc
    .record({
      x: makeComponentArb(),
      y: makeComponentArb(),
      z: makeComponentArb(),
    })
    .map(({ x, y, z }) => new DebugVector3(x, y, z));
}

const DebugEuler = assignToStringMethod(THREE.Euler, ["x", "y", "z", "order"]);

/**
 * Creates an arbitrary that returns a {@link THREE.Euler}.
 *
 * @param makeComponentArb A factory function used to create an
 * arbitrary for each vector component.
 * @returns The new arbitrary.
 */
export function makeEulerArbitrary(
  makeComponentArb: () => fc.Arbitrary<number> = fc.double,
): fc.Arbitrary<THREE.Euler> {
  return fc
    .record({
      x: makeComponentArb(),
      y: makeComponentArb(),
      z: makeComponentArb(),
      order: fc.constantFrom(
        ...(["XYZ", "YZX", "ZXY", "XZY", "YXZ", "ZYX"] as THREE.EulerOrder[]),
      ),
    })
    .map(({ x, y, z, order }) => new DebugEuler(x, y, z, order));
}
