import { expect } from 'chai';
import { describe, it } from 'vitest';
import * as THREE from 'three';

import { CoordinateFormat } from 'sta/services/editor/base';
import { Colormap, ApplyColormap, ComposeRGB, NormalizedValueFunc, PointBuffer } from 'sta/services/editor/core';

import { GroundMesh } from '../../../../lib/editor/lib';

/**
 * @type {(format: CoordinateFormat) => {
 *     verticesBuffer: PointBuffer;
 *     facesBuffer: Int32Array;
 *     blender: ApplyColormap;
 * }}
 */
const helperInitializer = ((format) => {
    const vertices = new Float32Array(9);
    vertices.set([
        -54, 17.4428, -54,
        -54, 17.0778369, -52,
        -52, 17.0691261291, -54,
    ]);

    const faces = new Int32Array(6);
    faces.set([
        0, 1, 2,
        2, 3, 0,
    ]);

    const normalizedValueFunc = new NormalizedValueFunc(
        0,
        NormalizedValueFunc.fromStdScore(-2),
        NormalizedValueFunc.fromStdScore(+2),
    );
    const cm = new ApplyColormap(
        new Colormap('', [
            new THREE.Color('magenta'),
            new THREE.Color('yellow'),
            new THREE.Color('orange'),
            new THREE.Color('violet'),
        ]),
        normalizedValueFunc,
    );

    return {
        verticesBuffer: new PointBuffer(vertices, format, 3),
        facesBuffer: faces,
        blender: new ApplyColormap(cm.colormap, normalizedValueFunc),
    };
});

describe('test variable members of GroundMesh.js when the three group object child includes Mesh Object', () => {
    const { verticesBuffer, facesBuffer, blender } = helperInitializer(CoordinateFormat.ZXY);
    const position = new THREE.Vector3(1, 2, 3);
    const initOpacity = 0.3;
    const groundMesh = new GroundMesh(verticesBuffer, facesBuffer, position, blender, initOpacity);
    describe('test opacity of this object', () => {
        it('initially should be equal to value passed to constructor', () => {
            expect(groundMesh.opacity).equal(initOpacity);
        });
        it('should return modified opacity when needed (change to 0)', () => {
            groundMesh.opacity = 0.0;
            expect(groundMesh.opacity).equal(0.0);
        });
        it('should return undefined when opacity set to undefined', () => {
            // @ts-ignore
            groundMesh.opacity = undefined;
            expect(groundMesh.opacity).to.be.undefined;
        });
        it('should return null when opacity set to null', () => {
            // @ts-ignore
            groundMesh.opacity = null;
            expect(groundMesh.opacity).to.be.null;
        });
    });
    describe('test positionBuffer of this object', () => {
        it('should return the vector(0,0,0) when checking coordinates of index 0', () => {
            expect((groundMesh.verticesBuffer.getPointCoords(0)).equals(new THREE.Vector3()));
        });
    });
    describe('test wireframe of this object', () => {
        it('initially should be true', () => {
            expect(groundMesh.showWireframe).to.be.true;
        });
        it('should change wireframe of this object material to false upon request', () => {
            groundMesh.showWireframe = false;
            expect(groundMesh.showWireframe).to.be.false;
        });
    });
    describe('test channelNames of this object', () => {
        it('should return [x, y, z]', () => {
            expect(groundMesh.channelNames.length).equal(3);
            expect(groundMesh.channelNames).to.eql(['x', 'y', 'z']);
        });
    });
    describe('test set blender of GroundMesh.js', () => {
        const rValueFunc = new NormalizedValueFunc(
            0,
            NormalizedValueFunc.fromStdScore(-2),
            NormalizedValueFunc.fromStdScore(+2),
        );
        const gValueFunc = new NormalizedValueFunc(
            1,
            NormalizedValueFunc.fromStdScore(-2),
            NormalizedValueFunc.fromStdScore(+2),
        );
        const bValueFunc = new NormalizedValueFunc(
            2,
            NormalizedValueFunc.fromStdScore(-2),
            NormalizedValueFunc.fromStdScore(+2),
        );
        const composeRGB = new ComposeRGB(rValueFunc, gValueFunc, bValueFunc);
        it('should return ComposeRGB type when changing the blender of this object', () => {
            groundMesh.blender = composeRGB;
            expect(groundMesh.blender).to.be.instanceOf(ComposeRGB);
        });
    });
});
