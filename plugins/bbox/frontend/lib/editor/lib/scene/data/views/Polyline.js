import * as THREE from 'three';

/**
 * @typedef {object} PolylineParams
 * @property {ReadonlyArray<Readonly<THREE.Vector3>>} pathCoords The coordinates of each vertex,
 * used to trace out the line segments.
 * @property {Readonly<THREE.Color>} color The display color of the polyline.
 */

/**
 * Represents a sequence of connected line segments in the scene.
 */
export class Polyline {

    /**
     * @type {THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>}
     */
    #path = new THREE.Line();

    /**
     * @type {Readonly<THREE.Vector3>[]}
     */
    #pathCoords;

    /**
     * The coordinates of each vertex, used to trace out the line segments.
     * 
     * @type {ReadonlyArray<Readonly<THREE.Vector3>>}
     */
    get pathCoords() { return this.#pathCoords; }

    set pathCoords(value) {
        if (this.#pathCoords !== value) {
            this.#pathCoords = [...value];

            this.#updatePathVertices();
        }
    }

    /**
     * Updates the vertices of the `three.js` representation of this polyline.
     */
    #updatePathVertices() {
        const pathCoords = this.#pathCoords;
        const position = this.#path.geometry.getAttribute('position');
        const sizeChanged = pathCoords.length !== position.count;

        if (sizeChanged) {
            const geometry = new THREE.BufferGeometry().setFromPoints(pathCoords);
            const material = this.#path.material.clone();
            this.#path = new THREE.Line(geometry, material);
        } else {
            pathCoords.forEach(({ x, y, z }, i) => {
                if (position.getX(i) !== x || position.getY(i) !== y || position.getZ(i) !== z) {
                    position.setXYZ(i, x, y, z);
                    position.needsUpdate = true;
                }
            });
        }
    }

    /**
     * The display color of this polyline.
     * 
     * @type {Readonly<THREE.Color>} 
     */
    get color() { return this.#path.material.color; }

    set color(value) { this.#path.material.color.copy(value); }

    /**
     * Creates a new polyline.
     * 
     * @param {PolylineParams} params The parameters of the polyline.
     */
    constructor(params) {
        const pathCoords = [...params.pathCoords];
        this.#pathCoords = pathCoords;

        // Replaces this.#updatePathVertices
        const geometry = new THREE.BufferGeometry().setFromPoints(pathCoords);
        const material = new THREE.LineBasicMaterial({ color: params.color });
        this.#path = new THREE.Line(geometry, material);
    }

    /**
     * Returns a `three.js` representation of this object.
     * 
     * Note that modifications to the `three.js` object may not be reflected in this object.
     * 
     * @returns {THREE.Object3D} The resulting object.
     */
    asObject3D() { return this.#path; }

    /**
     * Performs raycasting against this object.
     * 
     * @param {THREE.Raycaster} raycaster The caster of the ray.
     * @param {THREE.Intersection[]} intersects If provided, the results are accumulated into
     * this array. Otherwise, a new one is instantiated.
     * @returns {THREE.Intersection[]} Refer to the `raycast` method of {@link THREE.Object3D}.
     */
    raycast(raycaster, intersects = []) {
        return raycaster.intersectObject(this.#path, false, intersects);
    }
}
