import { DecimalVector3Data } from 'sta/common/spatial';
import { Timestamp } from 'sta/common/utils';
import { Placeholder } from 'sta/services/editor/base';

import { getDistinctiveLvByValue, getOcclusionLvByValue } from '../../../../../../label/lib';

import { BBoxOperation } from '../BBoxOperation';

/**
 * @typedef {import('../../models').UUID} UUID
 */

/**
 * @typedef {import('../../../../../../label/lib').BoxType} BoxType
 */

/**
 * @typedef {import('../../BBoxIndex').BoxParams} BoxParams
 */

/**
 * @typedef {import('../../BBoxIndex').BBoxIndex} BBoxIndex
 */

/**
 * @typedef {import('../../LabelBox').ReadonlyLabelBox} ReadonlyLabelBox
 */

/**
 * @typedef {{
 *     entity_id: ?UUID;
 *     type: BoxType;
 *     center: DecimalVector3Data;
 *     angle: string;
 *     size: DecimalVector3Data;
 *     timestamp: ?string;
 *     quality_rank: ?number;
 *     distinctive_lv: ?number;
 *     occlusion_lv: ?number;
 *     perceived_class_id: ?number;
 * }} CreateParamsData
 */

/**
 * @augments {BBoxOperation<CreateParamsData, string>}
 */
export class Create extends BBoxOperation {

    /**
     * The display name of this operation.
     * 
     * @type {string}
     */
    get displayName() { return 'Create Bounding Box'; }

    /**
     * The name of this operation, which is sent to the backend.
     * 
     * @type {string}
     */
    get opName() { return 'box-create'; }

    /**
     * @type {Placeholder<string>}
     */
    #newBoxId = new Placeholder();

    /**
     * The result of this operation, expressed as a {@link Placeholder}.
     * 
     * It is resolved with the value returned from the backend after it is pushed there.
     * 
     * @type {Placeholder<string>}
     */
    get opResult() { return this.#newBoxId; }

    /**
     * @type {ReadonlyLabelBox | undefined}
     */
    #newBox = undefined;

    /**
     * @type {ReadonlyLabelBox | undefined}
     */
    get newBox() { return this.#newBox; }

    /**
     * Creates a new operation from a set of (unserialized) parameters.
     * 
     * @param {Omit<BoxParams, 'config' | 'id'>} params Parameters to initialize the bounding box.
     * @returns {Create} The newly created operation.
     */
    static fromParams(params) {
        return new Create({
            entity_id: params.entityId ?? null,
            timestamp: params.timestamp?.toJSON() ?? null,
            type: params.boxType,
            center: DecimalVector3Data.fromVector3(params.center),
            angle: params.angle.toString(),
            size: DecimalVector3Data.fromVector3(params.size),
            quality_rank: params.qualityRank ?? null,
            distinctive_lv: params.distinctiveLv?.toJSON() ?? null,
            occlusion_lv: params.occlusionLv?.toJSON() ?? null,
            perceived_class_id: params.perceivedClassId ?? null,
        });
    }

    /**
     * Applies this operation to a collection of bounding box labels.
     * 
     * @param {BBoxIndex} index The index to update.
     */
    applyIndex(index) {
        if (this.#newBox !== undefined) {
            throw new Error('Cannot reapply an operation');
        }

        const params = this.opParams;
        this.#newBox = index.addLabelBox({
            id: this.#newBoxId,
            entityId: params.entity_id,
            boxType: params.type,
            center: params.center.toVector3(),
            angle: Number(params.angle),
            size: params.size.toVector3(),
            timestamp: params.timestamp == null ? null : new Timestamp(params.timestamp),
            qualityRank: params.quality_rank,
            distinctiveLv: getDistinctiveLvByValue(params.distinctive_lv),
            occlusionLv: getOcclusionLvByValue(params.occlusion_lv),
            perceivedClassId: params.perceived_class_id,
        });
    }

    /**
     * Reverts the changes applied by this operation to a collection of
     * bounding box labels.
     * 
     * @param {BBoxIndex} index The index to update.
     */
    undoIndex(index) {
        if (this.#newBox === undefined) {
            throw new Error('Cannot undo an operation that has not been applied');
        }

        index.deleteLabelBox(this.#newBox);

        this.#newBox = undefined;
    }
}
