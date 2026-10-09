import * as THREE from 'three';

/**
 * Enumerates each axis in 3-D space.
 * 
 * @typedef {'X' | 'Y' | 'Z'} Axis
 */

/**
 * Enumerates each state a {@link DraggableBase} can be in.
 * 
 * @typedef {'none' | 'hovered' | 'dragged'} DraggableElementState
 */

/**
 * Represents a draggable element in a {@link TransformControls}.
 * 
 * @abstract
 */
export class DraggableBase extends THREE.Object3D {

    /**
     * The axes along which transformation can take place when this element is clicked and dragged,
     * in terms of the model space of the object being transformed.
     * 
     * @readonly
     * @type {ReadonlyArray<Axis>}
     */
    axes;

    /**
     * @type {DraggableElementState}
     */
    #state;

    /**
     * The state of this element.
     * 
     * @type {DraggableElementState}
     */
    get state() { return this.#state; }

    set state(value) {
        if (this.state !== value) {
            this.#state = value;
            this.onStateChanged();
        }
    }

    /**
     * This method is invoked whenever the state of this element is changed.
     */
    onStateChanged() {}

    /**
     * Creates a new draggable element.
     * 
     * @param {ReadonlyArray<Axis>} axes The axes along which transformation can take place when the
     * element is clicked and dragged, in terms of the model space of the object being transformed.
     */
    constructor(axes) {
        super();

        this.axes = axes;
    }

    /**
     * Gets the coordinates of the pointer in world space while this element is being dragged.
     * 
     * @param {THREE.Raycaster} raycaster A raycaster that has already been calibrated to match the
     * current position of the pointer.
     * @returns {THREE.Vector3} The requested coordinates.
     * @abstract
     */
    getPointerWorldPos(raycaster) { throw new Error('Not implemented'); }

    /**
     * Performs raycasting against this object.
     * 
     * @param {THREE.Raycaster} raycaster The caster of the ray.
     * @returns {THREE.Intersection[]} Refer to the `raycast` method of {@link THREE.Object3D}.
     * @abstract
     */
    raycast(raycaster) { throw new Error('Not implemented'); }
}
