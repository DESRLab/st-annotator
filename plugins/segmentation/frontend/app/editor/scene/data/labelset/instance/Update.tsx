import type { Placeholder as _Placeholder } from "sta/app/editor";

import type { ReadonlyLabelClass } from "../../LabelClass";
import type { ReadonlyLabelInstance } from "../../LabelInstance";
import type { SegmentationIndex } from "../../SegmentationIndex";
import type { UUID } from "../../models";
import {
  SegmentationOperation,
  StaleTargetError,
} from "../SegmentationOperation";

interface UpdateParams {
  instance_id: UUID;
}

export abstract class Update<
  P extends UpdateParams = UpdateParams,
  D = unknown,
> extends SegmentationOperation<P, null> {
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
  protected getData(instance: ReadonlyLabelInstance): D {
    throw new Error("Not implemented");
  }

  /**
   * Applies this operation to an object instance.
   */
  protected applyInstance(
    index: SegmentationIndex,
    instance: ReadonlyLabelInstance,
    params: P,
  ): void {
    throw new Error("Not implemented");
  }

  /**
   * Reverts the changes applied by this operation to an object instance.
   */
  protected undoInstance(
    index: SegmentationIndex,
    instance: ReadonlyLabelInstance,
    data: D,
  ): void {
    throw new Error("Not implemented");
  }

  /**
   * Applies this operation to a collection of object instanceing labels.
   *
   * @throws {StaleTargetError} If the target instance no longer exists in
   * the index (e.g. it was deleted before this operation could run).
   */
  applyIndex(index: SegmentationIndex): void {
    if (this.#data !== undefined) {
      throw new Error("Cannot undo an operation that has not been applied");
    }

    const params = this.opParams;
    if (!index.hasLabelInstance(params.instance_id)) {
      throw new StaleTargetError(
        `There is no instance with the given ID: ${params.instance_id}`,
      );
    }

    const instance = index.getLabelInstance(params.instance_id);

    this.#data = this.getData(instance);
    this.applyInstance(index, instance, params);
  }

  /**
   * Reverts the changes applied by this operation to a collection of
   * object instanceing labels.
   */
  undoIndex(index: SegmentationIndex): void {
    if (this.#data === undefined) {
      throw new Error("Cannot undo an operation that has not been applied");
    }

    const params = this.opParams;
    const box = index.getLabelInstance(params.instance_id);

    this.undoInstance(index, box, this.#data);
    this.#data = undefined;
  }
}

export interface AssignClassParams extends UpdateParams {
  gt_class_id: number | null;
}

export class AssignClass extends Update<AssignClassParams, number | null> {
  /**
   * The display name of this operation.
   */
  get displayName(): string {
    return "Assign Instance Ground Truth Class";
  }

  /**
   * The name of this operation, which is sent to the backend.
   */
  get opName(): string {
    return "instance-assign-class";
  }

  /**
   * Creates a new operation from a set of (unserialized) parameters.
   */
  static fromParams(
    instance: ReadonlyLabelInstance,
    labelClass: ReadonlyLabelClass | null,
  ): AssignClass {
    return new AssignClass({
      instance_id: instance.id,
      gt_class_id: labelClass?.id ?? null,
    });
  }

  /**
   * Gets the data to store so that this operation can be undone.
   */
  protected getData(instance: ReadonlyLabelInstance): number | null {
    return instance.gtClassId;
  }

  /**
   * Applies this operation to an object instance.
   */
  protected applyInstance(
    index: SegmentationIndex,
    instance: ReadonlyLabelInstance,
    params: AssignClassParams,
  ): void {
    index.updateLabelInstance(instance, { gtClassId: params.gt_class_id });
  }

  /**
   * Reverts the changes applied by this operation to an object instance.
   */
  protected undoInstance(
    index: SegmentationIndex,
    instance: ReadonlyLabelInstance,
    data: number | null,
  ): void {
    index.updateLabelInstance(instance, { gtClassId: data });
  }
}

export interface AssignIsBlackParams extends UpdateParams {
  is_black: boolean;
}

export class AssignIsBlack extends Update<AssignIsBlackParams, boolean> {
  /**
   * The display name of this operation.
   */
  get displayName(): string {
    return "Set Is Black";
  }

  /**
   * The name of this operation, which is sent to the backend.
   */
  get opName(): string {
    return "instance-assign-is-black";
  }

  /**
   * Creates a new operation from a set of (unserialized) parameters.
   */
  static fromParams(
    instance: ReadonlyLabelInstance,
    isBlack: boolean,
  ): AssignIsBlack {
    return new AssignIsBlack({
      instance_id: instance.id,
      is_black: isBlack,
    });
  }

  /**
   * Gets the data to store so that this operation can be undone.
   */
  protected getData(instance: ReadonlyLabelInstance): boolean {
    return instance.isBlack;
  }

  /**
   * Applies this operation to an object instance.
   */
  protected applyInstance(
    index: SegmentationIndex,
    instance: ReadonlyLabelInstance,
    params: AssignIsBlackParams,
  ): void {
    index.updateLabelInstance(instance, { isBlack: params.is_black });
  }

  /**
   * Reverts the changes applied by this operation to an object instance.
   */
  protected undoInstance(
    index: SegmentationIndex,
    instance: ReadonlyLabelInstance,
    data: boolean,
  ): void {
    index.updateLabelInstance(instance, { isBlack: data });
  }
}
