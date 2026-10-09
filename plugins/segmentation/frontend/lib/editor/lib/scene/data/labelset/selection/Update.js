import { DecimalVector3Data } from 'sta/common/spatial';
import { SegmentationOperation } from '../SegmentationOperation';

import { getDistinctiveLvByValue, getOcclusionLvByValue } from '../../../../../../label/lib';

/**
 * @typedef {import('three')} THREE
 */

/**
 * @template {{} | null} T
 * @typedef {import('sta/services/editor/base').Placeholder<T>} Placeholder
 */

/**
 * @typedef {import('../../../../../../label/lib').DistinctiveLevel} DistinctiveLevel
 */

/**
 * @typedef {import('../../../../../../label/lib').OcclusionLevel} OcclusionLevel
 */

/**
 * @typedef {import('../../models').UUID} UUID
 */

/**
 * @typedef {import('../../SegmentationIndex').SegmentationIndex} SegmentationIndex
 */

/**
 * @typedef {import('../../LabelSelection').ReadonlyLabelSelection} ReadonlyLabelSelection
 */

/**
 * @typedef {import('../../LabelClass').ReadonlyLabelClass} ReadonlyLabelClass
 */

/**
 * @typedef {import('../../LabelInstance').ReadonlyLabelInstance} ReadonlyLabelInstance
 */

/**
 * @typedef {{
 *     selection_id: UUID;
 * }} UpdateParams
 */

/**
 * @template {UpdateParams} P
 * @template D
 * @augments {SegmentationOperation<P, null>}
 */
class Update extends SegmentationOperation {

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
     * @param {ReadonlyLabelSelection} selection The target a selection.
     * @returns {D} The data to store.
     * @abstract
     */
    getData(selection) {
        throw new Error('Not implemented');
    }

    /**
     * Applies this operation to a a selection.
     * 
     * @protected
     * @param {SegmentationIndex} index The index to update.
     * @param {ReadonlyLabelSelection} selection The target a selection.
     * @param {P} params The parameters of this operation.
     * @abstract
     */
    applySelection(index, selection, params) {
        throw new Error('Not implemented');
    }

    /**
     * Reverts the changes applied by this operation to a a selection.
     * 
     * @protected
     * @param {SegmentationIndex} index The index to update.
     * @param {ReadonlyLabelSelection} selection The target a selection.
     * @param {D} data The data stored when this operation was previously applied.
     * @abstract
     */
    undoSelection(index, selection, data) {
        throw new Error('Not implemented');
    }

    /**
     * Applies this operation to a collection of segmentation labels.
     * 
     * @param {SegmentationIndex} index The index to update.
     */
    applyIndex(index) {
        if (this.#data !== undefined) {
            throw new Error('Cannot undo an operation that has not been applied');
        }

        const params = this.opParams;
        const selection = index.getLabelSelection(params.selection_id);

        this.#data = this.getData(selection);
        this.applySelection(index, selection, params);
    }

    /**
     * Reverts the changes applied by this operation to a collection of
     * segmentation labels.
     * 
     * @param {SegmentationIndex} index The index to update.
     */
    undoIndex(index) {
        if (this.#data === undefined) {
            throw new Error('Cannot undo an operation that has not been applied');
        }

        const params = this.opParams;
        const selection = index.getLabelSelection(params.selection_id);

        this.undoSelection(index, selection, this.#data);
        this.#data = undefined;
    }
}

/**
 * @typedef {{
 *     selection_id: UUID;
 *     entity_id: ?UUID;
 * }} AssignEntityParams
 */

/**
 * @augments {Update<AssignEntityParams, ?UUID>}
 */
export class AssignEntity extends Update {

    /**
     * The display name of this operation.
     * 
     * @type {string}
     */
    get displayName() { return 'Assign Object Instance'; }

    /**
     * The name of this operation, which is sent to the backend.
     * 
     * @type {string}
     */
    get opName() { return 'selection-assign-entity'; }

    /**
     * Creates a new operation from a set of (unserialized) parameters.
     * 
     * @param {ReadonlyLabelSelection} selection The a selection to update.
     * @param {?ReadonlyLabelInstance} track The object track to assign.
     * @returns {AssignEntity} The newly created operation.
     */
    static fromParams(selection, track) {
        return new AssignEntity({
            selection_id: selection.id,
            entity_id: track?.id ?? null,
        });
    }

    /**
     * Gets the data to store so that this operation can be undone.
     * 
     * @protected
     * @param {ReadonlyLabelSelection} selection The target a selection.
     * @returns {?UUID} The data to store.
     */
    getData(selection) {
        return selection.entityId;
    }

