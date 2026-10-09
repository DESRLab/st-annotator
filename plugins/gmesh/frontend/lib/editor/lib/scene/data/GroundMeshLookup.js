import { StatusCodes as HTTPStatus } from 'http-status-codes';
import * as THREE from 'three';

import { BaseDataLookup, BaseDataReceiver } from 'sta/services/editor/base';
import { ApplyColormap, NormalizedValueFunc, PointBuffer, cmaps } from 'sta/services/editor/core';

import { SENDER_KEY } from '../../config';

import { GroundMesh } from './GroundMesh';

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
 * @typedef {import('../../../../source/lib').GroundMeshData} GroundMeshData
 */

// Temporary values that will be overriden by the layer
const TEMP_BLENDER = new ApplyColormap(cmaps.get('rainbow'), new NormalizedValueFunc(0, 0, 0));
const TEMP_OPACITY = 0;

/**
 * Receives ground meshes from the backend.
 * 
 * @augments BaseDataReceiver<?GroundMesh>
 */
export class GroundMeshReceiver extends BaseDataReceiver {

    /**
     * Creates a new data receiver for ground meshes.
     * 
     * @param {EditorConfig} config The configuration of the application.
     * @param {EditorViews} views The interface of the application with the backend.
     */
    constructor(config, views) {
        super(config, views);
    }

    /**
     * Gets the data of a ground mesh for a frame.
     * 
     * @param {FrameLike} frame The frame to load the data for.
     * @returns {Promise<?GroundMeshData>} A promise that resolves to the requested mesh.
     * If the mesh does not exist, the promise resolves to `null` instead.
     */
    async #getGroundMeshData(frame) {
        return this.views.bulkGetSourceData(SENDER_KEY, [frame.id])
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(await response.text());
                }

                if (response.status === HTTPStatus.NO_CONTENT) return null;

                const data = await response.arrayBuffer();

                const headers = response.headers;
                const verticesByteLengthStr = headers.get('X-Vertices-ByteLength');
                const facesByteLengthStr = headers.get('X-Faces-ByteLength');

                if (verticesByteLengthStr == null || facesByteLengthStr == null) {
                    throw new Error('Invalid headers');
                }

                const verticesByteLength = Number(verticesByteLengthStr);
                const facesByteLength = Number(facesByteLengthStr);

                const vertices = new Float32Array(data.slice(0, verticesByteLength));
                const faces = new Int32Array(
                    data.slice(verticesByteLength, verticesByteLength + facesByteLength));

                return { vertices, faces };
            }).catch((reason) => {
                console.error(`Failed to get ground mesh at frame #${frame.id}:`, reason);

                throw reason;
            });
    }

    /**
     * Gets the source data for a frame, bypassing the cache.
     * 
     * @param {FrameLike} frame The frame to load the data for.
     * @returns {Promise<?GroundMesh>} A promise that resolves to the requested data.
     */
    async getDataNoCache(frame) {
        const dto = await this.#getGroundMeshData(frame);
        if (dto == null) return null;

        const config = this.config;
        const format = config.coordinateFormat;
        const verticesBuffer = new PointBuffer(dto.vertices, format, 3);
        const facesBuffer = dto.faces;

        return new GroundMesh(
            verticesBuffer,
            facesBuffer,
            new THREE.Vector3(),
            TEMP_BLENDER,
            TEMP_OPACITY,
        );
    }
}

/**
 * Finds ground mesh data for a given frame.
 * 
 * @augments BaseDataLookup<?GroundMesh>
 */
export class GroundMeshLookup extends BaseDataLookup {

    /**
     * Creates a new data lookup for ground meshes.
     * 
     * @param {EditorConfig} config The configuration of the application.
     * @param {EditorViews} views The interface of the application with the backend.
     * @param {number} [maxCacheSize] The maximum size of the data cache. Defaults to the value
     * provided in `config`.
     * @returns {GroundMeshLookup} The newly created data lookup.
     */
    static create(config, views, maxCacheSize = undefined) {
        return new GroundMeshLookup(
            this.BUILD_CACHE_KEY.SOURCE_DATA,
            new GroundMeshReceiver(config, views),
            maxCacheSize ?? config.frameCacheSize,
        );
    }

    /**
     * Creates a new data lookup for ground meshes.
     * 
     * @protected
     * @param {CacheKeyFunc} buildCacheKey A function that obtains the
     * key to use in the data cache that corresponds to a given frame.
     * @param {GroundMeshReceiver} receiver Fetches the data from the backend to be loaded.
     * @param {number} maxCacheSize The maximum size of the data cache.
     */
    constructor(buildCacheKey, receiver, maxCacheSize) {
        super(buildCacheKey, receiver, maxCacheSize);
    }
}
