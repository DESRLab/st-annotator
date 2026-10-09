import * as THREE from 'three';

import { max } from 'mathjs';

import { SelectionParametricCurator } from './ParametricQueryCreator';

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
 * @typedef {import('../SelectionCurator').ToolTypes} ToolTypes
 */

/**
 * @typedef {import("../SelectionCurator").ParametricGeo} ParametricGeo
 */

/**
 * @typedef {import('./ParametricQueryCreator').DrawStage} DrawStage
 */

export class BrushCurator extends SelectionParametricCurator {
    /**
     * @type {THREE.Vector2[]} 
     */
    #centers = [];

    /**
     * The type of this object query.
     * 
     * @type {ToolTypes}
     */
    static objQueryType = 'brush';

    /**
     * @type {ToolTypes}
     */
    get toolType() { return BrushCurator.objQueryType; }

    /**
     * @type {number}
     */
    #hue = 0.5;

    /**
     * The hue number of this object's painting color effect.
     * 
     * @type {number}
     */
    get hue() { return this.#hue; }

    set hue(value) {
        if (value != null) {
            if (this.#hue !== value) {
                this.#hue = value;
            }
        }
    }

    /**
     * Updates how the cursor element to be displayed and positioned.
     * 
     * @protected
     * @param {THREE.Vector2} pointerPixelPos The pointer position on window.
     */
    updateCursorPos(pointerPixelPos) {
        this.cursor.style.top = `${pointerPixelPos.y - this.diameter / 2}px`;
        this.cursor.style.left = `${pointerPixelPos.x - this.diameter / 2}px`;
    }

    /**
     * Updates how the data of this object query to be stored.
     * 
     * @protected
     * @param {DrawStage} drawStage The stage of drawing of the object query
     * @param {?{centerNDC: THREE.Vector2}} data The data to update the object query.
     */
    updateObjQueryState(drawStage, data) {
        let objDrawnData = this.newDrawnObjData;
        const { canvas, diameter } = this;

        /**
         * @type {ParametricGeo}
         */
        const defaultObjData = { center: new THREE.Vector2(), radius: 0 };

        if (data === null) {
            objDrawnData = defaultObjData;
        } else {
            const rect = canvas.getBoundingClientRect();
            const radiusNDC = diameter / max(rect.width, rect.height);

            if (drawStage === 'begin' || drawStage === 'pause') {
                objDrawnData.center = data.centerNDC;
                objDrawnData.radius = radiusNDC;
            } else {
                objDrawnData = defaultObjData;
            }
        }

        this.newDrawnObjData = objDrawnData;
    }

    /**
     * Creates a new circular brush object query creator.
     * 
     * @param {WindowPointer} pointer The pointer that interacts with the objects.
     * @param {THREE.Raycaster} raycaster Raycasts the pointer to this set of controls.
     * @param {HTMLCanvasElement} canvas The HTML canvas where this object draws in.
     */
    constructor(pointer, raycaster, canvas) {
        const cursor = document.createElement('div');
        cursor.className = 'brush';

        super(pointer, raycaster, canvas, cursor);
    }

    /**
     * Begins drawing in a 2d canvas context.
     * 
     * @protected
     * @param {THREE.Vector2} pointerCoords The current pointer coordinates.
     */
    startDrawInContext(pointerCoords) {
        const { isPainting, strokeColor, hue, diameter } = this;
        if (!isPainting) return;

        const rgbStyle = strokeColor.getStyle().slice(4, -1).split(',');
        const rgbaStyle = `rgba(${rgbStyle[0]},${rgbStyle[1]},${rgbStyle[2]},${hue})`;

        this.context.lineJoin = this.context.lineCap = 'round';
        this.context.fillStyle = rgbaStyle;

        this.context.beginPath();
        this.context
            .arc(pointerCoords.x, pointerCoords.y, diameter / 2, 0, 2 * Math.PI);
        this.context.fill();
    }

    /**
     * Continues painting on 2d canvas context while pointer is moving.
     * 
     * @protected
     * @param {THREE.Vector2} pointerPos The current brush 
     * center pixel coordinates.
     */
    updateDrawInContext(pointerPos) {
        const { isPainting, diameter } = this;
        if (!isPainting) return;

        this.clearCanvas();

        const radius = diameter / 2;
        this.#centers.push(pointerPos);

        const centers = this.#centers;

        for (const center of centers) {
            this.context.beginPath();
            this.context.arc(center.x, center.y, radius, 0, 2 * Math.PI);
            this.context.fill();
        }
    }

    /**
     * finishes painting on 2d canvas context.
     * 
     * @protected
     * @abstract
     */
    endDrawInContext() {
        this.clearCanvas();
        this.#centers = [];
    }

    /**
     * updates the view of this object's cursor element.
     */
    render() {
        this.cursor.hidden = !this.enabled;
        this.cursor.style.height = `${this.diameter}px`;
        this.cursor.style.width = `${this.diameter}px`;
    }
}