    /**
     * Applies this operation to a a selection.
     * 
     * @protected
     * @param {SegmentationIndex} index The index to update.
     * @param {ReadonlyLabelSelection} selection The target a selection.
     * @param {AssignEntityParams} params The parameters of this operation.
     */
    applySelection(index, selection, params) {
        index.updateLabelSelection(selection, { entityId: params.entity_id });
    }

    /**
     * Reverts the changes applied by this operation to a a selection.
     * 
     * @protected
     * @param {SegmentationIndex} index The index to update.
     * @param {ReadonlyLabelSelection} selection The target a selection.
     * @param {?UUID} data The data stored when this operation was previously applied.
     */
    undoSelection(index, selection, data) {
        index.updateLabelSelection(selection, { entityId: data });
    }
}

/**
 * @typedef {{
 *     selection_id: UUID;
 *     perceived_class_id: ?number;
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
    get displayName() { return 'Assign Ground Truth'; }

    /**
     * The name of this operation, which is sent to the backend.
     * 
     * @type {string}
     */
    get opName() { return 'selection-assign-class'; }

    /**
     * Creates a new operation from a set of (unserialized) parameters.
     * 
     * @param {ReadonlyLabelSelection} selection The a selection to update.
     * @param {?ReadonlyLabelClass} labelClass The object class to assign.
     * @returns {AssignClass} The newly created operation.
     */
    static fromParams(selection, labelClass) {
        return new AssignClass({
            selection_id: selection.id,
            perceived_class_id: labelClass?.id ?? null,
        });
    }

    /**
     * Gets the data to store so that this operation can be undone.
     * 
     * @protected
     * @param {ReadonlyLabelSelection} selection The target a selection.
     * @returns {?number} The data to store.
     */
    getData(selection) {
        return selection.perceivedClassId;
    }

    /**
     * Applies this operation to a a selection.
     * 
     * @protected
     * @param {SegmentationIndex} index The index to update.
     * @param {ReadonlyLabelSelection} selection The target a selection.
     * @param {AssignClassParams} params The parameters of this operation.
     */
    applySelection(index, selection, params) {
        index.updateLabelSelection(selection, { perceivedClassId: params.perceived_class_id });
    }

    /**
     * Reverts the changes applied by this operation to a a selection.
     * 
     * @protected
     * @param {SegmentationIndex} index The index to update.
     * @param {ReadonlyLabelSelection} selection The target a selection.
     * @param {?number} data The data stored when this operation was previously applied.
     */
    undoSelection(index, selection, data) {
        index.updateLabelSelection(selection, { perceivedClassId: data });
    }
}

/**
 * @typedef {{
 *     selection_id: UUID;
 *     distinctive_lv: ?number;
 * }} AssignDistinctiveLvParams
 */

/**
 * @augments {Update<AssignDistinctiveLvParams, DistinctiveLevel>}
 */
export class AssignDistinctiveLv extends Update {

    /**
     * The display name of this operation.
     * 
     * @type {string}
     */
    get displayName() { return 'Set Distinctiveness Level'; }

    /**
     * The name of this operation, which is sent to the backend.
     * 
     * @type {string}
     */
    get opName() { return 'selection-assign-distinctive-level'; }

    /**
     * Creates a new operation from a set of (unserialized) parameters.
     * 
     * @param {ReadonlyLabelSelection} selection The a selection to update.
     * @param {DistinctiveLevel} distinctiveLv The distinctiveness level to assign.
     * @returns {AssignDistinctiveLv} The newly created operation.
     */
    static fromParams(selection, distinctiveLv) {
        return new AssignDistinctiveLv({
            selection_id: selection.id,
            distinctive_lv: distinctiveLv?.toJSON() ?? null,
        });
    }

    /**
     * Gets the data to store so that this operation can be undone.
     * 
     * @protected
     * @param {ReadonlyLabelSelection} selection The target a selection.
     * @returns {DistinctiveLevel} The data to store.
     */
    getData(selection) {
        return selection.distinctiveLv;
    }

    /**
     * Applies this operation to a a selection.
     * 
     * @protected
     * @param {SegmentationIndex} index The index to update.
     * @param {ReadonlyLabelSelection} selection The target a selection.
     * @param {AssignDistinctiveLvParams} params The parameters of this operation.
     */
    applySelection(index, selection, params) {
        index.updateLabelSelection(selection, {
            distinctiveLv: getDistinctiveLvByValue(params.distinctive_lv),
        });
    }

    /**
     * Reverts the changes applied by this operation to a a selection.
     * 
     * @protected
     * @param {SegmentationIndex} index The index to update.
     * @param {ReadonlyLabelSelection} selection The target a selection.
     * @param {DistinctiveLevel} data The data stored when this operation was previously
     * applied.
     */
    undoSelection(index, selection, data) {
        index.updateLabelSelection(selection, { distinctiveLv: data });
    }
}

