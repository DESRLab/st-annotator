import _ from "lodash";

import { CollectionUtils } from "sta/common";

import type { EditableFrame } from "./EditableFrame";
import {
  NavigatorAxis,
  type NavigatorAxisType,
  type FrameIndex,
} from "./SceneNavigator";

/**
 * Represents a function to sort the frames in a {@link FrameIndex} to form a {@link FramePath}.
 *
 * This is a value-based class.
 */
export interface FrameSortFunctionSpec {
  /**
   * Returns a string representation of an object.
   *
   * @returns A string representing this object.
   */
  toString(): string;

  /**
   * Returns a new sorted array containing the provided frames.
   *
   * @param frames Contains the frames to sort.
   * @returns Contains the sorted frames.
   */
  sortedFrames(frames: FrameIndex): readonly EditableFrame[];
}

/**
 * Concrete implementation of {@link FrameSortFunctionSpec}.
 */
class FrameSortFunctionImpl implements FrameSortFunctionSpec {
  /**
   * The axes to sort by, with the first element indicating the primary axes to sort by.
   */
  #axes: readonly NavigatorAxisType[];

  /**
   * Creates a new sort function to construct a {@link FramePath} from a {@link FrameIndex}.
   *
   * @param axes The axes to sort by,
   * with the first element indicating the primary axes to sort by.
   */
  constructor(axes: readonly NavigatorAxisType[]) {
    if (new Set(axes).size !== axes.length) {
      console.error(axes);
      throw new Error("Found duplicate axis name");
    }

    this.#axes = axes;
  }

  /**
   * Returns a string representation of an object.
   *
   * @returns A string representing this object.
   */
  toString(): string {
    return this.#axes.join(" -> ");
  }

  /**
   * Returns a new sorted array containing the provided frames.
   *
   * @param frames Contains the frames to sort.
   * @returns Contains the sorted frames.
   */
  sortedFrames(frames: FrameIndex): readonly EditableFrame[] {
    return _.sortBy(
      frames.elements,
      this.#axes.map((axName: NavigatorAxisType) => {
        switch (axName) {
          case NavigatorAxis.X_BOUNDS:
          case NavigatorAxis.Y_BOUNDS:
          case NavigatorAxis.Z_BOUNDS:
            return (frame: EditableFrame) =>
              frames.axes[axName].getValue(frame)?.center ??
              Number.NEGATIVE_INFINITY;
          case NavigatorAxis.T_BOUNDS:
            return (frame: EditableFrame) =>
              frames.axes[axName].getValue(frame)?.center ??
              Number.NEGATIVE_INFINITY;
          default:
            throw new Error(`Invalid axName: ${axName}`);
        }
      }),
    );
  }
}

/**
 * Represents a function to sort the frames in a {@link FrameIndex} to form a {@link FramePath}.
 */
export const FrameSortFunction: Readonly<
  Record<string, FrameSortFunctionSpec>
> = Object.freeze({
  XYT: new FrameSortFunctionImpl(["xb", "yb", "tb"]),
  XTY: new FrameSortFunctionImpl(["xb", "tb", "yb"]),
  YXT: new FrameSortFunctionImpl(["yb", "xb", "tb"]),
  YTX: new FrameSortFunctionImpl(["yb", "tb", "xb"]),
  TXY: new FrameSortFunctionImpl(["tb", "xb", "yb"]),
  TYX: new FrameSortFunctionImpl(["tb", "yb", "xb"]),
});

/**
 * Type of individual values in {@link FrameSortFunction}.
 */
export type FrameSortFunction = FrameSortFunctionSpec;

/**
 * Represents a sequence of frames making up a path.
 */
export class FramePath {
  #frames: CollectionUtils.ReadonlyArrayMap<string, EditableFrame>;

  /**
   * The frames making up this path.
   */
  get frames(): readonly EditableFrame[] {
    return this.#frames.elements;
  }

  /**
   * The number of frames in this path.
   */
  get length(): number {
    return this.#frames.length;
  }

  /**
   * Apples an offset to an index in this path.
   *
   * @param idx The index from which to offset.
   * @param offset The offset to apply.
   * @returns The resulting index after applying the offset; `null` if the `idx`
   * is null, or if the index would be out of bounds after applying the offset.
   */
  #applyOffsetToIdx(idx: number, offset: number): number | null {
    const offsetIdx = idx + offset;
    if (!_.inRange(offsetIdx, 0, this.length)) return null;

    return offsetIdx;
  }

  /**
   * Creates a new sequence of frames making up a path.
   *
   * @param frames The frames making up the path.
   */
  constructor(frames: readonly EditableFrame[] = []) {
    this.#frames = new CollectionUtils.ReadonlyArrayMap(
      (frame: EditableFrame) => frame.hash(),
      frames,
    );
  }

  /**
   * Tests whether a frame exists in this path.
   *
   * @param frame The query frame.
   * @returns `true` if the frame exists; otherwise, `false`.
   */
  has(frame: EditableFrame): boolean {
    return this.#frames.hasKeyOf(frame);
  }

  /**
   * Gets the index of a frame in this path.
   *
   * @param frame The query frame.
   * @returns The index of the frame in this path, or `null` if the frame
   * does not exist in this path.
   */
  getIdxOf(frame: EditableFrame): number | null {
    if (!this.#frames.hasKeyOf(frame)) return null;

    const key = this.#frames.getKey(frame);
    return this.#frames.getIdxOfKey(key) ?? null;
  }

  /**
   * Gets the frame located at an offset from a reference frame in this path.
   *
   * @param frame The reference frame.
   * @param offset The offset (in terms of index) from the reference frame.
   * @returns The frame that is located at the given offset, or `null`
   * if it does not exist.
   */
  getFrameAtOffset(frame: EditableFrame, offset = 0): EditableFrame | null {
    const frameIdx = this.getIdxOf(frame);
    if (frameIdx == null) return null;

    const offsetIdx = this.#applyOffsetToIdx(frameIdx, offset);
    if (offsetIdx == null) return null;

    return this.#frames.getByIdx(offsetIdx) ?? null;
  }
}
