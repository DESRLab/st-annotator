import _ from 'lodash';
import * as Collections from 'typescript-collections';

import { TypeUtils } from 'sta/common/utils';
import { BaseOperation, LabelDataView, Placeholder, WindowDataLoader } from 'sta/services/editor/base';

import { SelectionOps, InstanceOps } from './labelset';

import { BaseSegmentationIndex, SegmentationIndexView, cleanSelectionParams, cleanInstanceParams } from './SegmentationIndex';
import { SegmentationLookup } from './SegmentationLookup';

/* eslint-disable max-len */
/**
 * @typedef {import('three')} THREE
 */

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
 * @typedef {import('./labelset').SegmentationOperation<P, R>} SegmentationOperation
 */

/**
 * @typedef {import('./labelset/selection').PointSelection} PointSelection
 */

/**
 * @typedef {import('./models').UUID} UUID
 */

/**
 * @typedef {import('./LabelSelection').ReadonlyLabelSelection} ReadonlyLabelSelection
 */

/**
 * @typedef {import('./LabelClass').ReadonlyLabelClass} ReadonlyLabelClass
 */

/**
 * @typedef {import('./LabelInstance').ReadonlyLabelInstance} ReadonlyLabelInstance
 */

/**
 * @typedef {import('./SegmentationIndex').SelectionParams} SelectionParams
 */

/**
 * @typedef {import('./SegmentationIndex').ClassParams} ClassParams
 */

/**
 * @typedef {import('./SegmentationIndex').InstanceParams} InstanceParams
 */

/**
 * @typedef {import('./SegmentationIndex').ReadonlySegmentationIndex} ReadonlySegmentationIndex
 */

/**
 * @typedef {import('./SegmentationIndex').SegmentationIndex} SegmentationIndex
 */

/**
 * @typedef {import('./SegmentationLookup').SegmentationData} SegmentationData
 */
/* eslint-enable max-len */

/**
 * Given a frame, loads object instanceing labels composed from the data for that single frame
 * as well as that for neighbouring frames.
 * 
 * @augments {WindowDataLoader<BaseSegmentationIndex, SegmentationData>}
 */
export class SegmentationLoader extends WindowDataLoader {

    /**
     * Finds the data for each frame.
     * 
     * @override
     * @readonly
     * @type {SegmentationLookup}
     */
    lookup;

