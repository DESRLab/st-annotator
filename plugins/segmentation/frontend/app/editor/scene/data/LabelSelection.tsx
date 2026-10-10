import * as THREE from "three";

import type { EditorConfig } from "sta/app/editor";
import { Equatable, Timestamp } from "sta/common";

import { DistinctiveLevel, OcclusionLevel } from "../../../../models";
import type { QualityLevel } from "../../../../models";

import type { ReadonlyLabelClass } from "./LabelClass";
import type { ReadonlyLabelInstance } from "./LabelInstance";
import type {
  SegmentationIndexEventMap,
  ReadonlySegmentationIndex,
} from "./SegmentationIndex";
import type { UUID } from "./models";
import { Selection } from "./views";

interface LabelSelectionViewParams {
  /** The points' coordinates of creating a selection. */
  pointsCoords?: readonly Readonly<THREE.Vector3>[] | Float32Array;
  /** The size of the points of a selection. */
  pointSize?: number;
  /** The display color of the point selection. Defaults to black. */
  color?: Readonly<THREE.Color>;
  /** The opacity of selection points over source points. */
  opacity?: number;
  /** `false` (default) if center of a selection is visibile, otherwise, `false`. */
  showCenter?: boolean;
}

/**
 * View class for {@link LabelSelection}
 */
class LabelSelectionView {
  readonly #selection: Selection;

  get selection(): Selection {
    return this.#selection;
  }

  /** The coordinates of each vertex in the object vector. */
  get pointCoords(): readonly Readonly<THREE.Vector3>[] {
    return this.#selection.pointCoords;
  }

  set pointCoords(value: readonly Readonly<THREE.Vector3>[] | Float32Array) {
    this.#selection.pointCoords = value;
  }

  /** The display color of the object vector. */
  get color(): Readonly<THREE.Color> {
    return this.#selection.color;
  }

  set color(value: Readonly<THREE.Color>) {
    this.#selection.color = value;
  }

  /** The points' size of the selection. */
  get pointSize(): number {
    return this.#selection.pointSize;
  }

  set pointSize(value: number) {
    this.#selection.pointSize = value;
  }

  /** The opacity of selection points over source points. */
  get opacity(): number {
    return this.#selection.opacity;
  }

  set opacity(value: number) {
    this.#selection.opacity = value;
  }

  /** The center of this selection. */
  get centerPoint(): Readonly<THREE.Vector3> {
    return this.#selection.centerPoint;
  }

  /** `true` if the center of the selection is visible; otherwise, `false`. */
  get showCenter(): boolean {
    return this.#selection.showCenter;
  }

  set showCenter(value: boolean) {
    this.#selection.showCenter = value;
  }

  /** Creates a view for a {@link LabelSelection} */
  constructor(params: LabelSelectionViewParams) {
    this.#selection = new Selection({
      pointsCoords: params.pointsCoords ?? [],
      color: params.color ?? new THREE.Color("red"),
      opacity: params.opacity,
      pointSize: params.pointSize ?? 0.5,
      showCenter: params.showCenter ?? false,
    });
  }

  dispose(): void {
    this.#selection.dispose();
  }

  /** Returns a `three.js` representation of this view. */
  asObject3D(): THREE.Object3D {
    return this.#selection.asObject3D();
  }

  /** Returns a `three.js` representation of the center point of this view. */
  centerAsObject3D(): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
    return this.#selection.centerAsObject3D();
  }

  /** Performs raycasting against this view. */
  raycast(
    raycaster: THREE.Raycaster,
    intersects: THREE.Intersection[] = [],
  ): THREE.Intersection[] {
    return this.#selection.raycast(raycaster, intersects);
  }
}

export interface LabelSelectionParams {
  /** The configuration of the project. */
  config: EditorConfig;
  /**
   * A collection of labels from which related labels are queried for this selection object.
   * This is usually the collection of labels containing this selection object.
   */
  labels: ReadonlySegmentationIndex | null;
  /** The unique identifier of the selection */
  id: UUID;
  /** The points coordinates of a selection. A shallow copy of the vector is made to this object. */
  points: readonly THREE.Vector3[];
  /** The quality rank of the annotation. */
  qualityRank?: number | null;
  /** The distinctiveness level of the represented object. */
  distinctiveLv?: QualityLevel;
  /** The occlusion level of the represented object. */
  occlusionLv?: QualityLevel;
  /** The unique identifier of the perceived class of the represented object, or `null` if no class is assigned. */
  perceivedClassId?: number | null;
  /** The unique identifier of the instance object representing the same object, or `null` if no object is assigned. */
  entityId?: UUID | null;
  /** The timestamp of the represented object. */
  timestamp?: Timestamp | null;
  /** If given, displays the given number for points selection size. */
  showPointSize?: number | null;
  /** Opacity of the selection points over the source point cloud. */
  opacity?: number;
  /** Displays the perceived-class color when `true`; otherwise, uses the ground-truth color. */
  showPerceivedClass?: boolean;
  /** If given, displays the given color for the selection, regardless of `showPerceivedClass`. */
  showColor?: Readonly<THREE.Color> | null;
  /** `false` (default) if center of a selection is visibile, otherwise, `false`. */
  showCenter?: boolean;
}

