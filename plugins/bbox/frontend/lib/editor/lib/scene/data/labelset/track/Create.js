import { Placeholder } from 'sta/services/editor/base';

import { BBoxOperation } from '../BBoxOperation';

/**
 * @typedef {import('../../models').UUID} UUID
 */

/**
 * @typedef {import('../../BBoxIndex').BBoxIndex} BBoxIndex
 */

/**
 * @typedef {import('../../BBoxIndex').TrackParams} TrackParams
 */

/**
 * @typedef {import('../../LabelTrack').ReadonlyLabelTrack} ReadonlyLabelTrack
 */

/**
 * @typedef {{
 *     is_black: boolean;
 *     gt_class_id: ?number;
 * }} CreateParams
 */

/**
 * @augments {BBoxOperation<CreateParams, string>}
 */
export class Create extends BBoxOperation {

    /**
     * The display name of this operation.
     * 
     * @type {string}
     */
    get displayName() { return 'Create Object Track'; }

    /**
     * The name of this operation, which is sent to the backend.
     * 
     * @type {string}
     */
    get opName() { return 'track-create'; }

    /**
     * @type {Placeholder<string>}
     */
    #newTrackId = new Placeholder();

    /**
     * The result of this operation, expressed as a {@link Placeholder}.
     * 
     * It is resolved with the value returned from the backend after it is pushed there.
     * 
     * @type {Placeholder<string>}
     */
    get opResult() { return this.#newTrackId; }

    /**
     * @type {ReadonlyLabelTrack | undefined}
     */
    #newTrack = undefined;

    /**
     * @type {ReadonlyLabelTrack | undefined}
     */
    get newTrack() { return this.#newTrack; }

    /**
     * Creates a new operation from a set of (unserialized) parameters.
     * 
     * @param {Omit<TrackParams, 'config' | 'id'>} params Parameters to initialize the object track.
     * @returns {Create} The newly created operation.
     */
    static fromParams(params) {
        return new Create({
            is_black: params.isBlack ?? false,
            gt_class_id: params.gtClassId ?? null,
        });
    }

    /**
     * Applies this operation to a collection of bounding box labels.
     * 
     * @param {BBoxIndex} index The index to update.
     */
    applyIndex(index) {
        if (this.#newTrack !== undefined) {
            throw new Error('Cannot reapply an operation');
        }

        const params = this.opParams;
        this.#newTrack = index.addLabelTrack({
            id: this.#newTrackId,
            isBlack: params.is_black,
            gtClassId: params.gt_class_id,
        });
    }

    /**
     * Reverts the changes applied by this operation to a collection of
     * bounding box labels.
     * 
     * @param {BBoxIndex} index The index to update.
     */
    undoIndex(index) {
        if (this.#newTrack === undefined) {
            throw new Error('Cannot undo an operation that has not been applied');
        }

        index.deleteLabelTrack(this.#newTrack);

        this.#newTrack = undefined;
    }
}
