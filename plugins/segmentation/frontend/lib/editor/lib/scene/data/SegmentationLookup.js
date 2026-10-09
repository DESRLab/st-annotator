import { Data } from 'dataclass';
import { z } from 'zod';

import { FuncUtils, IOUtils } from 'sta/common/utils';
import { BulkDataLookup, BulkDataReceiver } from 'sta/services/editor/base';

import { LabelInstanceState, LabelSelectionState, SegmentationClassSelectionState } from '../../../../label/lib';
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
 * @typedef {import('./SegmentationIndex').SelectionParams} SelectionParams
 */

/**
 * @typedef {import('./SegmentationIndex').ClassParams} ClassParams
 */

/**
 * @typedef {import('./SegmentationIndex').InstanceParams} InstanceParams
 */

/**
 * @typedef {import('./SegmentationIndex').SegmentationDataParams} SegmentationDataParams
 */

/**
 * @typedef {Required<SegmentationDataParams>} SegmentationData
 */

export class SegmentationLabelData extends Data {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = z.object({
        instances: z.array(LabelInstanceState.SCHEMA),
        selections: z.array(LabelSelectionState.SCHEMA),
        class_selection: SegmentationClassSelectionState.SCHEMA.nullable(),
    });

    /**
     * @readonly
     */
    static SCHEMA = this.PLAIN_SCHEMA
        .transform((data) => this.create(data));

    /**
     * @readonly
     * @type {ReadonlyArray<LabelInstanceState>}
     */
    instances;

    /**
     * @readonly
     * @type {ReadonlyArray<LabelSelectionState>}
     */
    selections;

    /**
     * @readonly
     * @type {?SegmentationClassSelectionState}
     */
    class_selection;

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {SegmentationLabelData} The resulting new instance.
     */
    static fromJSON(obj) {
        return this.SCHEMA.parse(obj);
    }
}

/**
 * Receives batches of segmentation labels from the backend.
 * 
 * @augments BulkDataReceiver<SegmentationData>
 */
export class SegmentationReceiver extends BulkDataReceiver {

    /**
     * Creates a new data receiver for segmentation labels.
     * 
     * @param {EditorConfig} config The configuration of the application.
     * @param {EditorViews} views The interface of the application with the backend.
     */
    constructor(config, views) {
        super(config, views);
    }

    /**
     * Gets the segmentation labels for any number of frames.
     * 
     * @param {ReadonlyArray<FrameLike>} frames Each frame to load the data for.
     * @returns {Promise<SegmentationLabelData[]>} A promise that resolves to the requested
     * labels. The `i`th element in the returned array corresponds to the `i`th frame.
     */
    async #bulkGetSegmentationLabels(frames) {
        return this.views.bulkGetLabelData(SENDER_KEY, frames.map((frame) => frame.id))
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(await response.text());
                }

                const data = await response.json();

                return IOUtils.parseArray(data).map((d) => SegmentationLabelData.fromJSON(d));
            }).catch((reason) => {
                console.error('Failed to get segmentation labels at:', { frames }, 'Reason:', reason);

                throw reason;
            });
    }

    /**
     * @type {FuncUtils.Batcher<FrameLike, SegmentationLabelData>}
     */
    #getSegmentationLabelsBatcher = new FuncUtils.Batcher({
        batchJob: (frames) => this.#bulkGetSegmentationLabels(frames),
    });

    /**
     * Gets the segmentation labels for a frame.
     * 
     * @param {FrameLike} frame The frame to load the data for.
     * @returns {Promise<SegmentationLabelData>} A promise that resolves to the requested labels.
     */
    async #getSegmentationLabels(frame) {
        return this.#getSegmentationLabelsBatcher.apply(frame);
    }

    /**
     * Converts a state object into parameters to construct an editable object.
     * 
     * @param {SegmentationClassSelectionState['objclasses'][number]} state
     * The state object to convert.
     * @returns {ClassParams} The deserialized data.
     */
    #toClassParams(state) {
        return {
            id: state.id,
            name: state.name,
            selectionColor: state.color,
        };
    }

    /**
     * Converts a state object into parameters to construct an editable object.
     * 
     * @param {LabelSelectionState} state The state object to convert.
     * @returns {SelectionParams} The deserialized data.
     */
    #toSelectionParams(state) {
        return {
            id: state.id,
            entityId: state.entity_id,
            timestamp: state.timestamp,
            points: state.points.map((point) => point.toVector3()),
            qualityRank: state.quality_rank,
            distinctiveLv: state.distinctive_lv,
            occlusionLv: state.occlusion_lv,
            perceivedClassId: state.perceived_class?.id ?? null,
        };
    }

    /**
     * Converts a state object into parameters to construct an editable object.
     * 
     * @param {LabelInstanceState} state The state object to convert.
     * @returns {InstanceParams} The deserialized data.
     */
    #toInstanceParams(state) {
        return {
            id: state.id,
            isBlack: state.is_black ?? undefined,
            gtClassId: state.gt_class?.id ?? null,
        };
    }

    /**
     * Gets the data for any number of frames, bypassing the cache.
     * 
     * @param {ReadonlyArray<FrameLike>} frames Each frame to load the data for.
     * @returns {Promise<ReadonlyArray<SegmentationData>>} A promise that resolves to
     * the requested data for each frame: the `i`th element corresponds to the data for
     * the `i`th frame.
     */
    async bulkGetDataNoCache(frames) {
        return Promise.all(frames.map(
            async (frame) => {
                const data = await this.#getSegmentationLabels(frame);

                return {
                    classes: data.class_selection?.objclasses
                        .map((e) => this.#toClassParams(e)) ?? [],
                    selections: data.selections.map((e) => this.#toSelectionParams(e)),
                    instances: data.instances.map((e) => this.#toInstanceParams(e)),
                };
            },
        ));
    }
}

/**
 * Finds segmentation labels for a batch of frames.
 * 
 * @augments BulkDataLookup<SegmentationData>
 */
export class SegmentationLookup extends BulkDataLookup {

    /**
     * Receives the data from the backend to be loaded by this object.
     * 
     * @override
     * @readonly
     * @type {SegmentationReceiver}
     */
    receiver;

    /**
     * Creates a new data lookup for segmentation labels.
     * 
     * @param {EditorConfig} config The configuration of the application.
     * @param {EditorViews} views The interface of the application with the backend.
     * @returns {SegmentationLookup} The newly created data lookup.
     */
    static create(config, views) {
        return new SegmentationLookup(
            this.BUILD_CACHE_KEY.LABEL_DATA,
            new SegmentationReceiver(config, views),
            // maxCacheSize is fixed so that the local (newer) data is not overwritten by
            // the remote (older) data
            65536,
        );
    }

    /**
     * Creates a new data lookup for segmentation labels.
     * 
     * @protected
     * @param {CacheKeyFunc} buildCacheKey A function that obtains the
     * key to use in the data cache that corresponds to a given frame.
     * @param {SegmentationReceiver} receiver Fetches the data from the backend to be loaded.
     * @param {number} maxCacheSize The maximum size of the data cache.
     */
    constructor(buildCacheKey, receiver, maxCacheSize) {
        super(buildCacheKey, receiver, maxCacheSize);

        this.receiver = receiver;
    }
}
