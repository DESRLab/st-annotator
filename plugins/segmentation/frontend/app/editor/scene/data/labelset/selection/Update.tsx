import type * as THREE from "three";

import type { Placeholder as _Placeholder } from "sta/app/editor";
import { DecimalVector3Data } from "sta/common";

import {
  getDistinctiveLvByValue,
  getOcclusionLvByValue,
  type QualityLevel,
} from "../../../../../../models";
import type { ReadonlyLabelClass } from "../../LabelClass";
import type { ReadonlyLabelInstance } from "../../LabelInstance";
import type { ReadonlyLabelSelection } from "../../LabelSelection";
import type { SegmentationIndex } from "../../SegmentationIndex";
import type { UUID } from "../../models";
import {
  SegmentationOperation,
  StaleTargetError,
} from "../SegmentationOperation";

interface UpdateParams {
  selection_id: UUID;
}

abstract class Update<
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
  protected getData(selection: ReadonlyLabelSelection): D {
    throw new Error("Not implemented");
  }

  /**
   * Applies this operation to a selection.
   */
  protected applySelection(
    index: SegmentationIndex,
    selection: ReadonlyLabelSelection,
    params: P,
  ): void {
    throw new Error("Not implemented");
  }

  /**
   * Reverts the changes applied by this operation to a selection.
   */
  protected undoSelection(
    index: SegmentationIndex,
    selection: ReadonlyLabelSelection,
    data: D,
  ): void {
    throw new Error("Not implemented");
  }

  /**
   * Validates the remaining parameters against the index before anything is
   * mutated. The default is a no-op; operations that reference other labels
   * (e.g. the parent instance) override this to reject stale references.
   */
  protected validateParams(index: SegmentationIndex, params: P): void {}

  /**
   * Applies this operation to a collection of segmentation labels.
   *
   * @throws {StaleTargetError} If the target selection no longer exists in
   * the index (e.g. it was deleted before this operation could run).
   */
  applyIndex(index: SegmentationIndex): void {
    if (this.#data !== undefined) {
      throw new Error("Cannot undo an operation that has not been applied");
    }

    const params = this.opParams;
    if (!index.hasLabelSelection(params.selection_id)) {
      throw new StaleTargetError(
        `There is no selection with the given ID: ${params.selection_id}`,
      );
    }

    const selection = index.getLabelSelection(params.selection_id);
    this.validateParams(index, params);

    this.#data = this.getData(selection);
    this.applySelection(index, selection, params);
  }

  /**
   * Reverts the changes applied by this operation to a collection of
   * segmentation labels.
   */
  undoIndex(index: SegmentationIndex): void {
    if (this.#data === undefined) {
      throw new Error("Cannot undo an operation that has not been applied");
    }

    const params = this.opParams;
    const selection = index.getLabelSelection(params.selection_id);

    this.undoSelection(index, selection, this.#data);
    this.#data = undefined;
  }
}

export interface AssignEntityParams extends UpdateParams {
  entity_id: UUID | null;
}

export class AssignEntity extends Update<AssignEntityParams, UUID | null> {
  /**
   * The display name of this operation.
   */
  get displayName(): string {
    return "Assign Object Instance";
  }

  /**
   * The name of this operation, which is sent to the backend.
   */
  get opName(): string {
    return "selection-assign-entity";
  }

  /**
   * Creates a new operation from a set of (unserialized) parameters.
   */
  static fromParams(
    selection: ReadonlyLabelSelection,
    track: ReadonlyLabelInstance | null,
  ): AssignEntity {
    return new AssignEntity({
      selection_id: selection.id,
      entity_id: track?.id ?? null,
    });
  }

  /**
   * Rejects the assignment when the target instance has disappeared (e.g.
   * it was deleted while this operation was queued), so a selection never
   * ends up with a dangling parent-instance reference.
   */
  protected validateParams(
    index: SegmentationIndex,
    params: AssignEntityParams,
  ): void {
    if (params.entity_id != null && !index.hasLabelInstance(params.entity_id)) {
      throw new StaleTargetError(
        `There is no instance with the given ID: ${params.entity_id}`,
      );
    }
  }

  /**
   * Gets the data to store so that this operation can be undone.
   */
  protected getData(selection: ReadonlyLabelSelection): UUID | null {
    return selection.entityId;
  }

  /**
   * Applies this operation to a selection.
   */
  protected applySelection(
    index: SegmentationIndex,
    selection: ReadonlyLabelSelection,
    params: AssignEntityParams,
  ): void {
    index.updateLabelSelection(selection, { entityId: params.entity_id });
  }

  /**
   * Reverts the changes applied by this operation to a selection.
   */
  protected undoSelection(
    index: SegmentationIndex,
    selection: ReadonlyLabelSelection,
    data: UUID | null,
  ): void {
    index.updateLabelSelection(selection, { entityId: data });
  }
}

export interface AssignClassParams extends UpdateParams {
  perceived_class_id: number | null;
}

export class AssignClass extends Update<AssignClassParams, number | null> {
  /**
   * The display name of this operation.
   */
  get displayName(): string {
    return "Assign Ground Truth";
  }

  /**
   * The name of this operation, which is sent to the backend.
   */
  get opName(): string {
    return "selection-assign-class";
  }

  /**
   * Creates a new operation from a set of (unserialized) parameters.
   */
  static fromParams(
    selection: ReadonlyLabelSelection,
    labelClass: ReadonlyLabelClass | null,
  ): AssignClass {
    return new AssignClass({
      selection_id: selection.id,
      perceived_class_id: labelClass?.id ?? null,
    });
  }

  /**
   * Gets the data to store so that this operation can be undone.
   */
  protected getData(selection: ReadonlyLabelSelection): number | null {
    return selection.perceivedClassId;
  }

