import * as THREE from 'three';

import { ThreeUtils } from 'sta/common/utils';

/**
 * @typedef {import('sta/services/editor/core').ColorBlender} ColorBlender
 */

/**
 * @typedef {import('sta/services/editor/core').PointBuffer} PointBuffer
 */

/**
 * Represents a point cloud in the scene.
 */
export class PointCloud {

    /**
     * A buffer containing the vertices of this point cloud.
     * 
     * @readonly
     * @type {Readonly<PointBuffer>}
     */
    buffer;

    /**
     * The name of each channel for every point in the point cloud.
     * 
     * @readonly
     * @type {ReadonlyArray<string>}
     */
    channelNames;

    /**
     * The number of channels in each point.
     * 
     * @type {number}
     */
    get numChannels() { return this.channelNames.length; }

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
     * @type {ColorBlender}
     */
    #blender;

    /**
     * The function that computes the color of each point in this point cloud.
     * 
     * @type {ColorBlender}
     */
    get blender() { return this.#blender; }

    set blender(value) {
        if (this.#blender !== value) {
            this.#blender = value;

            this.#updateColors();
        }
    }

    /**
     * Updates the color of each point in the point cloud.
     */
    #updateColors() {
        const pointColors = this.#points.geometry.getAttribute('color');
        this.blender.getColors(this.buffer).forEach((color, i) => {
            pointColors.setXYZ(i, color.r, color.g, color.b);
        });
        pointColors.needsUpdate = true;
    }

    /**
     * Controls the display size of each point in this point cloud.
     * 
     * @type {number}
     */
    get pointSize() { return this.#points.material.size; }

    set pointSize(value) { this.#points.material.size = ThreeUtils.checkSize(value); }

    /**
     * Creates a new point cloud.
     * 
     * @param {Readonly<PointBuffer>} buffer A buffer containing the vertices of the point cloud.
     * @param {ReadonlyArray<string>} channelNames The name of each channel for every point
     * in the point cloud.
     * @param {Readonly<THREE.Vector3>} position The coordinates of the point cloud in world space.
     * @param {ColorBlender} blender A function that computes the color of each point.
     * @param {number} pointSize Controls the display size of each points in the point cloud.
     */
    constructor(buffer, channelNames, position, blender, pointSize) {
        this.buffer = buffer.clone();
        this.channelNames = [...channelNames];

        this.#blender = blender;

        const geometry = buffer.updateGeometry(new THREE.BufferGeometry(), 'position');

        // Replaces this.#updateColors
        ThreeUtils.setFromColors(geometry, blender.getColors(buffer));

        const material = new THREE.PointsMaterial({
            vertexColors: true,
            sizeAttenuation: false,
        });

        this.#points = new THREE.Points(geometry, material);

        this.position = position;
        this.pointSize = pointSize;
    }

    /**
     * Creates a deep copy of this point cloud (detached from its parents).
     * 
     * @returns {PointCloud} The newly created copy.
     */
    clone() {
        return new PointCloud(
            this.buffer,
            this.channelNames,
            this.position,
            this.blender,
            this.pointSize,
        );
    }

    /**
     * Returns a `three.js` representation of this object.
     * 
     * Note that modifications to the `three.js` object may not be reflected in this object.
     * 
     * @returns {THREE.Object3D} The resulting object.
     */
    asObject3D() { return this.#points; }

    /**
     * Performs raycasting against this object.
     * 
     * @param {THREE.Raycaster} raycaster The caster of the ray.
     * @param {THREE.Intersection[]} intersects If provided, the results are accumulated into
     * this array. Otherwise, a new one is instantiated.
     * @returns {THREE.Intersection[]} Refer to the `raycast` method of {@link THREE.Object3D}.
     */
    raycast(raycaster, intersects = []) {
        return raycaster.intersectObject(this.#points, false, intersects);
    }
}
