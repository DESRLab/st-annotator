import _ from "lodash";
import * as THREE from "three";
import BiMap from "ts-bidirectional-map";

import type { EditableFrame, EditorConfig } from "sta/app/editor";
import { BiMapWithPlaceholderLookup, Placeholder } from "sta/app/editor";
import { CollectionUtils } from "sta/common";
import type { Timestamp, Expand } from "sta/common";

import { LabelClass } from "./LabelClass";
import type {
  LabelClassParams,
  PropertyChangeEvent as LabelClassChangeEvent,
  ReadonlyLabelClass,
} from "./LabelClass";
import { LabelInstance } from "./LabelInstance";
import type {
  LabelInstanceParams,
  PropertyChangeEvent as LabelInstanceChangeEvent,
  ReadonlyLabelInstance,
} from "./LabelInstance";
import { LabelSelection } from "./LabelSelection";
import type {
  LabelSelectionParams,
  PropertyChangeEvent as LabelSelectionChangeEvent,
  ReadonlyLabelSelection,
} from "./LabelSelection";
import type { UUID } from "./models";

// ─── Derived parameter types ────────────────────────────────────────────────

export type SelectionParams = Omit<LabelSelectionParams, "config" | "labels">;
export type ClassParams = Omit<LabelClassParams, "config" | "labels">;
export type InstanceParams = Omit<LabelInstanceParams, "config" | "labels">;

// ─── Update event types ─────────────────────────────────────────────────────

/** Represents the event when a selection in the collection has been updated. */
export interface SelectionUpdateEvent {
  obj: ReadonlyLabelSelection;
  propertyKey: LabelSelectionChangeEvent["propertyKey"];
}

/** Represents the event when an object class in the collection has been updated. */
export interface ClassUpdateEvent {
  obj: ReadonlyLabelClass;
  propertyKey: LabelClassChangeEvent["propertyKey"];
}

/** Represents the event when an object instance in the collection has been updated. */
export interface InstanceUpdateEvent {
  obj: ReadonlyLabelInstance;
  propertyKey: LabelInstanceChangeEvent["propertyKey"];
}

// ─── Event map ──────────────────────────────────────────────────────────────

/**
 * Defines each event that can be dispatched by {@link SegmentationIndex}.
 *
 * Note that bulk operations do not trigger the more specific events,
 * to avoid unnecessary updating.
 */
export interface SegmentationIndexEventMap {
  "selection-add": { obj: ReadonlyLabelSelection };
  "selection-delete": { obj: ReadonlyLabelSelection };
  "selection-update": SelectionUpdateEvent;
  "selection-resolveId": { obj: ReadonlyLabelSelection };
  "class-add": { obj: ReadonlyLabelClass };
  "class-delete": { obj: ReadonlyLabelClass };
  "class-update": ClassUpdateEvent;
  "instance-add": { obj: ReadonlyLabelInstance };
  "instance-delete": { obj: ReadonlyLabelInstance };
  "instance-update": InstanceUpdateEvent;
  "instance-resolveId": { obj: ReadonlyLabelInstance };
  "bulk-add": {};
  "bulk-delete": {};
}

export const ALL_EVENT_TYPES: readonly Extract<
  keyof SegmentationIndexEventMap,
  string
>[] = [
  "selection-add",
  "selection-delete",
  "selection-update",
  "selection-resolveId",
  "class-add",
  "class-delete",
  "class-update",
  "instance-add",
  "instance-delete",
  "instance-update",
  "instance-resolveId",
  "bulk-add",
  "bulk-delete",
];

// ─── Data params ────────────────────────────────────────────────────────────

export interface SegmentationDataParams {
  classes?: readonly ClassParams[];
  instances?: readonly InstanceParams[];
  selections?: readonly SelectionParams[];
}

// ─── Agent / readonly types ─────────────────────────────────────────────────

export type SegmentationIndex = Expand<
  _SegmentationIndex & THREE.EventDispatcher<SegmentationIndexEventMap>
>;

export type ReadonlySegmentationIndex = Pick<
  SegmentationIndex,
  | keyof THREE.EventDispatcher<SegmentationIndexEventMap>
  | "iterLabelClasses"
  | "hasLabelClass"
  | "getLabelClass"
  | "iterLabelInstances"
  | "hasLabelInstance"
  | "getLabelInstance"
  | "iterLabelInstanceIdsWithElements"
  | "iterLabelSelections"
  | "hasLabelSelection"
  | "getLabelSelection"
  | "getLabelInstanceElements"
>;

// ─── Abstract interface ─────────────────────────────────────────────────────

export interface _SegmentationIndex {
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

