import _ from "lodash";

import {
  CollectionUtils,
  type CoordBounds,
  type Timestamp,
  type Hashable,
} from "sta/common";

import type { EditorViews } from "../views";
import type { FrameState } from "../models";

import { ArrayMapIndex } from "./ArrayMapIndex";
import { EditableFrame } from "./EditableFrame";
import { Navigator } from "./Navigator";

export interface AxisSearchOptions {
  /**
   * If `true`, the input frame need not exist along this axis; the result of
   * the search then returns the closest frames to the value of the input frame
   * along this axis.
   */
  fuzzy?: boolean;
}

export interface IndexSearchOptions {
  /**
   * If `'intersect'`, only frames that are in range for every specified axis are
   * returned; if `'union'`, frames that are in range for any specified axis are returned.
   */
  aggType?: "intersect" | "union";
}

/**
 * Helper class to lookup a frame along an axis.
 */
export class FrameLookupAxis<
  T extends number | string | object,
  H extends Hashable | number | string | null | undefined,
> {
  /**
   * An array containing the frames that are being indexed.
   */
  readonly frames: readonly EditableFrame[];

  /**
   * A function that computes the value of a frame along this axis;
   * return `null` to exclude the frame from being selected through indexing.
   */
  readonly getValue: (frame: EditableFrame) => T | null;

  /**
   * A function that computes the hashable key of a value along the axis.
   */
  readonly toHashableValue: (value: T) => H;

  /**
   * Converts an axis value to the key used for bucket lookup.
   */
  #toValueKey(value: T | null): string | null {
    if (value == null) return null;

    return CollectionUtils.HashMap.tryStringify(this.toHashableValue(value));
  }

  /**
   * A mapping of each frame by their value along this axis.
   */
  readonly #framesByValue: Map<
    string | null,
    { value: T | null; frames: EditableFrame[] }
  >;

  /**
   * The available values in this axis (excluding `null`), sorted in ascending order.
   */
  readonly #values: ArrayMapIndex<H, T>;

  /**
   * An array containing each value in this axis (excluding `null`), sorted in ascending order.
   */
  get values(): readonly T[] {
    return this.#values.elements;
  }

  /**
   * Creates a new axis for indexing a collection of frames.
   *
   * @param frames An array containing the frames to index. No copy is made.
   * @param getValue A function that computes the value of a frame along the axis;
   * return `null` to exclude the frame from being selected through indexing.
   * @param toHashableValue A function that computes the hashable key of a value along the axis.
   */
  constructor(
    frames: readonly EditableFrame[],
    getValue: (frame: EditableFrame) => T | null,
    toHashableValue: (value: T) => H,
    toSortValue: (value: T) => unknown = toHashableValue,
  ) {
    this.frames = frames;
    this.getValue = getValue;
    this.toHashableValue = toHashableValue;

    const framesByValue = new Map<
      string | null,
      { value: T | null; frames: EditableFrame[] }
    >();
    const valuesByKey = new Map<string, T>();
    for (const frame of frames) {
      const axisValue = this.getValue(frame);
      const valueKey = this.#toValueKey(axisValue);
      const bucket = framesByValue.get(valueKey) ?? {
        value: axisValue,
        frames: [],
      };
      bucket.frames.push(frame);
      framesByValue.set(valueKey, bucket);

      if (axisValue != null && valueKey != null) {
        valuesByKey.set(valueKey, axisValue);
      }
    }
    this.#framesByValue = framesByValue;

    this.#values = new ArrayMapIndex(
      toHashableValue,
      [...valuesByKey.values()],
      toSortValue,
    );
  }

  /**
   * Iterates through the frames stored along this axis.
   *
   * @yields A value along this axis, with the corresponding frames.
   * Note that frames associated with `null` along this axis are omitted.
   */
  *iterFrames(): Generator<[T, readonly EditableFrame[]]> {
    for (const { value, frames } of this.#framesByValue.values()) {
      if (value != null) {
        const entry: [T, readonly EditableFrame[]] = [value, frames];

        yield entry;
      }
    }
  }

  /**
   * Gets each frame with the given value along this axis.
   *
   * @param value The query value; this can be `null`.
   * @returns The requested frames. May be empty if the no frames have the given value.
   */
  findbyAxisValue(value: T | null): readonly EditableFrame[] {
    return this.#framesByValue.get(this.#toValueKey(value))?.frames ?? [];
  }

  /**
   * Gets each frame which index along this axis falls in the interval
   * `[idx - idxRange, idx + idxRange]`.
   *
   * @param idx The query index.
   * @param idxRange The maximum distance from `idx` to query.
   * @returns The requested frames.
   */
  findInIdxRange(idx: number, idxRange: number): readonly EditableFrame[] {
    const axisValues = this.#values;
    const start = Math.max(0, idx - idxRange);
    const end = Math.min(idx + idxRange + 1, axisValues.length);

    return _.range(start, end)
      .map((i) => axisValues.getByIdx(i))
      .flatMap((axisValue) => this.findbyAxisValue(axisValue));
  }

  /**
   * Gets the index of a value along this axis.
   *
   * @param value The query value.
   * @param options The options to apply to the search.
   * @returns The index of the value frame along this axis; or
   * `null` if the value is `null`.
   */
  getValueIdx(value: T | null, options: AxisSearchOptions = {}): number | null {
    if (value == null) return null;

    const key = this.#values.getKey(value);

    const fuzzy = options.fuzzy ?? false;
    if (fuzzy) {
      const sortedKeys = this.#values.elements.map((v) =>
        this.#values.getKey(v),
      );
      return _.sortedIndex(sortedKeys, key);
    }

    return this.#values.getIdxOfKey(key);
  }

  /**
   * Gets the index of a frame along this axis.
   *
   * @param frame The query frame.
   * @param options The options to apply to the search.
   * @returns The index of the given frame along this axis; or
   * `null` if the value of the given frame along this axis is `null`.
   */
  getFrameIdx(
    frame: EditableFrame,
    options: AxisSearchOptions = {},
  ): number | null {
    const value = this.getValue(frame);
    return this.getValueIdx(value, options);
  }

  /**
   * Gets each frame which index along this axis falls in the interval
   * `[idx - idxRange, idx + idxRange]` with respect to a query value.
   *
   * `idx` refers to the index of `value` along this axis.
   *
   * If the value is `null`, instead returns all frames that also have a
   * `null` value along this axis.
   *
   * @param value The query value.
   * @param idxRange The maximum distance from `idx` to query.
   * @param options The options to apply to the search.
   * @returns The requested frames.
   */
  findInRangeOfValue(
    value: T | null,
    idxRange: number,
    options: AxisSearchOptions = {},
  ): readonly EditableFrame[] {
    const idx = this.getValueIdx(value, options);
    if (idx == null) return this.findbyAxisValue(null);

    return this.findInIdxRange(idx, idxRange);
  }

  /**
   * Gets each frame which index along this axis falls in the interval
   * `[idx - idxRange, idx + idxRange]` with respect to a query frame.
   *
   * `idx` refers to the index of the value of `frame` along this axis.
   *
   * If the value of `frame` along this axis is `null`, instead returns
   * all frames that also have a `null` value along this axis.
   *
   * @param frame The query frame.
   * @param idxRange The maximum distance from `idx` to query.
   * @param options The options to apply to the search.
   * @returns The requested frames.
   */
  findInRangeOfFrame(
    frame: EditableFrame,
    idxRange: number,
    options: AxisSearchOptions = {},
  ): readonly EditableFrame[] {
    const idx = this.getFrameIdx(frame, options);
    if (idx == null) return this.findbyAxisValue(null);

    return this.findInIdxRange(idx, idxRange);
  }

  /**
   * Computes the distance between two frames, in terms of their index along this axis.
   *
   * Frames may have an index of `null` as described in {@link FrameLookupAxis#getFrameIdx}.
   * In that case, the distance between `null` and itself is zero,
   * while the distance between `null` and a number is infinity.
   *
   * @param a The first frame.
   * @param b The second frame.
   * @param options The options to apply to the search.
   * @returns The index-based distance between the two frames.
   */
  frameIdxDistance(
    a: EditableFrame,
    b: EditableFrame,
    options: AxisSearchOptions = {},
  ): number {
    const aIdx = this.getFrameIdx(a, options);
    const bIdx = this.getFrameIdx(b, options);

    if (aIdx == null && bIdx == null) return 0;
    if (aIdx == null || bIdx == null) return Number.POSITIVE_INFINITY;

    return Math.abs(aIdx - bIdx);
  }
}

