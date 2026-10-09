import * as THREE from 'three';

import { ThreeUtils } from 'sta/common/utils';

/**
 * @typedef {import('sta/services/editor/core').ColorBlender} ColorBlender
 */

/**
 * @typedef {import('sta/services/editor/core').PointBuffer} PointBuffer
 */

/**
 * Represents the ground mesh for a point cloud.
 */
export class GroundMesh {

    /**
     * A buffer containing the vertices of this mesh.
     * 
     * @readonly
     * @type {Readonly<PointBuffer>}
     */
    verticesBuffer;

    /**
     * The name of each channel for every point in the mesh.
     * 
     * @readonly
     * @type {ReadonlyArray<string>}
     */
    channelNames = ['x', 'y', 'z'];

    /**
     * The number of channels in each point.
     * 
     * @type {number}
     */
    get numChannels() { return this.channelNames.length; }

    /**
     * A buffer containing the faces of this mesh.
     * 
     * Should have length `numFaces * 3`.
     * 
     * @readonly
     * @type {Readonly<Int32Array>}
     */
    facesBuffer;

    /**
     * @type {THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>}
     */
    #mesh;

    /**
     * The position of this mesh in world space.
     * 
     * @type {Readonly<THREE.Vector3>}
     */
    get position() { return this.#mesh.position.clone(); }

    set position(value) { this.#mesh.position.copy(value); }

    /**
     * @type {ColorBlender}
     */
    #blender;

    /**
     * The function that computes the color of each vertex in this ground mesh.
     * 
     * @type {ColorBlender}
     */
    get blender() { return this.#blender; }

    set blender(value) {
        if (this.blender !== value) {
            this.#blender = value;

            this.#updateColors();
        }
    }

    /**
     * Updates the color of each vertex in the ground mesh.
     */
    #updateColors() {
        const vertexColors = this.#mesh.geometry.getAttribute('color');
        this.blender.getColors(this.verticesBuffer).forEach((color, i) => {
            vertexColors.setXYZ(i, color.r, color.g, color.b);
        });
        vertexColors.needsUpdate = true;
    }

    /**
     * The opacity of the material of this ground mesh.
     * 
     * @type {number}
     */
    get opacity() { return this.#mesh.material.opacity; }

    set opacity(value) { this.#mesh.material.opacity = ThreeUtils.checkOpacity(value); }

    /**
     * Whether to display this ground mesh as a wireframe.
     * 
     * @type {boolean}
     */
    get showWireframe() { return this.#mesh.material.wireframe; }

    set showWireframe(value) { this.#mesh.material.wireframe = value; }

    /**
     * Creates a new ground mesh.
     * 
     * @param {Readonly<PointBuffer>} verticesBuffer A buffer containing the vertices of the mesh.
     * @param {Readonly<Int32Array>} facesBuffer A buffer containing the faces of the mesh.
     * Should have length `numFaces * 3`.
     * @param {Readonly<THREE.Vector3>} position The position of the mesh in world space.
     * @param {ColorBlender} blender A function that computes the color of each vertex.
     * @param {number} opacity The opacity of the mesh.
     * @param {boolean} showWireframe `true` if the mesh is displayed as a wireframe;
     * otherwise, `false`.
     */
    constructor(verticesBuffer, facesBuffer, position, blender, opacity, showWireframe = true) {
        this.verticesBuffer = verticesBuffer.clone();
        this.facesBuffer = facesBuffer.slice();
        this.#blender = blender;

        const facesBufferArr = Array.from(facesBuffer);

        let geometry = new THREE.BufferGeometry();
        geometry = verticesBuffer.updateGeometry(geometry, 'position');

        if (facesBuffer.length % 3) {
            throw new Error(`Length of facesBuffer should be divisible by 3. Found: ${facesBuffer.length}`);
        }

        geometry.setIndex(facesBufferArr);

        // Replaces this.#updateColors
        geometry = ThreeUtils.setFromColors(geometry, blender.getColors(verticesBuffer));
        const material = new THREE.MeshBasicMaterial({
            transparent: true,
            side: THREE.DoubleSide,
            vertexColors: true,
        });

        this.#mesh = new THREE.Mesh(geometry, material);

        this.position = position;
        this.opacity = opacity;
        this.showWireframe = showWireframe;
    }

    /**
     * Creates a deep copy of this mesh (detached from its parents).
     * 
     * @returns {GroundMesh} The newly created copy.
     */
    clone() {
        return new GroundMesh(
            this.verticesBuffer,
            this.facesBuffer,
            this.position,
            this.blender,
            this.opacity,
            this.showWireframe,
        );
    }

    /**
     * Returns a `three.js` representation of this object.
     * 
     * Note that modifications to the `three.js` object may not be reflected in this object.
     * 
     * @returns {THREE.Object3D} The resulting object.
     */
    asObject3D() { return this.#mesh; }

    /**
     * Performs raycasting against this object.
     * 
     * @param {THREE.Raycaster} raycaster The caster of the ray.
     * @param {THREE.Intersection[]} intersects If provided, the results are accumulated into
     * this array. Otherwise, a new one is instantiated.
     * @returns {THREE.Intersection[]} Refer to the `raycast` method of {@link THREE.Object3D}.
     */
    raycast(raycaster, intersects = []) {
        return raycaster.intersectObject(this.#mesh, false, intersects);
    }
}
