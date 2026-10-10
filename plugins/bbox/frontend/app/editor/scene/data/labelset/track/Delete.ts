import type { _BBoxIndex } from "../../BBoxIndex";
import type { UUID } from "../../models";
import { BBoxOperation, StaleTargetError } from "../BBoxOperation";

export type _Track = ReturnType<_BBoxIndex["getLabelTrack"]>;

/** The subset of a track needed to construct the operation (its identity). */
export type TrackRef = Pick<_Track, "id">;

export interface DeleteParams {
  track_id: UUID;
}

export class Delete extends BBoxOperation<DeleteParams, null> {
  get displayName(): string {
    return "Delete Object Track";
  }

  get opName(): string {
    return "track-delete";
  }

  get opResult(): null {
    return null;
  }

  #deletedTrackParams: _Track | undefined = undefined;

  /**
   * Creates a new operation from a set of (unserialized) parameters.
   */
  static fromParams(track: TrackRef): Delete {
    return new Delete({
      track_id: track.id,
    });
  }

  /**
   * Applies this operation to a collection of bounding box labels.
   *
   * @throws {StaleTargetError} If the target track no longer exists in the
   * index (e.g. it was already deleted before this operation could run).
   */
  applyIndex(index: _BBoxIndex) {
    if (this.#deletedTrackParams !== undefined) {
      throw new Error("Cannot reapply an operation");
    }

    const params = this.opParams;
    if (!index.hasLabelTrack(params.track_id)) {
      throw new StaleTargetError(
        `There is no track with the given ID: ${params.track_id}`,
      );
    }

    const track = index.getLabelTrack(params.track_id);

    this.#deletedTrackParams = track;
    index.deleteLabelTrack(track);
  }

  /**
   * Reverts the changes applied by this operation to a collection of
   * bounding box labels.
   */
  undoIndex(index: _BBoxIndex) {
    if (this.#deletedTrackParams === undefined) {
      throw new Error("Cannot undo an operation that has not been applied");
    }

    index.addLabelTrack(this.#deletedTrackParams);

    this.#deletedTrackParams = undefined;
  }
}