/**
 * Represents an axis used to index the frames in {@link FrameIndex}.
 */
export const NavigatorAxis = Object.freeze({
  /** The `x`-boundaries of each frame. */
  X_BOUNDS: "xb",
  /** The `y`-boundaries of each frame. */
  Y_BOUNDS: "yb",
  /** The `z`-boundaries of each frame. */
  Z_BOUNDS: "zb",
  /** The `t`-boundaries of each frame. */
  T_BOUNDS: "tb",
  /** The center `x`-coordinate of each frame. */
  X_CENTER: "xc",
  /** The center `y`-coordinate of each frame. */
  Y_CENTER: "yc",
  /** The center `z`-coordinate of each frame. */
  Z_CENTER: "zc",
  /** The center `t`-coordinate of each frame. */
  T_CENTER: "tc",
} as const);

export type NavigatorAxisType =
  (typeof NavigatorAxis)[keyof typeof NavigatorAxis];

export interface FrameAxes {
  xb: FrameLookupAxis<CoordBounds, string>;
  yb: FrameLookupAxis<CoordBounds, string>;
  zb: FrameLookupAxis<CoordBounds, string>;
  tb: FrameLookupAxis<CoordBounds, string>;
  xc: FrameLookupAxis<number, number>;
  yc: FrameLookupAxis<number, number>;
  zc: FrameLookupAxis<number, number>;
  tc: FrameLookupAxis<Timestamp, string>;
}

