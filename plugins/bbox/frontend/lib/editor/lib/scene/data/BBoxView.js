import _ from 'lodash';
import * as Collections from 'typescript-collections';

import { TypeUtils } from 'sta/common/utils';
import { BaseOperation, LabelDataView, Placeholder, WindowDataLoader } from 'sta/services/editor/base';

import { BoxOps, TrackOps } from './labelset';

import { BaseBBoxIndex, BBoxIndexView, cleanBoxParams, cleanTrackParams } from './BBoxIndex';
import { BBoxLookup } from './BBoxLookup';

/* eslint-disable max-len */
/**
 * @typedef {import('sta/common/utils').Timestamp} Timestamp
 */

/**
 * @typedef {import('sta/services/editor/base').SceneContext<any>} SceneContext
 */

/**
 * @typedef {import('sta/services/editor/base').EditableFrame} EditableFrame
 */

/**
 * @typedef {import('../../../../label/lib').DistinctiveLevel} DistinctiveLevel
 */

/**
 * @typedef {import('../../../../label/lib').OcclusionLevel} OcclusionLevel
 */

/**
 * @template P
 * @template {{} | null} R
 * @typedef {import('./labelset').BBoxOperation<P, R>} BBoxOperation
 */

/**
 * @typedef {import('./labelset/box').BoxPose} BoxPose
 */

/**
 * @typedef {import('./models').UUID} UUID
 */

/**
 * @typedef {import('./LabelBox').BoxType} BoxType
 */

/**
 * @typedef {import('./LabelBox').ReadonlyLabelBox} ReadonlyLabelBox
 */

/**
 * @typedef {import('./LabelClass').ReadonlyLabelClass} ReadonlyLabelClass
 */

/**
 * @typedef {import('./LabelTrack').ReadonlyLabelTrack} ReadonlyLabelTrack
 */

/**
 * @typedef {import('./BBoxIndex').BoxParams} BoxParams
 */

/**
 * @typedef {import('./BBoxIndex').ClassParams} ClassParams
 */

/**
 * @typedef {import('./BBoxIndex').TrackParams} TrackParams
 */

/**
 * @typedef {import('./BBoxIndex').ReadonlyBBoxIndex} ReadonlyBBoxIndex
 */

/**
 * @typedef {import('./BBoxIndex').BBoxIndex} BBoxIndex
 */

/**
 * @typedef {import('./BBoxLookup').BBoxData} BBoxData
 */
/* eslint-enable max-len */

/**
 * Given a frame, loads bounding box labels composed from the data for that single frame
 * as well as that for neighbouring frames.
 * 
 * @augments {WindowDataLoader<BaseBBoxIndex, BBoxData>}
 */
export class BBoxLoader extends WindowDataLoader {

    /**
     * Finds the data for each frame.
     * 
     * @override
     * @readonly
     * @type {BBoxLookup}
     */
    lookup;

    /**
     * Creates a new data loader for a sliding window of frames.
     * 
     * @param {BBoxLookup} lookup Finds the data for each frame.
     * @param {SceneContext} context Represents the active scene.
     * @param {number} timeWidth The width of the window along the time axis.
     */
    constructor(lookup, context, timeWidth) {
        super(lookup, context, timeWidth);

        this.lookup = lookup;
    }

