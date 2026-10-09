import Decimal from 'decimal.js';
import fc from 'fast-check';
import * as THREE from 'three';

import { Timestamp } from '../../utils';
import { assignToStringMethod, makeDigitsArbitrary } from '../arbitaries';

class _DebugTimestamp extends Timestamp {

    get date() { return this.getDate(); }

    get time() { return this.getTime(); }

}

const DebugTimestamp = assignToStringMethod(_DebugTimestamp, ['date', 'time']);

/**
 * Creates an arbitrary that returns a random Unix timestamp
 * that can be parsed into a {@link Timestamp}.
 * 
 * @param {boolean} valid If `true`, only generates valid values;
 * otherwise, only generates invalid values.
 * @returns {fc.Arbitrary<number | Decimal>} The new arbitrary.
 */
export function makeUnixTimeArbitrary(valid = true) {
    let numberArb;

    if (valid) {
        numberArb = fc.oneof(
            fc.integer({ min: Timestamp.MIN_UNIX_TIME, max: Timestamp.MAX_UNIX_TIME }),
            fc.double({ min: Timestamp.MIN_UNIX_TIME, max: Timestamp.MAX_UNIX_TIME, noNaN: true }),
        );
    } else {
        numberArb = fc.oneof(
            fc.integer({ min: Number.MIN_SAFE_INTEGER, max: Timestamp.MIN_UNIX_TIME - 1 }),
            fc.integer({ min: Timestamp.MAX_UNIX_TIME + 1, max: Number.MAX_SAFE_INTEGER }),
            fc.constant(NaN),
            fc.double({ max: Timestamp.MIN_UNIX_TIME }).filter((x) => x < Timestamp.MIN_UNIX_TIME),
            fc.double({ min: Timestamp.MAX_UNIX_TIME }).filter((x) => x > Timestamp.MAX_UNIX_TIME),
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
 * @returns {fc.Arbitrary<string>} The new arbitrary.
 */
export function makeTimestampStrArbitrary() {
    return fc.tuple(fc.date(), makeDigitsArbitrary({ maxLength: Timestamp.DECIMAL_PRECISION - 32 }))
        .map(([date, digits]) => {
            const utcString = date.toISOString();
            if (!utcString.endsWith('Z')) {
                throw new Error('Timezone offset is not UTC');
            }

            const dateStr = utcString.slice(0, -1);
            return `${dateStr}${digits}Z`;
        });
}

/**
 * Creates an arbitrary that returns a random {@link Timestamp}.
 * 
 * @returns {fc.Arbitrary<Timestamp>} The new arbitrary.
 */
export function makeTimestampArbitrary() {
    return fc.oneof(
        makeUnixTimeArbitrary(),
        makeTimestampStrArbitrary(),
        fc.date(),
    ).map((value) => new DebugTimestamp(value));
}

const COLOR_NAMES = Object.keys(THREE.Color.NAMES);
const DebugColor = assignToStringMethod(THREE.Color, ['r', 'g', 'b']);

/**
 * Creates an arbitrary that returns a random {@link THREE.Color}.
 * 
 * @returns {fc.Arbitrary<THREE.Color>} The new arbitrary.
 */
export function makeColorArbitrary() {
    return fc.constantFrom(...COLOR_NAMES).map((name) => new DebugColor(name));
}

const DebugVector3 = assignToStringMethod(THREE.Vector3, ['x', 'y', 'z']);

/**
 * Creates an arbitrary that returns a {@link THREE.Vector3}.
 * 
 * @param {() => fc.Arbitrary<number>} makeComponentArb A factory function used to create an
 * arbitrary for each vector component.
 * @returns {fc.Arbitrary<THREE.Vector3>} The new arbitrary.
 */
export function makeVector3Arbitrary(makeComponentArb = fc.double) {
    return fc.record({
        x: makeComponentArb(),
        y: makeComponentArb(),
        z: makeComponentArb(),
    }).map(({ x, y, z }) => new DebugVector3(x, y, z));
}

const DebugEuler = assignToStringMethod(THREE.Euler, ['x', 'y', 'z', 'order']);

/**
 * Creates an arbitrary that returns a {@link THREE.Euler}.
 * 
 * @param {() => fc.Arbitrary<number>} makeComponentArb A factory function used to create an
 * arbitrary for each vector component.
 * @returns {fc.Arbitrary<THREE.Euler>} The new arbitrary.
 */
export function makeEulerArbitrary(makeComponentArb = fc.double) {
    return fc.record({
        x: makeComponentArb(),
        y: makeComponentArb(),
        z: makeComponentArb(),
        /** @type {fc.Arbitrary<THREE.EulerOrder>} */
        order: fc.constantFrom('XYZ', 'YZX', 'ZXY', 'XZY', 'YXZ', 'ZYX'),
    }).map(({ x, y, z, order }) => new DebugEuler(x, y, z, order));
}
