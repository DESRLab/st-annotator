import * as THREE from 'three';

import { ThreeUtils } from 'sta/common/utils';

/**
 * @typedef {object} BoundingBoxParams
 * @property {Readonly<THREE.Vector3>} position The position of the bounding box in world space.
 * @property {Readonly<THREE.Euler>} rotation The rotation of the bounding box.
 * @property {Readonly<THREE.Vector3>} scale The scale of the bounding box.
 * @property {Readonly<THREE.Color>} color The display color of the bounding box.
 * @property {number} opacity The opacity of the faces in the bounding box.
 * @property {boolean} [showForwardIndicator=true] `true` (default) if the forward indicator of the
 * bounding box is visible; otherwise, `false`.
 * @property {boolean} [showFrame=true] `true` (default) if the faces and edges of the bounding box
 * are visible; otherwise, `false`.
 */

/* eslint-disable max-len */
/**
 * @typedef {object} BoundingBoxElements
 * @property {THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>} center
 * The `three.js` object representing the center of a bounding box.
 * @property {THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>} faces
 * The `three.js` object representing the faces of a bounding box.
 * @property {THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>} edges
 * The `three.js` object representing the edges of a bounding box.
 * @property {THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>} forwardIndicatorFaces
 * The `three.js` object representing the faces indicating the forward direction of a bounding box.
 * @property {THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>} forwardIndicatorEdges
 * The `three.js` object representing the edges indicating the forward direction of a bounding box.
 */
/* eslint-enable max-len */

/**
 * Represents a bounding box in the scene.
 * 
 * The bounding box should have unit dimensions in model space, such that its scale is equal
 * to its size.
 */
export class BoundingBox {

    /**
     * A point located at the center of this bounding box.
     * 
     * @type {THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>}
     */
    #center = new THREE.Points();

    /**
     * Displays the faces of this bounding box.
     * 
     * @type {THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>}
     */
    #faces = new THREE.Mesh();

    /**
     * Displays the edges of this bounding box.
     * 
     * @type {THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>}
     */
    #edges = new THREE.LineSegments();

    /**
     * The faces that indicate the forward direction of this bounding box.
     * 
     * @type {THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>}
     */
    #forwardIndicatorFaces = new THREE.Mesh();

    /**
     * The edges that indicate the forward direction of this bounding box.
     * 
     * @type {THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>}
     */
    #forwardIndicatorEdges = new THREE.LineSegments();

    /**
     * Displays this bounding box.
     * 
     * @readonly
     * @type {THREE.Group}
     */
    #box;

