import { RBush3D } from 'rbush-3d';
import * as THREE from 'three';

import { ThreeUtils } from 'sta/common/utils';

/**
 * @typedef {import('rbush-3d').BBox} BBox 
 */

/**
 * @typedef {import('sta/services/editor/core').PointBuffer} PointBuffer 
 */

/**
 * a shallow copy of point cloud in the scene.
 */
export class PointCloudUtils {

    /**
     * A buffer containing the vertices of this point cloud.
     * 
     * @readonly
     * @type {PointBuffer}
     */
    buffer;

    /**
     * @type {RBush3D} The tree structure indexing this point cloud.
     */
    tree;

    /**
     * Displays each point in this point cloud.
     * 
     * @type {THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>}
     */
    #points;

    /**
     * The coordinates of the point cloud in world space.
     * 
     * @type {Readonly<THREE.Vector3>}
     */
    get position() { return this.#points.position.clone(); }

    set position(value) { this.#points.position.copy(value); }

    /**
     * Controls the display size of each point in this point cloud.
     * 
     * @type {number}
     */
    get pointSize() { return this.#points.material.size; }

    set pointSize(value) { this.#points.material.size = ThreeUtils.checkSize(value); }

    /**
     * @type {THREE.Vector3[]}
     */
    #pointsInNDC = [];

    /**
     * 
     * @type {THREE.Vector3[]}
     */
    get pointsInNDC() { return this.#pointsInNDC; }

    set pointsInNDC(value) { this.#pointsInNDC = value; }

    /**
     * The number of channels of this object 
     * only correponds to x,y,z channels.
     * 
     * @type {number}
     */
    static NUM_CHANNELS = Object.freeze(3);

    /**
     * Creates a new point cloud.
     * 
     * @param {Readonly<PointBuffer>} buffer A buffer containing the vertices of the point cloud.
     * @param {Readonly<THREE.Vector3>} position The coordinates of the point cloud in world space.
     * @param {number} pointSize Controls the display size of each points in the point cloud.
     */
    constructor(buffer, position, pointSize) {
        this.buffer = buffer.clone();
        this.tree = new RBush3D(16);

        /**
         * @type {BBox[]}
         */
        const bulkItem = buffer.getCoords().map((coord) => ({
            minX: coord.x,
            minY: coord.y,
            minZ: coord.z,
            maxX: coord.x,
            maxY: coord.y,
            maxZ: coord.z,
        }));

        this.tree.load(bulkItem);

        const geometry = buffer.updateGeometry(new THREE.BufferGeometry(), 'position');

        const material = new THREE.PointsMaterial({
            vertexColors: true,
            sizeAttenuation: false,
        });

        this.#points = new THREE.Points(geometry, material);

        this.position = position;
        this.pointSize = pointSize;
    }
}
