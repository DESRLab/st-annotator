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
 * @typedef {import('../../SegmentationView').InstanceParams} InstanceParams
 */

/**
 * @typedef {import('../../LabelInstance').ReadonlyLabelInstance} ReadonlyLabelInstance
 */

/**
 * @typedef {{
 *     instance_id: UUID;
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
    get displayName() { return 'Delete Object Instance'; }

    /**
     * The name of this operation, which is sent to the backend.
     * 
     * @type {string}
     */
    get opName() { return 'instance-delete'; }

    /**
     * The result of this operation, expressed as a {@link Placeholder}.
     * 
     * It is resolved with the value returned from the backend after it is pushed there.
     * 
     * @type {null}
     */
    get opResult() { return null; }

    /**
     * @type {InstanceParams | undefined}
     */
    #deletedInstanceParams = undefined;

    /**
     * Creates a new operation from a set of (unserialized) parameters.
     * 
     * @param {ReadonlyLabelInstance} instance The object instance to remove.
     * @returns {Delete} The newly created operation.
     */
    static fromParams(instance) {
        return new Delete({
            instance_id: instance.id,
        });
    }

    /**
     * Applies this operation to a collection of object instanceing labels.
     * 
     * @param {SegmentationIndex} index The index to update.
     */
    applyIndex(index) {
        if (this.#deletedInstanceParams !== undefined) {
            throw new Error('Cannot reapply an operation');
        }

        const params = this.opParams;
        const instance = index.getLabelInstance(params.instance_id);

        this.#deletedInstanceParams = instance;
        index.deleteLabelInstance(instance);
    }

    /**
     * Reverts the changes applied by this operation to a collection of
     * object instanceing labels.
     * 
     * @param {SegmentationIndex} index The index to update.
     */
    undoIndex(index) {
        if (this.#deletedInstanceParams === undefined) {
            throw new Error('Cannot undo an operation that has not been applied');
        }

        index.addLabelInstance(this.#deletedInstanceParams);

        this.#deletedInstanceParams = undefined;
    }
}
