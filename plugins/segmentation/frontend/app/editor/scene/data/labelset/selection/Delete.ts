import type { Placeholder as _Placeholder } from "sta/app/editor";

import type { ReadonlyLabelSelection } from "../../LabelSelection";
import type {
  SegmentationIndex,
  SelectionParams,
} from "../../SegmentationIndex";
import type { UUID } from "../../models";
import {
  SegmentationOperation,
  StaleTargetError,
} from "../SegmentationOperation";

export interface DeleteParams {
  selection_id: UUID;
}

export class Delete extends SegmentationOperation<DeleteParams, null> {
  /**
   * The display name of this operation.
   */
  get displayName(): string {
    return "Delete Selection";
  }

  /**
   * The name of this operation, which is sent to the backend.
   */
  get opName(): string {
    return "selection-delete";
  }

  /**
   * The result of this operation, expressed as a {@link _Placeholder | Placeholder}.
   *
   * It is resolved with the value returned from the backend after it is pushed there.
   */
  get opResult(): null {
    return null;
  }

  #deletedSelectionParams: SelectionParams | undefined = undefined;

  /**
   * Creates a new operation from a set of (unserialized) parameters.
   */
  static fromParams(selection: ReadonlyLabelSelection): Delete {
    return new Delete({
      selection_id: selection.id,
    });
  }

  /**
   * Applies this operation to a collection of segmentation labels.
   *
   * @throws {StaleTargetError} If the target selection no longer exists in
   * the index (e.g. it was already deleted before this operation could run).
   */
  applyIndex(index: SegmentationIndex): void {
    if (this.#deletedSelectionParams !== undefined) {
      throw new Error("Cannot reapply an operation");
    }

    const params = this.opParams;
    if (!index.hasLabelSelection(params.selection_id)) {
      throw new StaleTargetError(
        `There is no selection with the given ID: ${params.selection_id}`,
      );
    }

    const selection = index.getLabelSelection(params.selection_id);

    this.#deletedSelectionParams = selection;
    index.deleteLabelSelection(selection);
  }

  /**
   * Reverts the changes applied by this operation to a collection of
   * segmentation labels.
   */
  undoIndex(index: SegmentationIndex): void {
    if (this.#deletedSelectionParams === undefined) {
      throw new Error("Cannot undo an operation that has not been applied");
    }

    index.addLabelSelection(this.#deletedSelectionParams);

    this.#deletedSelectionParams = undefined;
  }
}
