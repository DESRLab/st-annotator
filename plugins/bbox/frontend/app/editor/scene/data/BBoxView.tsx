import _ from "lodash";
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
import { TypeUtils, type Timestamp } from "sta/common";

import type { DistinctiveLevel, OcclusionLevel } from "../../../../models";

import {
  BaseBBoxIndex,
  BBoxIndexView,
  cleanBoxParams,
  cleanTrackParams,
} from "./BBoxIndex";
import type {
  BBoxIndex,
  ReadonlyBBoxIndex,
  BoxParams,
  TrackParams,
} from "./BBoxIndex";
import { BBoxLookup, type BBoxData } from "./BBoxLookup";
import type { BoxType, ReadonlyLabelBox } from "./LabelBox";
import type { ReadonlyLabelClass } from "./LabelClass";
import type { ReadonlyLabelTrack } from "./LabelTrack";
import { BoxOps, StaleTargetError, TrackOps } from "./labelset";
import type { BBoxOperation } from "./labelset";
import type { BoxPose } from "./labelset/box";
import type { UUID } from "./models";

/** Constructor contract for the operation wrapper exposed by {@link BBoxView}. */
export type BBoxViewOperationConstructor = new (
  dataView: BBoxView,
  op: BBoxOperation<any, any>,
) => BaseOperation<BBoxView, any, any>;

/**
 * Given a frame, loads bounding box labels composed of the data for that single frame
 * as well as that for neighbouring frames.
 */
export class BBoxLoader extends WindowDataLoader<BaseBBoxIndex, BBoxData> {
  /**
   * Finds the data for each frame.
   */
  readonly lookup: BBoxLookup;

  /**
   * Creates a new data loader for a sliding window of frames.
   */
  constructor(
    lookup: BBoxLookup,
    context: SceneContext<any>,
    timePathRange: number,
  ) {
    super(lookup, context, timePathRange);

    this.lookup = lookup;
  }

  /**
   * Combines the data from individual frames into a window.
   */
  protected combineData(windowData: readonly BBoxData[]): BaseBBoxIndex {
    // De-duplicate model instances
    const classesById = new Map(
      windowData
        .flatMap(({ classes }) => classes)
        .map((labelClass) => [labelClass.id, labelClass]),
    );
    const tracksById = new Map(
      windowData
        .flatMap(({ tracks }) => tracks)
        .map((track) => [track.id, track]),
    );
    const boxesById = new Map(
      windowData.flatMap(({ boxes }) => boxes).map((map) => [map.id, map]),
    );
    const aggData = {
      classes: [...classesById.values()],
      tracks: [...tracksById.values()],
      boxes: [...boxesById.values()],
    };

    return new BaseBBoxIndex(this.lookup.receiver.config, aggData);
  }
}

/**
 * Represents a collection of bounding box labels. Any changes to the labels through
 * this class are also applied to the backend.
 */
export class BBoxView extends LabelDataView<ReadonlyBBoxIndex> {
  /**
   * Loads the data from the backend on demand.
   */
  readonly #loader: BBoxLoader;

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
   * Returns the maximum timestamp for which to display the labels.
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
  readonly #branchIndexes: Collections.DefaultDictionary<number, BaseBBoxIndex>;

