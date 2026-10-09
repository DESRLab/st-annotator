import { StatusCodes as HTTPStatus } from 'http-status-codes';
import * as THREE from 'three';

import { BaseDataLookup, BaseDataReceiver } from 'sta/services/editor/base';
import { ApplyColormap, NormalizedValueFunc, PointBuffer, cmaps } from 'sta/services/editor/core';

import { SENDER_KEY, getSettings } from '../../config';

import { PointCloud } from './PointCloud';

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
 * @typedef {import('../../../../source/lib').PointCloudData} PointCloudData
 */

// Temporary values that will be overriden by the layer
const TEMP_BLENDER = new ApplyColormap(cmaps.get('rainbow'), new NormalizedValueFunc(0, 0, 0));
const TEMP_POINT_SIZE = 0;

/**
 * Receives point clouds from the backend.
 * 
 * @augments BaseDataReceiver<?PointCloud>
 */
export class PointCloudReceiver extends BaseDataReceiver {

    /**
     * `true` if background removal is applied server-side; otherwise, `false`.
     * 
     * @type {boolean}
     */
    removeBackground;

    /**
     * `true` if area cropping is applied server-side; otherwise, `false`.
     * 
     * @type {boolean}
     */
    cropArea;

    /**
     * Creates a new data lookup for point clouds.
     * 
     * @param {EditorConfig} config The configuration of the application.
     * @param {EditorViews} views The interface of the application with the server.
     * @param {boolean} [removeBackground] Whether background removal is applied server-side.
     * Defaults to the value provided by `config`.
     * @param {boolean} [cropArea] Whether area cropping is applied server-side.
     * Defaults to the value provided by `config`.
     */
    constructor(config, views, removeBackground = undefined, cropArea = undefined) {
        super(config, views);

        const defaults = getSettings(config);
        this.removeBackground = removeBackground ?? defaults.removeBackground ?? true;
        this.cropArea = cropArea ?? defaults.cropArea ?? true;
    }

    /**
     * Gets the data of a point cloud for a frame.
     * 
     * @param {FrameLike} frame The frame to load the data for.
     * @returns {Promise<?PointCloudData>} A promise that resolves to the requested point cloud.
     */
    async #getPointCloudData(frame) {
        return this.views.bulkGetSourceData(
            SENDER_KEY, [frame.id],
            { remove_bg: this.removeBackground, crop_area: this.cropArea },
        ).then(async (response) => {
            if (!response.ok) {
                throw new Error(await response.text());
            }

            if (response.status === HTTPStatus.NO_CONTENT) return null;

            const data = await response.arrayBuffer();

            const headers = response.headers;
            const numPointsStr = headers.get('X-Num-Points');
            const numChannelsStr = headers.get('X-Num-Channels');
            const channelHeadersStr = headers.get('X-Channel-Headers');

            if (numPointsStr == null || numChannelsStr == null
                || channelHeadersStr == null) {
                throw new Error('Invalid headers');
            }

            return {
                array: new Float32Array(data),
                numPoints: Number(numPointsStr),
                numChannels: Number(numChannelsStr),
                channelHeaders: JSON.parse(channelHeadersStr),
            };
        }).catch((reason) => {
            console.error(`Failed to get point cloud at frame #${frame.id}:`, reason);

            throw reason;
        });
    }

    /**
     * Gets the source data for a frame, bypassing the cache.
     * 
     * @param {FrameLike} frame The frame to load the data for.
     * @returns {Promise<?PointCloud>} A promise that resolves to the requested data.
     */
    async getDataNoCache(frame) {
        const dto = await this.#getPointCloudData(frame);
        if (dto == null) return null;

        const config = this.config;
        const format = config.coordinateFormat;
        const buffer = new PointBuffer(dto.array, format, dto.numChannels);

        return new PointCloud(
            buffer,
            dto.channelHeaders,
            new THREE.Vector3(),
            TEMP_BLENDER,
            TEMP_POINT_SIZE,
        );
    }
}

/**
 * Finds point cloud data for a given frame.
 * 
 * @augments BaseDataLookup<?PointCloud>
 */
export class PointCloudLookup extends BaseDataLookup {

    /**
     * Receives the data from the backend to be loaded by this object.
     * 
     * @readonly
     * @type {PointCloudReceiver}
     */
    #receiver;

    /**
     * `true` if background removal is applied server-side; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get removeBackground() { return this.#receiver.removeBackground; }

    set removeBackground(value) {
        if (this.#receiver.removeBackground !== value) {
            this.clearCache();

            this.#receiver.removeBackground = value;
        }
    }

    /**
     * `true` if area cropping is applied server-side; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get cropArea() { return this.#receiver.cropArea; }

    set cropArea(value) {
        if (this.#receiver.cropArea !== value) {
            this.clearCache();

            this.#receiver.cropArea = value;
        }
    }

    /**
     * Creates a new data lookup for point clouds.
     * 
     * @param {EditorConfig} config The configuration of the application.
     * @param {EditorViews} views The interface of the application with the backend.
     * @param {number} [maxCacheSize] The maximum size of the data cache. Defaults to the value
     * provided in `config`.
     * @returns {PointCloudLookup} The newly created data lookup.
     */
    static create(config, views, maxCacheSize = undefined) {
        return new PointCloudLookup(
            this.BUILD_CACHE_KEY.SOURCE_DATA,
            new PointCloudReceiver(config, views),
            maxCacheSize ?? config.frameCacheSize,
        );
    }

    /**
     * Creates a new data lookup for point clouds.
     * 
     * @param {CacheKeyFunc} buildCacheKey A function that obtains the
     * key to use in the data cache that corresponds to a given frame.
     * @param {PointCloudReceiver} receiver Fetches the data from the backend to be loaded.
     * @param {number} maxCacheSize The maximum size of the data cache.
     */
    constructor(buildCacheKey, receiver, maxCacheSize) {
        super(buildCacheKey, receiver, maxCacheSize);

        this.#receiver = receiver;
    }
}
