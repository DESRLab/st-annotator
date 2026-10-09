import { Data } from 'dataclass';
import { z } from 'zod';

import { FuncUtils, IOUtils } from 'sta/common/utils';
import { BulkDataLookup, BulkDataReceiver } from 'sta/services/editor/base';

import { BBoxClassSelectionState, LabelBoxState, LabelTrackState } from '../../../../label/lib';
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
 * @typedef {import('./BBoxIndex').BoxParams} BoxParams
 */

/**
 * @typedef {import('./BBoxIndex').ClassParams} ClassParams
 */

/**
 * @typedef {import('./BBoxIndex').TrackParams} TrackParams
 */

/**
 * @typedef {import('./BBoxIndex').BBoxDataParams} BBoxDataParams
 */

/**
 * @typedef {Required<BBoxDataParams>} BBoxData
 */

export class BBoxLabelData extends Data {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = z.object({
        tracks: z.array(LabelTrackState.SCHEMA),
        boxes: z.array(LabelBoxState.SCHEMA),
        class_selection: BBoxClassSelectionState.SCHEMA.nullable(),
    });

    /**
     * @readonly
     */
    static SCHEMA = this.PLAIN_SCHEMA
        .transform((data) => this.create(data));

    /**
     * @readonly
     * @type {ReadonlyArray<LabelTrackState>}
     */
    tracks;

    /**
     * @readonly
     * @type {ReadonlyArray<LabelBoxState>}
     */
    boxes;

    /**
     * @readonly
     * @type {?BBoxClassSelectionState}
     */
    class_selection;

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {BBoxLabelData} The resulting new instance.
     */
    static fromJSON(obj) {
        return this.SCHEMA.parse(obj);
    }
}

/**
 * Receives batches of bounding box labels from the backend.
 * 
 * @augments BulkDataReceiver<BBoxData>
 */
export class BBoxReceiver extends BulkDataReceiver {

    /**
     * Creates a new data receiver for bounding box labels.
     * 
     * @param {EditorConfig} config The configuration of the application.
     * @param {EditorViews} views The interface of the application with the backend.
     */
    constructor(config, views) {
        super(config, views);
    }

    /**
     * Gets the bounding box labels for any number of frames.
     * 
     * @param {ReadonlyArray<FrameLike>} frames Each frame to load the data for.
     * @returns {Promise<BBoxLabelData[]>} A promise that resolves to the requested
     * labels. The `i`th element in the returned array corresponds to the `i`th frame.
     */
    async #bulkGetBBoxLabels(frames) {
        return this.views.bulkGetLabelData(SENDER_KEY, frames.map((frame) => frame.id))
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(await response.text());
                }

                const data = await response.json();

                return IOUtils.parseArray(data).map((d) => BBoxLabelData.fromJSON(d));
            }).catch((reason) => {
                console.error('Failed to get bounding box labels at:', { frames }, 'Reason:', reason);

                throw reason;
            });
    }

    /**
     * @type {FuncUtils.Batcher<FrameLike, BBoxLabelData>}
     */
    #getBBoxLabelsBatcher = new FuncUtils.Batcher({
        batchJob: (frames) => this.#bulkGetBBoxLabels(frames),
    });

    /**
     * Gets the bounding box labels for a frame.
     * 
     * @param {FrameLike} frame The frame to load the data for.
     * @returns {Promise<BBoxLabelData>} A promise that resolves to the requested labels.
     */
    async #getBBoxLabels(frame) {
        return this.#getBBoxLabelsBatcher.apply(frame);
    }

    /**
     * Converts a state object into parameters to construct an editable object.
     * 
     * @param {BBoxClassSelectionState['objclasses'][number]} state The state object to convert.
     * @returns {ClassParams} The resulting parameters.
     */
    #toClassParams(state) {
        return {
            id: state.id,
            name: state.name,
            boxColor: state.color,
            defaultSizeDatabase: state.default_size.toOptionalVector3(),
        };
    }

    /**
     * Converts a state object into parameters to construct an editable object.
     * 
     * @param {LabelBoxState} state The state object to convert.
     * @returns {BoxParams} The resulting parameters.
     */
    #toBoxParams(state) {
        return {
            id: state.id,
            entityId: state.entity_id,
            timestamp: state.timestamp,
            boxType: state.type,
            center: state.center.toVector3(),
            angle: Number(state.angle),
            size: state.size.toVector3(),
            qualityRank: state.quality_rank,
            distinctiveLv: state.distinctive_lv,
            occlusionLv: state.occlusion_lv,
            perceivedClassId: state.perceived_class?.id ?? null,
        };
    }

    /**
     * Converts a state object into parameters to construct an editable object.
     * 
     * @param {LabelTrackState} state The state object to convert.
     * @returns {TrackParams} The resulting parameters.
     */
    #toTrackParams(state) {
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
     * @returns {Promise<ReadonlyArray<BBoxData>>} A promise that resolves to
     * the requested data for each frame: the `i`th element corresponds to the data for
     * the `i`th frame.
     */
    async bulkGetDataNoCache(frames) {
        return Promise.all(frames.map(
            async (frame) => {
                const data = await this.#getBBoxLabels(frame);

                return {
                    classes: data.class_selection?.objclasses
                        .map((e) => this.#toClassParams(e)) ?? [],
                    boxes: data.boxes.map((e) => this.#toBoxParams(e)),
                    tracks: data.tracks.map((e) => this.#toTrackParams(e)),
                };
            },
        ));
    }
}

/**
 * Finds bounding box labels for a batch of frames.
 * 
 * @augments BulkDataLookup<BBoxData>
 */
export class BBoxLookup extends BulkDataLookup {

    /**
     * Receives the data from the backend to be loaded by this object.
     * 
     * @override
     * @readonly
     * @type {BBoxReceiver}
     */
    receiver;

    /**
     * Creates a new data lookup for bounding box labels.
     * 
     * @param {EditorConfig} config The configuration of the application.
     * @param {EditorViews} views The interface of the application with the backend.
     * @returns {BBoxLookup} The newly created data lookup.
     */
    static create(config, views) {
        return new BBoxLookup(
            this.BUILD_CACHE_KEY.LABEL_DATA,
            new BBoxReceiver(config, views),
            // maxCacheSize is fixed so that the local (newer) data is not overwritten by
            // the remote (older) data
            65536,
        );
    }

    /**
     * Creates a new data lookup for bounding box labels.
     * 
     * @protected
     * @param {CacheKeyFunc} buildCacheKey A function that obtains the
     * key to use in the data cache that corresponds to a given frame.
     * @param {BBoxReceiver} receiver Fetches the data from the backend to be loaded.
     * @param {number} maxCacheSize The maximum size of the data cache.
     */
    constructor(buildCacheKey, receiver, maxCacheSize) {
        super(buildCacheKey, receiver, maxCacheSize);

        this.receiver = receiver;
    }
}
