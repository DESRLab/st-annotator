import { DecimalVector3Data } from 'sta/common/spatial';
import { Timestamp } from 'sta/common/utils';
import { Placeholder } from 'sta/services/editor/base';

import { SegmentationOperation } from '../SegmentationOperation';
import { getDistinctiveLvByValue, getOcclusionLvByValue } from '../../../../../../label/lib';

/**
 * @typedef {import('../../models').UUID} UUID
 */

/**
 * @typedef {import('../../SegmentationIndex').SelectionParams} SelectionParams
 */

/**
 * @typedef {import('../../SegmentationIndex').SegmentationIndex} SegmentationIndex
 */

/**
 * @typedef {import('../../LabelSelection').ReadonlyLabelSelection} ReadonlyLabelSelection
 */

/**
 * @typedef {{
 *     entity_id: ?UUID;
 *     timestamp: ?string;
 *     points: DecimalVector3Data[];
 *     quality_rank: ?number;
 *     distinctive_lv: ?number;
 *     occlusion_lv: ?number;
 *     perceived_class_id: ?number;
 * }} CreateParamsData
 */

/**
 * @augments {SegmentationOperation<CreateParamsData, string>}
 */
export class Create extends SegmentationOperation {

    /**
     * The display name of this operation.
     * 
     * @type {string}
     */
    get displayName() { return 'Create a Selection'; }

    /**
     * The name of this operation, which is sent to the backend.
     * 
     * @type {string}
     */
    get opName() { return 'selection-create'; }

    /**
     * @type {Placeholder<string>}
     */
    #newSelectionId = new Placeholder();

    /**
     * The result of this operation, expressed as a {@link Placeholder}.
     * 
     * It is resolved with the value returned from the backend after it is pushed there.
     * 
     * @type {Placeholder<string>}
     */
    get opResult() { return this.#newSelectionId; }

    /**
     * @type {ReadonlyLabelSelection | undefined}
     */
    #newSelection = undefined;

    /**
     * @type {ReadonlyLabelSelection | undefined}
     */
    get newSelection() { return this.#newSelection; }

    /**
     * Creates a new operation from a set of (unserialized) parameters.
     * 
     * @param {Omit<SelectionParams, 'config' | 'id'>} params Parameters to initialize 
     * the selection.
     * @returns {Create} The newly created operation.
     */
    static fromParams(params) {
        return new Create({
            entity_id: params.entityId ?? null,
            points: params.points.map(DecimalVector3Data.fromVector3),
            timestamp: params.timestamp?.toJSON() ?? null,
            quality_rank: params.qualityRank ?? null,
            distinctive_lv: params.distinctiveLv?.toJSON() ?? null,
            occlusion_lv: params.occlusionLv?.toJSON() ?? null,
            perceived_class_id: params.perceivedClassId ?? null,
        });
    }

    /**
     * Applies this operation to a collection of segmentation labels.
     * 
     * @param {SegmentationIndex} index The index to update.
     */
    applyIndex(index) {
        if (this.#newSelection !== undefined) {
            throw new Error('Cannot reapply an operation');
        }

        const params = this.opParams;
        this.#newSelection = index.addLabelSelection({
            id: this.#newSelectionId,
            entityId: params.entity_id,
            points: params.points.map((point) => point.toVector3()),
            timestamp: params.timestamp == null ? null : new Timestamp(params.timestamp),
            qualityRank: params.quality_rank,
            distinctiveLv: getDistinctiveLvByValue(params.distinctive_lv),
            occlusionLv: getOcclusionLvByValue(params.occlusion_lv),
            perceivedClassId: params.perceived_class_id,
        });
    }

    /**
     * Reverts the changes applied by this operation to a collection of
     * segmentation labels.
     * 
     * @param {SegmentationIndex} index The index to update.
     */
    undoIndex(index) {
        if (this.#newSelection === undefined) {
            throw new Error('Cannot undo an operation that has not been applied');
        }

        index.deleteLabelSelection(this.#newSelection);

        this.#newSelection = undefined;
    }
}
