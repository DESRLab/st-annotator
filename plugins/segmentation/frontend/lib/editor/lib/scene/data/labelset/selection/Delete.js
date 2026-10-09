import { SegmentationOperation } from '../SegmentationOperation';

/**
 * @template {{} | null} T
 * @typedef {import('sta/services/editor/base').Placeholder<T>} Placeholder
 */

/**
 * @typedef {import('../../models').UUID} UUID
 */

/**
 * @typedef {import('../../SegmentationIndex').SegmentationIndex} SegmentationIndex
 */

/**
 * @typedef {import('../../SegmentationView').SelectionParams} SelectionParams
 */

/**
 * @typedef {import('../../LabelSelection').ReadonlyLabelSelection} ReadonlyLabelSelection
 */

/**
 * @typedef {{
 *     selection_id: UUID;
 * }} DeleteParams
 */

/**
 * @augments {SegmentationOperation<DeleteParams, null>}
 */
export class Delete extends SegmentationOperation {

    /**
     * The display name of this operation.
     * 
     * @type {string}
     */
    get displayName() { return 'Delete Selection'; }

    /**
     * The name of this operation, which is sent to the backend.
     * 
     * @type {string}
     */
    get opName() { return 'selection-delete'; }

    /**
     * The result of this operation, expressed as a {@link Placeholder}.
     * 
     * It is resolved with the value returned from the backend after it is pushed there.
     * 
     * @type {null}
     */
    get opResult() { return null; }

    /**
     * @type {SelectionParams | undefined}
     */
    #deletedSelectionParams = undefined;

    /**
     * Creates a new operation from a set of (unserialized) parameters.
     * 
     * @param {ReadonlyLabelSelection} selection The bounding selection to remove.
     * @returns {Delete} The newly created operation.
     */
    static fromParams(selection) {
        return new Delete({
            selection_id: selection.id,
        });
    }

    /**
     * Applies this operation to a collection of segmentation labels.
     * 
     * @param {SegmentationIndex} index The index to update.
     */
    applyIndex(index) {
        if (this.#deletedSelectionParams !== undefined) {
            throw new Error('Cannot reapply an operation');
        }

        const params = this.opParams;
        const selection = index.getLabelSelection(params.selection_id);

        this.#deletedSelectionParams = selection;
        index.deleteLabelSelection(selection);
    }

    /**
     * Reverts the changes applied by this operation to a collection of
     * segmentation labels.
     * 
     * @param {SegmentationIndex} index The index to update.
     */
    undoIndex(index) {
        if (this.#deletedSelectionParams === undefined) {
            throw new Error('Cannot undo an operation that has not been applied');
        }

        index.addLabelSelection(this.#deletedSelectionParams);

        this.#deletedSelectionParams = undefined;
    }
}
