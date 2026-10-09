import * as THREE from 'three';

import { MathUtils, ThreeUtils } from '../../../../../../common/lib/utils';

import { SceneObjectsGroup } from '../../../base';

/**
 * @template T
 * @typedef {import('../../../base').Dragger<T>} Dragger
 */

/**
 * @template T
 * @typedef {import('../../../base').DraggerEventMap<T>} DraggerEventMap
 */

/**
 * @typedef {import('../../../base').ScenePointerEvent} ScenePointerEvent
 */

/**
 * @typedef {import('../../../base').WindowPointer} WindowPointer
 */

/**
 * @typedef {import('./DraggableBase').Axis} Axis
 */

/**
 * @typedef {import('./DraggableBase').DraggableBase} DraggableBase
 */

/**
 * Defines each event that can be dispatched by {@link Controls}.
 * 
 * @typedef {object} ControlsEventMap
 * @property {{}} mouseDown The event when a pointer (mouse/touch) becomes active.
 * @property {{}} mouseUp The event when a pointer (mouse/touch) is no longer active.
 * @property {{}} objectChange The event when the controlled 3D object is changed.
 */

/**
 * Used to perform a type of transformation on `three.js` objects.
 * 
 * @augments {THREE.Object3D<THREE.Object3DEventMap & ControlsEventMap>}
 * @abstract
 */
export class Controls extends THREE.Object3D {

    /**
     * Contains the elements which can be dragged to apply the transformation.
     * 
     * @protected
     * @readonly
     * @type {SceneObjectsGroup<DraggableBase>}
     */
    draggableGroup;

    /**
     * Interacts with the draggable elements in the scene.
     * 
     * @protected
     * @readonly
     * @type {Dragger<DraggableBase>}
     */
    elementDragger;

    /**
     * Raycasts the pointer to the rendered scene.
     * 
     * @type {THREE.Raycaster}
     */
    get raycaster() { return this.elementDragger.raycaster; }

    /**
     * @type {boolean}
     */
    #enabled = true;

