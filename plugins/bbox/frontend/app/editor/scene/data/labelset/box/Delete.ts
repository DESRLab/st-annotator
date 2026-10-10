import type { _BBoxIndex } from "../../BBoxIndex";
import type { UUID } from "../../models";
import { BBoxOperation, StaleTargetError } from "../BBoxOperation";

export type _Box = ReturnType<_BBoxIndex["getLabelBox"]>;

/** The subset of a box needed to construct the operation (its identity). */
export type BoxRef = Pick<_Box, "id">;

export interface DeleteParams {
  box_id: UUID;
}

export class Delete extends BBoxOperation<DeleteParams, null> {
  get displayName(): string {
    return "Delete Bounding Box";
  }

  get opName(): string {
    return "box-delete";
  }

  get opResult(): null {
    return null;
  }

  #deletedBoxParams: _Box | undefined = undefined;

  /**
   * Creates a new operation from a set of (unserialized) parameters.
   */
  static fromParams(box: BoxRef): Delete {
    return new Delete({
      box_id: box.id,
    });
  }

  /**
   * Applies this operation to a collection of bounding box labels.
   *
   * @throws {StaleTargetError} If the target box no longer exists in the
   * index (e.g. it was already deleted before this operation could run).
   */
  applyIndex(index: _BBoxIndex) {
    if (this.#deletedBoxParams !== undefined) {
      throw new Error("Cannot reapply an operation");
    }

    const params = this.opParams;
    if (!index.hasLabelBox(params.box_id)) {
      throw new StaleTargetError(
        `There is no box with the given ID: ${params.box_id}`,
      );
    }

    const box = index.getLabelBox(params.box_id);

    this.#deletedBoxParams = box;
    index.deleteLabelBox(box);
  }

  /**
   * Reverts the changes applied by this operation to a collection of
   * bounding box labels.
   */
  undoIndex(index: _BBoxIndex) {
    if (this.#deletedBoxParams === undefined) {
      throw new Error("Cannot undo an operation that has not been applied");
    }

    index.addLabelBox(this.#deletedBoxParams);

    this.#deletedBoxParams = undefined;
  }
}
