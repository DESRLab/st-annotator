import * as THREE from 'three';

import { ThreeUtils } from 'sta/common/utils';

import { VectorUtils } from '../utils';

/**
 * @typedef {import('rbush-3d').RBush3D} RBush3D 
 */

/**
 * @template T
 * @typedef {import('sta/services/editor/base').InteractController<T>} InteractController 
 */

/**
 * @typedef {import('sta/services/editor/base').ScenePointerEvent} ScenePointerEvent
 */

/**
 * @typedef {import('sta/services/editor/base').WindowPointer} WindowPointer
 */

/**
 * @typedef {'polygon' | 'box' | 'lasso' | 'brush'} ToolTypes
 */

/**
 * @typedef {{ center: THREE.Vector2, radius: number }} ParametricGeo
 */

/** 
 * @typedef {{
 *      pixelVertices: Array<THREE.Vector2>;
 *      ndcVertices: Array<THREE.Vector2>;
 * }} VertexGeo
 */

/**
 * @typedef {ParametricGeo | VertexGeo} ObjQuery
 */

/**
 * Defines each event that can be dispatched by {@link SelectionCurator}.
 * 
 * @template {ObjQuery} T
 * @typedef {object} SelectionCuratorEventMap
 * @property {{ objQuery: T }} begin The event when the creation of a selection just started.
 * @property {{ objQuery: T }} pause The event when the creation of a selection has been paused.
 * @property {{ objQuery: T }} abort The event when the creation of a selection is aborted.
 * @property {{ objQuery: T }} end The event when the creation of a selection is completed.
 */

/**
 * Draws a geometry with set of vertices along `x-z` plane to be used 
 * to query a selection from point cloud.
 * 
 * @template {ObjQuery} T
 * @augments THREE.EventDispatcher<SelectionCuratorEventMap<T>>
 */
export class SelectionCurator extends THREE.EventDispatcher {

    /**
     * @type {ToolTypes}
     * @abstract
     */
    get toolType() { throw new Error('Not Implemented'); }

    /**
     * The pointer that is used to interact with the scene.
     * 
     * @readonly
     * @type {WindowPointer}
     */
    pointer;

    /**
     * The canvas where this object renders on.
     * 
     * @readonly
     * @type {HTMLCanvasElement}
     */
    canvas;

    /**
     * @readonly
     * @type {CanvasRenderingContext2D}
     */
    #context;

