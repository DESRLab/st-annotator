import * as THREE from 'three';

import { ThreeUtils, TransformUtils, TypeUtils } from '../../../../../../common/lib/utils';

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
 * Represents a frame in a {@link ResizeControls}.
 */
class ResizeVertexFrame extends VertexFrame {

    /**
     * Creates a new frame in a {@link ResizeControls}.
     * 
     * @param {ReadonlyArray<DraggableVertex>} vertices The vertices contained in the frame.
     */
    constructor(vertices) {
        super(vertices);

        if (vertices.length !== 4) {
            throw new Error(`Ths object only supports 4 vertices, but found: ${vertices.length}`);
        }

        const allCoords = vertices.map((vertex) => vertex.position);
        const minCoords = allCoords.reduce((acc, v) => acc.min(v), allCoords[0].clone());
        const maxCoords = allCoords.reduce((acc, v) => acc.max(v), allCoords[0].clone());

        const [indexA, indexB] = Array.from(
            new Set(vertices.flatMap((vertex) => vertex.axes)),
            (axis) => {
                switch (axis) {
                    case 'X':
                        return 0;
                    case 'Y':
                        return 1;
                    case 'Z':
                        return 2;
                    default:
                        throw new Error(`Invalid axis: ${axis}`);
                }
            },
        );
        if (indexA == null) {
            throw new Error(`Did not find valid indexA. allCoords: ${JSON.stringify(allCoords)}`);
        }
        if (indexB == null) {
            throw new Error(`Did not find valid indexB. allCoords: ${JSON.stringify(allCoords)}`);
        }

        const minMax = maxCoords.clone().setComponent(indexA, minCoords.getComponent(indexA));
        const maxMin = maxCoords.clone().setComponent(indexB, minCoords.getComponent(indexB));
        const points = [minCoords, minMax, maxCoords, maxMin, minCoords];

        const frameBuffer = new THREE.BufferGeometry().setFromPoints(points);
        const frameMaterial = new THREE.LineDashedMaterial({ color: 'gray' });
        const frame = new THREE.Line(frameBuffer, frameMaterial);
        this.frame = frame;
        this.add(frame);
    }
}

/**
 * Used to perform anchored resizing of `three.js` objects along one or two axes.
 */
export class ResizeControls extends Controls {

    /**
     * The frames along which vertices are placed.
     * 
     * @readonly
     * @type {Set<ResizeVertexFrame>}
     */
    #frames = new Set();

    /**
     * @type {boolean}
     */
    #clipToAspect = false;

