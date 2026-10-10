import { Queue } from "async-await-queue";
import * as THREE from "three";

import { FrameState, type TaskState } from "../models";
import type { WorkType } from "sta/client";
import {
  OptionalVector3,
  type CoordBounds,
  type PartialSTBounds,
  type SpatialBounds,
  Timestamp,
  type Hashable,
} from "sta/common";

import type { EditorViews } from "../views";

export type FrameLike = Omit<
  FrameState,
  "minDate" | "maxDate" | "lastViewedAtDate"
> &
  Hashable;

/**
 * Defines each event that can be dispatched by {@link EditableFrame}.
 */
export interface EditableFrameEventMap {
  /** The event when the state of a frame has been updated. */
  edit: { frame: EditableFrame };
}

/**
 * A {@link FrameState} which attributes can be modified.
 */
export class EditableFrame
  extends THREE.EventDispatcher<EditableFrameEventMap>
  implements FrameLike
{
  /**
   * The interface of the application with the server.
   */
  readonly views: EditorViews;

  /**
   * The original state, which may be out of sync with this object.
   */
  readonly #state: FrameState;

  /**
   * The unique identifier of this frame.
   */
  get id(): number {
    return this.#state.id;
  }

  /**
   * The task associated with this frame.
   */
  get task(): TaskState {
    return this.#state.task;
  }

  /**
   * The unique identifier of the account who should complete the work in this frame.
   */
  get account_id(): number {
    return this.#state.account_id;
  }

  /**
   * Selects the source data to display in this frame.
   */
  get source_group_id(): number {
    return this.#state.source_group_id;
  }

  /**
   * Selects the label data to display in this frame.
   */
  get label_branch_id(): number {
    return this.#state.label_branch_id;
  }

  /**
   * Indicates the spatiotemporal boundaries of the data to display in this frame.
   */
  get st_bounds(): PartialSTBounds {
    return this.#state.st_bounds;
  }

  /**
   * The type of work to be completed in this frame.
   */
  get work_type(): WorkType {
    return this.#state.work_type;
  }

  #isComplete: boolean;

  /**
   * `true` if the frame has been marked as completed; otherwise, `false`.
   */
  get is_complete(): boolean {
    return this.#isComplete;
  }

  #lastViewedAt: Timestamp | null;
  #spatialBounds: SpatialBounds | undefined;
  #timestampBounds: CoordBounds | undefined;

  /**
   * The timestamp when the frame was last opened in the interface.
   */
  get last_viewed_at(): Timestamp | null {
    return this.#lastViewedAt;
  }

  /**
   * Creates a new editor of frames.
   *
   * @param views The interface of the application with the server.
   * @param state The state of the frame to initialize from.
   */
  constructor(views: EditorViews, state: FrameState) {
    super();

    this.views = views;
    this.#state = state;

    this.#isComplete = state.is_complete;
    this.#lastViewedAt = state.last_viewed_at;
  }

  /**
   * Creates a copy of this object as an immutable state.
   *
   * @returns The resulting state.
   */
  toState(): FrameState {
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
   * @returns The resulting hash.
   */
  hash(): string {
    return JSON.stringify(this.id);
  }

  /**
   * Tests whether two objects are equal to each other;
   * that is, whether they have the same unique identifier.
   *
   * @param other The object to compare against.
   * @returns `true` if the two objects are equal; otherwise, `false`.
   */
  equals(other: object): boolean {
    return other instanceof EditableFrame && this.id === other.id;
  }

  /**
   * Returns the spatial center of this frame; components with either bound missing
   * have a center of `null`.
   *
   * @returns The spatial center of this frame.
   */
  getSpatialCenter(): OptionalVector3 {
    const { xBounds, yBounds, zBounds } = this.getSpatialBounds();
    return new OptionalVector3(xBounds.center, yBounds.center, zBounds.center);
  }

  /** Returns and caches the immutable spatial bounds derived from this frame. */
  getSpatialBounds(): SpatialBounds {
    return (this.#spatialBounds ??= this.st_bounds.getSpatialBounds());
  }

  /**
   * Returns the timestamp center of this frame; if either bound is missing,
   * the center is considered to be `null`.
   *
   * @returns The timestamp center of this frame.
   */
  getTimestampCenter(): Timestamp | null {
    const tBounds = this.getTimestampBounds();
    const tCenter = tBounds.center;

    return tCenter == null ? null : new Timestamp(tCenter);
  }

  /** Returns and caches the immutable timestamp bounds derived from this frame. */
  getTimestampBounds(): CoordBounds {
    return (this.#timestampBounds ??= this.st_bounds.getTimestampBounds());
  }

  /**
   * Tests whether a point exists in this frame.
   *
   * @param point The query point.
   * @returns `true` if the given point exists in the given frame; otherwise, `false`.
   */
  containsPoint(point: THREE.Vector3 | null): boolean {
    if (point == null) {
      return (
        this.st_bounds.min_coords.x == null &&
        this.st_bounds.max_coords.x == null &&
        this.st_bounds.min_coords.y == null &&
        this.st_bounds.max_coords.y == null &&
        this.st_bounds.min_coords.z == null &&
        this.st_bounds.max_coords.z == null
      );
    }

    return this.getSpatialBounds().contains(point);
  }

  /**
   * Tests whether a timestamp exists in this frame.
   *
   * @param timestamp The query timestamp.
   * @returns `true` if the given timestamp exists in the given frame;
   * otherwise, `false`.
   */
  containsTimestamp(timestamp: Timestamp | null): boolean {
    if (timestamp == null) {
      return (
        this.st_bounds.min_timestamp == null &&
        this.st_bounds.max_timestamp == null
      );
    }

    return this.getTimestampBounds().contains(timestamp.getTime());
  }

  /**
   * Logs to the backend that this frame has been viewed in the application.
   */
  async updateLastViewedAt() {
    await this.views.updateFrameLastViewedAt(this.id);
    this.#lastViewedAt = new Timestamp();

    this.dispatchEvent({ type: "edit", frame: this });
  }

  /** Ensures that frame-status updates are run sequentially. */
  #statusQueue = new Queue<symbol>(1, 0);

  /**
   * Sets whether the task is complete at this frame.
   *
   * Updates are serialized and the no-op check runs when the update is
   * applied, so rapid toggles settle to the last requested value instead
   * of being dropped against the stale pre-save value.
   *
   * @param value `true` if the frame is marked as complete; otherwise, `false`.
   */
  async updateIsComplete(value: boolean) {
    await this.#statusQueue.run(async () => {
      if (this.#isComplete === value) return;

      await this.views.updateFrameIsComplete(this.id, value);
      this.#isComplete = value;

      this.dispatchEvent({ type: "edit", frame: this });
    });
  }
}
