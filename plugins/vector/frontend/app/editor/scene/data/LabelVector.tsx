import * as THREE from "three";
import BiMap from "ts-bidirectional-map";

import type { EditorConfig } from "sta/app/editor";
import { Equatable } from "sta/common";
import type { Timestamp } from "sta/common";

import { VectorType } from "../../../../models";

import type { ReadonlyLabelClass } from "./LabelClass";
import type { VectorIndexEventMap, ReadonlyVectorIndex } from "./VectorIndex";
import type { UUID } from "./models";
import { PointBuilder, LineBuilder } from "./views";
import type { VectorBuilder, VectorGeo, Line, Point } from "./views";
import type { VectorBuilderParams } from "./views/VectorGeo";

type VectorTypeValue = (typeof VectorType)[keyof typeof VectorType];

export { type VectorTypeValue as VectorType };

interface LabelVectorViewParams {
  vectorBuilder: VectorBuilder;
  vectorCoords?: readonly Readonly<THREE.Vector3>[];
  color?: Readonly<THREE.Color>;
}

/**
 * View class for {@link LabelVector}
 */
class LabelVectorView {
  #vectorBuilder: VectorBuilder;

  #vectorGeo: VectorGeo<Line | Point>;

  get vectorGeo(): VectorGeo<Line | Point> {
    return this.#vectorGeo;
  }

  // The coordinates of each vertex in the object vector.
  get vectorCoords(): readonly THREE.Vector3[] {
    return this.#vectorGeo.vectorCoords;
  }

  set vectorCoords(value: readonly THREE.Vector3[]) {
    this.#vectorGeo.vectorCoords = value;
  }

  // Creates the `three.js` objects of the vector object.
  get vectorBuilder(): VectorBuilder {
    return this.#vectorBuilder;
  }

  set vectorBuilder(value: VectorBuilder) {
    if (this.#vectorBuilder !== value) {
      this.#vectorBuilder = value;
      this.#vectorGeo = LabelVectorView.#createVector(value, this);
    }
  }

  static #createVector(
    builder: VectorBuilder,
    params: LabelVectorViewParams | VectorBuilderParams,
  ): VectorGeo<Line | Point> {
    return builder.createVector(params as VectorBuilderParams);
  }

  // The display color of the object vector.
  get color(): Readonly<THREE.Color> {
    return this.#vectorGeo.color;
  }

  set color(value: Readonly<THREE.Color>) {
    this.#vectorGeo.color = value;
  }

  constructor(params: LabelVectorViewParams) {
    this.#vectorGeo = LabelVectorView.#createVector(params.vectorBuilder, {
      vectorCoords: params.vectorCoords ?? [new THREE.Vector3(0, 0, 0)],
      color: params.color ?? new THREE.Color("red"),
    });
  }

  asObject3D(): THREE.Object3D {
    return this.#vectorGeo.asObject3D();
  }

  raycast(
    raycaster: THREE.Raycaster,
    intersects: THREE.Intersection[] = [],
  ): THREE.Intersection[] {
    return this.#vectorGeo.raycast(raycaster, intersects);
  }
}

// A mapping to/from each view type for a vector object its string representation.
const vectorBuilderToString = new BiMap<VectorBuilder, VectorTypeValue>();
vectorBuilderToString.set(new LineBuilder(), "LineString");
vectorBuilderToString.set(new LineBuilder(), "Polygon");
vectorBuilderToString.set(new PointBuilder(), "Point");

export interface LabelVectorParams {
  config: EditorConfig;
  labels: ReadonlyVectorIndex | null;
  id: UUID;
  vectorType: VectorTypeValue;
  vertices: readonly THREE.Vector3[];
  timestamp?: Timestamp | null;
  gtClassId?: number | null;
  showColor?: Readonly<THREE.Color> | null;
}

export interface PropertyChangeEvent {
  obj: LabelVector;
  propertyKey: Exclude<keyof LabelVectorParams, "config" | "labels">;
}

export interface LabelVectorEventMap {
  change: PropertyChangeEvent;
}

export type ReadonlyLabelVector = Pick<
  Readonly<LabelVector>,
  | keyof THREE.EventDispatcher<LabelVectorEventMap>
  | "asObject3D"
  | "getGeo"
  | "raycast"
  | "rollbackCoords"
  | keyof LabelVectorParams
  | "gtClass"
  | "vertices"
  | "vectorType"
  | "vectorCoords"
  | "setDisplayColor"
>;

/**
 * Represents an object across one or more frames.
 */
export class LabelVector extends THREE.EventDispatcher<LabelVectorEventMap> {
  readonly #view: LabelVectorView;

  asObject3D(): THREE.Object3D {
    return this.#view.asObject3D();
  }

  getGeo(): VectorGeo<Line | Point> {
    return this.#view.vectorGeo;
  }

