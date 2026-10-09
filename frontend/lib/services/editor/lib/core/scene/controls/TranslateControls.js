import _ from 'lodash';
import * as THREE from 'three';

import { ThreeUtils, TransformUtils } from '../../../../../../common/lib/utils';

import { Controls } from './Controls';
import { DraggablePlane } from './DraggablePlane';

/**
 * @template T
 * @typedef {import('../../../base').Dragger<T>} Dragger
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
 * Used to perform translation of `three.js` objects along two axes.
 */
export class TranslateControls extends Controls {

    /**
     * @type {boolean}
     */
    #snapToAxis = false;

    /**
     * The axis to snap to.
     * 
     * @type {?Axis}
     */
    #snapAxis = null;

    /**
     * Whether or not translation is snapped to a single axis in plane translation mode.
     * Default is `false`.
     * 
     * @type {boolean}
     */
    get snapToAxis() { return this.#snapToAxis; }

    set snapToAxis(value) {
        if (this.snapToAxis !== value) {
            this.#snapToAxis = value;

            if (value
                && this.object != null && this.draggedElement != null
                && this.initObjectState != null     // !this.dragging
            ) {
                // Recompute this.#snapAxis to the model axis along which translation is greatest
                const { object: obj3D, draggedElement } = this;

                const offsetLocalAbs = ThreeUtils.mapVector3(
                    obj3D.position.clone().sub(this.initObjectState.position)
                        .applyMatrix4(new THREE.Matrix4()
                            .makeRotationFromEuler(obj3D.rotation).invert()),
                    Math.abs,
                );

                /**
                 * @type {Axis[]}
                 */
                const xyz = ['X', 'Y', 'Z'];
                const sortedAxes = _.sortBy(
                    _.zipWith(xyz, offsetLocalAbs.toArray(), (ax, v) => {
                        /** @type {[Axis, number]} */
                        const pair = [ax, v];
                        return pair;
                    }),
                    ([, v]) => -v,
                );

                for (const [axis] of sortedAxes) {
                    if (draggedElement.axes.includes(axis) && this.isAxisVisible(axis)) {
                        this.#snapAxis = axis;
                        break;
                    }
                }
            }

            this.updateState();
        }
    }

    /**
     * Computes the axis to snap to.
     * 
     * @param {DraggablePlane} element The element being dragged.
     * @returns {?Axis} The requested axis, or `null` if there is no available axis to snap to.
     */
    #computeSnapAxis(element) {
        const closestAxis = element.getClosestModelAxis(this.raycaster);
        if (this.isAxisVisible(closestAxis)) return closestAxis;

        // Invert the selection
        const [axisA, axisB] = element.axes;
        const altAxis = (closestAxis === axisA) ? axisB : axisA;

        return this.isAxisVisible(altAxis) ? altAxis : null;
    }

    /**
     * Updates the visibility of the components of the set of controls.
     * 
     * @protected
     * @returns {this} This object.
     */
    updateVisibility() {
        for (const element of this.draggableGroup.objects) {
            // Use some() instead of every() to still allow manipulation
            // when only one axis is visible
            element.visible = element.axes.some((axis) => this.isAxisVisible(axis));
        }

        return this;
    }

    /**
     * Creates the elements of this set of controls.
     * 
     * @returns {{
     *     draggableElements: ReadonlyArray<DraggableBase>;
     *     visualElements?: ReadonlyArray<THREE.Object3D>;
     * }} The requested elements.
     */
    static createElements() {
        const halfLength = 0.5;

        /**
         * @type {Map<Axis[], THREE.Vector3[]>}
         */
        const coordsByAxes = new Map([
            [
                ['X', 'Y'],
                [

                    new THREE.Vector3(0, 0, halfLength),
                    new THREE.Vector3(0, 0, -halfLength),
                ],
            ],
            [
                ['Y', 'Z'],
                [
                    new THREE.Vector3(halfLength, 0, 0),
                    new THREE.Vector3(-halfLength, 0, 0),
                ],
            ],
            [
                ['X', 'Z'],
                [
                    new THREE.Vector3(0, halfLength, 0),
                    new THREE.Vector3(0, -halfLength, 0),
                ],
            ],
        ]);

        /**
         * @type {DraggableBase[]}
         */
        const draggableElements = [];

        for (const [axes, coords] of coordsByAxes.entries()) {
            const vertices = coords.map((c) => new DraggablePlane(axes, axes, c));

            for (const vertex of vertices) {
                draggableElements.push(vertex);
            }
        }

        return { draggableElements };
    }

    /**
     * Creates a new set of controls to translate an object.
     * 
     * @param {WindowPointer} pointer The pointer that interacts with the set of controls.
     * @param {THREE.Raycaster} raycaster Raycasts the pointer to the set of controls.
     * @returns {TranslateControls} The newly created set of controls.
     */
    static create(pointer, raycaster) {
        const { draggableElements } = this.createElements();
        const draggableGroup = Controls.createGroup(draggableElements);

        const elementDragger = pointer.createDragController({
            groups: [{ group: draggableGroup, priority: 0 }],
            raycaster: raycaster,
        });

        return new TranslateControls(draggableGroup, elementDragger);
    }

    /**
     * Sets the state when the element being dragged was clicked.
     * 
     * @protected
     * @param {DraggableBase} element The element being dragged.
     * @returns {this} This object.
     */
    setInitState(element) {
        super.setInitState(element);

        if (element instanceof DraggablePlane) {
            this.#snapAxis = this.#computeSnapAxis(element);
        }

        return this;
    }

    /**
     * Unets the state when the element being dragged was clicked.
     * 
     * @protected
     * @returns {this} This object.
     */
    unsetInitState() {
        super.unsetInitState();

        this.#snapAxis = null;

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
        super.updateState();

        for (const element of this.draggableGroup.objects) {
            if (element instanceof DraggablePlane) {
                if (this.snapToAxis
                    && (element === this.draggedElement
                        || (element === this.hoveredElement && !this.dragging))
                ) {
                    // Highlight the snapAxis if click and drag were to begin
                    const snapAxis = (element === this.draggedElement) ? this.#snapAxis
                        : this.#computeSnapAxis(element);

                    for (const axis of element.axes) {
                        element.setIsHelperVisible(axis, snapAxis === axis);
                    }
                } else {
                    for (const axis of element.axes) {
                        element.setIsHelperVisible(axis, false);
                    }
                }
            }
        }

        return this;
    }

    /**
     * Sets the transform according to the position of the pointer.
     * 
     * @protected
     * @param {THREE.Vector3} initPointerLocalPos The position of the pointer in model space when
     * the element was clicked.
     * @param {THREE.Vector3} nextPointerLocalPos The current position of the pointer in model
     * space.
     */
    adjustMatrix(initPointerLocalPos, nextPointerLocalPos) {
        if (this.initObjectState == null) {  // !this.dragging
            throw new Error('No object is being transformed');
        }

        const disableAxes = {
            x: !this.isAxisVisible('X'),
            y: !this.isAxisVisible('Y'),
            z: !this.isAxisVisible('Z'),
        };

        const snap = (this.#snapAxis == null) ? null
            : { worldPos: this.initObjectState.position, axis: this.#snapAxis };

        if (this.snapToAxis) {
            TransformUtils.translate(
                this,
                initPointerLocalPos,
                nextPointerLocalPos,
                disableAxes,
                snap,
            );
        } else {
            TransformUtils.translate(this, initPointerLocalPos, nextPointerLocalPos, disableAxes);
        }
    }
}
