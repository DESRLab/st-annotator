import * as THREE from "three";

import type { EditorConfig } from "sta/app/editor";
import { TypeUtils, Equatable } from "sta/common";
import type { Timestamp } from "sta/common";

import type { ReadonlyBBoxIndex, BBoxIndexEventMap } from "./BBoxIndex";
import type { ReadonlyLabelBox } from "./LabelBox";
import type { ReadonlyLabelClass } from "./LabelClass";
import type { UUID } from "./models";
import { Polyline } from "./views";

/**
 * Parameters for creating a {@link LabelTrackView}.
 */
interface LabelTrackViewParams {
  /**
   * The coordinates of each vertex in the object track.
   */
  pathCoords?: readonly Readonly<THREE.Vector3>[];
  /**
   * The display color of the object track.
   * Defaults to black.
   */
  color?: Readonly<THREE.Color>;
}

/**
 * View class for {@link LabelTrack}.
 */
class LabelTrackView {
  readonly #line: Polyline;

  /**
   * The coordinates of each vertex in the object track.
   */
  get pathCoords(): readonly Readonly<THREE.Vector3>[] {
    return this.#line.pathCoords;
  }

  set pathCoords(value: readonly Readonly<THREE.Vector3>[]) {
    this.#line.pathCoords = value;
  }

  /**
   * The display color of the object track.
   */
  get color(): Readonly<THREE.Color> {
    return this.#line.color;
  }

  set color(value: Readonly<THREE.Color>) {
    this.#line.color = value;
  }

  /**
   * Creates a view for a {@link LabelTrack}.
   *
   * @param params The parameters to pass to the view.
   */
  constructor(params: LabelTrackViewParams) {
    this.#line = new Polyline({
      pathCoords: params.pathCoords ?? [],
      color: params.color ?? new THREE.Color("black"),
    });
  }

  /**
   * Returns a `three.js` representation of this view.
   *
   * @returns The resulting object.
   */
  asObject3D(): THREE.Object3D {
    return this.#line.asObject3D();
  }

  dispose(): void {
    this.#line.dispose();
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
    return this.#line.raycast(raycaster, intersects);
  }
}

/**
 * Parameters for creating a {@link LabelTrack}.
 */
export interface LabelTrackParams {
  /** The configuration of the application. */
  config: EditorConfig;
  /**
   * A collection of labels from which related labels are queried for this object track.
   *
   * This is usually the collection of labels containing this object track.
   */
  labels: ReadonlyBBoxIndex | null;
  /** The unique identifier of the object track. */
  id: UUID;
  /**
   * `true` if the represented object has low reflectivity; otherwise, `false`.
   */
  isBlack?: boolean;
  /**
   * The unique identifier of the ground truth class of the represented object,
   * or `null` if no class is assigned.
   */
  gtClassId?: number | null;
  /** The minimum timestamp for which to display the track. */
  minTimestamp?: Timestamp | null;
  /** The maximum timestamp for which to display the track. */
  maxTimestamp?: Timestamp | null;
}

/**
 * Represents the event when a property (except for `labels`) has been changed.
 * - `obj`: The object which property has been changed.
 * - `propertyKey`: The name of the property that was changed.
 */
export interface PropertyChangeEvent {
  obj: LabelTrack;
  propertyKey: Exclude<keyof LabelTrackParams, "config" | "labels">;
}

/**
 * Defines each event that can be dispatched by {@link LabelTrack}.
 */
export interface LabelTrackEventMap {
  /**
   * The event when a property (except for `labels`) has been changed.
   */
  change: PropertyChangeEvent;
}

/**
 * A read-only view of a {@link LabelTrack}.
 */
export type ReadonlyLabelTrack = Pick<
  Readonly<LabelTrack>,
  | keyof THREE.EventDispatcher<LabelTrackEventMap>
  | "asObject3D"
  | "raycast"
  | "minTimestamp"
  | "maxTimestamp"
  | keyof LabelTrackParams
  | "gtClass"
  | "elements"
  | "setDisplayRange"
>;

/**
 * Represents an object across one or more frames.
 *
 * The structure of this agent class is similar to `Controller`, but since we are wrapping
 * {@link ReadonlyBBoxIndex} which is an agent class, we need to perform the coordination
 * at the agent level rather than the controller level. Here, {@link ReadonlyBBoxIndex}
 * acts like a model while {@link LabelTrackView} acts like a view.
 */
export class LabelTrack extends THREE.EventDispatcher<LabelTrackEventMap> {
  #view: LabelTrackView | null = null;

