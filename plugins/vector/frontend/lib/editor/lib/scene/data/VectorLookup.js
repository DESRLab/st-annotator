import { Data } from 'dataclass';
import { z } from 'zod';

import { FuncUtils, IOUtils } from 'sta/common/utils';
import { BulkDataLookup, BulkDataReceiver } from 'sta/services/editor/base';

import { LabelVectorState, VectorClassSelectionState } from '../../../../label/lib';
import { SENDER_KEY } from '../../config';

/**
 * @typedef {import('sta/services/editor/base').CacheKeyFunc} CacheKeyFunc
 */

/**
 * @typedef {import('sta/services/editor/base').EditorViews} EditorViews
 */

/**
 * @typedef {import('sta/services/editor/base').FrameLike} FrameLike
 */

/**
 * @typedef {import('sta/services/editor/base').EditorConfig} EditorConfig
 */

/**
 * @typedef {import('./VectorIndex').VectorParams} VectorParams
 */

/**
 * @typedef {import('./VectorIndex').ClassParams} ClassParams
 */

/**
 * @typedef {import('./VectorIndex').VectorDataParams} VectorDataParams
 */

/**
 * @typedef {Required<VectorDataParams>} VectorData
 */

export class VectorLabelData extends Data {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = z.object({
        vectors: z.array(LabelVectorState.SCHEMA),
        class_selection: VectorClassSelectionState.SCHEMA.nullable(),
    });

    /**
     * @readonly
     */
    static SCHEMA = this.PLAIN_SCHEMA
        .transform((data) => this.create(data));

    /**
     * @readonly
     * @type {ReadonlyArray<LabelVectorState>}
     */
    vectors;

    /**
     * @readonly
     * @type {?VectorClassSelectionState}
     */
    class_selection;

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {VectorLabelData} The resulting new instance.
     */
    static fromJSON(obj) {
        return this.SCHEMA.parse(obj);
    }
}

/**
 * Receives batches of vector labels from the backend.
 * 
 * @augments BulkDataReceiver<VectorData>
 */
export class VectorReceiver extends BulkDataReceiver {

    /**
     * Creates a new data receiver for vector object labels.
     * 
     * @param {EditorConfig} config The configuration of the application.
     * @param {EditorViews} views The interface of the application with the backend.
     */
    constructor(config, views) {
        super(config, views);
    }

    /**
     * Gets the vector object labels for any number of frames.
     * 
     * @param {ReadonlyArray<FrameLike>} frames Each frame to load the data for.
     * @returns {Promise<VectorLabelData[]>} A promise that resolves to the requested
     * labels. The `i`th element in the returned array corresponds to the `i`th frame.
     */
    async #bulkGetVectorLabels(frames) {
        return this.views.bulkGetLabelData(SENDER_KEY, frames.map((frame) => frame.id))
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(await response.text());
                }

                const data = await response.json();

                return IOUtils.parseArray(data).map((d) => VectorLabelData.fromJSON(d));
            }).catch((reason) => {
                console.error('Failed to get vector labels at:', { frames }, 'Reason:', reason);

                throw reason;
            });
    }

    /**
     * @type {FuncUtils.Batcher<FrameLike, VectorLabelData>}
     */
    #getVectorLabelsBatcher = new FuncUtils.Batcher({
        batchJob: (frames) => this.#bulkGetVectorLabels(frames),
    });

    /**
     * Gets the vector labels for a frame.
     * 
     * @param {FrameLike} frame The frame to load the data for.
     * @returns {Promise<VectorLabelData>} A promise that resolves to the requested labels. 
     */
    async #getVectorLabels(frame) {
        return this.#getVectorLabelsBatcher.apply(frame);
    }

    /**
     * Converts a state object into parameters to construct an editable object.
     * 
     * @param {VectorClassSelectionState['objclasses'][number]} state The state object to convert.
     * @returns {ClassParams} The deserialized data.
     */
    #toClassParams(state) {
        return {
            id: state.id,
            name: state.name,
            vectorColor: state.color,
        };
    }

    /**
     * Converts a state object into parameters to construct an editable object.
     * 
     * @param {LabelVectorState} state The state object to convert.
     * @returns {VectorParams} The deserialized data.
     */
    #toVectorParams(state) {
        return {
            id: state.id,
            timestamp: state.timestamp,
            vertices: state.vertices.map((vertex) => vertex.toVector3()),
            gtClassId: state.gt_class?.id ?? null,
            vectorType: state.type,
        };
    }

    /**
     * Gets the data for any number of frames, bypassing the cache.
     * 
     * @param {ReadonlyArray<FrameLike>} frames Each frame to load the data for.
     * @returns {Promise<ReadonlyArray<VectorData>>} A promise that resolves to the 
     * requested data for each frame: the `i`th element corresponds to the data for
     * the `i`th frame.
     */
    async bulkGetDataNoCache(frames) {
        return Promise.all(frames.map(
            async (frame) => {
                const data = await this.#getVectorLabels(frame);

                return {
                    classes: data.class_selection?.objclasses
                        .map((e) => this.#toClassParams(e)) ?? [],
                    vectors: data.vectors.map((e) => this.#toVectorParams(e)),
                };
            },
        ));
    }
}

/**
 * Finds vector labels for a batch of frames.
 * 
 * @augments BulkDataLookup<VectorData>
 */
export class VectorLookup extends BulkDataLookup {

    /**
     * Receives the data from the backend to be loaded by this object.
     * 
     * @override
     * @readonly
     * @type {VectorReceiver}
     */
    receiver;

    /**
     * Creates a new data lookup for vector labels.
     * 
     * @param {EditorConfig} config The configuration of the application.
     * @param {EditorViews} views The interface of the application wiht the backend.
     * @returns {VectorLookup} The newly created data lookup. 
     */
    static create(config, views) {
        return new VectorLookup(
            this.BUILD_CACHE_KEY.LABEL_DATA,
            new VectorReceiver(config, views),
            50052,
        );
    }

    /**
     * Creates a new data lookup for vector labels.
     * 
     * @protected
     * @param {CacheKeyFunc} buildCacheKey A function that obtains the
     * key to use in the data cache that corresponds to a given frame.
     * @param {VectorReceiver} receiver Fetches the data from the backend to be loaded.
     * @param {number} maxCacheSize The maximum size of the data cache.
     */
    constructor(buildCacheKey, receiver, maxCacheSize) {
        super(buildCacheKey, receiver, maxCacheSize);

        this.receiver = receiver;
    }
}