    /**
     * Whether or not resizing is clipped to match the initial aspect ratio.
     * Default is `false`.
     * 
     * @type {boolean}
     */
    get clipToAspect() { return this.#clipToAspect; }

    set clipToAspect(value) {
        if (this.clipToAspect !== value) {
            this.#clipToAspect = value;

            this.updateState();
        }
    }

    /**
     * @type {boolean}
     */
    #enablePlane = true;

    /**
     * Whether or not resizing can be done along two axes at once. Default is `true`.
     * 
     * @type {boolean}
     */
    get enablePlane() { return this.#enablePlane; }

    set enablePlane(value) {
        if (this.enablePlane !== value) {
            this.#enablePlane = value;

            this.updateVisibility();
        }
    }

    /**
     * Updates the visibility of the components in the set of controls.
     * 
     * @protected
     * @returns {this} This object.
     */
    updateVisibility() {
        super.updateVisibility();

        if (!this.enablePlane) {
            for (const element of this.draggableGroup.objects) {
                if (element.axes.length === 2) {
                    element.visible = false;
                }
            }
        }

        for (const frame of this.#frames) {
            frame.visible = frame.vertices.some((vertex) => vertex.visible);
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
                ['X'],
                [
                    new THREE.Vector3(-halfLength, 0, 0),
                    new THREE.Vector3(halfLength, 0, 0),
                ],
            ],
            [
                ['Y'],
                [
                    new THREE.Vector3(0, -halfLength, 0),
                    new THREE.Vector3(0, halfLength, 0),
                ],
            ],
            [
                ['Z'],
                [
                    new THREE.Vector3(0, 0, -halfLength),
                    new THREE.Vector3(0, 0, halfLength),
                ],
            ],
            [
                ['X', 'Y'],
                [
                    new THREE.Vector3(-halfLength, -halfLength, 0),
                    new THREE.Vector3(-halfLength, halfLength, 0),
                    new THREE.Vector3(halfLength, halfLength, 0),
                    new THREE.Vector3(halfLength, -halfLength, 0),
                ],
            ],
            [
                ['Y', 'Z'],
                [
                    new THREE.Vector3(0, -halfLength, -halfLength),
                    new THREE.Vector3(0, -halfLength, halfLength),
                    new THREE.Vector3(0, halfLength, halfLength),
                    new THREE.Vector3(0, halfLength, -halfLength),
                ],
            ],
            [
                ['X', 'Z'],
                [
                    new THREE.Vector3(-halfLength, 0, -halfLength),
                    new THREE.Vector3(-halfLength, 0, halfLength),
                    new THREE.Vector3(halfLength, 0, halfLength),
                    new THREE.Vector3(halfLength, 0, -halfLength),
                ],
            ],
        ]);

        /**
         * @type {DraggableBase[]}
         */
        const draggableElements = [];

        /**
         * @type {THREE.Object3D[]}
         */
        const visualElements = [];

        /**
         * @type {Map<string, DraggableVertex[]>}
         */
        const verticesByAxes = new Map();
        for (const [axes, coords] of coordsByAxes.entries()) {
            const vertices = coords.map((c) => new DraggableVertex(axes, axes, c));
            verticesByAxes.set(axes.join(''), vertices);
        }

        for (const [axes, vertices] of verticesByAxes.entries()) {
            for (const vertex of vertices) {
                draggableElements.push(vertex);
            }

            if (axes.length === 2) {
                const frameVertices = Array.from(axes, (axis) => verticesByAxes.get(axis))
                    .filter(TypeUtils.isNotNull).flat();
                const frame = new ResizeVertexFrame(frameVertices);

                visualElements.push(frame);
            }
        }

        return { draggableElements, visualElements };
    }

    /**
     * Creates a new set of controls to resize an object.
     * 
     * @param {WindowPointer} pointer The pointer that interacts with the set of controls.
     * @param {THREE.Raycaster} raycaster Raycasts the pointer to the set of controls.
     * @returns {ResizeControls} The newly created set of controls.
     */
    static create(pointer, raycaster) {
        const { draggableElements, visualElements } = this.createElements();
        const draggableGroup = Controls.createGroup(draggableElements);

        const elementDragger = pointer.createDragController({
            groups: [{ group: draggableGroup, priority: 0 }],
            raycaster: raycaster,
        });

        return new ResizeControls(draggableGroup, elementDragger, visualElements);
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
        if (this.draggedElement == null || this.initObjectState == null  // !this.dragging
            || this.axis_or_plane == null
        ) {
            throw new Error('No object is being transformed');
        }

        // Use this instead of initPointerLocalPos, otherwise the opposite vertex
        // might not be anchored as initPointerLocalPos may not exactly be at the corner.
        const initLocalPos = this.draggedElement.position;

        if (this.clipToAspect) {
            const initAspect = ThreeUtils.mapVector3(this.initObjectState.scale.clone(), Math.abs);

            /**
             * @type {{x?: number, y?: number, z?: number}}
             */
            const aspect = {};
            for (const axis of this.axis_or_plane) {
                switch (axis) {
                    case 'X':
                        aspect.x = initAspect.x;
                        break;
                    case 'Y':
                        aspect.y = initAspect.y;
                        break;
                    case 'Z':
                        aspect.z = initAspect.z;
                        break;
                    default:
                        throw new Error(`Invalid axis: ${axis}`);
                }
            }

            TransformUtils.resize(this, initLocalPos, nextPointerLocalPos, aspect);
        } else {
            TransformUtils.resize(this, initLocalPos, nextPointerLocalPos);
        }
    }

}