    /**
     * The position of this bounding box in world space.
     * 
     * @type {Readonly<THREE.Vector3>}
     */
    get position() { return this.#box.position.clone(); }

    set position(value) { this.#box.position.copy(value); }

    /**
     * The rotation of this bounding box.
     * 
     * @type {Readonly<THREE.Euler>}
     */
    get rotation() { return this.#box.rotation.clone(); }

    set rotation(value) { this.#box.rotation.copy(value); }

    /**
     * The scale of this bounding box.
     * 
     * @type {Readonly<THREE.Vector3>}
     */
    get scale() { return this.#box.scale.clone(); }

    set scale(value) { this.#box.scale.copy(value); }

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
     * Updates the display color of the `three.js` components of this bounding box.
     */
    #updateColor() {
        const color = this.#color;

        this.#center.material.color.copy(color);
        this.#faces.material.color.copy(color);
        this.#edges.material.color.copy(color);
        this.#forwardIndicatorFaces.material.color.copy(color);
        this.#forwardIndicatorEdges.material.color.copy(color);
    }

    /**
     * @type {number}
     */
    #opacity;

    /**
     * The opacity of the faces in this bounding box.
     * 
     * @type {number}
     */
    get opacity() { return this.#opacity; }

    set opacity(value) {
        const cleanedValue = ThreeUtils.checkOpacity(value);

        if (this.opacity !== cleanedValue) {
            this.#opacity = cleanedValue;

            this.#updateOpacity();
        }
    }

    /**
     * Updates the opacity of the components of this object.
     */
    #updateOpacity() {
        const opacity = this.#opacity;

        this.#faces.material.opacity = opacity;
        this.#forwardIndicatorFaces.material.opacity = opacity;
    }

    /**
     * @type {boolean}
     */
    #showForwardIndicator;

    /**
     * Whether the forward indicator of this bounding box is visible.
     * 
     * @type {boolean}
     */
    get showForwardIndicator() { return this.#showForwardIndicator; }

    set showForwardIndicator(value) {
        if (this.#showForwardIndicator !== value) {
            this.#showForwardIndicator = value;

            this.#updateVisibility();
        }
    }

    /**
     * @type {boolean}
     */
    #showFrame;

    /**
     * Whether the faces and edges of this bounding box are visible.
     * 
     * @type {boolean}
     */
    get showFrame() { return this.#showFrame; }

    set showFrame(value) {
        if (this.#showFrame !== value) {
            this.#showFrame = value;

            this.#updateVisibility();
        }
    }

    /**
     * Updates the visibility of the components of this object.
     */
    #updateVisibility() {
        const { showForwardIndicator, showFrame } = this;

        this.#center.visible = true;
        this.#faces.visible = showFrame;
        this.#edges.visible = showFrame;
        this.#forwardIndicatorFaces.visible = showForwardIndicator && showFrame;
        this.#forwardIndicatorEdges.visible = showForwardIndicator && showFrame;
    }

    /**
     * Creates a new bounding box.
     * 
     * @param {BoundingBoxParams} params The parameters of the bounding box.
     * @param {BoundingBoxElements} elements The `three.js` elements of the bounding box.
     */
    constructor(params, elements) {
        this.#center = elements.center;
        this.#faces = elements.faces;
        this.#edges = elements.edges;
        this.#forwardIndicatorFaces = elements.forwardIndicatorFaces;
        this.#forwardIndicatorEdges = elements.forwardIndicatorEdges;

        this.#box = new THREE.Group().add(
            this.#center,
            this.#faces,
            this.#edges,
            this.#forwardIndicatorFaces,
            this.#forwardIndicatorEdges,
        );

        this.position = params.position;
        this.rotation = params.rotation;
        this.scale = params.scale;

        this.#color = params.color;
        this.#updateColor();

        this.#opacity = params.opacity;
        this.#updateOpacity();

        this.#showForwardIndicator = params.showForwardIndicator ?? true;
        this.#showFrame = params.showFrame ?? true;
        this.#updateVisibility();
    }

    /**
     * Returns a `three.js` representation of this object.
     * 
     * Note that modifications to the `three.js` object may not be reflected in this object.
     * 
     * @returns {THREE.Object3D} The resulting object.
     */
    asObject3D() {
        return this.#box;
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
        const target = this.showFrame ? this.#faces : this.#center;
        return raycaster.intersectObject(target, false, intersects);
    }
}

/**
 * Creates the `three.js` elements of a bounding box.
 */
export class BoundingBoxBuilder {

    /**
     * Creates the `three.js` object representing the center of a bounding box.
     * 
     * @param {THREE.Color} color The color of the bounding box.
     * @returns {THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>} The resulting object.
     */
    makeCenter(color) {
        const point = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3()]);
        const material = new THREE.PointsMaterial({
            color: color,
            size: 10,
            sizeAttenuation: false,
        });

        return new THREE.Points(point, material);
    }

    /**
     * Creates the `three.js` object representing the faces of a bounding box.
     * 
     * @param {THREE.Color} color The color of the bounding box.
     * @param {number} opacity The opacity of the faces in the bounding box.
     * @returns {THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>} The resulting object.
     * @abstract
     */
    makeFaces(color, opacity) {
        throw new Error('Not implemented');
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
        const edges = new THREE.EdgesGeometry(faces.geometry);
        const material = new THREE.LineBasicMaterial({ color: faces.material.color });

        return new THREE.LineSegments(edges, material);
    }

    /**
     * Creates the `three.js` object representing the faces indicating the forward direction of
     * a bounding box.
     * 
     * @param {THREE.Color} color The color of the bounding box.
     * @param {number} opacity The opacity of the faces in the bounding box.
     * @returns {THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>} The resulting object.
     * @abstract
     */
    makeForwardIndicatorFaces(color, opacity) {
        throw new Error('Not implemented');
    }

    /**
     * Creates the `three.js` object representing the edges indicating the forward direction of
     * a bounding box.
     * 
     * @param {THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>} forwardIndicatorFaces
     * The faces indicating the forward direction of the bounding box.
     * @returns {THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>}
     * The resulting object.
     */
    makeForwardIndicatorEdges(forwardIndicatorFaces) {
        const edges = new THREE.EdgesGeometry(forwardIndicatorFaces.geometry);
        const material = new THREE.LineBasicMaterial({
            color: forwardIndicatorFaces.material.color,
        });

        return new THREE.LineSegments(edges, material);
    }

    /**
     * Creates a new bounding box.
     * 
     * @param {BoundingBoxParams} params The parameters of the bounding box.
     * @returns {BoundingBox} The newly created bounding box.
     */
    createBox(params) {
        const dummyColor = new THREE.Color('black');
        const dummyOpacity = 0;

        const center = this.makeCenter(dummyColor);
        const faces = this.makeFaces(dummyColor, dummyOpacity);
        const edges = this.makeEdges(faces);
        const forwardIndicatorFaces = this.makeForwardIndicatorFaces(dummyColor, dummyOpacity);
        const forwardIndicatorEdges = this.makeForwardIndicatorEdges(forwardIndicatorFaces);
        const elements = { center, faces, edges, forwardIndicatorFaces, forwardIndicatorEdges };

        return new BoundingBox(params, elements);
    }
}
