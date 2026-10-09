import _ from 'lodash';

import { CollectionUtils } from '../../../../../common/lib/utils';
import { NavigatorAxis } from './SceneNavigator';

/**
 * @typedef {import('./EditableFrame').EditableFrame} EditableFrame
 */

/**
 * @typedef {import('./SceneNavigator').FrameIndex} FrameIndex
 */

/**
 * Represents a function to sort the frames in a {@link FrameIndex} to form a {@link FramePath}.
 * 
 * This is a value-based class.
 * 
 * @interface
 */
export class FrameSortFunctionSpec {

    /**
     * Returns a string representation of an object.
     * 
     * @returns {string} A string representing this object.
     * @abstract
     */
    toString() {
        throw new Error('Not implemented');
    }

    /**
     * Returns a new sorted array containing the provided frames.
     * 
     * @param {FrameIndex} frames Contains the frames to sort.
     * @returns {ReadonlyArray<EditableFrame>} Contains the sorted frames.
     * @abstract
     */
    sortedFrames(frames) {
        throw new Error('Not implemented');
    }
}

/**
 * Concrete implementation of {@link FrameSortFunctionSpec}.
 * 
 * @implements {FrameSortFunctionSpec}
 */
class FrameSortFunctionImpl {

    /**
     * The axes to sort by, with the first element indicating the primary axes to sort by.
     * 
     * @type {ReadonlyArray<NavigatorAxis>}
     */
    #axes;

    /**
     * Creates a new sort function to construct a {@link FramePath} from a {@link FrameIndex}.
     * 
     * @param {ReadonlyArray<NavigatorAxis>} axes The axes to sort by,
     * with the first element indicating the primary axes to sort by.
     */
    constructor(axes) {
        if (new Set(axes).size !== axes.length) {
            console.error(axes);
            throw new Error('Found duplicate axis name');
        }

        this.#axes = axes;
    }

    /**
     * Returns a string representation of an object.
     * 
     * @returns {string} A string representing this object.
     */
    toString() {
        return this.#axes.join(' -> ');
    }

    /**
     * Returns a new sorted array containing the provided frames.
     * 
     * @param {FrameIndex} frames Contains the frames to sort.
     * @returns {ReadonlyArray<EditableFrame>} Contains the sorted frames.
     */
    sortedFrames(frames) {
        return _.sortBy(
            frames.elements,
            this.#axes.map(
                /** @type {(axName: NavigatorAxis) => (frame: EditableFrame) => number} */
                ((axName) => {
                    switch (axName) {
                        case NavigatorAxis.X_BOUNDS:
                        case NavigatorAxis.Y_BOUNDS:
                        case NavigatorAxis.Z_BOUNDS:
                            return (frame) => frames.axes[axName].getValue(frame)?.center
                                ?? Number.NEGATIVE_INFINITY;
                        case NavigatorAxis.T_BOUNDS:
                            return (frame) => frames.axes[axName].getValue(frame)?.center
                                ?? Number.NEGATIVE_INFINITY;
                        default:
                            throw new Error(`Invalid axName: ${axName}`);
                    }
                }),
            ),
        );
    }
}

/**
 * Represents a function to sort the frames in a {@link FrameIndex} to form a {@link FramePath}.
 * 
 * @readonly
 * @enum {FrameSortFunctionSpec}
 */
export const FrameSortFunction = Object.freeze({
    XYT: new FrameSortFunctionImpl(['xb', 'yb', 'tb']),
    XTY: new FrameSortFunctionImpl(['xb', 'tb', 'yb']),
    YXT: new FrameSortFunctionImpl(['yb', 'xb', 'tb']),
    YTX: new FrameSortFunctionImpl(['yb', 'tb', 'xb']),
    TXY: new FrameSortFunctionImpl(['tb', 'xb', 'yb']),
    TYX: new FrameSortFunctionImpl(['tb', 'yb', 'xb']),
});

/**
 * Represents a sequence of frames making up a path.
 */
export class FramePath {

    /**
     * @type {CollectionUtils.ReadonlyArrayMap<string, EditableFrame>}
     */
    #frames;

    /**
     * The frames making up this path.
     * 
     * @type {ReadonlyArray<EditableFrame>}
     */
    get frames() { return this.#frames.elements; }

    /**
     * The number of frames in this path.
     * 
     * @type {number}
     */
    get length() { return this.#frames.length; }

    /**
     * Apples an offset to an index in this path.
     * 
     * @param {number} idx The index from which to offset.
     * @param {number} offset The offset to apply.
     * @returns {?number} The resulting index after applying the offset; `null` if the `idx`
     * is null, or if the index would be out of bounds after applying the offset.
     */
    #applyOffsetToIdx(idx, offset) {
        const offsetIdx = idx + offset;
        if (!_.inRange(offsetIdx, 0, this.length)) return null;

        return offsetIdx;
    }

    /**
     * Creates a new sequence of frames making up a path.
     * 
     * @param {ReadonlyArray<EditableFrame>} frames The frames making up the path.
     */
    constructor(frames = []) {
        this.#frames = new CollectionUtils.ReadonlyArrayMap((frame) => frame.hash(), frames);
    }

    /**
     * Tests whether a frame exists in this path.
     * 
     * @param {EditableFrame} frame The query frame.
     * @returns {boolean} `true` if the frame exists; otherwise, `false`.
     */
    has(frame) {
        return this.#frames.hasKeyOf(frame);
    }

    /**
     * Gets the index of a frame in this path.
     * 
     * @param {EditableFrame} frame The query frame.
     * @returns {?number} The index of the frame in this path, or `null` if the frame
     * does not exist in this path.
     */
    getIdxOf(frame) {
        if (!this.#frames.hasKeyOf(frame)) return null;

        const key = this.#frames.getKey(frame);
        return this.#frames.getIdxOfKey(key) ?? null;
    }

    /**
     * Gets the frame located at an offset from a reference frame in this path.
     * 
     * @param {EditableFrame} frame The reference frame.
     * @param {number} offset The offset (in terms of index) from the reference frame.
     * @returns {?EditableFrame} The frame that is located at the given offset, or `null`
     * if it does not exist.
     */
    getFrameAtOffset(frame, offset = 0) {
        const frameIdx = this.getIdxOf(frame);
        if (frameIdx == null) return null;

        const offsetIdx = this.#applyOffsetToIdx(frameIdx, offset);
        if (offsetIdx == null) return null;

        return this.#frames.getByIdx(offsetIdx) ?? null;
    }
}