    /**
     * The 2d context of this object is drawn.
     * 
     * @type {CanvasRenderingContext2D}
     */
    get context() { return this.#context; }

    /**
     * @readonly
     * @type {InteractController<unknown>}
     */
    #interactor;

    /**
     * Raycasts the pointer to the rendered scene.
     * 
     * @type {THREE.Raycaster}
     */
    get raycaster() { return this.#interactor.raycaster; }

    /**
     * @type {boolean}
     */
    #enabled = false;

    /**
     * `true` if this creator is disabled; otherwise, `false`.
     * 
     * If set to `true` while a bounding box is being created, aborts the process.
     * 
     * @type {boolean}
     */
    get enabled() { return this.#enabled; }

    set enabled(value) {
        if (this.#enabled !== value) {
            this.#enabled = value;

            if (this.isCreating) {
                if (!value) {
                    this.abort();
                }
            }
        }
    }

    /**
     * @type {THREE.Color}
     */
    #strokeColor = new THREE.Color('red');

    /**
     * The color display of stroke while creating a vector object.
     * 
     * @type {THREE.Color}
     */
    get strokeColor() { return this.#strokeColor; }

    set strokeColor(value) {
        if (value != null) {
            if (!this.#strokeColor.equals(value)) {
                this.#strokeColor = new THREE.Color(value);
            }
        }
    }

    /**
     * The object query being created.
     * 
     * @type {T}
     */
    #newDrawnObjData;

    /**
     * @type {T}
     */
    get newDrawnObjData() { return this.#newDrawnObjData; }

    set newDrawnObjData(value) {
        if (this.#newDrawnObjData !== value) {
            this.#newDrawnObjData = value;
        }
    }

    /**
     * Whether a geometry object is being created to query the points 
     * of a selection based on the drawn geometry object.
     * 
     * @type {boolean}
     * @abstract
     */
    get isCreating() {
        throw new Error('Not Implemented');
    }

    /**
     * Calculates the pointer coordinates on canvas.
     * 
     * @param {ScenePointerEvent} event The mouse/pointer event.
     * @returns {THREE.Vector2} The pixel coordinates of
     * pointer position on HTML canvas.
     */
    getPointerPixelPos(event) {
        const { pageX, pageY } = event;

        const x = pageX - this.canvas.offsetLeft;
        const y = pageY - this.canvas.offsetTop;

        return new THREE.Vector2(x, y);
    }

    /**
     * Gets the normalized device coordinates of the pointer when an event is fired.
     * 
     * @param {PointerEvent} event The event being fired.
     * @returns {THREE.Vector2} The normalized device coordinates as vector2.
     */
    getPointerNDCPos(event) {
        const pointerNDC = ThreeUtils.getPointerNDC(this.canvas, event);
        return new THREE.Vector2(pointerNDC.x, pointerNDC.y);
    }

    /**
     * Creates a new vector object.
     * 
     * @param {WindowPointer} pointer The pointer that interacts with the objects.
     * @param {THREE.Raycaster} raycaster Raycasts the pointer to this set of controls.
     * @param {HTMLCanvasElement} canvas The HTML canvas where this object draws in.
     * @param {T} drawnObjData The data to store as state of drawn object.
     */
    constructor(pointer, raycaster, canvas, drawnObjData) {
        super();

        this.pointer = pointer;
        this.canvas = canvas;
        const context = this.canvas.getContext('2d');

        if (context == null) {
            throw Error('2D context is not supported.');
        }

        this.#context = context;
        this.#newDrawnObjData = drawnObjData;
        this.#interactor = pointer.createInteractor({ raycaster });

        this.#interactor.addEventListener('pointerdown', (event) => this.onPointerDown(event));
        this.#interactor.addEventListener('pointermove', (event) => this.onPointerMove(event));
        this.#interactor.addEventListener('pointerup', (event) => this.onPointerUp(event));
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#interactor.removeEventListener('pointermove', (event) => this.onPointerMove(event));
        this.#interactor.removeEventListener('pointerdown', (event) => this.onPointerDown(event));
        this.#interactor.removeEventListener('pointerup', (event) => this.onPointerUp(event));
    }

    /**
     * Clears anything that has been drawn into the 2d canvas context.
     */
    clearCanvas() {
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * Runs search query on R-Tree based on the object query drawn.
     * 
     * @param {RBush3D} tree The point cloud tree to query points from.
     * @param {T} objQuery The object to apply filtering query.
     * @returns {THREE.Vector3[]} The resulted filtered points.
     */
    queryPointsFromTree(tree, objQuery) {
        const camera = this.raycaster.camera;

        const { min, max } = VectorUtils.getCameraWorldFrustumMinMax(camera);

        const bboxToSearch = VectorUtils.vectorToBBox(min, max);

        const ptsToSearch = tree.search(bboxToSearch)
            .map((bbox) => new THREE.Vector3(bbox.minX, bbox.minY, bbox.minZ));

        const ptsToSearchNDC = ThreeUtils.worldCoordsToNDC([...ptsToSearch], camera);

        return this.filterPoints(ptsToSearch, ptsToSearchNDC, objQuery);
    }

    /**
     * Filters the points based on the object query drawn.
     * 
     * @protected
     * @param {THREE.Vector3[]} points The points to filter in world space.
     * @param {THREE.Vector3[]} ncdPoints The points to filter in ncd space.
     * @param {T} objQuery The object to apply filtering query.
     * @returns {THREE.Vector3[]} The resulted filtered points.
     * @abstract
     */
    filterPoints(points, ncdPoints, objQuery) {
        throw new Error('Not Implemented');
    }

    /**
     * Filters the points based on the object query drawn from buffer array.
     * 
     * @param {THREE.Vector3[]} buffer The buffer array to query points from.
     * @param {T} objQuery The object to apply filtering query.
     * @returns {THREE.Vector3[]} The resulted filtered points.
     * @abstract
     */
    queryPointsFromBuffer(buffer, objQuery) {
        throw new Error('Not Implemented');
    }

    /**
     * Triggered when pointer is moved on this object's base element.
     * 
     * @protected
     * @param {ScenePointerEvent} event The corresponding pointer event.
     * @returns {void}
     * @abstract
     */
    onPointerDown = (event) => {
        throw new Error('Not Implemented');
    };

    /**
     * Triggered when pointer is moved on this object's base element.
     * 
     * @protected
     * @param {ScenePointerEvent} event The corresponding pointer event.
     * @returns {void}
     * @abstract
     */
    onPointerMove = (event) => {
        throw new Error('Not Implemented');
    };

    /**
     * Triggered when pointer is moved on this object's base element.
     * 
     * @protected
     * @param {ScenePointerEvent} event The corresponding pointer event.
     * @returns {void}
     * @abstract
     */
    onPointerUp = (event) => {
        throw new Error('Not Implemented');
    };

    /**
     * Begins drawing in a 2d canvas context.
     * 
     * @param {THREE.Vector2} pointerCoords The current pointer coordinates.
     * @abstract
     * @protected
     */
    startDrawInContext(pointerCoords) {
        throw Error('Not Implemented');
    }

    /**
     * Updates the display of drarwing into the 2d canvas context.
     * 
     * @param {THREE.Vector2} pointerCoords The current pointer coordinates.
     * @abstract
     * @protected
     */
    updateDrawInContext(pointerCoords) {
        throw Error('Not Implemented');
    }

    /**
     * Aborts creating a geometry {@link T}.
     * 
     * @returns {boolean} returns true if successfully is invoked.
     * @abstract
     */
    abort() {
        throw new Error('Not Implemented');
    }

    /**
     *  Finishes creating a geometry {@link T}.
     * 
     * @returns {boolean} returns true if successfully is invoked.
     * @abstract
     */
    finish() {
        throw new Error('Not Implemented');
    }
}
