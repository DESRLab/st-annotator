import { expect } from 'chai';
import fc from 'fast-check';
import _ from 'lodash';
import { describe, it } from 'vitest';

import { EquatableStub, HashableStub } from './stubs';

/**
 * @typedef {import('../../../utils').Equatable} Equatable
 */

/**
 * @typedef {import('../../../utils').Hashable} Hashable
 */

/**
 * Creates an arbitrary that generates `count` values, of which at most one may be replaced by
 * a stub.
 * 
 * @template T
 * @template U
 * @param {fc.Arbitrary<T>} stubArb Generates an instance of the stub.
 * @param {fc.Arbitrary<U>} cutArb Generates an instance of the class under test.
 * @param {number} count The number of values to generate in total.
 * @returns {fc.Arbitrary<(T | U)[]>} The resulting arbitrary.
 */
function makeMaybeStubsArbitrary(stubArb, cutArb, count) {
    if (!Number.isInteger(count) || count < 1) {
        throw new Error('Count must be a non-negative integer');
    }

    return fc.tuple(
        fc.oneof(stubArb, cutArb),
        fc.tuple(..._.range(count - 1).map(() => cutArb)),
        fc.integer({ min: 0, max: count - 1 }),
    ).map(([maybeStub, cuts, insertIdx]) => [
        ...cuts.slice(0, insertIdx),
        maybeStub,
        ...cuts.slice(insertIdx),
    ]);
}

/**
 * @template {Equatable} T
 * @typedef {object} EquatableTestsOptions
 * @property {Pick<fc.Parameters, 'seed' | 'path' | 'endOnFailure'>} [repro] 
 * Test parameters that are used to reproduce failures.
 */

/**
 * Validates the standard properties of equality checking:
 * - Reflexive property: `true -> a.equals(a)`
 * - Symmetric property: `a.equals(b) -> b.equals(a)`
 * - Transitive property: `a.equals(b) && b.equals(c) -> a.equals(c)`
 * 
 * Note that this should hold even for objects with different types.
 * 
 * @template {Equatable} T
 * @param {fc.Arbitrary<T>} arb Generates the equatable instances to test.
 * @param {EquatableTestsOptions<T>} opts Optional parameters of the test.
 * @returns {ReturnType<describe>} The new test suite.
 */
export function makeEquatableTests(arb, opts = {}) {
    const { repro: reproOpts = {} } = opts;

    return describe('Equatable#equals()', () => {
        it('reflexive property', () => {
            fc.assert(
                fc.property(
                    makeMaybeStubsArbitrary(fc.constant(new EquatableStub()), arb, 1),
                    // @ts-expect-error
                    fc.context(),
                    ([a], ctx) => {
                        expect(a.equals(a)).to.be.true;
                    },
                ),
                reproOpts,
            );
        });
        it('symmetric property', () => {
            fc.assert(
                fc.property(
                    makeMaybeStubsArbitrary(fc.constant(new EquatableStub()), arb, 2),
                    // @ts-expect-error
                    fc.context(),
                    ([a, b], ctx) => {
                        expect(a.equals(b)).to.equal(b.equals(a));
                    },
                ),
                reproOpts,
            );
        });
        it('transitive property', () => {
            fc.assert(
                fc.property(
                    makeMaybeStubsArbitrary(fc.constant(new EquatableStub()), arb, 3),
                    // @ts-expect-error
                    fc.context(),
                    ([a, b, c], ctx) => {
                        const aEqb = a.equals(b);
                        const bEqc = b.equals(c);
                        ctx.log(`a.equals(b)=${aEqb}`);
                        ctx.log(`b.equals(c)=${bEqc}`);

                        if (aEqb && bEqc) {
                            expect(a.equals(c)).to.be.true;
                        }
                    },
                ),
                reproOpts,
            );
        });
    });
}

/**
 * @template {Hashable} T
 * @typedef {object} HashableTestsOptions
 * @property {Pick<fc.Parameters, 'seed' | 'path' | 'endOnFailure'>} [repro] 
 * Test parameters that are used to reproduce failures.
 */

/**
 * Validates the standard properties of hash values:
 * - Consistency with equality: `a.equals(b) -> a.hash() === b.hash()`
 * 
 * Note that this should hold even for objects with different types.
 * 
 * @template {Hashable} T
 * @param {fc.Arbitrary<T>} arb Generates the hashable instances to test.
 * @param {HashableTestsOptions<T>} opts Optional parameters of the test.
 * @returns {ReturnType<describe>} The new test suite.
 */
export function makeHashableTests(arb, opts = {}) {
    const { repro: reproOpts = {} } = opts;

    return describe('Hashable#hash()', () => {
        it('consistency with equality (against self)', () => {
            fc.assert(
                fc.property(
                    makeMaybeStubsArbitrary(fc.constant(new HashableStub()), arb, 1),
                    // @ts-expect-error
                    fc.context(),
                    ([a], ctx) => {
                        expect(a.hash()).to.equal(a.hash());
                    },
                ),
                reproOpts,
            );
        });
        it('consistency with equality (against other)', () => {
            fc.assert(
                fc.property(
                    makeMaybeStubsArbitrary(fc.constant(new HashableStub()), arb, 2),
                    // @ts-expect-error
                    fc.context(),
                    ([a, b], ctx) => {
                        if (a.equals(b)) {
                            expect(a.hash()).to.equal(b.hash());
                        }
                    },
                ),
                reproOpts,
            );
        });
    });
}
