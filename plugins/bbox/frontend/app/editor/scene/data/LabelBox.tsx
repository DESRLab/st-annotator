import * as THREE from "three";
import BiMap from "ts-bidirectional-map";

import type { EditorConfig } from "sta/app/editor";
import { Equatable, ThreeUtils } from "sta/common";
import type { Timestamp } from "sta/common";

import { DistinctiveLevel, OcclusionLevel } from "../../../../models";
import type { BoxType } from "../../../../models";

import type { ReadonlyBBoxIndex, BBoxIndexEventMap } from "./BBoxIndex";
import type { ReadonlyLabelClass } from "./LabelClass";
import type { ReadonlyLabelTrack } from "./LabelTrack";
import type { BoxPose } from "./labelset/box/index.ts";
import type { UUID } from "./models";
import { BoundingCuboidBuilder, BoundingCylinderBuilder } from "./views";
import type {
  BoundingBox,
  BoundingBoxBuilder,
  BoundingBoxParams,
} from "./views";

export type { BoxType } from "../../../../models";

/**
 * Parameters for creating a {@link LabelBoxView}.
 */
interface LabelBoxViewParams {
  /** Creates the `three.js` objects of the bounding box. */
  boxBuilder: BoundingBoxBuilder;
  /** The position of the bounding box in world space. Defaults to the identity transform. */
  position?: Readonly<THREE.Vector3>;
  /** The rotation of the bounding box. Defaults to the identity transform. */
  rotation?: Readonly<THREE.Euler>;
  /** The scale of the bounding box. Defaults to the identity transform. */
  scale?: Readonly<THREE.Vector3>;
  /** The display color of the bounding box. Defaults to black. */
  color?: Readonly<THREE.Color>;
  /** The opacity of the faces in the bounding box. */
  opacity?: number;
  /** Temporarily hidden locally, retaining center and edge selection. */
  hidden?: boolean;
  /**
   * `true` if the forward indicator of the bounding box is visible; otherwise, `false`.
   */
  showForwardIndicator?: boolean;
  /**
   * `true` if the faces and edges of the bounding box are visible; otherwise, `false`.
   */
  showFrame?: boolean;
}

/**
 * View class for {@link LabelBox}.
 */
class LabelBoxView {
  #boxBuilder: BoundingBoxBuilder;

  #box: BoundingBox;

  /**
   * Creates the `three.js` objects of the bounding box.
   */
  get boxBuilder(): BoundingBoxBuilder {
    return this.#boxBuilder;
  }

  set boxBuilder(value: BoundingBoxBuilder) {
    if (this.#boxBuilder !== value) {
      this.#box.dispose();
      this.#boxBuilder = value;
      this.#box = LabelBoxView.#createBox(value, this);
    }
  }

