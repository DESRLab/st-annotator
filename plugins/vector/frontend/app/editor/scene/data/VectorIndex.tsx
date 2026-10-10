import _ from "lodash";
import * as THREE from "three";
import BiMap from "ts-bidirectional-map";

import { BiMapWithPlaceholderLookup, Placeholder } from "sta/app/editor";
import type { EditableFrame, EditorConfig } from "sta/app/editor";
import type { Timestamp, Expand } from "sta/common";

import type {
  LabelClassParams,
  PropertyChangeEvent as LabelClassChangeEvent,
  ReadonlyLabelClass,
} from "./LabelClass";
import { LabelClass } from "./LabelClass";
import type {
  LabelVectorParams,
  PropertyChangeEvent as LabelVectorChangeEvent,
  ReadonlyLabelVector,
} from "./LabelVector";
import { LabelVector } from "./LabelVector";
import type { UUID } from "./models";

/**
 * @see VectorIndex
 */
export interface _VectorIndex {
  readonly config: EditorConfig;

  readonly numLabelClasses: number;

  iterLabelClasses(): IterableIterator<ReadonlyLabelClass>;

  hasLabelClass(id: number, allowDeleted?: boolean): boolean;

  getLabelClass(id: number, allowDeleted?: boolean): ReadonlyLabelClass;

  addLabelClass(classParams: ClassParams): ReadonlyLabelClass;

  deleteLabelClass(labelClass: ReadonlyLabelClass): void;

  updateLabelClass(
    labelClass: ReadonlyLabelClass,
    classParams: Partial<ClassParams>,
  ): void;

  readonly numLabelVectors: number;

  iterLabelVectors(): IterableIterator<ReadonlyLabelVector>;

  hasLabelVector(id: UUID, allowDeleted?: boolean): boolean;

  getLabelVector(id: UUID, allowDeleted?: boolean): ReadonlyLabelVector;

  addLabelVector(vectorParams: VectorParams): LabelVector;

  deleteLabelVector(vector: ReadonlyLabelVector): void;

  updateLabelVector(
    vector: ReadonlyLabelVector,
    vectorParams: Partial<VectorParams>,
  ): void;
}

export type VectorParams = Omit<LabelVectorParams, "config" | "labels">;

export type ClassParams = Omit<LabelClassParams, "config" | "labels">;

export interface VectorUpdateEvent {
  obj: ReadonlyLabelVector;
  propertyKey: LabelVectorChangeEvent["propertyKey"];
}

export interface ClassUpdateEvent {
  obj: ReadonlyLabelClass;
  propertyKey: LabelClassChangeEvent["propertyKey"];
}

export interface VectorIndexEventMap {
  "vector-add": { obj: ReadonlyLabelVector };
  "vector-delete": { obj: ReadonlyLabelVector };
  "vector-update": VectorUpdateEvent;
  "vector-resolveId": { obj: ReadonlyLabelVector };
  "class-add": { obj: ReadonlyLabelClass };
  "class-delete": { obj: ReadonlyLabelClass };
  "class-update": ClassUpdateEvent;
  "bulk-add": {};
  "bulk-delete": {};
}

export const ALL_EVENT_TYPES: readonly Extract<
  keyof VectorIndexEventMap,
  string
>[] = [
  "vector-add",
  "vector-delete",
  "vector-update",
  "vector-resolveId",
  "class-add",
  "class-delete",
  "class-update",
  "bulk-add",
  "bulk-delete",
];

export interface VectorDataParams {
  classes?: readonly ClassParams[];
  vectors?: readonly VectorParams[];
}

export type VectorLabelsData = Required<VectorDataParams>;

export type VectorIndex = Expand<
  _VectorIndex & THREE.EventDispatcher<VectorIndexEventMap>
>;

export type ReadonlyVectorIndex = Pick<
  VectorIndex,
  | keyof THREE.EventDispatcher<VectorIndexEventMap>
  | "iterLabelClasses"
  | "hasLabelClass"
  | "getLabelClass"
  | "iterLabelVectors"
  | "hasLabelVector"
  | "getLabelVector"
>;

