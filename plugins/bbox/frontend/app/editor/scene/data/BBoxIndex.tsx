import _ from "lodash";
import * as THREE from "three";
import BiMap from "ts-bidirectional-map";

import type { EditorConfig, EditableFrame } from "sta/app/editor";
import { BiMapWithPlaceholderLookup, Placeholder } from "sta/app/editor";
import type { Expand, Timestamp } from "sta/common";
import { CollectionUtils } from "sta/common";

import {
  LabelBox,
  type LabelBoxParams,
  type ReadonlyLabelBox,
} from "./LabelBox";
import {
  LabelClass,
  type LabelClassParams,
  type ReadonlyLabelClass,
} from "./LabelClass";
import {
  LabelTrack,
  type LabelTrackParams,
  type ReadonlyLabelTrack,
} from "./LabelTrack";
import type { UUID } from "./models";

// The change events of LabelBox/LabelClass/LabelTrack are retyped locally with a
// widened `propertyKey`, since the index re-emits them as its own update events.

interface LabelBoxChangeEvent {
  obj: LabelBox;
  propertyKey: string;
}
interface LabelClassChangeEvent {
  obj: LabelClass;
  propertyKey: string;
}
interface LabelTrackChangeEvent {
  obj: LabelTrack;
  propertyKey: string;
}

export type BoxParams = Omit<LabelBoxParams, "config" | "labels">;

export type ClassParams = Omit<LabelClassParams, "config" | "labels">;

export type TrackParams = Omit<LabelTrackParams, "config" | "labels">;

/**
 * Represents the event when a bounding box in the collection has been updated.
 * - `obj`: The object which has been updated.
 * - `propertyKey`: The name of the property that was changed.
 */
export interface BoxUpdateEvent {
  obj: ReadonlyLabelBox;
  propertyKey: LabelBoxChangeEvent["propertyKey"];
}

/**
 * Represents the event when an object class in the collection has been updated.
 * - `obj`: The object which has been updated.
 * - `propertyKey`: The name of the property that was changed.
 */
export interface ClassUpdateEvent {
  obj: ReadonlyLabelClass;
  propertyKey: LabelClassChangeEvent["propertyKey"];
}

/**
 * Represents the event when an object track in the collection has been updated.
 * - `obj`: The object which has been updated.
 * - `propertyKey`: The name of the property that was changed.
 */
export interface TrackUpdateEvent {
  obj: ReadonlyLabelTrack;
  propertyKey: LabelTrackChangeEvent["propertyKey"];
}

/**
 * Defines the event that can be dispatched by {@link BBoxIndex}.
 *
 * Note that bulk operations do not trigger the more specific events,
 * to avoid unnecessary updating.
 */
export interface BBoxIndexEventMap {
  /** The event when a bounding box in the collection has been added. */
  "box-add": { obj: ReadonlyLabelBox };
  /** The event when a bounding box in the collection has been deleted. */
  "box-delete": { obj: ReadonlyLabelBox };
  /** The event when a bounding box in the collection has been updated. */
  "box-update": BoxUpdateEvent;
  /** The event when the {@link Placeholder} unique identifier of a bounding box has been resolved. */
  "box-resolveId": { obj: ReadonlyLabelBox };
  /** The event when an object class in the collection has been added. */
  "class-add": { obj: ReadonlyLabelClass };
  /** The event when an object class in the collection has been deleted. */
  "class-delete": { obj: ReadonlyLabelClass };
  /** The event when an object class in the collection has been updated. */
  "class-update": ClassUpdateEvent;
  /** The event when an object track in the collection has been added. */
  "track-add": { obj: ReadonlyLabelTrack };
  /** The event when an object track in the collection has been deleted. */
  "track-delete": { obj: ReadonlyLabelTrack };
  /** The event when an object track in the collection has been updated. */
  "track-update": TrackUpdateEvent;
  /** The event when the {@link Placeholder} unique identifier of an object track has been resolved. */
  "track-resolveId": { obj: ReadonlyLabelTrack };
  /** The event when multiple items have been added to the collection in a bulk operation. */
  "bulk-add": {};
  /** The event when multiple items have been deleted from the collection in a bulk operation. */
  "bulk-delete": {};
}

/**
 * Represents the parameters for initializing a {@link BBoxIndex}.
 */
export interface BBoxDataParams {
  /** Parameters to initialize each object class in the collection. */
  classes?: readonly ClassParams[];
  /** Parameters to initialize each object track in the collection. */
  tracks?: readonly TrackParams[];
  /** Parameters to initialize each bounding box in the collection. */
  boxes?: readonly BoxParams[];
}

export type BBoxLabelsData = Required<BBoxDataParams>;

/**
 * Indexes a collection of bounding box labels.
 *
 * The index updates automatically whenever a change is made to a label created through an
 * `add` method of that index.
 */
export type BBoxIndex = Expand<
  _BBoxIndex & THREE.EventDispatcher<BBoxIndexEventMap>
>;

export type ReadonlyBBoxIndex = Pick<
  BBoxIndex,
  | keyof THREE.EventDispatcher<BBoxIndexEventMap>
  | "iterLabelClasses"
  | "hasLabelClass"
  | "getLabelClass"
  | "iterLabelTracks"
  | "hasLabelTrack"
  | "getLabelTrack"
  | "iterLabelBoxes"
  | "hasLabelBox"
  | "getLabelBox"
  | "getLabelTrackElements"
>;

/**
 * @see BBoxIndex
 */
export interface _BBoxIndex {
  /**
   * The configuration of the application.
   */
  readonly config: EditorConfig;

  /**
   * The number of object classes stored in the collection.
   */
  readonly numLabelClasses: number;

  /**
   * Iterates through each object class in the collection.
   *
   * @returns An iterator that yields such items.
   */
  iterLabelClasses(): IterableIterator<ReadonlyLabelClass>;

  /**
   * Tests whether an object class exists in the collection.
   *
   * @param id The unique identifier of the object class.
   * @param allowDeleted If `true`, may consider items that have been
   * marked as deleted.
   * @returns `true` if the data is in the collection; otherwise, `false`.
   * @throws {Error} If the data is not in the collection.
   */
  hasLabelClass(id: number, allowDeleted?: boolean): boolean;

  /**
   * Gets an object class in the collection by its unique identifier.
   *
   * @param id The unique identifier of the object class.
   * @param allowDeleted If `true`, may consider items that have been
   * marked as deleted.
   * @returns The data of the corresponding object class.
   * @throws {Error} If the data is not in the collection.
   */
  getLabelClass(id: number, allowDeleted?: boolean): ReadonlyLabelClass;

  /**
   * Adds an object class to the collection.
   *
   * @param classParams Parameters to initialize the object class.
   * @returns The newly created object class.
   * @throws {Error} If the data is already in the collection.
   */
  addLabelClass(classParams: ClassParams): ReadonlyLabelClass;

  /**
   * Removes an object class from the collection.
   *
   * @param labelClass The object class to remove.
   * @throws {Error} If the class is not in the collection.
   */
  deleteLabelClass(labelClass: ReadonlyLabelClass): void;

