import * as THREE from 'three';

import { DraggableElement } from './DraggableElement';

/**
 * @typedef {import('./DraggableBase').Axis} Axis
 */

/**
 * Represents a vertex in a {@link TransformControls} that can be dragged to resize an object.
 */
export class DraggableVertex extends DraggableElement {

    /**
     * The vertex that can be dragged.
     * 
     * @readonly
     * @type {THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>}
     */
    #points;

    /**
     * This method is invoked whenever the state of this element is changed.
     */
    onStateChanged() {
        switch (this.state) {
            case 'none':
                this.#points.material.color.setColorName('gray');
                break;
            case 'hovered':
                this.#points.material.color.setColorName('lightgray');
                break;
            case 'dragged':
                this.#points.material.color.setColorName('white');
                break;
            default:
                throw new Error(`Invalid state: ${this.state}`);
        }
    }

    /**
     * Creates a new vertex in a {@link TransformControls} that can be dragged to resize an object.
     * 
     * @param {ReadonlyArray<Axis>} axes The axes along which transformation can take place when the
     * element is clicked and dragged, in terms of the model space of the object being transformed.
     * @param {ReadonlyArray<Axis>} draggableAxes The axes along which this element can be dragged,
     * in terms of the model space of the object being transformed.
     * @param {THREE.Vector3} position The coordinates of the vertex in model space, where the set
     * of controls has unit dimensions.
     */
    constructor(axes, draggableAxes, position) {
        super(axes, draggableAxes, position);

        const pointsBuffer = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3()]);
        const pointsMaterial = new THREE.PointsMaterial({
            color: 'gray',
            size: 10,
            sizeAttenuation: false,
        });
        const points = new THREE.Points(pointsBuffer, pointsMaterial);
        this.#points = points;
        this.add(points);
    }

    /**
     * Performs raycasting against this object.
     * 
     * @param {THREE.Raycaster} raycaster The caster of the ray.
     * @returns {THREE.Intersection[]} Refer to the `raycast` method of {@link THREE.Object3D}.
     */
    raycast(raycaster) {
        if (!this.visible) return [];

        const intersects = raycaster.intersectObject(this.#points, false);

        if (intersects.length > 0) {
            intersects[0].object = this;
        }

        return intersects;
    }
}
