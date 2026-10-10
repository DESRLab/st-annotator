import type { Placeholder as _Placeholder } from "sta/app/editor";

import type { _BBoxIndex } from "../../BBoxIndex";
import type { UUID } from "../../models";
import { BBoxOperation, StaleTargetError } from "../BBoxOperation";

export type _Track = ReturnType<_BBoxIndex["getLabelTrack"]>;

/** The subset of a track needed to construct an operation (its identity). */
export type TrackRef = Pick<_Track, "id">;

export interface UpdateParams {
  track_id: UUID;
}

abstract class Update<P extends UpdateParams, D> extends BBoxOperation<
  P,
  null
> {
  /**
   * The result of this operation, expressed as a {@link _Placeholder | Placeholder}.
   *
   * It is resolved with the value returned from the backend after it is pushed there.
   */
  get opResult(): null {
    return null;
  }

  #data: D | undefined = undefined;

  /**
   * Gets the data to store so that this operation can be undone.
   */
  protected abstract getData(track: _Track): D;

  /**
   * Applies this operation to an object track.
   */
  protected abstract applyTrack(
    index: _BBoxIndex,
    track: _Track,
    params: P,
  ): void;

  /**
   * Reverts the changes applied by this operation to an object track.
   */
  protected abstract undoTrack(index: _BBoxIndex, track: _Track, data: D): void;

  /**
   * Applies this operation to a collection of bounding box labels.
   *
   * @throws {StaleTargetError} If the target track no longer exists in the
   * index (e.g. it was deleted before this operation could run).
   */
  applyIndex(index: _BBoxIndex) {
    if (this.#data !== undefined) {
      throw new Error("Cannot undo an operation that has not been applied");
    }

    const params = this.opParams;
    if (!index.hasLabelTrack(params.track_id)) {
      throw new StaleTargetError(
        `There is no track with the given ID: ${params.track_id}`,
      );
    }

    const track = index.getLabelTrack(params.track_id);

    this.#data = this.getData(track);
    this.applyTrack(index, track, params);
  }

  /**
   * Reverts the changes applied by this operation to a collection of
   * bounding box labels.
   */
  undoIndex(index: _BBoxIndex) {
    if (this.#data === undefined) {
      throw new Error("Cannot undo an operation that has not been applied");
    }

    const params = this.opParams;
    const box = index.getLabelTrack(params.track_id);

    this.undoTrack(index, box, this.#data);
    this.#data = undefined;
  }
}

export interface AssignClassParams {
  track_id: UUID;
  gt_class_id: number | null;
}

export class AssignClass extends Update<AssignClassParams, number | null> {
  get displayName(): string {
    return "Assign Ground Truth Class";
  }

  get opName(): string {
    return "track-assign-class";
  }

  /**
   * Creates a new operation from a set of (unserialized) parameters.
   */
  static fromParams(
    track: TrackRef,
    labelClass: { id: number } | null,
  ): AssignClass {
    return new AssignClass({
      track_id: track.id,
      gt_class_id: labelClass?.id ?? null,
    });
  }

  protected getData(track: _Track): number | null {
    return track.gtClassId;
  }

  protected applyTrack(
    index: _BBoxIndex,
    track: _Track,
    params: AssignClassParams,
  ) {
    index.updateLabelTrack(track, { gtClassId: params.gt_class_id });
  }

  protected undoTrack(index: _BBoxIndex, track: _Track, data: number | null) {
    index.updateLabelTrack(track, { gtClassId: data });
  }
}

export interface AssignIsBlackParams {
  track_id: UUID;
  is_black: boolean;
}

export class AssignIsBlack extends Update<AssignIsBlackParams, boolean> {
  get displayName(): string {
    return "Set Is Black";
  }

  get opName(): string {
    return "track-assign-is-black";
  }

  /**
   * Creates a new operation from a set of (unserialized) parameters.
   */
  static fromParams(track: TrackRef, isBlack: boolean): AssignIsBlack {
    return new AssignIsBlack({
      track_id: track.id,
      is_black: isBlack,
    });
  }

  protected getData(track: _Track): boolean {
    return track.isBlack;
  }

  protected applyTrack(
    index: _BBoxIndex,
    track: _Track,
    params: AssignIsBlackParams,
  ) {
    index.updateLabelTrack(track, { isBlack: params.is_black });
  }

  protected undoTrack(index: _BBoxIndex, track: _Track, data: boolean) {
    index.updateLabelTrack(track, { isBlack: data });
  }
}