    /**
     * Combines the data from individual frames into a window.
     *
     * @protected
     * @param {ReadonlyArray<BBoxData>} windowData The data to combine.
     * @returns {BaseBBoxIndex} The combined data.
     */
    combineData(windowData) {
        // De-duplicate model instances
        const classesById = new Map(windowData
            .flatMap(({ classes }) => classes)
            .map((labelClass) => [labelClass.id, labelClass]),
        );
        const tracksById = new Map(windowData
            .flatMap(({ tracks }) => tracks)
            .map((track) => [track.id, track]),
        );
        const boxesById = new Map(windowData
            .flatMap(({ boxes }) => boxes)
            .map((map) => [map.id, map]),
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
 * 
 * @augments LabelDataView<ReadonlyBBoxIndex>
 */
export class BBoxView extends LabelDataView {

    /**
     * Loads the data from the backend on demand.
     * 
     * @readonly
     * @type {BBoxLoader}
     */
    #loader;

    /**
     * The maximum distance (inclusive, according to time index) from
     * the active frame for which to display the labels.
     * 
     * @type {number}
     */
    get timeIdxRange() { return this.#loader.timeWidth; }

    set timeIdxRange(value) {
        if (this.#loader.timeWidth === value) return;

        this.#loader.timeWidth = value;

        this._reloadData();
    }

    /**
     * Returns each timestamp for which to display the labels, omitting `null` values.
     * 
     * @returns {Timestamp[]} The requested list of timestamps.
     */
    #getTimestampsInRange() {
        const framesInWindow = (this.frame == null) ? []
            : this.#loader.getFramesInWindow(this.frame);

        return framesInWindow
            .flatMap(({ st_bounds: stBounds }) => [stBounds.min_timestamp, stBounds.max_timestamp])
            .filter(TypeUtils.isNotNull);
    }

    /**
     * Returns the minimum timestamp for which to display the labels.
     * 
     * @returns {?Timestamp} The minimum timestamp, or `null` if there is none.
     */
    getMinTimestampInRange() {
        return _.minBy(this.#getTimestampsInRange(), (ts) => ts.getTime()) ?? null;
    }

    /**
     * Returns the minimum timestamp for which to display the labels.
     * 
     * @returns {?Timestamp} The maximum timestamp, or `null` if there is none.
     */
    getMaxTimestampInRange() {
        return _.maxBy(this.#getTimestampsInRange(), (ts) => ts.getTime()) ?? null;
    }

    /**
     * For each branch, contains all of the labels that have been loaded so far.
     * 
     * This is used to ensure that labels loaded from the server do not
     * overwrite the local changes.
     * 
     * @readonly
     * @type {Collections.DefaultDictionary<number, BaseBBoxIndex>}
     */
    #branchIndexes;

    /**
     * Requests that data be loaded in memory for a frame, and returns it.
     * 
     * @param {EditableFrame} frame The frame to load the data for.
     * @returns {Promise<?ReadonlyBBoxIndex>} A promise that resolves to the
     * requested data; fallbacks to `null` if the request has failed.
     */
    async getData(frame) {
        const data = await super.getData(frame);
        if (data == null) return null;

        const branchData = this.#branchIndexes.getValue(frame.label_branch_id);

        // Add all of the data to the branch-wide index so it contains all loaded data
        // (unless the data has been deleted locally)
        const classesToAdd = [...data.iterLabelClasses()]
            .filter((labelClass) => !branchData.hasLabelClass(labelClass.id, true));
        const tracksToAdd = [...data.iterLabelTracks()]
            .filter((track) => !branchData.hasLabelTrack(track.id, true));
        const boxesToAdd = [...data.iterLabelBoxes()]
            .filter((box) => !branchData.hasLabelBox(box.id, true));

        branchData.addBulk({
            classes: classesToAdd,
            tracks: tracksToAdd,
            boxes: boxesToAdd,
        });

        const validFrames = this.#loader.getFramesInWindow(frame);
        return new BBoxIndexView(branchData, validFrames);
    }

    /**
     * @type {?BBoxIndex}
     */
    get #index() {
        const index = this.data;
        if (index == null) return null;

        // We avoid exposing the modifiable version to external classes
        // @ts-expect-error
        return index;
    }

    /**
     * @readonly
     * @type {BBoxIndex}
     */
    #emptyIndex;

    /**
     * @type {BBoxIndex}
     */
    get #indexWithFallback() { return this.#index ?? this.#emptyIndex; }

    /**
     * Iterates through each object class in this collection.
     * 
     * @returns {IterableIterator<ReadonlyLabelClass>} An iterator that yields such items.
     */
    iterLabelClasses() { return this.#indexWithFallback.iterLabelClasses(); }

    /**
     * Tests whether an object class exists in this collection.
     * 
     * @param {number} id The query unique identifier.
     * @returns {boolean} `true` if the object class exists; otherwise, `false`.
     */
    hasLabelClass(id) { return this.#indexWithFallback.hasLabelClass(id); }

    /**
     * Gets an object class in this collection by its unique identifier.
     * 
     * @param {number} id The query unique identifier.
     * @returns {ReadonlyLabelClass} The corresponding object class.
     */
    getLabelClass(id) { return this.#indexWithFallback.getLabelClass(id); }

    /**
     * Iterates through each bounding box in this collection.
     * 
     * @returns {IterableIterator<ReadonlyLabelBox>} An iterator that yields such items.
     */
    iterLabelBoxes() { return this.#indexWithFallback.iterLabelBoxes(); }

    /**
     * Tests whether a bounding box exists in this collection.
     * 
     * @param {UUID} id The query unique identifier.
     * @returns {boolean} `true` if the bounding box exists; otherwise, `false`.
     */
    hasLabelBox(id) { return this.#indexWithFallback.hasLabelBox(id); }

    /**
     * Gets a bounding box in this collection by its unique identifier.
     * 
     * @param {UUID} id The query unique identifier.
     * @returns {ReadonlyLabelBox} The corresponding bounding box.
     */
    getLabelBox(id) { return this.#indexWithFallback.getLabelBox(id); }

    /**
     * Iterates through each object track in this collection.
     * 
     * @returns {IterableIterator<ReadonlyLabelTrack>} An iterator that yields such items.
     */
    iterLabelTracks() { return this.#indexWithFallback.iterLabelTracks(); }

    /**
     * Tests whether an object track exists in this collection.
     * 
     * @param {UUID} id The query unique identifier.
     * @returns {boolean} `true` if the object track exists; otherwise, `false`.
     */
    hasLabelTrack(id) { return this.#indexWithFallback.hasLabelTrack(id); }

    /**
     * Gets an object track in this collection by its unique identifier.
     * 
     * @param {UUID} id The query unique identifier.
     * @returns {ReadonlyLabelTrack} The corresponding object track.
     */
    getLabelTrack(id) { return this.#indexWithFallback.getLabelTrack(id); }

    /**
     * Creates a new view of bounding box labels that updates based on the active frame.
     * 
     * @param {SceneContext} context A handle to the state of the scene.
     * @param {number} timeWidth The width of the window along the time axis, which controls
     * the range of frames from the active frame to display data for.
     * @returns {BBoxView} The newly created data view.
     */
    static create(context, timeWidth) {
        const { config, views } = context;
        const lookup = BBoxLookup.create(config, views);
        const loader = new BBoxLoader(lookup, context, timeWidth);

        return new BBoxView(loader, context);
    }

    /**
     * Creates a new view of bounding box labels that updates based on the active frame.
     * 
     * @param {BBoxLoader} loader Loads the data from the server on
     * demand.
     * @param {SceneContext} context A handle to the state of the scene.
     */
    constructor(loader, context) {
        super(loader, context);

        this.#loader = loader;

        const config = loader.lookup.receiver.config;
        this.#branchIndexes = new Collections.DefaultDictionary(
            () => new BaseBBoxIndex(config, {}),
            (id) => id.toString(),
        );
        this.#emptyIndex = new BaseBBoxIndex(config, {});
    }

    /**
     * @type {Set<ReadonlyLabelBox>}
     */
    #localBoxes = new Set();

    /**
     * Constructs a bounding box, adding it to this collection.
     * 
     * Unlike {@link BBoxView#addLabelBox}, the remote dataset remains unaffected.
     * 
     * Items added in this way can only be deleted through
     * {@link BBoxView#deleteLabelBoxLocalOnly}.
     * 
     * @param {Omit<BoxParams, 'id'>} params Parameters to initialize the bounding box.
     * @returns {ReadonlyLabelBox} The newly created bounding box.
     */
    addLabelBoxLocalOnly(params) {
        if (this.#index == null) {
            console.error(this);
            throw new Error('There is no index to add the box to');
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
     * 
     * @param {ReadonlyLabelBox} box The bounding box to remove.
     */
    deleteLabelBoxLocalOnly(box) {
        if (this.#index == null) {
            console.error(this);
            throw new Error('There is no index to delete the box from');
        }

        if (!this.#localBoxes.has(box)) {
            console.error(box);
            throw new Error('This box was not constructed through addLabelBoxLocalOnly');
        }

        this.#index.deleteLabelBox(box);
        this.#localBoxes.delete(box);
    }

    /**
     * Sets the display parameters of an object track.
     * 
     * This method can be used to update items added through both
     * {@link BBoxView#addLabelTrack} and {@link BBoxView#addLabelTrackLocalOnly}.
     * 
     * @param {ReadonlyLabelTrack} track The object track to update.
     * @param {Pick<Partial<TrackParams>, 'minTimestamp' | 'maxTimestamp'>
     * } params The parameters to assign.
     */
    setLabelTrackDisplayParams(track, params) {
        if (this.#index == null) {
            console.error(this);
            throw new Error('There is no index to update the track for');
        }

        // Avoid assigning other properties
        const extractedParams = _.pick(params, ['minTimestamp', 'maxTimestamp']);

        this.#index.updateLabelTrack(track, extractedParams);
    }

    /**
     * Sets the display parameters of a bounding box.
     * 
     * This method can be used to update items added through both
     * {@link BBoxView#addLabelBox} and {@link BBoxView#addLabelBoxLocalOnly}.
     * 
     * @param {ReadonlyLabelBox} box The bounding box to update.
     * @param {Pick<Partial<BoxParams>, 'opacity' | 'showForwardIndicator' | 'showFrame'
     * | 'showPerceivedClass' | 'showColor'>} params The parameters to assign.
     */
    setLabelBoxDisplayParams(box, params) {
        if (this.#index == null) {
            console.error(this);
            throw new Error('There is no index to update the box for');
        }

        // Avoid assigning other properties
        const extractedParams = _.pick(params, ['opacity', 'showForwardIndicator', 'showFrame', 'showPerceivedClass', 'showColor']);

        this.#index.updateLabelBox(box, extractedParams);
    }

    /**
     * @type {Set<ReadonlyLabelTrack>}
     */
    #localTracks = new Set();

    /**
     * Constructs an object track, adding it to this collection.
     * 
     * Unlike {@link BBoxView#addLabelTrack}, the remote dataset remains unaffected.
     * 
     * Items added in this way can only be deleted through
     * {@link BBoxView#deleteLabelTrackLocalOnly}.
     * 
     * @param {Omit<TrackParams, 'id'>} params Parameters to initialize the object track.
     * @returns {ReadonlyLabelTrack} The newly created object track.
     */
    addLabelTrackLocalOnly(params) {
        if (this.#index == null) {
            console.error(this);
            throw new Error('There is no index to add the track to');
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
     * 
     * @param {UUID} trackId The track id to search for.
     * @returns {boolean} True if track is found otherwise; false.
     */
    hasLabelTrackLocalOnly(trackId) {
        if (this.#index == null) {
            console.error(this);
            throw new Error('There is no index to add the track to');
        }

        const track = this.#index.getLabelTrack(trackId);

        return this.#localTracks.has(track);
    }

    /**
     * Finds a track in local set by track id.
     * 
     * Items that have been added in through
     * {@link BBoxView#addLabelTrackLocalOnly}.
     * 
     * @param {UUID} trackId The track id to search for.
     * @returns {ReadonlyLabelTrack} The retrived track.
     */
    getLabelTrackLocalOnly(trackId) {
        if (this.#index == null) {
            console.error(this);
            throw new Error('There is no index to add the track to');
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
     * 
     * @param {ReadonlyLabelTrack} track The object track to remove.
     */
    deleteLabelTrackLocalOnly(track) {
        if (this.#index == null) {
            console.error(this);
            throw new Error('There is no index to delete the track from');
        }

        if (!this.#localTracks.has(track)) {
            console.error(track);
            throw new Error('This box was not constructed through addLabelTrackLocalOnly');
        }

        this.#index.deleteLabelTrack(track);
        this.#localTracks.delete(track);
    }

    static Operation = (
        /**
         * Abstract base implementation of {@link Operation}.
         * 
         * @template P The parameter type of the operation.
         * @template {{} | null} R The return type of the operation.
         * @augments {BaseOperation<BBoxView, P, R>}
         */
        class extends BaseOperation {

            /**
             * The wrapped operation.
             * 
             * @readonly
             * @type {BBoxOperation<P, R>}
             */
            op;

            /**
             * The display name of this operation.
             * 
             * @type {string}
             */
            get displayName() { return this.op.displayName; }

            /**
             * The name of this operation, which is sent to the backend.
             * 
             * @type {string}
             */
            get opName() { return this.op.opName; }

            /**
             * The result of this operation, expressed as a {@link Placeholder}.
             * 
             * It is resolved with the value returned from the backend after it is pushed there.
             * 
             * @type {?Placeholder<R>}
             */
            get opResult() { return this.op.opResult; }

            /**
             * Creates a new operation by wrapping an operation that acts on
             * bounding box labels.
             * 
             * @param {BBoxView} dataView A handle to the data modified by the
             * operation.
             * @param {BBoxOperation<P, R>} op The operation to wrap.
             */
            constructor(dataView, op) {
                super(dataView, op.opParams);

                this.op = op;
            }

            /**
             * Applies this operation to the local data.
             */
            applyLocal() {
                // We apply the operation in this roundabout way to avoid exposing
                // the mutable index
                const index = this.dataView.#index;
                if (index == null) {
                    console.warn('Attempted to apply operation when there is no available data:');
                    console.warn(this);
                    return;
                }

                this.op.applyIndex(index);
            }

            /**
             * Reverts the changes applied by this operation to the local data.
             */
            undoLocal() {
                // We apply the operation in this roundabout way to avoid exposing
                // the mutable index
                const index = this.dataView.#index;
                if (index == null) {
                    console.warn('Attempted to apply operation when there is no available data:');
                    console.warn(this);
                    return;
                }

                this.op.undoIndex(index);
            }
        }
    );

    /**
     * Constructs a bounding box, adding it to this collection.
     * 
     * @param {Omit<BoxParams, 'id'>} params Parameters to initialize the bounding box.
     * @returns {Promise<ReadonlyLabelBox>} A promise that resolves to the newly created bounding
     * box.
     */
    async addLabelBox(params) {
        const createOp = BoxOps.Create.fromParams(params);
        const op = new BBoxView.Operation(this, createOp);

        await this.currentBranch?.apply(op);

        const box = createOp.newBox;
        if (box === undefined) {
            throw new Error('Failed to apply operation');
        }

        return box;
    }

    /**
     * Assigns an object track to a bounding box in this collection.
     * 
     * @param {ReadonlyLabelBox} box The bounding box to update.
     * @param {?ReadonlyLabelTrack} track The object track to assign.
     */
    async updateLabelBoxParentTrack(box, track) {
        const updateOp = BoxOps.AssignEntity.fromParams(box, track);
        const op = new BBoxView.Operation(this, updateOp);

        await this.currentBranch?.apply(op);
    }

    /**
     * Assigns an object class to a bounding box in this collection.
     * 
     * @param {ReadonlyLabelBox} box The bounding box to update.
     * @param {?ReadonlyLabelClass} labelClass The object class to assign.
     */
    async updateLabelBoxPerceivedClass(box, labelClass) {
        const updateOp = BoxOps.AssignClass.fromParams(box, labelClass);
        const op = new BBoxView.Operation(this, updateOp);

        await this.currentBranch?.apply(op);
    }

    /**
     * Assigns a type to a bounding box in this collection.
     * 
     * @param {ReadonlyLabelBox} box The bounding box to update.
     * @param {BoxType} boxType The type of bounding box to assign.
     */
    async updateLabelBoxType(box, boxType) {
        const updateOp = BoxOps.AssignType.fromParams(box, boxType);
        const op = new BBoxView.Operation(this, updateOp);

        await this.currentBranch?.apply(op);
    }

    /**
     * Assigns a distinctiveness level to a bounding box in this collection.
     * 
     * @param {ReadonlyLabelBox} box The bounding box to update.
     * @param {DistinctiveLevel} distinctiveLv The distinctiveness level to assign.
     */
    async updateLabelBoxDistinctiveLv(box, distinctiveLv) {
        const updateOp = BoxOps.AssignDistinctiveLv.fromParams(box, distinctiveLv);
        const op = new BBoxView.Operation(this, updateOp);

        await this.currentBranch?.apply(op);
    }

    /**
     * Assigns an occlusion level to a bounding box in this collection.
     * 
     * @param {ReadonlyLabelBox} box The bounding box to update.
     * @param {OcclusionLevel} occlusionLv The occlusion level to assign.
     */
    async updateLabelBoxOcclusionLv(box, occlusionLv) {
        const updateOp = BoxOps.AssignOcclusionLv.fromParams(box, occlusionLv);
        const op = new BBoxView.Operation(this, updateOp);

        await this.currentBranch?.apply(op);
    }

    /**
     * Registers that a bounding box in this collection has been transformed.
     * 
     * @param {ReadonlyLabelBox} box The bounding box that has been transformed.
     * @param {string} mode The mode of transformation.
     * @param {BoxPose} pose The pose to assign to the bounding box.
     */
    async updateLabelBoxTransform(box, mode, pose) {
        const updateOp = BoxOps.TransformBox.fromParams(box, mode, pose);
        const op = new BBoxView.Operation(this, updateOp);

        await this.currentBranch?.apply(op);
    }

    /**
     * Removes a bounding box from this collection.
     * 
     * @param {ReadonlyLabelBox} box The bounding box to remove.
     */
    async deleteLabelBox(box) {
        const deleteOp = BoxOps.Delete.fromParams(box);
        const op = new BBoxView.Operation(this, deleteOp);

        await this.currentBranch?.apply(op);
    }

    /**
     * Constructs an object track, and adds it to this collection.
     * 
     * @param {Omit<TrackParams, 'id'>} params Parameters to initialize the object track.
     * @returns {Promise<ReadonlyLabelTrack>} A promise that resolves to newly created object track.
     */
    async addLabelTrack(params) {
        const createOp = TrackOps.Create.fromParams(params);
        const op = new BBoxView.Operation(this, createOp);

        await this.currentBranch?.apply(op);

        const track = createOp.newTrack;
        if (track === undefined) {
            throw new Error('Failed to apply operation');
        }

        return track;
    }

    /**
     * Assigns an object class to an object track in this collection.
     * 
     * @param {ReadonlyLabelTrack} track The object track to update.
     * @param {?ReadonlyLabelClass} labelClass The object class to assign.
     */
    async updateLabelTrackGtClass(track, labelClass) {
        const updateOp = TrackOps.AssignClass.fromParams(track, labelClass);
        const op = new BBoxView.Operation(this, updateOp);

        await this.currentBranch?.apply(op);
    }

    /**
     * Assigns the low reflectivity indicator to an object track in this collection.
     * 
     * @param {ReadonlyLabelTrack} track The object track to update.
     * @param {boolean} isBlack `true` if the object has low reflectivity; otherwise, `false`.
     */
    async updateLabelTrackIsBlack(track, isBlack) {
        const updateOp = TrackOps.AssignIsBlack.fromParams(track, isBlack);
        const op = new BBoxView.Operation(this, updateOp);

        await this.currentBranch?.apply(op);
    }

    /**
     * Removes an object track from this collection.
     * 
     * @param {ReadonlyLabelTrack} track The object track to remove.
     */
    async deleteLabelTrack(track) {
        const deleteOp = TrackOps.Delete.fromParams(track);
        const op = new BBoxView.Operation(this, deleteOp);

        await this.currentBranch?.apply(op);
    }
}
