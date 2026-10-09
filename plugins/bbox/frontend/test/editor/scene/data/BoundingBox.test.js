import { expect } from 'chai';
import fc from 'fast-check';
import { describe, it } from 'vitest';
import * as THREE from 'three';

import {
    checkValue,
    floatApprox,
    makeColorArbitrary,
    makeEulerArbitrary,
    makeVector3Arbitrary,
    tensorApprox,
} from 'sta/common/testing';
import { ThreeUtils } from 'sta/common/utils';

import { BoundingBoxBuilder } from '../../../../lib/editor/lib/scene/data/views';

export class MyBoundingBoxBuilder extends BoundingBoxBuilder {

    /**
     * @type {(
     *     color: THREE.Color,
     *     opacity: number
     * ) => THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>}
     */
    makeFaces(color, opacity) {
        const faces = new THREE.BufferGeometry().setFromPoints([]);
        const material = new THREE.MeshBasicMaterial({ color, opacity });
        return new THREE.Mesh(faces, material);
    }

    /**
     * @type {(
     *     color: THREE.Color,
     *     opacity: number
     * ) => THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>}
     */
    makeForwardIndicatorFaces(color, opacity) {
        const faces = new THREE.BufferGeometry().setFromPoints([]);
        const material = new THREE.MeshBasicMaterial({ color, opacity });
        return new THREE.Mesh(faces, material);
    }

}

const MIN_ABS = Math.sqrt(ThreeUtils.EPSILON);
const MAX_ABS = 1 / MIN_ABS;

const makeOtherComponentArbitrary = () => fc.double({ min: -MAX_ABS, max: MAX_ABS, noNaN: true });

const makeSizeComponentArbitrary = () => fc.double({ min: 0, max: MAX_ABS, noNaN: true });

export const makeBoundingBoxParamsArbitrary = () => fc.record({
    position: makeVector3Arbitrary(makeOtherComponentArbitrary),
    rotation: makeEulerArbitrary(makeOtherComponentArbitrary),
    scale: makeVector3Arbitrary(makeSizeComponentArbitrary),
    color: makeColorArbitrary(),
    opacity: fc.double({ min: 0, max: 1, noNaN: true }),
    showForwardIndicator: fc.boolean(),
    showFrame: fc.boolean(),
});

/**
 * Creates a test suite for {@link BoundingBoxBuilder#createBox}.
 * 
 * @param {BoundingBoxBuilder} builder The builder to use for the test.
 * @returns {ReturnType<describe>} The new test suite.
 */
export function makeConstructorTest(builder) {
    return describe('#constructor()', () => {
        it('should set properties according to passed arguments', () => {
            fc.assert(
                fc.property(
                    // @ts-expect-error
                    makeBoundingBoxParamsArbitrary(), fc.context(),
                    (params, ctx) => {
                        const box = builder.createBox(params);

                        expect(checkValue(
                            box.position,
                            params.position,
                            ctx,
                            (a, b) => tensorApprox(a, b),
                        ), 'Incorrect value of position').to.be.true;

                        expect(checkValue(
                            box.rotation,
                            params.rotation,
                            ctx,
                            (a, b) => tensorApprox(a, b),
                        ), 'Incorrect value of rotation').to.be.true;

                        expect(checkValue(
                            box.scale,
                            params.scale,
                            ctx,
                            (a, b) => tensorApprox(a, b),
                        ), 'Incorrect value of scale').to.be.true;

                        expect(checkValue(
                            box.color.getHex(),
                            params.color.getHex(),
                            ctx,
                        ), 'Incorrect value of color').to.be.true;

                        expect(checkValue(
                            box.opacity,
                            params.opacity,
                            ctx,
                            floatApprox,
                        ), 'Incorrect value of opacity').to.be.true;

                        expect(checkValue(
                            box.showFrame,
                            params.showFrame,
                            ctx,
                        ), 'Incorrect value of showFrame').to.be.true;

                        expect(checkValue(
                            box.showForwardIndicator,
                            params.showForwardIndicator,
                            ctx,
                        ), 'Incorrect value of showForwardIndicator').to.be.true;
                    },
                ),
            );
        });
    });
}

/**
 * Creates a test suite for {@link BoundingBoxBuilder#makeCenter}.
 * 
 * @param {BoundingBoxBuilder} builder The builder to test.
 * @returns {ReturnType<describe>} The new test suite.
 */
export function makeCenterTest(builder) {
    return describe('#makeCenter()', () => {
        it('should return a material with the given color', () => {
            fc.assert(
                fc.property(
                    // @ts-expect-error
                    makeBoundingBoxParamsArbitrary(), makeColorArbitrary(), fc.context(),
                    (params, color, ctx) => {
                        const material = builder.makeCenter(color).material;

                        return checkValue(
                            material.color.getHex(),
                            color.getHex(),
                            ctx,
                        );
                    },
                ),
            );
        });
    });
}

/**
 * Creates a test suite for {@link BoundingBoxBuilder#makeFaces}.
 * 
 * @param {BoundingBoxBuilder} builder The builder to test.
 * @returns {ReturnType<describe>} The new test suite.
 */
export function makeFacesTest(builder) {
    return describe('#makeFaces()', () => {
        it('should return a material with the given color', () => {
            fc.assert(
                fc.property(
                    makeBoundingBoxParamsArbitrary(),
                    // @ts-expect-error
                    makeColorArbitrary(), fc.double(),
                    fc.context(),
                    (params, color, opacity, ctx) => {
                        const material = builder.makeFaces(color, opacity).material;

                        return checkValue(
                            material.color.getHex(),
                            color.getHex(),
                            ctx,
                        );
                    },
                ),
            );
        });
        it('should return a material with the given opacity', () => {
            fc.assert(
                fc.property(
                    makeBoundingBoxParamsArbitrary(),
                    // @ts-expect-error
                    makeColorArbitrary(), fc.double(),
                    fc.context(),
                    (params, color, opacity, ctx) => {
                        const material = builder.makeFaces(color, opacity).material;

                        return checkValue(
                            material.opacity,
                            opacity,
                            ctx,
                        );
                    },
                ),
            );
        });
    });
}

