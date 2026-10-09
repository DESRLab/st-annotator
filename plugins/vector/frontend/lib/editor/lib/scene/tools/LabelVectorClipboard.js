import { Clipboard } from 'sta/services/editor/core';

/**
 * @typedef {import('../data').VectorParams} VectorParams
 */

/**
 * @typedef {import('../data').ReadonlyLabelVector} ReadonlyLabelVector
 */

/**
 * @typedef {Omit<VectorParams, 'id' | 'timestamp' | 'showColor'>} VectorClipboardData
 */

/**
 * Contains a user interface for copy and pasting vector objects in the scene.
 * 
 * @augments {Clipboard<ReadonlyLabelVector, VectorClipboardData>}
 */
export class LabelVectorClipboard extends Clipboard {

    /**
     * Creates a new clipboard for copy/pasting in a scene.
     */
    constructor() {
        super({
            objToData: (vector) => ({
                vectorType: vector.vectorType,
                vertices: vector.vertices,
                gtClassId: vector.gtClassId,
            }),
        });
    }
}
