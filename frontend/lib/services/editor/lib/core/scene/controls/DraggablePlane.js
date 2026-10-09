import * as THREE from 'three';

import { DraggableElement } from './DraggableElement';

/**
 * @typedef {import('./DraggableBase').Axis} Axis
 */

/**
 * Represents a vertex in a {@link TransformControls} that can be dragged to resize an object.
 */
export class DraggablePlane extends DraggableElement {

    /**
     * The plane that can be dragged.
     * 
     * @type {THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>}
     */
    #plane;

    /**
     * This method is invoked whenever the state of this element is changed.
     */
    onStateChanged() {
        switch (this.state) {
            case 'none':
                this.#plane.material.color.setColorName('gray');
                break;
            case 'hovered':
                this.#plane.material.color.setColorName('lightgray');
                break;
            case 'dragged':
                this.#plane.material.color.setColorName('white');
                break;
            default:
                throw new Error(`Invalid state: ${this.state}`);
        }
    }

    /**
     * Displays the local `x` axis.
     * 
     * @type {THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>}
     */
    #axisXHelper;

    /**
     * Displays the local `y` axis.
     * 
     * @type {THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>}
     */
    #axisYHelper;

    /**
     * Tests whether the helper for an axis in {@link DraggablePlane#axes} is visible.
     * 
     * @param {Axis} axis The axis corresponding to the helper to set.
     * @returns {boolean} If `true`, the corresponding axis helper is visible; otherwise, `false`. 
     */
    getIsHelperVisible(axis) {
        if (!this.axes.includes(axis)) {
            throw new Error(`The given axis (${axis}) is not included in this element`);
        }

        if (axis === this.axes[0]) return this.#axisXHelper.visible;
        if (axis === this.axes[1]) return this.#axisYHelper.visible;

        throw new Error(`The axis helper for the given axis (${axis}) is missing`);
    }

    /**
     * Sets whether the helper for an axis in {@link DraggablePlane#axes} is visible.
     * 
     * @param {Axis} axis The axis corresponding to the helper to set.
     * @param {boolean} value If `true`, shows the corresponding axis helper; otherwise, `false`. 
     */
    setIsHelperVisible(axis, value) {
        if (!this.axes.includes(axis)) {
            throw new Error(`The given axis (${axis}) is not included in this element`);
        }

        if (axis === this.axes[0]) {
            this.#axisXHelper.visible = value;
        } else if (axis === this.axes[1]) {
            this.#axisYHelper.visible = value;
        } else {
            throw new Error(`The axis helper for the given axis (${axis}) is missing`);
        }
    }

    /**
     * Creates a new vertex in a {@link TransformControls} that can be dragged to resize an object.
     * 
     * @param {ReadonlyArray<Axis>} axes The axes along which transformation can take place when the
     * element is clicked and dragged, in terms of the model space of the object being transformed.
     * @param {ReadonlyArray<Axis>} draggableAxes The axes along which this element can be dragged,
     * in terms of the model space of the object being transformed.
     * @param {THREE.Vector3} position The coordinates of the plane in model space, where the set
     * of controls has unit dimensions.
     */
    constructor(axes, draggableAxes, position) {
        super(axes, draggableAxes, position);

        const planeMaterial = new THREE.MeshBasicMaterial({
            color: 'gray',
            transparent: true,
            opacity: 0.1,
            side: THREE.DoubleSide,
        });
        this.#plane = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.001), planeMaterial);
        this.add(this.#plane);

        const axisMaterial = new THREE.MeshBasicMaterial({
            color: 'yellow',
            transparent: true,
            opacity: 0.1,
            side: THREE.DoubleSide,
        });
        this.#axisXHelper = new THREE.Mesh(new THREE.BoxGeometry(1, 0.05, 0.001), axisMaterial);
        this.#axisYHelper = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1, 0.001), axisMaterial);
        this.add(this.#axisXHelper, this.#axisYHelper);
    }

    /**
     * Gets the closest axis in {@link DraggablePlane#axes} to the pointer.
     * 
     * @param {THREE.Raycaster} raycaster A raycaster that has already been calibrated to match the
     * current position of the pointer.
     * @returns {Axis} The requested axis.
     */
    getClosestModelAxis(raycaster) {
        const pointerWorldPos = this.getPointerWorldPos(raycaster);
        const worldToLocal = this.matrixWorld.clone().invert();
        const pointerLocalPos = pointerWorldPos.clone().applyMatrix4(worldToLocal);

        const [localX, localY] = this.axes;
        return Math.abs(pointerLocalPos.x) >= Math.abs(pointerLocalPos.y) ? localX : localY;
    }

    /**
     * Performs raycasting against this object.
     * 
     * @param {THREE.Raycaster} raycaster The caster of the ray.
     * @returns {THREE.Intersection[]} Refer to the `raycast` method of {@link THREE.Object3D}.
     */
    raycast(raycaster) {
        if (!this.visible) return [];

        const intersects = raycaster.intersectObject(this.#plane, false);

        if (intersects.length > 0) {
            intersects[0].object = this;
        }

        return intersects;
    }
}