  readonly numLabelInstances: number;
  iterLabelInstances(): IterableIterator<ReadonlyLabelInstance>;
  iterLabelInstanceIdsWithElements(): IterableIterator<UUID>;
  hasLabelInstance(id: UUID, allowDeleted?: boolean): boolean;
  getLabelInstance(id: UUID, allowDeleted?: boolean): ReadonlyLabelInstance;
  addLabelInstance(instanceParams: InstanceParams): LabelInstance;
  deleteLabelInstance(instance: ReadonlyLabelInstance): void;
  updateLabelInstance(
    instance: ReadonlyLabelInstance,
    instanceParams: Partial<InstanceParams>,
  ): void;

  readonly numLabelSelections: number;
  iterLabelSelections(): IterableIterator<ReadonlyLabelSelection>;
  hasLabelSelection(id: UUID, allowDeleted?: boolean): boolean;
  getLabelSelection(id: UUID, allowDeleted?: boolean): ReadonlyLabelSelection;
  addLabelSelection(selectionParams: SelectionParams): ReadonlyLabelSelection;
  deleteLabelSelection(selection: ReadonlyLabelSelection): void;
  updateLabelSelection(
    selection: ReadonlyLabelSelection,
    selectionParams: Partial<SelectionParams>,
  ): void;
  getLabelInstanceElements(id: UUID): ReadonlySet<ReadonlyLabelSelection>;
}

