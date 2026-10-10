import * as THREE from "three";

import type { EditorConfig } from "sta/app/editor";
import { TypeUtils, Equatable } from "sta/common";
import type { Timestamp } from "sta/common";

import type { ReadonlyLabelClass } from "./LabelClass";
import type { ReadonlyLabelSelection } from "./LabelSelection";
import type {
  SegmentationIndexEventMap,
  ReadonlySegmentationIndex,
} from "./SegmentationIndex";
import type { UUID } from "./models";
import { Polyline } from "./views";

interface LabelInstanceViewParams {
  /** The coordinates of each vertex in the instance of a selection. */
  pathCoords?: readonly Readonly<THREE.Vector3>[];
  /** The display color of the instance of a selection. Defaults to black. */
  color?: Readonly<THREE.Color>;
}

/**
 * View class for {@link LabelInstance}.
 */
class LabelInstanceView {
  readonly #line: Polyline;

  /** The coordinates of each vertex in the instance of a selection. */
  get pathCoords(): readonly Readonly<THREE.Vector3>[] {
    return this.#line.pathCoords;
  }

  set pathCoords(value: readonly Readonly<THREE.Vector3>[]) {
    this.#line.pathCoords = value;
  }

  /** The display color of the instance of a selection. */
  get color(): Readonly<THREE.Color> {
    return this.#line.color;
  }

  set color(value: Readonly<THREE.Color>) {
    this.#line.color = value;
  }

