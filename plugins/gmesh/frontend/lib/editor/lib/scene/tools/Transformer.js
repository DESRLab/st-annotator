import * as THREE from 'three';

import { TransformControls } from 'sta/services/editor/core';

import { TransformerSettingsPaneController } from '../widgets';

import { SnapToGroundMesh } from './SnapToGroundMesh';

/* eslint-disable max-len */
/**
 * @typedef {import('sta/services/editor/base').WindowPointer} WindowPointer
 */

/**
 * @typedef {import('sta/services/editor/base').PaneControllerDataTypes} PaneControllerDataTypes
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('sta/services/editor/base').PaneControllerChangeEvent<P>} PaneControllerChangeEvent
 */

/**
 * @typedef {import('sta/services/editor/core').Axis} Axis
 */

/**
 * @typedef {import('sta/services/editor/core').DraggableBase} DraggableBase
 */

/**
 * @typedef {import('sta/services/editor/core').Transformation} Transformation
 */

/**
 * @typedef {import('../data').GroundMesh} GroundMesh
 */

/**
 * @typedef {import('../widgets').TransformerSettingsPaneControllerParams} TransformerSettingsPaneControllerParams
 */
/* eslint-enable max-len */

/**
 * Represents the local transform of a {@link THREE.Object3D}.
 * 
 * @typedef {Readonly<{
 *     position: Readonly<THREE.Vector3>;
 *     rotation: Readonly<THREE.Euler>;
 *     scale: Readonly<THREE.Vector3>;
 * }>} LocalTransform
 */

/**
 * Represents the event when an object has been transformed.
 * - `mode`: The type of transformation.
 * - `obj`: The object being transformed.
 * - `prevTransform`: The transform of the object prior to being transformed.
 * 
 * @template T The type of object to transform.
 * @typedef {{
 *     mode: string;
 *     obj: T;
 *     prevTransform: LocalTransform;
 * }} UpdateTransformEvent
 */

/**
 * Defines each event that can be dispatched by {@link Transformer}.
 * 
 * @template T The type of object to transform.
 * @typedef {object} TransformerEventMap
 * @property {{ obj: T }} begin The event when the transformation of an object has begun.
 * @property {{ obj: T }} abort The event when the transformation of an object has been aborted.
 * @property {UpdateTransformEvent<T>} checkpoint The event when an object has been transformed.
 */

/**
 * @typedef {object} TransformControlsParams
 * @property {WindowPointer} pointer The pointer that interacts with the objects.
 * @property {THREE.Raycaster} raycaster Raycasts the pointer to this set of controls.
 * @property {Record<Transformation, number>} priority The priority of each set of controls in
 * `pointer`.
 */

/**
 * Transforms an object using a gizmo.
 * 
 * @template T The type of object to transform.
 * @augments THREE.EventDispatcher<TransformerEventMap<T>>
 */
export class Transformer extends THREE.EventDispatcher {

    /**
     * A function which returns the `three.js` representation of an object.
     * 
     * @readonly
     * @type {(obj: T) => THREE.Object3D}
     */
    getObj3D;

    /**
     * Maintains the elevation of the object relative to the ground mesh.
     * 
     * @type {SnapToGroundMesh}
     */
    #snapper;

