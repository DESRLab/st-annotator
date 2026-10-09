import * as THREE from 'three';

import { VertexTranslateControls } from './VertexTranslateControls';
import { VerticesTranslateControls } from './VerticesTranslateControls';

/**
 * @typedef {import('sta/services/editor/base').WindowPointer} WindowPointer
 */

/**
 * @typedef {import('sta/services/editor/core').Axis} Axis
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
 * @typedef {import('./Controls').ControlsEventMap} ControlsEventMap
 */

/**
 * @typedef {'vertex' | 'vertices'} Transformation
 */

/**
 * Defines each event that can be dispatched by {@link TransformControls}.
 * 
 * @typedef {object} TransformControlsEventMap
 * @property {{ mode: Transformation }} mouseDown The event when a pointer (mouse/touch)
 * becomes active.
 * @property {{ mode: Transformation }} mouseUp The event when a pointer (mouse/touch)
 * is no longer active.
 * @property {{ obj: VectorGeo<Line | Point> }} objectChange The event when the controlled
 * 3D object is changed.
 */

/**
 * @typedef {{
 *     vertex: VertexTranslateControls;
 *     vertices: VerticesTranslateControls;
 * }} CompositeControls
 */

/**
 * Used to perform vertex transformation of three.js objects.
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
    #disableMoveY = true;

    /**
     * Whether to disable moving and resizing the bounding box along the `y` axis.
     * 
     *  @type {boolean}
     */
    get disableMoveY() { return this.#disableMoveY; }

    set disableMoveY(value) {
        if (this.#disableMoveY !== value) {
            this.#disableMoveY = value;

            this.#updateVisibility();
        }
    }

    /**
     * Updates the visibility of each set of controls.
     * 
     * @returns {this} This object.
     */
    #updateVisibility() {
        for (const controls of Object.values(this.#controls)) {
            controls.visible = controls.enabled && controls.object != null;

            controls.showX = !this.disableMoveXZ;
            controls.showY = !this.disableMoveY;
            controls.showZ = !this.disableMoveXZ;
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
        if (this.object !== value) {
            this.#object = value;

            this.clear();

            for (const controls of Object.values(this.#controls)) {
                controls.object = value;
                this.add(controls);
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
            if (mode === 'vertex' || mode === 'vertices') {
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
     * Creates a new control to perform vertex translation of a vector object.
     * 
     * @param {WindowPointer} pointer The pointer that interacts with the set of controls.
     * @param {THREE.Raycaster} raycaster Raycasts the pointer to the set of controls.
     */
    constructor(pointer, raycaster) {
        super();

        const vertexControls = new VertexTranslateControls(pointer, raycaster, 2);
        const verticesControls = new VerticesTranslateControls(pointer, raycaster, 1);

        this.#controls = {
            vertex: vertexControls,
            vertices: verticesControls,
        };

        for (const [mode, ctrls] of Object.entries(this.#controls)) {
            /** @type {THREE.Object3D<THREE.Object3DEventMap & ControlsEventMap>} */
            const ctrls_ = ctrls;

            if (mode === 'vertex' || mode === 'vertices') {
                ctrls_.addEventListener('mouseDown', (e) => {
                    if (this.object == null) return;

                    this.dispatchEvent({ mode, ...e });
                });
                ctrls_.addEventListener('mouseUp', (e) => {
                    if (this.object == null) return;

                    this.dispatchEvent({ mode, ...e });
                });
                ctrls_.addEventListener('objectChange', (e) => {
                    this.#onObjectChange(e);

                    this.dispatchEvent(e);
                });
            } else {
                throw new Error(`Unhandled controls tyoe: ${mode}`);
            }
        }

        this.#updateVisibility();
    }

    /**
     * @param {ControlsEventMap['objectChange']} event The event to handle
     */
    #onObjectChange(event) {
        const mode = this.mode;
        const controls = this.#controls;
        switch (mode) {
            case 'vertex':
                if (controls.vertices.enabled) {
                    this.#controls.vertices.object = event.obj;
                }
                break;
            case 'vertices':
                if (controls.vertex.enabled) {
                    this.#controls.vertex.object = event.obj;
                }
                break;
            default:
                throw Error(`Unhandled transformation mode ${mode}`);
        }
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        for (const [mode, ctrls] of Object.entries(this.#controls)) {
            if (mode === 'vertex' || mode === 'vertices') {
                // Assumes that this object owns the newly created controls
                // This is ensured by making the constructor protected
                ctrls.dispose();

                this.remove(ctrls);
            } else {
                throw new Error(`Unhandled controls type: ${mode}`);
            }
        }
    }
}
