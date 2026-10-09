import * as THREE from 'three';

import { ThreeUtils } from 'sta/common/utils';

import { GeoUtils } from '../../utils';

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
 * @typedef {import('sta/services/editor/base').CoordinateFormat} CoordinateFormat
 */

/**
 * @typedef {import('../../../../label/lib').VectorType} VectorType
 */

/**
 * Represents the stages of drawing a complete vector object.
 * 
 * @typedef {'begin' | 'resume' | 'end'} DrawStage 
 */

/**
 * @typedef {{
 *     verticesPixelPos: THREE.Vector2[];
 *     verticesWorldPos: THREE.Vector3[];
 * }} VectorVerticesData
 */

/**
 * Defines each event that can be dispatched by {@link VectorCreator}.
 * 
 * @typedef {object} VectorCreatorEventMap
 * @property {{ vertices: ReadonlyArray<THREE.Vector3> }} begin The event when the creation of
 * a vector object just started.
 * @property {{ vertices: ReadonlyArray<THREE.Vector3> }} resume The event when the creation of
 * a vector object is already started and still on going.
 * @property {{ vertices: ReadonlyArray<THREE.Vector3> }} abort The event when the creation of
 * a vector object is aborted.
 * @property {{ vertices: ReadonlyArray<THREE.Vector3> }} end The event when the creation of
 * a vector object is completed.
 */

/**
 * Creates a vector object along the `x`-`z` plane.
 * 
 * @augments THREE.EventDispatcher<VectorCreatorEventMap>
 */
export class VectorCreator extends THREE.EventDispatcher {

    /**
     * The type of this tool.
     * 
     * @type {VectorType}
     * @abstract
     */
    get vectorType() { throw new Error('Not implemented'); }

    /**
     * The canvas where this object renders on.
     * 
     * @readonly
     * @type {HTMLCanvasElement}
     */
    canvas;

    /**
     * 
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
     * The pointer that is used to interact with the scene.
     * 
     * @readonly
     * @type {WindowPointer}
     */
    pointer;

    /**
     * 
     * @readonly
     * @type {CoordinateFormat}
     */
    format;

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

