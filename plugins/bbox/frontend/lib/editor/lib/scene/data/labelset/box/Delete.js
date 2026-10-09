import { BBoxOperation } from '../BBoxOperation';

/**
 * @template {{} | null} T
 * @typedef {import('sta/services/editor/base').Placeholder<T>} Placeholder
 */

/**
 * @typedef {import('../../models').UUID} UUID
 */

/**
 * @typedef {import('../../BBoxIndex').BBoxIndex} BBoxIndex
 */

/**
 * @typedef {import('../../BBoxView').BoxParams} BoxParams
 */

/**
 * @typedef {import('../../LabelBox').ReadonlyLabelBox} ReadonlyLabelBox
 */

/**
 * @typedef {{
 *     box_id: UUID;
 * }} DeleteParams
 */

/**
 * @augments {BBoxOperation<DeleteParams, null>}
 */
export class Delete extends BBoxOperation {

    /**
     * The display name of this operation.
     * 
     * @type {string}
     */
    get displayName() { return 'Delete Bounding Box'; }

    /**
     * The name of this operation, which is sent to the backend.
     * 
     * @type {string}
     */
    get opName() { return 'box-delete'; }

    /**
     * The result of this operation, expressed as a {@link Placeholder}.
     * 
     * It is resolved with the value returned from the backend after it is pushed there.
     * 
     * @type {null}
     */
    get opResult() { return null; }

    /**
     * @type {BoxParams | undefined}
     */
    #deletedBoxParams = undefined;

    /**
     * Creates a new operation from a set of (unserialized) parameters.
     * 
     * @param {ReadonlyLabelBox} box The bounding box to remove.
     * @returns {Delete} The newly created operation.
     */
    static fromParams(box) {
        return new Delete({
            box_id: box.id,
        });
    }

    /**
     * Applies this operation to a collection of bounding box labels.
     * 
     * @param {BBoxIndex} index The index to update.
     */
    applyIndex(index) {
        if (this.#deletedBoxParams !== undefined) {
            throw new Error('Cannot reapply an operation');
        }

        const params = this.opParams;
        const box = index.getLabelBox(params.box_id);

        this.#deletedBoxParams = box;
        index.deleteLabelBox(box);
    }

    /**
     * Reverts the changes applied by this operation to a collection of
     * bounding box labels.
     * 
     * @param {BBoxIndex} index The index to update.
     */
    undoIndex(index) {
        if (this.#deletedBoxParams === undefined) {
            throw new Error('Cannot undo an operation that has not been applied');
        }

        index.addLabelBox(this.#deletedBoxParams);

        this.#deletedBoxParams = undefined;
    }
}
