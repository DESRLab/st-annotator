import { Placeholder } from "sta/app/editor";
import { DecimalVector3Data, Timestamp } from "sta/common";

import { VectorOperation } from "../VectorOperation";

export type UUID = string | Placeholder<any>;

type VectorType = string;

export interface VectorVertices {
  type: VectorType;
  coords: DecimalVector3Data[];
}

export interface CreateVectorParamsData {
  entity_id: UUID | null;
  vertices: VectorVertices;
  timestamp: string | null;
  gtClassId: number | null;
}

export class Create extends VectorOperation<CreateVectorParamsData, string> {
  /**
   * The display name of this operation.
   */
  get displayName(): string {
    return "Create Vector Object";
  }

  /**
   * The name of this operation, which is sent to the backend.
   */
  get opName(): string {
    return "vector-create";
  }

  #newVectorId = new Placeholder<string>();

  /**
   * The result of this operation, expressed as a {@link Placeholder}
   *
   * It is resolved with the value returned from backend after it is pushed there.
   */
  get opResult(): Placeholder<string> {
    return this.#newVectorId;
  }

  #newVector: any;

  get newVector() {
    return this.#newVector;
  }

  /**
   * Creates a new operation from a set of (unserialized) parameters.
   */
  static fromParams(params: any): Create {
    return new Create({
      entity_id: null,
      timestamp: params.timestamp?.toJSON() ?? null,
      vertices: {
        type: params.vectorType,
        coords: params.vertices.map((v: any) =>
          DecimalVector3Data.fromVector3(v),
        ),
      },
      gtClassId: params.gtClassId ?? null,
    });
  }

  /**
   * Applies this operation to a collection of vector object labels.
   */
  applyIndex(index: any) {
    if (this.#newVector !== undefined) {
      throw new Error("Cannot reapply an operation");
    }

    const params = this.opParams;
    this.#newVector = index.addLabelVector({
      id: this.#newVectorId,
      timestamp:
        params.timestamp == null ? null : new Timestamp(params.timestamp),
      vectorType: params.vertices.type,
      vertices: params.vertices.coords.map((vertex: DecimalVector3Data) =>
        vertex.toVector3(),
      ),
      gtClassId: params.gtClassId,
    });
  }

  /**
   * Reverts the changes applied by this operation to a collection of vector labels.
   */
  undoIndex(index: any) {
    if (this.#newVector === undefined) {
      throw new Error("Cannot undo an operation that has not been applied");
    }

    index.deleteLabelVector(this.#newVector);

    this.#newVector = undefined;
  }
}
