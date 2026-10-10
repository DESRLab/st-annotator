import * as Collections from "typescript-collections";

import {
  BaseOperation,
  LabelDataView,
  Placeholder,
  WindowDataLoader,
} from "sta/app/editor";
import type {
  SceneContext,
  DownloadProgressListener,
  EditableFrame,
} from "sta/app/editor";
import type { Vector3XYZ } from "sta/common";

import type { ReadonlyLabelClass } from "./LabelClass";
import type { VectorType, ReadonlyLabelVector } from "./LabelVector";
import type {
  VectorParams,
  ClassParams,
  ReadonlyVectorIndex,
  VectorIndex,
} from "./VectorIndex";
import {
  BaseVectorIndex,
  VectorIndexView,
  cleanVectorParams,
} from "./VectorIndex";
import { VectorLookup } from "./VectorLookup";
import type { VectorData } from "./VectorLookup";
import { VectorOps, StaleTargetError } from "./labelset";
import type { VectorOperation } from "./labelset";
import type { UUID } from "./models";

/** Constructor contract for the operation wrapper exposed by {@link VectorView}. */
export type VectorViewOperationConstructor = new (
  dataView: VectorView,
  op: VectorOperation<any, any>,
) => BaseOperation<VectorView, any, any>;

export class VectorLoader extends WindowDataLoader<
  BaseVectorIndex,
  VectorData
> {
  readonly lookup: VectorLookup;

  constructor(
    lookup: VectorLookup,
    context: SceneContext<any>,
    timePathRange: number,
  ) {
    super(lookup, context, timePathRange);

    this.lookup = lookup;
  }

  combineData(windowData: readonly VectorData[]): BaseVectorIndex {
    const classesById = new Map(
      windowData
        .flatMap(({ classes }: VectorData) => classes)
        .map((labelClass: ClassParams) => [labelClass.id, labelClass]),
    );

    const vectorsById = new Map(
      windowData
        .flatMap(({ vectors }: VectorData) => vectors)
        .map((map: VectorParams) => [map.id, map]),
    );

    const aggData = {
      classes: [...classesById.values()],
      vectors: [...vectorsById.values()],
    };

    return new BaseVectorIndex(this.lookup.receiver.config, aggData);
  }
}

/**
 * Represents a collection of vector labels. Any changes to the labels through
 * this class are also applied to the backend.
 *
 */
export class VectorView extends LabelDataView<ReadonlyVectorIndex> {
  readonly #loader: VectorLoader;

  get timePathRange(): number {
    return this.#loader.timePathRange;
  }

  set timePathRange(value: number) {
    if (this.#loader.timePathRange === value) return;

    this.#loader.timePathRange = value;

    void this._reloadData();
  }

  readonly #branchIndexes: Collections.DefaultDictionary<
    number,
    BaseVectorIndex
  >;

  #mergeIntoBranch(
    frame: EditableFrame,
    data: ReadonlyVectorIndex,
  ): BaseVectorIndex {
    if (!this.#branchIndexes.containsKey(frame.label_branch_id)) {
      const loadedIndex = data as BaseVectorIndex;
      this.#branchIndexes.setValue(frame.label_branch_id, loadedIndex);
      return loadedIndex;
    }
    const branchData = this.#branchIndexes.getValue(frame.label_branch_id);
    branchData.addBulk({
      classes: [...data.iterLabelClasses()].filter(
        (labelClass) => !branchData.hasLabelClass(labelClass.id, true),
      ),
      vectors: [...data.iterLabelVectors()].filter(
        (vector) => !branchData.hasLabelVector(vector.id),
      ),
    });
    return branchData;
  }

