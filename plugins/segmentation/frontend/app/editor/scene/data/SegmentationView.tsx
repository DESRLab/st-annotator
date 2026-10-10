import _ from "lodash";
import type * as THREE from "three";
import * as Collections from "typescript-collections";

import type {
  SceneContext,
  DownloadProgressListener,
  EditableFrame,
} from "sta/app/editor";
import {
  BaseOperation,
  LabelDataView,
  Placeholder,
  WindowDataLoader,
} from "sta/app/editor";
import { TypeUtils, type Timestamp } from "sta/common";

import type { QualityLevel } from "../../../../models";

import type { ReadonlyLabelClass } from "./LabelClass";
import type { ReadonlyLabelInstance } from "./LabelInstance";
import type { ReadonlyLabelSelection } from "./LabelSelection";
import {
  BaseSegmentationIndex,
  SegmentationIndexView,
  cleanSelectionParams,
  cleanInstanceParams,
} from "./SegmentationIndex";
import type {
  SelectionParams,
  InstanceParams,
  ReadonlySegmentationIndex,
  SegmentationIndex,
} from "./SegmentationIndex";
import { SegmentationLookup } from "./SegmentationLookup";
import type { SegmentationData } from "./SegmentationLookup";
import { SelectionOps, InstanceOps, StaleTargetError } from "./labelset";
import type { SegmentationOperation } from "./labelset";
import type { UUID } from "./models";

/** Constructor contract for the operation wrapper exposed by {@link SegmentationView}. */
export type SegmentationViewOperationConstructor = new (
  dataView: SegmentationView,
  op: SegmentationOperation<any, any>,
) => BaseOperation<SegmentationView, any, any>;

/**
 * Given a frame, loads object instanceing labels composed from the data for that single frame
 * as well as that for neighbouring frames.
 */
export class SegmentationLoader extends WindowDataLoader<
  BaseSegmentationIndex,
  SegmentationData
> {
  /**
   * Finds the data for each frame.
   */
  lookup: SegmentationLookup;

  /**
   * Creates a new data loader for a sliding window of frames.
   */
  constructor(
    lookup: SegmentationLookup,
    context: SceneContext<any>,
    timePathRange: number,
  ) {
    super(lookup, context, timePathRange);

    this.lookup = lookup;
  }

  /**
   * Combines the data from individual frames into a window.
   */
  combineData(windowData: readonly SegmentationData[]): BaseSegmentationIndex {
    // De-duplicate model instances
    const classesById = new Map(
      windowData
        .flatMap(({ classes }) => classes)
        .map((labelClass) => [labelClass.id, labelClass]),
    );
    const instancesById = new Map(
      windowData
        .flatMap(({ instances }) => instances)
        .map((instance) => [instance.id, instance]),
    );
    const selectionsById = new Map(
      windowData
        .flatMap(({ selections }) => selections)
        .map((map) => [map.id, map]),
    );
    const aggData = {
      classes: [...classesById.values()],
      instances: [...instancesById.values()],
      selections: [...selectionsById.values()],
    };

    return new BaseSegmentationIndex(this.lookup.receiver.config, aggData);
  }
}

/**
 * Represents a collection of object instanceing labels. Any changes to the labels through
 * this class are also applied to the backend.
 */
export class SegmentationView extends LabelDataView<ReadonlySegmentationIndex> {
  /**
   * Loads the data from the backend on demand.
   */
  #loader: SegmentationLoader;

  /**
   * The maximum number of frames on either side of the active frame in the
   * time-sorted path for which to display labels.
   */
  get timePathRange(): number {
    return this.#loader.timePathRange;
  }

  set timePathRange(value: number) {
    if (this.#loader.timePathRange === value) return;

    this.#loader.timePathRange = value;

    void this._reloadData();
  }

  /**
   * Returns each timestamp for which to display the labels, omitting `null` values.
   */
  #getTimestampsInRange(): Timestamp[] {
    const framesInWindow =
      this.frame == null ? [] : this.#loader.getFramesInWindow(this.frame);

    return framesInWindow
      .flatMap(({ st_bounds: stBounds }) => [
        stBounds.min_timestamp,
        stBounds.max_timestamp,
      ])
      .filter(TypeUtils.isNotNull);
  }