/**
 * Represents the event when a property (except for `labels`) has been changed.
 * - `obj`: The object which property has been changed.
 * - `propertyKey`: The name of the property that was changed.
 */
export interface PropertyChangeEvent {
  type: string;
  obj: LabelSelection;
  propertyKey: Exclude<keyof LabelSelectionParams, "config" | "labels">;
}

/** Defines each event that can be dispatched by {@link LabelSelection}. */
export interface LabelSelectionEventMap {
  change: PropertyChangeEvent;
}

export type ReadonlyLabelSelection = Pick<
  Readonly<LabelSelection>,
  | keyof THREE.EventDispatcher<LabelSelectionEventMap>
  | "asObject3D"
  | "centerAsObject3D"
  | "raycast"
  | keyof LabelSelectionParams
  | "entity"
  | "gtClass"
  | "perceivedClass"
  | "displayClass"
  | "centerPoint"
  | "points"
  | "packedPoints"
  | "pointCoords"
  | "getSelection"
  | "setDisplayOptions"
>;

/** Represents a selection in the scene. */
export class LabelSelection extends THREE.EventDispatcher<LabelSelectionEventMap> {
  readonly #view: LabelSelectionView;

  #packedDatabasePoints: Float32Array;

  getSelection(): Selection {
    return this.#view.selection;
  }

  /** Returns a `three.js` representation of this selection. */
  asObject3D(): THREE.Object3D {
    return this.#view.asObject3D();
  }

