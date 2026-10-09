import fc from 'fast-check';

import {
    OptionalVector3,
    OptionalDecimalVector3Data, DecimalVector3Data,
    OptionalVector3Data, Vector3Data,
} from '../../spatial';
import { assignToStringMethod } from '../arbitaries';

const DebugOptionalVector3 = assignToStringMethod(OptionalVector3, ['x', 'y', 'z']);

/**
 * Creates an arbitrary that returns a {@link OptionalVector3}.
 * 
 * @param {() => fc.Arbitrary<number>} makeComponentArb A factory function used to create an
 * arbitrary for each specified vector component.
 * @returns {fc.Arbitrary<OptionalVector3>} The new arbitrary.
 */
export function makeOptionalVector3Arbitrary(makeComponentArb = fc.double) {
    return fc.record({
        x: fc.option(makeComponentArb()),
        y: fc.option(makeComponentArb()),
        z: fc.option(makeComponentArb()),
    }).map(({ x, y, z }) => new DebugOptionalVector3(x, y, z));
}

const makeNumStringArbitrary = () => fc.double().map((v) => v.toString());

/**
 * Creates an arbitrary that returns a {@link OptionalDecimalVector3Data}.
 * 
 * @param {() => fc.Arbitrary<string>} makeComponentArb A factory function used to create an
 * arbitrary for each specified vector component.
 * @returns {fc.Arbitrary<OptionalDecimalVector3Data>} The new arbitrary.
 */
export function makeOptionalDecimalVector3DataArbitrary(makeComponentArb = makeNumStringArbitrary) {
    return fc.record({
        x: fc.option(makeComponentArb()),
        y: fc.option(makeComponentArb()),
        z: fc.option(makeComponentArb()),
    }).map((v) => OptionalDecimalVector3Data.create(v));
}

/**
 * Creates an arbitrary that returns a {@link DecimalVector3Data}.
 * 
 * @param {() => fc.Arbitrary<string>} makeComponentArb A factory function used to create an
 * arbitrary for each specified vector component.
 * @returns {fc.Arbitrary<DecimalVector3Data>} The new arbitrary.
 */
export function makeDecimalVector3DataArbitrary(makeComponentArb = makeNumStringArbitrary) {
    return fc.record({
        x: makeComponentArb(),
        y: makeComponentArb(),
        z: makeComponentArb(),
    }).map((v) => DecimalVector3Data.create(v));
}

/**
 * Creates an arbitrary that returns a {@link OptionalVector3Data}.
 * 
 * @param {() => fc.Arbitrary<number>} makeComponentArb A factory function used to create an
 * arbitrary for each specified vector component.
 * @returns {fc.Arbitrary<OptionalVector3Data>} The new arbitrary.
 */
export function makeOptionalVector3DataArbitrary(makeComponentArb = fc.double) {
    return fc.record({
        x: fc.option(makeComponentArb()),
        y: fc.option(makeComponentArb()),
        z: fc.option(makeComponentArb()),
    }).map((v) => OptionalVector3Data.create(v));
}

/**
 * Creates an arbitrary that returns a {@link Vector3Data}.
 * 
 * @param {() => fc.Arbitrary<number>} makeComponentArb A factory function used to create an
 * arbitrary for each specified vector component.
 * @returns {fc.Arbitrary<Vector3Data>} The new arbitrary.
 */
export function makeVector3DataArbitrary(makeComponentArb = fc.double) {
    return fc.record({
        x: makeComponentArb(),
        y: makeComponentArb(),
        z: makeComponentArb(),
    }).map((v) => Vector3Data.create(v));
}