/**
 * Indexes a collection of frames.
 */
export class FrameIndex {
  readonly #index: ArrayMapIndex<number, EditableFrame>;

  /**
   * An array containing the elements.
   */
  get elements(): readonly EditableFrame[] {
    return this.#index.elements;
  }

  /**
   * The number of elements in this index.
   */
  get length(): number {
    return this.#index.length;
  }

  /**
   * The number of elements in this index.
   */
  get size(): number {
    return this.#index.size;
  }

  #getXBounds = (frame: EditableFrame): CoordBounds =>
    frame.getSpatialBounds().xBounds;
  #getYBounds = (frame: EditableFrame): CoordBounds =>
    frame.getSpatialBounds().yBounds;
  #getZBounds = (frame: EditableFrame): CoordBounds =>
    frame.getSpatialBounds().zBounds;
  #getTBounds = (frame: EditableFrame): CoordBounds =>
    frame.getTimestampBounds();

  #getXCenter = (frame: EditableFrame): number | null =>
    frame.getSpatialCenter().x;
  #getYCenter = (frame: EditableFrame): number | null =>
    frame.getSpatialCenter().y;
  #getZCenter = (frame: EditableFrame): number | null =>
    frame.getSpatialCenter().z;
  #getTCenter = (frame: EditableFrame): Timestamp | null =>
    frame.getTimestampCenter();

  #boundsKeyFn = (bounds: CoordBounds): string => `${bounds.min}_${bounds.max}`;
  #boundsSortFn = (bounds: CoordBounds): number =>
    bounds.min ?? bounds.max ?? Number.NEGATIVE_INFINITY;
  // Preserve numeric ordering for spatial centers. Stringifying numbers made
  // fuzzy lookup lexicographic (for example, 5 sorted after 10).
  #spatialCenterKeyFn = (center: number): number => center;
  #timestampCenterKeyFn = (center: Timestamp): string => center.toString();
  #frameKeyFn = (frame: EditableFrame): number => frame.id;