  /**
   * Restores the rendered geometry to the given view-space coordinates.
   *
   * Sanctioned transient rollback: converges the Object3D back to the state
   * captured before an in-progress transform that was then abandoned (an
   * invalid result or an abort). It does NOT create a labelset operation,
   * because the restored coordinates equal the pre-transform state, so the
   * committed model is unchanged.
   *
   * The parameter is in *view* space, so a caller comparing the restored
   * geometry against stored coordinates must convert them first through
   * `config.coordinateFormat.toDatabaseCoords`, the default `ZXY` format is
   * not the identity map, and an unconverted snapshot silently fails the
   * comparison, rolling back work the user actually committed.
   */
  rollbackCoords(viewCoords: readonly THREE.Vector3[]): void {
    this.#view.vectorCoords = viewCoords;
  }

  raycast(
    raycaster: THREE.Raycaster,
    intersects: THREE.Intersection[] = [],
  ): THREE.Intersection[] {
    return this.#view.raycast(raycaster, intersects);
  }

  readonly config: EditorConfig;

  #labels: ReadonlyVectorIndex | null;

  // A collection of labels from which related labels are queried for this vector object.
  get labels(): ReadonlyVectorIndex | null {
    return this.#labels;
  }

  set labels(value: ReadonlyVectorIndex | null) {
    if (this.#labels !== value) {
      this.#labels?.removeEventListener("class-delete", this.#onClassDelete);
      this.#labels?.removeEventListener("class-update", this.#onClassUpdate);
      this.#labels?.removeEventListener("vector-add", this.#onVectorChange);
      this.#labels?.removeEventListener("vector-delete", this.#onVectorChange);
      this.#labels?.removeEventListener("vector-update", this.#onVectorChange);

      this.#labels = value;
      this.#labels?.addEventListener("class-delete", this.#onClassDelete);
      this.#labels?.addEventListener("class-update", this.#onClassUpdate);
      this.#labels?.addEventListener("vector-add", this.#onVectorChange);
      this.#labels?.addEventListener("vector-delete", this.#onVectorChange);
      this.#labels?.addEventListener("vector-update", this.#onVectorChange);

      this.render();
    }
  }

  #id: UUID;

  // The unique identifier of this vector object.
  get id(): UUID {
    return this.#id;
  }

  set id(value: UUID) {
    if (this.#id !== value) {
      this.#id = value;

      this.render();
      this.dispatchEvent({
        type: "change",
        obj: this,
        propertyKey: "id",
      });
    }
  }

  #vectorType: VectorTypeValue;

  // Indicates the type of bounding box.
  get vectorType(): VectorTypeValue {
    return this.#vectorType;
  }

  set vectorType(value: VectorTypeValue) {
    if (this.#vectorType !== value) {
      this.#vectorType = value;

      this.render();
      this.dispatchEvent({
        type: "change",
        obj: this,
        propertyKey: "vectorType",
      });
    }
  }

  // The vertices of the vector object in the coordinate system of the database.
  get vertices(): readonly THREE.Vector3[] {
    return LabelVector.#getVectorVerices(this.config, this.#view);
  }

  set vertices(value: readonly THREE.Vector3[]) {
    this.#view.vectorCoords = LabelVector.#getVectorCoords(this.config, value);

    this.render();
    this.dispatchEvent({
      type: "change",
      obj: this,
      propertyKey: "vertices",
    });
  }

  // The vertices of the vector object in threejs coordinate system, that being rendered on the scene.
  get vectorCoords(): readonly THREE.Vector3[] {
    return this.#view.vectorCoords;
  }

  #gtClassId: number | null;

  // The unique identifier of the ground truth class of the represented object, or `null` if no class is assigned.
  get gtClassId(): number | null {
    return this.#gtClassId;
  }

  set gtClassId(value: number | null) {
    if (this.#gtClassId !== value) {
      this.#gtClassId = value;

      this.render();
      this.dispatchEvent({
        type: "change",
        obj: this,
        propertyKey: "gtClassId",
      });
    }
  }

  // The ground truth class of the represented object, or `null` if no class is assigned.
  get gtClass(): ReadonlyLabelClass | null {
    const { labels } = this;
    if (labels == null) return null;

    return LabelVector.#getGroundTruthClass(labels, this.gtClassId);
  }

  #showColor: THREE.Color | null = null;

  // If given, displays the given color for the bounding box, regardless of `showPerceivedClass`.
  get showColor(): Readonly<THREE.Color> | null {
    return this.#showColor;
  }

