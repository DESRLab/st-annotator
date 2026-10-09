import fc from 'fast-check';
import { expect } from 'chai';
import { describe, it } from 'vitest';
import * as THREE from 'three';

import { checkValue, checkArray, makeVector3Arbitrary, tensorApprox } from 'sta/common/testing';

import { CoordinateFormat } from 'sta/services/editor/base';
import { Colormap, PointBuffer, ApplyColormap, NormalizedValueFunc } from 'sta/services/editor/core';
import { makePointBufferArbitrary, makeApplyColormapArbitrary } from 'sta/services/editor/testing';

import { PointCloud } from '../../../../lib/editor/lib';

const makePointSizeArbitrary = () => fc.double({
    min: 0,
    max: 2,
    noNaN: true,
    noDefaultInfinity: true,
});

const makePcdParamsArbitrary = () => fc.record({
    buffer: makePointBufferArbitrary(),
    channelNames: fc.array(fc.string()),
    position: makeVector3Arbitrary(),
    blender: makeApplyColormapArbitrary(),
    pointSize: makePointSizeArbitrary(),
});

describe('#constructor()', () => {
    it('should set properties according to passed arguments', () => {
        fc.assert(
            fc.property(
                // @ts-expect-error
                makePcdParamsArbitrary(), fc.context(),
                ({ buffer, channelNames, position, blender, pointSize }, ctx) => {
                    const pointCloud = new PointCloud(
                        buffer,
                        channelNames,
                        position,
                        blender,
                        pointSize,
                    );

                    expect(buffer).to.eql(pointCloud.buffer);
                    expect(channelNames).to.eql(pointCloud.channelNames);

                    expect(checkArray(
                        pointCloud.channelNames,
                        channelNames,
                        ctx,
                    ), 'Incorrect channelNames').to.be.true;

                    expect(blender).to.eql(pointCloud.blender);

                    expect(checkValue(
                        pointCloud.pointSize,
                        pointSize,
                        ctx,
                    ), 'Incorrect point cloud size').to.be.true;
                },
            ),
        );
    });
});

describe('#position', () => {
    it('should have consistent getter and setter', () => {
        fc.assert(
            fc.property(
                // @ts-expect-error
                makePcdParamsArbitrary(), makeVector3Arbitrary(), fc.context(),
                ({ buffer, channelNames, position, blender, pointSize }, position1, ctx) => {
                    const pointCloud = new PointCloud(
                        buffer,
                        channelNames,
                        position,
                        blender,
                        pointSize,
                    );

                    pointCloud.position = position1;

                    return checkValue(
                        pointCloud.position,
                        position1,
                        ctx,
                        (a, b) => tensorApprox(a, b),
                    );
                },
            ),
        );
    });
});

describe('#blender', () => {
    it('should have consistent getter and setter', () => {
        fc.assert(
            fc.property(
                // @ts-expect-error
                makePcdParamsArbitrary(), makeApplyColormapArbitrary(), fc.context(),
                ({ buffer, channelNames, position, blender, pointSize }, blender1, ctx) => {
                    const pointCloud = new PointCloud(
                        buffer,
                        channelNames,
                        position,
                        blender,
                        pointSize,
                    );

                    pointCloud.blender = blender1;

                    return checkValue(
                        pointCloud.blender,
                        blender1,
                        ctx,
                    );
                },
            ),
        );
    });
});

describe('#pointSize', () => {
    it('should have consistent getter and setter', () => {
        fc.assert(
            fc.property(
                // @ts-expect-error
                makePcdParamsArbitrary(), makePointSizeArbitrary(), fc.context(),
                ({ buffer, channelNames, position, blender, pointSize }, pointSize1, ctx) => {
                    const pointCloud = new PointCloud(
                        buffer,
                        channelNames,
                        position,
                        blender,
                        pointSize,
                    );

                    pointCloud.pointSize = pointSize1;

                    return checkValue(
                        pointCloud.pointSize,
                        pointSize1,
                        ctx,
                    );
                },
            ),
        );
    });
});

