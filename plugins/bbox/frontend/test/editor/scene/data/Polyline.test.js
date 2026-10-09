import { expect } from 'chai';
import fc from 'fast-check';
import { describe, it } from 'vitest';
import _ from 'lodash';
import * as THREE from 'three';

import {
    checkValue,
    tensorApprox,
    makeVector3Arbitrary,
    makeColorArbitrary,
} from 'sta/common/testing';

import { Polyline } from '../../../../lib/editor/lib/scene/data/views';

const makePolylineParamsArbitrary = () => fc.record({
    pathCoords: fc.array(makeVector3Arbitrary()),
    color: makeColorArbitrary(),
});

describe('#constructor()', () => {
    it('should set properties according to passed arguments', () => {
        fc.assert(
            fc.property(
                // @ts-expect-error
                makePolylineParamsArbitrary(), fc.context(),
                (params, ctx) => {
                    const line = new Polyline(params);

                    expect(checkValue(
                        line.pathCoords,
                        params.pathCoords,
                        ctx,
                        (a, b) => _.range(a.length).every((i) => tensorApprox(a[i], b[i])),
                    ), 'Incorrect value of pathCoords').to.be.true;

                    expect(checkValue(
                        line.color.getHex(),
                        params.color.getHex(),
                        ctx,
                    ), 'Incorrect value of color').to.be.true;
                },
            ),
        );
    });
});

describe('#pathCoords', () => {
    it('should have consistent getter and setter', () => {
        fc.assert(
            fc.property(
                // @ts-expect-error
                makePolylineParamsArbitrary(), fc.array(makeVector3Arbitrary()), fc.context(),
                (params, pathCoords, ctx) => {
                    const line = new Polyline(params);

                    line.pathCoords = pathCoords;

                    return checkValue(
                        line.pathCoords,
                        pathCoords,
                        ctx,
                        (a, b) => _.range(a.length).every((i) => tensorApprox(a[i], b[i])),
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
                // @ts-expect-error
                makePolylineParamsArbitrary(), makeColorArbitrary(), fc.context(),
                (params, color, ctx) => {
                    const line = new Polyline(params);

                    line.color = color;

                    return checkValue(
                        line.color.getHex(),
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
                makePolylineParamsArbitrary(), fc.context(),
                (params, ctx) => {
                    const line = new Polyline(params);

                    expect(line.asObject3D()).to.be.an.instanceof(THREE.Object3D);
                },
            ),
        );
    });
});

describe('#raycast()', () => {
    const line = new Polyline({
        pathCoords: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
        color: new THREE.Color(),
    });
    const raycaster = new THREE.Raycaster();

    it('should raycast againt the line', () => {
        const intersects = line.raycast(raycaster);

        // 3 bbox points makes 2 lines.
        expect(intersects.length).equal(2, 'incorrect number of intersections');

        for (const intersect of intersects) {
            expect(intersect.object).to.be.an.instanceOf(THREE.Line, 'incorrect intersection object');

            expect(checkValue(
                intersect.point,
                new THREE.Vector3(),
                undefined,
                tensorApprox,
            ), 'incorrect intersection position').to.be.true;
        }
    });
});
