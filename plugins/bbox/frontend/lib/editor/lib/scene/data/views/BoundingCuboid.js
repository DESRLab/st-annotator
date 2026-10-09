import * as THREE from 'three';

import { BoundingBoxBuilder } from './BoundingBox';

/**
 * Creates the `three.js` elements of a cuboid bounding box.
 */
export class BoundingCuboidBuilder extends BoundingBoxBuilder {

    /**
     * Creates the `three.js` object representing the faces of a bounding box.
     * 
     * @param {THREE.Color} color The color of the bounding box.
     * @param {number} opacity The opacity of the faces in the bounding box.
     * @returns {THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>} The resulting object.
     */
    makeFaces(color, opacity) {
        const faces = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: opacity,
            side: THREE.DoubleSide,
        });

        return new THREE.Mesh(faces, material);
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
        // Create square pyramid with vertex O and base ABCD
        const faces = new THREE.BufferGeometry();

        // The vertex is close to the front of the box
        const O = new THREE.Vector3(0, 0, -1 / 3);

        // The base is parallel to the front of the box
        const A = new THREE.Vector3(0.5, 0.5, -0.5);
        const B = new THREE.Vector3(0.5, -0.5, -0.5);
        const C = new THREE.Vector3(-0.5, -0.5, -0.5);
        const D = new THREE.Vector3(-0.5, 0.5, -0.5);

        faces.setFromPoints([
            // Base of pyramid
            A, B, C,
            A, C, D,

            // Sides of pyramid
            O, A, B,
            O, B, C,
            O, C, D,
            O, D, A,
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