  /**
   * Updates an object class in the collection.
   *
   * @param labelClass The object class to update.
   * @param classParams Parameters to update the object class.
   * @throws {Error} If the box is not in the collection.
   */
  updateLabelClass(
    labelClass: ReadonlyLabelClass,
    classParams: Partial<ClassParams>,
  ): void;

  /**
   * The number of object tracks stored in the collection.
   */
  readonly numLabelTracks: number;

  /**
   * Iterates through each object track in the collection.
   *
   * @returns An iterator that yields such items.
   */
  iterLabelTracks(): IterableIterator<ReadonlyLabelTrack>;

  /**
   * Tests whether an object track exists in the collection.
   *
   * @param id The unique identifier of the object track.
   * @param allowDeleted If `true`, may consider items that have been
   * marked as deleted.
   * @returns `true` if the data is in the collection; otherwise, `false`.
   * @throws {Error} If the track is not in the collection.
   */
  hasLabelTrack(id: UUID, allowDeleted?: boolean): boolean;

  /**
   * Gets an object track in the collection by its unique identifier.
   *
   * @param id The unique identifier of the object track.
   * @param allowDeleted If `true`, may consider items that have been
   * marked as deleted.
   * @returns The data of the corresponding object track.
   * @throws {Error} If the track is not in the collection.
   */
  getLabelTrack(id: UUID, allowDeleted?: boolean): ReadonlyLabelTrack;

  /**
   * Adds an object track to the collection.
   *
   * @param trackParams Parameters to initialize the object track.
   * @returns The newly created object track.
   * @throws {Error} If the track is already in the collection.
   */
  addLabelTrack(trackParams: TrackParams): LabelTrack;

  /**
   * Removes an object track from the collection.
   *
   * @param track The object track to remove.
   * @throws {Error} If the track is not in the collection.
   */
  deleteLabelTrack(track: ReadonlyLabelTrack): void;

  /**
   * Updates an object track in the collection.
   *
   * @param track The object track to update.
   * @param trackParams Parameters to update the object track.
   * @throws {Error} If the track is not in the collection.
   */
  updateLabelTrack(
    track: ReadonlyLabelTrack,
    trackParams: Partial<TrackParams>,
  ): void;

  /**
   * The number of bounding boxes stored in the collection.
   */
  readonly numLabelBoxes: number;

  /**
   * Iterates through each bounding box in the collection.
   *
   * @returns An iterator that yields such items.
   */
  iterLabelBoxes(): IterableIterator<ReadonlyLabelBox>;

  /**
   * Tests whether a bounding box exists in the collection.
   *
   * @param id The unique identifier of the bounding box.
   * @param allowDeleted If `true`, may consider items that have been
   * marked as deleted.
   * @returns `true` if the data is in the collection; otherwise, `false`.
   * @throws {Error} If the data is not in the collection.
   */
  hasLabelBox(id: UUID, allowDeleted?: boolean): boolean;

  /**
   * Gets a bounding box in the collection by its unique identifier.
   *
   * @param id The unique identifier of the bounding box.
   * @param allowDeleted If `true`, may consider items that have been
   * marked as deleted.
   * @returns The data of the corresponding bounding box.
   * @throws {Error} If the data is not in the collection.
   */
  getLabelBox(id: UUID, allowDeleted?: boolean): ReadonlyLabelBox;

  /**
   * Adds a bounding box to the collection.
   *
   * @param boxParams Parameters to initialize the bounding box.
   * @returns The newly created bounding box.
   * @throws {Error} If the data is already in the collection.
   */
  addLabelBox(boxParams: BoxParams): ReadonlyLabelBox;

  /**
   * Removes a bounding box from the collection.
   *
   * @param box The bounding box to remove.
   * @throws {Error} If the box is not in the collection.
   */
  deleteLabelBox(box: ReadonlyLabelBox): void;

  /**
   * Updates a bounding box in the collection.
   *
   * @param box The bounding box to update.
   * @param boxParams Parameters to update the bounding box.
   * @throws {Error} If the box is not in the collection.
   */
  updateLabelBox(box: ReadonlyLabelBox, boxParams: Partial<BoxParams>): void;

  /**
   * Gets each bounding box belonging to an object track by its unique identifier.
   *
   * @param id The unique identifier of the object track.
   * @returns The data of each bounding box belonging to the
   * corresponding object track.
   * @throws {Error} If the data is not in the collection.
   */
  getLabelTrackElements(id: UUID): ReadonlySet<ReadonlyLabelBox>;
}

export const ALL_EVENT_TYPES: readonly Extract<
  keyof BBoxIndexEventMap,
  string
>[] = [
  "box-add",
  "box-delete",
  "box-update",
  "box-resolveId",
  "class-add",
  "class-delete",
  "class-update",
  "track-add",
  "track-delete",
  "track-update",
  "track-resolveId",
  "bulk-add",
  "bulk-delete",
];

class DefaultMapWithPlaceholderLookup<
  KResolved extends {} | null,
  V,
> extends CollectionUtils.DefaultMap<KResolved | Placeholder<KResolved>, V> {
  readonly #resolvedPlaceholders = new Map<KResolved, Placeholder<KResolved>>();

  get(key: KResolved | Placeholder<KResolved>): V {
    if (!Placeholder.isPlaceholder(key)) {
      const resolvedKey = this.#resolvedPlaceholders.get(key as KResolved);
      if (resolvedKey !== undefined) return super.get(resolvedKey);
    }

    return super.get(key);
  }

  /**
   * Listens to the event when the placeholder of a key is resolved.
   *
   * @param key The placeholder key.
   */
  #listenToResolve(key: Placeholder<KResolved>) {
    void key.getAsync().then((resolvedKey) => {
      this.#resolvedPlaceholders.set(resolvedKey, key);
    });
  }

  set(key: KResolved | Placeholder<KResolved>, value: V): this {
    if (Placeholder.isPlaceholder(key)) {
      this.#listenToResolve(key);
    }

    return super.set(key, value);
  }
}

/**
 * Converts `labelClass` into a plain object, so that it can be destructured.
 *
 * @param labelClass The input object.
 * @returns The converted object.
 */
export function labelClassToPlain(
  labelClass: ReadonlyLabelClass,
): Required<ClassParams> {
  return {
    id: labelClass.id,
    name: labelClass.name,
    boxColor: labelClass.boxColor,
    defaultSizeDatabase: labelClass.defaultSizeDatabase,
  };
}

/**
 * Converts `params` into a plain object.
 *
 * @param classParams The input object, which may not be plain.
 * @returns The converted object.
 * @throws {Error} If the object cannot be converted.
 */
export function cleanClassParams<T extends Partial<ClassParams>>(
  classParams: T,
): T extends LabelClass ? Required<ClassParams> : T {
  if (classParams instanceof LabelClass)
    // @ts-expect-error - TS cannot evaluate the conditional return type for generic T
    return labelClassToPlain(classParams);

  if (!_.isPlainObject(classParams)) {
    console.error(classParams);
    throw new Error("Unable to clean classParams");
  }

  // @ts-expect-error - TS cannot evaluate the conditional return type for generic T
  return classParams;
}

/**
 * Converts `track` into a plain object, so that it can be destructured.
 *
 * @param track The input object.
 * @returns The converted object.
 */