            if (!value) {
                this.abort();
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
     * @type {number}
     */
    #strokeWidth = 3;

    /**
     * The line width of vector object while creating the object.
     * 
     * @type {number}
     */
    get strokeWidth() { return this.#strokeWidth; }

    set strokeWidth(value) {
        if (value != null) {
            if (this.#strokeWidth !== value) {
                this.#strokeWidth = value;
            }
        }
    }

    /**
     * Whether the vector object being created is closed form shape.
     * 
     * @type {boolean}
     */
    #isClosed;

    /**
     * @returns {boolean} `true` if the vector object being created is closed form shape.
     */
    get isClosed() { return this.#isClosed; }

    /**
     * Gets the position of the pointer in world space by raycasting it a horizontal plane.
     * 
     * @param {number} elevation The elevation of the horizontal plane in world space.
     * @param {number} fallbackDistance If the direction of the camera is parallel to the plane,
     * this parameter specifies how far the pointer should be from the camera.
     * @returns {THREE.Vector3} The requested position. If the direction of the camera is parallel
     * to the plane, instead returns a position that is `fallbackDistance` in front of the camera.
     */
    getPointerWorldPos(elevation = 0, fallbackDistance = 10) {
        const { camera, ray } = this.raycaster;

        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -elevation);
        const planeIntersect = ray.intersectPlane(plane, new THREE.Vector3());
        if (planeIntersect != null) return planeIntersect;

        const localPos = ray.origin.clone()
            .add(ray.direction.clone().multiplyScalar(fallbackDistance));
        const fallbackPos = camera.localToWorld(localPos);
        return fallbackPos;
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
     * The vector object undergoing creation and related metadata.
     * 
     * @type {VectorVerticesData}
     */
    #newVectorData = { verticesPixelPos: [], verticesWorldPos: [] };

    /**
     * Whether a vector object is being created.
     * 
     * @type {boolean}
     */
    get isCreating() { return this.newVectorWorldVertices.length > 0; }

    /**
     * The vertices of vector object undergoing creation, if any.
     * 
     * @type {ReadonlyArray<THREE.Vector3>}
     */
    get newVectorWorldVertices() { return this.#newVectorData.verticesWorldPos; }

    /**
     * The vertices of vector object undergoing creation, if any.
     * 
     * @type {ReadonlyArray<THREE.Vector2>}
     */
    get newVectorPixelVerices() { return this.#newVectorData.verticesPixelPos; }

    /**
     * 
     * @param {DrawStage} drawStage The stage of drawing of the vector object being created.
     * @param {?{
     *      vertexWorldPos: THREE.Vector3,
     *      vertexPixelPos: THREE.Vector2
     * }} data If given
     * it updates the state of vertices of this 
     * vector object being created.
     */
    #updateVectorVertices(drawStage, data) {
        let { verticesWorldPos, verticesPixelPos } = this.#newVectorData;

        if (data === null) {
            verticesPixelPos = [];
            verticesWorldPos = [];
        } else {
            const { vertexWorldPos, vertexPixelPos } = data;

            switch (drawStage) {
                case 'begin':
                    verticesPixelPos = new Array(vertexPixelPos);
                    verticesWorldPos = new Array(vertexWorldPos);
                    break;
                case 'resume':
                    if (!this.#isCoordsRepeated(vertexWorldPos)) {
                        verticesPixelPos.push(vertexPixelPos);
                        verticesWorldPos.push(vertexWorldPos);
                    }
                    break;
                case 'end':
                    if (this.isClosed) {
                        if (verticesPixelPos[0].equals(vertexPixelPos)) {
                            verticesPixelPos.push(vertexPixelPos);
                            verticesWorldPos.push(vertexWorldPos);
                        }
                    }
                    break;
                default:
                    verticesPixelPos = [];
                    verticesWorldPos = [];
            }
        }

        this.#newVectorData = { verticesPixelPos, verticesWorldPos };
    }

    /**
     * Whether a coordinates already exist in the polygon vertices.
     * 
     * @param {THREE.Vector3} coords The newly registered coordinates 
     * from pointer position.
     * @returns {boolean} Returns true if the coordinate exists in the vertices list.
     */
    #isCoordsRepeated(coords) {
        return ThreeUtils.isCoordinatesInArray(this.newVectorWorldVertices, coords);
    }

    /**
     * @returns {boolean} True if number of registered vertices are valid 
     * based on vector obejct type.
     */
    isValidVector() {
        const { vectorType, newVectorWorldVertices, format } = this;
        const vertices = newVectorWorldVertices.map((vector) => format.toDatabaseCoords(vector));
        return GeoUtils.isValidVector(vertices, vectorType);
    }

    /**
     * Creates a new vector object.
     * 
     * @param {CoordinateFormat} format The configuration of the project.
     * @param {WindowPointer} pointer The pointer that interacts with the objects.
     * @param {THREE.Raycaster} raycaster Raycasts the pointer to this set of controls.
     * @param {HTMLCanvasElement} canvas The HTML canvas where this object draws in.
     * @param {boolean} isClosed Whether the vector object being created is closed form.
     */
    constructor(format, pointer, raycaster, canvas, isClosed) {
        super();
        this.canvas = canvas;
        const context = this.canvas.getContext('2d');

        if (context == null) {
            throw Error('2D context is not supported.');
        }

        this.#isClosed = isClosed;
        this.#context = context;
        this.pointer = pointer;
        this.format = format;

        this.#interactor = pointer.createInteractor({ raycaster });

        this.#interactor.addEventListener('pointerdown', this.#onPointerDown);
        this.#interactor.addEventListener('pointermove', this.#onPointerMove);
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#interactor.removeEventListener('pointermove', this.#onPointerMove);
        this.#interactor.removeEventListener('pointerdown', this.#onPointerDown);
    }

    /**
     * Triggered when the pointer is pressed down on this object's base element.
     * 
     * @param {ScenePointerEvent} event The corresponding pointer event.
     */
    #onPointerDown = (event) => {
        const { enabled, context } = this;
        if (!enabled) return;
        if (context === null) return;
        if (event.button !== 0) return;

        const pointerPixelPos = this.getPointerPixelPos(event);
        const pointerWorldPos = this.getPointerWorldPos();
        this.#updateState(pointerWorldPos, pointerPixelPos);
        this.startDrawInContext();
    };

    /**
     * Triggered when pointer is moved on this object's base element.
     * 
     * @param {ScenePointerEvent} event The corresponding pointer event.
     */
    #onPointerMove = (event) => {
        const { enabled, isCreating } = this;
        if (!enabled || !isCreating) return;

        const pointerCoords = this.getPointerPixelPos(event);
        this.startDrawInContext();
        this.updateDrawInContext(pointerCoords);
    };

    /**
     * Begins creating a bbox.
     * 
     * @param {THREE.Vector3} worldCoords The pointer world coordinates.
     * @param {THREE.Vector2} pixelCoords The pointer pixel coordinates.
     */
    #updateState(worldCoords, pixelCoords) {
        const { enabled, isCreating } = this;
        if (!enabled) return;

        const drawStage = isCreating ? 'resume' : 'begin';

        /**
         * @type {?{ 
         *      vertexWorldPos: THREE.Vector3,
         *      vertexPixelPos: THREE.Vector2
         * }}
         */
        let data = null;

        data = {
            vertexWorldPos: worldCoords,
            vertexPixelPos: pixelCoords,
        };

        this.#updateVectorVertices(drawStage, data);

        this.dispatchEvent({ type: drawStage, vertices: this.newVectorWorldVertices });
    }

