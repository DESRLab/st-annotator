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
 * @typedef {import('../../LabelClass').ReadonlyLabelClass} ReadonlyLabelClass
 */

/**
 * @typedef {import('../../LabelTrack').ReadonlyLabelTrack} ReadonlyLabelTrack
 */

/**
 * @typedef {{
 *     track_id: UUID;
 * }} UpdateParams
 */

/**
 * @template {UpdateParams} P
 * @template D
 * @augments {BBoxOperation<P, null>}
 */
export class Update extends BBoxOperation {

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
     * @param {ReadonlyLabelTrack} track The target object track.
     * @returns {D} The data to store.
     * @abstract
     */
    getData(track) {
        throw new Error('Not implemented');
    }

    /**
     * Applies this operation to an object track.
     * 
     * @protected
     * @param {BBoxIndex} index The index to update.
     * @param {ReadonlyLabelTrack} track The target object track.
     * @param {P} params The parameters of this operation.
     * @abstract
     */
    applyTrack(index, track, params) {
        throw new Error('Not implemented');
    }

    /**
     * Reverts the changes applied by this operation to an object track.
     * 
     * @protected
     * @param {BBoxIndex} index The index to update.
     * @param {ReadonlyLabelTrack} track The target object track.
     * @param {D} data The data stored when this operation was previously applied.
     * @abstract
     */
    undoTrack(index, track, data) {
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
        const track = index.getLabelTrack(params.track_id);

        this.#data = this.getData(track);
        this.applyTrack(index, track, params);
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
        const box = index.getLabelTrack(params.track_id);

        this.undoTrack(index, box, this.#data);
        this.#data = undefined;
    }
}

/**
 * @typedef {{
 *     track_id: UUID;
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
    get displayName() { return 'Assign Ground Truth Class'; }

    /**
     * The name of this operation, which is sent to the backend.
     * 
     * @type {string}
     */
    get opName() { return 'track-assign-class'; }

    /**
     * Creates a new operation from a set of (unserialized) parameters.
     * 
     * @param {ReadonlyLabelTrack} track The object track to update.
     * @param {?ReadonlyLabelClass} labelClass The object class to assign.
     * @returns {AssignClass} The newly created operation.
     */
    static fromParams(track, labelClass) {
        return new AssignClass({
            track_id: track.id,
            gt_class_id: labelClass?.id ?? null,
        });
    }

    /**
     * Gets the data to store so that this operation can be undone.
     * 
     * @protected
     * @param {ReadonlyLabelTrack} track The target object track.
     * @returns {?number} The data to store.
     */
    getData(track) {
        return track.gtClassId;
    }

    /**
     * Applies this operation to an object track.
     * 
     * @protected
     * @param {BBoxIndex} index The index to update.
     * @param {ReadonlyLabelTrack} track The target object track.
     * @param {AssignClassParams} params The parameters of this operation.
     */
    applyTrack(index, track, params) {
        index.updateLabelTrack(track, { gtClassId: params.gt_class_id });
    }

    /**
     * Reverts the changes applied by this operation to an object track.
     * 
     * @protected
     * @param {BBoxIndex} index The index to update.
     * @param {ReadonlyLabelTrack} track The target object track.
     * @param {?number} data The data stored when this operation was previously applied.
     */
    undoTrack(index, track, data) {
        index.updateLabelTrack(track, { gtClassId: data });
    }
}

/**
 * @typedef {{
 *     track_id: UUID;
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
    get opName() { return 'track-assign-is-black'; }

    /**
     * Creates a new operation from a set of (unserialized) parameters.
     * 
     * @param {ReadonlyLabelTrack} track The object track to update.
     * @param {boolean} isBlack `true` if the object has low reflectivity; otherwise, `false`.
     * @returns {AssignIsBlack} The newly created operation.
     */
    static fromParams(track, isBlack) {
        return new AssignIsBlack({
            track_id: track.id,
            is_black: isBlack,
        });
    }

    /**
     * Gets the data to store so that this operation can be undone.
     * 
     * @protected
     * @param {ReadonlyLabelTrack} track The target object track.
     * @returns {boolean} The data to store.
     */
    getData(track) {
        return track.isBlack;
    }

    /**
     * Applies this operation to an object track.
     * 
     * @protected
     * @param {BBoxIndex} index The index to update.
     * @param {ReadonlyLabelTrack} track The target object track.
     * @param {AssignIsBlackParams} params The parameters of this operation.
     */
    applyTrack(index, track, params) {
        index.updateLabelTrack(track, { isBlack: params.is_black });
    }

    /**
     * Reverts the changes applied by this operation to an object track.
     * 
     * @protected
     * @param {BBoxIndex} index The index to update.
     * @param {ReadonlyLabelTrack} track The target object track.
     * @param {boolean} data The data stored when this operation was previously applied.
     */
    undoTrack(index, track, data) {
        index.updateLabelTrack(track, { isBlack: data });
    }
}