  /**
   * Creates a new bounding box with the given parameters.
   *
   * @param builder Creates the `three.js` objects of the box.
   * @param params The parameters to pass to the box.
   * @returns The new bounding box.
   */
  static #createBox(
    builder: BoundingBoxBuilder,
    params: BoundingBoxParams,
  ): BoundingBox {
    return builder.createBox(params);
  }

  /**
   * The position of this bounding box in world space.
   */
  get position(): Readonly<THREE.Vector3> {
    return this.#box.position;
  }

  set position(value: Readonly<THREE.Vector3>) {
    this.#box.position = value;
  }

  /**
   * The rotation of this bounding box.
   */
  get rotation(): Readonly<THREE.Euler> {
    return this.#box.rotation;
  }

  set rotation(value: Readonly<THREE.Euler>) {
    this.#box.rotation = value;
  }

  /**
   * The scale of this bounding box.
   */
  get scale(): Readonly<THREE.Vector3> {
    return this.#box.scale;
  }

  set scale(value: Readonly<THREE.Vector3>) {
    this.#box.scale = value;
  }

  /**
   * The display color of this bounding box.
   */
  get color(): Readonly<THREE.Color> {
    return this.#box.color;
  }

  set color(value: Readonly<THREE.Color>) {
    this.#box.color = value;
  }

  /**
   * The opacity of the faces in the bounding box.
   */
  get hidden(): boolean {
    return this.#box.hidden;
  }
  set hidden(value: boolean) {
    this.#box.hidden = value;
  }

  get opacity(): number {
    return this.#box.opacity;
  }

  set opacity(value: number) {
    this.#box.opacity = value;
  }

  /**
   * `true` if the forward indicator of the bounding box is visible; otherwise, `false`.
   */
  get showForwardIndicator(): boolean {
    return this.#box.showForwardIndicator;
  }

  set showForwardIndicator(value: boolean) {
    this.#box.showForwardIndicator = value;
  }

  /**
   * `true` if the faces and edges of the bounding box are visible; otherwise, `false`.
   */
  get showFrame(): boolean {
    return this.#box.showFrame;
  }

  set showFrame(value: boolean) {
    this.#box.showFrame = value;
  }

  /**
   * Creates a view for a {@link LabelBox}.
   *
   * @param params The parameters to pass to the view.
   */
  constructor(params: LabelBoxViewParams) {
    this.#boxBuilder = params.boxBuilder;
    this.#box = LabelBoxView.#createBox(params.boxBuilder, {
      position: params.position ?? new THREE.Vector3(0, 0, 0),
      rotation: params.rotation ?? new THREE.Euler(0, 0, 0),
      scale: params.scale ?? new THREE.Vector3(1, 1, 1),
      color: params.color ?? new THREE.Color("black"),
      opacity: params.opacity ?? 0.2,
      hidden: params.hidden ?? false,
      showForwardIndicator: params.showForwardIndicator ?? true,
      showFrame: params.showFrame ?? true,
    });
  }

  /**
   * Returns a `three.js` representation of this view.
   *
   * @returns The resulting object.
   */
  asObject3D(): THREE.Object3D {
    return this.#box.asObject3D();
  }

  dispose(): void {
    this.#box.dispose();
  }

  /**
   * Performs raycasting against this view.
   *
   * @param raycaster The caster of the ray.
   * @param intersects If provided, the results are accumulated into
   * this array. Otherwise, a new one is instantiated.
   * @returns Refer to the `raycast` method of {@link THREE.Object3D}.
   */
  raycast(
    raycaster: THREE.Raycaster,
    intersects: THREE.Intersection[] = [],
  ): THREE.Intersection[] {
    return this.#box.raycast(raycaster, intersects);
  }
}

/**
 * A mapping to/from each view type for a bounding box and its string representation.
 */
const boxBuilderToString = new BiMap<BoundingBoxBuilder, BoxType>();
boxBuilderToString.set(new BoundingCuboidBuilder(), "cuboid");
boxBuilderToString.set(new BoundingCylinderBuilder(), "cylinder");

/**
 * Parameters for creating a {@link LabelBox}.
 */
