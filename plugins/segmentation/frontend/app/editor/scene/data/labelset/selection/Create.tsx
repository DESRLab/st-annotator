import { Placeholder } from "sta/app/editor";
import { DecimalVector3Data, Timestamp } from "sta/common";

import {
  getDistinctiveLvByValue,
  getOcclusionLvByValue,
} from "../../../../../../models";
import type { ReadonlyLabelSelection } from "../../LabelSelection";
import type {
  SelectionParams,
  SegmentationIndex,
} from "../../SegmentationIndex";
import type { UUID } from "../../models";
import { SegmentationOperation } from "../SegmentationOperation";

export interface CreateParamsData {
  entity_id: UUID | null;
  timestamp: string | null;
  points: DecimalVector3Data[];
  quality_rank: number | null;
  distinctive_lv: number | null;
  occlusion_lv: number | null;
  perceived_class_id: number | null;
}

export class Create extends SegmentationOperation<CreateParamsData, string> {
  /**
   * The display name of this operation.
   */
  get displayName(): string {
    return "Create a Selection";
  }

  /**
   * The name of this operation, which is sent to the backend.
   */
  get opName(): string {
    return "selection-create";
  }

  #newSelectionId = new Placeholder<string>();

  /**
   * The result of this operation, expressed as a {@link Placeholder}.
   *
   * It is resolved with the value returned from the backend after it is pushed there.
   */
  get opResult(): Placeholder<string> {
    return this.#newSelectionId;
  }

  #newSelection: ReadonlyLabelSelection | undefined = undefined;

  get newSelection(): ReadonlyLabelSelection | undefined {
    return this.#newSelection;
  }

  /**
   * Creates a new operation from a set of (unserialized) parameters.
   */
  static fromParams(params: Omit<SelectionParams, "config" | "id">): Create {
    return new Create({
      entity_id: params.entityId ?? null,
      points: params.points.map((point) =>
        DecimalVector3Data.fromVector3(point),
      ),
      timestamp: params.timestamp?.toJSON() ?? null,
      quality_rank: params.qualityRank ?? null,
      distinctive_lv: params.distinctiveLv?.toJSON() ?? null,
      occlusion_lv: params.occlusionLv?.toJSON() ?? null,
      perceived_class_id: params.perceivedClassId ?? null,
    });
  }

  /**
   * Applies this operation to a collection of segmentation labels.
   */
  applyIndex(index: SegmentationIndex): void {
    if (this.#newSelection !== undefined) {
      throw new Error("Cannot reapply an operation");
    }

    const params = this.opParams;
    this.#newSelection = index.addLabelSelection({
      id: this.#newSelectionId,
      entityId: params.entity_id,
      points: params.points.map((point) => point.toVector3()),
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
   * segmentation labels.
   */
  undoIndex(index: SegmentationIndex): void {
    if (this.#newSelection === undefined) {
      throw new Error("Cannot undo an operation that has not been applied");
    }

    index.deleteLabelSelection(this.#newSelection);

    this.#newSelection = undefined;
  }
}
