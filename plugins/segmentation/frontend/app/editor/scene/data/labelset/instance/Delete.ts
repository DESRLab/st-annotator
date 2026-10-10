import type { Placeholder as _Placeholder } from "sta/app/editor";

import type { ReadonlyLabelInstance } from "../../LabelInstance";
import type {
  SegmentationIndex,
  InstanceParams,
} from "../../SegmentationIndex";
import type { UUID } from "../../models";
import {
  SegmentationOperation,
  StaleTargetError,
} from "../SegmentationOperation";

export interface DeleteParams {
  instance_id: UUID;
}

export class Delete extends SegmentationOperation<DeleteParams, null> {
  /**
   * The display name of this operation.
   */
  get displayName(): string {
    return "Delete Object Instance";
  }

  /**
   * The name of this operation, which is sent to the backend.
   */
  get opName(): string {
    return "instance-delete";
  }

  /**
   * The result of this operation, expressed as a {@link _Placeholder | Placeholder}.
   *
   * It is resolved with the value returned from the backend after it is pushed there.
   */
  get opResult(): null {
    return null;
  }

  #deletedInstanceParams: InstanceParams | undefined = undefined;

  /**
   * Creates a new operation from a set of (unserialized) parameters.
   */
  static fromParams(instance: ReadonlyLabelInstance): Delete {
    return new Delete({
      instance_id: instance.id,
    });
  }

  /**
   * Applies this operation to a collection of object instanceing labels.
   *
   * @throws {StaleTargetError} If the target instance no longer exists in
   * the index (e.g. it was already deleted before this operation could run).
   */
  applyIndex(index: SegmentationIndex): void {
    if (this.#deletedInstanceParams !== undefined) {
      throw new Error("Cannot reapply an operation");
    }

    const params = this.opParams;
    if (!index.hasLabelInstance(params.instance_id)) {
      throw new StaleTargetError(
        `There is no instance with the given ID: ${params.instance_id}`,
      );
    }

    const instance = index.getLabelInstance(params.instance_id);

    this.#deletedInstanceParams = instance;
    index.deleteLabelInstance(instance);
  }

  /**
   * Reverts the changes applied by this operation to a collection of
   * object instanceing labels.
   */
  undoIndex(index: SegmentationIndex): void {
    if (this.#deletedInstanceParams === undefined) {
      throw new Error("Cannot undo an operation that has not been applied");
    }

    index.addLabelInstance(this.#deletedInstanceParams);

    this.#deletedInstanceParams = undefined;
  }
}