    /**
     * Creates a new data loader for a sliding window of frames.
     * 
     * @param {SegmentationLookup} lookup Finds the data for each frame.
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
     * @param {ReadonlyArray<SegmentationData>} windowData The data to combine.
     * @returns {BaseSegmentationIndex} The combined data.
     */
    combineData(windowData) {
        // De-duplicate model instances
        const classesById = new Map(windowData
            .flatMap(({ classes }) => classes)
            .map((labelClass) => [labelClass.id, labelClass]),
        );
        const instancesById = new Map(windowData
            .flatMap(({ instances }) => instances)
            .map((instance) => [instance.id, instance]),
        );
        const selectionsById = new Map(windowData
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
 * 
 * @augments LabelDataView<ReadonlySegmentationIndex>
 */
export class SegmentationView extends LabelDataView {

    /**
     * Loads the data from the backend on demand.
     * 
     * @readonly
     * @type {SegmentationLoader}
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
     * @type {Collections.DefaultDictionary<number, BaseSegmentationIndex>}
     */
    #branchIndexes;

    /**
     * Requests that data be loaded in memory for a frame, and returns it.
     * 
     * @param {EditableFrame} frame The frame to load the data for.
     * @returns {Promise<?ReadonlySegmentationIndex>} A promise that resolves to the
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
        const instancesToAdd = [...data.iterLabelInstances()]
            .filter((instance) => !branchData.hasLabelInstance(instance.id, true));
        const selectionsToAdd = [...data.iterLabelSelections()]
            .filter((selection) => !branchData.hasLabelSelection(selection.id, true));

        branchData.addBulk({
            classes: classesToAdd,
            instances: instancesToAdd,
            selections: selectionsToAdd,
        });

        const validFrames = this.#loader.getFramesInWindow(frame);
        return new SegmentationIndexView(branchData, validFrames);
    }

    /**
     * @type {?SegmentationIndex}
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
     * @type {SegmentationIndex}
     */
    #emptyIndex;

    /**
     * @type {SegmentationIndex}
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
     * Iterates through each a selection in this collection.
     * 
     * @returns {IterableIterator<ReadonlyLabelSelection>} An iterator that yields such items.
     */
    iterLabelSelections() { return this.#indexWithFallback.iterLabelSelections(); }

    /**
     * Tests whether a selection exists in this collection.
     * 
     * @param {UUID} id The query unique identifier.
     * @returns {boolean} `true` if the a selection exists; otherwise, `false`.
     */
    hasLabelSelection(id) { return this.#indexWithFallback.hasLabelSelection(id); }

    /**
     * Gets a selection in this collection by its unique identifier.
     * 
     * @param {UUID} id The query unique identifier.
     * @returns {ReadonlyLabelSelection} The corresponding a selection.
     */
    getLabelSelection(id) { return this.#indexWithFallback.getLabelSelection(id); }

    /**
     * Iterates through each object instance in this collection.
     * 
     * @returns {IterableIterator<ReadonlyLabelInstance>} An iterator that yields such items.
     */
    iterLabelInstances() { return this.#indexWithFallback.iterLabelInstances(); }

    /**
     * Tests whether an object instance exists in this collection.
     * 
     * @param {UUID} id The query unique identifier.
     * @returns {boolean} `true` if the object instance exists; otherwise, `false`.
     */
    hasLabelInstance(id) { return this.#indexWithFallback.hasLabelInstance(id); }

    /**
     * Gets an object instance in this collection by its unique identifier.
     * 
     * @param {UUID} id The query unique identifier.
     * @returns {ReadonlyLabelInstance} The corresponding object instance.
     */
    getLabelInstance(id) { return this.#indexWithFallback.getLabelInstance(id); }

    /**
     * Creates a new view of object instanceing labels that updates based on the active frame.
     * 
     * @param {SceneContext} context A handle to the state of the scene.
     * @param {number} timeWidth The width of the window along the time axis, which controls
     * the range of frames from the active frame to display data for.
     * @returns {SegmentationView} The newly created data view.
     */
    static create(context, timeWidth) {
        const { config, views } = context;
        const lookup = SegmentationLookup.create(config, views);
        const loader = new SegmentationLoader(lookup, context, timeWidth);

        return new SegmentationView(loader, context);
    }

    /**
     * Creates a new view of object instanceing labels that updates based on the active frame.
     * 
     * @param {SegmentationLoader} loader Loads the data from the server on
     * demand.
     * @param {SceneContext} context A handle to the state of the scene.
     */
    constructor(loader, context) {
        super(loader, context);

        this.#loader = loader;

        const config = loader.lookup.receiver.config;
        this.#branchIndexes = new Collections.DefaultDictionary(
            () => new BaseSegmentationIndex(config, {}),
            (id) => id.toString(),
        );
        this.#emptyIndex = new BaseSegmentationIndex(config, {});
    }

    /**
     * @type {Set<ReadonlyLabelSelection>}
     */
    #localSelections = new Set();

    /**
     * Constructs a selection, adding it to this collection.
     * 
     * Unlike {@link SegmentationView#addLabelSelection}, the remote dataset remains unaffected.
     * 
     * Items added in this way can only be deleted through
     * {@link SegmentationView#deleteLabelSelectionLocalOnly}.
     * 
     * @param {Omit<SelectionParams, 'id'>} params Parameters to initialize the a selection.
     * @returns {ReadonlyLabelSelection} The newly created a selection.
     */
    addLabelSelectionLocalOnly(params) {
        if (this.#index == null) {
            console.error(this);
            throw new Error('There is no index to add the selection to');
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
     * Unlike {@link SegmentationView#deleteLabelSelection}, the remote dataset remains unaffected.
     * 
     * This method can only delete items added through
     * {@link SegmentationView#addLabelSelectionLocalOnly}.
     * 
     * @param {ReadonlyLabelSelection} selection The a selection to remove.
     */
    deleteLabelSelectionLocalOnly(selection) {
        if (this.#index == null) {
            console.error(this);
            throw new Error('There is no index to delete the selection from');
        }

        if (!this.#localSelections.has(selection)) {
            console.error(selection);
            throw new Error('This selection was not constructed through addLabelSelectionLocalOnly');
        }

        this.#index.deleteLabelSelection(selection);
        this.#localSelections.delete(selection);
    }

    /**
     * Sets the display parameters of an object instance.
     * 
     * This method can be used to update items added through both
     * {@link BBoxView#addLabelInstance} and {@link BBoxView#addLabelInstanceLocalOnly}.
     * 
     * @param {ReadonlyLabelInstance} instance The object instance to update.
     * @param {Pick<Partial<InstanceParams>, 'minTimestamp' | 'maxTimestamp'>
     * } params The parameters to assign.
     */
    setLabelInstanceDisplayParams(instance, params) {
        if (this.#index == null) {
            console.error(this);
            throw new Error('There is no index to update the instance for');
        }

        // Avoid assigning other properties
        const extractedParams = _.pick(params, ['minTimestamp', 'maxTimestamp']);

        this.#index.updateLabelInstance(instance, extractedParams);
    }

    /**
     * Sets the display parameters of a selection.
     * 
     * This method can be used to update items added through both
     * {@link SegmentationView#addLabelSelection} 
     * and {@link SegmentationView#addLabelSelectionLocalOnly}.
     * 
     * @param {ReadonlyLabelSelection} selection The a selection to update.
     * @param {Pick<Partial<SelectionParams>, 'showPointSize' 
     * | 'showColor' | 'showCenter' | 'showPerceivedClass'>} params The parameters to assign.
     */
    setLabelSelectionDisplayParams(selection, params) {
        if (this.#index == null) {
            console.error(this);
            throw new Error('There is no index to update the selection for');
        }

        // Avoid assigning other properties
        const extractedParams = _.pick(params, ['showPointSize', 'showColor', 'showCenter', 'showPerceivedClass']);

        this.#index.updateLabelSelection(selection, extractedParams);
    }

    /**
     * @type {Set<ReadonlyLabelInstance>}
     */
    #localInstances = new Set();

    /**
     * Constructs an object instance, adding it to this collection.
     * 
     * Unlike {@link SegmentationView#addLabelInstance}, the remote dataset remains unaffected.
     * 
     * Items added in this way can only be deleted through
     * {@link SegmentationView#deleteLabelInstanceLocalOnly}.
     * 
     * @param {Omit<InstanceParams, 'id'>} params Parameters to initialize the object instance.
     * @returns {ReadonlyLabelInstance} The newly created object instance.
     */
    addLabelInstanceLocalOnly(params) {
        if (this.#index == null) {
            console.error(this);
            throw new Error('There is no index to add the instance to');
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
     * Unlike {@link SegmentationView#deleteLabelInstance}, the remote dataset remains unaffected.
     * 
     * This method can only delete items added through
     * {@link SegmentationView#addLabelInstanceLocalOnly}.
     * 
     * @param {ReadonlyLabelInstance} instance The object instance to remove.
     */
    deleteLabelInstanceLocalOnly(instance) {
        if (this.#index == null) {
            console.error(this);
            throw new Error('There is no index to delete the instance from');
        }

        if (!this.#localInstances.has(instance)) {
            console.error(instance);
            throw new Error('This selection was not constructed through addLabelInstanceLocalOnly');
        }

        this.#index.deleteLabelInstance(instance);
        this.#localInstances.delete(instance);
    }

    static Operation = (
        /**
         * Abstract base implementation of {@link Operation}.
         * 
         * @template P The parameter type of the operation.
         * @template {{} | null} R The return type of the operation.
         * @augments {BaseOperation<SegmentationView, P, R>}
         */
        class extends BaseOperation {

            /**
             * The wrapped operation.
             * 
             * @readonly
             * @type {SegmentationOperation<P, R>}
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
             * object instanceing labels.
             * 
             * @param {SegmentationView} dataView A handle to the data modified by the
             * operation.
             * @param {SegmentationOperation<P, R>} op The operation to wrap.
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
     * Constructs a selection, adding it to this collection.
     * 
     * @param {Omit<SelectionParams, 'id'>} params Parameters to initialize the a selection.
     * @returns {Promise<ReadonlyLabelSelection>} A promise that resolves to the newly created a
     * selection.
     */
    async addLabelSelection(params) {
        const createOp = SelectionOps.Create.fromParams(params);
        const op = new SegmentationView.Operation(this, createOp);

        await this.currentBranch?.apply(op);

        const selection = createOp.newSelection;
        if (selection === undefined) {
            throw new Error('Failed to apply operation');
        }

        return selection;
    }

    /**
     * Assigns an object instance to a selection in this collection.
     * 
     * @param {ReadonlyLabelSelection} selection The a selection to update.
     * @param {?ReadonlyLabelInstance} instance The object instance to assign.
     */
    async updateLabelSelectionParentInstance(selection, instance) {
        const updateOp = SelectionOps.AssignEntity.fromParams(selection, instance);
        const op = new SegmentationView.Operation(this, updateOp);

        await this.currentBranch?.apply(op);
    }

    /**
     * Assigns an object class to a selection in this collection.
     * 
     * @param {ReadonlyLabelSelection} selection The a selection to update.
     * @param {?ReadonlyLabelClass} labelClass The object class to assign.
     */
    async updateLabelSelectionPerceivedClass(selection, labelClass) {
        const updateOp = SelectionOps.AssignClass.fromParams(selection, labelClass);
        const op = new SegmentationView.Operation(this, updateOp);

        await this.currentBranch?.apply(op);
    }

    /**
     * Assigns a distinctiveness level to a selection in this collection.
     * 
     * @param {ReadonlyLabelSelection} selection The a selection to update.
     * @param {DistinctiveLevel} distinctiveLv The distinctiveness level to assign.
     */
    async updateLabelSelectionDistinctiveLv(selection, distinctiveLv) {
        const updateOp = SelectionOps.AssignDistinctiveLv.fromParams(selection, distinctiveLv);
        const op = new SegmentationView.Operation(this, updateOp);

        await this.currentBranch?.apply(op);
    }

    /**
     * Assigns an occlusion level to a selection in this collection.
     * 
     * @param {ReadonlyLabelSelection} selection The a selection to update.
     * @param {OcclusionLevel} occlusionLv The occlusion level to assign.
     */
    async updateLabelSelectionOcclusionLv(selection, occlusionLv) {
        const updateOp = SelectionOps.AssignOcclusionLv.fromParams(selection, occlusionLv);
        const op = new SegmentationView.Operation(this, updateOp);

        await this.currentBranch?.apply(op);
    }

    /**
     * Registers that a selection in this collection has been transformed.
     * 
     * @param {ReadonlyLabelSelection} selection The a selection that has been transformed.
     * @param {string} mode The mode of transformation.
     * @param {ReadonlyArray<Readonly<THREE.Vector3>>} newPoints The Point Selection data.
     */
    async updateLabelPointSelection(selection, mode, newPoints) {
        const updateOp = SelectionOps.EditPointSelection
            .fromParams(selection, mode, { points: newPoints });
        const op = new SegmentationView.Operation(this, updateOp);

        await this.currentBranch?.apply(op);
    }

    /**
     * Removes a selection from this collection.
     * 
     * @param {ReadonlyLabelSelection} selection The a selection to remove.
     */
    async deleteLabelSelection(selection) {
        const deleteOp = SelectionOps.Delete.fromParams(selection);
        const op = new SegmentationView.Operation(this, deleteOp);

        await this.currentBranch?.apply(op);
    }

    /**
     * Constructs an object instance, and adds it to this collection.
     * 
     * @param {Omit<InstanceParams, 'id'>} params Parameters to initialize 
     * the object instance.
     * @returns {Promise<ReadonlyLabelInstance>} A promise that resolves 
     * to newly created object instance.
     */
    async addLabelInstance(params) {
        const createOp = InstanceOps.Create.fromParams(params);
        const op = new SegmentationView.Operation(this, createOp);

        await this.currentBranch?.apply(op);

        const instance = createOp.newInstance;
        if (instance === undefined) {
            throw new Error('Failed to apply operation');
        }

        return instance;
    }

    /**
     * Assigns an object class to an object instance in this collection.
     * 
     * @param {ReadonlyLabelInstance} instance The object instance to update.
     * @param {?ReadonlyLabelClass} labelClass The object class to assign.
     */
    async updateLabelInstanceGtClass(instance, labelClass) {
        const updateOp = InstanceOps.AssignClass.fromParams(instance, labelClass);
        const op = new SegmentationView.Operation(this, updateOp);

        await this.currentBranch?.apply(op);
    }

    /**
     * Assigns the low reflectivity indicator to an object instance in this collection.
     * 
     * @param {ReadonlyLabelInstance} instance The object instance to update.
     * @param {boolean} isBlack `true` if the object has low reflectivity; otherwise, `false`.
     */
    async updateLabelInstanceIsBlack(instance, isBlack) {
        const updateOp = InstanceOps.AssignIsBlack.fromParams(instance, isBlack);
        const op = new SegmentationView.Operation(this, updateOp);

        await this.currentBranch?.apply(op);
    }

    /**
     * Removes an object instance from this collection.
     * 
     * @param {ReadonlyLabelInstance} instance The object instance to remove.
     */
    async deleteLabelInstance(instance) {
        const deleteOp = InstanceOps.Delete.fromParams(instance);
        const op = new SegmentationView.Operation(this, deleteOp);

        await this.currentBranch?.apply(op);
    }
}