// ─── BiMap / DefaultMap with placeholder lookup ─────────────────────────────

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

  #listenToResolve(key: Placeholder<KResolved>): void {
    void key.getAsync().then((resolvedKey: KResolved) => {
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

// ─── Param-cleaning helpers ─────────────────────────────────────────────────

/** Converts `labelClass` into a plain object, so that it can be destructured. */
export function labelClassToPlain(
  labelClass: ReadonlyLabelClass,
): Required<ClassParams> {
  return {
    id: labelClass.id,
    name: labelClass.name,
    selectionColor: labelClass.selectionColor,
  };
}

/** Converts `classParams` into a plain object. */
export function cleanClassParams<T extends Partial<ClassParams>>(
  classParams: T,
): T extends LabelClass ? Required<ClassParams> : T {
  if (classParams instanceof LabelClass)
    // @ts-expect-error - TS cannot narrow the conditional return type here
    return labelClassToPlain(classParams);

  if (!_.isPlainObject(classParams)) {
    console.error(classParams);
    throw new Error("Unable to clean classParams");
  }

  // @ts-expect-error - TS cannot narrow the conditional return type here
  return classParams;
}

/** Converts `instance` into a plain object, so that it can be destructured. */
export function labelInstanceToPlain(
  instance: ReadonlyLabelInstance,
): Required<InstanceParams> {
  return {
    id: instance.id,
    isBlack: instance.isBlack,
    gtClassId: instance.gtClassId,
    minTimestamp: instance.minTimestamp,
    maxTimestamp: instance.maxTimestamp,
  };
}

/** Converts `instanceParams` into a plain object. */
export function cleanInstanceParams<T extends Partial<InstanceParams>>(
  instanceParams: T,
): T extends LabelInstance ? Required<InstanceParams> : T {
  if (instanceParams instanceof LabelInstance)
    // @ts-expect-error - TS cannot narrow the conditional return type here
    return labelInstanceToPlain(instanceParams);

  if (!_.isPlainObject(instanceParams)) {
    console.error(instanceParams);
    throw new Error("Unable to clean instanceParams");
  }

  // @ts-expect-error - TS cannot narrow the conditional return type here
  return instanceParams;
}

/** Converts `selection` into a plain object, so that it can be destructured. */
export function labelSelectionToPlain(
  selection: ReadonlyLabelSelection,
): Required<SelectionParams> {
  return {
    id: selection.id,
    // LabelSelection accepts packed coordinates internally; keeping this
    // buffer packed prevents bulk/background merges from materializing a
    // THREE.Vector3 object for every server-loaded point.
    points: selection.packedPoints as unknown as readonly THREE.Vector3[],
    qualityRank: selection.qualityRank,
    distinctiveLv: selection.distinctiveLv,
    occlusionLv: selection.occlusionLv,
    perceivedClassId: selection.perceivedClassId,
    entityId: selection.entityId,
    timestamp: selection.timestamp,
    showPointSize: selection.showPointSize,
    opacity: selection.opacity,
    showPerceivedClass: selection.showPerceivedClass,
    showColor: selection.showColor,
    showCenter: selection.showCenter,
  };
}

/** Converts `selectionParams` into a plain object. */
export function cleanSelectionParams<T extends Partial<SelectionParams>>(
  selectionParams: T,
): T extends LabelSelection ? Required<SelectionParams> : T {
  if (selectionParams instanceof LabelSelection)
    // @ts-expect-error - TS cannot narrow the conditional return type here
    return labelSelectionToPlain(selectionParams);

  if (!_.isPlainObject(selectionParams)) {
    console.error(selectionParams);
    throw new Error("Unable to clean selectionParams");
  }

  // @ts-expect-error - TS cannot narrow the conditional return type here
  return selectionParams;
}

// ─── BaseSegmentationIndex ──────────────────────────────────────────────────

/**
 * Indexes a collection of segmentation labels.
 *
 * The index updates automatically whenever a change is made to a label created through an
 * `add` method of that index.
 */
export class BaseSegmentationIndex
  extends THREE.EventDispatcher<SegmentationIndexEventMap>
  implements SegmentationIndex
{
  /** The configuration of the application. */
  readonly config: EditorConfig;

  /** Indexes each object class in the collection by its unique identifier. */
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

  getLabelClass(id: number, allowDeleted = false): ReadonlyLabelClass {
    return this.#getLabelClass(id, allowDeleted);
  }

  #addLabelClass(labelClass: LabelClass): void {
    const id = labelClass.id;

    this.#classesById.set(id, labelClass);

    labelClass.addEventListener("change", this.#onClassChange);
  }

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

  addLabelClass(classParams: ClassParams): ReadonlyLabelClass {
    return this.#addLabelClassOrBulk(classParams, false);
  }

  #deleteLabelClass(labelClass: LabelClass): void {
    const id = labelClass.id;

    for (const selection of this.iterLabelSelections()) {
      if (selection.perceivedClassId === id) {
        throw new Error(
          `Cannot delete class with ID: ${id}. It is used by the selection with ID: ${selection.id}`,
        );
      }
    }

    for (const instance of this.iterLabelInstances()) {
      if (instance.gtClassId === id) {
        throw new Error(
          `Cannot delete class with ID: ${id}. It is used by the instance with ID: ${instance.id}`,
        );
      }
    }

    this.#classesById.delete(id);
    this.#deletedClasses.set(id, labelClass);

    labelClass.removeEventListener("change", this.#onClassChange);
  }

  #deleteLabelClassOrBulk(
    labelClass: ReadonlyLabelClass,
    isBulk: boolean,
  ): void {
    const id = labelClass.id;

    // Throw the error at the beginning (if the instance does not exist)
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

  deleteLabelClass(labelClass: ReadonlyLabelClass): void {
    this.#deleteLabelClassOrBulk(labelClass, false);
  }

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

  /** Indexes each object instance in the collection by its unique identifier. */
  #instancesById: BiMap<UUID, LabelInstance>;

  #deletedInstances: BiMap<UUID, LabelInstance>;

  get numLabelInstances(): number {
    return this.#instancesById.size;
  }

  iterLabelInstances(): IterableIterator<ReadonlyLabelInstance> {
    return this.#instancesById.values();
  }

  *iterLabelInstanceIdsWithElements(): IterableIterator<UUID> {
    for (const [id, selectionIds] of this.#selectionIdsByInstanceId) {
      if (selectionIds.size > 0) yield id;
    }
  }

  hasLabelInstance(id: UUID, allowDeleted = false): boolean {
    return (
      this.#instancesById.has(id) ||
      (allowDeleted && this.#deletedInstances.has(id))
    );
  }

  #getLabelInstance(id: UUID, allowDeleted = false): LabelInstance {
    const result =
      this.#instancesById.get(id) ??
      (allowDeleted ? this.#deletedInstances.get(id) : null);

    if (result == null) {
      throw new Error(`There is no instance with the given ID: ${id}`);
    } else if (result.labels !== this) {
      throw new Error(`Instance not registered to index. ID: ${id}`);
    }

    return result;
  }

  getLabelInstance(id: UUID, allowDeleted = false): ReadonlyLabelInstance {
    return this.#getLabelInstance(id, allowDeleted);
  }

  #emitWhenInstanceIDResolved(instance: LabelInstance): void {
    const instanceId = instance.id;
    if (Placeholder.isPlaceholder(instanceId)) {
      void instanceId.getAsync().then((resolvedId) => {
        // This check is in case another ID has been assigned to the object
        // Also, we test with the Placeholder object, not the resolved value
        if (
          instance.id !== instanceId ||
          this.#instancesById.get(instanceId) !== instance
        )
          return;

        const loadedDuplicate = this.#instancesById.get(resolvedId);
        if (loadedDuplicate != null && loadedDuplicate !== instance) {
          const placeholderSelections =
            this.#selectionIdsByInstanceId.get(instanceId);
          const concreteEntry = [...this.#selectionIdsByInstanceId].find(
            ([id]) => id === resolvedId,
          );
          if (concreteEntry != null) {
            for (const selectionId of concreteEntry[1])
              placeholderSelections.add(selectionId);
            this.#selectionIdsByInstanceId.delete(resolvedId);
          }
          this.#instancesById.deleteValue(loadedDuplicate);
          loadedDuplicate.removeEventListener("change", this.#onInstanceChange);
          loadedDuplicate.dispose();
        }

        this.dispatchEvent({ type: "instance-resolveId", obj: instance });
      });
    }
  }

  #addLabelInstance(instance: LabelInstance): void {
    const id = instance.id;

    for (const [
      selectionId,
      { entityId: instanceId },
    ] of this.#selectionsById.entries()) {
      if (instanceId === id) {
        this.#selectionIdsByInstanceId.get(instanceId).add(selectionId);
      }
    }
    this.#instancesById.set(id, instance);

    instance.addEventListener("change", this.#onInstanceChange);
  }

  #addLabelInstanceOrBulk(
    instanceParams: InstanceParams,
    isBulk: boolean,
  ): LabelInstance {
    const id = instanceParams.id;

    // Throw the error at the beginning so that a failed operation does not mutate the mapping
    if (this.#instancesById.has(id)) {
      throw new Error(
        `There already exists a instance with the given ID: ${id}`,
      );
    }

    const plainParams = cleanInstanceParams(instanceParams);

    // Initialize after validation so we don't have to dispose if validation fails
    // Override config/labels since that is not considered part of the parameters
    const instance = new LabelInstance({
      ...plainParams,
      config: this.config,
      labels: this,
    });
    this.#addLabelInstance(instance);
    instance.render();

    this.#emitWhenInstanceIDResolved(instance);

    if (!isBulk) {
      this.dispatchEvent({ type: "instance-add", obj: instance });
    }

    return instance;
  }

  addLabelInstance(instanceParams: InstanceParams): LabelInstance {
    return this.#addLabelInstanceOrBulk(instanceParams, false);
  }

  #deleteLabelInstance(instance: LabelInstance): void {
    const id = instance.id;

    for (const selection of this.iterLabelSelections()) {
      if (selection.entityId === id) {
        throw new Error(
          `Cannot delete instance with ID: ${id}. It is used by the selection with ID: ${selection.id}`,
        );
      }
    }

    this.#selectionIdsByInstanceId.delete(id);
    this.#instancesById.delete(id);
    this.#deletedInstances.set(id, instance);

    instance.removeEventListener("change", this.#onInstanceChange);
  }

  #deleteLabelInstanceOrBulk(
    instance: ReadonlyLabelInstance,
    isBulk: boolean,
  ): void {
    const id = instance.id;

    // Throw the error at the beginning (if the instance does not exist)
    // so that a failed operation does not mutate the mapping
    const editableInstance = this.#getLabelInstance(id);
    if (editableInstance !== instance) {
      throw new Error(`Incorrect instance for instance with ID: ${id}`);
    }

    this.#deleteLabelInstance(editableInstance);
    editableInstance.dispose();

    if (!isBulk) {
      this.dispatchEvent({ type: "instance-delete", obj: instance });
    }
  }

  deleteLabelInstance(instance: ReadonlyLabelInstance): void {
    this.#deleteLabelInstanceOrBulk(instance, false);
  }

  updateLabelInstance(
    instance: ReadonlyLabelInstance,
    instanceParams: Partial<InstanceParams>,
  ): void {
    const editableInstance = this.#instancesById.get(instance.id);
    if (editableInstance !== instance) {
      throw new Error("Failed assertion: The two versions should be the same");
    }

    const plainParams = cleanInstanceParams(instanceParams);

    Object.assign(editableInstance, plainParams);

    this.#emitWhenInstanceIDResolved(editableInstance);
  }

  /** Indexes each selection in the collection by its unique identifier. */
  #selectionsById: BiMap<UUID, LabelSelection>;

  #deletedSelections: BiMap<UUID, LabelSelection>;

  get numLabelSelections(): number {
    return this.#selectionsById.size;
  }

  iterLabelSelections(): IterableIterator<ReadonlyLabelSelection> {
    return this.#selectionsById.values();
  }

  hasLabelSelection(id: UUID, allowDeleted = false): boolean {
    return (
      this.#selectionsById.has(id) ||
      (allowDeleted && this.#deletedSelections.has(id))
    );
  }

  #getLabelSelection(id: UUID, allowDeleted = false): LabelSelection {
    const result =
      this.#selectionsById.get(id) ??
      (allowDeleted ? this.#deletedSelections.get(id) : null);

    if (result == null) {
      throw new Error(`There is no selection with the given ID: ${id}`);
    } else if (result.labels !== this) {
      throw new Error(`Selection not registered to index. ID: ${id}`);
    }

    return result;
  }

  getLabelSelection(id: UUID, allowDeleted = false): ReadonlyLabelSelection {
    return this.#getLabelSelection(id, allowDeleted);
  }

  #emitWhenSelectionIDResolved(selection: LabelSelection): void {
    const selectionId = selection.id;
    if (Placeholder.isPlaceholder(selectionId)) {
      void selectionId.getAsync().then((resolvedId) => {
        // This check is in case another ID has been assigned to the object
        // Also, we test with the Placeholder object, not the resolved value
        if (
          selection.id !== selectionId ||
          this.#selectionsById.get(selectionId) !== selection
        )
          return;

        // A background load can observe the committed server row before the
        // create response resolves this placeholder. In that ordering the
        // bulk merge has already installed a second object under `resolvedId`.
        // The placeholder result is the authoritative identity relationship,
        // so retain the locally edited object and discard the loaded snapshot.
        const loadedDuplicate = this.#selectionsById.get(resolvedId);
        if (loadedDuplicate != null && loadedDuplicate !== selection) {
          const duplicateInstanceId = loadedDuplicate.entityId;
          if (duplicateInstanceId != null) {
            this.#selectionIdsByInstanceId
              .get(duplicateInstanceId)
              .delete(resolvedId);
          }
          // Delete by value: once the placeholder resolves, key-based
          // deletion intentionally aliases `resolvedId` back to the local
          // placeholder and would remove the object we are preserving.
          this.#selectionsById.deleteValue(loadedDuplicate);
          loadedDuplicate.removeEventListener(
            "change",
            this.#onSelectionChange,
          );
          loadedDuplicate.dispose();
        }

        this.dispatchEvent({
          type: "selection-resolveId",
          obj: selection,
        });
      });
    }
  }

  #addLabelSelection(selection: LabelSelection): void {
    const id = selection.id;

    const instanceId = selection.entityId;
    if (instanceId != null) {
      this.#selectionIdsByInstanceId.get(instanceId).add(id);
    }

    this.#selectionsById.set(id, selection);

    selection.addEventListener("change", this.#onSelectionChange);
  }

  #addLabelSelectionOrBulk(
    selectionParams: SelectionParams,
    isBulk: boolean,
  ): ReadonlyLabelSelection {
    const id = selectionParams.id;

    // Throw the error at the beginning so that a failed operation does not mutate the mapping
    if (this.#selectionsById.has(id)) {
      throw new Error(
        `There already exists a selection with the given ID: ${id}`,
      );
    }

    const plainParams = cleanSelectionParams(selectionParams);

    // Initialize after validation so we don't have to dispose if validation fails
    // Override config/labels since that is not considered part of the parameters
    const selection = new LabelSelection({
      ...plainParams,
      config: this.config,
      labels: this,
    });
    this.#addLabelSelection(selection);

    selection.render();

    this.#emitWhenSelectionIDResolved(selection);

    if (!isBulk) {
      this.dispatchEvent({ type: "selection-add", obj: selection });
    }

    return selection;
  }

  addLabelSelection(selectionParams: SelectionParams): ReadonlyLabelSelection {
    return this.#addLabelSelectionOrBulk(selectionParams, false);
  }

  #deleteLabelSelection(selection: LabelSelection): void {
    const id = selection.id;

    const instanceId = selection.entityId;
    if (instanceId != null) {
      this.#selectionIdsByInstanceId.get(instanceId).delete(id);
    }

    this.#selectionsById.delete(id);
    this.#deletedSelections.set(id, selection);

    selection.removeEventListener("change", this.#onSelectionChange);
  }

  #deleteLabelSelectionOrBulk(
    selection: ReadonlyLabelSelection,
    isBulk: boolean,
  ): void {
    const id = selection.id;

    // Throw the error at the beginning (if the selection does not exist)
    // so that a failed operation does not mutate the mapping
    const editableSelection = this.#getLabelSelection(id);
    if (editableSelection !== selection) {
      throw new Error(`Incorrect instance for instance with ID: ${id}`);
    }

    this.#deleteLabelSelection(editableSelection);
    editableSelection.dispose();

    if (!isBulk) {
      this.dispatchEvent({ type: "selection-delete", obj: selection });
    }
  }

  deleteLabelSelection(selection: ReadonlyLabelSelection): void {
    this.#deleteLabelSelectionOrBulk(selection, false);
  }

  updateLabelSelection(
    selection: ReadonlyLabelSelection,
    selectionParams: Partial<SelectionParams>,
  ): void {
    const editableSelection = this.#selectionsById.get(selection.id);
    if (editableSelection !== selection) {
      throw new Error("Failed assertion: The two versions should be the same");
    }

    const plainParams = cleanSelectionParams(selectionParams);

    Object.assign(editableSelection, plainParams);

    this.#emitWhenSelectionIDResolved(editableSelection);
  }

  /** Map the unique identifier of an object instance to the unique identifier of each of its selections. */
  #selectionIdsByInstanceId: CollectionUtils.DefaultMap<UUID, Set<UUID>>;

  getLabelInstanceElements(id: UUID): ReadonlySet<ReadonlyLabelSelection> {
    const elementIds = this.#selectionIdsByInstanceId.get(id);

    return new Set(
      Array.from(elementIds, (selectionId: UUID) =>
        this.getLabelSelection(selectionId),
      ),
    );
  }

  #onClassChange = (event: LabelClassChangeEvent): void => {
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

  #onInstanceChange = (event: LabelInstanceChangeEvent): void => {
    const instance = event.obj;

    if (event.propertyKey === "id") {
      const prevInstanceId = this.#instancesById.getKey(instance);
      if (prevInstanceId == null) {
        throw new Error("Assertion failed: Missing instance");
      }

      const instanceId = instance.id;
      const elementIds = this.#selectionIdsByInstanceId.get(prevInstanceId);

      this.#instancesById.delete(prevInstanceId);
      this.#selectionIdsByInstanceId.delete(prevInstanceId);

      this.#instancesById.set(instanceId, instance);
      this.#selectionIdsByInstanceId.set(instanceId, elementIds);
    }

    this.dispatchEvent({
      type: "instance-update",
      obj: instance,
      propertyKey: event.propertyKey,
    });
  };

  #onSelectionChange = (event: LabelSelectionChangeEvent): void => {
    const selection = event.obj;

    if (event.propertyKey === "id") {
      const prevSelectionId = this.#selectionsById.getKey(selection);
      if (prevSelectionId == null) {
        throw new Error("Assertion failed: Missing selection");
      }

      const selectionId = selection.id;
      const instanceId = selection.entityId;

      this.#selectionsById.delete(prevSelectionId);
      if (instanceId != null) {
        this.#selectionIdsByInstanceId.get(instanceId).delete(prevSelectionId);
      }

      this.#selectionsById.set(selectionId, selection);
      if (instanceId != null) {
        this.#selectionIdsByInstanceId.get(instanceId).add(selectionId);
      }
    } else if (event.propertyKey === "entityId") {
      const selectionId = selection.id;
      const [prevInstanceId] = [...this.#selectionIdsByInstanceId].find(
        ([, selectionIds]) => selectionIds.has(selectionId),
      ) ?? [null];
      const instanceId = selection.entityId;

      if (prevInstanceId != null) {
        this.#selectionIdsByInstanceId.get(prevInstanceId).delete(selectionId);
      }

      if (instanceId != null) {
        this.#selectionIdsByInstanceId.get(instanceId).add(selectionId);
      }
    }

    this.dispatchEvent({
      type: "selection-update",
      obj: selection,
      propertyKey: event.propertyKey,
    });
  };

  constructor(config: EditorConfig, dataParams: SegmentationDataParams = {}) {
    super();

    this.config = config;

    this.#classesById = new BiMap();
    this.#deletedClasses = new BiMap();
    this.#instancesById = new BiMapWithPlaceholderLookup();
    this.#deletedInstances = new BiMapWithPlaceholderLookup();
    this.#selectionsById = new BiMapWithPlaceholderLookup();
    this.#deletedSelections = new BiMapWithPlaceholderLookup();
    this.#selectionIdsByInstanceId = new DefaultMapWithPlaceholderLookup(
      () => new Set(),
    );

    this.addBulk(dataParams);
  }

  dispose(): void {
    this.deleteBulk({
      // Make a copy of the collection before deleting
      classes: [...this.iterLabelClasses()],
      instances: [...this.iterLabelInstances()],
      selections: [...this.iterLabelSelections()],
    });

    this.#deletedSelections.clear();
    this.#deletedInstances.clear();
    this.#deletedClasses.clear();
  }

  addBulk(params: {
    classes?: readonly ClassParams[];
    instances?: readonly InstanceParams[];
    selections?: readonly SelectionParams[];
  }): void {
    const { classes = [], selections = [], instances = [] } = params;
    for (const labelClass of classes) {
      this.#addLabelClassOrBulk(labelClass, true);
    }
    for (const instance of instances) {
      // Instances require classes to be first defined
      this.#addLabelInstanceOrBulk(instance, true);
    }
    for (const selection of selections) {
      // Selections require classes and instances to be first defined
      this.#addLabelSelectionOrBulk(selection, true);
    }

    this.dispatchEvent({ type: "bulk-add" });
  }

  deleteBulk(params: {
    classes?: readonly ReadonlyLabelClass[];
    instances?: readonly ReadonlyLabelInstance[];
    selections?: readonly ReadonlyLabelSelection[];
  }): void {
    const { classes = [], selections = [], instances = [] } = params;
    for (const selection of selections) {
      this.#deleteLabelSelectionOrBulk(selection, true);
    }
    for (const instance of instances) {
      this.#deleteLabelInstanceOrBulk(instance, true);
    }
    for (const labelClass of classes) {
      this.#deleteLabelClassOrBulk(labelClass, true);
    }

    this.dispatchEvent({ type: "bulk-delete" });
  }
}