  /**
   * Returns the minimum timestamp for which to display the labels.
   */
  getMinTimestampInRange(): Timestamp | null {
    return _.minBy(this.#getTimestampsInRange(), (ts) => ts.getTime()) ?? null;
  }

  /**
   * Returns the minimum timestamp for which to display the labels.
   */
  getMaxTimestampInRange(): Timestamp | null {
    return _.maxBy(this.#getTimestampsInRange(), (ts) => ts.getTime()) ?? null;
  }

  /**
   * For each branch, contains all of the labels that have been loaded so far.
   *
   * This is used to ensure that labels loaded from the server do not
   * overwrite the local changes.
   */
  #branchIndexes: Collections.DefaultDictionary<number, BaseSegmentationIndex>;

  #mergeIntoBranch(
    frame: EditableFrame,
    data: ReadonlySegmentationIndex,
  ): BaseSegmentationIndex {
    if (!this.#branchIndexes.containsKey(frame.label_branch_id)) {
      const loadedIndex = data as BaseSegmentationIndex;
      this.#branchIndexes.setValue(frame.label_branch_id, loadedIndex);
      return loadedIndex;
    }
    const branchData = this.#branchIndexes.getValue(frame.label_branch_id);
    branchData.addBulk({
      classes: [...data.iterLabelClasses()].filter(
        (labelClass) => !branchData.hasLabelClass(labelClass.id, true),
      ),
      instances: [...data.iterLabelInstances()].filter(
        (instance) => !branchData.hasLabelInstance(instance.id, true),
      ),
      selections: [...data.iterLabelSelections()].filter(
        (selection) => !branchData.hasLabelSelection(selection.id, true),
      ),
    });
    return branchData;
  }

  #onBackgroundLoad = (
    frame: EditableFrame,
    data: BaseSegmentationIndex,
  ): void => {
    if (this.frame?.id !== frame.id) return;
    this.#mergeIntoBranch(frame, data);
  };

  /**
   * Requests that data be loaded in memory for a frame, and returns it.
   */
  async getData(
    frame: EditableFrame,
    signal?: AbortSignal,
    onProgress?: DownloadProgressListener,
  ): Promise<ReadonlySegmentationIndex | null> {
    const data = await super.getData(frame, signal, onProgress);
    if (data == null) return null;

    const branchData = this.#mergeIntoBranch(frame, data);

    const validFrames = this.#loader.getFramesInWindow(frame);
    return new SegmentationIndexView(branchData, validFrames);
  }

  get #index(): SegmentationIndex | null {
    const index = this.data;
    if (index == null) return null;

