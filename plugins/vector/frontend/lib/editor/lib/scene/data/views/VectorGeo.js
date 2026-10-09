import { ThreeUtils } from 'sta/common/utils';

/**
 * @typedef {import('three')} THREE
 */

/**
 * @typedef {THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>} Line
 */

/**
 * @typedef {THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>} Point
 */

/**
 * @template {Line | Point} G
 * @typedef {object} VectorGeoParams
 * @property {G} geo The geometry to represent a vector shape.
 * @property {ReadonlyArray<THREE.Vector3>} vectorCoords The coordinates of each vertex,
 * that shapes a geometry object.
 */

/**
 * Represents any 3D vector object geometries.
 * 
 * @template {Line | Point} G
 * @abstract
 */
export class VectorGeo {
    /**
     * @type {G}
     */
    #geo;

    /**
     * 
     * @type {G}
     */
    get geo() { return this.#geo; }

    set geo(value) {
        if (this.#geo !== value) {
            this.#geo = value;
        }
    }

    /**
     * @type {boolean}
     */
    get isClosed() {
        const vectorCoords = this.#vectorCoords;
        const coordsLenght = vectorCoords.length;

        const firstCoords = vectorCoords.at(0);
        const lastCoords = vectorCoords.at(coordsLenght - 1);

        if (firstCoords == null || lastCoords == null) return false;

        return (coordsLenght > 3 && firstCoords.equals(lastCoords));
    }

    /**
     * @type {ReadonlyArray<THREE.Vector3>}
     */
    #vectorCoords;

    /**
     * The coordinates of each vertex, used to shape this geometry.
     * 
     * @type {ReadonlyArray<THREE.Vector3>}
     */
    get vectorCoords() { return this.#vectorCoords; }

    set vectorCoords(value) {
        if (value != null) {
            if (!ThreeUtils.areVerticesEqual(this.vectorCoords, value)) {
                this.#vectorCoords = [...value];

                this.updateVector();
                this.#geo.geometry.computeBoundingBox();
                this.#geo.geometry.computeBoundingSphere();
            }
        }
    }

    /**
     * Updates the vertices of the `three.js` representation of this geometry.
     * 
     * @protected
     * @abstract
     */
    updateVector() {
        throw Error('Not Implemented');
    }

    /**
     * The display color of this polyline.
     * 
     * @type {Readonly<THREE.Color>} 
     */
    get color() { return this.#geo.material.color; }

    set color(value) { this.#geo.material.color.copy(value); }

    /**
     * Updates the display color of the `three.js` components of this vector geometry.
     * 
     * @protected
     * @abstract
     */
    updateColor() {
        throw Error('Not Implemented');
    }

    /**
     * Creates a new vector geometry.
     * 
     * @param {VectorGeoParams<G>} params The parameters of the vector geometry.
     */
    constructor(params) {
        this.#vectorCoords = [...params.vectorCoords];
        this.#geo = params.geo;
    }

    /**
     * Returns a `three.js` representation of this object.
     * 
     * Note that modifications to the `three.js` object may not be reflected in this object.
     * 
     * @returns {THREE.Object3D} The resulting object.
     */
    asObject3D() { return this.#geo; }

    /**
     * @abstract
     * @returns {VectorGeo<G>} new instance of this object.
     */
    clone() {
        throw Error('Not Impelemented');
    }

    /**
     * Performs raycasting against this object.
     * 
     * @param {THREE.Raycaster} raycaster The caster of the ray.
     * @param {THREE.Intersection[]} intersects If provided, the results are accumulated into
     * this array. Otherwise, a new one is instantiated.
     * @returns {THREE.Intersection[]} Refer to the `raycast` method of {@link THREE.Object3D}.
     */
    raycast(raycaster, intersects = []) {
        return raycaster.intersectObject(this.#geo, false, intersects);
    }
}

/**
 * @typedef {object} VectorBuilderParams
 * @property {ReadonlyArray<Readonly<THREE.Vector3>>} vectorCoords The coordinates of each vertex,
 * that shapes a geometry object
 * @property {Readonly<THREE.Color>} color The display color of the polyline.
 */

/**
 * Creates the `three.js` elements of a vector geometry.
 * 
 * @abstract
 */
export class VectorBuilder {

    /**
     * Creates the vector geometry shape.
     * 
     * @param {VectorBuilderParams} params The vector parameters.
     * @returns {VectorGeo<Line | Point>} The request vector geometry.
     * @abstract
     */
    createVector(params) {
        throw Error('Not Implemented');
    }
}