export interface LabelBoxParams {
  /** The configuration of the application. */
  config: EditorConfig;
  /**
   * A collection of labels from which related labels are queried for this bounding box.
   *
   * This is usually the collection of labels containing this bounding box.
   */
  labels: ReadonlyBBoxIndex | null;
  /** The unique identifier of the bounding box. */
  id: UUID;
  /** Indicates the type of bounding box. */
  boxType: BoxType;
  /**
   * The position vector of the bounding box in the coordinate system of the database.
   *
   * A shallow copy of the vector is made to this object.
   */
  center: Readonly<THREE.Vector3>;
  /** The rotation of the bounding box about the vertical axis. */
  angle: number;
  /**
   * The size vector of the bounding box in the coordinate system of the database.
   *
   * A shallow copy of the vector is made to this object.
   */
  size: Readonly<THREE.Vector3>;
  /** The quality rank of the annotation. */
  qualityRank?: number | null;
  /** The distinctiveness level of the represented object. */
  distinctiveLv?: (typeof DistinctiveLevel)[keyof typeof DistinctiveLevel];
  /** The occlusion level of the represented object. */
  occlusionLv?: (typeof OcclusionLevel)[keyof typeof OcclusionLevel];
  /**
   * The unique identifier of the perceived class of the represented object,
   * or `null` if no class is assigned.
   */
  perceivedClassId?: number | null;
  /**
   * The unique identifier of the object track representing the same object,
   * or `null` if no track is assigned.
   */
  entityId?: UUID | null;
  /**
   * The timestamp of the represented object.
   *
   * A shallow copy of the date is made to this object.
   */
  timestamp?: Timestamp | null;
  /** The opacity of the faces in the bounding box. */
  opacity?: number;
  /** Temporarily hidden locally, retaining center and edge selection. */
  hidden?: boolean;
  /**
   * `true` if the forward indicator of the bounding box is visible; otherwise, `false`.
   */
  showForwardIndicator?: boolean;
  /**
   * `true` if the faces and edges of the bounding box are visible; otherwise, `false`.
   */
  showFrame?: boolean;
  /**
   * If `true`, displays the color of the bounding box based on their perceived class;
   * otherwise, displays the color based on their ground truth class.
   */
  showPerceivedClass?: boolean;
  /**
   * If given, displays the given color for the bounding box, regardless of `showPerceivedClass`.
   *
   * A shallow copy of the color is made to this object.
   */
  showColor?: Readonly<THREE.Color> | null;
}

/**
 * Represents the event when a property (except for `labels`) has been changed.
 * - `obj`: The object which property has been changed.
 * - `propertyKey`: The name of the property that was changed.
 */
export interface PropertyChangeEvent {
  obj: LabelBox;
  propertyKey: Exclude<keyof LabelBoxParams, "config" | "labels">;
}

/**
 * Defines each event that can be dispatched by {@link LabelBox}.
 */
export interface LabelBoxEventMap {
  /**
   * The event when a property (except for `labels`) has been changed.
   */
  change: PropertyChangeEvent;
}

/**
 * A read-only view of a {@link LabelBox}.
 */
export type ReadonlyLabelBox = Pick<
  Readonly<LabelBox>,
  | keyof THREE.EventDispatcher<LabelBoxEventMap>
  | "asObject3D"
  | "raycast"
  | keyof LabelBoxParams
  | "entity"
  | "gtClass"
  | "perceivedClass"
  | "displayClass"
  | "setDisplayOptions"
  | "setHidden"
>;

/**
 * Represents a bounding box in the scene.
 *
 * The structure of this agent class is similar to `Controller`, but since we are wrapping
 * {@link ReadonlyBBoxIndex} which is an agent class, we need to perform the
 * coordination at the agent level rather than the controller level. Here,
 * {@link ReadonlyBBoxIndex} acts like a model while {@link LabelBoxView} acts like a
 * view.
 */
export class LabelBox extends THREE.EventDispatcher<LabelBoxEventMap> {
  readonly #view: LabelBoxView;

  /**
   * Returns a `three.js` representation of this bounding box.
   *
   * @returns The resulting object.
   */
  asObject3D(): THREE.Object3D {
    return this.#view.asObject3D();
  }

  /**
   * Performs raycasting against this bounding box.
   *
   * @param raycaster The caster of the ray.
   * @param intersects If provided, the results are accumulated into
   * this array. Otherwise, a new one is instantiated.
   * @returns Refer to the `raycast` method of {@link THREE.Object3D}.
   */
  raycast(
    raycaster: THREE.Raycaster,
    intersects: THREE.Intersection[] = [],
  ): THREE.Intersection[] {
    return this.#view.raycast(raycaster, intersects);
  }

  /**
   * The configuration of the application.
   */
  readonly config: EditorConfig;

  #labels: ReadonlyBBoxIndex | null;

  /**
   * A collection of labels from which related labels are queried for this bounding box.
   *
   * This is usually the collection of labels containing this bounding box.
   */
  get labels(): ReadonlyBBoxIndex | null {
    return this.#labels;
  }