export function labelClassToPlain(
  labelClass: ReadonlyLabelClass,
): Required<ClassParams> {
  return {
    id: labelClass.id,
    name: labelClass.name,
    vectorColor: labelClass.vectorColor,
  };
}

/**
 * Returns a plain copy of the given class parameters.
 *
 * Live labels are accepted as well, since bulk operations may copy labels
 * from another index; they are converted to plain parameter records.
 */
export function cleanClassParams(
  classParams: ReadonlyLabelClass,
): Required<ClassParams>;
export function cleanClassParams<T extends Partial<ClassParams>>(
  classParams: T,
): T;
export function cleanClassParams(
  classParams: Partial<ClassParams>,
): Partial<ClassParams> {
  if (classParams instanceof LabelClass) return labelClassToPlain(classParams);

  if (!_.isPlainObject(classParams)) {
    console.error(classParams);
    throw new Error("Unable to clean classParams");
  }

  return classParams;
}

export function labelVectorToPlain(
  vector: ReadonlyLabelVector,
): Required<VectorParams> {
  return {
    id: vector.id,
    vertices: vector.vertices,
    gtClassId: vector.gtClassId,
    timestamp: vector.timestamp,
    vectorType: vector.vectorType,
    showColor: vector.showColor,
  };
}

/**
 * Returns a plain copy of the given vector parameters.
 *
 * Live labels are accepted as well, since bulk operations may copy labels
 * from another index; they are converted to plain parameter records.
 */
export function cleanVectorParams(
  vectorParams: ReadonlyLabelVector,
): Required<VectorParams>;
export function cleanVectorParams<T extends Partial<VectorParams>>(
  vectorParams: T,
): T;
export function cleanVectorParams(
  vectorParams: Partial<VectorParams>,
): Partial<VectorParams> {
  if (vectorParams instanceof LabelVector)
    return labelVectorToPlain(vectorParams);

  if (!_.isPlainObject(vectorParams)) {
    console.error(vectorParams);
    throw new Error("Unbale to clean vectorParams");
  }

  return vectorParams;
}

export class BaseVectorIndex extends THREE.EventDispatcher<VectorIndexEventMap> {
  readonly config: EditorConfig;

  #classesById: BiMap<number, LabelClass>;

  #deletedClasses: BiMap<number, LabelClass>;

  get numLabelClasses(): number {
    return this.#classesById.size;
  }

  iterLabelClasses(): IterableIterator<ReadonlyLabelClass> {
    return this.#classesById.values();
  }

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

  getLabelClass(id: number, allowDeleted = false): LabelClass {
    return this.#getLabelClass(id, allowDeleted);
  }

  #addLabelClass(labelClass: LabelClass) {
    const id = labelClass.id;

    this.#classesById.set(id, labelClass);

    labelClass.addEventListener("change", this.#onClassChange);
  }