  #onBackgroundLoad = (frame: EditableFrame, data: BaseVectorIndex): void => {
    if (this.frame?.id !== frame.id) return;
    this.#mergeIntoBranch(frame, data);
  };

  async getData(
    frame: EditableFrame,
    signal?: AbortSignal,
    onProgress?: DownloadProgressListener,
  ): Promise<ReadonlyVectorIndex | null> {
    const data = await super.getData(frame, signal, onProgress);
    if (data == null) return null;

    const branchData = this.#mergeIntoBranch(frame, data);

    const validFrames = this.#loader.getFramesInWindow(frame);
    return new VectorIndexView(branchData, validFrames);
  }

  get #index(): VectorIndex | null {
    const index = this.data;
    if (index == null) return null;

    return index as unknown as VectorIndex;
  }

  readonly #emptyIndex: VectorIndex;

  get #indexWithFallback(): VectorIndex {
    return this.#index ?? this.#emptyIndex;
  }

  /**
   * Tests whether the given vector is still the live label behind its id in
   * the currently displayed data. A stale control (a callback captured
   * while the vector existed) may invoke an operation after the vector was
   * deleted, or after its id was reused by another data revision; such an
   * operation must apply to the accepted label or not at all.
   */
  #isLiveVector(vector: ReadonlyLabelVector): boolean {
    const index = this.#index;
    return (
      index != null &&
      index.hasLabelVector(vector.id) &&
      index.getLabelVector(vector.id) === vector
    );
  }

  iterLabelClasses(): IterableIterator<ReadonlyLabelClass> {
    return this.#indexWithFallback.iterLabelClasses();
  }

  hasLabelClass(id: number): boolean {
    return this.#indexWithFallback.hasLabelClass(id);
  }

  getLabelClass(id: number): ReadonlyLabelClass {
    return this.#indexWithFallback.getLabelClass(id);
  }

  iterLabelVectors(): IterableIterator<ReadonlyLabelVector> {
    return this.#indexWithFallback.iterLabelVectors();
  }

  hasLabelVector(id: UUID): boolean {
    return this.#indexWithFallback.hasLabelVector(id);
  }

  getLabelVector(id: UUID): ReadonlyLabelVector {
    return this.#indexWithFallback.getLabelVector(id);
  }

  static create(context: SceneContext<any>, timePathRange: number): VectorView {
    const { config, views } = context;
    const lookup = VectorLookup.create(config, views);
    const loader = new VectorLoader(lookup, context, timePathRange);

    return new VectorView(loader, context);
  }

  constructor(loader: VectorLoader, context: SceneContext<any>) {
    super(loader, context);

    this.#loader = loader;

    const config = loader.lookup.receiver.config;
    this.#branchIndexes = new Collections.DefaultDictionary(
      () => new BaseVectorIndex(config, {}),
      (id: number) => id.toString(),
    );
    this.#emptyIndex = new BaseVectorIndex(config, {});
    this.#loader.addBackgroundLoadListener(this.#onBackgroundLoad);
  }

  override dispose(): void {
    this.#loader.removeBackgroundLoadListener(this.#onBackgroundLoad);
    super.dispose();
  }

  #localVectors = new Set<ReadonlyLabelVector>();

  addLabelVectorLocalOnly(
    params: Omit<VectorParams, "id">,
  ): ReadonlyLabelVector {
    if (this.#index == null) {
      console.error(this);
      throw new Error("There is no index to add the vector object to");
    }

    const vector = this.#index.addLabelVector({
      id: new Placeholder(),
      ...cleanVectorParams(params),
    });

    this.#localVectors.add(vector);

    return vector;
  }

  deleteLabelVectorLocalOnly(vector: ReadonlyLabelVector): void {
    if (this.#index == null) {
      console.error(this);
      throw new Error("There is no index to delete the vector object from");
    }

    if (!this.#localVectors.has(vector)) {
      console.error(vector);
      throw new Error(
        "This vector was not constructed through addLabelVectorLocalOnly",
      );
    }

    this.#index.deleteLabelVector(vector);
    this.#localVectors.delete(vector);
  }

  setLabelVectorDisplayParams(
    vector: ReadonlyLabelVector,
    params: Pick<Partial<VectorParams>, "showColor">,
  ): void {
    if (this.#index == null) {
      console.error(this);
      throw new Error("There is no index to update the vector for");
    }

    vector.setDisplayColor(params.showColor ?? null);
  }

  static Operation: VectorViewOperationConstructor = class extends BaseOperation<
    VectorView,
    any,
    any
  > {
    readonly op: VectorOperation<any, any>;

    get displayName(): string {
      return this.op.displayName;
    }

    get opName(): string {
      return this.op.opName;
    }

    get opResult(): Placeholder<any> | null {
      return this.op.opResult;
    }

    constructor(dataView: VectorView, op: VectorOperation<any, any>) {
      super(dataView, op.opParams);

      this.op = op;
      this.#acceptedIndex = dataView.#index;
    }

    /**
     * The labels index this operation was accepted against. The
     * operation applies to this revision even if the view navigates
     * to another frame/branch before the queued application runs, so
     * it can never be redirected to another revision's labels.
     */
    readonly #acceptedIndex: VectorIndex | null = null;

    /**
     * `true` if the latest application of this operation was skipped
     * because its target disappeared; its undo must then be a no-op
     * as well, so the branch history can always be undone/redone.
     */
    #skippedStale = false;

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
    applyLocal() {
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
    undoLocal() {
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

  async addLabelVector(
    params: Omit<VectorParams, "id">,
  ): Promise<ReadonlyLabelVector> {
    const createOp = VectorOps.Create.fromParams(params);
    const op = new VectorView.Operation(this, createOp);
    await this.currentBranch?.apply(op);

    const vector = createOp.newVector;

    if (vector === undefined) {
      throw new Error("Failed to apply operation");
    }
    return vector;
  }

  async updateLabelVectorGtClass(
    vector: ReadonlyLabelVector,
    labelClass: ReadonlyLabelClass | null,
  ): Promise<void> {
    if (!this.#isLiveVector(vector)) return;

    const updateOp = VectorOps.AssignClass.fromParams(vector, labelClass);
    const op = new VectorView.Operation(this, updateOp);

    await this.currentBranch?.apply(op);
  }

  async updateLabelVectorGeometry(
    vector: ReadonlyLabelVector,
    mode: string,
    vectorType: VectorType,
    vertices: readonly Readonly<Vector3XYZ>[],
    prevVertices?: readonly Readonly<Vector3XYZ>[],
  ): Promise<void> {
    if (!this.#isLiveVector(vector)) return;

    // Vertices cross this API as plain records; conversion to three.js
    // vectors happens inside the operation when it applies to the index.
    // If `prevVertices` is given, it becomes the undo state of the
    // operation instead of the vector's current state.
    const updateOp = VectorOps.EditVectorGeometry.fromParams(
      vector,
      mode,
      { type: vectorType, vertices: vertices },
      prevVertices,
    );
    const op = new VectorView.Operation(this, updateOp);

    await this.currentBranch?.apply(op);
  }

  async deleteLabelVector(vector: ReadonlyLabelVector): Promise<void> {
    if (!this.#isLiveVector(vector)) return;

    const deleteOp = VectorOps.Delete.fromParams(vector);
    const op = new VectorView.Operation(this, deleteOp);

    await this.currentBranch?.apply(op);
  }
}
