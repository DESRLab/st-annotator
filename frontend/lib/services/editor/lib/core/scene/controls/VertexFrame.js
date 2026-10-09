import * as THREE from 'three';

/**
 * @typedef {import('./DraggableBase').Axis} Axis
 */

/**
 * @typedef {import('./DraggableVertex').DraggableVertex} DraggableVertex
 */

/**
 * Represents a frame containing {@link DraggableVertex} objects.
 */
export class VertexFrame extends THREE.Object3D {

    /**
     * The vertices contained in this frame.
     * 
     * @readonly
     * @type {ReadonlyArray<DraggableVertex>}
     */
    vertices;

    /**
     * The frame that is displayed.
     * 
     * @readonly
     * @type {THREE.Object3D}
     */
    frame;

    /**
     * Creates a new frame containing {@link DraggableVertex} objects.
     * 
     * @param {ReadonlyArray<DraggableVertex>} vertices The vertices contained in this frame.
     */
    constructor(vertices) {
        super();

        this.vertices = vertices;
    }
}
