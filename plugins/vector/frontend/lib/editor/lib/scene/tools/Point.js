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

export class PointCreator extends VectorCreator {

    /**
     * The type of this vector object being created.
     * 
     * @type {VectorType}
     */
    static vectorType = VectorType.POINT;

    /**
     * @type {VectorType}
     */
    get vectorType() { return PointCreator.vectorType; }

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
     * Begins drawing a point on 2d canvas context.
     */
    startDrawInContext() {
        if (!this.isCreating) return;

        const vertex = this.newVectorPixelVerices.at(0);

        const pointSize = this.strokeWidth * 5;

        if (vertex != null) {
            this.context.fillRect(vertex.x, vertex.y, pointSize, pointSize);
            this.context.fillStyle = this.strokeColor.getStyle();
        }
    }

    /**
     * Continues drawing a point on 2d canvas context while pointer is moving.
     * 
     * @param {THREE.Vector2} pointerCoords The current pointer coordinates.
     */
    updateDrawInContext(pointerCoords) {
        this.finish();
    }
}