export function labelTrackToPlain(
  track: ReadonlyLabelTrack,
): Required<TrackParams> {
  return {
    id: track.id,
    isBlack: track.isBlack,
    gtClassId: track.gtClassId,
    minTimestamp: track.minTimestamp,
    maxTimestamp: track.maxTimestamp,
  };
}

/**
 * Converts `params` into a plain object.
 *
 * @param trackParams The input object, which may not be plain.
 * @returns The converted object.
 * @throws {Error} If the object cannot be converted.
 */
export function cleanTrackParams<T extends Partial<TrackParams>>(
  trackParams: T,
): T extends LabelTrack ? Required<TrackParams> : T {
  if (trackParams instanceof LabelTrack)
    // @ts-expect-error - TS cannot evaluate the conditional return type for generic T
    return labelTrackToPlain(trackParams);

  if (!_.isPlainObject(trackParams)) {
    console.error(trackParams);
    throw new Error("Unable to clean trackParams");
  }

  // @ts-expect-error - TS cannot evaluate the conditional return type for generic T
  return trackParams;
}

/**
 * Converts `box` into a plain object, so that it can be destructured.
 *
 * @param box The input object.
 * @returns The converted object.
 */
export function labelBoxToPlain(box: ReadonlyLabelBox): Required<BoxParams> {
  return {
    id: box.id,
    boxType: box.boxType,
    center: box.center,
    angle: box.angle,
    size: box.size,
    qualityRank: box.qualityRank,
    distinctiveLv: box.distinctiveLv,
    occlusionLv: box.occlusionLv,
    perceivedClassId: box.perceivedClassId,
    entityId: box.entityId,
    timestamp: box.timestamp,
    opacity: box.opacity,
    hidden: box.hidden,
    showForwardIndicator: box.showForwardIndicator,
    showFrame: box.showFrame,
    showPerceivedClass: box.showPerceivedClass,
    showColor: box.showColor,
  };
}

/**
 * Converts `boxParams` into a plain object.
 *
 * @param boxParams The input object, which may not be plain.
 * @returns The converted object.
 * @throws {Error} If the object cannot be converted.
 */
export function cleanBoxParams<T extends Partial<BoxParams>>(
  boxParams: T,
): T extends LabelBox ? Required<BoxParams> : T {
  // @ts-expect-error - TS cannot evaluate the conditional return type for generic T
  if (boxParams instanceof LabelBox) return labelBoxToPlain(boxParams);

  if (!_.isPlainObject(boxParams)) {
    console.error(boxParams);
    throw new Error("Unable to clean boxParams");
  }

  // @ts-expect-error - TS cannot evaluate the conditional return type for generic T
  return boxParams;
}

/**
 * Indexes a collection of bounding box labels.
 *
 * The index updates automatically whenever a change is made to a label created through an
 * `add` method of that index.
 */
export class BaseBBoxIndex extends THREE.EventDispatcher<BBoxIndexEventMap> {
  /**
   * The configuration of the application.
   */
  readonly config: EditorConfig;

  /**
   * Indexes each object class in the collection by its unique identifier.
   */
  #classesById: BiMap<number, LabelClass>;

  #deletedClasses: BiMap<number, LabelClass>;

  /**
   * The number of object classes stored in the collection.
   */
  get numLabelClasses(): number {
    return this.#classesById.size;
  }

  /**
   * Iterates through each object class in the collection.
   *
   * @returns An iterator that yields such items.
   */
  iterLabelClasses(): IterableIterator<ReadonlyLabelClass> {
    return this.#classesById.values();
  }

  /**
   * Tests whether an object class exists in the collection.
   *
   * @param id The unique identifier of the object class.
   * @param allowDeleted If `true`, may consider items that have been
   * marked as deleted.
   * @returns `true` if the data is in the collection; otherwise, `false`.
   * @throws {Error} If the data is not in the collection.
   */
  hasLabelClass(id: number, allowDeleted = false): boolean {
    return (
      this.#classesById.has(id) ||
      (allowDeleted && this.#deletedClasses.has(id))
    );
  }

  /**
   * Gets an object class in the collection by its unique identifier.
   *
   * @param id The unique identifier of the object class.
   * @param allowDeleted If `true`, may consider items that have been
   * marked as deleted.
   * @returns The data of the corresponding object class.
   * @throws {Error} If the data is not in the collection.
   */
  #getLabelClass(id: number, allowDeleted = false): LabelClass {
    const result =
      this.#classesById.get(id) ??
      (allowDeleted ? this.#deletedClasses.get(id) : null);

    if (result == null) {
      throw new Error(`There is no class with the given ID: ${id}`);
    } else if (result.labels !== this) {
      throw new Error(`Class not registered to index. ID: ${id}`);
    }

    return result;
  }

  /**
   * Gets an object class in the collection by its unique identifier.
   *
   * @param id The unique identifier of the object class.
   * @param allowDeleted If `true`, may consider items that have been
   * marked as deleted.
   * @returns The data of the corresponding object class.
   * @throws {Error} If the data is not in the collection.
   */
  getLabelClass(id: number, allowDeleted = false): ReadonlyLabelClass {
    return this.#getLabelClass(id, allowDeleted);
  }

  /**
   * Adds an object class to the collection,
   * without performing validation or emitting events.
   *
   * @param labelClass The object class to add.
   */
  #addLabelClass(labelClass: LabelClass) {
    const id = labelClass.id;

    this.#classesById.set(id, labelClass);

    labelClass.addEventListener("change", this.#onClassChange);
  }

  /**
   * Adds an object class to the collection.
   *
   * @param classParams Parameters to initialize the object class.
   * @param isBulk `true` if this is a bulk operation; otherwise, `false`.
   * @returns The newly created object class.
   * @throws {Error} If the data is already in the collection.
   */
  #addLabelClassOrBulk(
    classParams: ClassParams,
    isBulk: boolean,
  ): ReadonlyLabelClass {
    const id = classParams.id;

    // Throw the error at the beginning so that a failed operation does not mutate the mapping
    if (this.#classesById.has(id)) {
      throw new Error(`There already exists a class with the given ID: ${id}`);
    }

    const plainParams = cleanClassParams(classParams);

    // Initialize after validation so we don't have to dispose if validation fails
    // Override config/labels since that is not considered part of the parameters
    const labelClass = new LabelClass({
      ...plainParams,
      config: this.config,
      labels: this,
    });
    this.#addLabelClass(labelClass);

    if (!isBulk) {
      this.dispatchEvent({ type: "class-add", obj: labelClass });
    }

    return labelClass;
  }

  /**
   * Adds an object class to the collection.
   *
   * @param classParams Parameters to initialize the object class.
   * @returns The newly created object class.
   * @throws {Error} If the data is already in the collection.
   */
  addLabelClass(classParams: ClassParams): ReadonlyLabelClass {
    return this.#addLabelClassOrBulk(classParams, false);
  }

  /**
   * Removes an object class from the collection,
   * without performing validation or emitting events.
   *
   * @param labelClass The object class to remove.
   * @throws {Error} If the box is not in the collection.
   */
  #deleteLabelClass(labelClass: LabelClass) {
    const id = labelClass.id;

