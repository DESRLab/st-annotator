import { Placeholder } from "sta/app/editor";

import type { ReadonlyLabelInstance } from "../../LabelInstance";
import type {
  SegmentationIndex,
  InstanceParams,
} from "../../SegmentationIndex";
import { SegmentationOperation } from "../SegmentationOperation";

export interface CreateParams {
  is_black: boolean;
  gt_class_id: number | null;
}

export class Create extends SegmentationOperation<CreateParams, string> {
  /**
   * The display name of this operation.
   */
  get displayName(): string {
    return "Create Object Instance";
  }

  /**
   * The name of this operation, which is sent to the backend.
   */
  get opName(): string {
    return "instance-create";
  }

  #newInstanceId = new Placeholder<string>();

  /**
   * The result of this operation, expressed as a {@link Placeholder}.
   *
   * It is resolved with the value returned from the backend after it is pushed there.
   */
  get opResult(): Placeholder<string> {
    return this.#newInstanceId;
  }

  #newInstance: ReadonlyLabelInstance | undefined = undefined;

  get newInstance(): ReadonlyLabelInstance | undefined {
    return this.#newInstance;
  }

  /**
   * Creates a new operation from a set of (unserialized) parameters.
   */
  static fromParams(params: Omit<InstanceParams, "config" | "id">): Create {
    return new Create({
      is_black: params.isBlack ?? false,
      gt_class_id: params.gtClassId ?? null,
    });
  }

  /**
   * Applies this operation to a collection of object instanceing labels.
   */
  applyIndex(index: SegmentationIndex): void {
    if (this.#newInstance !== undefined) {
      throw new Error("Cannot reapply an operation");
    }

    const params = this.opParams;
    this.#newInstance = index.addLabelInstance({
      id: this.#newInstanceId,
      isBlack: params.is_black,
      gtClassId: params.gt_class_id,
    });
  }

  /**
   * Reverts the changes applied by this operation to a collection of
   * object instanceing labels.
   */
  undoIndex(index: SegmentationIndex): void {
    if (this.#newInstance === undefined) {
      throw new Error("Cannot undo an operation that has not been applied");
    }

    index.deleteLabelInstance(this.#newInstance);

    this.#newInstance = undefined;
  }
}