  #attachViewListeners(): void {
    this.#labels?.addEventListener("box-add", this.#onBoxChange);
    this.#labels?.addEventListener("box-delete", this.#onBoxChange);
    this.#labels?.addEventListener("box-update", this.#onBoxChange);
    this.#labels?.addEventListener("class-delete", this.#onClassDelete);
    this.#labels?.addEventListener("class-update", this.#onClassUpdate);
  }

  #detachViewListeners(): void {
    this.#labels?.removeEventListener("box-add", this.#onBoxChange);
    this.#labels?.removeEventListener("box-delete", this.#onBoxChange);
    this.#labels?.removeEventListener("box-update", this.#onBoxChange);
    this.#labels?.removeEventListener("class-delete", this.#onClassDelete);
    this.#labels?.removeEventListener("class-update", this.#onClassUpdate);
  }

  #getView(): LabelTrackView {
    if (this.#view == null) {
      this.#view = new LabelTrackView({});
      this.#attachViewListeners();
      this.render();
    }
    return this.#view;
  }

  /**
   * Returns a `three.js` representation of this controller.
   *
   * @returns The resulting object.
   */
  asObject3D(): THREE.Object3D {
    return this.#getView().asObject3D();
  }

  /**
   * Performs raycasting against this object track.
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
    return this.#getView().raycast(raycaster, intersects);
  }

  /**
   * The configuration of the application.
   */
  readonly config: EditorConfig;

  #labels: ReadonlyBBoxIndex | null;

  /**
   * A collection of labels from which related labels are queried for this object track.
   *
   * This is usually the collection of labels containing this object track.
   */
  get labels(): ReadonlyBBoxIndex | null {
    return this.#labels;
  }

  set labels(value: ReadonlyBBoxIndex | null) {
    if (this.#labels !== value) {
      if (this.#view != null) this.#detachViewListeners();

      this.#labels = value;
      if (this.#view != null) this.#attachViewListeners();

      this.render();
    }
  }

  #id: UUID;

  /**
   * The unique identifier of this object track.
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

  #isBlack: boolean;

  /**
   * `true` if the represented object has low reflectivity; otherwise, `false`.
   */
  get isBlack(): boolean {
    return this.#isBlack;
  }

  set isBlack(value: boolean) {
    if (this.#isBlack !== value) {
      this.#isBlack = value;

      this.render();
      this.dispatchEvent({
        type: "change",
        obj: this,
        propertyKey: "isBlack",
      });
    }
  }

  #gtClassId: number | null;

  /**
   * The unique identifier of the ground truth class of the represented object,
   * or `null` if no class is assigned.
   */
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

  /**
   * The ground truth class of the represented object, or `null` if no class is
   * assigned.
   *
   * This is `null` if there is no collection of labels to query.
   */
  get gtClass(): ReadonlyLabelClass | null {
    const { labels } = this;
    if (labels == null) return null;

    return LabelTrack.#getGroundTruthClass(labels, this.gtClassId);
  }

  /**
   * The bounding boxes that belong to this object track.
   *
   * This is an empty array if there is no collection of labels to query.
   */
  get elements(): ReadonlySet<ReadonlyLabelBox> {
    const { labels } = this;
    if (labels == null) return new Set();

    return LabelTrack.#getElements(labels, this.id);
  }

  #minTimestamp: Timestamp | null = null;

  /**
   * The minimum timestamp for which to display this object track.
   */
  get minTimestamp(): Timestamp | null {
    return this.#minTimestamp;
  }

  set minTimestamp(value: Timestamp | null) {
    if (!Equatable.equalsNullable(this.#minTimestamp, value)) {
      this.#minTimestamp = value;

      this.render();
      this.dispatchEvent({
        type: "change",
        obj: this,
        propertyKey: "minTimestamp",
      });
    }
  }

  #maxTimestamp: Timestamp | null = null;

  /**
   * The maximum timestamp for which to display this object track.
   */
  get maxTimestamp(): Timestamp | null {
    return this.#maxTimestamp;
  }

  set maxTimestamp(value: Timestamp | null) {
    if (!Equatable.equalsNullable(this.#maxTimestamp, value)) {
      this.#maxTimestamp = value;

      this.render();
      this.dispatchEvent({
        type: "change",
        obj: this,
        propertyKey: "maxTimestamp",
      });
    }
  }

  /** Updates the transient trajectory range without emitting label-data events. */
  setDisplayRange(
    minTimestamp: Timestamp | null,
    maxTimestamp: Timestamp | null,
  ): void {
    if (
      Equatable.equalsNullable(this.#minTimestamp, minTimestamp) &&
      Equatable.equalsNullable(this.#maxTimestamp, maxTimestamp)
    )
      return;

    this.#minTimestamp = minTimestamp;
    this.#maxTimestamp = maxTimestamp;
    this.render();
  }

  /**
   * Updates the view according to the data in this object.
   */
  render() {
    const view = this.#view;
    if (view == null) return;
    const { id, gtClassId, minTimestamp, maxTimestamp } = this;
    const labels = this.#labels;
    if (labels == null) return;

    view.pathCoords = LabelTrack.#getPathCoords(
      labels,
      id,
      minTimestamp,
      maxTimestamp,
    );
    view.color = LabelTrack.#getColor(labels, gtClassId);
  }

  /**
   * Gets the bounding boxes that belong to an object track.
   *
   * @param labels The collection of labels from which related labels are queried.
   * @param id The unique identifier of the object track.
   * @returns The requested bounding boxes.
   */
  static #getElements(
    labels: ReadonlyBBoxIndex,
    id: UUID,
  ): ReadonlySet<ReadonlyLabelBox> {
    return labels.getLabelTrackElements(id);
  }

  /**
   * Gets the coordinates of each vertex for an object track.
   *
   * @param labels The collection of labels from which related labels are queried.
   * @param id The unique identifier of the object track.
   * @param minTimestamp The minimum timestamp for which to display the object track.
   * @param maxTimestamp The maximum timestamp for which to display the object track.
   * @returns The requested coordinates.
   */
  static #getPathCoords(
    labels: ReadonlyBBoxIndex,
    id: UUID,
    minTimestamp: Timestamp | null,
    maxTimestamp: Timestamp | null,
  ): readonly Readonly<THREE.Vector3>[] {
    return [...LabelTrack.#getElements(labels, id)]
      .filter(
        /**
         * Type annotates the returned array as objects where `timestamp` is not null-like.
         *
         * @param box An element of the array.
         * @returns `true` if `timestamp` is not null-like; otherwise, `false`.
         */
        (box): box is ReadonlyLabelBox & { timestamp: Timestamp } =>
          LabelTrack.#filterFunc(box.timestamp, minTimestamp, maxTimestamp),
      )
      .sort((d1, d2) => d1.timestamp.getTime() - d2.timestamp.getTime())
      .map((box) => box.asObject3D().position);
  }

  /**
   * Checks whether bounding box timestamp is within the given time interval.
   *
   * @param boxTimestamp The bounding box timestamp.
   * @param minTimestamp The start of the time interval.
   * @param maxTimestamp The end of the time interval.
   * @returns `true` if the bounding box timestamp is within the interval;
   * otherwise, `false`.
   */
  static #filterFunc(
    boxTimestamp: Timestamp | null,
    minTimestamp: Timestamp | null,
    maxTimestamp: Timestamp | null,
  ): boolean {
    const min = minTimestamp?.getTime() ?? Number.NEGATIVE_INFINITY;
    const max = maxTimestamp?.getTime() ?? Number.POSITIVE_INFINITY;

    return (
      TypeUtils.isNotNull(boxTimestamp) &&
      min <= boxTimestamp.getTime() &&
      boxTimestamp.getTime() <= max
    );
  }

  /**
   * The default color to use when there is no associated class.
   */
  static readonly #NO_CLASS_COLOR: Readonly<THREE.Color> = new THREE.Color(
    0xd22b2b,
  );

  /**
   * Gets the ground truth class for an object track, if it exists.
   *
   * @param labels The collection of labels from which related labels are queried.
   * @param gtClassId The unique identifier of the ground truth class of the
   * represented object, or `null` if no class is assigned.
   * @returns The requested class, or `null` if there is no such class.
   */
  static #getGroundTruthClass(
    labels: ReadonlyBBoxIndex,
    gtClassId: number | null,
  ): ReadonlyLabelClass | null {
    return gtClassId == null ? null : labels.getLabelClass(gtClassId);
  }

  /**
   * Gets the color to display for an object track.
   *
   * @param labels The collection of labels from which related labels are queried.
   * @param gtClassId The unique identifier of the ground truth class of the
   * represented object, or `null` if no class is assigned.
   * @returns The requested color.
   */
  static #getColor(
    labels: ReadonlyBBoxIndex,
    gtClassId: number | null,
  ): Readonly<THREE.Color> {
    const gtClass = LabelTrack.#getGroundTruthClass(labels, gtClassId);
    return gtClass?.boxColor ?? LabelTrack.#NO_CLASS_COLOR;
  }

  /**
   * Handles the event when a bounding box has been added, deleted or updated.
   */
  #onBoxChange = (
    event: BBoxIndexEventMap[`box-${"add" | "delete" | "update"}`],
  ) => {
    if (event.obj.entity === this) {
      this.render();
    } else if (
      this.#view != null &&
      this.#view.pathCoords.length !== this.elements.size
    ) {
      // In case an element is unassigned
      this.render();
    }
  };

  /**
   * Handles the event when an object class has been deleted.
   */
  #onClassDelete = (event: BBoxIndexEventMap["class-delete"]) => {
    if (event.obj === this.gtClass) {
      this.render();
    }
  };

  /**
   * Handles the event when an object class has been updated.
   */
  #onClassUpdate = (event: BBoxIndexEventMap["class-update"]) => {
    if (event.obj === this.gtClass) {
      this.render();
    }
  };

  /**
   * Creates a new object track to represent an object.
   *
   * @param params The parameters of the object track.
   */
  constructor(params: LabelTrackParams) {
    super();

    this.config = params.config;

    this.#labels = params.labels;

    this.#id = params.id;
    this.#isBlack = params.isBlack ?? false;
    this.#gtClassId = params.gtClassId ?? null;
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose() {
    if (this.#view != null) {
      this.#detachViewListeners();
      this.#view.dispose();
    }
  }
}
