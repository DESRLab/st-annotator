import type { Placeholder as _Placeholder } from "sta/app/editor";

import { StaleTargetError, VectorOperation } from "../VectorOperation";

type UUID = string;

export interface DeleteVectorParams {
  vector_id: UUID;
}

export class Delete extends VectorOperation<DeleteVectorParams, null> {
  /**
   * The display name of this operation.
   */
  get displayName(): string {
    return "Delete Vector Object";
  }

  /**
   * The name of this operation, which is sent to the backend.
   */
  get opName(): string {
    return "vector-delete";
  }

  /**
   * The result of this operation, expressed as a {@link _Placeholder | Placeholder}
   *
   * It is resolved with the value returned from the backend after it is pushed there.
   */
  get opResult(): null {
    return null;
  }

  #deletedVectorParams: any = undefined;

  /**
   * Creates a delete operation from a set of (unserialized) parameters.
   */
  static fromParams(vector: any): Delete {
    return new Delete({
      vector_id: vector.id,
    });
  }

  /**
   * Applies this operation to a collection of vector object labels.
   *
   * @throws {StaleTargetError} If the target vector no longer exists in the
   * index (e.g. it was already deleted before this operation could run).
   */
  applyIndex(index: any) {
    if (this.#deletedVectorParams !== undefined) {
      throw new Error("Cannot reapply an operation");
    }

    const params = this.opParams;
    if (!index.hasLabelVector(params.vector_id)) {
      throw new StaleTargetError(
        `There is no vector with the given ID: ${params.vector_id}`,
      );
    }

    const vector = index.getLabelVector(params.vector_id);

    this.#deletedVectorParams = vector;
    index.deleteLabelVector(vector);
  }

  /**
   * Reverts the changes applied by this operation to a collection of
   * vector object labels.
   */
  undoIndex(index: any) {
    if (this.#deletedVectorParams === undefined) {
      throw new Error("Cannot undo an operation that has not been applied");
    }

    index.addLabelVector(this.#deletedVectorParams);

    this.#deletedVectorParams = undefined;
  }
}
