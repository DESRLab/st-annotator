import * as Collections from 'typescript-collections';
import _ from 'lodash';

import { BaseOperation, LabelDataView, Placeholder, WindowDataLoader } from 'sta/services/editor/base';

import { VectorOps } from './labelset';
import { BaseVectorIndex, VectorIndexView, cleanVectorParams } from './VectorIndex';
import { VectorLookup } from './VectorLookup';

/* eslint-disable max-len */
/**
 * @typedef {import('sta/services/editor/base').SceneContext<any>} SceneContext
 */

/**
 * @typedef {import('sta/services/editor/base').EditableFrame} EditableFrame
 */

/**
 * @template P
 * @template {{} | null} R
 * @typedef {import('./labelset').VectorOperation<P, R>} VectorOperation
 */

/**
 * @typedef {import('./models').UUID} UUID
 */

/**
 * @typedef {import('./LabelVector').VectorType} VectorType
 */

/**
 * @typedef {import('./LabelVector').ReadonlyLabelVector} ReadonlyLabelVector
 */

/**
 * @typedef {import('./LabelClass').ReadonlyLabelClass} ReadonlyLabelClass
 */

/**
 * @typedef {import('./VectorIndex').VectorParams} VectorParams
 */

/**
 * @typedef {import('./VectorIndex').ClassParams} ClassParams
 */

/**
 * @typedef {import('./VectorIndex').ReadonlyVectorIndex} ReadonlyVectorIndex
 */

/**
 * @typedef {import('./VectorIndex').VectorIndex} VectorIndex
 */

/**
 * @typedef {import('./VectorLookup').VectorData} VectorData
 */

/**
 * Given a frame, loads object vector object labels composed from the data that single frame
 * as well as that for neighbouring frames.
 * 
 * @augments {WindowDataLoader<BaseVectorIndex, VectorData>}
 */
export class VectorLoader extends WindowDataLoader {

    /**
     * Finds the data for each frame.
     * 
     * @override
     * @readonly
     * @type {VectorLookup}
     */
    lookup;

    /**
     * Creates a new data loader for a sliding window of frames.
     * 
     * @param {VectorLookup} lookup Finds the data for each frame.
     * @param {SceneContext} context Represents the active scene.
     * @param {number} timeWidth The width of the window along the time axis.
     */
    constructor(lookup, context, timeWidth) {
        super(lookup, context, timeWidth);

        this.lookup = lookup;
    }