  set labels(value: ReadonlyBBoxIndex | null) {
    if (this.#labels !== value) {
      this.#labels?.removeEventListener("class-delete", this.#onClassDelete);
      this.#labels?.removeEventListener("class-update", this.#onClassUpdate);
      this.#labels?.removeEventListener("track-add", this.#onTrackChange);
      this.#labels?.removeEventListener("track-delete", this.#onTrackChange);
      this.#labels?.removeEventListener("track-update", this.#onTrackChange);

      this.#labels = value;
      this.#labels?.addEventListener("class-delete", this.#onClassDelete);
      this.#labels?.addEventListener("class-update", this.#onClassUpdate);
      this.#labels?.addEventListener("track-add", this.#onTrackChange);
      this.#labels?.addEventListener("track-delete", this.#onTrackChange);
      this.#labels?.addEventListener("track-update", this.#onTrackChange);

      this.render();
    }
  }

  #id: UUID;

  /**
   * The unique identifier of this bounding box.
   */
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

  #boxType: BoxType;

  /**
   * Indicates the type of bounding box.
   */
  get boxType(): BoxType {
    return this.#boxType;
  }

  set boxType(value: BoxType) {
    if (this.#boxType !== value) {
      this.#boxType = value;

      this.render();
      this.dispatchEvent({
        type: "change",
        obj: this,
        propertyKey: "boxType",
      });
    }
  }

  /**
   * The position vector of the bounding box in the coordinate system of the database.
   *
   * A shallow copy of the vector is made to this object.
   */
  get center(): Readonly<THREE.Vector3> {
    return LabelBox.#getCenter(this.config, this.#view);
  }

  set center(value: Readonly<THREE.Vector3>) {
    if (!this.center.equals(value)) {
      this.#view.position = LabelBox.#getPosition(this.config, value);

      this.render();
      this.dispatchEvent({
        type: "change",
        obj: this,
        propertyKey: "center",
      });
    }
  }

  /**
   * The rotation of the bounding box about the vertical axis.
   */
  get angle(): number {
    return LabelBox.#getAngle(this.config, this.#view);
  }

  set angle(value: number) {
    if (this.angle !== value) {
      this.#view.rotation = LabelBox.#getRotation(this.config, value);

      this.render();
      this.dispatchEvent({
        type: "change",
        obj: this,
        propertyKey: "angle",
      });
    }
  }

  /**
   * The size vector of the bounding box in the coordinate system of the database.
   *
   * A shallow copy of the vector is made to this object.
   */
  get size(): Readonly<THREE.Vector3> {
    return LabelBox.#getSize(this.config, this.#view);
  }

  set size(value: Readonly<THREE.Vector3>) {
    if (!this.size.equals(value)) {
      this.#view.scale = LabelBox.#getScale(this.config, value);

      this.render();
      this.dispatchEvent({
        type: "change",
        obj: this,
        propertyKey: "size",
      });
    }
  }

  #qualityRank: number | null;

  /**
   * The quality rank of the annotation.
   */
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

  #distinctiveLv: (typeof DistinctiveLevel)[keyof typeof DistinctiveLevel];

  /**
   * The distinctiveness level of the represented object.
   */
  get distinctiveLv(): (typeof DistinctiveLevel)[keyof typeof DistinctiveLevel] {
    return this.#distinctiveLv;
  }