/**
 * Creates a test suite for {@link BoundingBoxBuilder#makeForwardIndicatorFaces}.
 * 
 * @param {BoundingBoxBuilder} builder The builder to test.
 * @returns {ReturnType<describe>} The new test suite.
 */
export function makeForwardIndicatorFacesTest(builder) {
    return describe('#makeFaces()', () => {
        it('should return a material with the given color', () => {
            fc.assert(
                fc.property(
                    makeBoundingBoxParamsArbitrary(),
                    // @ts-expect-error
                    makeColorArbitrary(), fc.double(),
                    fc.context(),
                    (params, color, opacity, ctx) => {
                        const material = builder.makeForwardIndicatorFaces(color, opacity).material;

                        return checkValue(
                            material.color.getHex(),
                            color.getHex(),
                            ctx,
                        );
                    },
                ),
            );
        });
        it('should return a material with the given opacity', () => {
            fc.assert(
                fc.property(
                    makeBoundingBoxParamsArbitrary(),
                    // @ts-expect-error
                    makeColorArbitrary(), fc.double(),
                    fc.context(),
                    (params, color, opacity, ctx) => {
                        const material = builder.makeForwardIndicatorFaces(color, opacity).material;

                        return checkValue(
                            material.opacity,
                            opacity,
                            ctx,
                        );
                    },
                ),
            );
        });
    });
}

describe('BoundingBox', () => {
    const testBuilder = new MyBoundingBoxBuilder();

    makeConstructorTest(testBuilder);
    describe('#position', () => {
        it('should have consistent getter and setter', () => {
            fc.assert(
                fc.property(
                    makeBoundingBoxParamsArbitrary(),
                    // @ts-expect-error
                    makeVector3Arbitrary(makeOtherComponentArbitrary),
                    fc.context(),
                    (params, position, ctx) => {
                        const box = testBuilder.createBox(params);

                        box.position = position;

                        return checkValue(
                            box.position,
                            position,
                            ctx,
                            (a, b) => tensorApprox(a, b),
                        );
                    },
                ),
            );
        });
    });
    describe('#rotation', () => {
        it('should have consistent getter and setter', () => {
            fc.assert(
                fc.property(
                    makeBoundingBoxParamsArbitrary(),
                    // @ts-expect-error
                    makeEulerArbitrary(makeOtherComponentArbitrary),
                    fc.context(),
                    (params, rotation, ctx) => {
                        const box = testBuilder.createBox(params);

                        box.rotation = rotation;

                        return checkValue(
                            box.rotation,
                            rotation,
                            ctx,
                            (a, b) => tensorApprox(a, b),
                        );
                    },
                ),
            );
        });
    });
    describe('#scale', () => {
        it('should have consistent getter and setter', () => {
            fc.assert(
                fc.property(
                    makeBoundingBoxParamsArbitrary(),
                    // @ts-expect-error
                    makeVector3Arbitrary(makeSizeComponentArbitrary),
                    fc.context(),
                    (params, scale, ctx) => {
                        const box = testBuilder.createBox(params);

                        box.scale = scale;

                        return checkValue(
                            box.scale,
                            scale,
                            ctx,
                            (a, b) => tensorApprox(a, b),
                        );
                    },
                ),
            );
        });
    });
    describe('#color', () => {
        it('should have consistent getter and setter', () => {
            fc.assert(
                fc.property(
                    makeBoundingBoxParamsArbitrary(),
                    // @ts-expect-error
                    makeColorArbitrary(),
                    fc.context(),
                    (params, color, ctx) => {
                        const box = testBuilder.createBox(params);

                        box.color = color;

                        return checkValue(
                            box.color.getHex(),
                            color.getHex(),
                            ctx,
                        );
                    },
                ),
            );
        });
    });
    describe('#asObject3D()', () => {
        it('should return an instance of Object3D', () => {
            fc.assert(
                fc.property(
                    // @ts-expect-error
                    makeBoundingBoxParamsArbitrary(), fc.context(),
                    (params, ctx) => {
                        const box = testBuilder.createBox(params);

                        expect(box.asObject3D()).to.be.an.instanceof(THREE.Object3D);
                    },
                ),
            );
        });
    });
    describe('#raycast()', () => {
        const box = testBuilder.createBox({
            position: new THREE.Vector3(),
            rotation: new THREE.Euler(),
            scale: new THREE.Vector3().setScalar(1),
            color: new THREE.Color(),
            opacity: 0,
        });
        const raycaster = new THREE.Raycaster();

        it('should raycast against faces when showFrame=true', () => {
            box.showFrame = true;

            // faces is an empty buffer so there should be no results
            const intersects = box.raycast(raycaster);
            expect(intersects.length).to.equal(0, 'incorrect number of intersections');
        });
        it('should raycast against center when showFrame=false', () => {
            box.showFrame = false;

            const intersects = box.raycast(raycaster);
            expect(intersects.length).to.equal(1, 'incorrect number of intersections');

            const [intersect] = intersects;
            expect(intersect.object).to.be.an.instanceof(THREE.Points, 'incorrect intersection object');

            expect(checkValue(
                intersect.point,
                new THREE.Vector3(),
                undefined,
                tensorApprox,
            ), 'incorrect intersection position').to.be.true;
        });
    });
});