    /**
     * A reference ground mesh used to adjust the elevation during the
     * transformation process.
     * 
     * @type {?GroundMesh}
     */
    get groundMesh() { return this.#snapper.groundMesh; }

    set groundMesh(value) { this.#snapper.groundMesh = value; }

    /**
     * The DOM element representing this object.
     * 
     * @readonly
     * @type {HTMLDivElement}
     */
    dom;

    /**
     * The pose of the object at the beginning of the current transformation.
     * It is not modified during the transformation.
     * 
     * @type {?LocalTransform}
     */
    #startTransform = null;

    /**
     * Whether an object is selected.
     * 
     * @type {boolean}
     */
    get hasSelection() { return this.#startTransform != null; }

    /**
     * @type {?T}
     */
    #currentObj = null;

    /**
     * The object to be transformed, if any.
     * It is modified during the transformation.
     * 
     * @type {?T}
     */
    get selectedObj() { return this.#currentObj; }

    /**
     * Sets or unsets the stored state of an object.
     * 
     * @param {?T} obj If given, sets the state to begin transforming this object;
     * otherwise, unsets the state to finish transforming the current object.
     */
    #setState(obj) {
        if (obj == null) {
            this.#startTransform = null;

            this.#currentObj = null;
            this.#snapper.detach();
        } else {
            const obj3D = this.getObj3D(obj);

            this.#startTransform = {
                position: obj3D.position.clone(),
                rotation: obj3D.rotation.clone(),
                scale: obj3D.scale.clone(),
            };

            this.#currentObj = obj;
            this.#snapper.attach(obj3D);
        }
    }

    /**
     * @type {boolean}
     */
    #disabled = true;

    /**
     * `true` if this transformer is disabled; otherwise, `false.`
     * 
     * If set to `true` while an object is being transformed, aborts the process.
     * 
     * @type {boolean}
     */
    get disabled() { return this.#disabled; }

    set disabled(value) {
        if (this.#disabled !== value) {
            this.#disabled = value;

            if (this.#currentObj != null) {
                if (value) {
                    // enabled -> disabled: Unattach the gizmo
                    this.abort();
                } else {
                    // disabled -> enabled: Reattach the gizmo
                    this.select(this.#currentObj);
                }
            }

            this.render();
        }
    }

    /**
     * The controls for transforming the object.
     * 
     * @readonly
     * @type {TransformControls}
     */
    #controls;

    /**
     * Whether an object is being transformed.
     * 
     * @type {boolean}
     */
    get isTransforming() { return this.#controls.mode != null; }

    /**
     * Whether a set of controls is enabled.
     * 
     * @param {Transformation} transformation The type of transformation performed by the
     * set of controls.
     * @returns {boolean} `true` if the set of controls is enabled; otherwise, `false`.
     */
    isControlsEnabled(transformation) { return this.#controls.isControlsEnabled(transformation); }

    /**
     * Sets whether a set of controls is enabled.
     * 
     * @param {Transformation} transformation The type of transformation performed by the
     * set of controls.
     * @param {boolean} isEnabled If `true`, the given set of controls is enabled; otherwise,
     * it is disabled.
     */
    setControlsEnabled(transformation, isEnabled) {
        const currentObj = this.#currentObj;

        this.deselect();

        this.#controls.setControlsEnabled(transformation, isEnabled);

        if (currentObj != null) {
            this.select(currentObj);
        }

        this.render();
    }

    /**
     * Toggles whether a set of controls is enabled.
     * 
     * @param {Transformation} transformation The type of transformation performed by the
     * set of controls.
     */
    toggleControlsEnabled(transformation) {
        this.setControlsEnabled(transformation, !this.isControlsEnabled(transformation));
    }

    /**
     * Whether to disable moving the object along the `x` and `z` axis.
     * 
     *  @type {boolean}
     */
    get disableMoveXZ() { return this.#controls.disableMoveXZ; }

    set disableMoveXZ(value) { this.#controls.disableMoveXZ = value; }

    /**
     * Whether to disable moving and resizing the object along the `y` axis.
     * 
     *  @type {boolean}
     */
    get disableMoveResizeY() { return this.#controls.disableMoveResizeY; }

    set disableMoveResizeY(value) { this.#controls.disableMoveResizeY = value; }

    /**
     * Whether to disable resizing the object along any plane.
     * 
     * @type {boolean}
     */
    get disablePlaneResize() { return this.#controls.disablePlaneResize; }

    set disablePlaneResize(value) { this.#controls.disablePlaneResize = value; }

    /**
     * Whether to disable automatically adjusting the elevation of the object during
     * horizontal translation to maintain its elevation relative to the ground mesh.
     * 
     * @type {boolean}
     */
    get disableRelElevation() { return this.#snapper.disabled; }

    set disableRelElevation(value) { this.#snapper.disabled = value; }

    /**
     * Allows the user to update the settings of the gizmo.
     * 
     * @readonly
     * @type {TransformerSettingsPaneController}
     */
    #settingsInput;

    /**
     * Handles the event when the user action is changed.
     * 
     * @param {PaneControllerChangeEvent<TransformerSettingsPaneControllerParams>} event
     * The event to handle.
     */
    #onSettingsChange = (event) => {
        const { isTransformSelected } = event.outputData;

        this.setControlsEnabled('translate', isTransformSelected.translate);
        this.setControlsEnabled('rotate', isTransformSelected.rotate);
        this.setControlsEnabled('scale', isTransformSelected.scale);
    };

    #onControlsMouseDown = () => {
        if (this.disabled) return;

        const currentObj = this.#currentObj;
        if (currentObj == null) {
            throw new Error('No object being transformed');
        }

        this.#setState(currentObj);

        this.dispatchEvent({ type: 'begin', obj: currentObj });
    };

    #onControlsObjectChange = () => {
        if (this.disabled) return;

        const controls = this.#controls;
        if (controls.mode === 'translate' && !(controls.axis_or_plane ?? []).includes('Y')) {
            this.#snapper.snapToMesh();
        }
    };

    /**
     * @type {(event: { mode: Transformation }) => void}
     */
    #onControlsMouseUp = (event) => {
        if (this.disabled) return;

        this.#checkpoint(event.mode);
    };

    /**
     * Creates a new object transformer.
     * 
     * @param {WindowPointer} pointer The pointer that interacts with the set of controls.
     * @param {THREE.Raycaster} raycaster Raycasts the pointer to the set of controls.
     * @param {(obj: T) => THREE.Object3D} getObj3D A function which returns the `three.js`
     * representation of an object.
     * @param {?GroundMesh} groundMesh A reference ground mesh, which if provided, is used to
     * adjust the elevation during the transformation process.
     */
    constructor(pointer, raycaster, getObj3D, groundMesh = null) {
        super();

        this.getObj3D = getObj3D;
        this.#snapper = new SnapToGroundMesh(groundMesh);

        this.dom = document.createElement('div');
        {
            this.#settingsInput = TransformerSettingsPaneController.create(this.dom, {
                inputtedData: {
                    isTransformSelected: {
                        translate: true,
                        rotate: true,
                        scale: true,
                    },
                },
            });
        }

        this.#controls = TransformControls.create(
            pointer,
            raycaster,
            { rotate: 3, scale: 2, translate: 1 },
        );
        this.#controls.addEventListener('mouseDown', this.#onControlsMouseDown);
        this.#controls.addEventListener('objectChange', this.#onControlsObjectChange);
        this.#controls.addEventListener('mouseUp', this.#onControlsMouseUp);

        this.#settingsInput.bindOutputData(this.#onSettingsChange);
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#settingsInput.dispose();

        this.#controls.removeEventListener('mouseDown', this.#onControlsMouseDown);
        this.#controls.removeEventListener('objectChange', this.#onControlsObjectChange);
        this.#controls.removeEventListener('mouseUp', this.#onControlsMouseUp);
        this.#controls.dispose();
    }

    /**
     * Selects an object to transform.
     * 
     * @param {T} obj The object to transform.
     */
    select(obj) {
        if (this.hasSelection) {
            this.deselect();
        }

        this.#setState(obj);

        if (!this.disabled) {
            const obj3D = this.getObj3D(obj);
            this.#controls.attach(obj3D);
        }
    }

    /**
     * Rotates the heading of the object by 90 degrees anticlockwise.
     * 
     * This is a no-op if there is no selected object, or if it is being transformed.
     */
    rotateHeading() {
        if (!this.hasSelection) return;
        if (this.isTransforming) return;

        const currentObj = this.#currentObj;
        if (currentObj == null) {
            throw new Error('No object being transformed');
        }

        const obj3D = this.getObj3D(currentObj);
        obj3D.rotation.y += Math.PI / 2;
        [obj3D.scale.x, obj3D.scale.z] = [obj3D.scale.z, obj3D.scale.x];

        this.#checkpoint('rotate-heading');
    }

    /**
     * Saves the current transform of the object.
     * 
     * @param {Transformation | 'rotate-heading'} mode The transformation mode.
     */
    #checkpoint(mode) {
        const startTransform = this.#startTransform;
        if (startTransform == null) {
            throw new Error('No object being transformed');
        }

        const currentObj = this.#currentObj;
        if (currentObj == null) {
            throw new Error('No object being transformed');
        }

        const obj3D = this.getObj3D(currentObj);
        if (obj3D.position.equals(startTransform.position)
            && obj3D.rotation.equals(startTransform.rotation)
            && obj3D.scale.equals(startTransform.scale)) {
            // No transformation has been made, so this call is redundant
            return;
        }

        this.#controls.syncMatrix();

        this.#setState(currentObj);

        this.dispatchEvent({
            type: 'checkpoint',
            mode: mode,
            obj: currentObj,
            prevTransform: startTransform,
        });
    }

    /**
     * Deselects the object so it can no longer be transformed.
     * 
     * This is a no-op if there is no selected box.
     */
    deselect() {
        if (!this.hasSelection) return;

        this.abort();

        this.#controls.detach();

        this.#setState(null);
    }

    /**
     * Aborts the current ongoing transformation.
     * 
     * This is a no-op if no object is being transformed.
     */
    abort() {
        if (!this.isTransforming) return;

        const startTransform = this.#startTransform;
        if (startTransform == null) {
            throw new Error('No object being selected');
        }

        const currentObj = this.#currentObj;
        if (currentObj == null) {
            throw new Error('No object being transformed');
        }

        this.#controls.detach();

        const obj3D = this.getObj3D(currentObj);
        obj3D.position.copy(startTransform.position);
        obj3D.rotation.copy(startTransform.rotation);
        obj3D.scale.copy(startTransform.scale);

        if (!this.disabled) {
            this.#controls.attach(obj3D);
        }

        this.dispatchEvent({ type: 'abort', obj: currentObj });
    }

    /**
     * Gets the `three.js` object representing the active controls.
     * 
     * @returns {?THREE.Object3D} The requested object; `null` if there is no selected box,
     * or if the transformer is disabled.
     */
    getControls() {
        return (this.hasSelection && !this.disabled) ? this.#controls : null;
    }

    /**
     * Updates the DOM of this object to match its internal state.
     */
    render() {
        this.#settingsInput.updateState({
            inputtedData: {
                isTransformSelected: {
                    translate: this.isControlsEnabled('translate'),
                    rotate: this.isControlsEnabled('rotate'),
                    scale: this.isControlsEnabled('scale'),
                },
            },
            settings: {
                disabled: this.disabled,
            },
        });
    }

    /**
     * Sets whether to apply constraints to the controls, where applicable.
     * 
     * @param {boolean} value If `true`, applies the constraints.
     * @returns {this} This object.
     */
    setApplyConstraints(value) {
        this.#controls.setApplyConstraints(value);

        return this;
    }
}
