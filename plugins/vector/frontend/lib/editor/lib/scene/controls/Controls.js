import * as THREE from 'three';

import { SceneObjectsGroup } from 'sta/services/editor/base';

/**
 * @template T 
 * @typedef {import('sta/services/editor/base').Dragger<T>} Dragger
 */

/**
 * @template T 
 * @typedef {import('sta/services/editor/base').DraggerEventMap<T>} DraggerEventMap
 */

/**
 * @template T 
 * @typedef {import('sta/services/editor/base').ScenePointerEvent} ScenePointerEvent
 */

/**
 * @typedef {import('sta/services/editor/base').WindowPointer} WindowPointer
 */

/**
 * @typedef {import("sta/services/editor/core").DraggableBase} DraggableBase 
 */

/**
 * @typedef {import("sta/services/editor/core").Axis} Axis 
 */

/**
 * @typedef {import('../data').ReadonlyLabelVector} ReadOnlyLabelVector
 */

/**
 * @typedef {import('../data/views').Line} Line
 */

/**
 * @typedef {import('../data/views').Point} Point 
 */

/**
 * @template {Line | Point} G
 * @typedef {import('../data/views').VectorGeo<G>} VectorGeo
 */

/**
 * Defines each event that can be dispatched by {@link Controls}.
 * 
 * @typedef {object} ControlsEventMap
 * @property {{}} mouseDown The event when a pointer (mouse/touch) becomes active.
 * @property {{}} mouseUp The event when a pointer (mouse/touch) is no longer active.
 * @property {{ obj: VectorGeo<Line | Point> }} objectChange The event when the controlled
 * 3D object is changed.
 */

/**
 * Used to perform a type of transformation on `three.js` objects.
 * 
 * @template {DraggableBase} T
 * @augments {THREE.Object3D<THREE.Object3DEventMap & ControlsEventMap>}
 * @abstract
 */
export class Controls extends THREE.Object3D {

    /**
     * 
     * @readonly
     * @type {WindowPointer}
     */
    pointer;

    /**
     * @readonly
     * @type {THREE.Raycaster}
     */
    raycaster;

    /**
     * 
     * @readonly
     * @type {number}
     */
    priority;

    /**
     * The position of the pointer in model space when the element being dragged was clicked.
     * 
     * @type {?THREE.Vector3}
     */
    #initPointerWorldPos = null;

    /**
     * 
     * @type {?VectorGeo<Line | Point>}
     */
    #initObjectState = null;

    /**
     * The state of the 3D object being controlled in world space when it was first clicked.
     * 
     * @type {?VectorGeo<Line | Point>}
     */
    get initObjectState() { return this.#initObjectState; }

    /**
     * Contains the elements which can be dragged to apply the transformation.
     * 
     * @type {?SceneObjectsGroup<T>}
     */
    #draggableGroup = null;

    /**
     * @type {?SceneObjectsGroup<T>}
     */
    get draggableGroup() { return this.#draggableGroup; }

    /**
     * @param {SceneObjectsGroup<T>} value The draggables.
     */
    set draggableGroup(value) {
        if (this.draggableGroup !== value) {
            this.clear();

            this.#draggableGroup = value;

            if (value != null) {
                this.add(...value.objects);
                this.#draggableGroup.raycastFunc = (obj, raycaster) => (
                    (this.visible && this.enabled) ? obj.raycast(raycaster) : []);
            }
        }
    }

    /**
     * Interacts with the draggable elements in the scene.
     * 
     * @type {?Dragger<T>}
     */
    #elementDragger = null;

    /**
     * @type {?Dragger<T>}
     */
    get elementDragger() { return this.#elementDragger; }

    /**
     * @param {Dragger<T>} value The dragger.
     */
    set elementDragger(value) {
        if (this.elementDragger !== value) {
            this.#elementDragger?.removeEventListener('dragin', this.#onPickerDragStart);
            this.#elementDragger?.removeEventListener('dragout', this.#onPickerDragEnd);
            this.#elementDragger?.removeEventListener('pointermove', this.#onPointerMove);

            this.#elementDragger = value;

            this.#elementDragger?.addEventListener('dragin', this.#onPickerDragStart);
            this.#elementDragger?.addEventListener('dragout', this.#onPickerDragEnd);
            this.#elementDragger?.addEventListener('pointermove', this.#onPointerMove);
        }
    }

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
    #showY = false;

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
        if (this.draggableGroup == null) return this;

        for (const element of this.draggableGroup.objects) {
            element.visible = element.axes.every((axis) => this.isAxisVisible(axis));
        }

        return this;
    }

    /**
     * @type {?VectorGeo<Line | Point>}
     */
    #object = null;

    /**
     * The 3D object being controlled.
     * 
     * @type {?VectorGeo<Line | Point>}
     */
    get object() { return this.#object; }

    set object(value) {
        this.#object = value;

        if (value == null) {
            this.#initObjectState = null;
            this.detach();
        } else {
            this.#initObjectState = value.clone();
            this.#setUp();
            this.attach(value.asObject3D());
        }

        if (this.elementDragger != null) {
            this.elementDragger.draggedObj = null;
        }
    }

    /**
     * Sets up the configuration of the set of controls.
     */
    #setUp() {
        const { pointer, raycaster, priority } = this;

        const draggableElements = this.createDraggables();
        const draggableGroup = Controls.createGroup(draggableElements);

        this.draggableGroup = draggableGroup;
        this.elementDragger = pointer.createDragController({
            groups: [{ group: draggableGroup, priority: priority }],
            raycaster: raycaster,
        });
    }

    /**
     * Updates the draggable elements to transform the vector object.
     * 
     * @protected
     * @abstract
     * @returns {Iterable<T>} The updated element dragger.
     */
    createDraggables() {
        throw Error('Not Implemented');
    }

    /**
     * The draggable element that is being hovered over.
     * 
     * @type {?T}
     */
    get hoveredElement() {
        const hoveredObj = this.elementDragger?.hoveredObj;
        if (hoveredObj == null || !this.draggableGroup?.has(hoveredObj)) return null;

        return hoveredObj;
    }

    /**
     * The draggable element that is being dragged.
     * 
     * @type {?T}
     */
    get draggedElement() {
        const draggedObj = this.elementDragger?.draggedObj;
        if (draggedObj == null || !this.draggableGroup?.has(draggedObj)) return null;

        return draggedObj;
    }

    /**
     * Whether or not dragging is currently performed.
     * 
     * @type {boolean}
     */
    get dragging() {
        return this.object != null && this.draggedElement != null;
    }

    /**
     * The axis or plane along which the transformation is taking place, or `null` if the
     * set of controls is not being used.
     * 
     * @type {?ReadonlyArray<Axis>}
     */
    get axis_or_plane() { return this.dragging ? (this.draggedElement?.axes ?? null) : null; }

    /**
     * @type {(event: DraggerEventMap<T>['dragin']) => void}
     */
    #onPickerDragStart = (event) => {
        if (this.object == null) return;

        const draggedElement = event.object;
        if (!this.draggableGroup?.has(draggedElement)) return;

        this.setInitState(draggedElement);

        this.dispatchEvent({ type: 'mouseDown' });
    };

