import * as THREE from 'three';

import { ThreeUtils } from 'sta/common/utils';

import { TransformerSettingsPaneController } from '../widgets';
import { GeoUtils } from '../../utils';

import { TransformControls } from './TransformControls';

/* eslint-disable max-len */
/**
 * @typedef {import('sta/services/editor/base').WindowPointer} WindowPointer
 */

/**
 * @typedef {import('sta/services/editor/base').EditorConfig} EditorConfig
 */

/**
 * @typedef {import('sta/services/editor/base').PaneControllerDataTypes} PaneControllerDataTypes
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('sta/services/editor/base').PaneControllerChangeEvent<P>} PaneControllerChangeEvent
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
 * @typedef {import('../data').ReadonlyLabelVector} ReadonlyLabelVector
 */

/**
 * @typedef {import('../widgets').TransformerSettingsPaneControllerParams} TransformerSettingsPaneControllerParams
 */

/**
 * @typedef {import('./TransformControls').Transformation} Transformation
 */
/* eslint-enable max-len */

/**
 * Represents the local transform of a {@link VectorGeo}.
 * 
 * @typedef {Readonly<{
 *     vectorCoords: ReadonlyArray<THREE.Vector3>;
 * }>} LocalTransform
 */

/**
 * Represents the event when an object has been transformed.
 * - `mode`: The type of transformation.
 * - `obj`: The object being transformed.
 * - `prevTransform`: The transform of the object prior to being transformed.
 * 
 * @typedef {{
 *     mode: string;
 *     obj: ReadonlyLabelVector;
 *     prevTransform: LocalTransform;
 * }} UpdateTransformEvent
 */
/**
 * Defines each event that can be dispatched by {@link VectorTransformer}.
 * 
 * @typedef {object} VectorTransformerEventMap
 * @property {{ obj: ReadonlyLabelVector }} begin The event when the transformation of an object
 * has begun.
 * @property {{ obj: ReadonlyLabelVector }} abort The event when the transformation of an object
 * has been aborted.
 * @property {UpdateTransformEvent} checkpoint The event when an object has been transformed.
 */

/**
 * @typedef {object} TransformControlsParams
 * @property {WindowPointer} pointer The pointer that interacts with the objects.
 * @property {THREE.Raycaster} raycaster Raycasts the pointer to this set of controls.
 */

/**
 * 
 * @augments THREE.EventDispatcher<VectorTransformerEventMap>
 */
export class VectorTransformer extends THREE.EventDispatcher {

    /**
     * The DOM element representing this object.
     * 
     * @readonly
     * @type {HTMLDivElement}
     */
    dom;

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
     * @type {EditorConfig}
     */
    config;

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
     * @type {?ReadonlyLabelVector}
     */
    #currentObj = null;

    /**
     * The object to be transformed, if any.
     * It is modified during the transformation.
     * 
     * @type {?ReadonlyLabelVector}
     */
    get selectedObj() { return this.#currentObj; }

    /**
     * Sets or unsets the stored state of an object.
     * 
     * @param {?ReadonlyLabelVector} obj If given, sets the state to begin transforming this object;
     * otherwise, unsets the state to finish transforming the current object.
     */
    #setState(obj) {
        if (obj == null) {
            this.#startTransform = null;
            this.#currentObj = null;
        } else {
            const currentObj = obj;

            this.#startTransform = {
                vectorCoords: obj.vectorCoords,
            };

            this.#currentObj = currentObj;
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
                    this.abort();
                } else {
                    this.select(this.#currentObj);
                }
            }

            this.render();
        }
    }

    /**
     * The controls for transforming vector object.
     * 
     * @readonly
     * @type {TransformControls}
     */
    #controls;

    /**
     * Whether an object is being transfromed.
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
    get disableMoveY() { return this.#controls.disableMoveY; }

    set disableMoveY(value) { this.#controls.disableMoveY = value; }

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

        this.setControlsEnabled('vertex', isTransformSelected.vertex);
        this.setControlsEnabled('vertices', isTransformSelected.vertices);
    };

    /**
     * Creates a new object transformer.
     * 
     * @param {EditorConfig} config The configuration of the project.
     * @param {WindowPointer} pointer The pointer that interacts with the set of controls.
     * @param {THREE.Raycaster} raycaster Raycasts the pointer to the set of controls.
     */
    constructor(config, pointer, raycaster) {
        super();

        this.config = config;
        this.pointer = pointer;
        this.raycaster = raycaster;

        this.dom = document.createElement('div');
        {
            this.#settingsInput = TransformerSettingsPaneController.create(this.dom, {
                inputtedData: {
                    isTransformSelected: {
                        vertex: true,
                        vertices: true,
                    },
                },
            });
        }

        this.#controls = new TransformControls(pointer, raycaster);

        this.#controls.addEventListener('mouseDown', this.#onControlsMouseDown);
        this.#controls.addEventListener('mouseUp', this.#onControlsMouseUp);

        this.#settingsInput.bindOutputData(this.#onSettingsChange);
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#settingsInput.dispose();

        this.#controls.removeEventListener('mouseDown', this.#onControlsMouseDown);
        this.#controls.removeEventListener('mouseUp', this.#onControlsMouseUp);
        this.#controls.dispose();
    }

    #onControlsMouseDown = () => {
        if (this.disabled) return;

        const currentObj = this.#currentObj;
        if (currentObj == null) {
            throw new Error('No object being transformed');
        }

        this.#setState(currentObj);

        this.dispatchEvent({ type: 'begin', obj: currentObj });
    };

    /**
     * @type {(event: { mode: Transformation }) => void}
     */
    #onControlsMouseUp = (event) => {
        if (this.disabled) return;

        this.#checkpoint(event.mode);
    };

    /**
     * Saves the current transform of the object.
     * 
     * @param {Transformation} mode the mode of transformation.
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

        const format = this.config.coordinateFormat;
        const currentVertices = currentObj.vertices;
        const startVertices = startTransform.vectorCoords;

        const startVerticesInDB = startVertices.map((vertex) => format.toDatabaseCoords(vertex));

        if (ThreeUtils.areVerticesEqual(currentVertices, startVerticesInDB)) {
            // No transformation has been made, so this call is redundant
            return;
        }

        if (!GeoUtils.isValidVector(currentVertices, currentObj.vectorType)) {
            currentObj.getGeo().vectorCoords = startVertices;
            this.select(currentObj);
            return;
        }

        this.#setState(currentObj);

        this.dispatchEvent({
            type: 'checkpoint',
            mode: mode,
            obj: currentObj,
            prevTransform: startTransform,
        });
    }

    /**
     * Selects an object to transform.
     * 
     * @param {ReadonlyLabelVector} obj The object to transform.
     */
    select(obj) {
        if (this.hasSelection) {
            this.deselect();
        }

        this.#setState(obj);

        if (!this.disabled) {
            this.#controls.object = obj.getGeo();
        }
    }

    /**
     * Deselects the object so it can no longer be transformed.
     * 
     * This is a no-op if there is no selected box.
     */
    deselect() {
        if (!this.hasSelection) return;

        this.abort();

        this.#controls.object = null;

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

        this.#controls.object = null;

        currentObj.getGeo().vectorCoords = startTransform.vectorCoords;

        if (!this.disabled) {
            this.#controls.object = currentObj.getGeo();
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

    render() {
        this.#settingsInput.updateState({
            inputtedData: {
                isTransformSelected: {
                    vertex: this.isControlsEnabled('vertex'),
                    vertices: this.isControlsEnabled('vertices'),
                },
            },
            settings: {
                disabled: this.disabled,
            },
        });
    }
}