    /** 
     * Finishes creating a vector object.
     * 
     */
    #endState() {
        const { enabled, isCreating, newVectorPixelVerices, newVectorWorldVertices } = this;
        if (!enabled || !isCreating) return;

        /**
         * @type {?{ 
         *      vertexWorldPos: THREE.Vector3,
         *      vertexPixelPos: THREE.Vector2
         * }}
         */
        let data = null;

        data = {
            vertexWorldPos: newVectorWorldVertices[0],
            vertexPixelPos: newVectorPixelVerices[0],
        };

        this.#updateVectorVertices('end', data);
    }

    /**
     * Aborts creating a vector object.
     * 
     * @returns {boolean} returns true if successfully is invoked.
     */
    abort() {
        this.clearCanvas();

        if (!this.isCreating) return false;

        this.#updateVectorVertices('end', null);

        const { verticesWorldPos } = this.#newVectorData;
        this.dispatchEvent({ type: 'abort', vertices: verticesWorldPos });

        return true;
    }

    /**
     *  Finishes creating a vector object.
     * 
     * @returns {boolean} returns true if successfully is invoked.
     */
    finish() {
        if (!this.isCreating) return false;

        this.#endState();

        if (this.isValidVector()) {
            const { verticesWorldPos } = this.#newVectorData;

            this.clearCanvas();

            this.#updateVectorVertices('end', null);

            this.dispatchEvent({ type: 'end', vertices: verticesWorldPos });

            return true;
        }
        return this.abort();
    }

    /**
     * @abstract
     * @protected
     */
    startDrawInContext() {
        throw Error('Not Implemented');
    }

    /**
     * 
     * @param {THREE.Vector2} pointerCoords The current pointer coordinates.
     * @abstract
     * @protected
     */
    updateDrawInContext(pointerCoords) {
        throw Error('Not Implemented');
    }

    clearCanvas() {
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
}