  set showColor(value: Readonly<THREE.Color> | null) {
    if (!Equatable.equalsNullable(this.#showColor, value)) {
      this.#showColor = value?.clone() ?? null;

      this.render();
      this.dispatchEvent({
        type: "change",
        obj: this,
        propertyKey: "showColor",
      });
    }
  }

  /** Updates transient scene color without emitting a label-data event. */
  setDisplayColor(value: Readonly<THREE.Color> | null): void {
    if (Equatable.equalsNullable(this.#showColor, value)) return;
    this.#showColor = value?.clone() ?? null;
    this.render();
  }

  #timestamp: Timestamp | null;

  // The timestamp of the represented object.
  get timestamp(): Timestamp | null {
    return this.#timestamp;
  }

  set timestamp(value: Timestamp | null) {
    if (!Equatable.equalsNullable(this.#timestamp, value)) {
      this.#timestamp = value?.clone() ?? null;

      this.render();
      this.dispatchEvent({
        type: "change",
        obj: this,
        propertyKey: "timestamp",
      });
    }
  }

  render() {
    const { vectorType, gtClassId, config, vertices } = this;
    const view = this.#view;
    const labels = this.#labels;
    view.vectorBuilder = LabelVector.#getVectorBuilder(vectorType);

    if (labels == null) return;

    view.vectorCoords = LabelVector.#getVectorCoords(config, vertices);
    view.color = LabelVector.#getColor(labels, gtClassId, this);
  }

  static #getVectorBuilder(vectorType: VectorTypeValue): VectorBuilder {
    const vectorBuilder = vectorBuilderToString.getKey(vectorType);
    if (vectorBuilder == null) {
      throw new Error(`Unrecognized vector type: ${vectorType}`);
    }

    return vectorBuilder;
  }

  static #getVectorVerices(
    config: EditorConfig,
    view: LabelVectorView,
  ): readonly Readonly<THREE.Vector3>[] {
    const vectorVerices = view.vectorCoords;
    const format = config.coordinateFormat;
    return vectorVerices.map((vertex: THREE.Vector3) =>
      format.toDatabaseCoords(vertex),
    );
  }

  static #getVectorCoords(
    config: EditorConfig,
    vertices: readonly THREE.Vector3[],
  ): readonly THREE.Vector3[] {
    const format = config.coordinateFormat;
    return vertices.map((vertex: THREE.Vector3) =>
      format.toThreeJSCoords(vertex),
    );
  }

  static readonly #NO_CLASS_COLOR: Readonly<THREE.Color> = new THREE.Color(
    0xd22b2b,
  );

  static #getGroundTruthClass(
    labels: ReadonlyVectorIndex,
    gtClassId: number | null,
  ): ReadonlyLabelClass | null {
    return gtClassId == null ? null : labels.getLabelClass(gtClassId);
  }

  static #getColor(
    labels: ReadonlyVectorIndex,
    gtClassId: number | null,
    model: {
      showColor: Readonly<THREE.Color> | null;
      gtClassId: number | null;
    },
  ): Readonly<THREE.Color> {
    if (model.showColor) return model.showColor;
    const gtClass = LabelVector.#getGroundTruthClass(labels, gtClassId);
    return gtClass?.vectorColor ?? LabelVector.#NO_CLASS_COLOR;
  }

  #onVectorChange = (
    event:
      | VectorIndexEventMap["vector-add"]
      | VectorIndexEventMap["vector-delete"]
      | VectorIndexEventMap["vector-update"],
  ) => {
    if (event.obj.id === this.id) {
      this.render();
    }
  };

  #onClassDelete = (event: VectorIndexEventMap["class-delete"]) => {
    if (event.obj === this.gtClass) {
      this.render();
    }
  };

  #onClassUpdate = (event: VectorIndexEventMap["class-update"]) => {
    if (event.obj === this.gtClass) {
      this.render();
    }
  };

  constructor(params: LabelVectorParams) {
    super();
    this.config = params.config;

    this.#labels = params.labels;
    this.#labels?.addEventListener("vector-add", this.#onVectorChange);
    this.#labels?.addEventListener("vector-delete", this.#onVectorChange);
    this.#labels?.addEventListener("vector-update", this.#onVectorChange);
    this.#labels?.addEventListener("class-delete", this.#onClassDelete);
    this.#labels?.addEventListener("class-update", this.#onClassUpdate);

    this.#id = params.id;
    this.#vectorType = params.vectorType;
    this.#gtClassId = params.gtClassId ?? null;
    this.#timestamp = params.timestamp?.clone() ?? null;
    this.#showColor = params.showColor?.clone() ?? null;

    this.#view = new LabelVectorView({
      vectorBuilder: LabelVector.#getVectorBuilder(params.vectorType),
      vectorCoords: LabelVector.#getVectorCoords(this.config, params.vertices),
    });
  }

  dispose() {
    this.#labels?.removeEventListener("vector-add", this.#onVectorChange);
    this.#labels?.removeEventListener("vector-delete", this.#onVectorChange);
    this.#labels?.removeEventListener("vector-update", this.#onVectorChange);
    this.#labels?.removeEventListener("class-delete", this.#onClassDelete);
    this.#labels?.removeEventListener("class-update", this.#onClassUpdate);
  }
}