/**
 * @typedef {{
 *     selection_id: UUID;
 *     occlusion_lv: ?number;
 * }} AssignOcclusionLvParams
 */

/**
 * @augments {Update<AssignOcclusionLvParams, OcclusionLevel>}
 */
export class AssignOcclusionLv extends Update {

    /**
     * The display name of this operation.
     * 
     * @type {string}
     */
    get displayName() { return 'Set Occlusion Level'; }

    /**
     * The name of this operation, which is sent to the backend.
     * 
     * @type {string}
     */
    get opName() { return 'selection-assign-occlusion-level'; }

    /**
     * Creates a new operation from a set of (unserialized) parameters.
     * 
     * @param {ReadonlyLabelSelection} selection The a selection to update.
     * @param {OcclusionLevel} occlusionLv The occlusion level to assign.
     * @returns {AssignOcclusionLv} The newly created operation.
     */
    static fromParams(selection, occlusionLv) {
        return new AssignOcclusionLv({
            selection_id: selection.id,
            occlusion_lv: occlusionLv?.toJSON() ?? null,
        });
    }

    /**
     * Gets the data to store so that this operation can be undone.
     * 
     * @protected
     * @param {ReadonlyLabelSelection} selection The target a selection.
     * @returns {OcclusionLevel} The data to store.
     */
    getData(selection) {
        return selection.occlusionLv;
    }

    /**
     * Applies this operation to a a selection.
     * 
     * @protected
     * @param {SegmentationIndex} index The index to update.
     * @param {ReadonlyLabelSelection} selection The target a selection.
     * @param {AssignOcclusionLvParams} params The parameters of this operation.
     */
    applySelection(index, selection, params) {
        index.updateLabelSelection(selection, {
            occlusionLv: getOcclusionLvByValue(params.occlusion_lv),
        });
    }

    /**
     * Reverts the changes applied by this operation to a a selection.
     * 
     * @protected
     * @param {SegmentationIndex} index The index to update.
     * @param {ReadonlyLabelSelection} selection The target a selection.
     * @param {OcclusionLevel} data The data stored when this operation was previously applied.
     */
    undoSelection(index, selection, data) {
        index.updateLabelSelection(selection, { occlusionLv: data });
    }
}

/**
 * @typedef {{
 *      points: ReadonlyArray<THREE.Vector3>;
 * }} PointSelection
 */

/**
 * @typedef {{
 *      selection_id: UUID;
 *      mode: string;
 *      points: DecimalVector3Data[];
 * }} EditPointSelectionParams
 */

/**
 * @augments {Update<EditPointSelectionParams, PointSelection>}
 */
export class EditPointSelection extends Update {

    /**
     * The display name of this operation.
     * 
     * @type {string}
     */
    get displayName() { return 'Edit Selection'; }

    /**
     * The name of this operation, which is sent to the backend.
     * 
     * @type {string}
     */
    get opName() { return 'selection-edit'; }

    /**
     * Creates a new operation from a set of (unserialized) parameters.
     * 
     * @param {ReadonlyLabelSelection} selection The a selection that has been edited.
     * @param {string} mode The mode of edit.
     * @param {PointSelection} params The paramter containing the 
     * points of a selection.
     * @returns {EditPointSelection} The newly created operation.
     */
    static fromParams(selection, mode, params) {
        return new EditPointSelection({
            selection_id: selection.id,
            mode: mode,
            points: params.points.map(DecimalVector3Data.fromVector3),
        });
    }

    /**
     * Gets the data to store so that this operation can be undone.
     * 
     * @protected
     * @param {ReadonlyLabelSelection} selection The target a selection.
     * @returns {PointSelection} The data to store.
     */
    getData(selection) {
        return {
            points: [...selection.points],
        };
    }

    /**
     * Applies this operation to a a selection.
     * 
     * @protected
     * @param {SegmentationIndex} index The index to update.
     * @param {ReadonlyLabelSelection} selection The target a selection.
     * @param {EditPointSelectionParams} params The parameters of this operation.
     */
    applySelection(index, selection, params) {
        index.updateLabelSelection(selection, {
            points: params.points.map((point) => point.toVector3()),
        });
    }

    /**
     * Reverts the changes applied by this operation to a a selection.
     * 
     * @protected
     * @param {SegmentationIndex} index The index to update.
     * @param {ReadonlyLabelSelection} selection The target a selection.
     * @param {PointSelection} data The data stored when this operation was previously applied.
     */
    undoSelection(index, selection, data) {
        index.updateLabelSelection(selection, {
            points: data.points,
        });
    }
}
