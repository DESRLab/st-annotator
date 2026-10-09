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
 * @typedef {import('../../BBoxView').TrackParams} TrackParams
 */

/**
 * @typedef {import('../../LabelTrack').ReadonlyLabelTrack} ReadonlyLabelTrack
 */

/**
 * @typedef {{
 *     track_id: UUID;
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
    get displayName() { return 'Delete Object Track'; }

    /**
     * The name of this operation, which is sent to the backend.
     * 
     * @type {string}
     */
    get opName() { return 'track-delete'; }

    /**
     * The result of this operation, expressed as a {@link Placeholder}.
     * 
     * It is resolved with the value returned from the backend after it is pushed there.
     * 
     * @type {null}
     */
    get opResult() { return null; }

    /**
     * @type {TrackParams | undefined}
     */
    #deletedTrackParams = undefined;

    /**
     * Creates a new operation from a set of (unserialized) parameters.
     * 
     * @param {ReadonlyLabelTrack} track The object track to remove.
     * @returns {Delete} The newly created operation.
     */
    static fromParams(track) {
        return new Delete({
            track_id: track.id,
        });
    }

    /**
     * Applies this operation to a collection of bounding box labels.
     * 
     * @param {BBoxIndex} index The index to update.
     */
    applyIndex(index) {
        if (this.#deletedTrackParams !== undefined) {
            throw new Error('Cannot reapply an operation');
        }

        const params = this.opParams;
        const track = index.getLabelTrack(params.track_id);

        this.#deletedTrackParams = track;
        index.deleteLabelTrack(track);
    }

    /**
     * Reverts the changes applied by this operation to a collection of
     * bounding box labels.
     * 
     * @param {BBoxIndex} index The index to update.
     */
    undoIndex(index) {
        if (this.#deletedTrackParams === undefined) {
            throw new Error('Cannot undo an operation that has not been applied');
        }

        index.addLabelTrack(this.#deletedTrackParams);

        this.#deletedTrackParams = undefined;
    }
}