    /**
     * Combines the data individual frames into a window.
     * 
     * @protected 
     * @param {ReadonlyArray<VectorData>} windowData The data to combine.
     * @returns {BaseVectorIndex} The combined data.
     */
    combineData(windowData) {
        const classesById = new Map(windowData
            .flatMap(({ classes }) => classes)
            .map((labelClass) => [labelClass.id, labelClass]),
        );

        const vectorsById = new Map(windowData
            .flatMap(({ vectors }) => vectors)
            .map((map) => [map.id, map]),
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
 * @augments LabelDataView<ReadonlyVectorIndex>
 */
export class VectorView extends LabelDataView {

    /**
     * Loads the data from the backend on demand.
     * 
     * @readonly
     * @type {VectorLoader}
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
     * For each branch, contains all of the labels that have been loaded so far.
     * 
     * This is used to ensure that labels loaded from the server do not
     * overwrite the local changes.
     * 
     * @readonly
     * @type {Collections.DefaultDictionary<number, BaseVectorIndex>}
     */
    #branchIndexes;

    /**
     * Requests that data be loaded in memory for a frame, and returns it.
     * 
     * @param {EditableFrame} frame The frame to load the data for.
     * @returns {Promise<?ReadonlyVectorIndex>} A promise that resolves to the
     * reqyested data; fallbacks to `null` if the request has failed.
     */
    async getData(frame) {
        const data = await super.getData(frame);
        if (data == null) return null;

        const branchData = this.#branchIndexes.getValue(frame.label_branch_id);

        const classesToAdd = [...data.iterLabelClasses()]
            .filter((labelClass) => !branchData.hasLabelClass(labelClass.id, true));

        const vectorsToAdd = [...data.iterLabelVectors()]
            .filter((vector) => !branchData.hasLabelVector(vector.id));

        branchData.addBulk({
            classes: classesToAdd,
            vectors: vectorsToAdd,
        });

        const validFrames = this.#loader.getFramesInWindow(frame);
        return new VectorIndexView(branchData, validFrames);
    }

    /**
     * @type {?VectorIndex}
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
     * @type {VectorIndex}
     */
    #emptyIndex;

    /**
     * @type {VectorIndex}
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
     * Iterates through each vector object in this collection.
     * 
     * @returns {IterableIterator<ReadonlyLabelVector>} An iterator that yields such items.
     */
    iterLabelVectors() { return this.#indexWithFallback.iterLabelVectors(); }

    /**
     * Tests whether a vector object exists in this collection.
     * 
     * @param {UUID} id The query unique identifier.
     * @returns {boolean} `true` if the vector object exists; otherwise, `false`.
     */
    hasLabelVector(id) { return this.#indexWithFallback.hasLabelVector(id); }

    /**
     * Gets a vector obejct in this collection by its unique identifier.
     * 
     * @param {UUID} id  The query unique identifier.
     * @returns {ReadonlyLabelVector} The corresponding vector object.
     */
    getLabelVector(id) { return this.#indexWithFallback.getLabelVector(id); }

    /**
     * Creates a new view of vector labels that updates based on the active frame.
     * 
     * @param {SceneContext} context A handle to the state of the scene.
     * @param {number} timeWidth The width of the window along the time axis, which controls
     * the range of frames from the active frame to display data for.
     * @returns {VectorView} The newly created data view.
     */
    static create(context, timeWidth) {
        const { config, views } = context;
        const lookup = VectorLookup.create(config, views);
        const loader = new VectorLoader(lookup, context, timeWidth);

        return new VectorView(loader, context);
    }

    /**
     * Creates a new view of vector labels that updates based on the active frame.
     * 
     * @param {VectorLoader} loader Loads the data from the server on
     * demand.
     * @param {SceneContext} context A handle to the state of the scene.
     */
    constructor(loader, context) {
        super(loader, context);

        this.#loader = loader;

        const config = loader.lookup.receiver.config;
        this.#branchIndexes = new Collections.DefaultDictionary(
            () => new BaseVectorIndex(config, {}),
            (id) => id.toString(),
        );
        this.#emptyIndex = new BaseVectorIndex(config, {});
    }

    /**
     * @type {Set<ReadonlyLabelVector>}
     */
    #localVectors = new Set();

    /**
     * Constructs a vector object, adding it to this collection.
     * unlike {@link VectorView#addLabelVector}, remote dataset remains unaffected.
     * 
     * Items add in this way can only be deleted through.
     * {@link VectorView#deleteLabelVectorLocalOnly}
     * 
     * @param {Omit<VectorParams, 'id'>} params Parameters to initialize the vector object.
     * @returns {ReadonlyLabelVector} The new created vector object.s
     */
    addLabelVectorLocalOnly(params) {
        if (this.#index == null) {
            console.error(this);
            throw new Error('There is no index to add the vector object to');
        }

        const vector = this.#index.addLabelVector({
            id: new Placeholder(),
            ...cleanVectorParams(params),
        });

        this.#localVectors.add(vector);

        return vector;
    }

    /**
     * renmoves a vector object, adding it to this collection.
     * unlike {@link VectorView#deleteLabelVector}, remote dataset remains unaffected.
     * 
     * Items add in this way can only be added through.
     * {@link VectorView#addLabelVectorLocalOnly}
     * 
     * @param {ReadonlyLabelVector} vector The vector object to remove.
     */
    deleteLabelVectorLocalOnly(vector) {
        if (this.#index == null) {
            console.error(this);
            throw new Error('There is no index to delete the vector object from');
        }

        if (!this.#localVectors.has(vector)) {
            console.error(vector);
            throw new Error('This vector was not constructed through addLabelVectorLocalOnly');
        }

        this.#index.deleteLabelVector(vector);
        this.#localVectors.delete(vector);
    }

    /**
     * Sets the display parameters of a vector label.
     * 
     * This method can be used to update items added through both
     * {@link VectorView#addLabelVector} and {@link VectorView#addLabelVectorLocalOnly}.
     * 
     * @param {ReadonlyLabelVector} vector The vector obejct to update.
     * @param {Pick<Partial<VectorParams>, 'showColor'>} params The parameters to assign.
     */
    setLabelVectorDisplayParams(vector, params) {
        if (this.#index == null) {
            console.error(this);
            throw new Error('There is no index to update the vector for');
        }

        const extractedParams = _.pick(params, ['showColor']);

        this.#index.updateLabelVector(vector, extractedParams);
    }

    static Operation = (

        /**
         * Abstract base implementation of {@link Operation}
         * 
         * @template P The parameter type of operation.
         * @template {{} | null} R The return type of the operation.
         * @augments {BaseOperation<VectorView, P, R>}
         */
        class extends BaseOperation {

            /**
             * The wrapped operation.
             * 
             * @readonly
             * @type {VectorOperation<P, R>}
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
             * vector object labels.
             * 
             * @param {VectorView} dataView A handle to the data modified by the
             * operation.
             * @param {VectorOperation<P, R>} op The operation to wrap.
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
     * Constructs a vector obejct, adding it to this collection.
     * 
     * @param {Omit<VectorParams, 'id'>} params Paramerts to initialize the vector object.
     * @returns {Promise<ReadonlyLabelVector>} A promise that resolves the 
     * newly created vector object.
     */
    async addLabelVector(params) {
        const createOp = VectorOps.Create.fromParams(params);
        const op = new VectorView.Operation(this, createOp);
        await this.currentBranch?.apply(op);

        const vector = createOp.newVector;

        if (vector === undefined) {
            throw new Error('Failed to apply operation');
        }
        return vector;
    }

    /**
     * Assigns an object class to a vector object in this collection.
     * 
     * @param {ReadonlyLabelVector} vector The vector object to update. 
     * @param {?ReadonlyLabelClass} labelClass The vector class to assign.
     */
    async updateLabelVectorGtClass(vector, labelClass) {
        const updateOp = VectorOps.AssignClass.fromParams(vector, labelClass);
        const op = new VectorView.Operation(this, updateOp);

        await this.currentBranch?.apply(op);
    }

    /**
     * 
     * @param {ReadonlyLabelVector} vector The vector object to update.
     * @param {string} mode The mode of editing the vector geometry shape.
     * @param {VectorType} vectorType The geometry shape type to assign.
     * @param {ReadonlyArray<Readonly<THREE.Vector3>>} vertices The vertices to
     * reshape the vector object.
     */
    async updateLabelVectorGeometry(vector, mode, vectorType, vertices) {
        const updateOp = VectorOps.EditVectorGeometry.fromParams(vector, mode,
            { type: vectorType, vertices: vertices },
        );
        const op = new VectorView.Operation(this, updateOp);

        await this.currentBranch?.apply(op);
    }

    /**
     * Removes a vector object from this collection.
     * 
     * @param {ReadonlyLabelVector} vector The vector object to remove
     */
    async deleteLabelVector(vector) {
        const deleteOp = VectorOps.Delete.fromParams(vector);
        const op = new VectorView.Operation(this, deleteOp);

        await this.currentBranch?.apply(op);
    }
}