describe('#clone()', () => {
    it('should return an instance of the same type', () => {
        fc.assert(
            fc.property(
                // @ts-expect-error
                makePcdParamsArbitrary(), fc.context(),
                ({ buffer, channelNames, position, blender, pointSize }, ctx) => {
                    const pointCloud = new PointCloud(
                        buffer,
                        channelNames,
                        position,
                        blender,
                        pointSize,
                    );

                    expect(pointCloud.clone()).to.be.an.instanceOf(PointCloud);
                },
            ),
        );
    });
    it('should return an instance that is independent of the original', () => {
        fc.assert(
            fc.property(
                // @ts-expect-error
                makePcdParamsArbitrary(), makePcdParamsArbitrary(), fc.context(),
                (params0, params1, ctx) => {
                    const pcd0 = new PointCloud(
                        params0.buffer,
                        params0.channelNames,
                        params0.position,
                        params0.blender,
                        params0.pointSize,
                    );
                    const pcd1 = pcd0.clone();

                    pcd1.position = params1.position;
                    pcd1.blender = params1.blender;
                    pcd1.pointSize = params1.pointSize;

                    expect(checkValue(
                        pcd0.position,
                        pcd1.position,
                        ctx,
                        (a, b) => tensorApprox(a, b),
                    )).to.equal(
                        tensorApprox(params0.position, params1.position),
                        'Incorrect value of position',
                    );

                    expect(checkValue(
                        pcd0.pointSize,
                        pcd1.pointSize,
                        ctx,
                    )).to.equal(
                        params0.pointSize === params1.pointSize,
                        'Incorrect point cloud size',
                    );

                    expect(pcd0.blender).to.not.eql(pcd1.blender);
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
                makePcdParamsArbitrary(), fc.context(),
                ({ buffer, channelNames, position, blender, pointSize }, ctx) => {
                    const pointCloud = new PointCloud(
                        buffer,
                        channelNames,
                        position,
                        blender,
                        pointSize,
                    );

                    expect(pointCloud.asObject3D()).to.be.an.instanceOf(THREE.Object3D);
                },
            ),
        );
    });
});

/**
 * @type {(data: number[], numChannels: number) => {
 *     pointBuffer: PointBuffer,
 *     colorBlenders: ApplyColormap[]
 * }}
 */
const helperInitializer = ((data, numChannels) => {
    const dataArray = new Float32Array(data);
    const colors = [new THREE.Color('blue'),
        new THREE.Color('yellow'), new THREE.Color('pink'),
        new THREE.Color('red'), new THREE.Color('green')];
    const colormap = new Colormap('', colors);
    const buffer = new PointBuffer(dataArray, CoordinateFormat.XYZ, numChannels);
    const colorBlenders = [];
    for (let i = 0; i < dataArray.length / numChannels; i++) {
        const normFunc = new NormalizedValueFunc(i, -100, +100);
        const colormapBlender = new ApplyColormap(colormap, normFunc);
        colorBlenders.push(colormapBlender);
    }
    return { pointBuffer: buffer, colorBlenders: colorBlenders };
});

describe('test raycast method from PointCloud object in PointCloud.js', () => {
    const { pointBuffer, colorBlenders } = helperInitializer([0.1, 0.2, 0.3, 0.4,
        0.5, 0.6, 0.7, 0.8, 0.9], 3);
    const pointCloud = new PointCloud(pointBuffer, [], new THREE.Vector3(), colorBlenders[1], 1);
    const rays = pointCloud.raycast(new THREE.Raycaster(new THREE.Vector3(1, 0, 10)));
    it('should return 3 intersections of same threejs point instance at different distances', () => {
        expect(rays.length).to.be.equal(3);
        for (const ray of rays) {
            expect(ray.object).to.be.an.instanceOf(THREE.Points);
        }
    });
});
