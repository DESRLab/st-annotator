import _ from 'lodash';
import * as THREE from 'three';

import { Controls } from './Controls';
import { ResizeControls } from './ResizeControls';
import { RotateControls } from './RotateControls';
import { TranslateControls } from './TranslateControls';

/**
 * @typedef {import('../../../base').WindowPointer} WindowPointer
 */

/**
 * @typedef {import('./Controls').ControlsEventMap} ControlsEventMap
 */

/**
 * @typedef {import('./DraggableBase').Axis} Axis
 */

/**
 * @typedef {'translate' | 'rotate' | 'scale'} Transformation
 */

/**
 * Defines each event that can be dispatched by {@link TransformControls}.
 * 
 * @typedef {object} TransformControlsEventMap
 * @property {{ mode: Transformation }} mouseDown The event when a pointer (mouse/touch)
 * becomes active.
 * @property {{ mode: Transformation }} mouseUp The event when a pointer (mouse/touch)
 * is no longer active.
 * @property {{}} objectChange The event when the controlled 3D object is changed.
 */

/**
 * @typedef {{
 *     translate: TranslateControls;
 *     rotate: RotateControls;
 *     scale: ResizeControls;
 * }} CompositeControls
 */

/**
 * Used to perform various transformations of `three.js` objects.
 * 
 * @augments {THREE.Object3D<THREE.Object3DEventMap & TransformControlsEventMap>}
 */
export class TransformControls extends THREE.Object3D {

    /**
     * The pointer that is used to interact with the scene.
     * 
     * @readonly
     * @type {WindowPointer}
     */
    pointer;

    /**
     * A set of controls for each type of transformation.
     * 
     * @readonly
     * @type {CompositeControls}
     */
    #controls;

