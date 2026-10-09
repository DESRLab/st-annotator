import { DecimalVector3Data } from 'sta/common/spatial';

import { getDistinctiveLvByValue, getOcclusionLvByValue } from '../../../../../../label/lib';

import { BBoxOperation } from '../BBoxOperation';

/**
 * @typedef {import('three')} THREE
 */

/**
 * @template {{} | null} T
 * @typedef {import('sta/services/editor/base').Placeholder<T>} Placeholder
 */

/**
 * @typedef {import('../../../../../../label/lib').BoxType} BoxType
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
 * @typedef {import('../../BBoxIndex').BBoxIndex} BBoxIndex
 */

/**
 * @typedef {import('../../LabelBox').ReadonlyLabelBox} ReadonlyLabelBox
 */

/**
 * @typedef {import('../../LabelClass').ReadonlyLabelClass} ReadonlyLabelClass
 */

/**
 * @typedef {import('../../LabelTrack').ReadonlyLabelTrack} ReadonlyLabelTrack
 */

/**
 * @typedef {{
 *     box_id: UUID;
 * }} UpdateParams
 */

/**
 * @template {UpdateParams} P
 * @template D
 * @augments {BBoxOperation<P, null>}
 */
class Update extends BBoxOperation {

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
     * @param {ReadonlyLabelBox} box The target bounding box.
     * @returns {D} The data to store.
     * @abstract
     */
    getData(box) {
        throw new Error('Not implemented');
    }

    /**
     * Applies this operation to a bounding box.
     * 
     * @protected
     * @param {BBoxIndex} index The index to update.
     * @param {ReadonlyLabelBox} box The target bounding box.
     * @param {P} params The parameters of this operation.
     * @abstract
     */
    applyBox(index, box, params) {
        throw new Error('Not implemented');
    }

    /**
     * Reverts the changes applied by this operation to a bounding box.
     * 
     * @protected
     * @param {BBoxIndex} index The index to update.
     * @param {ReadonlyLabelBox} box The target bounding box.
     * @param {D} data The data stored when this operation was previously applied.
     * @abstract
     */
    undoBox(index, box, data) {
        throw new Error('Not implemented');
    }

    /**
     * Applies this operation to a collection of bounding box labels.
     * 
     * @param {BBoxIndex} index The index to update.
     */
    applyIndex(index) {
        if (this.#data !== undefined) {
            throw new Error('Cannot undo an operation that has not been applied');
        }

        const params = this.opParams;
        const box = index.getLabelBox(params.box_id);

        this.#data = this.getData(box);
        this.applyBox(index, box, params);
    }

    /**
     * Reverts the changes applied by this operation to a collection of
     * bounding box labels.
     * 
     * @param {BBoxIndex} index The index to update.
     */
    undoIndex(index) {
        if (this.#data === undefined) {
            throw new Error('Cannot undo an operation that has not been applied');
        }

        const params = this.opParams;
        const box = index.getLabelBox(params.box_id);

        this.undoBox(index, box, this.#data);
        this.#data = undefined;
    }
}

/**
 * @typedef {{
 *     box_id: UUID;
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
    get displayName() { return 'Assign Object Track'; }

    /**
     * The name of this operation, which is sent to the backend.
     * 
     * @type {string}
     */
    get opName() { return 'box-assign-entity'; }

    /**
     * Creates a new operation from a set of (unserialized) parameters.
     * 
     * @param {ReadonlyLabelBox} box The bounding box to update.
     * @param {?ReadonlyLabelTrack} track The object track to assign.
     * @returns {AssignEntity} The newly created operation.
     */
    static fromParams(box, track) {
        return new AssignEntity({
            box_id: box.id,
            entity_id: track?.id ?? null,
        });
    }

    /**
     * Gets the data to store so that this operation can be undone.
     * 
     * @protected
     * @param {ReadonlyLabelBox} box The target bounding box.
     * @returns {?UUID} The data to store.
     */
    getData(box) {
        return box.entityId;
    }

    /**
     * Applies this operation to a bounding box.
     * 
     * @protected
     * @param {BBoxIndex} index The index to update.
     * @param {ReadonlyLabelBox} box The target bounding box.
     * @param {AssignEntityParams} params The parameters of this operation.
     */
    applyBox(index, box, params) {
        index.updateLabelBox(box, { entityId: params.entity_id });
    }

    /**
     * Reverts the changes applied by this operation to a bounding box.
     * 
     * @protected
     * @param {BBoxIndex} index The index to update.
     * @param {ReadonlyLabelBox} box The target bounding box.
     * @param {?UUID} data The data stored when this operation was previously applied.
     */
    undoBox(index, box, data) {
        index.updateLabelBox(box, { entityId: data });
    }
}

