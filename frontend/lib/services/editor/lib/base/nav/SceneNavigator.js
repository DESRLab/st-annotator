import _ from 'lodash';
import * as THREE from 'three';
import * as Collections from 'typescript-collections';

import { CollectionUtils, TypeUtils } from '../../../../../common/lib/utils';

import { ArrayMapIndex } from './ArrayMapIndex';
import { EditableFrame } from './EditableFrame';

/**
 * @typedef {import('../../../../../common/lib/spatial').CoordBounds} CoordBounds
 */

/**
 * @typedef {import('../../../../../common/lib/utils').Timestamp} Timestamp
 */

/**
 * @typedef {import('../../../../../common/lib/utils').Hashable} Hashable
 */

/**
 * @typedef {import('../views').EditorViews} EditorViews
 */

/**
 * @typedef {object} AxisSearchOptions
 * @property {boolean} [fuzzy=false] If `true`, the input frame need not exist along this
 * axis; the result of the search then returns the closest frames to the value of the input frame
 * along this axis.
 */

/**
 * @typedef {object} IndexSearchOptions
 * @property {'intersect' | 'union'} [aggType=intersect] If `'intersect'`, only frames that are
 * in range for every specified axis are returned; if `'union'`, frames that are in range for
 * any specified axis are returned.
 */

/**
 * Helper class to lookup a frame along an axis.
 * 
 * @template {number | string | object} T The type of value stored in the axis.
 * @template {Hashable | number | string | null | undefined} H The type of key for looking up
 * axis values.
 */
export class FrameLookupAxis {

    /**
     * An array containing the frames that are being indexed.
     * 
     * @readonly
     * @type {ReadonlyArray<EditableFrame>}
     */
    frames;

    /**
     * A function that computes the value of a frame along this axis;
     * return `null` to exclude the frame from being selected through indexing.
     * 
     * @readonly
     * @type {(frame: EditableFrame) => ?T}
     */
    getValue;

    /**
     * A function that computes the hashable key of a value along the axis.
     * 
     * @readonly
     * @type {(value: T) => H}
     */
    toHashableValue;

