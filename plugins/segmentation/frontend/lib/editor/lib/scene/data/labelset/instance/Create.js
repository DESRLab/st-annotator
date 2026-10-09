import { Placeholder } from 'sta/services/editor/base';

import { SegmentationOperation } from '../SegmentationOperation';

/**
 * @typedef {import('../../models').UUID} UUID
 */

/**
 * @typedef {import('../../SegmentationIndex').SegmentationIndex} SegmentationIndex
 */

/**
 * @typedef {import('../../SegmentationIndex').InstanceParams} InstanceParams
 */

/**
 * @typedef {import('../../LabelInstance').ReadonlyLabelInstance} ReadonlyLabelInstance
 */

/**
 * @typedef {{
 *     is_black: boolean;
 *     gt_class_id: ?number;
 * }} CreateParams
 */

/**
 * @augments {SegmentationOperation<CreateParams, string>}
 */
export class Create extends SegmentationOperation {

    /**
     * The display name of this operation.
     * 
     * @type {string}
     */
    get displayName() { return 'Create Object Instance'; }

    /**
     * The name of this operation, which is sent to the backend.
     * 
     * @type {string}
     */
    get opName() { return 'instance-create'; }

    /**
     * @type {Placeholder<string>}
     */
    #newInstanceId = new Placeholder();

    /**
     * The result of this operation, expressed as a {@link Placeholder}.
     * 
     * It is resolved with the value returned from the backend after it is pushed there.
     * 
     * @type {Placeholder<string>}
     */
    get opResult() { return this.#newInstanceId; }

    /**
     * @type {ReadonlyLabelInstance | undefined}
     */
    #newInstance = undefined;

    /**
     * @type {ReadonlyLabelInstance | undefined}
     */
    get newInstance() { return this.#newInstance; }

    /**
     * Creates a new operation from a set of (unserialized) parameters.
     * 
     * @param {Omit<InstanceParams, 'config' | 'id'>} params Parameters to initialize 
     * the object instance.
     * @returns {Create} The newly created operation.
     */
    static fromParams(params) {
        return new Create({
            is_black: params.isBlack ?? false,
            gt_class_id: params.gtClassId ?? null,
        });
    }

    /**
     * Applies this operation to a collection of object instanceing labels.
     * 
     * @param {SegmentationIndex} index The index to update.
     */
    applyIndex(index) {
        if (this.#newInstance !== undefined) {
            throw new Error('Cannot reapply an operation');
        }

        const params = this.opParams;
        this.#newInstance = index.addLabelInstance({
            id: this.#newInstanceId,
            isBlack: params.is_black,
            gtClassId: params.gt_class_id,
        });
    }

    /**
     * Reverts the changes applied by this operation to a collection of
     * object instanceing labels.
     * 
     * @param {SegmentationIndex} index The index to update.
     */
    undoIndex(index) {
        if (this.#newInstance === undefined) {
            throw new Error('Cannot undo an operation that has not been applied');
        }

        index.deleteLabelInstance(this.#newInstance);

        this.#newInstance = undefined;
    }
}
