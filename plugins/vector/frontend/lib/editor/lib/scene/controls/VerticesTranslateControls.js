import { ThreeUtils } from 'sta/common/utils';

import { DraggablePlane } from './DraggablePlane';
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
 * @typedef {import('sta/services/editor/core').Axis} Axis
 */

/**
 * Used to perform translation of `three.js` objects along two axes.
 * 
 * @augments Controls<DraggablePlane>
 */
export class VerticesTranslateControls extends Controls {

    /**
     * Creates the elements pf this set of cpntrols.
     * 
     * @param {ReadonlyArray<THREE.Vector3>} vectorCoords The vertices of vector object 
     * in threejs coordinates system.
     * @returns {ReadonlyArray<DraggablePlane>} The requested elemetns.
     */
    static createElements(vectorCoords) {
        /**
         * @type {DraggablePlane[]}
         */
        const draggableElements = [];

        const { min, max } = ThreeUtils.findMinMax(vectorCoords);
        const minCoords = min.clone();
        const maxCoords = max.clone();

        const width = maxCoords.clone().x - minCoords.clone().x;
        const height = maxCoords.clone().z - minCoords.clone().z;

        const centerCoords = maxCoords.clone().add(minCoords.clone()).divideScalar(2);

        const draggablePlane = new DraggablePlane(['X', 'Z'], ['X', 'Z'], centerCoords, height, width);
        draggableElements.push(draggablePlane);

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
        const { object, draggedElement, initObjectState } = this;

        if (draggedElement == null || object == null || initObjectState == null) return;

        const newPos = nextPointerWorldPos.clone();
        if (!this.isAxisVisible('X')) newPos.x = 0;
        if (!this.isAxisVisible('Y')) newPos.y = 0;
        if (!this.isAxisVisible('Z')) newPos.z = 0;

        draggedElement.position.copy(newPos);

        const deltaWorld = nextPointerWorldPos.clone().sub(initPointerWorldPos);

        if (!this.isAxisVisible('X')) deltaWorld.x = 0;
        if (!this.isAxisVisible('Y')) deltaWorld.y = 0;
        if (!this.isAxisVisible('Z')) deltaWorld.z = 0;

        const oldCoords = initObjectState.vectorCoords;
        const newCoords = [];

        for (const vertex of oldCoords) {
            newCoords.push(vertex.clone().add(deltaWorld));
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
     * @returns {Iterable<DraggablePlane>} The updated element dragger.
     */
    createDraggables() {
        const object = this.object;
        if (object == null) {
            throw Error('No Object has been selected to create draggables');
        }

        return VerticesTranslateControls.createElements(object.vectorCoords);
    }

}
