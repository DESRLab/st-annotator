import { Placeholder } from "sta/app/editor";
import { DecimalVector3Data, Timestamp } from "sta/common";

import {
  getDistinctiveLvByValue,
  getOcclusionLvByValue,
} from "../../../../../../models";
import type { BoxType } from "../../../../../../models";
import type { _BBoxIndex } from "../../BBoxIndex";
import type { UUID } from "../../models";
import { BBoxOperation } from "../BBoxOperation";

export type _Box = ReturnType<_BBoxIndex["getLabelBox"]>;
export type _BoxParams = Parameters<_BBoxIndex["addLabelBox"]>[0];

export interface CreateParamsData {
  entity_id: UUID | null;
  type: BoxType;
  center: DecimalVector3Data;
  angle: string;
  size: DecimalVector3Data;
  timestamp: string | null;
  quality_rank: number | null;
  distinctive_lv: number | null;
  occlusion_lv: number | null;
  perceived_class_id: number | null;
}

export class Create extends BBoxOperation<CreateParamsData, string> {
  get displayName(): string {
    return "Create Bounding Box";
  }

  get opName(): string {
    return "box-create";
  }

  #newBoxId = new Placeholder<string>();

  get opResult(): Placeholder<string> {
    return this.#newBoxId;
  }

  #newBox: _Box | undefined = undefined;

  get newBox(): _Box | undefined {
    return this.#newBox;
  }

  /**
   * Creates a new operation from a set of (unserialized) parameters.
   */
  static fromParams(params: Omit<_BoxParams, "config" | "id">): Create {
    return new Create({
      entity_id: params.entityId ?? null,
      timestamp: params.timestamp?.toJSON() ?? null,
      type: params.boxType,
      center: DecimalVector3Data.fromVector3(params.center),
      angle: params.angle.toString(),
      size: DecimalVector3Data.fromVector3(params.size),
      quality_rank: params.qualityRank ?? null,
      distinctive_lv: params.distinctiveLv?.toJSON() ?? null,
      occlusion_lv: params.occlusionLv?.toJSON() ?? null,
      perceived_class_id: params.perceivedClassId ?? null,
    });
  }

  /**
   * Applies this operation to a collection of bounding box labels.
   */
  applyIndex(index: _BBoxIndex) {
    if (this.#newBox !== undefined) {
      throw new Error("Cannot reapply an operation");
    }

    const params = this.opParams;
    this.#newBox = index.addLabelBox({
      id: this.#newBoxId,
      entityId: params.entity_id,
      boxType: params.type,
      center: params.center.toVector3(),
      angle: Number(params.angle),
      size: params.size.toVector3(),
      timestamp:
        params.timestamp == null ? null : new Timestamp(params.timestamp),
      qualityRank: params.quality_rank,
      distinctiveLv: getDistinctiveLvByValue(params.distinctive_lv),
      occlusionLv: getOcclusionLvByValue(params.occlusion_lv),
      perceivedClassId: params.perceived_class_id,
    });
  }

  /**
   * Reverts the changes applied by this operation to a collection of
   * bounding box labels.
   */
  undoIndex(index: _BBoxIndex) {
    if (this.#newBox === undefined) {
      throw new Error("Cannot undo an operation that has not been applied");
    }

    index.deleteLabelBox(this.#newBox);

    this.#newBox = undefined;
  }
}
