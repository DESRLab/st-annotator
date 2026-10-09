import * as THREE from 'three';

import { OptionalVector3 } from '../../../../../common/lib/spatial';
import { Timestamp } from '../../../../../common/lib/utils';

import { FrameState } from '../../../../project/lib';

/**
 * @typedef {import('../../../../../common/lib/spatial').PartialSTBounds} PartialSTBounds
 */

/**
 * @typedef {import('../../../../../common/lib/utils').Hashable} Hashable
 */

/**
 * @typedef {import('../../../../project/lib').TaskState} TaskState
 */

/**
 * @typedef {import('../../../../project/lib').WorkType} WorkType
 */

/**
 * @typedef {import('../views').EditorViews} EditorViews
 */

/**
 * @typedef {Omit<FrameState, 'minDate' | 'maxDate' | 'lastViewedAtDate' | 'copy'>
 * & Hashable} FrameLike
 */

/**
 * Defines each event that can be dispatched by {@link EditableFrame}.
 * 
 * @typedef {object} EditableFrameEventMap
 * @property {{ frame: EditableFrame }} edit The event when the state of a frame
 * has been updated.
 */

/**
 * A {@link FrameState} which attributes can be modified.
 * 
 * @implements {FrameLike}
 * @augments {THREE.EventDispatcher<EditableFrameEventMap>}
 */
export class EditableFrame extends THREE.EventDispatcher {

    /**
     * The interface of the application with the server.
     * 
     * @readonly
     * @type {EditorViews}
     */
    views;

    /**
     * The original state, which may be out of sync with this object.
     * 
     * @readonly
     * @type {FrameState}
     */
    #state;

    /**
     * The unique identifier of this frame.
     * 
     * @type {number}
     */
    get id() { return this.#state.id; }

    /**
     * The task associated with this frame.
     * 
     * @type {TaskState}
     */
    get task() { return this.#state.task; }

    /**
     * The unique identifier of the account who should complete the work in this frame.
     * 
     * @type {number}
     */
    get account_id() { return this.#state.account_id; }

    /**
     * Selects the source data to display in this frame.
     * 
     * @type {number}
     */
    get source_group_id() { return this.#state.source_group_id; }

    /**
     * Selects the label data to display in this frame.
     * 
     * @type {number}
     */
    get label_branch_id() { return this.#state.label_branch_id; }

    /**
     * Indicates the spatiotemporal boundaries of the data to display in this frame.
     * 
     * @type {PartialSTBounds}
     */
    get st_bounds() { return this.#state.st_bounds; }

    /**
     * The type of work to be completed in this frame.
     * 
     * @type {WorkType}
     */
    get work_type() { return this.#state.work_type; }

    /**
     * @type {boolean}
     */
    #isComplete;

    /**
     * `true` if the frame has been marked as completed; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get is_complete() { return this.#isComplete; }

    /**
     * @type {?Timestamp}
     */
    #lastViewedAt;

    /**
     * The timestamp when the frame was last opened in the interface.
     * 
     * @type {?Timestamp}
     */
    get last_viewed_at() { return this.#lastViewedAt; }

    /**
     * Creates a new editor of frames.
     * 
     * @param {EditorViews} views The interface of the application with the server.
     * @param {FrameState} state The state of the frame to initialize from.
     */
    constructor(views, state) {
        super();

        this.views = views;
        this.#state = state;

        this.#isComplete = state.is_complete;
        this.#lastViewedAt = state.last_viewed_at;
    }

    /**
     * Creates a copy of this object as an immutable state.
     * 
     * @returns {FrameState} The resulting state.
     */
    toState() {
        return FrameState.create({
            id: this.id,
            task: this.task,
            account_id: this.account_id,
            source_group_id: this.source_group_id,
            label_branch_id: this.label_branch_id,
            st_bounds: this.st_bounds,
            work_type: this.work_type,
            last_viewed_at: this.last_viewed_at,
            is_complete: this.is_complete,
        });
    }

    /**
     * Hashes this object to a string so that it can be used as a key in a mapping.
     * 
     * @returns {string} The resulting hash.
     */
    hash() {
        return JSON.stringify(this.id);
    }

    /**
     * Tests whether two objects are equal to each other.
     * 
     * This should agree with {@link hash}; that is, two equal objects must
     * have the same hash, although two objects with the same hash need not be equal.
     *
     * @param {object} other The object to compare against.
     * @returns {boolean} `true` if the two objects are equal; otherwise, `false`.
     */
    equals(other) {
        if (!(other instanceof EditableFrame)) return false;

        return this.toState().equals(other.toState());
    }

    /**
     * Returns the spatial center of this frame; components with either bound missing
     * have a center of `null`.
     * 
     * @returns {OptionalVector3} The spatial center of this frame.
     */
    getSpatialCenter() {
        const { xBounds, yBounds, zBounds } = this.st_bounds.getSpatialBounds();
        return new OptionalVector3(xBounds.center, yBounds.center, zBounds.center);
    }

    /**
     * Returns the timestamp center of this frame; if either bound is missing,
     * the center is considered to be `null`.
     * 
     * @returns {?Timestamp} The timestamp center of this frame.
     */
    getTimestampCenter() {
        const tBounds = this.st_bounds.getTimestampBounds();
        const tCenter = tBounds.center;

        return (tCenter == null) ? null : new Timestamp(tCenter);
    }

    /**
     * Tests whether a point exists in this frame.
     * 
     * @param {?THREE.Vector3} point The query point.
     * @returns {boolean} `true` if the given point exists in the given frame; otherwise, `false`.
     */
    containsPoint(point) {
        if (point == null) {
            return (
                this.st_bounds.min_coords.x == null && this.st_bounds.max_coords.x == null
                && this.st_bounds.min_coords.y == null && this.st_bounds.max_coords.y == null
                && this.st_bounds.min_coords.z == null && this.st_bounds.max_coords.z == null
            );
        }

        return this.st_bounds.getSpatialBounds().contains(point);
    }

    /**
     * Tests whether a timestamp exists in this frame.
     * 
     * @param {?Timestamp} timestamp The query timestamp.
     * @returns {boolean} `true` if the given timestamp exists in the given frame;
     * otherwise, `false`.
     */
    containsTimestamp(timestamp) {
        if (timestamp == null) {
            return this.st_bounds.min_timestamp == null && this.st_bounds.max_timestamp == null;
        }

        return this.st_bounds.getTimestampBounds().contains(timestamp.getTime());
    }

    /**
     * Logs to the backend that this frame has been viewed in the application.
     */
    async updateLastViewedAt() {
        await this.views.updateFrameLastViewedAt(this.id);
        this.#lastViewedAt = new Timestamp();

        this.dispatchEvent({ type: 'edit', frame: this });
    }

    /**
     * Sets whether the task is complete at this frame.
     * 
     * @param {boolean} value `true` if the frame is marked as complete; otherwise, `false`.
     */
    async updateIsComplete(value) {
        if (this.#isComplete !== value) {
            await this.views.updateFrameIsComplete(this.id, value);
            this.#isComplete = value;

            this.dispatchEvent({ type: 'edit', frame: this });
        }
    }
}
