import * as THREE from "three";

import type { Placeholder as _Placeholder } from "sta/app/editor";
import { DecimalVector3Data } from "sta/common";
import type { Vector3XYZ } from "sta/common";

import { StaleTargetError, VectorOperation } from "../VectorOperation";

type UUID = string;

type VectorType = string;

interface UpdateParams {
  vector_id: UUID;
}

abstract class Update<P extends UpdateParams, D> extends VectorOperation<
  P,
  null
> {
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
  protected abstract getData(vector: any): D;

  /**
   * Applies this operation to a vector object.
   */
  protected abstract applyVector(index: any, vector: any, params: P): void;

  /**
   * Reverts the changes applied by this operation to a vector object.
   */
  protected abstract undoVector(index: any, vector: any, data: D): void;

  /**
   * Applies this operation to a collection of vector labels.
   *
   * @throws {StaleTargetError} If the target vector no longer exists in the
   * index (e.g. it was deleted before this operation could run).
   */
  applyIndex(index: any) {
    if (this.#data !== undefined) {
      throw new Error("Cannot undo an operation that has not been applied");
    }

    const params = this.opParams;
    if (!index.hasLabelVector(params.vector_id)) {
      throw new StaleTargetError(
        `There is no vector with the given ID: ${params.vector_id}`,
      );
    }

    const vector = index.getLabelVector(params.vector_id);

    this.#data = this.getData(vector);
    this.applyVector(index, vector, params);
  }

  /**
   * Undos this operation to a collection of vector labels.
   */
  undoIndex(index: any) {
    if (this.#data === undefined) {
      throw new Error("Cannot undo an operation that has not been applied");
    }

    const params = this.opParams;
    const vector = index.getLabelVector(params.vector_id);

    this.undoVector(index, vector, this.#data);
    this.#data = undefined;
  }
}

export interface AssignVectorClassParams {
  vector_id: UUID;
  gt_class_id: number | null;
}

export class AssignClass extends Update<
  AssignVectorClassParams,
  number | null
> {
  /**
   * The display name of this operation
   */
  get displayName(): string {
    return "Assign Ground Truth Class";
  }

  /**
   * The name of this operation, which is sent to the backend.
   */
  get opName(): string {
    return "vector-assign-class";
  }

  /**
   * Creates a new operation from a set of (unserialized) parameters.
   */
  static fromParams(vector: any, labelClass: any): AssignClass {
    return new AssignClass({
      vector_id: vector.id,
      gt_class_id: labelClass?.id ?? null,
    });
  }

  /**
   * Gets the data to store so that this operation can be undone.
   */
  getData(vector: any): number | null {
    return vector.gtClassId;
  }

  /**
   * Applies this operation to a vector object.
   */
  protected applyVector(
    index: any,
    vector: any,
    params: AssignVectorClassParams,
  ) {
    index.updateLabelVector(vector, { gtClassId: params.gt_class_id });
  }

  /**
   * Reverts the changes applied by this operation to a vector obejct.
   */
  protected undoVector(index: any, vector: any, data: number | null) {
    index.updateLabelVector(vector, { gtClassId: data });
  }
}

export interface VectorGeometry {
  vertices: readonly Vector3XYZ[];
  type: VectorType;
}

export interface VectorVertices {
  type: VectorType;
  coords: DecimalVector3Data[];
}

export interface EditVectorGeometryParams {
  vector_id: UUID;
  mode: string;
  vertices: VectorVertices;
}

export class EditVectorGeometry extends Update<
  EditVectorGeometryParams,
  VectorGeometry
> {
  /**
   * The explicit vertices to store so that this operation can be undone,
   * if given at construction.
   *
   * They are plain {@link Vector3XYZ} records in model coordinates, used
   * when the vector's current state already reflects the new vertices
   * (e.g. during a gizmo drag), so the previous vertices cannot be read
   * from the vector itself.
   */
  #prevVertices: readonly Vector3XYZ[] | undefined;

  /**
   * The display name of this operation.
   */
  get displayName(): string {
    return "Edit Vector Geometry";
  }

  /**
   * The name of this operation, which is sent to the backend.
   */
  get opName(): string {
    return "vector-edit";
  }

  /**
   * Creates a new operation from a set of (unserialized) parameters.
   *
   * The vertices are plain {@link Vector3XYZ} records; they are serialized
   * to {@link DecimalVector3Data} here for the wire and converted back to
   * three.js vectors only when the operation is applied to the index.
   *
   * If `prevVertices` is given, it is used as the undo state instead of
   * reading the current state of the vector.
   */
  static fromParams(
    vector: any,
    mode: string,
    params: VectorGeometry,
    prevVertices?: readonly Readonly<Vector3XYZ>[],
  ): EditVectorGeometry {
    const op = new EditVectorGeometry({
      vector_id: vector.id,
      mode: mode,
      vertices: {
        type: params.type,
        coords: params.vertices.map((v: Readonly<Vector3XYZ>) =>
          DecimalVector3Data.create({
            x: v.x.toString(),
            y: v.y.toString(),
            z: v.z.toString(),
          }),
        ),
      },
    });

    op.#prevVertices = prevVertices?.map((v: Readonly<Vector3XYZ>) => ({
      x: v.x,
      y: v.y,
      z: v.z,
    }));

    return op;
  }

  /**
   * Gets the data to store so that this operation can be undone.
   *
   * The model's vertices are three.js vectors; they are stored as plain
   * {@link Vector3XYZ} records so the undo state stays free of three.js
   * objects.
   */
  getData(vector: any): VectorGeometry {
    const prevVertices = this.#prevVertices;

    const vertices =
      prevVertices !== undefined
        ? prevVertices.map((v: Readonly<Vector3XYZ>) => ({
            x: v.x,
            y: v.y,
            z: v.z,
          }))
        : vector.vertices.map((v: Readonly<THREE.Vector3>) => ({
            x: v.x,
            y: v.y,
            z: v.z,
          }));

    return {
      vertices: vertices,
      type: vector.vectorType,
    };
  }

  /**
   * Applies this operation to a vector object.
   */
  protected applyVector(
    index: any,
    vector: any,
    params: EditVectorGeometryParams,
  ) {
    index.updateLabelVector(vector, {
      vectorType: params.vertices.type,
      vertices: params.vertices.coords.map((vertex: DecimalVector3Data) =>
        vertex.toVector3(),
      ),
    });
  }

  /**
   * Reverts the changes applied by this operation to a vector object.
   */
  protected undoVector(index: any, vector: any, data: VectorGeometry) {
    index.updateLabelVector(vector, {
      vertices: data.vertices.map(
        (v: Readonly<Vector3XYZ>) => new THREE.Vector3(v.x, v.y, v.z),
      ),
      vectorType: data.type,
    });
  }
}