/**
 * @typedef {{
 *     box_id: UUID;
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
    get displayName() { return 'Assign Perceived Class'; }

    /**
     * The name of this operation, which is sent to the backend.
     * 
     * @type {string}
     */
    get opName() { return 'box-assign-class'; }

    /**
     * Creates a new operation from a set of (unserialized) parameters.
     * 
     * @param {ReadonlyLabelBox} box The bounding box to update.
     * @param {?ReadonlyLabelClass} labelClass The object class to assign.
     * @returns {AssignClass} The newly created operation.
     */
    static fromParams(box, labelClass) {
        return new AssignClass({
            box_id: box.id,
            perceived_class_id: labelClass?.id ?? null,
        });
    }

    /**
     * Gets the data to store so that this operation can be undone.
     * 
     * @protected
     * @param {ReadonlyLabelBox} box The target bounding box.
     * @returns {?number} The data to store.
     */
    getData(box) {
        return box.perceivedClassId;
    }

    /**
     * Applies this operation to a bounding box.
     * 
     * @protected
     * @param {BBoxIndex} index The index to update.
     * @param {ReadonlyLabelBox} box The target bounding box.
     * @param {AssignClassParams} params The parameters of this operation.
     */
    applyBox(index, box, params) {
        index.updateLabelBox(box, { perceivedClassId: params.perceived_class_id });
    }

    /**
     * Reverts the changes applied by this operation to a bounding box.
     * 
     * @protected
     * @param {BBoxIndex} index The index to update.
     * @param {ReadonlyLabelBox} box The target bounding box.
     * @param {?number} data The data stored when this operation was previously applied.
     */
    undoBox(index, box, data) {
        index.updateLabelBox(box, { perceivedClassId: data });
    }
}

/**
 * @typedef {{
 *     box_id: UUID;
 *     box_type: BoxType;
 * }} AssignTypeParams
 */

/**
 * @augments {Update<AssignTypeParams, BoxType>}
 */
export class AssignType extends Update {

    /**
     * The display name of this operation.
     * 
     * @type {string}
     */
    get displayName() { return 'Update Geometry Type'; }

    /**
     * The name of this operation, which is sent to the backend.
     * 
     * @type {string}
     */
    get opName() { return 'box-assign-type'; }

    /**
     * Creates a new operation from a set of (unserialized) parameters.
     * 
     * @param {ReadonlyLabelBox} box The bounding box to update.
     * @param {BoxType} boxType The type of bounding box to assign.
     * @returns {AssignType} The newly created operation.
     */
    static fromParams(box, boxType) {
        return new AssignType({
            box_id: box.id,
            box_type: boxType,
        });
    }

    /**
     * Gets the data to store so that this operation can be undone.
     * 
     * @protected
     * @param {ReadonlyLabelBox} box The target bounding box.
     * @returns {BoxType} The data to store.
     */
    getData(box) {
        return box.boxType;
    }

    /**
     * Applies this operation to a bounding box.
     * 
     * @protected
     * @param {BBoxIndex} index The index to update.
     * @param {ReadonlyLabelBox} box The target bounding box.
     * @param {AssignTypeParams} params The parameters of this operation.
     */
    applyBox(index, box, params) {
        index.updateLabelBox(box, { boxType: params.box_type });
    }

    /**
     * Reverts the changes applied by this operation to a bounding box.
     * 
     * @protected
     * @param {BBoxIndex} index The index to update.
     * @param {ReadonlyLabelBox} box The target bounding box.
     * @param {BoxType} data The data stored when this operation was previously applied.
     */
    undoBox(index, box, data) {
        index.updateLabelBox(box, { boxType: data });
    }
}

/**
 * @typedef {{
 *     box_id: UUID;
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
    get opName() { return 'box-assign-distinctive-level'; }

    /**
     * Creates a new operation from a set of (unserialized) parameters.
     * 
     * @param {ReadonlyLabelBox} box The bounding box to update.
     * @param {DistinctiveLevel} distinctiveLv The distinctiveness level to assign.
     * @returns {AssignDistinctiveLv} The newly created operation.
     */
    static fromParams(box, distinctiveLv) {
        return new AssignDistinctiveLv({
            box_id: box.id,
            distinctive_lv: distinctiveLv.toJSON(),
        });
    }

    /**
     * Gets the data to store so that this operation can be undone.
     * 
     * @protected
     * @param {ReadonlyLabelBox} box The target bounding box.
     * @returns {DistinctiveLevel} The data to store.
     */
    getData(box) {
        return box.distinctiveLv;
    }

    /**
     * Applies this operation to a bounding box.
     * 
     * @protected
     * @param {BBoxIndex} index The index to update.
     * @param {ReadonlyLabelBox} box The target bounding box.
     * @param {AssignDistinctiveLvParams} params The parameters of this operation.
     */
    applyBox(index, box, params) {
        index.updateLabelBox(box, {
            distinctiveLv: getDistinctiveLvByValue(params.distinctive_lv),
        });
    }

    /**
     * Reverts the changes applied by this operation to a bounding box.
     * 
     * @protected
     * @param {BBoxIndex} index The index to update.
     * @param {ReadonlyLabelBox} box The target bounding box.
     * @param {DistinctiveLevel} data The data stored when this operation was previously
     * applied.
     */
    undoBox(index, box, data) {
        index.updateLabelBox(box, { distinctiveLv: data });
    }
}

