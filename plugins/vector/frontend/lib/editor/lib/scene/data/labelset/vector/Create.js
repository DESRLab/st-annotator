import { DecimalVector3Data } from 'sta/common/spatial';
import { Timestamp } from 'sta/common/utils';
import { Placeholder } from 'sta/services/editor/base';

import { VectorOperation } from '../VectorOperation';

/**
 * @typedef {import('../../models').UUID} UUID
 */

/**
 * @typedef {import('../../LabelVector').VectorType} VectorType
 */

/**
 * @typedef {import('../../LabelVector').ReadonlyLabelVector} ReadonlyLabelVector
 */

/**
 * @typedef {import('../../VectorIndex').VectorParams} VectorParams
 */

/**
 * @typedef {import('../../VectorIndex').VectorIndex} VectorIndex
 */

/**
 * @typedef {{ type: VectorType; coords: DecimalVector3Data[] }} VectorVertices
 */

/**
 * @typedef {{
 *     entity_id: ? UUID;
 *     vertices: VectorVertices;
 *     timestamp: ?string;
 *     gtClassId: ?number;
 * }} CreateParamsData
 */

/**
 * @augments {VectorOperation<CreateParamsData, string>}
 */
export class Create extends VectorOperation {
    /**
     * The display name of this operation.
     * 
     * @type {string}
     */
    get displayName() { return 'Create Vector Object'; }

    /**
     * The name of this operation, which is sent to the backend.
     * 
     * @type {string}
     */
    get opName() { return 'vector-create'; }

    /**
     * @type {Placeholder<string>}
     */
    #newVectorId = new Placeholder();

    /**
     * The result of this operation, expressed as a {@link Placeholder}
     * 
     * It is resolved with the value returned from backend after it is pushed there.
     * 
     * @type {Placeholder<string>}
     */
    get opResult() { return this.#newVectorId; }

    /**
     * @type {ReadonlyLabelVector | undefined}
     */
    #newVector;

    /**
     * @type {ReadonlyLabelVector | undefined}
     */
    get newVector() { return this.#newVector; }

    /**
     * Creates a new operation from a set of (unserialized) parameters.
     * 
     * @param {Omit<VectorParams, 'config' | 'id'>} params Parameters to initialize the
     * vector object.
     * @returns {Create} The newly created operation.
     */
    static fromParams(params) {
        return new Create({
            entity_id: null,
            timestamp: params.timestamp?.toJSON() ?? null,
            vertices: {
                type: params.vectorType,
                coords: params.vertices.map(DecimalVector3Data.fromVector3)
            },
            gtClassId: params.gtClassId ?? null,
        });
    }

    /**
     * Applies this operation to a collection of vector object labels.
     * 
     * @param {VectorIndex} index The index to update.
     */
    applyIndex(index) {
        if (this.#newVector !== undefined) {
            throw new Error('Cannot reapply an operation');
        }

        const params = this.opParams;
        this.#newVector = index.addLabelVector({
            id: this.#newVectorId,
            timestamp: params.timestamp == null ? null : new Timestamp(params.timestamp),
            vectorType: params.vertices.type,
            vertices: params.vertices.coords.map((vertex) => vertex.toVector3()),
            gtClassId: params.gtClassId,
        });
    }

    /**
     * Reverts the changes applied by this operation to a collection of vector labels.
     * 
     * @param {VectorIndex} index The index to update.
     */
    undoIndex(index) {
        if (this.#newVector === undefined) {
            throw new Error('Cannot undo an operation that has not been applied');
        }

        index.deleteLabelVector(this.#newVector);

        this.#newVector = undefined;
    }
}
