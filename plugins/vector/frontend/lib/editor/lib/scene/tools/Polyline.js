import { VectorType } from '../../../../label/lib';

import { VectorCreator } from './VectorCreator';

/**
 * @typedef {import('three')} THREE
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
 * @typedef {import('sta/services/editor/base').CoordinateFormat} CoordinateFormat
 */

export class PolylineCreator extends VectorCreator {

    /**
     * The type of this vector object being created.
     * 
     * @type {VectorType}
     */
    static vectorType = VectorType.POLYLINE;

    /**
     * @type {VectorType}
     */
    get vectorType() { return PolylineCreator.vectorType; }

    /**
     * Creates a new vector object.
     * 
     * @param {CoordinateFormat} format The configuration of the project.
     * @param {WindowPointer} pointer The pointer that interacts with the objects.
     * @param {THREE.Raycaster} raycaster Raycasts the pointer to this set of controls.
     * @param {HTMLCanvasElement} canvas The HTML canvas where this object draws in.
     */
    constructor(format, pointer, raycaster, canvas) {
        super(format, pointer, raycaster, canvas, false);
    }

    /**
     * Begins drawing a polygon on 2d canvas context.
     * 
     * @protected
     */
    startDrawInContext() {
        if (!this.isCreating) return;

        this.context.beginPath();
        this.context.strokeStyle = this.strokeColor.getStyle();
        this.context.lineWidth = this.strokeWidth;

        const vertices = this.newVectorPixelVerices;

        for (const vertex of vertices) {
            this.context.lineTo(vertex.x, vertex.y);
        }

        this.context.stroke();
    }

    /**
     * Continues drawing a polygon on 2d canvas context while pointer is moving.
     * 
     * @protected
     * @param {THREE.Vector2} pointerCoords The current pointer coordinates.
     */
    updateDrawInContext(pointerCoords) {
        if (!this.isCreating) return;

        this.clearCanvas();

        this.context.lineTo(pointerCoords.x, pointerCoords.y);

        this.context.stroke();
    }
}