// ─── SegmentationIndexView ──────────────────────────────────────────────────

/**
 * Represents a view of an index such that it only includes labels that exists
 * within a set of frames.
 */
export class SegmentationIndexView
  extends THREE.EventDispatcher<SegmentationIndexEventMap>
  implements SegmentationIndex
{
  /** The wrapped index. */
  #wrapped: SegmentationIndex;

  /** The frames to only include labels for. */
  #frames: readonly EditableFrame[];

  /** Instance IDs referenced by the selections visible in this frame window. */
  #labelInstanceIdsWithElements = new Set<UUID>();
  #visibleSelectionEntities = new Map<UUID, UUID>();
  #visibleInstanceRefCounts = new Map<UUID, number>();

  #removeVisibleSelection(selectionId: UUID): void {
    const entityId = this.#visibleSelectionEntities.get(selectionId);
    if (entityId == null) return;
    this.#visibleSelectionEntities.delete(selectionId);
    const count = (this.#visibleInstanceRefCounts.get(entityId) ?? 1) - 1;
    if (count === 0) {
      this.#visibleInstanceRefCounts.delete(entityId);
      this.#labelInstanceIdsWithElements.delete(entityId);
    } else {
      this.#visibleInstanceRefCounts.set(entityId, count);
    }
  }

  #addVisibleSelection(selection: ReadonlyLabelSelection): void {
    if (selection.entityId == null || !this.#isSelectionInFrames(selection))
      return;
    this.#visibleSelectionEntities.set(selection.id, selection.entityId);
    const count =
      (this.#visibleInstanceRefCounts.get(selection.entityId) ?? 0) + 1;
    this.#visibleInstanceRefCounts.set(selection.entityId, count);
    this.#labelInstanceIdsWithElements.add(selection.entityId);
  }

  #refreshLabelInstanceIdsWithElements(): void {
    this.#labelInstanceIdsWithElements.clear();
    this.#visibleSelectionEntities.clear();
    this.#visibleInstanceRefCounts.clear();
    for (const selection of this.iterLabelSelections()) {
      this.#addVisibleSelection(selection);
    }
  }

  #arePointsInFrame(
    points: readonly THREE.Vector3[],
    frame: EditableFrame,
  ): boolean {
    return points.some((point) => frame.containsPoint(point));
  }

  #arePackedPointsInFrame(points: Float32Array, frame: EditableFrame): boolean {
    const point = new THREE.Vector3();
    for (let index = 0; index < points.length; index += 3) {
      point.set(points[index], points[index + 1], points[index + 2]);
      if (frame.containsPoint(point)) return true;
    }
    return false;
  }

  #anyPointsInFrames(points: readonly THREE.Vector3[]): boolean {
    return this.#frames.some((frame) => this.#arePointsInFrame(points, frame));
  }

  #isTimestampInFrames(timestamp: Timestamp | null): boolean {
    return this.#frames.some((frame) => frame.containsTimestamp(timestamp));
  }

  #isSelectionInFrames(selection: SelectionParams): boolean {
    const labelSelection = selection as SelectionParams & {
      packedPoints?: Float32Array;
    };
    const isSpatiallyIncluded =
      labelSelection.packedPoints == null
        ? this.#anyPointsInFrames(selection.points)
        : this.#frames.some((frame) =>
            this.#arePackedPointsInFrame(labelSelection.packedPoints!, frame),
          );
    return (
      isSpatiallyIncluded &&
      this.#isTimestampInFrames(selection.timestamp ?? null)
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

  get numLabelInstances(): number {
    return this.#wrapped.numLabelInstances;
  }

  iterLabelInstances(): IterableIterator<ReadonlyLabelInstance> {
    return this.#wrapped.iterLabelInstances();
  }

  iterLabelInstanceIdsWithElements(): IterableIterator<UUID> {
    return this.#labelInstanceIdsWithElements.values();
  }

  hasLabelInstance(id: UUID, allowDeleted = false): boolean {
    return this.#wrapped.hasLabelInstance(id, allowDeleted);
  }

  getLabelInstance(id: UUID, allowDeleted = false): ReadonlyLabelInstance {
    return this.#wrapped.getLabelInstance(id, allowDeleted);
  }

  addLabelInstance(instanceParams: InstanceParams): LabelInstance {
    return this.#wrapped.addLabelInstance(instanceParams);
  }

  deleteLabelInstance(instance: ReadonlyLabelInstance): void {
    return this.#wrapped.deleteLabelInstance(instance);
  }

  updateLabelInstance(
    instance: ReadonlyLabelInstance,
    instanceParams: Partial<InstanceParams>,
  ): void {
    return this.#wrapped.updateLabelInstance(instance, instanceParams);
  }

  get numLabelSelections(): number {
    return this.#wrapped.numLabelSelections;
  }

  *iterLabelSelections(): IterableIterator<ReadonlyLabelSelection> {
    for (const selection of this.#wrapped.iterLabelSelections()) {
      if (this.#isSelectionInFrames(selection)) yield selection;
    }
  }

  hasLabelSelection(id: UUID, allowDeleted = false): boolean {
    if (!this.#wrapped.hasLabelSelection(id, allowDeleted)) return false;

    const selection = this.#wrapped.getLabelSelection(id, allowDeleted);
    return this.#isSelectionInFrames(selection);
  }

  getLabelSelection(id: UUID, allowDeleted = false): ReadonlyLabelSelection {
    const selection = this.#wrapped.getLabelSelection(id, allowDeleted);
    if (!this.#isSelectionInFrames(selection)) {
      throw new Error("The selection does not exist in the frame");
    }

    return selection;
  }

  addLabelSelection(selectionParams: SelectionParams): ReadonlyLabelSelection {
    if (!this.#isSelectionInFrames(selectionParams)) {
      throw new Error("The selection does not exist in the frame");
    }

    return this.#wrapped.addLabelSelection(selectionParams);
  }

  deleteLabelSelection(selection: ReadonlyLabelSelection): void {
    if (!this.#isSelectionInFrames(selection)) {
      throw new Error("The selection does not exist in the frame");
    }

    this.#wrapped.deleteLabelSelection(selection);
  }

  updateLabelSelection(
    selection: ReadonlyLabelSelection,
    selectionParams: Partial<SelectionParams>,
  ): void {
    if (!this.#isSelectionInFrames(selection)) {
      throw new Error("The selection does not exist in the frame");
    }

    this.#wrapped.updateLabelSelection(selection, selectionParams);
  }

  getLabelInstanceElements(id: UUID): ReadonlySet<ReadonlyLabelSelection> {
    return new Set(
      [...this.#wrapped.getLabelInstanceElements(id)].filter((selection) =>
        this.#isSelectionInFrames(selection),
      ),
    );
  }

  #handleWrappedEvent = (
    wrappedEvent: THREE.Event &
      SegmentationIndexEventMap[keyof SegmentationIndexEventMap],
  ): void => {
    if (
      wrappedEvent.type === "bulk-add" ||
      wrappedEvent.type === "bulk-delete" ||
      wrappedEvent.type === "selection-resolveId"
    ) {
      this.#refreshLabelInstanceIdsWithElements();
    } else if (
      wrappedEvent.type === "selection-add" ||
      wrappedEvent.type === "selection-delete" ||
      wrappedEvent.type === "selection-update"
    ) {
      const selection = (wrappedEvent as { obj: ReadonlyLabelSelection }).obj;
      this.#removeVisibleSelection(selection.id);
      if (wrappedEvent.type !== "selection-delete") {
        this.#addVisibleSelection(selection);
      }
    }

    if ("obj" in wrappedEvent) {
      // Avoid forwarding events for objects not shown in this view.
      // Deleted objects have already been removed from the index, so
      // delete events must check visibility with `allowDeleted` or the
      // event would always be dropped here.
      const obj = (wrappedEvent as { obj: unknown }).obj;
      const allowDeleted =
        wrappedEvent.type === "selection-delete" ||
        wrappedEvent.type === "instance-delete" ||
        wrappedEvent.type === "class-delete";
      if (obj instanceof LabelClass) {
        if (!this.hasLabelClass(obj.id, allowDeleted)) return;
      } else if (obj instanceof LabelInstance) {
        if (!this.hasLabelInstance(obj.id, allowDeleted)) return;
      } else if (obj instanceof LabelSelection) {
        if (!this.hasLabelSelection(obj.id, allowDeleted)) return;
      } else {
        console.warn(
          `Unhandled object type: ${(obj as object).constructor.name}`,
        );
      }
    }

    this.dispatchEvent({ ...wrappedEvent } as THREE.BaseEvent<
      Extract<keyof SegmentationIndexEventMap, string>
    > &
      SegmentationIndexEventMap[Extract<
        keyof SegmentationIndexEventMap,
        string
      >]);
  };

  constructor(wrapped: SegmentationIndex, frames: readonly EditableFrame[]) {
    super();

    this.#wrapped = wrapped;
    this.#frames = frames;
    this.#refreshLabelInstanceIdsWithElements();

    for (const eventType of ALL_EVENT_TYPES) {
      this.#wrapped.addEventListener(eventType, this.#handleWrappedEvent);
    }
  }

  dispose(): void {
    for (const eventType of ALL_EVENT_TYPES) {
      this.#wrapped.removeEventListener(eventType, this.#handleWrappedEvent);
    }
  }
}