    for (const box of this.iterLabelBoxes()) {
      if (box.perceivedClassId === id) {
        throw new Error(
          `Cannot delete class with ID: ${id}. It is used by the box with ID: ${box.id}`,
        );
      }
    }

    for (const track of this.iterLabelTracks()) {
      if (track.gtClassId === id) {
        throw new Error(
          `Cannot delete class with ID: ${id}. It is used by the track with ID: ${track.id}`,
        );
      }
    }

    this.#classesById.delete(id);
    this.#deletedClasses.set(id, labelClass);

    labelClass.removeEventListener("change", this.#onClassChange);
  }

  /**
   * Removes an object class from the collection.
   *
   * @param labelClass The object class to remove.
   * @param isBulk `true` if this is a bulk operation; otherwise, `false`.
   * @throws {Error} If the class is not in the collection.
   */
  #deleteLabelClassOrBulk(labelClass: ReadonlyLabelClass, isBulk: boolean) {
    const id = labelClass.id;

    // Throw the error at the beginning (if the track does not exist)
    // so that a failed operation does not mutate the mapping
    const editableClass = this.#getLabelClass(id);
    if (editableClass !== labelClass) {
      throw new Error(`Incorrect instance for class with ID: ${id}`);
    }

    this.#deleteLabelClass(editableClass);
    editableClass.dispose();