  set distinctiveLv(
    value: (typeof DistinctiveLevel)[keyof typeof DistinctiveLevel],
  ) {
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

  #occlusionLv: (typeof OcclusionLevel)[keyof typeof OcclusionLevel];

  /**
   * The occlusion level of the represented object.
   */
  get occlusionLv(): (typeof OcclusionLevel)[keyof typeof OcclusionLevel] {
    return this.#occlusionLv;
  }

  set occlusionLv(value: (typeof OcclusionLevel)[keyof typeof OcclusionLevel]) {
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

  /**
   * The unique identifier of the perceived class of the represented object,
   * or `null` if no class is assigned.
   */
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
   * The perceived class of the represented object, or `null` if no class is
   * assigned.
   *
   * This is `null` if there is no collection of labels to query.
   */
  get perceivedClass(): ReadonlyLabelClass | null {
    const { labels } = this;
    if (labels == null) return null;

    return LabelBox.#getPerceivedClass(labels, this.perceivedClassId);
  }

  #entityId: UUID | null;

  /**
   * The unique identifier of the object track representing the same object,
   * or `null` if no track is assigned.
   */
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
   * The object track which a bounding box belongs to, or `null` if no track is
   * assigned.
   *
   * This is `null` if there is no collection of labels to query.
   */
  get entity(): ReadonlyLabelTrack | null {
    const { labels } = this;
    if (labels == null) return null;

    return LabelBox.#getEntity(labels, this.entityId);
  }

  /**
   * The ground truth class of the represented object, or `null` if no class is
   * assigned.
   *
   * This is `null` if there is no collection of labels to query.
   */
  get gtClass(): ReadonlyLabelClass | null {
    const { labels } = this;
    if (labels == null) return null;

    return LabelBox.#getGroundTruthClass(labels, this.entityId);
  }

  /**
   * The class being displayed for this bounding box, or `null` if no class is
   * assigned.
   *
   * This is `null` if there is no collection of labels to query.
   */
  get displayClass(): ReadonlyLabelClass | null {
    const { labels } = this;
    if (labels == null) return null;

    return LabelBox.#getDisplayClass(labels, this);
  }

  #timestamp: Timestamp | null;

  /**
   * The timestamp of the represented object.
   *
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

  /**
   * The opacity of the faces in this bounding box.
   */
  get hidden(): boolean {
    return this.#view.hidden;
  }
  set hidden(value: boolean) {
    if (this.#view.hidden === value) return;
    this.#view.hidden = value;
    this.dispatchEvent({ type: "change", obj: this, propertyKey: "hidden" });
  }

  get opacity(): number {
    return this.#view.opacity;
  }

  set opacity(value: number) {
    if (this.#view.opacity !== value) {
      this.#view.opacity = value;
      this.dispatchEvent({
        type: "change",
        obj: this,
        propertyKey: "opacity",
      });
    }
  }

  /**
   * `true` if the forward indicator of this bounding box is visible; otherwise, `false`.
   */
  get showForwardIndicator(): boolean {
    return this.#view.showForwardIndicator;
  }

  set showForwardIndicator(value: boolean) {
    if (this.#view.showForwardIndicator !== value) {
      this.#view.showForwardIndicator = value;
      this.dispatchEvent({
        type: "change",
        obj: this,
        propertyKey: "showForwardIndicator",
      });
    }
  }

  /**
   * `true` if the faces and edges of this bounding box are visible; otherwise, `false`.
   */
  get showFrame(): boolean {
    return this.#view.showFrame;
  }

  set showFrame(value: boolean) {
    if (this.#view.showFrame !== value) {
      this.#view.showFrame = value;
      this.dispatchEvent({
        type: "change",
        obj: this,
        propertyKey: "showFrame",
      });
    }
  }

  #showPerceivedClass: boolean;

  /**
   * If `true`, displays the color of the bounding box based on their perceived class;
   * otherwise, displays the color based on their ground truth class.
   */
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

  /**
   * If given, displays the given color for the bounding box, regardless of `showPerceivedClass`.
   */
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

  /** Applies session-local hidden state without a labelset operation. */
  setHidden(value: boolean): void {
    this.hidden = value;
  }

  /** Updates transient scene presentation without emitting label-data events. */
  setDisplayOptions(
    options: Pick<
      LabelBoxParams,
      | "opacity"
      | "showForwardIndicator"
      | "showFrame"
      | "showPerceivedClass"
      | "showColor"
    >,
  ): void {
    this.#view.opacity = options.opacity ?? this.#view.opacity;
    this.#view.showForwardIndicator = options.showForwardIndicator ?? true;
    this.#view.showFrame = options.showFrame ?? true;

    let renderRequired = false;
    if (this.#showPerceivedClass !== options.showPerceivedClass) {
      this.#showPerceivedClass = options.showPerceivedClass ?? true;
      renderRequired = true;
    }
    if (!Equatable.equalsNullable(this.#showColor, options.showColor ?? null)) {
      this.#showColor = options.showColor?.clone() ?? null;
      renderRequired = true;
    }
    if (renderRequired) this.render();
  }

  /**
   * Updates the view according to the data in this object.
   */
  render() {
    const { boxType } = this;
    const view = this.#view;
    const labels = this.#labels;

    view.boxBuilder = LabelBox.#getBoxBuilder(boxType);

    if (labels == null) return;

    view.color = LabelBox.#getColor(labels, this);
  }

  /**
   * Gets the element builder of a bounding box.
   *
   * @param boxType Indicates the type of bounding box.
   * @returns The requested type.
   */
  static #getBoxBuilder(boxType: BoxType): BoundingBoxBuilder {
    const boxBuilder = boxBuilderToString.getKey(boxType);
    if (boxBuilder == null) {
      throw new Error(`Unrecognized box type: ${boxType}`);
    }

    return boxBuilder;
  }

  /**
   * Gets the position of a bounding box in world space.
   *
   * @param config The configuration of the application.
   * @param center The position vector of the bounding box in the
   * coordinate system of the database.
   * @returns The requested position.
   */
  static #getPosition(
    config: EditorConfig,
    center: Readonly<THREE.Vector3>,
  ): Readonly<THREE.Vector3> {
    const format = config.coordinateFormat;
    return format.toThreeJSCoords(center);
  }

  /**
   * Gets the rotation of a bounding box.
   *
   * @param config The configuration of the application.
   * @param angle The rotation of the bounding box about the vertical axis.
   * @returns The requested rotation.
   */
  static #getRotation(
    config: EditorConfig,
    angle: number,
  ): Readonly<THREE.Euler> {
    return new THREE.Euler(0, angle, 0, "XYZ");
  }

  /**
   * Gets the scale of a bounding box.
   *
   * @param config The configuration of the application.
   * @param size The size vector of the bounding box in the coordinate
   * system of the database.
   * @returns The requested scale.
   */
  static #getScale(
    config: EditorConfig,
    size: Readonly<THREE.Vector3>,
  ): Readonly<THREE.Vector3> {
    const format = config.coordinateFormat;
    return format.toThreeJSCoords(size);
  }

