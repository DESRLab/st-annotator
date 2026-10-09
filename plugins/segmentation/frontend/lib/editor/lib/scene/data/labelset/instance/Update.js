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
 * @typedef {import('../../LabelClass').ReadonlyLabelClass} ReadonlyLabelClass
 */

/**
 * @typedef {import('../../LabelInstance').ReadonlyLabelInstance} ReadonlyLabelInstance
 */

/**
 * @typedef {{
 *     instance_id: UUID;
 * }} UpdateParams
 */

/**
 * @template {UpdateParams} P
 * @template D
 * @augments {SegmentationOperation<P, null>}
 */
export class Update extends SegmentationOperation {

    /**
     * The result of this operation, expressed as a {@link Placeholder}.
     * 
     * It is resolved with the value returned from the backend after it is pushed there.
     * 
     * @type {null}
     */
    get opResult() { return null; }

    /**
     * @type {D | undefined}
     */
    #data = undefined;

    /**
     * Gets the data to store so that this operation can be undone.
     * 
     * @protected
     * @param {ReadonlyLabelInstance} instance The target object instance.
     * @returns {D} The data to store.
     * @abstract
     */
    getData(instance) {
        throw new Error('Not implemented');
    }

    /**
     * Applies this operation to an object instance.
     * 
     * @protected
     * @param {SegmentationIndex} index The index to update.
     * @param {ReadonlyLabelInstance} instance The target object instance.
     * @param {P} params The parameters of this operation.
     * @abstract
     */
    applyInstance(index, instance, params) {
        throw new Error('Not implemented');
    }

    /**
     * Reverts the changes applied by this operation to an object instance.
     * 
     * @protected
     * @param {SegmentationIndex} index The index to update.
     * @param {ReadonlyLabelInstance} instance The target object instance.
     * @param {D} data The data stored when this operation was previously applied.
     * @abstract
     */
    undoInstance(index, instance, data) {
        throw new Error('Not implemented');
    }

    /**
     * Applies this operation to a collection of object instanceing labels.
     * 
     * @param {SegmentationIndex} index The index to update.
     */
    applyIndex(index) {
        if (this.#data !== undefined) {
            throw new Error('Cannot undo an operation that has not been applied');
        }

        const params = this.opParams;
        const instance = index.getLabelInstance(params.instance_id);

        this.#data = this.getData(instance);
        this.applyInstance(index, instance, params);
    }

    /**
     * Reverts the changes applied by this operation to a collection of
     * object instanceing labels.
     * 
     * @param {SegmentationIndex} index The index to update.
     */
    undoIndex(index) {
        if (this.#data === undefined) {
            throw new Error('Cannot undo an operation that has not been applied');
        }

        const params = this.opParams;
        const box = index.getLabelInstance(params.instance_id);

        this.undoInstance(index, box, this.#data);
        this.#data = undefined;
    }
}

/**
 * @typedef {{
 *     instance_id: UUID;
 *     gt_class_id: ?number;
 * }} AssignClassParams
 */

/**
 * @augments {Update<AssignClassParams, ?number>}
 */
export class AssignClass extends Update {

    /**
     * The display name of this operation.
     * 
     * @type {string}
     */
    get displayName() { return 'Assign Instance Ground Truth Class'; }

    /**
     * The name of this operation, which is sent to the backend.
     * 
     * @type {string}
     */
    get opName() { return 'instance-assign-class'; }

    /**
     * Creates a new operation from a set of (unserialized) parameters.
     * 
     * @param {ReadonlyLabelInstance} instance The object instance to update.
     * @param {?ReadonlyLabelClass} labelClass The object class to assign.
     * @returns {AssignClass} The newly created operation.
     */
    static fromParams(instance, labelClass) {
        return new AssignClass({
            instance_id: instance.id,
            gt_class_id: labelClass?.id ?? null,
        });
    }

    /**
     * Gets the data to store so that this operation can be undone.
     * 
     * @protected
     * @param {ReadonlyLabelInstance} instance The target object instance.
     * @returns {?number} The data to store.
     */
    getData(instance) {
        return instance.gtClassId;
    }

    /**
     * Applies this operation to an object instance.
     * 
     * @protected
     * @param {SegmentationIndex} index The index to update.
     * @param {ReadonlyLabelInstance} instance The target object instance.
     * @param {AssignClassParams} params The parameters of this operation.
     */
    applyInstance(index, instance, params) {
        index.updateLabelInstance(instance, { gtClassId: params.gt_class_id });
    }

    /**
     * Reverts the changes applied by this operation to an object instance.
     * 
     * @protected
     * @param {SegmentationIndex} index The index to update.
     * @param {ReadonlyLabelInstance} instance The target object instance.
     * @param {?number} data The data stored when this operation was previously applied.
     */
    undoInstance(index, instance, data) {
        index.updateLabelInstance(instance, { gtClassId: data });
    }
}

/**
 * @typedef {{
 *     instance_id: UUID;
 *     is_black: boolean;
 * }} AssignIsBlackParams
 */

/**
 * @augments {Update<AssignIsBlackParams, boolean>}
 */
export class AssignIsBlack extends Update {

    /**
     * The display name of this operation.
     * 
     * @type {string}
     */
    get displayName() { return 'Set Is Black'; }

    /**
     * The name of this operation, which is sent to the backend.
     * 
     * @type {string}
     */
    get opName() { return 'instance-assign-is-black'; }

    /**
     * Creates a new operation from a set of (unserialized) parameters.
     * 
     * @param {ReadonlyLabelInstance} instance The object instance to update.
     * @param {boolean} isBlack `true` if the object has low reflectivity; otherwise, `false`.
     * @returns {AssignIsBlack} The newly created operation.
     */
    static fromParams(instance, isBlack) {
        return new AssignIsBlack({
            instance_id: instance.id,
            is_black: isBlack,
        });
    }

    /**
     * Gets the data to store so that this operation can be undone.
     * 
     * @protected
     * @param {ReadonlyLabelInstance} instance The target object instance.
     * @returns {boolean} The data to store.
     */
    getData(instance) {
        return instance.isBlack;
    }

    /**
     * Applies this operation to an object instance.
     * 
     * @protected
     * @param {SegmentationIndex} index The index to update.
     * @param {ReadonlyLabelInstance} instance The target object instance.
     * @param {AssignIsBlackParams} params The parameters of this operation.
     */
    applyInstance(index, instance, params) {
        index.updateLabelInstance(instance, { isBlack: params.is_black });
    }

    /**
     * Reverts the changes applied by this operation to an object instance.
     * 
     * @protected
     * @param {SegmentationIndex} index The index to update.
     * @param {ReadonlyLabelInstance} instance The target object instance.
     * @param {boolean} data The data stored when this operation was previously applied.
     */
    undoInstance(index, instance, data) {
        index.updateLabelInstance(instance, { isBlack: data });
    }
}
