import { ThreeUtils } from 'sta/common/utils';
import { DraggableVertex } from 'sta/services/editor/core';

import { Controls } from './Controls';

/**
 * @typedef {import('three')} THREE
 */

/**
 * @template T 
 * @typedef {import('sta/services/editor/base').Dragger<T>} Dragger
 */

/**
 * @typedef {import('sta/services/editor/base').WindowPointer} WindowPointer
 */

/**
 * Used to perform translation of `three.js` objects along two axes.
 * 
 * @augments Controls<DraggableVertex>
 */
export class VertexTranslateControls extends Controls {

    /**
     * Creates the elements of this set of cpntrols.
     * 
     * @param {ReadonlyArray<THREE.Vector3>} vectorCoords The vertices 
     * element to be translate.
     * @returns {ReadonlyArray<DraggableVertex>} The requested elemetns.
     */
    static createElements(vectorCoords) {
        /**
         * @type {DraggableVertex[]}
         */
        const draggableElements = [];

        for (const vertex of vectorCoords) {
            const draggableVertex = new DraggableVertex(['X', 'Z'], ['X', 'Z'], vertex);
            draggableElements.push(draggableVertex);
        }

        return draggableElements;
    }

    /**
     * Creates a new object transformer.
     * 
     * @param {WindowPointer} pointer The pointer that interacts with the set of controls.
     * @param {THREE.Raycaster} raycaster Raycasts the pointer to the set of controls.
     * @param {number} priority The priority of the set of controls. 
     */
    constructor(pointer, raycaster, priority) {
        super(pointer, raycaster, priority);
    }

    /**
     * Applies the transform according to the position of the pointer.
     * 
     * @protected
     * @param {THREE.Vector3} initPointerWorldPos The position of the pointer in model space when
     * the element was clicked.
     * @param {THREE.Vector3} nextPointerWorldPos The current position of the pointer in model
     * space.
     */
    applyTransform(initPointerWorldPos, nextPointerWorldPos) {
        const { object, draggedElement, initObjectState, draggableGroup } = this;

        if (draggedElement == null || object == null
            || initObjectState == null || draggableGroup == null) return;

        let moveEnd = false;
        const initObjCoords = initObjectState.vectorCoords;

        const initPos = initPointerWorldPos.clone();
        if (!this.isAxisVisible('X')) initPos.x = 0;
        if (!this.isAxisVisible('Y')) initPos.y = 0;
        if (!this.isAxisVisible('Z')) initPos.z = 0;

        const newPos = nextPointerWorldPos.clone();
        if (!this.isAxisVisible('X')) newPos.x = 0;
        if (!this.isAxisVisible('Y')) newPos.y = 0;
        if (!this.isAxisVisible('Z')) newPos.z = 0;

        draggedElement.position.copy(newPos);

        if (initObjectState.isClosed) {
            const firstObjCoords = initObjCoords.at(0);
            if (firstObjCoords != null) {
                if (ThreeUtils.isVectorClose(initPointerWorldPos, firstObjCoords, 0.2)) {
                    moveEnd = true;
                }
            }
        }

        const newCoords = [];
        const elements = [...draggableGroup.objects];
        for (let i = 0; i < elements.length; i++) {
            if (i === (elements.length - 1) && moveEnd) {
                elements[i].position.copy(newPos);
            }
            newCoords.push(elements[i].position);
        }

        const obj3D = object.geo;
        obj3D.geometry.setFromPoints(newCoords);
        obj3D.geometry.getAttribute('position').needsUpdate = true;

        object.vectorCoords = newCoords;
    }

    /**
     * Updates the draggable elements to transform the vector object.
     * 
     * @protected
     * @returns {Iterable<DraggableVertex>} The updated element dragger.
     */
    createDraggables() {
        const object = this.object;
        if (object == null) {
            throw Error(`Not able to create draggbles from object ${object}`);
        }

        return VertexTranslateControls.createElements(object.vectorCoords);
    }
}