  #addLabelClassOrBulk(
    classParams: ClassParams,
    isBulk: boolean,
  ): ReadonlyLabelClass {
    const id = classParams.id;

    if (this.#classesById.has(id)) {
      throw new Error(`There already exists a class with the given ID: ${id}`);
    }

    const plainParams = cleanClassParams(classParams);

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

  addLabelClass(classParams: ClassParams): ReadonlyLabelClass {
    return this.#addLabelClassOrBulk(classParams, false);
  }

  #deleteLabelClass(labelClass: LabelClass) {
    const id = labelClass.id;

    for (const vector of this.iterLabelVectors()) {
      if (vector.gtClassId === id) {
        throw new Error(
          `Cannot delete class with ID: ${id}. It is used by the vector with ID: ${vector.id}`,
        );
      }
    }

    this.#classesById.delete(id);
    this.#deletedClasses.set(id, labelClass);

    labelClass.removeEventListener("change", this.#onClassChange);
  }

  #deleteLabelClassOrBulk(labelClass: ReadonlyLabelClass, isBulk: boolean) {
    const id = labelClass.id;

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

  deleteLabelClass(labelClass: ReadonlyLabelClass) {
    this.#deleteLabelClassOrBulk(labelClass, false);
  }

  updateLabelClass(
    labelClass: ReadonlyLabelClass,
    classParams: Partial<ClassParams>,
  ) {
    const editableClass = this.#classesById.get(labelClass.id);
    if (editableClass !== labelClass) {
      throw new Error("Failed assertion: The two versions should be the same");
    }

    const plainParams = cleanClassParams(classParams);

    Object.assign(editableClass, plainParams);
  }

  #vectorsById: BiMapWithPlaceholderLookup<string, LabelVector>;

  #deletedVectors: BiMapWithPlaceholderLookup<string, LabelVector>;

  get numLabelVectors(): number {
    return this.#vectorsById.size;
  }

  iterLabelVectors(): IterableIterator<ReadonlyLabelVector> {
    return this.#vectorsById.values();
  }

  hasLabelVector(id: UUID, allowDeleted = false): boolean {
    return (
      this.#vectorsById.has(id) ||
      (allowDeleted && this.#deletedVectors.has(id))
    );
  }

  #getLabelVector(id: UUID, allowDeleted = false): LabelVector {
    const result =
      this.#vectorsById.get(id) ??
      (allowDeleted ? this.#deletedVectors.get(id) : null);

    if (result == null) {
      throw new Error(`There is no vector with the given ID: ${id}`);
    } else if (result.labels !== this) {
      throw new Error(`Vector not registered to index. ID: ${id}`);
    }

    return result;
  }

  getLabelVector(id: UUID, allowDeleted = false): ReadonlyLabelVector {
    return this.#getLabelVector(id, allowDeleted);
  }

  #emitWhenVectorIDResolved(vector: LabelVector) {
    const vectorId = vector.id;
    if (vectorId != null && Placeholder.isPlaceholder(vectorId)) {
      void vectorId.getAsync().then((resolvedId) => {
        if (
          vector.id !== vectorId ||
          this.#vectorsById.get(vectorId) !== vector
        )
          return;

        const loadedDuplicate = this.#vectorsById.get(resolvedId);
        if (loadedDuplicate != null && loadedDuplicate !== vector) {
          this.#vectorsById.deleteValue(loadedDuplicate);
          loadedDuplicate.removeEventListener("change", this.#onVectorChange);
          loadedDuplicate.dispose();
        }

        this.dispatchEvent({ type: "vector-resolveId", obj: vector });
      });
    }
  }

  #addLabelVector(vector: LabelVector) {
    const id = vector.id;
    this.#vectorsById.set(id, vector);

    vector.addEventListener("change", this.#onVectorChange);
  }

  #addLabelVectorOrBulk(
    vectorParams: VectorParams,
    isBulk: boolean,
  ): LabelVector {
    const id = vectorParams.id;

    if (this.#vectorsById.has(id)) {
      throw new Error(`There already exists a track with the given ID: ${id}`);
    }

    const plainParams = cleanVectorParams(vectorParams);
    const vector = new LabelVector({
      ...plainParams,
      config: this.config,
      labels: this,
    });

    this.#addLabelVector(vector);
    vector.render();

    this.#emitWhenVectorIDResolved(vector);

    if (!isBulk) {
      this.dispatchEvent({ type: "vector-add", obj: vector });
    }

    return vector;
  }

  addLabelVector(vectorParams: VectorParams): LabelVector {
    return this.#addLabelVectorOrBulk(vectorParams, false);
  }

  #deleteLabelVector(vector: LabelVector) {
    const id = vector.id;

    if (!this.#vectorsById.has(id)) {
      throw new Error(
        `Cannot delete vector with ID: ${id}. the object does not exists`,
      );
    }

    this.#vectorsById.delete(id);
    this.#deletedVectors.set(id, vector);

    vector.removeEventListener("change", this.#onVectorChange);
  }

  #deleteLabelVectororBulk(vector: ReadonlyLabelVector, isBulk: boolean) {
    const id = vector.id;

    const editableVector = this.#getLabelVector(id);
    if (editableVector !== vector) {
      throw new Error(`Incorrect instance for vector with ID: ${id}`);
    }

    this.#deleteLabelVector(editableVector);
    editableVector.dispose();

    if (!isBulk) {
      this.dispatchEvent({ type: "vector-delete", obj: vector });
    }
  }

  deleteLabelVector(vector: ReadonlyLabelVector) {
    this.#deleteLabelVectororBulk(vector, false);
  }

  updateLabelVector(
    vector: ReadonlyLabelVector,
    vectorParams: Partial<VectorParams>,
  ) {
    const editableVector = this.#vectorsById.get(vector.id);

    if (editableVector !== vector) {
      throw new Error("Failed assertion: The two versions should be the same");
    }

    const plainParams = cleanVectorParams(vectorParams);

    Object.assign(editableVector, plainParams);

    this.#emitWhenVectorIDResolved(editableVector);
  }

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

  #onVectorChange = (event: LabelVectorChangeEvent) => {
    const vector = event.obj;

    if (event.propertyKey === "id") {
      const prevVectorId = this.#vectorsById.getKey(vector);
      if (prevVectorId == null) {
        throw new Error("Assertion failed: Missing vector");
      }

      const vectorId = vector.id;

      this.#vectorsById.delete(prevVectorId);
      this.#vectorsById.set(vectorId, vector);
    }

    this.dispatchEvent({
      type: "vector-update",
      obj: vector,
      propertyKey: event.propertyKey,
    });
  };

  constructor(config: EditorConfig, dataParams: VectorDataParams) {
    super();

    this.config = config;

    this.#classesById = new BiMap();
    this.#deletedClasses = new BiMap();

    this.#vectorsById = new BiMapWithPlaceholderLookup<string, LabelVector>();
    this.#deletedVectors = new BiMapWithPlaceholderLookup<
      string,
      LabelVector
    >();

    this.addBulk(dataParams);
  }

  dispose() {
    this.deleteBulk({
      classes: [...this.iterLabelClasses()],
      vectors: [...this.iterLabelVectors()],
    });

    this.#deletedVectors.clear();
    this.#deletedClasses.clear();
  }

  addBulk({
    classes = [],
    vectors = [],
  }: {
    classes?: readonly ClassParams[];
    vectors?: readonly VectorParams[];
  }) {
    for (const labelClass of classes) {
      this.#addLabelClassOrBulk(labelClass, true);
    }

    for (const vector of vectors) {
      this.#addLabelVectorOrBulk(vector, true);
    }

    this.dispatchEvent({ type: "bulk-add" });
  }

  /**
   * Adds multiple items to this collection in bulk.
   *
   * @param params The parameters of each item to add.
   */
  deleteBulk({
    classes = [],
    vectors = [],
  }: {
    classes?: readonly ReadonlyLabelClass[];
    vectors?: readonly ReadonlyLabelVector[];
  }) {
    for (const labelClass of classes) {
      this.#deleteLabelClassOrBulk(labelClass, true);
    }

    for (const vector of vectors) {
      this.#deleteLabelVectororBulk(vector, true);
    }

    this.dispatchEvent({ type: "bulk-delete" });
  }
}