/**
 * @typedef {{
 *     box_id: UUID;
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
    get opName() { return 'box-assign-occlusion-level'; }

    /**
     * Creates a new operation from a set of (unserialized) parameters.
     * 
     * @param {ReadonlyLabelBox} box The bounding box to update.
     * @param {OcclusionLevel} occlusionLv The occlusion level to assign.
     * @returns {AssignOcclusionLv} The newly created operation.
     */
    static fromParams(box, occlusionLv) {
        return new AssignOcclusionLv({
            box_id: box.id,
            occlusion_lv: occlusionLv.toJSON(),
        });
    }

    /**
     * Gets the data to store so that this operation can be undone.
     * 
     * @protected
     * @param {ReadonlyLabelBox} box The target bounding box.
     * @returns {OcclusionLevel} The data to store.
     */
    getData(box) {
        return box.occlusionLv;
    }

    /**
     * Applies this operation to a bounding box.
     * 
     * @protected
     * @param {BBoxIndex} index The index to update.
     * @param {ReadonlyLabelBox} box The target bounding box.
     * @param {AssignOcclusionLvParams} params The parameters of this operation.
     */
    applyBox(index, box, params) {
        index.updateLabelBox(box, {
            occlusionLv: getOcclusionLvByValue(params.occlusion_lv),
        });
    }

    /**
     * Reverts the changes applied by this operation to a bounding box.
     * 
     * @protected
     * @param {BBoxIndex} index The index to update.
     * @param {ReadonlyLabelBox} box The target bounding box.
     * @param {OcclusionLevel} data The data stored when this operation was previously applied.
     */
    undoBox(index, box, data) {
        index.updateLabelBox(box, { occlusionLv: data });
    }
}

/**
 * @typedef {{
 *     center: THREE.Vector3;
 *     angle: number;
 *     size: THREE.Vector3;
 * }} BoxPose
 */

/**
 * @typedef {{
 *     box_id: UUID;
 *     mode: string;
 *     center: DecimalVector3Data;
 *     angle: string;
 *     size: DecimalVector3Data;
 * }} TransformBoxParams
 */

/**
 * @augments {Update<TransformBoxParams, BoxPose>}
 */
export class TransformBox extends Update {

    /**
     * The display name of this operation.
     * 
     * @type {string}
     */
    get displayName() { return 'Transform Box'; }

    /**
     * The name of this operation, which is sent to the backend.
     * 
     * @type {string}
     */
    get opName() { return 'box-transform'; }

    /**
     * Creates a new operation from a set of (unserialized) parameters.
     * 
     * @param {ReadonlyLabelBox} box The bounding box that has been transformed.
     * @param {string} mode The mode of transformation.
     * @param {BoxPose} pose The pose to assign to the bounding box.
     * @returns {TransformBox} The newly created operation.
     */
    static fromParams(box, mode, pose) {
        return new TransformBox({
            box_id: box.id,
            mode: mode,
            center: DecimalVector3Data.fromVector3(pose.center),
            angle: pose.angle.toString(),
            size: DecimalVector3Data.fromVector3(pose.size),
        });
    }

    /**
     * Gets the data to store so that this operation can be undone.
     * 
     * @protected
     * @param {ReadonlyLabelBox} box The target bounding box.
     * @returns {BoxPose} The data to store.
     */
    getData(box) {
        return {
            center: box.center.clone(),
            angle: box.angle,
            size: box.size.clone(),
        };
    }

    /**
     * Applies this operation to a bounding box.
     * 
     * @protected
     * @param {BBoxIndex} index The index to update.
     * @param {ReadonlyLabelBox} box The target bounding box.
     * @param {TransformBoxParams} params The parameters of this operation.
     */
    applyBox(index, box, params) {
        index.updateLabelBox(box, {
            center: params.center.toVector3(),
            angle: Number(params.angle),
            size: params.size.toVector3(),
        });
    }

    /**
     * Reverts the changes applied by this operation to a bounding box.
     * 
     * @protected
     * @param {BBoxIndex} index The index to update.
     * @param {ReadonlyLabelBox} box The target bounding box.
     * @param {BoxPose} data The data stored when this operation was previously applied.
     */
    undoBox(index, box, data) {
        index.updateLabelBox(box, {
            center: data.center.clone(),
            angle: data.angle,
            size: data.size.clone(),
        });
    }
}
