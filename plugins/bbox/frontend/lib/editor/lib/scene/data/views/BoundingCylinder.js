import _ from 'lodash';
import * as THREE from 'three';

import { MathUtils } from 'sta/common/utils';

import { BoundingBoxBuilder } from './BoundingBox';

/**
 * Creates the `three.js` elements of a cylindrical bounding box.
 */
export class BoundingCylinderBuilder extends BoundingBoxBuilder {

    /**
     * Creates the `three.js` object representing the faces of a bounding box.
     * 
     * @param {THREE.Color} color The color of the bounding box.
     * @param {number} opacity The opacity of the faces in the bounding box.
     * @returns {THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>} The resulting object.
     */
    makeFaces(color, opacity) {
        const faces = new THREE.CylinderGeometry(0.5, 0.5, 1, 64);
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: opacity,
            side: THREE.DoubleSide,
        });

        return new THREE.Mesh(faces, material);
    }

    /**
     * Creates the `three.js` object representing the edges of a bounding box.
     * 
     * @param {THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>} faces
     * The faces of the bounding box.
     * @returns {THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>}
     * The resulting object.
     */
    makeEdges(faces) {
        const points2D = new THREE.EllipseCurve(
            0, 0,
            0.5, 0.5,
            0, MathUtils.TAU,
            false, 0,
        ).getPoints(64);

        /**
         * @type {(arr: THREE.Vector3[]) => THREE.Vector3[]}
         */
        const makePairs = (arr) => (
            Array.from(_.range(arr.length - 1), (i) => arr.slice(i, i + 1)).flat()
        );
        const points3DTop = makePairs(points2D.map((v) => new THREE.Vector3(v.x, 0.5, v.y)));
        const points3DBottom = makePairs(points2D.map((v) => new THREE.Vector3(v.x, -0.5, v.y)));

        const points3D = points3DTop.concat(points3DBottom);
        const pointsBuffer = new THREE.BufferGeometry().setFromPoints(points3D);

        const material = new THREE.LineBasicMaterial({ color: faces.material.color });

        return new THREE.LineSegments(pointsBuffer, material);
    }

    /**
     * Creates the `three.js` object representing the faces indicating the forward direction of
     * a bounding box.
     * 
     * @param {THREE.Color} color The color of the bounding box.
     * @param {number} opacity The opacity of the faces in the bounding box.
     * @returns {THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>} The resulting object.
     */
    makeForwardIndicatorFaces(color, opacity) {
        // Create plane from center to front
        const faces = new THREE.BufferGeometry();

        const A = new THREE.Vector3(0, 0.5, -0.5);
        const B = new THREE.Vector3(0, -0.5, -0.5);
        const C = new THREE.Vector3(0, -0.5, 0);
        const D = new THREE.Vector3(0, 0.5, 0);

        faces.setFromPoints([
            A, B, C,
            A, C, D,
        ]);

        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: opacity,
            side: THREE.DoubleSide,
        });

        return new THREE.Mesh(faces, material);
    }
}
