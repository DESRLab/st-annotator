import * as THREE from 'three';

import { ThreeUtils } from 'sta/common/utils';

import { VectorUtils } from '../../utils';

import { SelectionCurator } from '../SelectionCurator';

/**
 * @typedef {import('sta/services/editor/base').ScenePointerEvent} ScenePointerEvent
 */

/**
 * @typedef {import('sta/services/editor/base').WindowPointer} WindowPointer
 */

/**
 * @typedef {import('../SelectionCurator').VertexGeo} VertexGeo 
 */

/**
 * @typedef {import('../SelectionCurator').ParametricGeo} ParametricGeo
 */

/**
 * Represents the stages of drawing a complete vector object.
 * 
 * @typedef {'begin' | 'pause' | 'abort' | 'end'} DrawStage 
 */

/**
 * Creates parametric-based geometry to query selection of points.
 * 
 * meant to be used for painting action.
 * 
 * @abstract
 * @augments {SelectionCurator<ParametricGeo>}
 */
export class SelectionParametricCurator extends SelectionCurator {
    /**
     * Represents the dom element of this object.
     * Displays a circular div.
     * 
     * @readonly
     * @type {HTMLElement}
     */
    cursor;

    /**
     * the diameter of this parametric object.
     * 
     * @type {number}
     */
    #diameter = 40;

    /**
     * @type {number}
     */
    get diameter() { return this.#diameter; }

    set diameter(value) {
        if (this.diameter !== value) {
            this.#diameter = value;
            this.render();
        }
    }

    /**
     * @type {boolean}
     */
    #isPainting = false;

    /**
     * `true` if the cursor object representing the parametric
     * object has triggered for painting.
     * 
     * @type {boolean}
     */
    get isPainting() { return this.#isPainting; }

    set isPainting(value) {
        if (this.#isPainting !== value) {
            this.#isPainting = value;
        }
    }

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

            this.render();
        }
    }

    /**
     * @type {boolean}
     */
    get isCreating() { return this.isPainting; }

    /**
     * Updates how the cursor element to be displayed and positioned.
     * 
     * @protected
     * @param {THREE.Vector2} pointerPixelPos The pointer position on window.
     */
    updateCursorPos(pointerPixelPos) {
        throw new Error('Not Implemented');
    }

    /**
     * Updates how the data of this object query to be stored.
     * 
     * @protected
     * @param {DrawStage} drawStage The stage of drawing of the object query
     * @param {?{centerNDC: THREE.Vector2}} data The data to update the object query.
     */
    updateObjQueryState(drawStage, data) {
        throw new Error('Not Implemented');
    }

    /**
     * Creates a new parametric-based object query creator.
     * 
     * @param {WindowPointer} pointer The pointer that interacts with the objects.
     * @param {THREE.Raycaster} raycaster Raycasts the pointer to this set of controls.
     * @param {HTMLCanvasElement} canvas The HTML canvas where this object draws in.
     * @param {HTMLElement} cursor The html element representing a cursor shape.
     */
    constructor(pointer, raycaster, canvas, cursor) {
        /**
         * @type {ParametricGeo}
         */
        const defaultObjData = { center: new THREE.Vector2(), radius: 0 };

        super(pointer, raycaster, canvas, defaultObjData);

        this.cursor = cursor;
    }

    /**
     * Filters the points based on the object query drawn.
     * 
     * @protected
     * @param {THREE.Vector3[]} points The points to filter in world space.
     * @param {THREE.Vector3[]} ncdPoints The points to filter in ncd space.
     * @param {ParametricGeo} objQuery The object to apply filtering query.
     * @returns {THREE.Vector3[]} The resulted filtered points.
     */
    filterPoints(points, ncdPoints, objQuery) {
        return points.filter((_, i) => VectorUtils.isPointInCircle(ncdPoints[i], objQuery));
    }

    /**
     * Filters the points based on the object query drawn from buffer array.
     * 
     * @param {THREE.Vector3[]} buffer The buffer array to query points from.
     * @param {ParametricGeo} objQuery The object to apply filtering query.
     * @returns {THREE.Vector3[]} The resulted filtered points.
     */
    queryPointsFromBuffer(buffer, objQuery) {
        const camera = this.raycaster.camera;
        const bufferNDC = ThreeUtils.worldCoordsToNDC([...buffer], camera);

        return buffer.filter((_, i) => VectorUtils.isPointInCircle(bufferNDC[i], objQuery));
    }

    /**
     * Triggered when the pointer is pressed down on this object's base element.
     * 
     * @protected
     * @param {ScenePointerEvent} event The corresponding pointer event.
     */
    onPointerDown = (event) => {
        if (!this.enabled) return;
        if (event.buttons !== 1) return;

        this.isPainting = true;

        this.startDrawInContext(this.getPointerNDCPos(event));
    };

    /**
     * Triggered when pointer is moved on this object's base element.
     * 
     * @protected
     * @param {ScenePointerEvent} event The corresponding pointer event.
     */
    onPointerMove = (event) => {
        if (!this.enabled) return;
        this.isPainting = (event.buttons === 1);

        const pointerPixelPos = this.getPointerPixelPos(event);
        const pointerCenterNDCPos = this.getPointerNDCPos(event);
        this.updateCursorPos(pointerPixelPos);

        if (this.isPainting) {
            this.updateDrawInContext(pointerPixelPos);

            this.updateObjQueryState('begin', { centerNDC: pointerCenterNDCPos });

            this.dispatchEvent({ type: 'begin', objQuery: this.newDrawnObjData });
        }
    };

    /**
     * Triggered when pointer is moved on this object's base element.
     * 
     * @protected
     * @abstract
     * @param {ScenePointerEvent} event The corresponding pointer event.
     */
    onPointerUp = (event) => {
        if (!this.enabled) return;
        if (event.buttons !== 0) return;

        this.isPainting = false;

        this.endDrawInContext();

        const pointerCenterNDCPos = this.getPointerNDCPos(event);

        this.updateObjQueryState('pause', { centerNDC: pointerCenterNDCPos });

        this.dispatchEvent({ type: 'pause', objQuery: this.newDrawnObjData });
    };

    /**
     * Aborts creating a vector object.
     * 
     * @returns {boolean} returns true if successfully is invoked.
     */
    abort() {
        this.clearCanvas();

        if (!this.isPainting) return false;

        this.render();

        this.updateObjQueryState('abort', null);

        this.dispatchEvent({ type: 'abort', objQuery: this.newDrawnObjData });

        return true;
    }

    /**
     *  Finishes creating using this tool.
     * 
     * @returns {boolean} returns true if successfully is invoked.
     */
    finish() {
        this.clearCanvas();

        if (!this.isPainting) return false;

        this.render();

        this.updateObjQueryState('end', null);

        this.dispatchEvent({ type: 'end', objQuery: this.newDrawnObjData });

        return true;
    }

    /**
     * finishes painting on 2d canvas context.
     * 
     * @protected
     * @abstract
     */
    endDrawInContext() {
        throw new Error('Not Implemented');
    }

    /**
     * Specifies how to render the cursor hmtl element 
     * representing this parametric object query.
     * 
     * @protected
     * @abstract
     */
    render() {
        throw new Error('Not Implemented');
    }
}