  /**
   * The axes used to index the collection of frames.
   */
  readonly axes: FrameAxes;

  /**
   * Gets an axis used to index the collection of frames.
   *
   * @param axName The name of the axis.
   * @returns The requested axis.
   * @throws {Error} If no such axis exists.
   */
  getAxis(axName: NavigatorAxisType): FrameLookupAxis<any, any> {
    const ax = this.axes[axName];
    if (ax == null) {
      throw new Error(`There is no axis with the given name: ${axName}`);
    }

    return ax;
  }

  readonly #framesById: Map<number, EditableFrame>;

  /**
   * Gets a frame by its unique identifier.
   *
   * @param frameId The unique identifier of the frame.
   * @returns The corresponding frame.
   * @throws {Error} If no such frame exists.
   */
  getById(frameId: number): EditableFrame {
    const frame = this.#framesById.get(frameId);
    if (frame === undefined) {
      throw new Error(`There is no frame with ID: ${frameId}`);
    }

    return frame;
  }

  /**
   * Creates a new index for a collection of frames in a scene.
   *
   * @param elements The reference array containing the
   * elements to index, from which a shallow copy is made.
   */
  constructor(elements: readonly EditableFrame[] = []) {
    this.#index = new ArrayMapIndex(this.#frameKeyFn, elements);

    const factories: Omit<
      Record<keyof FrameAxes, () => FrameAxes[keyof FrameAxes]>,
      "tc"
    > = {
      xb: () =>
        new FrameLookupAxis(
          this.elements,
          this.#getXBounds,
          this.#boundsKeyFn,
          this.#boundsSortFn,
        ),
      yb: () =>
        new FrameLookupAxis(
          this.elements,
          this.#getYBounds,
          this.#boundsKeyFn,
          this.#boundsSortFn,
        ),
      zb: () =>
        new FrameLookupAxis(
          this.elements,
          this.#getZBounds,
          this.#boundsKeyFn,
          this.#boundsSortFn,
        ),
      tb: () =>
        new FrameLookupAxis(
          this.elements,
          this.#getTBounds,
          this.#boundsKeyFn,
          this.#boundsSortFn,
        ),
      xc: () =>
        new FrameLookupAxis(
          this.elements,
          this.#getXCenter,
          this.#spatialCenterKeyFn,
        ),
      yc: () =>
        new FrameLookupAxis(
          this.elements,
          this.#getYCenter,
          this.#spatialCenterKeyFn,
        ),
      zc: () =>
        new FrameLookupAxis(
          this.elements,
          this.#getZCenter,
          this.#spatialCenterKeyFn,
        ),
    };
    const axes = {
      tc: new FrameLookupAxis(
        this.elements,
        this.#getTCenter,
        this.#timestampCenterKeyFn,
      ),
    } as Partial<FrameAxes>;
    for (const [name, factory] of Object.entries(factories) as [
      keyof typeof factories,
      (typeof factories)[keyof typeof factories],
    ][]) {
      Object.defineProperty(axes, name, {
        configurable: true,
        enumerable: true,
        get() {
          const axis = factory();
          Object.defineProperty(axes, name, {
            enumerable: true,
            value: axis,
          });
          return axis;
        },
      });
    }
    this.axes = axes as FrameAxes;

    this.#framesById = new Map(elements.map((e) => [e.id, e]));
  }

  /**
   * Tests whether an element exists in the collection.
   *
   * @param element The query element.
   * @returns `true` if the element exists; otherwise, `false`.
   */
  has(element: EditableFrame): boolean {
    return this.#index.hasKeyOf(element);
  }

