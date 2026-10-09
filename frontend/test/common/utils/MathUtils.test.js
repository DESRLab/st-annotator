import { expect } from 'chai';
import fc from 'fast-check';
import _ from 'lodash';
import { std } from 'mathjs';
import { describe, it } from 'vitest';

import { MathUtils, ThreeUtils } from '../../../lib/common/lib/utils';
import { angleApprox, checkValue } from '../../../lib/common/lib/testing';

describe('MathUtils.sign1()', () => {
    it('should throw error when the input is null', () => {
        // @ts-ignore
        expect(() => MathUtils.sign1(null)).to.throw('The input is not numeric');
    });
    it('should throw error when the input is undefined', () => {
        // @ts-ignore
        expect(() => MathUtils.sign1(undefined)).to.throw('The input is not numeric');
    });
    it('should return NaN if input is NaN', () => {
        expect(MathUtils.sign1(NaN)).to.be.NaN;
    });
    it('should return -1 if input <= -0', () => {
        fc.assert(
            // @ts-expect-error
            fc.property(
                // @ts-expect-error
                fc.double({ max: -0, noNaN: true }), fc.context(),
                (value, ctx) => checkValue(MathUtils.sign1(value), -1, ctx),
            ),
            { examples: [[Number.NEGATIVE_INFINITY], [-0]] },   // Always check boundary cases
        );
    });
    it('should return 1 if input >= +0', () => {
        fc.assert(
            // @ts-expect-error
            fc.property(
                // @ts-expect-error
                fc.double({ min: +0, noNaN: true }), fc.context(),
                (value, ctx) => checkValue(MathUtils.sign1(value), 1, ctx),
            ),
            { examples: [[+0], [Number.POSITIVE_INFINITY]] },   // Always check boundary cases
        );
    });
});

const MAX_ABS = 1 / ThreeUtils.EPSILON;

describe('MathUtils.normalizeAngle()', () => {
    it('should throw error when the input is null', () => {
        // @ts-ignore
        expect(() => MathUtils.normalizeAngle(null)).to.throw('The input is not numeric');
    });
    it('should throw error when the input is undefined', () => {
        // @ts-ignore
        expect(() => MathUtils.normalizeAngle(undefined)).to.throw('The input is not numeric');
    });
    it('should return NaN if input is NaN', () => {
        expect(MathUtils.normalizeAngle(NaN)).to.be.NaN;
    });
    it('should return value in (-pi, pi]', () => {
        // @ts-expect-error
        fc.assert(
            fc.property(
                // @ts-expect-error
                fc.double({ min: -MAX_ABS, max: MAX_ABS, noNaN: true }), fc.context(),
                (angle, ctx) => {
                    const result = MathUtils.normalizeAngle(angle);
                    ctx?.log(`result=${result}`);

                    return -Math.PI < result && result <= Math.PI;
                },
            ),
            { examples: _.range(-4, 5).map((n) => [n * Math.PI]) },
        );
    });
    it('should return baseAngle if angle = baseAngle + 2n * pi', () => {
        fc.assert(
            fc.property(
                fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }).filter((v) => v > -Math.PI),
                // @ts-expect-error
                fc.integer({ min: -MAX_ABS, max: MAX_ABS }),
                fc.context(),
                (baseAngle, n, ctx) => checkValue(
                    MathUtils.normalizeAngle(baseAngle + 2 * n * Math.PI),
                    baseAngle,
                    ctx,
                    angleApprox,
                ),
            ),
        );
    });
});

/**
 * @type {() => fc.Arbitrary<ReadonlyArray<number>>}
 */
const makeArrArbitrary = () => fc.record({
    regularValues: fc.array(fc.double(), { minLength: 1 }),
    specialValues: fc.array(
        fc.constantFrom(NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY),
        { maxLength: 3 },
    ),
}).map(({ regularValues, specialValues }) => [...regularValues, ...specialValues]);

describe('MathUtils.getStd()', () => {
    it('should throw error when empty array is passed', () => {
        expect(() => MathUtils.getStd([])).to.throw('Cannot compute standard deviation of empty array');
    });
    it('should throw error when the input array consist of null elements', () => {
        // @ts-ignore
        expect(() => MathUtils.getStd([0, null, 2])).to.throw('The input is not numeric');
    });
    it('should throw error when the input array consist of undefined elements', () => {
        // @ts-ignore
        expect(() => MathUtils.getStd([0, undefined, 2])).to.throw('The input is not numeric');
    });
    it('should be consistent with mathjs.std() when precomputedMean is not specified', () => {
        fc.assert(
            fc.property(
                // @ts-expect-error
                makeArrArbitrary(), fc.context(),
                (arr, ctx) => {
                    const result = MathUtils.getStd(arr);
                    const expectedResult = std([...arr], 'uncorrected');

                    return checkValue(result, expectedResult, ctx);
                },
            ),
        );
    });
    it('should be consistent with mathjs.std() when precomputedMean is specified correctly', () => {
        fc.assert(
            fc.property(
                // @ts-expect-error
                makeArrArbitrary(), fc.context(),
                (arr, ctx) => {
                    const result = MathUtils.getStd(arr, _.mean(arr));
                    const expectedResult = std([...arr], 'uncorrected');

                    return checkValue(result, expectedResult, ctx);
                },
            ),
        );
    });
    it('should return modified result when precomputedMean is specified incorrectly', () => {
        fc.assert(
            fc.property(
                // @ts-expect-error
                makeArrArbitrary(), fc.double(), fc.context(),
                (arr, m, ctx) => {
                    const result = MathUtils.getStd(arr, m);
                    const expectedResult = Math.sqrt(_.mean(arr.map((v) => (v - m) * (v - m))));

                    return checkValue(result, expectedResult, ctx);
                },
            ),
        );
    });
});