    // We avoid exposing the modifiable version to external classes
    return index as SegmentationIndex;
  }

  #emptyIndex: SegmentationIndex;

  get #indexWithFallback(): SegmentationIndex {
    return this.#index ?? this.#emptyIndex;
  }

  /**
   * Tests whether the given selection is still the live label behind its id
   * in the currently displayed data. A stale control (a callback captured
   * while the selection existed) may invoke an operation after it was
   * deleted, or after its id was reused by another data revision; such an
   * operation must apply to the accepted label or not at all.
   */
  #isLiveSelection(selection: ReadonlyLabelSelection): boolean {
    const index = this.#index;
    return (
      index != null &&
      index.hasLabelSelection(selection.id) &&
      index.getLabelSelection(selection.id) === selection
    );
  }

  /**
   * Tests whether the given instance is still the live label behind its id
   * in the currently displayed data; see {@link SegmentationView.#isLiveSelection}.
   */
  #isLiveInstance(instance: ReadonlyLabelInstance): boolean {
    const index = this.#index;
    return (
      index != null &&
      index.hasLabelInstance(instance.id) &&
      index.getLabelInstance(instance.id) === instance
    );
  }

  /**
   * Iterates through each object class in this collection.
   */
  iterLabelClasses(): IterableIterator<ReadonlyLabelClass> {
    return this.#indexWithFallback.iterLabelClasses();
  }

  /**
   * Tests whether an object class exists in this collection.
   */
  hasLabelClass(id: number): boolean {
    return this.#indexWithFallback.hasLabelClass(id);
  }

  /**
   * Gets an object class in this collection by its unique identifier.
   */
  getLabelClass(id: number): ReadonlyLabelClass {
    return this.#indexWithFallback.getLabelClass(id);
  }

  /**
   * Iterates through each a selection in this collection.
   */
  iterLabelSelections(): IterableIterator<ReadonlyLabelSelection> {
    return this.#indexWithFallback.iterLabelSelections();
  }

  /**
   * Tests whether a selection exists in this collection.
   */
  hasLabelSelection(id: UUID): boolean {
    return this.#indexWithFallback.hasLabelSelection(id);
  }

  /**
   * Gets a selection in this collection by its unique identifier.
   */
  getLabelSelection(id: UUID): ReadonlyLabelSelection {
    return this.#indexWithFallback.getLabelSelection(id);
  }

  /**
   * Iterates through each object instance in this collection.
   */
  iterLabelInstances(): IterableIterator<ReadonlyLabelInstance> {
    return this.#indexWithFallback.iterLabelInstances();
  }

  /** Iterates precomputed IDs for instances referenced in the active frame window. */
  iterLabelInstanceIdsWithElements(): IterableIterator<UUID> {
    return this.#indexWithFallback.iterLabelInstanceIdsWithElements();
  }

  /**
   * Tests whether an object instance exists in this collection.
   */
  hasLabelInstance(id: UUID): boolean {
    return this.#indexWithFallback.hasLabelInstance(id);
  }

  /**
   * Gets an object instance in this collection by its unique identifier.
   */
  getLabelInstance(id: UUID): ReadonlyLabelInstance {
    return this.#indexWithFallback.getLabelInstance(id);
  }

  /**
   * Creates a new view of object instanceing labels that updates based on the active frame.
   */
  static create(
    context: SceneContext<any>,
    timePathRange: number,
  ): SegmentationView {
    const { config, views } = context;
    const lookup = SegmentationLookup.create(config, views);
    const loader = new SegmentationLoader(lookup, context, timePathRange);

    return new SegmentationView(loader, context);
  }

  /**
   * Creates a new view of object instanceing labels that updates based on the active frame.
   */
  constructor(loader: SegmentationLoader, context: SceneContext<any>) {
    super(loader, context);

    this.#loader = loader;

    const config = loader.lookup.receiver.config;
    this.#branchIndexes = new Collections.DefaultDictionary<
      number,
      BaseSegmentationIndex
    >(
      () => new BaseSegmentationIndex(config, {}),
      (id) => id.toString(),
    );
    this.#emptyIndex = new BaseSegmentationIndex(config, {});
    this.#loader.addBackgroundLoadListener(this.#onBackgroundLoad);
  }

  override dispose(): void {
    this.#loader.removeBackgroundLoadListener(this.#onBackgroundLoad);
    super.dispose();
  }

  #localSelections = new Set<ReadonlyLabelSelection>();

  /**
   * Constructs a selection, adding it to this collection.
   *
   * Unlike `addLabelSelection`, the remote dataset remains unaffected.
   *
   * Items added in this way can only be deleted through `deleteLabelSelectionLocalOnly`.
   */
  addLabelSelectionLocalOnly(
    params: Omit<SelectionParams, "id">,
  ): ReadonlyLabelSelection {
    if (this.#index == null) {
      console.error(this);
      throw new Error("There is no index to add the selection to");
    }

    const selection = this.#index.addLabelSelection({
      id: new Placeholder(),
      ...cleanSelectionParams(params),
    });
    this.#localSelections.add(selection);

    return selection;
  }

  /**
   * Removes a selection from this collection.
   *
   * Unlike `deleteLabelSelection`, the remote dataset remains unaffected.
   *
   * This method can only delete items added through `addLabelSelectionLocalOnly`.
   */
  deleteLabelSelectionLocalOnly(selection: ReadonlyLabelSelection): void {
    if (this.#index == null) {
      console.error(this);
      throw new Error("There is no index to delete the selection from");
    }

    if (!this.#localSelections.has(selection)) {
      console.error(selection);
      throw new Error(
        "This selection was not constructed through addLabelSelectionLocalOnly",
      );
    }

    this.#index.deleteLabelSelection(selection);
    this.#localSelections.delete(selection);
  }

  /**
   * Sets the display parameters of an object instance.
   *
   * This method can be used to update items added through both
   * `addLabelInstance` and `addLabelInstanceLocalOnly`.
   */
  setLabelInstanceDisplayParams(
    instance: ReadonlyLabelInstance,
    params: Pick<Partial<InstanceParams>, "minTimestamp" | "maxTimestamp">,
  ): void {
    if (this.#index == null) {
      console.error(this);
      throw new Error("There is no index to update the instance for");
    }

    instance.setDisplayRange(
      params.minTimestamp ?? null,
      params.maxTimestamp ?? null,
    );
  }

  /**
   * Sets the display parameters of a selection.
   *
   * This method can be used to update items added through both
   * `addLabelSelection` and `addLabelSelectionLocalOnly`.
   */
  setLabelSelectionDisplayParams(
    selection: ReadonlyLabelSelection,
    params: Pick<
      Partial<SelectionParams>,
      | "showPointSize"
      | "showColor"
      | "showCenter"
      | "showPerceivedClass"
      | "opacity"
    >,
  ): void {
    if (this.#index == null) {
      console.error(this);
      throw new Error("There is no index to update the selection for");
    }

    selection.setDisplayOptions(params);
  }

  #localInstances = new Set<ReadonlyLabelInstance>();

  /**
   * Constructs an object instance, adding it to this collection.
   *
   * Unlike `addLabelInstance`, the remote dataset remains unaffected.
   *
   * Items added in this way can only be deleted through `deleteLabelInstanceLocalOnly`.
   */
  addLabelInstanceLocalOnly(
    params: Omit<InstanceParams, "id">,
  ): ReadonlyLabelInstance {
    if (this.#index == null) {
      console.error(this);
      throw new Error("There is no index to add the instance to");
    }

    const instance = this.#index.addLabelInstance({
      id: new Placeholder(),
      ...cleanInstanceParams(params),
    });
    this.#localInstances.add(instance);

    return instance;
  }

  /**
   * Removes an object instance from this collection.
   *
   * Unlike `deleteLabelInstance`, the remote dataset remains unaffected.
   *
   * This method can only delete items added through `addLabelInstanceLocalOnly`.
   */
  deleteLabelInstanceLocalOnly(instance: ReadonlyLabelInstance): void {
    if (this.#index == null) {
      console.error(this);
      throw new Error("There is no index to delete the instance from");
    }

    if (!this.#localInstances.has(instance)) {
      console.error(instance);
      throw new Error(
        "This selection was not constructed through addLabelInstanceLocalOnly",
      );
    }

    this.#index.deleteLabelInstance(instance);
    this.#localInstances.delete(instance);
  }

  static Operation: SegmentationViewOperationConstructor =
    /**
     * Abstract base implementation of Operation.
     */
    class<P, R extends {} | null> extends BaseOperation<
      SegmentationView,
      P,
      R
    > {
      /**
       * The wrapped operation.
       */
      op: SegmentationOperation<P, R>;

      /**
       * The display name of this operation.
       */
      get displayName(): string {
        return this.op.displayName;
      }

      /**
       * The name of this operation, which is sent to the backend.
       */
      get opName(): string {
        return this.op.opName;
      }

      /**
       * The result of this operation, expressed as a Placeholder.
       *
       * It is resolved with the value returned from the backend after it is pushed there.
       */
      get opResult(): Placeholder<R> | null {
        return this.op.opResult;
      }

      /**
       * The labels index this operation was accepted against. The
       * operation applies to this revision even if the view navigates
       * to another frame/branch before the queued application runs, so
       * it can never be redirected to another revision's labels.
       */
      readonly #acceptedIndex: SegmentationIndex | null;

      /**
       * `true` if the latest application of this operation was skipped
       * because its target disappeared; its undo must then be a no-op
       * as well, so the branch history can always be undone/redone.
       */
      #skippedStale = false;

      /**
       * Creates a new operation by wrapping an operation that acts on
       * object instanceing labels.
       */
      constructor(dataView: SegmentationView, op: SegmentationOperation<P, R>) {
        super(dataView, op.opParams);

        this.op = op;
        this.#acceptedIndex = dataView.#index;
      }

      /**
       * Applies this operation to the local data.
       *
       * The operation applies to the data revision it was accepted
       * against, never to whichever revision is current when the queued
       * application finally runs. An operation whose target label
       * disappeared (e.g. deleted by a preceding queued operation) is
       * skipped deterministically instead of throwing, so it cannot
       * corrupt the branch history.
       */
      applyLocal(): void {
        // We apply the operation in this roundabout way to avoid exposing
        // the mutable index
        const index = this.dataView.#index;
        if (index == null) {
          console.warn(
            "Attempted to apply operation when there is no available data:",
          );
          console.warn(this);
          return;
        }

        try {
          this.op.applyIndex(this.#acceptedIndex ?? index);
        } catch (error) {
          if (error instanceof StaleTargetError) {
            console.warn("Skipped operation whose target label disappeared:");
            console.warn(this);
            this.#skippedStale = true;
            return;
          }

          throw error;
        }

        this.#skippedStale = false;
      }

      /**
       * Reverts the changes applied by this operation to the local data.
       */
      undoLocal(): void {
        // We apply the operation in this roundabout way to avoid exposing
        // the mutable index
        const index = this.dataView.#index;
        if (index == null) {
          console.warn(
            "Attempted to apply operation when there is no available data:",
          );
          console.warn(this);
          return;
        }

        if (this.#skippedStale) {
          // The application was a no-op, so there is nothing to revert.
          return;
        }

        // Revert on the same revision the operation applied to.
        this.op.undoIndex(this.#acceptedIndex ?? index);
      }
    };

  /**
   * Constructs a selection, adding it to this collection.
   */
  async addLabelSelection(
    params: Omit<SelectionParams, "id">,
  ): Promise<ReadonlyLabelSelection> {
    const createOp = SelectionOps.Create.fromParams(params);
    const op = new SegmentationView.Operation(this, createOp);

    await this.currentBranch?.apply(op);

    const selection = createOp.newSelection;
    if (selection === undefined) {
      throw new Error("Failed to apply operation");
    }

    return selection;
  }

  /**
   * Assigns an object instance to a selection in this collection.
   *
   * This is a deterministic no-op if the selection or the instance is no
   * longer live (e.g. a stale control invoked this after either was deleted).
   */
  async updateLabelSelectionParentInstance(
    selection: ReadonlyLabelSelection,
    instance: ReadonlyLabelInstance | null,
  ): Promise<void> {
    if (!this.#isLiveSelection(selection)) return;
    if (instance != null && !this.#isLiveInstance(instance)) return;

    const updateOp = SelectionOps.AssignEntity.fromParams(selection, instance);
    const op = new SegmentationView.Operation(this, updateOp);

    await this.currentBranch?.apply(op);
  }

  /**
   * Assigns an object class to a selection in this collection.
   *
   * This is a deterministic no-op if the selection is no longer live
   * (e.g. a stale control invoked this after it was deleted).
   */
  async updateLabelSelectionPerceivedClass(
    selection: ReadonlyLabelSelection,
    labelClass: ReadonlyLabelClass | null,
  ): Promise<void> {
    if (!this.#isLiveSelection(selection)) return;

    const updateOp = SelectionOps.AssignClass.fromParams(selection, labelClass);
    const op = new SegmentationView.Operation(this, updateOp);

    await this.currentBranch?.apply(op);
  }

  /**
   * Assigns a distinctiveness level to a selection in this collection.
   *
   * This is a deterministic no-op if the selection is no longer live
   * (e.g. a stale control invoked this after it was deleted).
   */
  async updateLabelSelectionDistinctiveLv(
    selection: ReadonlyLabelSelection,
    distinctiveLv: QualityLevel,
  ): Promise<void> {
    if (!this.#isLiveSelection(selection)) return;

    const updateOp = SelectionOps.AssignDistinctiveLv.fromParams(
      selection,
      distinctiveLv,
    );
    const op = new SegmentationView.Operation(this, updateOp);

    await this.currentBranch?.apply(op);
  }

  /**
   * Assigns an occlusion level to a selection in this collection.
   *
   * This is a deterministic no-op if the selection is no longer live
   * (e.g. a stale control invoked this after it was deleted).
   */
  async updateLabelSelectionOcclusionLv(
    selection: ReadonlyLabelSelection,
    occlusionLv: QualityLevel,
  ): Promise<void> {
    if (!this.#isLiveSelection(selection)) return;

    const updateOp = SelectionOps.AssignOcclusionLv.fromParams(
      selection,
      occlusionLv,
    );
    const op = new SegmentationView.Operation(this, updateOp);

    await this.currentBranch?.apply(op);
  }

  /**
   * Registers that a selection in this collection has been transformed.
   *
   * This is a deterministic no-op if the selection is no longer live
   * (e.g. a stale control invoked this after it was deleted).
   */
  async updateLabelPointSelection(
    selection: ReadonlyLabelSelection,
    mode: string,
    newPoints: readonly Readonly<THREE.Vector3>[],
  ): Promise<ReadonlyLabelSelection | null> {
    if (!this.#isLiveSelection(selection)) return null;

    const updateOp = SelectionOps.EditPointSelection.fromParams(
      selection,
      mode,
      { points: newPoints },
    );
    const op = new SegmentationView.Operation(this, updateOp);

    await this.currentBranch?.apply(op);

    // The operation was accepted against this exact object. It may have
    // moved outside the displayed frame window as a result of the edit, but
    // callers still need its identity to re-establish their UI state. The
    // transition's own identity guard rejects it if a reload or deletion
    // replaced the target.
    return selection;
  }

  /**
   * Removes a selection from this collection.
   *
   * This is a deterministic no-op if the selection is no longer live
   * (e.g. a stale control invoked this after it was already deleted).
   */
  async deleteLabelSelection(selection: ReadonlyLabelSelection): Promise<void> {
    if (!this.#isLiveSelection(selection)) return;

    const deleteOp = SelectionOps.Delete.fromParams(selection);
    const op = new SegmentationView.Operation(this, deleteOp);

    await this.currentBranch?.apply(op);
  }

  /**
   * Constructs an object instance, and adds it to this collection.
   */
  async addLabelInstance(
    params: Omit<InstanceParams, "id">,
  ): Promise<ReadonlyLabelInstance> {
    const createOp = InstanceOps.Create.fromParams(params);
    const op = new SegmentationView.Operation(this, createOp);

    await this.currentBranch?.apply(op);

    const instance = createOp.newInstance;
    if (instance === undefined) {
      throw new Error("Failed to apply operation");
    }

    return instance;
  }

  /**
   * Assigns an object class to an object instance in this collection.
   *
   * This is a deterministic no-op if the instance is no longer live
   * (e.g. a stale control invoked this after it was deleted).
   */
  async updateLabelInstanceGtClass(
    instance: ReadonlyLabelInstance,
    labelClass: ReadonlyLabelClass | null,
  ): Promise<void> {
    if (!this.#isLiveInstance(instance)) return;

    const updateOp = InstanceOps.AssignClass.fromParams(instance, labelClass);
    const op = new SegmentationView.Operation(this, updateOp);

    await this.currentBranch?.apply(op);
  }

  /**
   * Assigns the low reflectivity indicator to an object instance in this collection.
   *
   * This is a deterministic no-op if the instance is no longer live
   * (e.g. a stale control invoked this after it was deleted).
   */
  async updateLabelInstanceIsBlack(
    instance: ReadonlyLabelInstance,
    isBlack: boolean,
  ): Promise<void> {
    if (!this.#isLiveInstance(instance)) return;

    const updateOp = InstanceOps.AssignIsBlack.fromParams(instance, isBlack);
    const op = new SegmentationView.Operation(this, updateOp);

    await this.currentBranch?.apply(op);
  }

  /**
   * Removes an object instance from this collection.
   *
   * This is a deterministic no-op if the instance is no longer live
   * (e.g. a stale control invoked this after it was already deleted).
   */
  async deleteLabelInstance(instance: ReadonlyLabelInstance): Promise<void> {
    if (!this.#isLiveInstance(instance)) return;

    const deleteOp = InstanceOps.Delete.fromParams(instance);
    const op = new SegmentationView.Operation(this, deleteOp);

    await this.currentBranch?.apply(op);
  }

  /**
   * Sends a point cloud frame to the labeling assistant for encoding.
   *
   * @param pcdArr The point cloud as a flat float32 array in database coordinates.
   * @param numPoints The number of points contained in the point cloud frame.
   * @param signal Aborts the request when a newer point cloud supersedes this one.
   * @returns A promise that resolves to `true` if the assistant encoded
   * the point cloud successfully.
   */
  async encodePointCloud(
    pcdArr: Float32Array<ArrayBuffer>,
    numPoints: number,
    pcdId: number,
    signal?: AbortSignal,
  ): Promise<boolean> {
    return this.#loader.lookup.receiver.encodePointCloud(
      pcdArr,
      numPoints,
      pcdId,
      signal,
    );
  }

  /** Returns whether the backend can currently reach the labeling assistant. */
  async isAssistantAvailable(signal?: AbortSignal): Promise<boolean> {
    return this.#loader.lookup.receiver.isAssistantAvailable(signal);
  }

  /**
   * Prompts the labeling assistant to predict a segmentation mask.
   *
   * @param points The coordinates of each prompted point in database coordinates.
   * @param labels The foreground (1) or background (0) label of each prompted point.
   * @returns A promise that resolves to the logits of the predicted mask,
   * or `null` if the prediction failed.
   */
  async predictMask(
    points: readonly THREE.Vector3[],
    labels: readonly number[],
    pcdId: number,
  ): Promise<Float32Array | null> {
    const maskData = await this.#loader.lookup.receiver.predictMask(
      points,
      labels,
      pcdId,
    );
    if (maskData == null) return null;

    return maskData.logits;
  }
}
