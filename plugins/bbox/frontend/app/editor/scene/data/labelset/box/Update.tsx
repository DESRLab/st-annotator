import { Vector3 } from "three";

import type { Placeholder as _Placeholder } from "sta/app/editor";
import { DecimalVector3Data } from "sta/common";
import type { Vector3XYZ } from "sta/common";

import {
  DistinctiveLevel,
  OcclusionLevel,
  getDistinctiveLvByValue,
  getOcclusionLvByValue,
} from "../../../../../../models";
import type { BoxType } from "../../../../../../models";
import type { _BBoxIndex } from "../../BBoxIndex";
import type { UUID } from "../../models";
import { BBoxOperation, StaleTargetError } from "../BBoxOperation";

export type _Box = ReturnType<_BBoxIndex["getLabelBox"]>;
export type _Track = ReturnType<_BBoxIndex["getLabelTrack"]>;

/** The subset of a box needed to construct an operation (its identity). */
export type BoxRef = Pick<_Box, "id">;
/** The subset of a track needed to construct an operation (its identity). */
export type TrackRef = Pick<_Track, "id">;

export interface UpdateParams {
  box_id: UUID;
}

abstract class Update<P extends UpdateParams, D> extends BBoxOperation<
  P,
  null
> {
  /**
   * The result of this operation, expressed as a {@link _Placeholder | Placeholder}.
   *
   * It is resolved with the value returned from the backend after it is pushed here.
   */
  get opResult(): null {
    return null;
  }

  #data: D | undefined = undefined;

  /**
   * Gets the data to store so that this operation can be undone.
   */
  protected abstract getData(box: _Box): D;

  /**
   * Applies this operation to a bounding box.
   */
  protected abstract applyBox(index: _BBoxIndex, box: _Box, params: P): void;

  /**
   * Reverts the changes applied by this operation to a bounding box.
   */
  protected abstract undoBox(index: _BBoxIndex, box: _Box, data: D): void;

  /**
   * Validates the remaining parameters against the index before anything is
   * mutated. The default is a no-op; operations that reference other labels
   * (e.g. the parent track) override this to reject stale references.
   */
  protected validateParams(index: _BBoxIndex, params: P): void {}

  /**
   * Applies this operation to a collection of bounding box labels.
   *
   * @throws {StaleTargetError} If the target box no longer exists in the
   * index (e.g. it was deleted before this operation could run).
   */
  applyIndex(index: _BBoxIndex) {
    if (this.#data !== undefined) {
      throw new Error("Cannot undo an operation that has not been applied");
    }

    const params = this.opParams;
    if (!index.hasLabelBox(params.box_id)) {
      throw new StaleTargetError(
        `There is no box with the given ID: ${params.box_id}`,
      );
    }

    const box = index.getLabelBox(params.box_id);
    this.validateParams(index, params);

    this.#data = this.getData(box);
    this.applyBox(index, box, params);
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
    const box = index.getLabelBox(params.box_id);

    this.undoBox(index, box, this.#data);
    this.#data = undefined;
  }
}

export interface AssignEntityParams {
  box_id: UUID;
  entity_id: UUID | null;
}

export class AssignEntity extends Update<AssignEntityParams, UUID | null> {
  get displayName(): string {
    return "Assign Object Track";
  }

  get opName(): string {
    return "box-assign-entity";
  }

  /**
   * Creates a new operation from a set of (unserialized) parameters.
   */
  static fromParams(box: BoxRef, track: TrackRef | null): AssignEntity {
    return new AssignEntity({
      box_id: box.id,
      entity_id: track?.id ?? null,
    });
  }

  /**
   * Rejects the assignment when the target track has disappeared (e.g. it
   * was deleted while this operation was queued), so a box never ends up
   * with a dangling parent-track reference.
   */
  protected validateParams(
    index: _BBoxIndex,
    params: AssignEntityParams,
  ): void {
    if (params.entity_id != null && !index.hasLabelTrack(params.entity_id)) {
      throw new StaleTargetError(
        `There is no track with the given ID: ${params.entity_id}`,
      );
    }
  }

  protected getData(box: _Box): UUID | null {
    return box.entityId;
  }

  protected applyBox(index: _BBoxIndex, box: _Box, params: AssignEntityParams) {
    index.updateLabelBox(box, { entityId: params.entity_id });
  }

  protected undoBox(index: _BBoxIndex, box: _Box, data: UUID | null) {
    index.updateLabelBox(box, { entityId: data });
  }
}

export interface AssignClassParams {
  box_id: UUID;
  perceived_class_id: number | null;
}

export class AssignClass extends Update<AssignClassParams, number | null> {
  get displayName(): string {
    return "Assign Perceived Class";
  }

  get opName(): string {
    return "box-assign-class";
  }

  /**
   * Creates a new operation from a set of (unserialized) parameters.
   */
  static fromParams(
    box: BoxRef,
    labelClass: { id: number } | null,
  ): AssignClass {
    return new AssignClass({
      box_id: box.id,
      perceived_class_id: labelClass?.id ?? null,
    });
  }

  protected getData(box: _Box): number | null {
    return box.perceivedClassId;
  }

  protected applyBox(index: _BBoxIndex, box: _Box, params: AssignClassParams) {
    index.updateLabelBox(box, {
      perceivedClassId: params.perceived_class_id,
    });
  }

  protected undoBox(index: _BBoxIndex, box: _Box, data: number | null) {
    index.updateLabelBox(box, { perceivedClassId: data });
  }
}

export interface AssignTypeParams {
  box_id: UUID;
  box_type: BoxType;
}

export class AssignType extends Update<AssignTypeParams, BoxType> {
  get displayName(): string {
    return "Update Geometry Type";
  }

  get opName(): string {
    return "box-assign-type";
  }

  /**
   * Creates a new operation from a set of (unserialized) parameters.
   */
  static fromParams(box: BoxRef, boxType: BoxType): AssignType {
    return new AssignType({
      box_id: box.id,
      box_type: boxType,
    });
  }

  protected getData(box: _Box): BoxType {
    return box.boxType;
  }

  protected applyBox(index: _BBoxIndex, box: _Box, params: AssignTypeParams) {
    index.updateLabelBox(box, { boxType: params.box_type });
  }

  protected undoBox(index: _BBoxIndex, box: _Box, data: BoxType) {
    index.updateLabelBox(box, { boxType: data });
  }
}

export interface AssignDistinctiveLvParams {
  box_id: UUID;
  distinctive_lv: number | null;
}

export class AssignDistinctiveLv extends Update<
  AssignDistinctiveLvParams,
  DistinctiveLevel
> {
  get displayName(): string {
    return "Set Distinctiveness Level";
  }

  get opName(): string {
    return "box-assign-distinctive-level";
  }

  /**
   * Creates a new operation from a set of (unserialized) parameters.
   */
  static fromParams(
    box: BoxRef,
    distinctiveLv: DistinctiveLevel,
  ): AssignDistinctiveLv {
    return new AssignDistinctiveLv({
      box_id: box.id,
      distinctive_lv: distinctiveLv.toJSON(),
    });
  }

  protected getData(box: _Box): DistinctiveLevel {
    return box.distinctiveLv;
  }

  protected applyBox(
    index: _BBoxIndex,
    box: _Box,
    params: AssignDistinctiveLvParams,
  ) {
    index.updateLabelBox(box, {
      distinctiveLv: getDistinctiveLvByValue(params.distinctive_lv),
    });
  }

  protected undoBox(index: _BBoxIndex, box: _Box, data: DistinctiveLevel) {
    index.updateLabelBox(box, { distinctiveLv: data });
  }
}

export interface AssignOcclusionLvParams {
  box_id: UUID;
  occlusion_lv: number | null;
}

export class AssignOcclusionLv extends Update<
  AssignOcclusionLvParams,
  OcclusionLevel
> {
  get displayName(): string {
    return "Set Occlusion Level";
  }

  get opName(): string {
    return "box-assign-occlusion-level";
  }

  /**
   * Creates a new operation from a set of (unserialized) parameters.
   */
  static fromParams(
    box: BoxRef,
    occlusionLv: OcclusionLevel,
  ): AssignOcclusionLv {
    return new AssignOcclusionLv({
      box_id: box.id,
      occlusion_lv: occlusionLv.toJSON(),
    });
  }

  protected getData(box: _Box): OcclusionLevel {
    return box.occlusionLv;
  }

  protected applyBox(
    index: _BBoxIndex,
    box: _Box,
    params: AssignOcclusionLvParams,
  ) {
    index.updateLabelBox(box, {
      occlusionLv: getOcclusionLvByValue(params.occlusion_lv),
    });
  }

  protected undoBox(index: _BBoxIndex, box: _Box, data: OcclusionLevel) {
    index.updateLabelBox(box, { occlusionLv: data });
  }
}

/**
 * The pose of a bounding box, as plain records so it can cross the
 * React/pane state boundary. Converted to three.js vectors only when
 * applied to the label model.
 */
export interface BoxPose {
  center: Vector3XYZ;
  angle: number;
  size: Vector3XYZ;
}

export interface TransformBoxParams {
  box_id: UUID;
  mode: string;
  center: DecimalVector3Data;
  angle: string;
  size: DecimalVector3Data;
}

export class TransformBox extends Update<TransformBoxParams, BoxPose> {
  get displayName(): string {
    return "Transform Box";
  }

  get opName(): string {
    return "box-transform";
  }

  /**
   * The pose to store so that this operation can be undone, if given explicitly
   * instead of being read from the box when the operation is applied.
   */
  #prevPose: BoxPose | undefined = undefined;

  /**
   * Creates a new operation from a set of (unserialized) parameters.
   *
   * @param prevPose If given, the pose of the box before the transformation,
   * stored as the undo data of the operation instead of the pose read from
   * the box when the operation is applied. This is needed when the box already
   * reflects the new pose (e.g. while it is being transformed through a gizmo).
   */
  static fromParams(
    box: BoxRef,
    mode: string,
    pose: BoxPose,
    prevPose?: BoxPose,
  ): TransformBox {
    const op = new TransformBox({
      box_id: box.id,
      mode: mode,
      center: DecimalVector3Data.create({
        x: pose.center.x.toString(),
        y: pose.center.y.toString(),
        z: pose.center.z.toString(),
      }),
      angle: pose.angle.toString(),
      size: DecimalVector3Data.create({
        x: pose.size.x.toString(),
        y: pose.size.y.toString(),
        z: pose.size.z.toString(),
      }),
    });

    op.#prevPose = prevPose;

    return op;
  }

  protected getData(box: _Box): BoxPose {
    if (this.#prevPose !== undefined) {
      return this.#prevPose;
    }

    return {
      center: { x: box.center.x, y: box.center.y, z: box.center.z },
      angle: box.angle,
      size: { x: box.size.x, y: box.size.y, z: box.size.z },
    };
  }

  protected applyBox(index: _BBoxIndex, box: _Box, params: TransformBoxParams) {
    index.updateLabelBox(box, {
      center: params.center.toVector3(),
      angle: Number(params.angle),
      size: params.size.toVector3(),
    });
  }

  protected undoBox(index: _BBoxIndex, box: _Box, data: BoxPose) {
    index.updateLabelBox(box, {
      center: new Vector3(data.center.x, data.center.y, data.center.z),
      angle: data.angle,
      size: new Vector3(data.size.x, data.size.y, data.size.z),
    });
  }
}