    /**
     * Creates a new multimap for a collection of frames.
     * 
     * @template P
     * @param {(value: P) => H} toHashable Transforms a value into a hashable key for lookup.
     * @returns {Collections.MultiDictionary<P, EditableFrame>} The newly created multimap.
     */
    #createFrameMultimap(toHashable) {
        return new Collections.MultiDictionary(
            (k) => CollectionUtils.HashMap.tryStringify(toHashable(k)),
        );
    }

    /**
     * Decorates a function so that it additionally accepts a null value, returning
     * `null` in that case.
     * 
     * @template R
     * @param {(v: T) => R} fn The function to decorate.
     * @returns {(v: T | null) => T extends null ? null : R} The decorated function.
     */
    #orNull(fn) {
        // @ts-expect-error
        return (v) => ((v == null) ? null : fn(v));
    }

    /**
     * A mapping of each frame by their value along this axis.
     * 
     * @readonly
     * @type {Collections.MultiDictionary<?T, EditableFrame>}
     */
    #framesByValue;

    /**
     * The available values in this axis (excluding `null`), sorted in ascending order.
     * 
     * @readonly
     * @type {ArrayMapIndex<H, T>}
     */
    #values;

    /**
     * An array containing each value in this axis (excluding `null`), sorted in ascending order.
     * 
     * @type {ReadonlyArray<T>}
     */
    get values() { return this.#values.elements; }

    /**
     * Creates a new axis for indexing a collection of frames.
     * 
     * @param {ReadonlyArray<EditableFrame>} frames An array containing the frames
     * to index. No copy is made.
     * @param {(frame: EditableFrame) => ?T} getValue A function that computes the
     * value of a frame along the axis; return `null` to exclude the frame from being
     * selected through indexing.
     * @param {(value: T) => H} toHashableValue A function that computes the hashable key of a
     * value along the axis.
     */
    constructor(frames, getValue, toHashableValue) {
        this.frames = frames;
        this.getValue = getValue;
        this.toHashableValue = toHashableValue;

        const framesByValue = this.#createFrameMultimap(this.#orNull(toHashableValue));
        for (const frame of frames) {
            const axisValue = this.getValue(frame);
            framesByValue.setValue(axisValue, frame);
        }
        this.#framesByValue = framesByValue;

        const values = [...framesByValue.keys()].filter(TypeUtils.isNotNull);
        this.#values = new ArrayMapIndex(toHashableValue, values);
    }

    /**
     * Iterates through the frames stored along this axis.
     * 
     * @yields {[T, ReadonlyArray<EditableFrame>]} A value along this axis,
     * with the corresponding frames. Note that frames associated with `null` along
     * this axis are omitted.
     */
    * iterFrames() {
        for (const k of this.#framesByValue.keys()) {
            if (k != null) {
                /**
                 * @type {[T, ReadonlyArray<EditableFrame>]}
                 */
                const entry = [k, this.findbyAxisValue(k)];

                yield entry;
            }
        }
    }

    /**
     * Gets each frame with the given value along this axis.
     * 
     * @param {?T} value The query value; this can be `null`.
     * @returns {ReadonlyArray<EditableFrame>} The requested frames.
     * May be empty if the no frames have the given value.
     */
    findbyAxisValue(value) {
        return this.#framesByValue.getValue(value);
    }

    /**
     * Gets each frame which index along this axis falls in the interval
     * `[idx - idxRange, idx + idxRange]`.
     * 
     * @param {number} idx The query index.
     * @param {number} idxRange The maximum distance from `idx` to query.
     * @returns {ReadonlyArray<EditableFrame>} The requested frames.
     */
    findInIdxRange(idx, idxRange) {
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
     * @param {?T} value The query value.
     * @param {AxisSearchOptions} options The options to apply to the search.
     * @returns {?number} The index of the value frame along this axis; or
     * `null` if the value is `null`.
     */
    getValueIdx(value, options = {}) {
        if (value == null) return null;

        const key = this.#values.getKey(value);

        const fuzzy = options.fuzzy ?? false;
        if (fuzzy) {
            const sortedKeys = this.#values.elements.map((v) => this.#values.getKey(v));
            return _.sortedIndex(sortedKeys, key);
        }

        return this.#values.getIdxOfKey(key);
    }

    /**
     * Gets the index of a frame along this axis.
     * 
     * @param {EditableFrame} frame The query frame.
     * @param {AxisSearchOptions} options The options to apply to the search.
     * @returns {?number} The index of the given frame along this axis; or
     * `null` if the value of the given frame along this axis is `null`.
     */
    getFrameIdx(frame, options = {}) {
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
     * @param {?T} value The query value.
     * @param {number} idxRange The maximum distance from `idx` to query.
     * @param {AxisSearchOptions} options The options to apply to the search.
     * @returns {ReadonlyArray<EditableFrame>} The requested frames.
     */
    findInRangeOfValue(value, idxRange, options = {}) {
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
     * @param {EditableFrame} frame The query frame.
     * @param {number} idxRange The maximum distance from `idx` to query.
     * @param {AxisSearchOptions} options The options to apply to the search.
     * @returns {ReadonlyArray<EditableFrame>} The requested frames.
     */
    findInRangeOfFrame(frame, idxRange, options = {}) {
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
     * @param {EditableFrame} a The first frame.
     * @param {EditableFrame} b The second frame.
     * @param {AxisSearchOptions} options The options to apply to the search.
     * @returns {number} The index-based distance between the two frames.
     */
    frameIdxDistance(a, b, options = {}) {
        const aIdx = this.getFrameIdx(a, options);
        const bIdx = this.getFrameIdx(b, options);

        if (aIdx == null && bIdx == null) return 0;
        if (aIdx == null || bIdx == null) return Number.POSITIVE_INFINITY;

        return Math.abs(aIdx - bIdx);
    }
}

/**
 * Represents an axis used to index the frames in {@link FrameIndex}.
 * 
 * @readonly
 * @enum {'xb' | 'yb' | 'zb' | 'tb' | 'xc' | 'yc' | 'zc' | 'tc'}
 */
export const NavigatorAxis = Object.freeze({
    /**
     * The `x`-boundaries of each frame.
     */
    X_BOUNDS: 'xb',

    /**
     * The `y`-boundaries of each frame.
     */
    Y_BOUNDS: 'yb',

    /**
     * The `z`-boundaries of each frame.
     */
    Z_BOUNDS: 'zb',

    /**
     * The `t`-boundaries of each frame.
     */
    T_BOUNDS: 'tb',

    /**
     * The center `x`-coordinate of each frame.
     */
    X_CENTER: 'xc',

    /**
     * The center `y`-coordinate of each frame.
     */
    Y_CENTER: 'yc',

    /**
     * The center `z`-coordinate of each frame.
     */
    Z_CENTER: 'zc',

    /**
     * The center `t`-coordinate of each frame.
     */
    T_CENTER: 'tc',
});

/**
 * Indexes a collection of frames.
 */
export class FrameIndex {

    /**
     * @readonly
     * @type {ArrayMapIndex<string, EditableFrame>}
     */
    #index;

    /**
     * An array containing the elements.
     * 
     * @type {ReadonlyArray<EditableFrame>}
     */
    get elements() { return this.#index.elements; }

    /**
     * The number of elements in this index.
     * 
     * @type {number}
     */
    get length() { return this.#index.length; }

    /**
     * The number of elements in this index.
     * 
     * @type {number}
     */
    get size() { return this.#index.size; }

    /**
     * Gets the boundaries along the `x` axis of a frame.
     * 
     * @param {EditableFrame} frame The input frame. 
     * @returns {CoordBounds} The boundaries of the input frame.
     */
    #getXBounds = (frame) => frame.st_bounds.getSpatialBounds().xBounds;

    /**
     * Gets the boundaries along the `y` axis of a frame.
     * 
     * @param {EditableFrame} frame The input frame. 
     * @returns {CoordBounds} The boundaries of the input frame.
     */
    #getYBounds = (frame) => frame.st_bounds.getSpatialBounds().yBounds;

    /**
     * Gets the boundaries along the `z` axis of a frame.
     * 
     * @param {EditableFrame} frame The input frame. 
     * @returns {CoordBounds} The boundaries of the input frame.
     */
    #getZBounds = (frame) => frame.st_bounds.getSpatialBounds().zBounds;

    /**
     * Gets the boundaries along the `t` axis of a frame.
     * 
     * @param {EditableFrame} frame The input frame. 
     * @returns {CoordBounds} The boundaries of the input frame.
     */
    #getTBounds = (frame) => frame.st_bounds.getTimestampBounds();

    /**
     * Gets the center along the `x` axis of a frame.
     * 
     * @param {EditableFrame} frame The input frame. 
     * @returns {?number} The center of the input frame.
     */
    #getXCenter = (frame) => frame.getSpatialCenter().x;

    /**
     * Gets the boundcenteraries along the `y` axis of a frame.
     * 
     * @param {EditableFrame} frame The input frame. 
     * @returns {?number} The center of the input frame.
     */
    #getYCenter = (frame) => frame.getSpatialCenter().y;

    /**
     * Gets the center along the `z` axis of a frame.
     * 
     * @param {EditableFrame} frame The input frame. 
     * @returns {?number} The center of the input frame.
     */
    #getZCenter = (frame) => frame.getSpatialCenter().z;

    /**
     * Gets the center along the `t` axis of a frame.
     * 
     * @param {EditableFrame} frame The input frame. 
     * @returns {?Timestamp} The center of the input frame.
     */
    #getTCenter = (frame) => frame.getTimestampCenter();

    /**
     * @type {(bounds: CoordBounds) => string}
     */
    #boundsKeyFn = (bounds) => `${bounds.min}_${bounds.max}`;

    /**
     * @type {(center: number | Timestamp) => string}
     */
    #centerKeyFn = (center) => center.toString();

    /**
     * @type {(frame: EditableFrame) => string}
     */
    #frameKeyFn = (frame) => frame.hash();

    /**
     * The axes used to index the collection of frames.
     * 
     * @readonly
     * @type {{
     *     xb: FrameLookupAxis<CoordBounds, string>;
     *     yb: FrameLookupAxis<CoordBounds, string>;
     *     zb: FrameLookupAxis<CoordBounds, string>;
     *     tb: FrameLookupAxis<CoordBounds, string>;
     *     xc: FrameLookupAxis<number, string>;
     *     yc: FrameLookupAxis<number, string>;
     *     zc: FrameLookupAxis<number, string>;
     *     tc: FrameLookupAxis<Timestamp, string>;
     * }}
     */
    axes;

    /**
     * Gets an axis used to index the collection of frames.
     * 
     * @param {NavigatorAxis} axName The name of the axis.
     * @returns {FrameLookupAxis<any, any>} The requested axis.
     * @throws {Error} If no such axis exists.
     */
    getAxis(axName) {
        /**
         * @type {FrameLookupAxis<any, any> | undefined}
         */
        const ax = this.axes[axName];
        if (ax == null) {
            throw new Error(`There is no axis with the given name: ${axName}`);
        }

        return ax;
    }

    /**
     * @readonly
     * @type {Map<number, EditableFrame>}
     */
    #framesById;

    /**
     * Gets a frame by its unique identifier.
     * 
     * @param {number} frameId The unique identifier of the frame.
     * @returns {EditableFrame} The corresponding frame.
     * @throws {Error} If no such frame exists.
     */
    getById(frameId) {
        const frame = this.#framesById.get(frameId);
        if (frame === undefined) {
            throw new Error(`There is no frame with ID: ${frameId}`);
        }

        return frame;
    }

    /**
     * Creates a new index for a collection of frames in a scene.
     * 
     * @param {ReadonlyArray<EditableFrame>} elements The reference array containing the
     * elements to index, from which a shallow copy is made.
     */
    constructor(elements = []) {
        this.#index = new ArrayMapIndex(this.#frameKeyFn, elements);

        this.axes = {
            xb: new FrameLookupAxis(this.elements, this.#getXBounds, this.#boundsKeyFn),
            yb: new FrameLookupAxis(this.elements, this.#getYBounds, this.#boundsKeyFn),
            zb: new FrameLookupAxis(this.elements, this.#getZBounds, this.#boundsKeyFn),
            tb: new FrameLookupAxis(this.elements, this.#getTBounds, this.#boundsKeyFn),
            xc: new FrameLookupAxis(this.elements, this.#getXCenter, this.#centerKeyFn),
            yc: new FrameLookupAxis(this.elements, this.#getYCenter, this.#centerKeyFn),
            zc: new FrameLookupAxis(this.elements, this.#getZCenter, this.#centerKeyFn),
            tc: new FrameLookupAxis(this.elements, this.#getTCenter, this.#centerKeyFn),
        };

        this.#framesById = new Map(elements.map((e) => [e.id, e]));
    }

    /**
     * Tests whether an element exists in the collection.
     * 
     * @param {EditableFrame} element The query element.
     * @returns {boolean} `true` if the element exists; otherwise, `false`.
     */
    has(element) {
        return this.#index.hasKeyOf(element);
    }

    /**
     * Gets each frame within a range of a reference value along each axis.
     * 
     * For each axis, if the reference value is `null`, only frames that also have
     * a `null` value are returned; otherwise, only frames that are within the maximum distance
     * (inclusive) along that axis are returned.
     * 
     * @param {{
     *      xb: ?CoordBounds;
     *      yb: ?CoordBounds;
     *      zb: ?CoordBounds;
     *      tb: ?CoordBounds;
     *      xc: ?number;
     *      yc: ?number;
     *      zc: ?number;
     *      tc: ?Timestamp;
     * }} value The reference value along each axis.
     * @param {Partial<Record<NavigatorAxis, number>>} idxRange For each axis, the reference value
     * and maximum  distance from the index of that value to query; if `null`, instead queries the
     * frames that also have a `null` value. If an axis is not specified, it is excluded from the
     * search.
     * @param {AxisSearchOptions & IndexSearchOptions} options The options to apply to the search.
     * @returns {ReadonlyArray<EditableFrame>} The requested frames.
     */
    findInRangeOfValue(value, idxRange, options = {}) {
        const aggType = options.aggType ?? 'intersect';
        const aggFunc = (aggType === 'intersect') ? _.intersection : _.union;

        const framesInRangePerAxis = Object.values(NavigatorAxis)
            .map((axName) => {
                const idxRangeAx = idxRange[axName];
                if (idxRangeAx == null) return [];

                // @ts-expect-error
                return this.axes[axName].findInRangeOfValue(value[axName], idxRangeAx, options);
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
     * @param {EditableFrame} frame The reference frame.
     * @param {Partial<Record<NavigatorAxis, number>>} idxRange For each axis, the maximum
     * distance from the index of the reference frame to query; if `null`, instead queries the
     * frames that also have a `null` value. If an axis is not specified, it is excluded from the
     * search.
     * @param {AxisSearchOptions & IndexSearchOptions} options The options to apply to the search.
     * @returns {ReadonlyArray<EditableFrame>} The requested frames.
     */
    findInRangeOfFrame(frame, idxRange, options = {}) {
        const aggType = options.aggType ?? 'intersect';
        const aggFunc = (aggType === 'intersect') ? _.intersection : _.union;

        const framesInRangePerAxis = Object.values(NavigatorAxis)
            .map((axName) => {
                const idxRangeAx = idxRange[axName];
                if (idxRangeAx == null) return [];

                return this.axes[axName].findInRangeOfFrame(frame, idxRangeAx, options);
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
     * @param {EditableFrame} a The first frame.
     * @param {EditableFrame} b The second frame.
     * @param {AxisSearchOptions} options The options to apply to the search.
     * @returns {number} The index-based distance between the two frames.
     */
    frameIdxDistance(a, b, options = {}) {
        const idxDistancePerAxis = Object.values(NavigatorAxis)
            .map((axName) => this.axes[axName].frameIdxDistance(a, b, options));

        return Math.hypot(...idxDistancePerAxis);
    }
}

/**
 * Defines each event that can be dispatched by {@link SceneNavigatorEvent}.
 * 
 * @typedef {object} SceneNavigatorEventMap
 * @property {{}} change The event when the state of the navigator has been updated.
 */

/**
 * Navigates between scenes in a task.
 * 
 * @augments THREE.EventDispatcher<SceneNavigatorEventMap>
 */
export class SceneNavigator extends THREE.EventDispatcher {

    /**
     * The interface of the application with the server.
     * 
     * @readonly
     * @type {EditorViews}
     */
    views;

    /**
     * @type {?number}
     */
    #taskId;

    /**
     * The unique identifier of the currently active task.
     * 
     * @type {?number}
     */
    get taskId() { return this.#taskId; }

    /**
     * @type {?number}
     */
    #sourceGroupId;

    /**
     * The unique identifier of the currently active source group.
     * 
     * @type {?number}
     */
    get sourceGroupId() { return this.#sourceGroupId; }

    /**
     * @type {?number}
     */
    #labelBranchId;

    /**
     * The unique identifier of the currently active label branch.
     * 
     * @type {?number}
     */
    get labelBranchId() { return this.#labelBranchId; }

    /**
     * @type {FrameIndex}
     */
    #frames;

    /**
     * The frames available to the task.
     * 
     * @type {FrameIndex}
     */
    get frames() { return this.#frames; }

    /**
     * The number of frames available to the task.
     * 
     * @type {number}
     */
    get numFrames() { return this.frames.size; }

    /**
     * @type {?EditableFrame}
     */
    #frame;

    /**
     * The currently selected frame, or `null` if none.
     * 
     * @type {?EditableFrame}
     */
    get frame() { return this.#frame; }

    set frame(value) {
        if (this.#frame !== value) {
            this.#frame = (value != null && this.frames.has(value)) ? value : null;

            this.dispatchEvent({ type: 'change' });
        }
    }

    /**
     * The unique identifier of the selected frame;
     * set this property to select the corresponding frame.
     * 
     * @type {?number}
     */
    get frameId() { return this.#getIdOfFrame(this.frame); }

    set frameId(value) { this.frame = this.#getFrameFromId(value); }

    /**
     * Gets the corresponding frame from its unique identifier.
     * 
     * @param {?number} frameId The query unique identifier, or `null` if none.
     * @returns {?EditableFrame} The requested frame.
     */
    #getFrameFromId(frameId) {
        if (frameId == null) return null;

        return this.frames.getById(frameId);
    }

    /**
     * Gets the unique identifier of a frame.
     * 
     * @param {?EditableFrame} frame The query frame, or `null` if none.
     * @returns {?number} The requested unique identifier.
     */
    #getIdOfFrame(frame) {
        if (frame == null) return null;

        return frame.id;
    }

    /**
     * The `x` boundaries of the selected frame.
     * 
     * @type {?CoordBounds}
     */
    get xBounds() { return this.#getXBounds(this.frame); }

    /**
     * The `y` boundaries of the selected frame.
     * 
     * @type {?CoordBounds}
     */
    get yBounds() { return this.#getYBounds(this.frame); }

    /**
     * The `z` boundaries of the selected frame.
     * 
     * @type {?CoordBounds}
     */
    get zBounds() { return this.#getZBounds(this.frame); }

    /**
     * The `t` boundaries of the selected frame.
     * 
     * @type {?CoordBounds}
     */
    get tBounds() { return this.#getTBounds(this.frame); }

    /**
     * The `x` center of the selected frame.
     * 
     * @type {?number}
     */
    get xCenter() { return this.#getXCenter(this.frame); }

    /**
     * The `y` center of the selected frame.
     * 
     * @type {?number}
     */
    get yCenter() { return this.#getYCenter(this.frame); }

    /**
     * The `z` center of the selected frame.
     * 
     * @type {?number}
     */
    get zCenter() { return this.#getZCenter(this.frame); }

    /**
     * The `t` center of the selected frame.
     * 
     * @type {?Timestamp}
     */
    get tCenter() { return this.#getTCenter(this.frame); }

    /**
     * Gets the `x` boundaries of a frame.
     * 
     * @param {?EditableFrame} frame The query frame, or `null` if none.
     * @returns {?CoordBounds} The requested boundaries.
     */
    #getXBounds(frame) {
        if (frame == null) return null;

        return this.frames.axes.xb.getValue(frame);
    }

    /**
     * Gets the `y` boundaries of a frame.
     * 
     * @param {?EditableFrame} frame The query frame, or `null` if none.
     * @returns {?CoordBounds} The requested boundaries.
     */
    #getYBounds(frame) {
        if (frame == null) return null;

        return this.frames.axes.yb.getValue(frame);
    }

    /**
     * Gets the `z` boundaries of a frame.
     * 
     * @param {?EditableFrame} frame The query frame, or `null` if none.
     * @returns {?CoordBounds} The requested boundaries.
     */
    #getZBounds(frame) {
        if (frame == null) return null;

        return this.frames.axes.zb.getValue(frame);
    }

    /**
     * Gets the `t` boundaries of a frame.
     * 
     * @param {?EditableFrame} frame The query frame, or `null` if none.
     * @returns {?CoordBounds} The requested boundaries.
     */
    #getTBounds(frame) {
        if (frame == null) return null;

        return this.frames.axes.tb.getValue(frame);
    }

    /**
     * Gets the `x` center of a frame.
     * 
     * @param {?EditableFrame} frame The query frame, or `null` if none.
     * @returns {?number} The requested center.
     */
    #getXCenter(frame) {
        if (frame == null) return null;

        return this.frames.axes.xc.getValue(frame);
    }

    /**
     * Gets the `y` center of a frame.
     * 
     * @param {?EditableFrame} frame The query frame, or `null` if none.
     * @returns {?number} The requested center.
     */
    #getYCenter(frame) {
        if (frame == null) return null;

        return this.frames.axes.yc.getValue(frame);
    }

    /**
     * Gets the `z` center of a frame.
     * 
     * @param {?EditableFrame} frame The query frame, or `null` if none.
     * @returns {?number} The requested center.
     */
    #getZCenter(frame) {
        if (frame == null) return null;

        return this.frames.axes.zc.getValue(frame);
    }

    /**
     * Gets the `t` center of a frame.
     * 
     * @param {?EditableFrame} frame The query frame, or `null` if none.
     * @returns {?Timestamp} The requested center.
     */
    #getTCenter(frame) {
        if (frame == null) return null;

        return this.frames.axes.tc.getValue(frame);
    }

    /**
     * Creates a new scene navigator for a task with its index already loaded.
     * 
     * @param {EditorViews} views The interface of the application with the server.
     * @param {?number} taskId The unique identifier of the task under which each scene is accessed.
     * @param {?number} sourceGroupId The unique identifier of the source group
     * under which each scene is accessed.
     * @param {?number} labelBranchId The unique identifier of the label branch
     * under which each scene is accessed.
     * @returns {Promise<SceneNavigator>} A promise that resolves to the newly created
     * navigator.
     */
    static async create(views, taskId, sourceGroupId, labelBranchId) {
        const nav = new SceneNavigator(views);

        await nav.load(taskId, sourceGroupId, labelBranchId);

        return nav;
    }

    /**
     * Creates a new scene navigator for a task.
     * 
     * @param {EditorViews} views The interface of the application with the server.
     */
    constructor(views) {
        super();

        this.views = views;
        this.#taskId = null;
        this.#sourceGroupId = null;
        this.#labelBranchId = null;

        this.#frames = new FrameIndex();
    }

    /**
     * Loads the index of this navigator.
     * 
     * @param {?number} taskId The unique identifier of the task under which each scene is accessed.
     * @param {?number} sourceGroupId The unique identifier of the source group
     * under which each scene is accessed.
     * @param {?number} labelBranchId The unique identifier of the label branch
     * under which each scene is accessed.
     */
    async load(taskId, sourceGroupId, labelBranchId) {
        const { views } = this;

        const frames = (taskId == null || sourceGroupId == null || labelBranchId == null)
            ? []
            : (await views.getFrames(taskId, sourceGroupId, labelBranchId))
                .map((frame) => new EditableFrame(views, frame));

        this.#taskId = taskId;
        this.#sourceGroupId = sourceGroupId;
        this.#labelBranchId = labelBranchId;
        this.#frames = new FrameIndex(frames);
        this.#frame = this.#frames.elements.at(0) ?? null;

        this.dispatchEvent({ type: 'change' });
    }
}
