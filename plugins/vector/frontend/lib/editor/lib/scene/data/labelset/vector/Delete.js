import { VectorOperation } from '../VectorOperation';

/**
 * @template {{} | null} T
 * @typedef {import('sta/services/editor/base').Placeholder<T>} Placeholder
 */

/**
 * @typedef {import('../../models').UUID} UUID
 */

/**
 * @typedef {import('../../VectorIndex').VectorIndex} VectorIndex
 */

/**
 * @typedef {import('../../VectorView').VectorParams} VectorParams
 */

/**
 * @typedef {import('../../LabelVector').ReadonlyLabelVector} ReadonlyLabelVector
 */

/**
 * @typedef {{
 *      vector_id: UUID;
 * }} DeleteParams
 */

/**
 * @augments {VectorOperation<DeleteParams, null>}
 */
export class Delete extends VectorOperation {

    /**
     * The display name of this operation.
     * 
     * @type {string}
     */
    get displayName() { return 'Delete Vector Obejct'; }

    /**
     * The name of this operation, which is sent to the backend.
     * 
     * @type {string}
     */
    get opName() { return 'vector-delete'; }

    /**
     * The result of this operation, expressed as a {@link Placeholder}
     * 
     * It is resolved with the value returned from the backend after it is pushed there.
     * 
     * @type {null}
     */
    get opResult() { return null; }

    /**
     * @type {VectorParams | undefined}
     */
    #deletedVectorParams = undefined;

    /**
     * Creates a delete operation from a set of (unserialized) parameters.
     * 
     * @param {ReadonlyLabelVector} vector The vector object to remove
     * @returns {Delete} The newly created operation.
     */
    static fromParams(vector) {
        return new Delete({
            vector_id: vector.id,
        });
    }

    /**
     * Applies this operation to a collection of vector object labels.
     * 
     * @param {VectorIndex} index The index to update.
     */
    applyIndex(index) {
        if (this.#deletedVectorParams !== undefined) {
            throw new Error('Cannot reapply an operation');
        }

        const params = this.opParams;
        const vector = index.getLabelVector(params.vector_id);

        this.#deletedVectorParams = vector;
        index.deleteLabelVector(vector);
    }

    /**
     * Reverts the changes applied by this operation to a collection of
     * vector object labels.
     * 
     * @param {VectorIndex} index The index to update.
     */
    undoIndex(index) {
        if (this.#deletedVectorParams === undefined) {
            throw new Error('Cannot undo an operation that has not been applied');
        }

        index.addLabelVector(this.#deletedVectorParams);

        this.#deletedVectorParams = undefined;
    }
}
