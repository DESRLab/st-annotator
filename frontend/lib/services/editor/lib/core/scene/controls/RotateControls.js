import * as THREE from 'three';

import { MathUtils, TransformUtils } from '../../../../../../common/lib/utils';

import { Controls } from './Controls';
import { DraggableVertex } from './DraggableVertex';
import { VertexFrame } from './VertexFrame';

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
 * Represents a frame in a {@link RotateControls}.
 */
class RotateVertexFrame extends VertexFrame {

    /**
     * Creates a new frame in a {@link RotateControls}.
     * 
     * @param {ReadonlyArray<DraggableVertex>} vertices The vertices contained in the frame.
     */
    constructor(vertices) {
        super(vertices);

        if (vertices.length !== 1) {
            throw new Error(`Ths object only supports 1 vertex, but found: ${vertices.length}`);
        }

        const [vertex] = vertices;
        const coords = vertex.position;

        const radius = coords.length();
        const curve = new THREE.EllipseCurve(
            0, 0,
            radius, radius,
            0, MathUtils.TAU,
            false, 0,
        );

        const [axis] = vertex.axes;
        const points = curve.getPoints(512).map((point) => {
            switch (axis) {
                case 'X':
                    return new THREE.Vector3(0, point.x, point.y);
                case 'Y':
                    return new THREE.Vector3(point.x, 0, point.y);
                case 'Z':
                    return new THREE.Vector3(point.x, point.y, 0);
                default:
                    throw new Error(`Invalid axis: ${axis}`);
            }
        });

        const frameBuffer = new THREE.BufferGeometry().setFromPoints(points);
        const frameMaterial = new THREE.LineDashedMaterial({ color: 'gray' });
        const frame = new THREE.Line(frameBuffer, frameMaterial);
        this.frame = frame;
        this.add(frame);
    }
}

/**
 * Used to perform rotation of `three.js` objects along one axis.
 */
export class RotateControls extends Controls {

    /**
     * The frames along which vertices are placed.
     * 
     * @readonly
     * @type {Set<RotateVertexFrame>}
     */
    #frames = new Set();

    /**
     * Updates the visibility of the components in the set of controls.
     * 
     * @protected
     * @returns {this} This object.
     */
    updateVisibility() {
        super.updateVisibility();

        for (const frame of this.#frames) {
            frame.visible = frame.vertices.some((vertex) => vertex.visible);
        }

        return this;
    }

    get sizeOffset() { return new THREE.Vector3(1, 1, 1); }

    /**
     * Creates the elements of this set of controls.
     * 
     * @returns {{
     *     draggableElements: ReadonlyArray<DraggableBase>;
     *     visualElements?: ReadonlyArray<THREE.Object3D>;
     * }} The requested elements.
     */
    static createElements() {
        const radius = 0.5;

        /**
         * @type {Map<Axis[], THREE.Vector3[]>}
         */
        const coordsByAxes = new Map([
            [
                ['X'],
                [
                    new THREE.Vector3(0, -radius, 0),
                ],
            ],
            [
                ['Y'],
                [
                    new THREE.Vector3(0, 0, -radius),
                ],
            ],
            [
                ['Z'],
                [
                    new THREE.Vector3(-radius, 0, 0),
                ],
            ],
        ]);

        /**
         * @type {Axis[]}
         */
        const allAxes = ['X', 'Y', 'Z'];

        /**
         * @type {DraggableBase[]}
         */
        const draggableElements = [];

        /**
         * @type {THREE.Object3D[]}
         */
        const visualElements = [];

        for (const [axes, coords] of coordsByAxes.entries()) {
            const draggableAxes = allAxes.filter((axis) => !axes.includes(axis));
            const vertices = coords.map((c) => new DraggableVertex(axes, draggableAxes, c));

            for (const vertex of vertices) {
                draggableElements.push(vertex);
            }

            const frame = new RotateVertexFrame(vertices);
            visualElements.push(frame);
        }

        return { draggableElements, visualElements };
    }

    /**
     * Creates a new set of controls to rotate an object.
     * 
     * @param {WindowPointer} pointer The pointer that interacts with the set of controls.
     * @param {THREE.Raycaster} raycaster Raycasts the pointer to the set of controls.
     * @returns {RotateControls} The newly created set of controls.
     */
    static create(pointer, raycaster) {
        const { draggableElements, visualElements } = this.createElements();
        const draggableGroup = Controls.createGroup(draggableElements);

        const elementDragger = pointer.createDragController({
            groups: [{ group: draggableGroup, priority: 0 }],
            raycaster: raycaster,
        });

        return new RotateControls(draggableGroup, elementDragger, visualElements);
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
        TransformUtils.rotate(this, initPointerLocalPos, nextPointerLocalPos);
    }
}