    /**
     * Whether a set of controls is enabled.
     * 
     * @param {Transformation} transformation The type of transformation performed by the
     * set of controls.
     * @returns {boolean} `true` if the set of controls is enabled; otherwise, `false`.
     */
    isControlsEnabled(transformation) { return this.#controls[transformation].enabled; }

    /**
     * Sets whether a set of controls is enabled.
     * 
     * @param {Transformation} transformation The type of transformation performed by the
     * set of controls.
     * @param {boolean} isEnabled If `true`, the given set of controls is enabled; otherwise,
     * it is disabled.
     */
    setControlsEnabled(transformation, isEnabled) {
        this.#controls[transformation].enabled = isEnabled;

        this.#updateVisibility();
    }

    /**
     * @type {boolean}
     */
    #disableMoveXZ = false;

    /**
     * Whether to disable moving the bounding box along the `x` and `z` axis.
     * 
     *  @type {boolean}
     */
    get disableMoveXZ() { return this.#disableMoveXZ; }

    set disableMoveXZ(value) {
        if (this.#disableMoveXZ !== value) {
            this.#disableMoveXZ = value;

            this.#updateVisibility();
        }
    }

    /**
     * @type {boolean}
     */
    #disableMoveResizeY = false;

    /**
     * Whether to disable moving and resizing the bounding box along the `y` axis.
     * 
     *  @type {boolean}
     */
    get disableMoveResizeY() { return this.#disableMoveResizeY; }

    set disableMoveResizeY(value) {
        if (this.#disableMoveResizeY !== value) {
            this.#disableMoveResizeY = value;

            this.#updateVisibility();
        }
    }

    /**
     * Whether to disable resizing the bounding box along any plane.
     * 
     *  @type {boolean}
     */
    get disablePlaneResize() { return !this.#controls.scale.enablePlane; }

    set disablePlaneResize(value) { this.#controls.scale.enablePlane = !value; }

    /**
     * Updates the visibility of each set of controls.
     * 
     * @returns {this} This object.
     */
    #updateVisibility() {
        for (const [mode, controls] of Object.entries(this.#controls)) {
            controls.visible = controls.enabled && controls.object != null;

            switch (mode) {
                case 'translate':
                    controls.showX = !this.disableMoveXZ;
                    controls.showY = !this.disableMoveResizeY;
                    controls.showZ = !this.disableMoveXZ;
                    break;
                case 'rotate':
                    controls.showX = false;
                    controls.showY = true;
                    controls.showZ = false;
                    break;
                case 'scale':
                    controls.showX = true;
                    controls.showY = !this.disableMoveResizeY;
                    controls.showZ = true;
                    break;
                default:
                    throw new Error(`Invalid mode: ${mode}`);
            }
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

            if (value == null) {
                for (const controls of Object.values(this.#controls)) {
                    controls.detach();
                }
            } else {
                for (const controls of Object.values(this.#controls)) {
                    controls.attach(value);
                }
            }

            this.#updateVisibility();
        }
    }

    /**
     * The type of transformation being applied, if any.
     * 
     * @type {?Transformation}
     */
    get mode() {
        for (const [mode, controls] of Object.entries(this.#controls)) {
            if (mode === 'translate' || mode === 'rotate' || mode === 'scale') {
                if (controls.dragging && controls.axis_or_plane != null) {
                    return mode;
                }
            } else {
                throw new Error(`Unhandled controls type: ${mode}`);
            }
        }

        return null;
    }

    /**
     * The axis or plane along which the transformation is taking place, or `null` if
     * no transformation is taking place.
     * 
     * @type {?ReadonlyArray<Axis>}
     */
    get axis_or_plane() {
        for (const controls of Object.values(this.#controls)) {
            if (controls.dragging && controls.axis_or_plane != null) {
                return controls.axis_or_plane;
            }
        }

        return null;
    }

    /**
     * Creates a new set of controls to transform an object.
     * 
     * @param {WindowPointer} pointer The pointer that interacts with the set of controls.
     * @param {THREE.Raycaster} raycaster Raycasts the pointer to the set of controls.
     * @param {Record<Transformation, number>} priority The priority of each set of controls in
     * `pointer`. These priority values should be unique.
     * @returns {TransformControls} The newly created set of controls.
     */
    static create(pointer, raycaster, priority) {
        const elements = {
            translate: TranslateControls.createElements(),
            rotate: RotateControls.createElements(),
            scale: ResizeControls.createElements(),
        };

        const groupItems = _.mapValues(elements,
            ({ draggableElements }, key) => ({
                group: Controls.createGroup(draggableElements),
                // @ts-expect-error
                priority: priority[key],
            }));

        const elementDragger = pointer.createDragController({
            groups: Object.values(groupItems),
            raycaster: raycaster,
        });

        return new TransformControls({
            translate: new TranslateControls(
                groupItems.translate.group,
                elementDragger,
                elements.translate.visualElements,
            ),
            rotate: new RotateControls(
                groupItems.rotate.group,
                elementDragger,
                elements.rotate.visualElements,
            ),
            scale: new ResizeControls(
                groupItems.scale.group,
                elementDragger,
                elements.scale.visualElements,
            ),
        });
    }

    /**
     * Creates a new set of controls to perform various transformation operations.
     * 
     * @protected
     * @param {CompositeControls} controls A set of controls for each type of transformation.
     */
    constructor(controls) {
        super();

        this.#controls = controls;

        for (const [mode, ctrls] of Object.entries(this.#controls)) {
            /** @type {THREE.Object3D<THREE.Object3DEventMap & ControlsEventMap>} */
            const ctrls_ = ctrls;

            if (mode === 'translate' || mode === 'rotate' || mode === 'scale') {
                ctrls_.addEventListener('mouseDown', (e) => {
                    if (this.object == null) return;

                    this.dispatchEvent({ mode, ...e });
                });
                ctrls_.addEventListener('mouseUp', (e) => {
                    if (this.object == null) return;

                    this.dispatchEvent({ mode, ...e });
                });
                ctrls_.addEventListener('objectChange', (e) => {
                    this.syncMatrix();

                    this.dispatchEvent(e);
                });

                this.add(ctrls);
            } else {
                throw new Error(`Unhandled controls type: ${mode}`);
            }
        }

        this.#updateVisibility();
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        for (const [mode, ctrls] of Object.entries(this.#controls)) {
            if (mode === 'translate' || mode === 'rotate' || mode === 'scale') {
                // TODO: Also remove event listeners

                // Assumes that this object owns the newly created controls
                // This is ensured by making the constructor protected
                ctrls.dispose();

                this.remove(ctrls);
            } else {
                throw new Error(`Unhandled controls type: ${mode}`);
            }
        }
    }

    /**
     * Updates the transform to match that of the current object being transformed.
     * 
     * @returns {this} This object.
     */
    syncMatrix() {
        for (const controls of Object.values(this.#controls)) {
            controls.syncMatrix();
        }

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

        return this;
    }

    /**
     * Removes the current 3D object from the controls and ensures the helper UI is invisible.
     * 
     * @returns {this} This object.
     */
    detach() {
        this.object = null;

        return this;
    }

    /**
     * Sets whether to apply constraints to the controls, where applicable.
     * 
     * @param {boolean} value If `true`, applies the constraints.
     * @returns {this} This object.
     */
    setApplyConstraints(value) {
        this.#controls.translate.snapToAxis = value;
        this.#controls.scale.clipToAspect = value;

        return this;
    }
}