  /**
   * Gets the perceived class for a bounding box, if it exists.
   *
   * @param labels The collection of labels from which related labels are queried.
   * @param perceivedClassId The unique identifier of the perceived class of the
   * represented object, or null if no class is assigned.
   * @returns The requested class, or `null` if there is no such class.
   */
  static #getPerceivedClass(
    labels: ReadonlyBBoxIndex,
    perceivedClassId: number | null,
  ): ReadonlyLabelClass | null {
    return perceivedClassId == null
      ? null
      : labels.getLabelClass(perceivedClassId);
  }

  /**
   * Gets the object track which a bounding box belongs to, if it exists.
   *
   * @param labels The collection of labels from which related labels are queried.
   * @param entityId The unique identifier of the object track representing the same
   * object, or `null` if no track is assigned.
   * @returns The requested track, or `null` if there is no such track.
   */
  static #getEntity(
    labels: ReadonlyBBoxIndex,
    entityId: UUID | null,
  ): ReadonlyLabelTrack | null {
    return entityId == null ? null : labels.getLabelTrack(entityId);
  }

  /**
   * Gets the ground truth class for a bounding box, if it exists.
   *
   * @param labels The collection of labels from which related labels are queried.
   * @param entityId The unique identifier of the object track representing the same
   * object, or `null` if no track is assigned.
   * @returns The requested class, or `null` if there is no such class.
   */
  static #getGroundTruthClass(
    labels: ReadonlyBBoxIndex,
    entityId: UUID | null,
  ): ReadonlyLabelClass | null {
    const track = LabelBox.#getEntity(labels, entityId);
    return track == null ? null : track.gtClass;
  }

  /**
   * Gets the display class for a bounding box.
   *
   * @param labels The collection of labels from which related labels are queried.
   * @param model The input model instance.
   * @returns The requested class, or `null` if there is no such class.
   */
  static #getDisplayClass(
    labels: ReadonlyBBoxIndex,
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

  /**
   * The default color to use when there is no associated class.
   */
  static readonly #NO_CLASS_COLOR: Readonly<THREE.Color> = new THREE.Color(
    0xd22b2b,
  );

  /**
   * Gets the display color for a bounding box.
   *
   * @param labels The collection of labels from which related labels are queried.
   * @param model The input model instance.
   * @returns The requested color.
   */
  static #getColor(
    labels: ReadonlyBBoxIndex,
    model: {
      perceivedClassId: number | null;
      entityId: UUID | null;
      showPerceivedClass: boolean;
      showColor: Readonly<THREE.Color> | null;
    },
  ): Readonly<THREE.Color> {
    if (model.showColor) return model.showColor;
    return (
      LabelBox.#getDisplayClass(labels, model)?.boxColor ??
      LabelBox.#NO_CLASS_COLOR
    );
  }

  /**
   * Handles the event when an object track has been added, deleted or updated.
   */
  #onTrackChange = (
    event: BBoxIndexEventMap[`track-${"add" | "delete" | "update"}`],
  ) => {
    if (event.obj.id === this.entityId) {
      this.render();
    }
  };

  /**
   * Handles the event when an object class has been deleted.
   */
  #onClassDelete = (event: BBoxIndexEventMap["class-delete"]) => {
    if (event.obj === this.displayClass) {
      this.render();
    }
  };

  /**
   * Handles the event when an object class has been updated.
   */
  #onClassUpdate = (event: BBoxIndexEventMap["class-update"]) => {
    if (event.obj === this.displayClass) {
      this.render();
    }
  };

  /**
   * Creates a new object track to represent an object.
   *
   * @param params The parameters of the object track.
   */
  constructor(params: LabelBoxParams) {
    super();

    this.config = params.config;

    this.#labels = params.labels;
    this.#labels?.addEventListener("class-delete", this.#onClassDelete);
    this.#labels?.addEventListener("class-update", this.#onClassUpdate);
    this.#labels?.addEventListener("track-add", this.#onTrackChange);
    this.#labels?.addEventListener("track-delete", this.#onTrackChange);
    this.#labels?.addEventListener("track-update", this.#onTrackChange);

    this.#id = params.id;
    this.#boxType = params.boxType;
    this.#qualityRank = params.qualityRank ?? null;
    this.#distinctiveLv = params.distinctiveLv ?? DistinctiveLevel.Unknown;
    this.#occlusionLv = params.occlusionLv ?? OcclusionLevel.Unknown;
    this.#perceivedClassId = params.perceivedClassId ?? null;
    this.#entityId = params.entityId ?? null;
    this.#timestamp = params.timestamp?.clone() ?? null;
    this.#showPerceivedClass = params.showPerceivedClass ?? true;
    this.#showColor = params.showColor?.clone() ?? null;

    this.#view = new LabelBoxView({
      boxBuilder: LabelBox.#getBoxBuilder(params.boxType),
      position: LabelBox.#getPosition(this.config, params.center),
      rotation: LabelBox.#getRotation(this.config, params.angle),
      scale: LabelBox.#getScale(this.config, params.size),
      opacity: params.opacity,
      hidden: params.hidden,
      showForwardIndicator: params.showForwardIndicator,
      showFrame: params.showFrame,
    });
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose() {
    this.#labels?.removeEventListener("class-delete", this.#onClassDelete);
    this.#labels?.removeEventListener("class-update", this.#onClassUpdate);
    this.#labels?.removeEventListener("track-add", this.#onTrackChange);
    this.#labels?.removeEventListener("track-delete", this.#onTrackChange);
    this.#labels?.removeEventListener("track-update", this.#onTrackChange);
    this.#view.dispose();
  }

  /**
   * Gets the position vector of a bounding box in the coordinate system of the database.
   *
   * @param config The configuration of the application.
   * @param view The input view instance.
   * @returns The requested position vector.
   */
  static #getCenter(
    config: EditorConfig,
    view: LabelBoxView,
  ): Readonly<THREE.Vector3> {
    return LabelBox.#getCenterFromPosition(config, view.position);
  }

  /**
   * Gets the rotation of a bounding box about the vertical axis.
   *
   * @param config The configuration of the application.
   * @param view The input view instance.
   * @returns The rotation of the box.
   */
  static #getAngle(config: EditorConfig, view: LabelBoxView): number {
    return LabelBox.#getAngleFromTransform(view.rotation, view.scale);
  }

  /**
   * Gets the size vector of a bounding box in the coordinate system of the database.
   *
   * @param config The configuration of the application.
   * @param view The input view instance.
   * @returns The requested size vector.
   */
  static #getSize(
    config: EditorConfig,
    view: LabelBoxView,
  ): Readonly<THREE.Vector3> {
    return LabelBox.#getSizeFromScale(config, view.scale);
  }

  /**
   * Gets the position vector of a bounding box in the coordinate system of the database
   * from the position of its `three.js` representation.
   *
   * @param config The configuration of the application.
   * @param position The position in world space.
   * @returns The requested position vector.
   */
  static #getCenterFromPosition(
    config: EditorConfig,
    position: Readonly<THREE.Vector3>,
  ): Readonly<THREE.Vector3> {
    const format = config.coordinateFormat;
    return format.toDatabaseCoords(position);
  }

  /**
   * Gets the rotation of a bounding box about the vertical axis from the
   * transform of its `three.js` representation.
   *
   * The scale is needed because flipping the `z` scale reverses the heading.
   *
   * @param rotation The rotation in world space.
   * @param scale The scale in world space.
   * @returns The rotation of the box.
   */
  static #getAngleFromTransform(
    rotation: Readonly<THREE.Euler>,
    scale: Readonly<THREE.Vector3>,
  ): number {
    // Given: The vertical axis is the `y` axis in `three.js`.
    // Apply the rotation matrix to a unit vector in the `z` direction that corresponds
    // to the `z` scale, then compute its angle against the positive `z` axis.
    const signZ = Math.sign(scale.z);
    const flippedZ = new THREE.Vector3(0, 0, signZ === 0 ? 1 : signZ);
    const rotatedZ = flippedZ.applyEuler(rotation);

    return Math.atan2(rotatedZ.x, rotatedZ.z);
  }

  /**
   * Gets the size vector of a bounding box in the coordinate system of the database
   * from the scale of its `three.js` representation.
   *
   * @param config The configuration of the application.
   * @param scale The scale in world space.
   * @returns The requested size vector.
   */
  static #getSizeFromScale(
    config: EditorConfig,
    scale: Readonly<THREE.Vector3>,
  ): Readonly<THREE.Vector3> {
    const format = config.coordinateFormat;
    return ThreeUtils.mapVector3(format.toDatabaseCoords(scale), Math.abs);
  }

  /**
   * Derives the pose of a bounding box in the coordinate system of the database
   * from the raw transform of its `three.js` representation.
   *
   * This applies the exact same mapping as the `center`, `angle` and `size` getters
   * (which read the same transform from the live view), so the pose derived here is
   * identical to the one those getters report for an object with the given transform.
   *
   * @param config The configuration of the application.
   * @param transform The transform of the `three.js` representation of the box.
   * @returns The pose corresponding to the given transform.
   */
  static poseFromTransform(
    config: EditorConfig,
    transform: Readonly<{
      position: Readonly<THREE.Vector3>;
      rotation: Readonly<THREE.Euler>;
      scale: Readonly<THREE.Vector3>;
    }>,
  ): BoxPose {
    const center = LabelBox.#getCenterFromPosition(config, transform.position);
    const angle = LabelBox.#getAngleFromTransform(
      transform.rotation,
      transform.scale,
    );
    const size = LabelBox.#getSizeFromScale(config, transform.scale);

    return {
      center: { x: center.x, y: center.y, z: center.z },
      angle: angle,
      size: { x: size.x, y: size.y, z: size.z },
    };
  }
}