    /**
     * @type {(event: DraggerEventMap<T>['dragout']) => void}
     */
    #onPickerDragEnd = (event) => {
        if (this.object == null) return;

        const draggedElement = event.object;
        if (!this.draggableGroup?.has(draggedElement)) return;

        this.unsetInitState();

        this.dispatchEvent({ type: 'mouseUp' });
    };

    /**
     * @type {(event: ScenePointerEvent<any>) => void}
     */
    #onPointerMove = () => {
        this.updateState();
    };

    /**
     * Creates a new group that can be passed into {@link Controls#constructor}.
     * 
     * @template {DraggableBase} D draggable elements.
     * @param {Iterable<D>} draggableElements The elements which can be dragged to
     * apply the transformation.
     * @returns {SceneObjectsGroup<D>} A group that contains the given elements.
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
     * Creates a new object transformer.
     * 
     * @param {WindowPointer} pointer The pointer that interacts with the set of controls.
     * @param {THREE.Raycaster} raycaster Raycasts the pointer to the set of controls.
     * @param {number} priority The priority of the set of controls. 
     */
    constructor(pointer, raycaster, priority) {
        super();

        this.pointer = pointer;
        this.raycaster = raycaster;
        this.priority = priority;
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.elementDragger?.dispose();
    }

    /**
     * Sets the state when the element being dragged was clicked.
     * 
     * This is a no-op if no object is being transformed.
     * 
     * @protected
     * @param {T} element The element being dragged.
     * @returns {this} This object.
     */
    setInitState(element) {
        if (this.object == null) return this;

        const raycaster = this.raycaster;
        this.#initPointerWorldPos = element.getPointerWorldPos(raycaster);
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
        this.#initPointerWorldPos = null;
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

        const { object, draggedElement, hoveredElement, draggableGroup } = this;

        if (object != null && draggedElement != null
            && this.#initPointerWorldPos != null
            && draggableGroup != null) {
            const nextPointerWorldPos = draggedElement.getPointerWorldPos(this.raycaster);
            const initPointerWorldPos = this.#initPointerWorldPos.clone();
            this.applyTransform(initPointerWorldPos, nextPointerWorldPos);

            this.dispatchEvent({ type: 'objectChange', obj: object });

            for (const element of draggableGroup.objects) {
                if (element === draggedElement) {
                    element.state = 'dragged';
                } else if (element === hoveredElement) {
                    element.state = 'hovered';
                } else {
                    element.state = 'none';
                }
            }
        }
        return this;
    }

    /**
     * Sets the transform according to the position of the pointer.
     * 
     * @protected
     * @param {THREE.Vector3} initPointerWorldPos The position of the pointer in model space when
     * the element was clicked.
     * @param {THREE.Vector3} nextPointerWorldPos The current position of the pointer in model
     * space.
     */
    applyTransform(initPointerWorldPos, nextPointerWorldPos) {
        throw new Error('Not implemented');
    }

    /**
     * Sets the 3D object that should be transformed and ensures the controls UI is visible.
     * 
     * @param {THREE.Object3D} object The 3D object that should be transformed.
     * @returns {this} This object.
     */
    attach(object) {
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
        this.visible = false;

        return this;
    }
}
