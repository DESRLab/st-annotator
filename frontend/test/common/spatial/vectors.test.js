import { expect } from 'chai';
import fc from 'fast-check';
import { describe, it } from 'vitest';
import * as THREE from 'three';

import {
    OptionalVector3,
    OptionalDecimalVector3Data, DecimalVector3Data,
    OptionalVector3Data, Vector3Data,
} from '../../../lib/common/lib/spatial';
import {
    EXACT_MATCH,
    makeEquatableTests, makeRoundtripTests,
    makeOptionalVector3Arbitrary, makeVector3Arbitrary,
    optionalTensorApprox,
    tensorApprox,
    makeOptionalDecimalVector3DataArbitrary,
    makeDecimalVector3DataArbitrary,
    makeOptionalVector3DataArbitrary,
    makeVector3DataArbitrary,
    optionalTensorDataApprox,
    tensorDataApprox,
} from '../../../lib/common/lib/testing';

/**
 * @type {() => fc.Arbitrary<(x: number, y: number, z: number) => THREE.Vector3 | OptionalVector3>}
 */
const makeBuildVectorArbitrary = () => fc.constantFrom(
    (x, y, z) => new THREE.Vector3(x, y, z),
    (x, y, z) => new OptionalVector3(x, y, z),
);

describe('OptionalVector3', () => {
    describe('#equals()', () => {
        it('should equal THREE.Vector3 with the same components', () => {
            fc.assert(
                fc.property(
                    makeVector3Arbitrary(() => fc.double({ noNaN: true })),
                    // @ts-expect-error
                    (v1) => {
                        const v2 = new OptionalVector3(v1.x, v1.y, v1.z);

                        expect(v2.equals(v1)).to.be.true;
                    },
                ),
            );
        });
    });
    describe('#add()', () => {
        it('should be consistent with #addScalar()', () => {
            fc.assert(
                fc.property(
                    // @ts-expect-error
                    makeOptionalVector3Arbitrary(), fc.double({ noNaN: true }),
                    makeBuildVectorArbitrary(),
                    (v, c, newVector) => {
                        const vectorResult = v.add(newVector(c, c, c));
                        const scalarResult = v.addScalar(c);

                        expect(optionalTensorApprox(
                            vectorResult, scalarResult, { nanOk: true })).to.be.true;
                    },
                ),
            );
        });
    });
    describe('#sub()', () => {
        it('should be consistent with #subScalar()', () => {
            fc.assert(
                fc.property(
                    // @ts-expect-error
                    makeOptionalVector3Arbitrary(), fc.double(),
                    makeBuildVectorArbitrary(),
                    (v, c, newVector) => {
                        const vectorResult = v.sub(newVector(c, c, c));
                        const scalarResult = v.subScalar(c);

                        expect(optionalTensorApprox(
                            vectorResult, scalarResult, { nanOk: true })).to.be.true;
                    },
                ),
            );
        });
    });
    describe('#multiply()', () => {
        it('should be consistent with #multiplyScalar()', () => {
            fc.assert(
                fc.property(
                    // @ts-expect-error
                    makeOptionalVector3Arbitrary(), fc.double(),
                    makeBuildVectorArbitrary(),
                    (v, c, newVector) => {
                        const vectorResult = v.multiply(newVector(c, c, c));
                        const scalarResult = v.multiplyScalar(c);

                        expect(optionalTensorApprox(
                            vectorResult, scalarResult, { nanOk: true })).to.be.true;
                    },
                ),
            );
        });
    });
    describe('#divide()', () => {
        it('should be consistent with #divideScalar()', () => {
            fc.assert(
                fc.property(
                    // @ts-expect-error
                    makeOptionalVector3Arbitrary(), fc.double(),
                    makeBuildVectorArbitrary(),
                    (v, c, newVector) => {
                        const vectorResult = v.divide(newVector(c, c, c));
                        const scalarResult = v.divideScalar(c);

                        expect(optionalTensorApprox(
                            vectorResult, scalarResult, { nanOk: true })).to.be.true;
                    },
                ),
            );
        });
    });

    makeEquatableTests(makeOptionalVector3Arbitrary(() => fc.double({ noNaN: true })));
});

describe('OptionalDecimalVector3Data', () => {
    makeRoundtripTests({
        a: makeOptionalDecimalVector3DataArbitrary(),
        b: makeOptionalVector3Arbitrary(),
        a2b: (a) => a.toOptionalVector3(),
        b2a: OptionalDecimalVector3Data.fromOptionalVector3,
        equalsA: (a, b) => optionalTensorDataApprox(a, b, EXACT_MATCH),
        equalsB: (a, b) => optionalTensorApprox(a, b, EXACT_MATCH),
    });
});

describe('DecimalVector3Data', () => {
    makeRoundtripTests({
        a: makeDecimalVector3DataArbitrary(),
        b: makeVector3Arbitrary(),
        a2b: (a) => a.toVector3(),
        b2a: DecimalVector3Data.fromVector3,
        equalsA: (a, b) => tensorDataApprox(a, b, EXACT_MATCH),
        equalsB: (a, b) => tensorApprox(a, b, EXACT_MATCH),
    });
});

describe('OptionalVector3Data', () => {
    makeRoundtripTests({
        a: makeOptionalVector3DataArbitrary(),
        b: makeOptionalVector3Arbitrary(),
        a2b: (a) => a.toOptionalVector3(),
        b2a: OptionalVector3Data.fromOptionalVector3,
        equalsA: (a, b) => optionalTensorDataApprox(a, b, EXACT_MATCH),
        equalsB: (a, b) => optionalTensorApprox(a, b, EXACT_MATCH),
    });
});

describe('Vector3Data', () => {
    makeRoundtripTests({
        a: makeVector3DataArbitrary(),
        b: makeVector3Arbitrary(),
        a2b: (a) => a.toVector3(),
        b2a: Vector3Data.fromVector3,
        equalsA: (a, b) => tensorDataApprox(a, b, EXACT_MATCH),
        equalsB: (a, b) => tensorApprox(a, b, EXACT_MATCH),
    });
});