  #mergeIntoBranch(
    frame: EditableFrame,
    data: ReadonlyBBoxIndex,
  ): BaseBBoxIndex {
    if (!this.#branchIndexes.containsKey(frame.label_branch_id)) {
      const loadedIndex = data as BaseBBoxIndex;
      this.#branchIndexes.setValue(frame.label_branch_id, loadedIndex);
      return loadedIndex;
    }
    const branchData = this.#branchIndexes.getValue(frame.label_branch_id);
    branchData.addBulk({
      classes: [...data.iterLabelClasses()].filter(
        (labelClass) => !branchData.hasLabelClass(labelClass.id, true),
      ),
      tracks: [...data.iterLabelTracks()].filter(
        (track) => !branchData.hasLabelTrack(track.id, true),
      ),
      boxes: [...data.iterLabelBoxes()].filter(
        (box) => !branchData.hasLabelBox(box.id, true),
      ),
    });
    return branchData;
  }

  #onBackgroundLoad = (frame: EditableFrame, data: BaseBBoxIndex): void => {
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
  ): Promise<ReadonlyBBoxIndex | null> {
    const data = await super.getData(frame, signal, onProgress);
    if (data == null) return null;

    const branchData = this.#mergeIntoBranch(frame, data);

    const validFrames = this.#loader.getFramesInWindow(frame);
    this.#resolveHiddenIds();
    const view = new BBoxIndexView(branchData, validFrames);
    for (const box of view.iterLabelBoxes())
      box.setHidden(this.#hiddenBoxes.has(box.id));
    return view;
  }

  get #index(): BBoxIndex | null {
    const index = this.data;
    if (index == null) return null;

    // We avoid exposing the modifiable version to external classes
    return index as BBoxIndex;
  }

  readonly #emptyIndex: BBoxIndex;

  get #indexWithFallback(): BBoxIndex {
    return this.#index ?? this.#emptyIndex;
  }

  /**
   * Tests whether the given box is still the live label behind its id in
   * the currently displayed data. A stale control (a callback captured
   * while the box existed) may invoke an operation after the box was
   * deleted, or after its id was reused by another data revision; such an
   * operation must apply to the accepted label or not at all.
   */
  #isLiveBox(box: ReadonlyLabelBox): boolean {
    const index = this.#index;
    return (
      index != null &&
      index.hasLabelBox(box.id) &&
      index.getLabelBox(box.id) === box
    );
  }

  /**
   * Tests whether the given track is still the live label behind its id in
   * the currently displayed data; see {@link BBoxView.#isLiveBox}.
   */
  #isLiveTrack(track: ReadonlyLabelTrack): boolean {
    const index = this.#index;
    return (
      index != null &&
      index.hasLabelTrack(track.id) &&
      index.getLabelTrack(track.id) === track
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
   * Iterates through each bounding box in this collection.
   */
  iterLabelBoxes(): IterableIterator<ReadonlyLabelBox> {
    return this.#indexWithFallback.iterLabelBoxes();
  }

  /**
   * Tests whether a bounding box exists in this collection.
   */
  hasLabelBox(id: UUID): boolean {
    return this.#indexWithFallback.hasLabelBox(id);
  }

  /**
   * Gets a bounding box in this collection by its unique identifier.
   */
  getLabelBox(id: UUID): ReadonlyLabelBox {
    return this.#indexWithFallback.getLabelBox(id);
  }

  /**
   * Iterates through each object track in this collection.
   */
  iterLabelTracks(): IterableIterator<ReadonlyLabelTrack> {
    return this.#indexWithFallback.iterLabelTracks();
  }

  /**
   * Tests whether an object track exists in this collection.
   */
  hasLabelTrack(id: UUID): boolean {
    return this.#indexWithFallback.hasLabelTrack(id);
  }

  /**
   * Gets an object track in this collection by its unique identifier.
   */
  getLabelTrack(id: UUID): ReadonlyLabelTrack {
    return this.#indexWithFallback.getLabelTrack(id);
  }

  /**
   * Creates a new view of bounding box labels that updates based on the active frame.
   */
  static create(context: SceneContext<any>, timePathRange: number): BBoxView {
    const { config, views } = context;
    const lookup = BBoxLookup.create(config, views);
    const loader = new BBoxLoader(lookup, context, timePathRange);

    return new BBoxView(loader, context);
  }

  /**
   * Creates a new view of bounding box labels that updates based on the active frame.
   */
  constructor(loader: BBoxLoader, context: SceneContext<any>) {
    super(loader, context);

    this.#loader = loader;

    const config = loader.lookup.receiver.config;
    this.#branchIndexes = new Collections.DefaultDictionary(
      () => new BaseBBoxIndex(config, {}),
      (id) => id.toString(),
    );
    this.#emptyIndex = new BaseBBoxIndex(config, {});
    this.#loader.addBackgroundLoadListener(this.#onBackgroundLoad);
  }

  override dispose(): void {
    this.#loader.removeBackgroundLoadListener(this.#onBackgroundLoad);
    super.dispose();
  }

  readonly #hiddenBoxes = new Set<UUID>();

  #resolveHiddenIds(): void {
    for (const id of this.#hiddenBoxes) {
      if (Placeholder.isPlaceholder(id) && id.isResolved) {
        this.#hiddenBoxes.delete(id);
        this.#hiddenBoxes.add(id.orElse(""));
      }
    }
  }

  /** Retains hidden IDs across frame loads for this editor session only. */
  setBoxHidden(id: UUID, hidden: boolean): void {
    this.#resolveHiddenIds();
    if (hidden) this.#hiddenBoxes.add(id);
    else this.#hiddenBoxes.delete(id);
    if (this.hasLabelBox(id)) this.getLabelBox(id).setHidden(hidden);
  }

  readonly #localBoxes = new Set<ReadonlyLabelBox>();

  /**
   * Constructs a bounding box, adding it to this collection.
   *
   * Unlike {@link BBoxView#addLabelBox}, the remote dataset remains unaffected.
   *
   * Items added in this way can only be deleted through
   * {@link BBoxView#deleteLabelBoxLocalOnly}.
   */
  addLabelBoxLocalOnly(params: Omit<BoxParams, "id">): ReadonlyLabelBox {
    if (this.#index == null) {
      console.error(this);
      throw new Error("There is no index to add the box to");
    }

    const box = this.#index.addLabelBox({
      id: new Placeholder(),
      ...cleanBoxParams(params),
    });
    this.#localBoxes.add(box);

    return box;
  }

  /**
   * Removes a bounding box from this collection.
   *
   * Unlike {@link BBoxView#deleteLabelBox}, the remote dataset remains unaffected.
   *
   * This method can only delete items added through
   * {@link BBoxView#addLabelBoxLocalOnly}.
   */
  deleteLabelBoxLocalOnly(box: ReadonlyLabelBox): void {
    if (this.#index == null) {
      console.error(this);
      throw new Error("There is no index to delete the box from");
    }

    if (!this.#localBoxes.has(box)) {
      console.error(box);
      throw new Error(
        "This box was not constructed through addLabelBoxLocalOnly",
      );
    }

    this.#index.deleteLabelBox(box);
    this.#localBoxes.delete(box);
  }

  /**
   * Sets the display parameters of an object track.
   *
   * This method can be used to update items added through both
   * {@link BBoxView#addLabelTrack} and {@link BBoxView#addLabelTrackLocalOnly}.
   */
  setLabelTrackDisplayParams(
    track: ReadonlyLabelTrack,
    params: Pick<Partial<TrackParams>, "minTimestamp" | "maxTimestamp">,
  ): void {
    if (this.#index == null) {
      console.error(this);
      throw new Error("There is no index to update the track for");
    }

    track.setDisplayRange(
      params.minTimestamp ?? null,
      params.maxTimestamp ?? null,
    );
  }

  /**
   * Sets the display parameters of a bounding box.
   *
   * This method can be used to update items added through both
   * {@link BBoxView#addLabelBox} and {@link BBoxView#addLabelBoxLocalOnly}.
   */
  setLabelBoxDisplayParams(
    box: ReadonlyLabelBox,
    params: Pick<
      Partial<BoxParams>,
      | "opacity"
      | "showForwardIndicator"
      | "showFrame"
      | "showPerceivedClass"
      | "showColor"
    >,
  ): void {
    if (this.#index == null) {
      console.error(this);
      throw new Error("There is no index to update the box for");
    }

    box.setDisplayOptions(params);
  }

  readonly #localTracks = new Set<ReadonlyLabelTrack>();

  /**
   * Constructs an object track, adding it to this collection.
   *
   * Unlike {@link BBoxView#addLabelTrack}, the remote dataset remains unaffected.
   *
   * Items added in this way can only be deleted through
   * {@link BBoxView#deleteLabelTrackLocalOnly}.
   */
  addLabelTrackLocalOnly(params: Omit<TrackParams, "id">): ReadonlyLabelTrack {
    if (this.#index == null) {
      console.error(this);
      throw new Error("There is no index to add the track to");
    }

    const track = this.#index.addLabelTrack({
      id: new Placeholder(),
      ...cleanTrackParams(params),
    });
    this.#localTracks.add(track);

    return track;
  }

  /**
   * Checks wether the track exists in local set.
   *
   * Items that have been added in through
   * {@link BBoxView#addLabelTrackLocalOnly}.
   */
  hasLabelTrackLocalOnly(trackId: UUID): boolean {
    if (this.#index == null) {
      console.error(this);
      throw new Error("There is no index to add the track to");
    }

    const track = this.#index.getLabelTrack(trackId);

    return this.#localTracks.has(track);
  }

  /**
   * Finds a track in local set by track id.
   *
   * Items that have been added in through
   * {@link BBoxView#addLabelTrackLocalOnly}.
   */
  getLabelTrackLocalOnly(trackId: UUID): ReadonlyLabelTrack {
    if (this.#index == null) {
      console.error(this);
      throw new Error("There is no index to add the track to");
    }

    const track = this.#index.getLabelTrack(trackId);

    return track;
  }

  /**
   * Removes an object track from this collection.
   *
   * Unlike {@link BBoxView#deleteLabelTrack}, the remote dataset remains unaffected.
   *
   * This method can only delete items added through
   * {@link BBoxView#addLabelTrackLocalOnly}.
   */
  deleteLabelTrackLocalOnly(track: ReadonlyLabelTrack): void {
    if (this.#index == null) {
      console.error(this);
      throw new Error("There is no index to delete the track from");
    }

    if (!this.#localTracks.has(track)) {
      console.error(track);
      throw new Error(
        "This box was not constructed through addLabelTrackLocalOnly",
      );
    }

    this.#index.deleteLabelTrack(track);
    this.#localTracks.delete(track);
  }

  static Operation: BBoxViewOperationConstructor =
    /**
     * Abstract base implementation of {@link Operation}.
     */
    class extends BaseOperation<BBoxView, any, any> {
      /**
       * The wrapped operation.
       */
      readonly op: BBoxOperation<any, any>;

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
       * The result of this operation, expressed as a {@link Placeholder}.
       *
       * It is resolved with the value returned from the backend after it is pushed there.
       */
      get opResult(): Placeholder<any> | null {
        return this.op.opResult;
      }

      /**
       * The labels index this operation was accepted against. The
       * operation applies to this revision even if the view navigates
       * to another frame/branch before the queued application runs, so
       * it can never be redirected to another revision's labels.
       */
      readonly #acceptedIndex: BBoxIndex | null;

      /**
       * `true` if the latest application of this operation was skipped
       * because its target disappeared; its undo must then be a no-op
       * as well, so the branch history can always be undone/redone.
       */
      #skippedStale = false;

      /**
       * Creates a new operation by wrapping an operation that acts on
       * bounding box labels.
       */
      constructor(dataView: BBoxView, op: BBoxOperation<any, any>) {
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
   * Constructs a bounding box, adding it to this collection.
   */
  async addLabelBox(params: Omit<BoxParams, "id">): Promise<ReadonlyLabelBox> {
    const createOp = BoxOps.Create.fromParams(params);
    const op = new BBoxView.Operation(this, createOp);

    await this.currentBranch?.apply(op);

    const box = createOp.newBox;
    if (box === undefined) {
      throw new Error("Failed to apply operation");
    }

    return box;
  }

  /**
   * Assigns an object track to a bounding box in this collection.
   *
   * This is a deterministic no-op if the box or the track is no longer
   * live (e.g. a stale control invoked this after either was deleted).
   */
  async updateLabelBoxParentTrack(
    box: ReadonlyLabelBox,
    track: ReadonlyLabelTrack | null,
  ): Promise<void> {
    if (!this.#isLiveBox(box)) return;
    if (track != null && !this.#isLiveTrack(track)) return;

    const updateOp = BoxOps.AssignEntity.fromParams(box, track);
    const op = new BBoxView.Operation(this, updateOp);

    await this.currentBranch?.apply(op);
  }

  /**
   * Assigns an object class to a bounding box in this collection.
   *
   * This is a deterministic no-op if the box is no longer live
   * (e.g. a stale control invoked this after it was deleted).
   */
  async updateLabelBoxPerceivedClass(
    box: ReadonlyLabelBox,
    labelClass: ReadonlyLabelClass | null,
  ): Promise<void> {
    if (!this.#isLiveBox(box)) return;

    const updateOp = BoxOps.AssignClass.fromParams(box, labelClass);
    const op = new BBoxView.Operation(this, updateOp);

    await this.currentBranch?.apply(op);
  }

  /**
   * Assigns a type to a bounding box in this collection.
   *
   * This is a deterministic no-op if the box is no longer live
   * (e.g. a stale control invoked this after it was deleted).
   */
  async updateLabelBoxType(
    box: ReadonlyLabelBox,
    boxType: BoxType,
  ): Promise<void> {
    if (!this.#isLiveBox(box)) return;

    const updateOp = BoxOps.AssignType.fromParams(box, boxType);
    const op = new BBoxView.Operation(this, updateOp);

    await this.currentBranch?.apply(op);
  }

  /**
   * Assigns a distinctiveness level to a bounding box in this collection.
   *
   * This is a deterministic no-op if the box is no longer live
   * (e.g. a stale control invoked this after it was deleted).
   */
  async updateLabelBoxDistinctiveLv(
    box: ReadonlyLabelBox,
    distinctiveLv: DistinctiveLevel,
  ): Promise<void> {
    if (!this.#isLiveBox(box)) return;

    const updateOp = BoxOps.AssignDistinctiveLv.fromParams(box, distinctiveLv);
    const op = new BBoxView.Operation(this, updateOp);

    await this.currentBranch?.apply(op);
  }

  /**
   * Assigns an occlusion level to a bounding box in this collection.
   *
   * This is a deterministic no-op if the box is no longer live
   * (e.g. a stale control invoked this after it was deleted).
   */
  async updateLabelBoxOcclusionLv(
    box: ReadonlyLabelBox,
    occlusionLv: OcclusionLevel,
  ): Promise<void> {
    if (!this.#isLiveBox(box)) return;

    const updateOp = BoxOps.AssignOcclusionLv.fromParams(box, occlusionLv);
    const op = new BBoxView.Operation(this, updateOp);

    await this.currentBranch?.apply(op);
  }

  /**
   * Registers that a bounding box in this collection has been transformed.
   *
   * @param prevPose If given, the pose of the box before the transformation,
   * used as the undo data of the operation instead of the pose read from the box.
   * This is needed when the box already reflects the new pose
   * (e.g. while it is being transformed through a gizmo).
   *
   * This is a deterministic no-op if the box is no longer live
   * (e.g. a stale control invoked this after it was deleted).
   */
  async updateLabelBoxTransform(
    box: ReadonlyLabelBox,
    mode: string,
    pose: BoxPose,
    prevPose?: BoxPose,
  ): Promise<void> {
    if (!this.#isLiveBox(box)) return;

    const updateOp = BoxOps.TransformBox.fromParams(box, mode, pose, prevPose);
    const op = new BBoxView.Operation(this, updateOp);

    await this.currentBranch?.apply(op);
  }

  /**
   * Removes a bounding box from this collection.
   *
   * This is a deterministic no-op if the box is no longer live
   * (e.g. a stale control invoked this after it was already deleted).
   */
  async deleteLabelBox(box: ReadonlyLabelBox): Promise<void> {
    if (!this.#isLiveBox(box)) return;

    const deleteOp = BoxOps.Delete.fromParams(box);
    const op = new BBoxView.Operation(this, deleteOp);

    await this.currentBranch?.apply(op);
  }

  /**
   * Constructs an object track, and adds it to this collection.
   */
  async addLabelTrack(
    params: Omit<TrackParams, "id">,
  ): Promise<ReadonlyLabelTrack> {
    const createOp = TrackOps.Create.fromParams(params);
    const op = new BBoxView.Operation(this, createOp);

    await this.currentBranch?.apply(op);

    const track = createOp.newTrack;
    if (track === undefined) {
      throw new Error("Failed to apply operation");
    }

    return track;
  }

  /**
   * Assigns an object class to an object track in this collection.
   *
   * This is a deterministic no-op if the track is no longer live
   * (e.g. a stale control invoked this after it was deleted).
   */
  async updateLabelTrackGtClass(
    track: ReadonlyLabelTrack,
    labelClass: ReadonlyLabelClass | null,
  ): Promise<void> {
    if (!this.#isLiveTrack(track)) return;

    const updateOp = TrackOps.AssignClass.fromParams(track, labelClass);
    const op = new BBoxView.Operation(this, updateOp);

    await this.currentBranch?.apply(op);
  }

  /**
   * Assigns the low reflectivity indicator to an object track in this collection.
   *
   * This is a deterministic no-op if the track is no longer live
   * (e.g. a stale control invoked this after it was deleted).
   */
  async updateLabelTrackIsBlack(
    track: ReadonlyLabelTrack,
    isBlack: boolean,
  ): Promise<void> {
    if (!this.#isLiveTrack(track)) return;

    const updateOp = TrackOps.AssignIsBlack.fromParams(track, isBlack);
    const op = new BBoxView.Operation(this, updateOp);

    await this.currentBranch?.apply(op);
  }

  /**
   * Removes an object track from this collection.
   *
   * This is a deterministic no-op if the track is no longer live
   * (e.g. a stale control invoked this after it was already deleted).
   */
  async deleteLabelTrack(track: ReadonlyLabelTrack): Promise<void> {
    if (!this.#isLiveTrack(track)) return;

    const deleteOp = TrackOps.Delete.fromParams(track);
    const op = new BBoxView.Operation(this, deleteOp);

    await this.currentBranch?.apply(op);
  }
}