  /**
   * Gets each frame within a range of a reference value along each axis.
   *
   * For each axis, if the reference value is `null`, only frames that also have
   * a `null` value are returned; otherwise, only frames that are within the maximum distance
   * (inclusive) along that axis are returned.
   *
   * @param value The reference value along each axis.
   * @param idxRange For each axis, the reference value
   * and maximum  distance from the index of that value to query; if `null`, instead queries the
   * frames that also have a `null` value. If an axis is not specified, it is excluded from the
   * search.
   * @param options The options to apply to the search.
   * @returns The requested frames.
   */
  findInRangeOfValue(
    value: {
      xb: CoordBounds | null;
      yb: CoordBounds | null;
      zb: CoordBounds | null;
      tb: CoordBounds | null;
      xc: number | null;
      yc: number | null;
      zc: number | null;
      tc: Timestamp | null;
    },
    idxRange: Partial<Record<NavigatorAxisType, number>>,
    options: AxisSearchOptions & IndexSearchOptions = {},
  ): readonly EditableFrame[] {
    const aggType = options.aggType ?? "intersect";
    const aggFunc =
      aggType === "intersect" ? _.intersection.bind(_) : _.union.bind(_);

    const framesInRangePerAxis = Object.values(NavigatorAxis).map((axName) => {
      const idxRangeAx = idxRange[axName];
      if (idxRangeAx == null) return [];

      return (
        this.axes[axName] as FrameLookupAxis<any, any>
      ).findInRangeOfValue(value[axName], idxRangeAx, options);
    });

    return aggFunc(...framesInRangePerAxis);
  }

  /**
   * Gets each frame within a range of a reference frame along each axis.
   *
   * For each axis, if the value of the reference frame is `null`, only frames that also have
   * a `null` value are returned; otherwise, only frames that are within the maximum distance
   * (inclusive) along that axis are returned.
   *
   * @param frame The reference frame.
   * @param idxRange For each axis, the maximum distance from the index of the reference frame
   * to query; if `null`, instead queries the frames that also have a `null` value.
   * If an axis is not specified, it is excluded from the search.
   * @param options The options to apply to the search.
   * @returns The requested frames.
   */
  findInRangeOfFrame(
    frame: EditableFrame,
    idxRange: Partial<Record<NavigatorAxisType, number>>,
    options: AxisSearchOptions & IndexSearchOptions = {},
  ): readonly EditableFrame[] {
    const aggType = options.aggType ?? "intersect";
    const aggFunc =
      aggType === "intersect" ? _.intersection.bind(_) : _.union.bind(_);

    const framesInRangePerAxis = Object.values(NavigatorAxis).map((axName) => {
      const idxRangeAx = idxRange[axName];
      if (idxRangeAx == null) return [];

      return (
        this.axes[axName] as FrameLookupAxis<any, any>
      ).findInRangeOfFrame(frame, idxRangeAx, options);
    });

    return aggFunc(...framesInRangePerAxis);
  }

  /**
   * Computes the distance between two frames, in terms of a Cartesian space
   * formed from the index of each frame along each axis.
   *
   * Frames may have an index of `null` as described in {@link FrameLookupAxis#getFrameIdx}.
   * In that case, the distance between `null` and itself is zero,
   * while the distance between `null` and a number is infinity.
   *
   * @param a The first frame.
   * @param b The second frame.
   * @param options The options to apply to the search.
   * @returns The index-based distance between the two frames.
   */
  frameIdxDistance(
    a: EditableFrame,
    b: EditableFrame,
    options: AxisSearchOptions = {},
  ): number {
    const idxDistancePerAxis = Object.values(NavigatorAxis).map((axName) =>
      (this.axes[axName] as FrameLookupAxis<any, any>).frameIdxDistance(
        a,
        b,
        options,
      ),
    );

    return Math.hypot(...idxDistancePerAxis);
  }
}

/**
 * Navigates between scenes in a task.
 */
export class SceneNavigator extends Navigator<EditableFrame, FrameIndex> {
  #loadGeneration = 0;

  #taskId: number | null;

  /**
   * The unique identifier of the currently active task.
   */
  get taskId(): number | null {
    return this.#taskId;
  }

