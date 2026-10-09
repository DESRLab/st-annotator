import { expect } from 'chai';
import fc from 'fast-check';
import _ from 'lodash';
import { describe, it } from 'vitest';

/**
 * Creates a subclass that includes {@link fc.toStringMethod},
 * such that its instances become easier to inspect in case the test fails.
 * 
 * @template {object} T
 * @template {import('../utils').TypeUtils.ConstructorOf<T>} C
 * @param {C} cls The original class.
 * @param {_.Many<keyof T>[]} props The properties to include in the string representation.
 * @returns {C} The newly created subclass. The original class remains unchanged.
 */
export function assignToStringMethod(cls, ...props) {
    if (fc.toStringMethod in cls.prototype) {
        throw new Error('The object already has a fc.toStringMethod assigned');
    }

    // @ts-expect-error
    return class clsWithToStringMethod extends cls {
        [fc.toStringMethod]() {
            return cls.name + JSON.stringify(_.pick(this, ...props));
        }
    };
}

/**
 * Creates an arbitrary that returns a random string of decimal digits.
 * 
 * @param {fc.ArrayConstraints} constraints Constraints that are applied to the
 * array of generated digits.
 * @returns {fc.Arbitrary<string>} The new arbitrary.
 */
export function makeDigitsArbitrary(constraints = {}) {
    return fc.array(fc.constantFrom(...'0123456789'), constraints)
        .map((arr) => arr.join(''));
}

/**
 * @template A
 * @template B
 * @typedef {object} RoundtripTestsParams
 * @property {fc.Arbitrary<A>} a Generates instances of the first type to test.
 * @property {fc.Arbitrary<B>} b Generates instances of the second type to test.
 * @property {(a: A) => B} a2b Maps instances from the first type to the second type.
 * @property {(b: B) => A} b2a Maps instances from the second type to the first type.
 * @property {(actual: A, expected: A) => boolean} [equalsA] A function that accepts each
 * object of the first type and returns `true` if they pass the test, otherwise `false`.
 * Defaults to [_.isEqual]{@link https://lodash.com/docs#isEqual}.
 * @property {(actual: B, expected: B) => boolean} [equalsB] A function that accepts each
 * object of the second type and returns `true` if they pass the test, otherwise `false`.
 * Defaults to [_.isEqual]{@link https://lodash.com/docs#isEqual}.
 * @property {Pick<fc.Parameters, 'seed' | 'path' | 'endOnFailure'>} [repro] 
 * Test parameters that are used to reproduce failures.
 */

/**
 * Validates that a pair of functions that are inverses of each other by testing
 * whether the value is preserved after a roundtrip.
 * 
 * @template A
 * @template B
 * @param {RoundtripTestsParams<A, B>} params The parameters of the test.
 * @returns {ReturnType<describe>} The new test suite.
 */
export function makeRoundtripTests(params) {
    const {
        a: arbA,
        b: arbB,
        a2b,
        b2a,
        equalsA = _.isEqual,
        equalsB = _.isEqual,
        repro: reproOpts = {},
    } = params;

    return describe(`inverse functions (a2b: ${a2b.name}, b2a: ${b2a.name})`, () => {
        it('identity round trip (a -> b -> a)', () => {
            fc.assert(
                fc.property(
                    // @ts-expect-error
                    arbA, fc.context(),
                    (a, ctx) => {
                        const b = a2b(a);
                        ctx.log(`b=${fc.stringify(b)}`);

                        const newA = b2a(b);
                        ctx.log(`newA=${fc.stringify(newA)}`);

                        expect(equalsA(newA, a)).to.be.true;
                    },
                ),
                reproOpts,
            );
        });
        it('identity round trip (b -> a -> b)', () => {
            fc.assert(
                fc.property(
                    // @ts-expect-error
                    arbB, fc.context(),
                    (b, ctx) => {
                        const a = b2a(b);
                        ctx.log(`a=${fc.stringify(a)}`);

                        const newB = a2b(a);
                        ctx.log(`newB=${fc.stringify(newB)}`);

                        expect(equalsB(newB, b)).to.be.true;
                    },
                ),
                reproOpts,
            );
        });
    });
}