export class VectorIndexView
  extends THREE.EventDispatcher<VectorIndexEventMap>
  implements VectorIndex
{
  #wrapped: VectorIndex;

  #frames: readonly EditableFrame[];

  #arePointsInFrame(
    points: readonly THREE.Vector3[],
    frame: EditableFrame,
  ): boolean {
    return points.some((point: THREE.Vector3) => frame.containsPoint(point));
  }

  #anyPointsInFrames(points: readonly THREE.Vector3[]): boolean {
    return this.#frames.some((frame: EditableFrame) =>
      this.#arePointsInFrame(points, frame),
    );
  }

  #isTimestampInFrames(timestamp: Timestamp | null): boolean {
    return this.#frames.some((frame: EditableFrame) =>
      frame.containsTimestamp(timestamp),
    );
  }

  #isVectorInFrames(vector: VectorParams): boolean {
    return (
      this.#anyPointsInFrames(vector.vertices) &&
      this.#isTimestampInFrames(vector.timestamp ?? null)
    );
  }

  get config(): EditorConfig {
    return this.#wrapped.config;
  }

  get numLabelClasses(): number {
    return this.#wrapped.numLabelClasses;
  }

  iterLabelClasses(): IterableIterator<ReadonlyLabelClass> {
    return this.#wrapped.iterLabelClasses();
  }

  hasLabelClass(id: number, allowDeleted = false): boolean {
    return this.#wrapped.hasLabelClass(id, allowDeleted);
  }

  getLabelClass(id: number, allowDeleted = false): ReadonlyLabelClass {
    return this.#wrapped.getLabelClass(id, allowDeleted);
  }

  addLabelClass(classParams: ClassParams): ReadonlyLabelClass {
    return this.#wrapped.addLabelClass(classParams);
  }

  deleteLabelClass(labelClass: ReadonlyLabelClass): void {
    return this.#wrapped.deleteLabelClass(labelClass);
  }

  updateLabelClass(
    labelClass: ReadonlyLabelClass,
    classParams: Partial<ClassParams>,
  ): void {
    return this.#wrapped.updateLabelClass(labelClass, classParams);
  }

  get numLabelVectors(): number {
    return this.#wrapped.numLabelVectors;
  }

  hasLabelVector(id: UUID, allowDeleted = false): boolean {
    if (!this.#wrapped.hasLabelVector(id, allowDeleted)) return false;

    const vector = this.#wrapped.getLabelVector(id, allowDeleted);
    return this.#isVectorInFrames(vector);
  }

  getLabelVector(id: UUID, allowDeleted = false): ReadonlyLabelVector {
    const vector = this.#wrapped.getLabelVector(id, allowDeleted);
    if (!this.#isVectorInFrames(vector)) {
      throw new Error("The vector does not exist in the frame");
    }
    return vector;
  }

  addLabelVector(vectorParams: VectorParams): LabelVector {
    if (!this.#isVectorInFrames(vectorParams)) {
      throw new Error("The vector does not exist in the frame");
    }

    return this.#wrapped.addLabelVector(vectorParams);
  }

  deleteLabelVector(vector: ReadonlyLabelVector): void {
    if (!this.#isVectorInFrames(vector)) {
      throw new Error("The vector does not exist in the frame");
    }

    this.#wrapped.deleteLabelVector(vector);
  }

  updateLabelVector(
    vector: ReadonlyLabelVector,
    vectorParams: Partial<VectorParams>,
  ): void {
    if (!this.#isVectorInFrames(vector)) {
      throw new Error("The vector does not exist in the frame");
    }

    this.#wrapped.updateLabelVector(vector, vectorParams);
  }

  *iterLabelVectors(): IterableIterator<ReadonlyLabelVector> {
    for (const vector of this.#wrapped.iterLabelVectors()) {
      if (this.#isVectorInFrames(vector)) yield vector;
    }
  }

  #handleWrappedEvent = (wrappedEvent: any) => {
    if ("obj" in wrappedEvent) {
      const obj = wrappedEvent.obj;
      // Deleted objects have already been removed from the index, so
      // delete events must check visibility with `allowDeleted` or the
      // event would always be dropped here.
      const allowDeleted =
        wrappedEvent.type === "vector-delete" ||
        wrappedEvent.type === "class-delete";
      if (obj instanceof LabelClass) {
        if (!this.hasLabelClass(obj.id, allowDeleted)) return;
      } else if (obj instanceof LabelVector) {
        if (!this.hasLabelVector(obj.id, allowDeleted)) return;
      } else {
        console.warn(`Unhandled object type: ${obj.constructor.name}`);
      }
    }

    this.dispatchEvent({ ...wrappedEvent });
  };

  constructor(wrapped: VectorIndex, frames: readonly EditableFrame[]) {
    super();

    this.#wrapped = wrapped;
    this.#frames = frames;

    for (const eventType of ALL_EVENT_TYPES) {
      this.#wrapped.addEventListener(eventType, this.#handleWrappedEvent);
    }
  }

  dispose() {
    for (const eventType of ALL_EVENT_TYPES) {
      this.#wrapped.removeEventListener(eventType, this.#handleWrappedEvent);
    }
  }
}