  #sourceGroupId: number | null;

  /**
   * The unique identifier of the currently active source group.
   */
  get sourceGroupId(): number | null {
    return this.#sourceGroupId;
  }

  #labelBranchId: number | null;

  /**
   * The unique identifier of the currently active label branch.
   */
  get labelBranchId(): number | null {
    return this.#labelBranchId;
  }

  /**
   * The frames available to the task.
   */
  get frames(): FrameIndex {
    return this.index;
  }

  /**
   * The number of frames available to the task.
   */
  get numFrames(): number {
    return this.numElements;
  }

  /**
   * The currently selected frame, or `null` if none.
   */
  get frame(): EditableFrame | null {
    return this.selected;
  }

  set frame(value: EditableFrame | null) {
    this.selected = value;
  }

  /**
   * The unique identifier of the selected frame;
   * set this property to select the corresponding frame.
   */
  get frameId(): number | null {
    return this.#getIdOfFrame(this.frame);
  }

  set frameId(value: number | null) {
    this.frame = this.#getFrameFromId(value);
  }

  #getFrameFromId(frameId: number | null): EditableFrame | null {
    if (frameId == null) return null;

    return this.frames.getById(frameId);
  }

  #getIdOfFrame(frame: EditableFrame | null): number | null {
    if (frame == null) return null;

    return frame.id;
  }

  protected hasElement(element: EditableFrame): boolean {
    return this.index.has(element);
  }

  protected createIndex(elements: readonly EditableFrame[]): FrameIndex {
    return new FrameIndex(elements);
  }

  /**
   * Creates a new scene navigator for a task with its index already loaded.
   *
   * @param views The interface of the application with the server.
   * @param taskId The unique identifier of the task under which each scene is accessed.
   * @param sourceGroupId The unique identifier of the source group
   * under which each scene is accessed.
   * @param labelBranchId The unique identifier of the label branch
   * under which each scene is accessed.
   * @returns A promise that resolves to the newly created navigator.
   */
  static async create(
    views: EditorViews,
    taskId: number | null,
    sourceGroupId: number | null,
    labelBranchId: number | null,
  ): Promise<SceneNavigator> {
    const nav = new SceneNavigator(views);

    await nav.load(taskId, sourceGroupId, labelBranchId);

    return nav;
  }

  /**
   * Creates a new scene navigator for a task.
   *
   * @param views The interface of the application with the server.
   */
  constructor(views: EditorViews) {
    super(views, new FrameIndex());

    this.#taskId = null;
    this.#sourceGroupId = null;
    this.#labelBranchId = null;
  }

  /**
   * Loads the index of this navigator.
   *
   * @param taskId The unique identifier of the task under which each scene is accessed.
   * @param sourceGroupId The unique identifier of the source group
   * under which each scene is accessed.
   * @param labelBranchId The unique identifier of the label branch
   * under which each scene is accessed.
   * @param deferFrameSelection `true` to load the scene without displaying any
   * of its frames. The initial load defers so the frame can be chosen after the
   * source group and label branch it belongs to are known, which keeps a single
   * frame displayed per load.
   */
  async load(
    taskId: number | null,
    sourceGroupId: number | null,
    labelBranchId: number | null,
    loadedFrames?: FrameState[],
    deferFrameSelection?: boolean,
  ) {
    const generation = ++this.#loadGeneration;
    const { views } = this;

    const frames =
      taskId == null || sourceGroupId == null || labelBranchId == null
        ? []
        : (
            loadedFrames ??
            (await views.getFrames(taskId, sourceGroupId, labelBranchId))
          ).map((frame) => new EditableFrame(views, frame));
    if (generation !== this.#loadGeneration) return;

    this.#taskId = taskId;
    this.#sourceGroupId = sourceGroupId;
    this.#labelBranchId = labelBranchId;
    this.rebuildIndex(frames);
    this.frame = deferFrameSelection
      ? null
      : (this.frames.elements.at(0) ?? null);
  }
}