    /**
     * Whether or not the set of controls is enabled.
     * 
     * If the set of controls is disabled, it remains visible but cannot be interacted with.
     * 
     * @type {boolean}
     */
    get enabled() { return this.#enabled; }

    set enabled(value) {
        if (this.enabled !== value) {
            this.#enabled = value;

            // this.updateVisibility();
        }
    }

    /**
     * @type {boolean}
     */
    #showX = true;

    /**
     * Whether or not the `x`-axis helper should be visible. Default is `true`.
     * 
     * @type {boolean}
     */
    get showX() { return this.#showX; }

    set showX(value) {
        if (this.showX !== value) {
            this.#showX = value;

            this.updateVisibility();
        }
    }

    /**
     * @type {boolean}
     */
    #showY = true;

    /**
     * Whether or not the `y`-axis helper should be visible. Default is `true`.
     * 
     * @type {boolean}
     */
    get showY() { return this.#showY; }

    set showY(value) {
        if (this.showY !== value) {
            this.#showY = value;

            this.updateVisibility();
        }
    }

    /**
     * @type {boolean}
     */
    #showZ = true;

    /**
     * Whether or not the `z`-axis helper should be visible. Default is `true`.
     * 
     * @type {boolean}
     */
    get showZ() { return this.#showZ; }

    set showZ(value) {
        if (this.showZ !== value) {
            this.#showZ = value;

            this.updateVisibility();
        }
    }

    /**
     * Whether or not the elements along an axis are visible.
     * 
     * @param {Axis} axis The axis to test.
     * @returns {boolean} `true` if the elements along the given axis are visible;
     * otherwise, `false`.
     */
    isAxisVisible(axis) {
        switch (axis) {
            case 'X':
                return this.showX;
            case 'Y':
                return this.showY;
            case 'Z':
                return this.showZ;
            default:
                throw new Error(`Invalid axis: ${axis}`);
        }
    }

    /**
     * Updates the visibility of the components of the set of controls.
     * 
     * @protected
     * @returns {this} This object.
     */
    updateVisibility() {
        for (const element of this.draggableGroup.objects) {
            element.visible = element.axes.every((axis) => this.isAxisVisible(axis));
        }

        return this;
    }

    /**
     * @type {?THREE.Object3D}
     */
    #object = null;

    /**
     * The 3D object being controlled.
     * 
     * @type {?THREE.Object3D}
     */
    get object() { return this.#object; }

    set object(value) {
        if (this.object !== value) {
            this.#object = value;

            this.elementDragger.draggedObj = null;
        }
    }

    /**
     * The draggable element that is being hovered over.
     * 
     * @type {?DraggableBase}
     */
    get hoveredElement() {
        const hoveredObj = this.elementDragger.hoveredObj;
        if (hoveredObj == null || !this.draggableGroup.has(hoveredObj)) return null;

        return hoveredObj;
    }

    /**
     * The draggable element that is being dragged.
     * 
     * @type {?DraggableBase}
     */
    get draggedElement() {
        const draggedObj = this.elementDragger.draggedObj;
        if (draggedObj == null || !this.draggableGroup.has(draggedObj)) return null;

        return draggedObj;
    }

    /**
     * The position of the pointer in model space when the element being dragged was clicked.
     * 
     * @type {?THREE.Vector3}
     */
    #initPointerLocalPos = null;

    /**
     * @type {?THREE.Object3D}
     */
    #initObjectState = null;

    /**
     * The state of the 3D object being controlled in world space when it was first clicked.
     * 
     * @type {?THREE.Object3D}
     */
    get initObjectState() { return this.#initObjectState; }

    /**
     * Whether or not dragging is currently performed.
     * 
     * @type {boolean}
     */
    get dragging() {
        return this.object != null && this.draggedElement != null
            && this.#initPointerLocalPos != null && this.#initObjectState != null;
    }

    /**
     * The axis or plane along which the transformation is taking place, or `null` if the
     * set of controls is not being used.
     * 
     * @type {?ReadonlyArray<Axis>}
     */
    get axis_or_plane() { return this.dragging ? (this.draggedElement?.axes ?? null) : null; }

    /**
     * The difference between the size of the set of controls and that of the 3D object being
     * controlled. The size is defined as the element-wise absolute value of the scale.
     * 
     * @type {THREE.Vector3}
     */
    get sizeOffset() { return new THREE.Vector3(); }

    /**
     * The difference between the scale of the set of controls and that of the 3D object being
     * controlled.
     * 
     * @type {THREE.Vector3}
     */
    get scaleOffset() {
        const { scale, sizeOffset } = this;
        const s1 = MathUtils.sign1;

        return new THREE.Vector3(s1(scale.x), s1(scale.y), s1(scale.z)).multiply(sizeOffset);
    }

    /**
     * @type {(event: DraggerEventMap<DraggableBase>['dragin']) => void}
     */
    #onPickerDragStart = (event) => {
        if (this.object == null) return;

        const draggedElement = event.object;
        if (!this.draggableGroup.has(draggedElement)) return;

        this.setInitState(draggedElement);

        this.dispatchEvent({ type: 'mouseDown' });
    };

    /**
     * @type {(event: DraggerEventMap<DraggableBase>['dragout']) => void}
     */
    #onPickerDragEnd = (event) => {
        if (this.object == null) return;

        const draggedElement = event.object;
        if (!this.draggableGroup.has(draggedElement)) return;

        this.unsetInitState();

        this.dispatchEvent({ type: 'mouseUp' });
    };

    /**
     * @type {(event: ScenePointerEvent) => void}
     */
    #onPointerMove = () => {
        this.updateState();
    };

    /**
     * Creates a new group that can be passed into {@link Controls#constructor}.
     * 
     * @param {Iterable<DraggableBase>} draggableElements The elements which can be dragged to
     * apply the transformation.
     * @returns {SceneObjectsGroup<DraggableBase>} A group that contains the given elements.
     */
    static createGroup(draggableElements) {
        return new SceneObjectsGroup({
            objects: draggableElements,
            // This is a dummy function that gets overwritten when the
            // set of controls is constructed
            raycastFunc: (obj, raycaster) => obj.raycast(raycaster),
        });
    }

    /**
     * Creates a new set of controls to perform a type of transformation.
     * 
     * @param {SceneObjectsGroup<DraggableBase>} draggableGroup Contains the elements which
     * can be dragged to apply the transformation.
     * @param {Dragger<DraggableBase>} elementDragger Drags the elements in `draggableGroup`.
     * @param {Iterable<THREE.Object3D>} visualElements The elements that cannot be dragged
     * but are displayed alongside the draggable ones.
     */
    constructor(draggableGroup, elementDragger, visualElements = []) {
        super();

        this.visible = false;
        this.add(...draggableGroup.objects, ...visualElements);

        this.draggableGroup = draggableGroup;
        this.draggableGroup.raycastFunc = (obj, raycaster) => (
            (this.visible && this.enabled) ? obj.raycast(raycaster) : []);

        this.elementDragger = elementDragger;
        this.elementDragger.addEventListener('dragin', this.#onPickerDragStart);
        this.elementDragger.addEventListener('dragout', this.#onPickerDragEnd);
        this.elementDragger.addEventListener('pointermove', this.#onPointerMove);
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.elementDragger.removeEventListener('dragin', this.#onPickerDragStart);
        this.elementDragger.removeEventListener('dragout', this.#onPickerDragEnd);
        this.elementDragger.removeEventListener('pointermove', this.#onPointerMove);
        this.elementDragger.dispose();
    }

    /**
     * Sets the state when the element being dragged was clicked.
     * 
     * This is a no-op if no object is being transformed.
     * 
     * @protected
     * @param {DraggableBase} element The element being dragged.
     * @returns {this} This object.
     */
    setInitState(element) {
        if (this.object == null) return this;

        const raycaster = this.raycaster;
        const initPointerWorldPos = element.getPointerWorldPos(raycaster);
        const worldToLocal = this.matrixWorld.clone().invert();

        this.#initPointerLocalPos = initPointerWorldPos.applyMatrix4(worldToLocal);
        this.#initObjectState = this.object.clone();

        return this;
    }

    /**
     * Unets the state when the element being dragged was clicked.
     * 
     * @protected
     * @returns {this} This object.
     */
    unsetInitState() {
        this.#initPointerLocalPos = null;
        this.#initObjectState = null;

        return this;
    }

    /**
     * Updates the state of the set of controls as well as the object being transformed.
     * 
     * This is a no-op if the set of controls is disabled.
     * 
     * @protected
     * @returns {this} This object.
     */
    updateState() {
        if (!this.enabled) return this;

        const { object, draggedElement, hoveredElement } = this;

        if (object != null && draggedElement != null
            && this.#initPointerLocalPos != null && this.#initObjectState != null
        ) {  // this.dragging
            const nextPointerWorldPos = draggedElement.getPointerWorldPos(this.raycaster);

            const worldToLocal = this.matrixWorld.clone().invert();

            const initPointerLocalPos = this.#initPointerLocalPos;
            const nextPointerLocalPos = nextPointerWorldPos.clone().applyMatrix4(worldToLocal);

            // Update transformation matrix
            this.adjustMatrix(initPointerLocalPos, nextPointerLocalPos);

            object.position.copy(this.position);
            object.rotation.copy(this.rotation);
            object.scale.copy(this.scale.clone().sub(this.scaleOffset));
            object.updateMatrixWorld();

            // Make the gizmo selectable regardless of scale
            const minScale = Math.min(...object.scale.toArray());
            ThreeUtils.setRaycasterPointsThreshold(this.raycaster, minScale * 0.1);

            this.dispatchEvent({ type: 'objectChange' });
        }

        for (const element of this.draggableGroup.objects) {
            if (element === draggedElement) {
                element.state = 'dragged';
            } else if (element === hoveredElement) {
                element.state = 'hovered';
            } else {
                element.state = 'none';
            }
        }

        return this;
    }

    /**
     * Updates the transform according to the position of the pointer.
     * 
     * @protected
     * @param {THREE.Vector3} initPointerLocalPos The position of the pointer in model space when
     * the element was clicked.
     * @param {THREE.Vector3} nextPointerLocalPos The current position of the pointer in model
     * space.
     * @abstract
     */
    adjustMatrix(initPointerLocalPos, nextPointerLocalPos) {
        throw new Error('Not implemented');
    }

    /**
     * Updates the transform to match that of the current object being transformed.
     * 
     * @returns {this} This object.
     */
    syncMatrix() {
        const object = this.object;
        if (object == null) return this;

        this.position.copy(object.position);
        this.rotation.copy(object.rotation);

        // Set scale first before adding offset since its sign is based on the scale
        // of this object rather than that of the transformed object
        this.scale.copy(object.scale).add(this.scaleOffset);

        this.updateMatrixWorld();

        return this;
    }

    /**
     * Sets the 3D object that should be transformed and ensures the controls UI is visible.
     * 
     * @param {THREE.Object3D} object The 3D object that should be transformed.
     * @returns {this} This object.
     */
    attach(object) {
        this.object = object;

        this.syncMatrix();

        this.updateVisibility();
        this.visible = true;

        return this;
    }

    /**
     * Removes the current 3D object from the controls and ensures the helper UI is invisible.
     * 
     * @returns {this} This object.
     */
    detach() {
        this.object = null;
        this.visible = false;

        return this;
    }
}
