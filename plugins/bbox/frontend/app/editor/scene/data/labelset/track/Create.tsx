import { Placeholder } from "sta/app/editor";

import type { _BBoxIndex } from "../../BBoxIndex";
import { BBoxOperation } from "../BBoxOperation";

export type _Track = ReturnType<_BBoxIndex["getLabelTrack"]>;
export type _TrackParams = Parameters<_BBoxIndex["addLabelTrack"]>[0];

export interface CreateParams {
  is_black: boolean;
  gt_class_id: number | null;
}

export class Create extends BBoxOperation<CreateParams, string> {
  get displayName(): string {
    return "Create Object Track";
  }

  get opName(): string {
    return "track-create";
  }

  #newTrackId = new Placeholder<string>();

  get opResult(): Placeholder<string> {
    return this.#newTrackId;
  }

  #newTrack: _Track | undefined = undefined;

  get newTrack(): _Track | undefined {
    return this.#newTrack;
  }

  /**
   * Creates a new operation from a set of (unserialized) parameters.
   */
  static fromParams(params: Omit<_TrackParams, "config" | "id">): Create {
    return new Create({
      is_black: params.isBlack ?? false,
      gt_class_id: params.gtClassId ?? null,
    });
  }

  /**
   * Applies this operation to a collection of bounding box labels.
   */
  applyIndex(index: _BBoxIndex) {
    if (this.#newTrack !== undefined) {
      throw new Error("Cannot reapply an operation");
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
   */
  undoIndex(index: _BBoxIndex) {
    if (this.#newTrack === undefined) {
      throw new Error("Cannot undo an operation that has not been applied");
    }

    index.deleteLabelTrack(this.#newTrack);

    this.#newTrack = undefined;
  }
}