  /** Returns a `three.js` representation of the center point of this selection. */
  centerAsObject3D(): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
    return this.#view.centerAsObject3D();
  }

  /** Performs raycasting against this selection. */
  raycast(
    raycaster: THREE.Raycaster,
    intersects: THREE.Intersection[] = [],
  ): THREE.Intersection[] {
    return this.#view.raycast(raycaster, intersects);
  }

  /** The configuration of the application. */
  readonly config: EditorConfig;

  #labels: ReadonlySegmentationIndex | null;

  /** A collection of labels from which related labels are queried for this selection. */
  get labels(): ReadonlySegmentationIndex | null {
    return this.#labels;
  }

  set labels(value: ReadonlySegmentationIndex | null) {
    if (this.#labels !== value) {
      this.#labels?.removeEventListener("class-delete", this.#onClassDelete);
      this.#labels?.removeEventListener("class-update", this.#onClassUpdate);
      this.#labels?.removeEventListener("instance-add", this.#onInstanceChange);
      this.#labels?.removeEventListener(
        "instance-delete",
        this.#onInstanceChange,
      );
      this.#labels?.removeEventListener(
        "instance-update",
        this.#onInstanceChange,
      );

      this.#labels = value;
      this.#labels?.addEventListener("class-delete", this.#onClassDelete);
      this.#labels?.addEventListener("class-update", this.#onClassUpdate);
      this.#labels?.addEventListener("instance-add", this.#onInstanceChange);
      this.#labels?.addEventListener("instance-delete", this.#onInstanceChange);
      this.#labels?.addEventListener("instance-update", this.#onInstanceChange);

      this.render();
    }
  }

  #id: UUID;

  /** The unique identifier of this selection. */
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

  /** The points of the selection in the coordinate system of the database. */
  get points(): readonly THREE.Vector3[] {
    return LabelSelection.#unpack(this.#packedDatabasePoints);
  }

  set points(value: readonly THREE.Vector3[]) {
    this.#packedDatabasePoints = LabelSelection.#pack(value);
    this.#view.pointCoords = LabelSelection.#toThreeCoords(
      this.config,
      this.#packedDatabasePoints,
    );

    this.render();
    this.dispatchEvent({
      type: "change",
      obj: this,
      propertyKey: "points",
    });
  }

  /** Packed database coordinates used by bulk/index paths without object expansion. */
  get packedPoints(): Float32Array {
    return this.#packedDatabasePoints;
  }

  /** The center point of a selection in threejs coordinate system. */
  get centerPoint(): Readonly<THREE.Vector3> {
    return this.#view.centerPoint;
  }

  /** The vertices of the selection object in threejs coordinate system, that being rendered on the scene. */
  get pointCoords(): readonly Readonly<THREE.Vector3>[] {
    return this.#view.pointCoords;
  }

  #qualityRank: number | null;

  /** The quality rank of the annotation. */
  get qualityRank(): number | null {
    return this.#qualityRank;
  }

  set qualityRank(value: number | null) {
    if (this.#qualityRank !== value) {
      this.#qualityRank = value;

      this.render();
      this.dispatchEvent({
        type: "change",
        obj: this,
        propertyKey: "qualityRank",
      });
    }
  }

  #distinctiveLv: QualityLevel;

  /** The distinctiveness level of the represented object. */
  get distinctiveLv(): QualityLevel {
    return this.#distinctiveLv;
  }

  set distinctiveLv(value: QualityLevel) {
    if (!this.#distinctiveLv.equals(value)) {
      this.#distinctiveLv = value;

      this.render();
      this.dispatchEvent({
        type: "change",
        obj: this,
        propertyKey: "distinctiveLv",
      });
    }
  }

  #occlusionLv: QualityLevel;

  /** The occlusion level of the represented object. */
  get occlusionLv(): QualityLevel {
    return this.#occlusionLv;
  }

  set occlusionLv(value: QualityLevel) {
    if (!this.#occlusionLv.equals(value)) {
      this.#occlusionLv = value;

      this.render();
      this.dispatchEvent({
        type: "change",
        obj: this,
        propertyKey: "occlusionLv",
      });
    }
  }

  #perceivedClassId: number | null;

  /** The unique identifier of the perceived class of the represented object, or `null` if no class is assigned. */
  get perceivedClassId(): number | null {
    return this.#perceivedClassId;
  }

  set perceivedClassId(value: number | null) {
    if (this.#perceivedClassId !== value) {
      this.#perceivedClassId = value;

      this.render();
      this.dispatchEvent({
        type: "change",
        obj: this,
        propertyKey: "perceivedClassId",
      });
    }
  }

  /**
   * The perceived class of the represented object, or `null` if no class is assigned.
   * This is `null` if there is no collection of labels to query.
   */
  get perceivedClass(): ReadonlyLabelClass | null {
    const { labels } = this;
    if (labels == null) return null;

    return LabelSelection.#getPerceivedClass(labels, this.perceivedClassId);
  }

  #timestamp: Timestamp | null;

  /**
   * The timestamp of the represented object.
   * A shallow copy of the date is made to this object.
   */
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

  #entityId: UUID | null;

  /** The unique identifier of the instance object representing the same object, or `null` if no object is assigned. */
  get entityId(): UUID | null {
    return this.#entityId;
  }

  set entityId(value: UUID | null) {
    if (this.#entityId !== value) {
      this.#entityId = value;

      this.render();
      this.dispatchEvent({
        type: "change",
        obj: this,
        propertyKey: "entityId",
      });
    }
  }

  /**
   * The instance object which a selection belongs to, or `null` if no track is assigned.
   * This is `null` if there is no collection of labels to query.
   */
  get entity(): ReadonlyLabelInstance | null {
    const { labels } = this;
    if (labels == null) return null;

    return LabelSelection.#getEntity(labels, this.entityId);
  }

  /**
   * The ground truth class of the represented object, or `null` if no class is assigned.
   * This is `null` if there is no collection of labels to query.
   */
  get gtClass(): ReadonlyLabelClass | null {
    const { labels } = this;
    if (labels == null) return null;

    return LabelSelection.#getGroundTruthClass(labels, this.entityId);
  }

  /**
   * The class being displayed for this selection, or `null` if no class is assigned.
   * This is `null` if there is no collection of labels to query.
   */
  get displayClass(): ReadonlyLabelClass | null {
    const { labels } = this;
    if (labels == null) return null;

    return LabelSelection.#getDisplayClass(labels, this);
  }

  #showPointSize: number | null;

  /** If given, displays the given point size for the selection. */
  get showPointSize(): number | null {
    return this.#showPointSize;
  }

  set showPointSize(value: number | null) {
    if (this.#showPointSize !== value) {
      this.#showPointSize = value ?? null;

      this.render();
      this.dispatchEvent({
        type: "change",
        obj: this,
        propertyKey: "showPointSize",
      });
    }
  }

  #showPerceivedClass: boolean;

  /** Displays the perceived-class color when `true`; otherwise, uses the ground-truth color. */
  get showPerceivedClass(): boolean {
    return this.#showPerceivedClass;
  }

  set showPerceivedClass(value: boolean) {
    if (this.#showPerceivedClass !== value) {
      this.#showPerceivedClass = value;

      this.render();
      this.dispatchEvent({
        type: "change",
        obj: this,
        propertyKey: "showPerceivedClass",
      });
    }
  }

  #showColor: THREE.Color | null;

  /** If given, displays the given color for the selection, regardless of `showPerceivedClass`. */
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

  /** `true` if the faces and edges of this bounding box are visible; otherwise, `false`. */
  get showCenter(): boolean {
    return this.#view.showCenter;
  }

  set showCenter(value: boolean) {
    if (this.#view.showCenter !== value) {
      this.#view.showCenter = value;
      this.dispatchEvent({
        type: "change",
        obj: this,
        propertyKey: "showCenter",
      });
    }
  }

  /** Opacity of the selection points over the source point cloud. */
  get opacity(): number {
    return this.#view.opacity;
  }

  set opacity(value: number) {
    if (this.#view.opacity === value) return;
    this.#view.opacity = value;
    this.dispatchEvent({ type: "change", obj: this, propertyKey: "opacity" });
  }

  /**
   * Updates transient scene presentation without dispatching persistent
   * label changes. All color/size work is applied in one render pass.
   */
  setDisplayOptions(
    options: Pick<
      LabelSelectionParams,
      | "showPointSize"
      | "showColor"
      | "showCenter"
      | "showPerceivedClass"
      | "opacity"
    >,
  ): void {
    let renderRequired = false;

    const showPointSize = options.showPointSize ?? null;
    if (this.#showPointSize !== showPointSize) {
      this.#showPointSize = showPointSize;
      renderRequired = true;
    }
    if (this.#showPerceivedClass !== options.showPerceivedClass) {
      this.#showPerceivedClass = options.showPerceivedClass ?? true;
      renderRequired = true;
    }
    if (!Equatable.equalsNullable(this.#showColor, options.showColor ?? null)) {
      this.#showColor = options.showColor?.clone() ?? null;
      renderRequired = true;
    }
    if (this.#view.showCenter !== options.showCenter) {
      this.#view.showCenter = options.showCenter ?? false;
    }
    this.#view.opacity = options.opacity ?? 0.5;

    if (renderRequired) this.render();
  }

  /** Creates a new selection to represent an object. */
  constructor(params: LabelSelectionParams) {
    super();

    this.config = params.config;

    this.#labels = params.labels;
    this.#labels?.addEventListener("class-delete", this.#onClassDelete);
    this.#labels?.addEventListener("class-update", this.#onClassUpdate);
    this.#labels?.addEventListener("instance-add", this.#onInstanceChange);
    this.#labels?.addEventListener("instance-delete", this.#onInstanceChange);
    this.#labels?.addEventListener("instance-update", this.#onInstanceChange);

    this.#id = params.id;
    this.#qualityRank = params.qualityRank ?? null;
    this.#distinctiveLv = params.distinctiveLv ?? DistinctiveLevel.Unknown;
    this.#occlusionLv = params.occlusionLv ?? OcclusionLevel.Unknown;
    this.#perceivedClassId = params.perceivedClassId ?? null;
    this.#entityId = params.entityId ?? null;
    this.#timestamp = params.timestamp?.clone() ?? null;
    this.#showPointSize = params.showPointSize ?? 0.5;
    this.#showPerceivedClass = params.showPerceivedClass ?? true;
    this.#showColor = params.showColor?.clone() ?? null;

    this.#packedDatabasePoints = LabelSelection.#pack(params.points);
    this.#view = new LabelSelectionView({
      pointsCoords: LabelSelection.#toThreeCoords(
        this.config,
        this.#packedDatabasePoints,
      ),
      color: LabelSelection.#NO_CLASS_COLOR,
      pointSize: this.showPointSize ?? 0.5,
      opacity: params.opacity ?? 0.5,
    });
  }

  /** Updates the view according to the data in this object. */
  render(): void {
    const { showPointSize } = this;
    const view = this.#view;
    const labels = this.#labels;
    if (labels == null) return;

    view.color = LabelSelection.#getColor(labels, this);
    view.pointSize = showPointSize ?? view.pointSize;
  }

  /** Disposes of this object. Do not use it afterwards. */
  dispose(): void {
    this.#labels?.removeEventListener("class-delete", this.#onClassDelete);
    this.#labels?.removeEventListener("class-update", this.#onClassUpdate);
    this.#labels?.removeEventListener("instance-add", this.#onInstanceChange);
    this.#labels?.removeEventListener(
      "instance-delete",
      this.#onInstanceChange,
    );
    this.#labels?.removeEventListener(
      "instance-update",
      this.#onInstanceChange,
    );
    this.#view.dispose();
  }

  /** Handles the event when an instance object has been added, deleted or updated. */
  #onInstanceChange = (
    event:
      | SegmentationIndexEventMap["instance-add"]
      | SegmentationIndexEventMap["instance-delete"]
      | SegmentationIndexEventMap["instance-update"],
  ): void => {
    if (event.obj.id === this.entityId) {
      this.render();
    }
  };

  /** Handles the event when an object class has been deleted. */
  #onClassDelete = (event: SegmentationIndexEventMap["class-delete"]): void => {
    if (event.obj === this.perceivedClass) {
      this.render();
    }
  };

  /** Handles the event when an object class has been updated. */
  #onClassUpdate = (event: SegmentationIndexEventMap["class-update"]): void => {
    if (event.obj === this.perceivedClass) {
      this.render();
    }
  };

  static #pack(points: readonly THREE.Vector3[] | Float32Array): Float32Array {
    if (points instanceof Float32Array) return points;
    const packed = new Float32Array(points.length * 3);
    points.forEach((point, index) => {
      packed[index * 3] = point.x;
      packed[index * 3 + 1] = point.y;
      packed[index * 3 + 2] = point.z;
    });
    return packed;
  }

  static #unpack(points: Float32Array): THREE.Vector3[] {
    const unpacked: THREE.Vector3[] = [];
    for (let index = 0; index < points.length; index += 3) {
      unpacked.push(
        new THREE.Vector3(points[index], points[index + 1], points[index + 2]),
      );
    }
    return unpacked;
  }

  static #toThreeCoords(
    config: EditorConfig,
    points: Float32Array,
  ): Float32Array {
    const indexVector = config.coordinateFormat.toThreeJSCoords(
      new THREE.Vector3(0, 1, 2),
    );
    const indexes = [indexVector.x, indexVector.y, indexVector.z];
    const transformed = new Float32Array(points.length);
    for (let index = 0; index < points.length; index += 3) {
      transformed[index] = points[index + indexes[0]];
      transformed[index + 1] = points[index + indexes[1]];
      transformed[index + 2] = points[index + indexes[2]];
    }
    return transformed;
  }

  /** Gets the perceived class for an object track, if it exists. */
  static #getPerceivedClass(
    labels: ReadonlySegmentationIndex,
    perceivedClassId: number | null,
  ): ReadonlyLabelClass | null {
    return perceivedClassId == null
      ? null
      : labels.getLabelClass(perceivedClassId);
  }

  /** Gets the instance of a selection belongs to, if it exists. */
  static #getEntity(
    labels: ReadonlySegmentationIndex,
    entityId: UUID | null,
  ): ReadonlyLabelInstance | null {
    return entityId == null ? null : labels.getLabelInstance(entityId);
  }

  /** Gets the ground truth class for a bounding box, if it exists. */
  static #getGroundTruthClass(
    labels: ReadonlySegmentationIndex,
    entityId: UUID | null,
  ): ReadonlyLabelClass | null {
    const instance = LabelSelection.#getEntity(labels, entityId);
    return instance == null ? null : instance.gtClass;
  }

  /** Gets the display class for a bounding box. */
  static #getDisplayClass(
    labels: ReadonlySegmentationIndex,
    model: {
      perceivedClassId: number | null;
      entityId: UUID | null;
      showPerceivedClass: boolean;
    },
  ): ReadonlyLabelClass | null {
    if (model.showPerceivedClass) {
      const perceivedClass = this.#getPerceivedClass(
        labels,
        model.perceivedClassId,
      );
      if (perceivedClass) return perceivedClass;
    }

    return this.#getGroundTruthClass(labels, model.entityId);
  }

  /** The default color to use when there is no associated class. */
  static readonly #NO_CLASS_COLOR: Readonly<THREE.Color> = new THREE.Color(
    0xd22b2b,
  );

  /** Gets the color to display for an object track. */
  static #getColor(
    labels: ReadonlySegmentationIndex,
    model: {
      perceivedClassId: number | null;
      entityId: UUID | null;
      showPerceivedClass: boolean;
      showColor: Readonly<THREE.Color> | null;
    },
  ): Readonly<THREE.Color> {
    if (model.showColor) return model.showColor;
    return (
      LabelSelection.#getDisplayClass(labels, model)?.selectionColor ??
      LabelSelection.#NO_CLASS_COLOR
    );
  }
}