  /**
   * Applies this operation to a selection.
   */
  protected applySelection(
    index: SegmentationIndex,
    selection: ReadonlyLabelSelection,
    params: AssignClassParams,
  ): void {
    index.updateLabelSelection(selection, {
      perceivedClassId: params.perceived_class_id,
    });
  }

  /**
   * Reverts the changes applied by this operation to a selection.
   */
  protected undoSelection(
    index: SegmentationIndex,
    selection: ReadonlyLabelSelection,
    data: number | null,
  ): void {
    index.updateLabelSelection(selection, { perceivedClassId: data });
  }
}

export interface AssignDistinctiveLvParams extends UpdateParams {
  distinctive_lv: number | null;
}

export class AssignDistinctiveLv extends Update<
  AssignDistinctiveLvParams,
  QualityLevel
> {
  /**
   * The display name of this operation.
   */
  get displayName(): string {
    return "Set Distinctiveness Level";
  }

  /**
   * The name of this operation, which is sent to the backend.
   */
  get opName(): string {
    return "selection-assign-distinctive-level";
  }

  /**
   * Creates a new operation from a set of (unserialized) parameters.
   */
  static fromParams(
    selection: ReadonlyLabelSelection,
    distinctiveLv: QualityLevel,
  ): AssignDistinctiveLv {
    return new AssignDistinctiveLv({
      selection_id: selection.id,
      distinctive_lv: distinctiveLv?.toJSON() ?? null,
    });
  }

  /**
   * Gets the data to store so that this operation can be undone.
   */
  protected getData(selection: ReadonlyLabelSelection): QualityLevel {
    return selection.distinctiveLv;
  }

  /**
   * Applies this operation to a selection.
   */
  protected applySelection(
    index: SegmentationIndex,
    selection: ReadonlyLabelSelection,
    params: AssignDistinctiveLvParams,
  ): void {
    index.updateLabelSelection(selection, {
      distinctiveLv: getDistinctiveLvByValue(params.distinctive_lv),
    });
  }

  /**
   * Reverts the changes applied by this operation to a selection.
   */
  protected undoSelection(
    index: SegmentationIndex,
    selection: ReadonlyLabelSelection,
    data: QualityLevel,
  ): void {
    index.updateLabelSelection(selection, { distinctiveLv: data });
  }
}

export interface AssignOcclusionLvParams extends UpdateParams {
  occlusion_lv: number | null;
}

export class AssignOcclusionLv extends Update<
  AssignOcclusionLvParams,
  QualityLevel
> {
  /**
   * The display name of this operation.
   */
  get displayName(): string {
    return "Set Occlusion Level";
  }

  /**
   * The name of this operation, which is sent to the backend.
   */
  get opName(): string {
    return "selection-assign-occlusion-level";
  }

  /**
   * Creates a new operation from a set of (unserialized) parameters.
   */
  static fromParams(
    selection: ReadonlyLabelSelection,
    occlusionLv: QualityLevel,
  ): AssignOcclusionLv {
    return new AssignOcclusionLv({
      selection_id: selection.id,
      occlusion_lv: occlusionLv?.toJSON() ?? null,
    });
  }

  /**
   * Gets the data to store so that this operation can be undone.
   */
  protected getData(selection: ReadonlyLabelSelection): QualityLevel {
    return selection.occlusionLv;
  }

  /**
   * Applies this operation to a selection.
   */
  protected applySelection(
    index: SegmentationIndex,
    selection: ReadonlyLabelSelection,
    params: AssignOcclusionLvParams,
  ): void {
    index.updateLabelSelection(selection, {
      occlusionLv: getOcclusionLvByValue(params.occlusion_lv),
    });
  }

  /**
   * Reverts the changes applied by this operation to a selection.
   */
  protected undoSelection(
    index: SegmentationIndex,
    selection: ReadonlyLabelSelection,
    data: QualityLevel,
  ): void {
    index.updateLabelSelection(selection, { occlusionLv: data });
  }
}

export interface PointSelection {
  points: readonly THREE.Vector3[];
}

export interface EditPointSelectionParams extends UpdateParams {
  mode: string;
  points: DecimalVector3Data[];
}

export class EditPointSelection extends Update<
  EditPointSelectionParams,
  PointSelection
> {
  /**
   * The display name of this operation.
   */
  get displayName(): string {
    return "Edit Selection";
  }

  /**
   * The name of this operation, which is sent to the backend.
   */
  get opName(): string {
    return "selection-edit";
  }

  /**
   * Creates a new operation from a set of (unserialized) parameters.
   */
  static fromParams(
    selection: ReadonlyLabelSelection,
    mode: string,
    params: PointSelection,
  ): EditPointSelection {
    return new EditPointSelection({
      selection_id: selection.id,
      mode: mode,
      points: params.points.map((point) =>
        DecimalVector3Data.fromVector3(point),
      ),
    });
  }

  /**
   * Gets the data to store so that this operation can be undone.
   */
  protected getData(selection: ReadonlyLabelSelection): PointSelection {
    return {
      points: [...selection.points],
    };
  }

  /**
   * Applies this operation to a selection.
   */
  protected applySelection(
    index: SegmentationIndex,
    selection: ReadonlyLabelSelection,
    params: EditPointSelectionParams,
  ): void {
    index.updateLabelSelection(selection, {
      points: params.points.map((point) => point.toVector3()),
    });
  }

  /**
   * Reverts the changes applied by this operation to a selection.
   */
  protected undoSelection(
    index: SegmentationIndex,
    selection: ReadonlyLabelSelection,
    data: PointSelection,
  ): void {
    index.updateLabelSelection(selection, {
      points: data.points,
    });
  }
}
