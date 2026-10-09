import { expect } from 'chai';
import fc from 'fast-check';
import _ from 'lodash';
import { describe, it } from 'vitest';
import * as THREE from 'three';

import { ThreeUtils } from '../../../lib/common/lib/utils';
import {
    checkArray,
    checkValue,
    floatApprox,
    makeColorArbitrary,
    makeVector3Arbitrary,
    tensorApprox,
} from '../../../lib/common/lib/testing';

/**
 * @type {() => fc.Arbitrary<ReadonlyArray<ReadonlyArray<number>>>}
 */
const makeMatArraysArbitrary = () => fc.array(
    fc.array(
        fc.option(fc.double(), { nil: NaN, freq: 9 }),
        { minLength: 9, maxLength: 9 },
    ),
    { minLength: 1 },
);

/**
 * @type {(arrays: ReadonlyArray<ReadonlyArray<number>>) => ReadonlyArray<THREE.Matrix3>}
 */
const matrix3sFromArrays = (arrays) => arrays.map((arr) => new THREE.Matrix3().fromArray(arr));

describe('ThreeUtils.sumMatrix3()', () => {
    it('should throw error when matrix contains null elements', () => {
        fc.assert(
            fc.property(
                makeMatArraysArbitrary(),
                // @ts-expect-error
                (arrays) => {
                    const [mat, ...mats] = matrix3sFromArrays(arrays);
                    // @ts-ignore
                    (mats[0] ?? mat).elements[1] = null;

                    expect(() => ThreeUtils.sumMatrix3(mat, ...mats)).to.throw('The input is not numeric');
                },
            ),
        );
    });
    it('should throw error when matrix contains undefined elements', () => {
        fc.assert(
            fc.property(
                makeMatArraysArbitrary(),
                // @ts-expect-error
                (arrays) => {
                    const [mat, ...mats] = matrix3sFromArrays(arrays);
                    // @ts-ignore
                    (mats[0] ?? mat).elements[1] = undefined;

                    expect(() => ThreeUtils.sumMatrix3(mat, ...mats)).to.throw('The input is not numeric');
                },
            ),
        );
    });
    it('should return same result as _.unzip()', () => {
        fc.assert(
            fc.property(
                // @ts-expect-error
                makeMatArraysArbitrary(), fc.context(),
                (arrays, ctx) => {
                    const [mat, ...mats] = matrix3sFromArrays(arrays);
                    const result = ThreeUtils.sumMatrix3(mat, ...mats);

                    // _.unzipWith(arrays, _.add) incorrectly produces 0 if the final value is NaN
                    const [expectedResult] = matrix3sFromArrays([
                        _.unzip(arrays).map((arr) => _.sum(arr)),
                    ]);

                    return checkValue(
                        result,
                        expectedResult,
                        ctx,
                        tensorApprox,
                    );
                },
            ),
        );
    });
});

describe('ThreeUtils.setFromNormals()', () => {
    it('should create new buffer with same values as input normals', () => {
        fc.assert(
            fc.property(
                // @ts-expect-error
                fc.array(makeVector3Arbitrary()), fc.context(),
                (vecs, ctx) => {
                    const geometry = ThreeUtils.setFromNormals(new THREE.BufferGeometry(), vecs);
                    const buffer = geometry.getAttribute('normal');

                    expect(buffer.count).to.equal(vecs.length, 'incorrect buffer size');
                    expect(buffer.itemSize).to.equal(3, 'incorrect item size');

                    expect(checkArray(
                        vecs.flatMap((v, i) => [buffer.getX(i), buffer.getY(i), buffer.getZ(i)]),
                        vecs.flatMap((v) => v.toArray()),
                        ctx,
                        floatApprox,
                    ), 'incorrect buffer values');

                    ThreeUtils.setFromNormals(geometry, vecs);
                    const newBuffer = geometry.getAttribute('normal');

                    expect(newBuffer).to.not.equal(buffer, 'failed to create new buffer');
                },
            ),
        );
    });
});

describe('ThreeUtils.setFromColors()', () => {
    it('should create new buffer with same values as input colors', () => {
        fc.assert(
            fc.property(
                // @ts-expect-error
                fc.array(makeColorArbitrary()), fc.context(),
                (colors, ctx) => {
                    const geometry = ThreeUtils.setFromColors(new THREE.BufferGeometry(), colors);
                    const buffer = geometry.getAttribute('color');

                    expect(buffer.count).to.equal(colors.length, 'incorrect buffer size');
                    expect(buffer.itemSize).to.equal(3, 'incorrect item size');

                    expect(checkArray(
                        colors.flatMap((c, i) => [buffer.getX(i), buffer.getY(i), buffer.getZ(i)]),
                        colors.flatMap((c) => c.toArray()),
                        ctx,
                        floatApprox,
                    ), 'incorrect buffer values');

                    ThreeUtils.setFromColors(geometry, colors);
                    const newBuffer = geometry.getAttribute('color');

                    expect(newBuffer).to.not.equal(buffer, 'failed to create new buffer');
                },
            ),
        );
    });
});

describe('ThreeUtils.checkSize()', () => {
    it('should return 0 if size is NaN', () => {
        expect(ThreeUtils.checkSize(NaN)).to.equal(0);
    });
    it('should return -size if size < 0', () => {
        fc.assert(
            fc.property(
                // @ts-expect-error
                fc.double({ max: 0, noNaN: true }).filter((v) => v < 0), fc.context(),
                (size, ctx) => checkValue(ThreeUtils.checkSize(size), -size, ctx),
            ),
        );
    });
    it('should return size >= 0', () => {
        fc.assert(
            fc.property(
                // @ts-expect-error
                fc.double({ min: 0, noNaN: true }), fc.context(),
                (size, ctx) => checkValue(ThreeUtils.checkSize(size), size, ctx),
            ),
        );
    });
});

describe('ThreeUtils.checkOpacity()', () => {
    it('should return 0 if opacity is NaN', () => {
        expect(ThreeUtils.checkOpacity(NaN)).to.equal(0);
    });
    it('should return 0 if opacity < 0', () => {
        // @ts-expect-error
        fc.assert(
            fc.property(
                // @ts-expect-error
                fc.double({ max: 0, noNaN: true }).filter((v) => v < 0), fc.context(),
                (opacity, ctx) => checkValue(ThreeUtils.checkOpacity(opacity), 0, ctx),
            ),
            { examples: [[NaN]] },
        );
    });
    it('should return opacity if 0 <= opacity <= 1', () => {
        fc.assert(
            fc.property(
                // @ts-expect-error
                fc.double({ min: 0, max: 1, noNaN: true }), fc.context(),
                (opacity, ctx) => checkValue(ThreeUtils.checkOpacity(opacity), opacity, ctx),
            ),
        );
    });
    it('should return 1 if opacity > 1', () => {
        fc.assert(
            fc.property(
                // @ts-expect-error
                fc.double({ min: 1, noNaN: true }).filter((v) => v > 1), fc.context(),
                (opacity, ctx) => checkValue(ThreeUtils.checkOpacity(opacity), 1, ctx),
            ),
        );
    });
});