  /**
   * Creates a view for a {@link LabelInstance}.
   *
   * @param params The parameters to pass to the view.
   */
  constructor(params: LabelInstanceViewParams) {
    this.#line = new Polyline({
      pathCoords: params.pathCoords ?? [],
      color: params.color ?? new THREE.Color("red"),
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

export interface LabelInstanceParams {
  /** The configuration of the application. */
  config: EditorConfig;
  /**
   * A collection of labels from which related labels are queried for
   * this instance of a selection.
   *
   * This is usually the collection of labels containing this instance of a selection.
   */
  labels: ReadonlySegmentationIndex | null;
  /** The unique identifier of the instance of a selection. */
  id: UUID;
  /** `true` if the represented object has low reflectivity; otherwise, `false`. */
  isBlack?: boolean;
  /**
   * The unique identifier of the ground truth class of the represented object,
   * or `null` if no class is assigned.
   */
  gtClassId?: number | null;
  /** The minimum timestamp for which to display the instance. */
  minTimestamp?: Timestamp | null;
  /** The maximum timestamp for which to display the instance. */
  maxTimestamp?: Timestamp | null;
}

/**
 * Represents the event when a property (except for `labels`) has been changed.
 * - `type`: The type (i.e., name) of the event.
 * - `obj`: The object which property has been changed.
 * - `propertyKey`: The name of the property that was changed.
 */
export interface PropertyChangeEvent {
  type: "change";
  obj: LabelInstance;
  propertyKey: Exclude<keyof LabelInstanceParams, "config" | "labels">;
}

/**
 * Defines each event that can be dispatched by {@link LabelInstance}.
 */
export interface LabelInstanceEventMap {
  /** The event when a property (except for `labels`) has been changed. */
  change: PropertyChangeEvent;
}

export type ReadonlyLabelInstance = Pick<
  Readonly<LabelInstance>,
  | keyof THREE.EventDispatcher<LabelInstanceEventMap>
  | "asObject3D"
  | "raycast"
  | "minTimestamp"
  | "maxTimestamp"
  | keyof LabelInstanceParams
  | "gtClass"
  | "elements"
  | "setDisplayRange"
>;

/**
 * Represents an object across one or more frames.
 *
 * The structure of this agent class is similar to a controller, but since we are wrapping
 * {@link ReadonlySegmentationIndex} which is an agent class, we need to perform the coordination
 * at the agent level rather than the controller level. Here, {@link ReadonlySegmentationIndex}
 * acts like a model while an internal rendering object acts like a view.
 */
export class LabelInstance extends THREE.EventDispatcher<LabelInstanceEventMap> {
  #view: LabelInstanceView | null = null;

  #attachViewListeners(): void {
    this.#labels?.addEventListener(
      "selection-add",
      this.#onSelectionChange as never,
    );
    this.#labels?.addEventListener(
      "selection-delete",
      this.#onSelectionChange as never,
    );
    this.#labels?.addEventListener(
      "selection-update",
      this.#onSelectionChange as never,
    );
    this.#labels?.addEventListener(
      "class-delete",
      this.#onClassDelete as never,
    );
    this.#labels?.addEventListener(
      "class-update",
      this.#onClassUpdate as never,
    );
  }

  #detachViewListeners(): void {
    this.#labels?.removeEventListener(
      "selection-add",
      this.#onSelectionChange as never,
    );
    this.#labels?.removeEventListener(
      "selection-delete",
      this.#onSelectionChange as never,
    );
    this.#labels?.removeEventListener(
      "selection-update",
      this.#onSelectionChange as never,
    );
    this.#labels?.removeEventListener(
      "class-delete",
      this.#onClassDelete as never,
    );
    this.#labels?.removeEventListener(
      "class-update",
      this.#onClassUpdate as never,
    );
  }

  #getView(): LabelInstanceView {
    if (this.#view == null) {
      this.#view = new LabelInstanceView({});
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
   * Performs raycasting against this instance of a selection.
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

  /** The configuration of the application. */
  readonly config: EditorConfig;

  #labels: ReadonlySegmentationIndex | null;

  /**
   * A collection of labels from which related labels are queried for
   * this instance of a selection.
   *
   * This is usually the collection of labels containing this instance of a selection.
   */
  get labels(): ReadonlySegmentationIndex | null {
    return this.#labels;
  }

  set labels(value: ReadonlySegmentationIndex | null) {
    if (this.#labels !== value) {
      if (this.#view != null) this.#detachViewListeners();

      this.#labels = value;
      if (this.#view != null) this.#attachViewListeners();

      this.render();
    }
  }

  #id: UUID;

  /** The unique identifier of this instance of a selection. */
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

  /** true` if the represented object has low reflectivity; otherwise, `false`. */
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

    return LabelInstance.#getGroundTruthClass(labels, this.gtClassId);
  }

  /**
   * The selections that belong to this instance of a selection.
   *
   * This is an empty array if there is no collection of labels to query.
   */
  get elements(): ReadonlySet<ReadonlyLabelSelection> {
    const { labels } = this;
    if (labels == null) return new Set();

    return LabelInstance.#getElements(labels, this.id);
  }

  #minTimestamp: Timestamp | null = null;

  /** The minimum timestamp for which to display this object track. */
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

  /** The maximum timestamp for which to display this object track. */
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

  /**
   * Updates the view-only trajectory range atomically without publishing a
   * label-data change. Frame navigation must not invalidate editor state.
   */
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

  /** Updates the view according to the data in this object. */
  render(): void {
    const view = this.#view;
    if (view == null) return;
    const { id, gtClassId, minTimestamp, maxTimestamp } = this;
    const labels = this.#labels;
    if (labels == null) return;

    view.pathCoords = LabelInstance.#getPathCoords(
      labels,
      id,
      minTimestamp,
      maxTimestamp,
    );
    view.color = LabelInstance.#getColor(labels, gtClassId);
  }

  /**
   * Gets the selection that belong to instance of an object.
   *
   * @param labels The collection of labels from which related labels are queried.
   * @param id The unique identifier of the instance.
   * @returns The requested selection.
   */
  static #getElements(
    labels: ReadonlySegmentationIndex,
    id: UUID,
  ): ReadonlySet<ReadonlyLabelSelection> {
    return labels.getLabelInstanceElements(id);
  }

  /**
   * Gets the coordinates of each vertex for an instance of a selection.
   *
   * @param labels The collection of labels from which related labels are queried.
   * @param id The unique identifier of the instance of a selection.
   * @param minTimestamp The start of the time interval.
   * @param maxTimestamp The end of the time interval.
   * @returns The requested coordinates.
   */
  static #getPathCoords(
    labels: ReadonlySegmentationIndex,
    id: UUID,
    minTimestamp: Timestamp | null,
    maxTimestamp: Timestamp | null,
  ): readonly Readonly<THREE.Vector3>[] {
    return [...LabelInstance.#getElements(labels, id)]
      .filter(
        /**
         * Type annotates the returned array as objects where `timestamp` is not null-like.
         *
         * @returns `true` if `timestamp` is not null-like; otherwise, `false`.
         */
        (
          selection: ReadonlyLabelSelection,
        ): selection is ReadonlyLabelSelection & {
          timestamp: Timestamp;
        } =>
          LabelInstance.#filterFunc(
            selection.timestamp,
            minTimestamp,
            maxTimestamp,
          ),
      )
      .sort((d1, d2) => d1.timestamp.getTime() - d2.timestamp.getTime())
      .map((selection) => selection.centerPoint.clone());
  }

  /**
   * Checks whether a selection timestamp is within the given time interval.
   *
   * @param selectionTimestamp The selection timestamp.
   * @param minTimestamp The start of the time interval.
   * @param maxTimestamp The end of the time interval.
   * @returns `true` if the selection timestamp is within the interval; otherwise, `false`.
   */
  static #filterFunc(
    selectionTimestamp: Timestamp | null,
    minTimestamp: Timestamp | null,
    maxTimestamp: Timestamp | null,
  ): boolean {
    const min = minTimestamp?.getTime() ?? Number.NEGATIVE_INFINITY;
    const max = maxTimestamp?.getTime() ?? Number.POSITIVE_INFINITY;

    return (
      TypeUtils.isNotNull(selectionTimestamp) &&
      min <= selectionTimestamp.getTime() &&
      selectionTimestamp.getTime() <= max
    );
  }

  /** The default color to use when there is no associated class. */
  static readonly #NO_CLASS_COLOR: Readonly<THREE.Color> = new THREE.Color(
    0xd22b2b,
  );

  /**
   * Gets the ground truth class for an instance of a selection, if it exists.
   *
   * @param labels The collection of labels from which related labels are queried.
   * @param gtClassId The unique identifier of the ground truth class of the
   * represented object, or `null` if no class is assigned.
   * @returns The requested class, or `null` if there is no such class.
   */
  static #getGroundTruthClass(
    labels: ReadonlySegmentationIndex,
    gtClassId: number | null,
  ): ReadonlyLabelClass | null {
    return gtClassId == null ? null : labels.getLabelClass(gtClassId);
  }

  /**
   * Gets the color to display for an instance of a selection.
   *
   * @param labels The collection of labels from which related labels are queried.
   * @param gtClassId The unique identifier of the ground truth class of the
   * represented object, or `null` if no class is assigned.
   * @returns The requested color.
   */
  static #getColor(
    labels: ReadonlySegmentationIndex,
    gtClassId: number | null,
  ): Readonly<THREE.Color> {
    const gtClass = LabelInstance.#getGroundTruthClass(labels, gtClassId);
    return gtClass?.selectionColor ?? LabelInstance.#NO_CLASS_COLOR;
  }

  /**
   * Handles the event when a selection has been added, deleted or updated.
   */
  #onSelectionChange = (
    event:
      | SegmentationIndexEventMap["selection-add"]
      | SegmentationIndexEventMap["selection-delete"]
      | SegmentationIndexEventMap["selection-update"],
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

  /** Handles the event when an object class has been deleted. */
  #onClassDelete = (event: SegmentationIndexEventMap["class-delete"]) => {
    if (event.obj === this.gtClass) {
      this.render();
    }
  };

  /** Handles the event when an object class has been updated. */
  #onClassUpdate = (event: SegmentationIndexEventMap["class-update"]) => {
    if (event.obj === this.gtClass) {
      this.render();
    }
  };

  /**
   * Creates a new instance of a selection to represent an object.
   *
   * @param params The parameters of the instance of a selection.
   */
  constructor(params: LabelInstanceParams) {
    super();

    this.config = params.config;

    this.#labels = params.labels;

    this.#id = params.id;
    this.#isBlack = params.isBlack ?? false;
    this.#gtClassId = params.gtClassId ?? null;
  }

  /** Disposes of this object. Do not use it afterwards. */
  dispose(): void {
    if (this.#view != null) this.#detachViewListeners();
  }
}