    if (!isBulk) {
      this.dispatchEvent({ type: "class-delete", obj: labelClass });
    }
  }

  /**
   * Removes an object class from the collection.
   *
   * @param labelClass The object class to remove.
   * @throws {Error} If the class is not in the collection.
   */
  deleteLabelClass(labelClass: ReadonlyLabelClass): void {
    this.#deleteLabelClassOrBulk(labelClass, false);
  }

  /**
   * Updates an object class in the collection.
   *
   * @param labelClass The object class to update.
   * @param classParams Parameters to update the object class.
   * @throws {Error} If the box is not in the collection.
   */
  updateLabelClass(
    labelClass: ReadonlyLabelClass,
    classParams: Partial<ClassParams>,
  ): void {
    const editableClass = this.#classesById.get(labelClass.id);
    if (editableClass !== labelClass) {
      throw new Error("Failed assertion: The two versions should be the same");
    }

    const plainParams = cleanClassParams(classParams);

    Object.assign(editableClass, plainParams);
  }

  /**
   * Indexes each object track in the collection by its unique identifier.
   */
  #tracksById: BiMap<UUID, LabelTrack>;

  #deletedTracks: BiMap<UUID, LabelTrack>;

  /**
   * The number of object tracks stored in the collection.
   */
  get numLabelTracks(): number {
    return this.#tracksById.size;
  }

  /**
   * Iterates through each object track in the collection.
   *
   * @returns An iterator that yields such items.
   */
  iterLabelTracks(): IterableIterator<ReadonlyLabelTrack> {
    return this.#tracksById.values();
  }

  /**
   * Tests whether an object track exists in the collection.
   *
   * @param id The unique identifier of the object track.
   * @param allowDeleted If `true`, may consider items that have been
   * marked as deleted.
   * @returns `true` if the data is in the collection; otherwise, `false`.
   * @throws {Error} If the track is not in the collection.
   */
  hasLabelTrack(id: UUID, allowDeleted = false): boolean {
    return (
      this.#tracksById.has(id) || (allowDeleted && this.#deletedTracks.has(id))
    );
  }

  /**
   * Gets an object track in the collection by its unique identifier.
   *
   * @param id The unique identifier of the object track.
   * @param allowDeleted If `true`, may consider items that have been
   * marked as deleted.
   * @returns The data of the corresponding object track.
   * @throws {Error} If the track is not in the collection.
   */
  #getLabelTrack(id: UUID, allowDeleted = false): LabelTrack {
    const result =
      this.#tracksById.get(id) ??
      (allowDeleted ? this.#deletedTracks.get(id) : null);

    if (result == null) {
      throw new Error(`There is no track with the given ID: ${id}`);
    } else if (result.labels !== this) {
      throw new Error(`Track not registered to index. ID: ${id}`);
    }

    return result;
  }

  /**
   * Gets an object track in the collection by its unique identifier.
   *
   * @param id The unique identifier of the object track.
   * @param allowDeleted If `true`, may consider items that have been
   * marked as deleted.
   * @returns The data of the corresponding object track.
   * @throws {Error} If the track is not in the collection.
   */
  getLabelTrack(id: UUID, allowDeleted = false): ReadonlyLabelTrack {
    return this.#getLabelTrack(id, allowDeleted);
  }

  /**
   * If `trackParams.id` is a {@link Placeholder}, emits {@link TrackResolveIDEvent}
   * once it is resolved.
   *
   * @param trackParams The input parameters.
   */
  #emitWhenTrackIDResolved(track: LabelTrack) {
    const trackId = track.id;
    if (Placeholder.isPlaceholder(trackId)) {
      void trackId.getAsync().then((resolvedId) => {
        // This check is in case another ID has been assigned to the object
        // Also, we test with the Placeholder object, not the resolved value
        if (track.id !== trackId || this.#tracksById.get(trackId) !== track)
          return;

        const loadedDuplicate = this.#tracksById.get(resolvedId);
        if (loadedDuplicate != null && loadedDuplicate !== track) {
          const placeholderBoxes = this.#boxIdsByTrackId.get(trackId);
          const concreteEntry = [...this.#boxIdsByTrackId.entries()].find(
            ([id]) => id === resolvedId,
          );
          if (concreteEntry != null) {
            for (const boxId of concreteEntry[1]) placeholderBoxes.add(boxId);
            this.#boxIdsByTrackId.delete(resolvedId);
          }
          this.#tracksById.deleteValue(loadedDuplicate);
          loadedDuplicate.removeEventListener("change", this.#onTrackChange);
          loadedDuplicate.dispose();
        }

        this.dispatchEvent({ type: "track-resolveId", obj: track });
      });
    }
  }

  /**
   * Adds an object track to the collection,
   * without performing validation or emitting events.
   *
   * @param track The object track to add.
   */
  #addLabelTrack(track: LabelTrack) {
    const id = track.id;

    for (const [boxId, { entityId: trackId }] of this.#boxesById.entries()) {
      if (trackId === id) {
        this.#boxIdsByTrackId.get(trackId).add(boxId);
      }
    }
    this.#tracksById.set(id, track);

    track.addEventListener("change", this.#onTrackChange);
  }

  /**
   * Adds an object track to the collection.
   *
   * @param trackParams Parameters to initialize the object track.
   * @param isBulk `true` if this is a bulk operation; otherwise, `false`.
   * @returns The newly created object track.
   * @throws {Error} If the track is already in the collection.
   */
  #addLabelTrackOrBulk(trackParams: TrackParams, isBulk: boolean): LabelTrack {
    const id = trackParams.id;

    // Throw the error at the beginning so that a failed operation does not mutate the mapping
    if (this.#tracksById.has(id)) {
      throw new Error(`There already exists a track with the given ID: ${id}`);
    }

    const plainParams = cleanTrackParams(trackParams);

    // Initialize after validation so we don't have to dispose if validation fails
    // Override config/labels since that is not considered part of the parameters
    const track = new LabelTrack({
      ...plainParams,
      config: this.config,
      labels: this,
    });
    this.#addLabelTrack(track);
    track.render();

    this.#emitWhenTrackIDResolved(track);

    if (!isBulk) {
      this.dispatchEvent({ type: "track-add", obj: track });
    }

    return track;
  }

  /**
   * Adds an object track to the collection.
   *
   * @param trackParams Parameters to initialize the object track.
   * @returns The newly created object track.
   * @throws {Error} If the track is already in the collection.
   */
  addLabelTrack(trackParams: TrackParams): LabelTrack {
    return this.#addLabelTrackOrBulk(trackParams, false);
  }

  /**
   * Removes an object track from the collection,
   * without performing validation or emitting events.
   *
   * @param track The object track to remove.
   * @throws {Error} If the track is not in the collection.
   */
  #deleteLabelTrack(track: LabelTrack) {
    const id = track.id;

    for (const box of this.iterLabelBoxes()) {
      if (box.entityId === id) {
        throw new Error(
          `Cannot delete track with ID: ${id}. It is used by the box with ID: ${box.id}`,
        );
      }
    }

    this.#boxIdsByTrackId.delete(id);
    this.#tracksById.delete(id);
    this.#deletedTracks.set(id, track);

    track.removeEventListener("change", this.#onTrackChange);
  }

  /**
   * Removes an object track from the collection.
   *
   * @param track The object track to remove.
   * @param isBulk `true` if this is a bulk operation; otherwise, `false`.
   * @throws {Error} If the track is not in the collection.
   */
  #deleteLabelTrackOrBulk(track: ReadonlyLabelTrack, isBulk: boolean) {
    const id = track.id;

    // Throw the error at the beginning (if the track does not exist)
    // so that a failed operation does not mutate the mapping
    const editableTrack = this.#getLabelTrack(id);
    if (editableTrack !== track) {
      throw new Error(`Incorrect instance for track with ID: ${id}`);
    }

    this.#deleteLabelTrack(editableTrack);
    editableTrack.dispose();

    if (!isBulk) {
      this.dispatchEvent({ type: "track-delete", obj: track });
    }
  }

  /**
   * Removes an object track from the collection.
   *
   * @param track The object track to remove.
   * @throws {Error} If the track is not in the collection.
   */
  deleteLabelTrack(track: ReadonlyLabelTrack): void {
    this.#deleteLabelTrackOrBulk(track, false);
  }

  /**
   * Updates an object track in the collection.
   *
   * @param track The object track to update.
   * @param trackParams Parameters to update the object track.
   * @throws {Error} If the track is not in the collection.
   */
  updateLabelTrack(
    track: ReadonlyLabelTrack,
    trackParams: Partial<TrackParams>,
  ): void {
    const editableTrack = this.#tracksById.get(track.id);
    if (editableTrack !== track) {
      throw new Error("Failed assertion: The two versions should be the same");
    }

    const plainParams = cleanTrackParams(trackParams);

    Object.assign(editableTrack, plainParams);

    this.#emitWhenTrackIDResolved(editableTrack);
  }

  /**
   * Indexes each bounding box in the collection by its unique identifier.
   */
  #boxesById: BiMap<UUID, LabelBox>;

  #deletedBoxes: BiMap<UUID, LabelBox>;

  /**
   * The number of bounding boxes stored in the collection.
   */
  get numLabelBoxes(): number {
    return this.#boxesById.size;
  }

  /**
   * Iterates through each bounding box in the collection.
   *
   * @returns An iterator that yields such items.
   */
  iterLabelBoxes(): IterableIterator<ReadonlyLabelBox> {
    return this.#boxesById.values();
  }

  /**
   * Tests whether a bounding box exists in the collection.
   *
   * @param id The unique identifier of the bounding box.
   * @param allowDeleted If `true`, may consider items that have been
   * marked as deleted.
   * @returns `true` if the data is in the collection; otherwise, `false`.
   * @throws {Error} If the data is not in the collection.
   */
  hasLabelBox(id: UUID, allowDeleted = false): boolean {
    return (
      this.#boxesById.has(id) || (allowDeleted && this.#deletedBoxes.has(id))
    );
  }

  /**
   * Gets a bounding box in the collection by its unique identifier.
   *
   * @param id The unique identifier of the bounding box.
   * @param allowDeleted If `true`, may consider items that have been
   * marked as deleted.
   * @returns The data of the corresponding bounding box.
   * @throws {Error} If the data is not in the collection.
   */
  #getLabelBox(id: UUID, allowDeleted = false): LabelBox {
    const result =
      this.#boxesById.get(id) ??
      (allowDeleted ? this.#deletedBoxes.get(id) : null);

    if (result == null) {
      throw new Error(`There is no box with the given ID: ${id}`);
    } else if (result.labels !== this) {
      throw new Error(`Box not registered to index. ID: ${id}`);
    }

    return result;
  }

  /**
   * Gets a bounding box in the collection by its unique identifier.
   *
   * @param id The unique identifier of the bounding box.
   * @param allowDeleted If `true`, may consider items that have been
   * marked as deleted.
   * @returns The data of the corresponding bounding box.
   * @throws {Error} If the data is not in the collection.
   */
  getLabelBox(id: UUID, allowDeleted = false): ReadonlyLabelBox {
    return this.#getLabelBox(id, allowDeleted);
  }

  /**
   * If `boxParams.id` is a {@link Placeholder}, emits {@link BoxResolveIDEvent}
   * once it is resolved.
   *
   * @param boxParams The input parameters.
   */
  #emitWhenBoxIDResolved(box: LabelBox) {
    const boxId = box.id;
    if (Placeholder.isPlaceholder(boxId)) {
      void boxId.getAsync().then((resolvedId) => {
        // This check is in case another ID has been assigned to the object
        // Also, we test with the Placeholder object, not the resolved value
        if (box.id !== boxId || this.#boxesById.get(boxId) !== box) return;

        const loadedDuplicate = this.#boxesById.get(resolvedId);
        if (loadedDuplicate != null && loadedDuplicate !== box) {
          const duplicateTrackId = loadedDuplicate.entityId;
          if (duplicateTrackId != null) {
            this.#boxIdsByTrackId.get(duplicateTrackId).delete(resolvedId);
          }
          this.#boxesById.deleteValue(loadedDuplicate);
          loadedDuplicate.removeEventListener("change", this.#onBoxChange);
          loadedDuplicate.dispose();
        }

        this.dispatchEvent({ type: "box-resolveId", obj: box });
      });
    }
  }

  /**
   * Adds a bounding box to the collection,
   * without performing validation or emitting events.
   *
   * @param box The bounding box to add.
   */
  #addLabelBox(box: LabelBox) {
    const id = box.id;

    const trackId = box.entityId;
    if (trackId != null) {
      this.#boxIdsByTrackId.get(trackId).add(id);
    }

    this.#boxesById.set(id, box);

    box.addEventListener("change", this.#onBoxChange);
  }

  /**
   * Adds a bounding box to the collection.
   *
   * @param boxParams Parameters to initialize the bounding box.
   * @param isBulk `true` if this is a bulk operation; otherwise, `false`.
   * @returns The newly created bounding box.
   * @throws {Error} If the data is already in the collection.
   */
  #addLabelBoxOrBulk(boxParams: BoxParams, isBulk: boolean): ReadonlyLabelBox {
    const id = boxParams.id;

    // Throw the error at the beginning so that a failed operation does not mutate the mapping
    if (this.#boxesById.has(id)) {
      throw new Error(`There already exists a box with the given ID: ${id}`);
    }

    const plainParams = cleanBoxParams(boxParams);

    // Initialize after validation so we don't have to dispose if validation fails
    // Override config/labels since that is not considered part of the parameters
    const box = new LabelBox({
      ...plainParams,
      config: this.config,
      labels: this,
    });
    this.#addLabelBox(box);
    box.render();

    this.#emitWhenBoxIDResolved(box);

    if (!isBulk) {
      this.dispatchEvent({ type: "box-add", obj: box });
    }

    return box;
  }

  /**
   * Adds a bounding box to the collection.
   *
   * @param boxParams Parameters to initialize the bounding box.
   * @returns The newly created bounding box.
   * @throws {Error} If the data is already in the collection.
   */
  addLabelBox(boxParams: BoxParams): ReadonlyLabelBox {
    return this.#addLabelBoxOrBulk(boxParams, false);
  }

  /**
   * Removes a bounding box from the collection,
   * without performing validation or emitting events.
   *
   * @param box The bounding box to remove.
   * @throws {Error} If the box is not in the collection.
   */
  #deleteLabelBox(box: LabelBox) {
    const id = box.id;

    const trackId = box.entityId;
    if (trackId != null) {
      this.#boxIdsByTrackId.get(trackId).delete(id);
    }

    this.#boxesById.delete(id);
    this.#deletedBoxes.set(id, box);

    box.removeEventListener("change", this.#onBoxChange);
  }

  /**
   * Removes a bounding box from the collection.
   *
   * @param box The bounding box to remove.
   * @param isBulk `true` if this is a bulk operation; otherwise, `false`.
   * @throws {Error} If the box is not in the collection.
   */
  #deleteLabelBoxOrBulk(box: ReadonlyLabelBox, isBulk: boolean) {
    const id = box.id;

    // Throw the error at the beginning (if the box does not exist)
    // so that a failed operation does not mutate the mapping
    const editableBox = this.#getLabelBox(id);
    if (editableBox !== box) {
      throw new Error(`Incorrect instance for track with ID: ${id}`);
    }

    this.#deleteLabelBox(editableBox);
    editableBox.dispose();

    if (!isBulk) {
      this.dispatchEvent({ type: "box-delete", obj: box });
    }
  }

  /**
   * Removes a bounding box from the collection.
   *
   * @param box The bounding box to remove.
   * @throws {Error} If the box is not in the collection.
   */
  deleteLabelBox(box: ReadonlyLabelBox): void {
    this.#deleteLabelBoxOrBulk(box, false);
  }

  /**
   * Updates a bounding box in the collection.
   *
   * @param box The bounding box to update.
   * @param boxParams Parameters to update the bounding box.
   * @throws {Error} If the box is not in the collection.
   */
  updateLabelBox(box: ReadonlyLabelBox, boxParams: Partial<BoxParams>): void {
    const editableBox = this.#boxesById.get(box.id);
    if (editableBox !== box) {
      throw new Error("Failed assertion: The two versions should be the same");
    }

    const plainParams = cleanBoxParams(boxParams);

    Object.assign(editableBox, plainParams);

    this.#emitWhenBoxIDResolved(editableBox);
  }

  /**
   * Map the unique identifier of an object track to the unique identifier of each of
   * its element bounding boxes.
   */
  #boxIdsByTrackId: CollectionUtils.DefaultMap<UUID, Set<UUID>>;

  /**
   * Gets each bounding box belonging to an object track by its unique identifier.
   *
   * @param id The unique identifier of the object track.
   * @returns The data of each bounding box belonging to the
   * corresponding object track.
   * @throws {Error} If the data is not in the collection.
   */
  getLabelTrackElements(id: UUID): ReadonlySet<ReadonlyLabelBox> {
    const elementIds = this.#boxIdsByTrackId.get(id);
    return new Set(Array.from(elementIds, (boxId) => this.getLabelBox(boxId)));
  }

  /**
   * Handles the event when an object class in the collection has been updated.
   *
   * @param event The event to handle.
   */
  #onClassChange = (event: LabelClassChangeEvent) => {
    const labelClass = event.obj;

    if (event.propertyKey === "id") {
      const prevId = this.#classesById.getKey(labelClass);
      if (prevId == null) {
        throw new Error("Assertion failed: Missing class");
      }

      const id = labelClass.id;

      this.#classesById.delete(prevId);

      this.#classesById.set(id, labelClass);
    }

    this.dispatchEvent({
      type: "class-update",
      obj: labelClass,
      propertyKey: event.propertyKey,
    });
  };

  /**
   * Handles the event when an object track in the collection has been updated.
   *
   * @param event The event to handle.
   */
  #onTrackChange = (event: LabelTrackChangeEvent) => {
    const track = event.obj;

    if (event.propertyKey === "id") {
      const prevTrackId = this.#tracksById.getKey(track);
      if (prevTrackId == null) {
        throw new Error("Assertion failed: Missing track");
      }

      const trackId = track.id;
      const elementIds = this.#boxIdsByTrackId.get(prevTrackId);

      this.#tracksById.delete(prevTrackId);
      this.#boxIdsByTrackId.delete(prevTrackId);

      this.#tracksById.set(trackId, track);
      this.#boxIdsByTrackId.set(trackId, elementIds);
    }

    this.dispatchEvent({
      type: "track-update",
      obj: track,
      propertyKey: event.propertyKey,
    });
  };

  /**
   * Handles the event when a bounding box in the collection has been updated.
   *
   * @param event The event to handle.
   */
  #onBoxChange = (event: LabelBoxChangeEvent) => {
    const box = event.obj;

    if (event.propertyKey === "id") {
      const prevBoxId = this.#boxesById.getKey(box);
      if (prevBoxId == null) {
        throw new Error("Assertion failed: Missing box");
      }

      const boxId = box.id;
      const trackId = box.entityId;

      this.#boxesById.delete(prevBoxId);
      if (trackId != null) {
        this.#boxIdsByTrackId.get(trackId).delete(prevBoxId);
      }

      this.#boxesById.set(boxId, box);
      if (trackId != null) {
        this.#boxIdsByTrackId.get(trackId).add(boxId);
      }
    } else if (event.propertyKey === "entityId") {
      const boxId = box.id;
      const [prevTrackId] = [...this.#boxIdsByTrackId].find(([, boxIds]) =>
        boxIds.has(boxId),
      ) ?? [null];
      const trackId = box.entityId;

      if (prevTrackId != null) {
        this.#boxIdsByTrackId.get(prevTrackId).delete(boxId);
      }

      if (trackId != null) {
        this.#boxIdsByTrackId.get(trackId).add(boxId);
      }
    }

    this.dispatchEvent({
      type: "box-update",
      obj: box,
      propertyKey: event.propertyKey,
    });
  };

  /**
   * Creates a new index for a collection of bounding box labels.
   *
   * @param config The configuration of the application.
   * @param dataParams Parameters to initialize each label
   * in the collection.
   */
  constructor(config: EditorConfig, dataParams: BBoxDataParams) {
    super();

    this.config = config;

    this.#classesById = new BiMap();
    this.#deletedClasses = new BiMap();
    this.#tracksById = new BiMapWithPlaceholderLookup();
    this.#deletedTracks = new BiMapWithPlaceholderLookup();
    this.#boxesById = new BiMapWithPlaceholderLookup();
    this.#deletedBoxes = new BiMapWithPlaceholderLookup();
    this.#boxIdsByTrackId = new DefaultMapWithPlaceholderLookup(
      () => new Set(),
    );

    this.addBulk(dataParams);
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose() {
    this.deleteBulk({
      // Make a copy of the collection before deleting
      classes: [...this.iterLabelClasses()],
      tracks: [...this.iterLabelTracks()],
      boxes: [...this.iterLabelBoxes()],
    });

    this.#deletedBoxes.clear();
    this.#deletedTracks.clear();
    this.#deletedClasses.clear();
  }

  /**
   * Adds multiple items to this collection in bulk.
   *
   * @param params The parameters of each item to add.
   */
  addBulk({
    classes = [],
    boxes = [],
    tracks = [],
  }: {
    classes?: readonly ClassParams[];
    tracks?: readonly TrackParams[];
    boxes?: readonly BoxParams[];
  }) {
    for (const labelClass of classes) {
      this.#addLabelClassOrBulk(labelClass, true);
    }
    for (const track of tracks) {
      // Tracks require classes to be first defined
      this.#addLabelTrackOrBulk(track, true);
    }
    for (const box of boxes) {
      // Boxes require classes and tracks to be first defined
      this.#addLabelBoxOrBulk(box, true);
    }

    this.dispatchEvent({ type: "bulk-add" });
  }

  /**
   * Delete multiple items from this collection in bulk.
   *
   * @param params Each item to delete.
   */
  deleteBulk({
    classes = [],
    boxes = [],
    tracks = [],
  }: {
    classes?: readonly ReadonlyLabelClass[];
    tracks?: readonly ReadonlyLabelTrack[];
    boxes?: readonly ReadonlyLabelBox[];
  }) {
    for (const box of boxes) {
      this.#deleteLabelBoxOrBulk(box, true);
    }
    for (const track of tracks) {
      this.#deleteLabelTrackOrBulk(track, true);
    }
    for (const labelClass of classes) {
      this.#deleteLabelClassOrBulk(labelClass, true);
    }

    this.dispatchEvent({ type: "bulk-delete" });
  }
}

