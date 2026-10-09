import * as THREE from 'three';

import { ThreeUtils } from 'sta/common/utils';

/**
 * @typedef {object} SelectionParams
 * @property {ReadonlyArray<Readonly<THREE.Vector3>>} pointsCoords The points' coordinates 
 * of creating a selection.
 * @property {Readonly<number>} pointSize The size of the points of a selection.
 * @property {Readonly<THREE.Color>} color The color representation to display this selection.
 * @property {boolean} [showCenter=false] `false` (default) if center of a selection is visibile,
 * otherwise, `false`.
 */

export class Selection {

    /**
     * Displays this bounding box.
     * 
     * @type {THREE.Group}
     */
    #selection;

    /**
     * @type {THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>}
     */
    #points;

    /**
     * @type {Readonly<THREE.Vector3>[]}
     */
    #pointCoords;

    /**
     * A point located at the center of this selection.
     * 
     * @type {THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>}
     */
    #center = new THREE.Points();

    /**
     * The coordinates of each vertex, used to shape this geometry.
     * 
     * @type {ReadonlyArray<Readonly<THREE.Vector3>>}
     */
    get pointCoords() { return this.#pointCoords; }

    set pointCoords(value) {
        if (value != null) {
            if (!ThreeUtils.areVerticesEqual(this.#pointCoords, value)) {
                this.#pointCoords = [...value];
                this.#centerPoint = ThreeUtils.findCenter(value);

                this.#updateSelection();
            }
        }
    }

    /**
     * @type {boolean}
     */
    #showCenter;

    /**
     * Whether the center this selection is visible.
     * 
     * @type {boolean}
     */
    get showCenter() { return this.#showCenter; }

    set showCenter(value) {
        if (this.#showCenter !== value) {
            this.#showCenter = value;

            this.#updateVisibility();
        }
    }

    /**
     * Updates the visibility of the components of this object.
     */
    #updateVisibility() {
        this.#center.visible = this.showCenter;
        this.#points.visible = !this.showCenter;
    }

    /**
     * Updates the point coordinates representing this object.
     */
    #updateSelection() {
        this.#points = this.#makePoints();
        this.#center = this.#makeCenter();

        this.#selection = new THREE.Group().add(
            this.#points,
            this.#center,
        );

        this.#updateVisibility();
    }

    /**
     * @type {Readonly<THREE.Color>}
     */
    #color;

    /**
     * The display color of this bounding box.
     * 
     * @type {Readonly<THREE.Color>} 
     */
    get color() { return this.#color; }

    set color(value) {
        if (!this.#color.equals(value)) {
            this.#color = value.clone();

            this.#updateColor();
        }
    }

    /**
     * Updates the display color of the `three.js` components of this selection.
     */
    #updateColor() {
        const color = this.#color;

        this.#center.material.color.copy(color);
        this.#points.material.color.copy(color);
    }

    /**
     * The size of points in a selection.
     * 
     * @type {number}
     */
    #pointSize;

    /**
     * Controls the display size of the points in this point cloud selection.
     * 
     * @type {number}
     */
    get pointSize() { return this.#pointSize; }

    set pointSize(value) {
        if (this.#pointSize !== value) {
            this.#pointSize = value;

            this.#updatePointSize();
        }
    }

    /**
     * Updates the point size of belonging to this selection.
     */
    #updatePointSize() {
        const pointSize = this.#pointSize;

        this.#points.material.size = pointSize;
    }

    /**
     * @type {THREE.Vector3}
     */
    #centerPoint;

    /**
     * @type {Readonly<THREE.Vector3>} The center of this selection.
     */
    get centerPoint() { return this.#centerPoint; }

    /**
     * Creates the `three.js` object representing the center of a selection.
     * 
     * @returns {THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>} The resulting object.
     */
    #makeCenter() {
        const centerPoint = this.centerPoint.clone();

        const point = new THREE.BufferGeometry().setFromPoints([centerPoint]);
        const material = new THREE.PointsMaterial({
            color: this.color.clone(),
            size: 10,
            sizeAttenuation: false,
        });

        return new THREE.Points(point, material);
    }

    /**
     * Creates the `three.js` object representing the center of a selection.
     * 
     * @returns {THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>} The resulting object.
     */
    #makePoints() {
        const { pointSize, color, pointCoords } = this;
        const points = [...pointCoords];

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.PointsMaterial({
            color: color.clone(),
            sizeAttenuation: false,
            size: pointSize,
        });

        return new THREE.Points(geometry, material);
    }

    /**
     * Constructs new instance of this object.
     * 
     * @param {SelectionParams} params the parameters of the point selection.
     */
    constructor(params) {
        const pointsCoords = [...params.pointsCoords];
        this.#pointCoords = pointsCoords;
        this.#centerPoint = ThreeUtils.findCenter(pointsCoords);
        this.#showCenter = params.showCenter ?? false;
        this.#color = params.color;
        this.#pointSize = params.pointSize;

        this.#center = this.#makeCenter();
        this.#points = this.#makePoints();
        this.#selection = new THREE.Group().add(
            this.#center,
            this.#points,
        );

        this.#updateVisibility();
    }

    /**
     * Returns a `three.js` representation of this object.
     * 
     * Note that modifications to the `three.js` object may not be reflected in this object.
     * 
     * @returns {THREE.Object3D} The resulting object.
     */
    asObject3D() { return this.#selection; }

    /**
     * Performs raycasting against this object.
     * 
     * @param {THREE.Raycaster} raycaster The caster of the ray.
     * @param {THREE.Intersection[]} intersects If provided, the results are accumulated into
     * this array. Otherwise, a new one is instantiated.
     * @returns {THREE.Intersection[]} Refer to the `raycast` method of {@link THREE.Object3D}.
     */
    raycast(raycaster, intersects = []) {
        const target = this.showCenter ? this.#center : this.#points;
        return raycaster.intersectObject(target, false, intersects);
    }
}