/**
 * Represents a view of an index such that it only includes labels that exists
 * within a set of frames.
 */
export class BBoxIndexView
  extends THREE.EventDispatcher<BBoxIndexEventMap>
  implements BBoxIndex
{
  /**
   * The wrapped index.
   */
  #wrapped: BBoxIndex;

  /**
   * The frames to only include labels for.
   */
  #frames: readonly EditableFrame[];

  /**
   * Tests whether a point exists in the frames to include.
   *
   * @param point The query point.
   * @returns `true` if the given point exists in the frames to include;
   * otherwise, `false`.
   */
  #isPointInFrames(point: THREE.Vector3) {
    return this.#frames.some((frame) => frame.containsPoint(point));
  }

  /**
   * Tests whether a timestamp exists in the frames to include.
   *
   * @param timestamp The query timestamp.
   * @returns `true` if the given timestamp exists in the frames to include;
   * otherwise, `false`.
   */
  #isTimestampInFrames(timestamp: Timestamp | null) {
    return this.#frames.some((frame) => frame.containsTimestamp(timestamp));
  }

  /**
   * Tests whether a bounding box exists in the frames to include.
   *
   * @param box The query bounding box.
   * @returns `true` if the given bounding box exists in the frames to include;
   * otherwise, `false`.
   */
  #isBoxInFrames(box: BoxParams) {
    return (
      this.#isPointInFrames(box.center) &&
      this.#isTimestampInFrames(box.timestamp ?? null)
    );
  }

  /**
   * The configuration of the application.
   */
  get config(): EditorConfig {
    return this.#wrapped.config;
  }

  /**
   * The number of object classes stored in the collection.
   */
  get numLabelClasses(): number {
    return this.#wrapped.numLabelClasses;
  }

  /**
   * Iterates through each object class in the collection.
   *
   * @returns An iterator that yields such items.
   */
  iterLabelClasses(): IterableIterator<ReadonlyLabelClass> {
    return this.#wrapped.iterLabelClasses();
  }

  /**
   * Tests whether an object class exists in the collection.
   *
   * @param id The unique identifier of the object class.
   * @param allowDeleted If `true`, may consider items that have been
   * marked as deleted.
   * @returns `true` if the data is in the collection; otherwise, `false`.
   * @throws {Error} If the data is not in the collection.
   */
  hasLabelClass(id: number, allowDeleted = false): boolean {
    return this.#wrapped.hasLabelClass(id, allowDeleted);
  }

  /**
   * Gets an object class in the collection by its unique identifier.
   *
   * @param id The unique identifier of the object class.
   * @param allowDeleted If `true`, may consider items that have been
   * marked as deleted.
   * @returns The data of the corresponding object class.
   * @throws {Error} If the data is not in the collection.
   */
  getLabelClass(id: number, allowDeleted = false): ReadonlyLabelClass {
    return this.#wrapped.getLabelClass(id, allowDeleted);
  }

  /**
   * Adds an object class to the collection.
   *
   * @param classParams Parameters to initialize the object class.
   * @returns The newly created object class.
   * @throws {Error} If the data is already in the collection.
   */
  addLabelClass(classParams: ClassParams): ReadonlyLabelClass {
    return this.#wrapped.addLabelClass(classParams);
  }

  /**
   * Removes an object class from the collection.
   *
   * @param labelClass The object class to remove.
   * @throws {Error} If the class is not in the collection.
   */
  deleteLabelClass(labelClass: ReadonlyLabelClass): void {
    return this.#wrapped.deleteLabelClass(labelClass);
  }

  /**
   * Updates an object class in the collection.
   *
   * @param labelClass The object class to update.
   * @param classParams Parameters to update the object class.
   * @throws {Error} If the box is not in the collection.
   */
  updateLabelClass(
    labelClass: ReadonlyLabelClass,
    classParams: Partial<ClassParams>,
  ): void {
    return this.#wrapped.updateLabelClass(labelClass, classParams);
  }

  /**
   * The number of object tracks stored in the collection.
   */
  get numLabelTracks(): number {
    return this.#wrapped.numLabelTracks;
  }

  /**
   * Iterates through each object track in the collection.
   *
   * @returns An iterator that yields such items.
   */
  iterLabelTracks(): IterableIterator<ReadonlyLabelTrack> {
    return this.#wrapped.iterLabelTracks();
  }

  /**
   * Tests whether an object track exists in the collection.
   *
   * @param id The unique identifier of the object track.
   * @param allowDeleted If `true`, may consider items that have been
   * marked as deleted.
   * @returns `true` if the data is in the collection; otherwise, `false`.
   * @throws {Error} If the track is not in the collection.
   */
  hasLabelTrack(id: UUID, allowDeleted = false): boolean {
    return this.#wrapped.hasLabelTrack(id, allowDeleted);
  }

  /**
   * Gets an object track in the collection by its unique identifier.
   *
   * @param id The unique identifier of the object track.
   * @param allowDeleted If `true`, may consider items that have been
   * marked as deleted.
   * @returns The data of the corresponding object track.
   * @throws {Error} If the track is not in the collection.
   */
  getLabelTrack(id: UUID, allowDeleted = false): ReadonlyLabelTrack {
    return this.#wrapped.getLabelTrack(id, allowDeleted);
  }

  /**
   * Adds an object track to the collection.
   *
   * @param trackParams Parameters to initialize the object track.
   * @returns The newly created object track.
   * @throws {Error} If the track is already in the collection.
   */
  addLabelTrack(trackParams: TrackParams): LabelTrack {
    return this.#wrapped.addLabelTrack(trackParams);
  }

  /**
   * Removes an object track from the collection.
   *
   * @param track The object track to remove.
   * @throws {Error} If the track is not in the collection.
   */
  deleteLabelTrack(track: ReadonlyLabelTrack): void {
    return this.#wrapped.deleteLabelTrack(track);
  }

  /**
   * Updates an object track in the collection.
   *
   * @param track The object track to update.
   * @param trackParams Parameters to update the object track.
   * @throws {Error} If the track is not in the collection.
   */
  updateLabelTrack(
    track: ReadonlyLabelTrack,
    trackParams: Partial<TrackParams>,
  ): void {
    return this.#wrapped.updateLabelTrack(track, trackParams);
  }

  /**
   * The number of bounding boxes stored in the collection.
   */
  get numLabelBoxes(): number {
    return this.#wrapped.numLabelBoxes;
  }

  /**
   * Iterates through each bounding box in the collection.
   *
   * @returns An iterator that yields such items.
   */
  *iterLabelBoxes(): IterableIterator<ReadonlyLabelBox> {
    for (const box of this.#wrapped.iterLabelBoxes()) {
      if (this.#isBoxInFrames(box)) yield box;
    }
  }

  /**
   * Tests whether a bounding box exists in the collection.
   *
   * @param id The unique identifier of the bounding box.
   * @param allowDeleted If `true`, may consider items that have been
   * marked as deleted.
   * @returns `true` if the data is in the collection; otherwise, `false`.
   * @throws {Error} If the data is not in the collection.
   */
  hasLabelBox(id: UUID, allowDeleted = false): boolean {
    if (!this.#wrapped.hasLabelBox(id, allowDeleted)) return false;

    const box = this.#wrapped.getLabelBox(id, allowDeleted);
    return this.#isBoxInFrames(box);
  }

  /**
   * Gets a bounding box in the collection by its unique identifier.
   *
   * @param id The unique identifier of the bounding box.
   * @param allowDeleted If `true`, may consider items that have been
   * marked as deleted.
   * @returns The data of the corresponding bounding box.
   * @throws {Error} If the data is not in the collection.
   */
  getLabelBox(id: UUID, allowDeleted = false): ReadonlyLabelBox {
    const box = this.#wrapped.getLabelBox(id, allowDeleted);
    if (!this.#isBoxInFrames(box)) {
      throw new Error("The box does not exist in the frame");
    }

    return box;
  }

  /**
   * Adds a bounding box to the collection.
   *
   * @param boxParams Parameters to initialize the bounding box.
   * @returns The newly created bounding box.
   * @throws {Error} If the data is already in the collection.
   */
  addLabelBox(boxParams: BoxParams): ReadonlyLabelBox {
    if (!this.#isBoxInFrames(boxParams)) {
      throw new Error("The box does not exist in the frame");
    }

    return this.#wrapped.addLabelBox(boxParams);
  }

  /**
   * Removes a bounding box from the collection.
   *
   * @param box The bounding box to remove.
   * @throws {Error} If the box is not in the collection.
   */
  deleteLabelBox(box: ReadonlyLabelBox): void {
    if (!this.#isBoxInFrames(box)) {
      throw new Error("The box does not exist in the frame");
    }

    this.#wrapped.deleteLabelBox(box);
  }

  /**
   * Updates a bounding box in the collection.
   *
   * @param box The bounding box to update.
   * @param boxParams Parameters to update the bounding box.
   * @throws {Error} If the box is not in the collection.
   */
  updateLabelBox(box: ReadonlyLabelBox, boxParams: Partial<BoxParams>): void {
    if (!this.#isBoxInFrames(box)) {
      throw new Error("The box does not exist in the frame");
    }

    this.#wrapped.updateLabelBox(box, boxParams);
  }

  /**
   * Gets each bounding box belonging to an object track by its unique identifier.
   *
   * @param id The unique identifier of the object track.
   * @returns The data of each bounding box belonging to the
   * corresponding object track.
   * @throws {Error} If the data is not in the collection.
   */
  getLabelTrackElements(id: UUID): ReadonlySet<ReadonlyLabelBox> {
    return new Set(
      [...this.#wrapped.getLabelTrackElements(id)].filter((box) =>
        this.#isBoxInFrames(box),
      ),
    );
  }

  /**
   * Handles events dispatched by the wrapped index.
   *
   * @param wrappedEvent The event to handle.
   */
  #handleWrappedEvent = <T extends Extract<keyof BBoxIndexEventMap, string>>(
    wrappedEvent: THREE.BaseEvent<T> & BBoxIndexEventMap[T],
  ) => {
    if ("obj" in wrappedEvent) {
      // Avoid forwarding events for objects not shown in this view.
      // Deleted objects have already been removed from the index, so
      // delete events must check visibility with `allowDeleted` or the
      // event would always be dropped here.
      const obj = wrappedEvent.obj;
      const allowDeleted =
        wrappedEvent.type === "box-delete" ||
        wrappedEvent.type === "track-delete" ||
        wrappedEvent.type === "class-delete";
      if (obj instanceof LabelClass) {
        if (!this.hasLabelClass(obj.id, allowDeleted)) return;
      } else if (obj instanceof LabelTrack) {
        if (!this.hasLabelTrack(obj.id, allowDeleted)) return;
      } else if (obj instanceof LabelBox) {
        if (!this.hasLabelBox(obj.id, allowDeleted)) return;
      } else {
        console.warn(`Unhandled object type: ${obj.constructor.name}`);
      }
    }

    this.dispatchEvent({ ...wrappedEvent });
  };

  /**
   * Creates a view of an index such that it only includes labels that exists
   * within a set of frames.
   *
   * Changes to the view are applied to this object, and vice versa.
   *
   * @param wrapped The index to create a view from.
   * @param frames The reference frames.
   */
  constructor(wrapped: BBoxIndex, frames: readonly EditableFrame[]) {
    super();

    this.#wrapped = wrapped;
    this.#frames = frames;

    for (const eventType of ALL_EVENT_TYPES) {
      this.#wrapped.addEventListener(eventType, this.#handleWrappedEvent);
    }
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose() {
    for (const eventType of ALL_EVENT_TYPES) {
      this.#wrapped.removeEventListener(eventType, this.#handleWrappedEvent);
    }
  }
}
