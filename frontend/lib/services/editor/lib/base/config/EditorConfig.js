import { CoordinateFormat } from './CoordinateFormat';

/**
 * @typedef {import('three')} THREE
 */

/**
 * @typedef {import('../../../../project/lib').ProjectConfig} ProjectConfig
 */

/**
 * Represents the configuration of a project.
 */
export class EditorConfig {

    /**
     * @type {CoordinateFormat}
     */
    #coordinateFormat;

    /**
     * The coordinate format used.
     * 
     * @type {CoordinateFormat}
     */
    get coordinateFormat() { return this.#coordinateFormat; }

    /**
     * @type {boolean}
     */
    #autoTracks;

    /**
     * If `true`, each object track only has one bounding box, and such objects
     * are managed by the program without explicit input from the user.
     * 
     * @type {boolean}
     */
    get autoTracks() { return this.#autoTracks; }

    /**
     * @type {number}
     */
    #frameCacheSize;

    /**
     * The maximum number of frames stored in the cache once loaded from the server.
     * 
     * @type {number}
     */
    get frameCacheSize() { return this.#frameCacheSize; }

    /**
     * @type {THREE.Vector3}
     */
    #initCameraPosition;

    /**
     * The initial position of the camera relative to the origin of the frame.
     * 
     * @type {THREE.Vector3}
     */
    get initCameraPosition() { return this.#initCameraPosition; }

    /**
     * @type {THREE.Vector3}
     */
    #initCameraTarget;

    /**
     * The initial target of the camera relative to the origin of the frame.
     * 
     * @type {THREE.Vector3}
     */
    get initCameraTarget() { return this.#initCameraTarget; }

    /**
     * The raw configuration for each layer.
     * 
     * @type {Record<string, unknown>}
     */
    #layerSettings;

    /**
     * Creates a new configuration instance for a project.
     * 
     * @param {ProjectConfig} data A JSON object containing the data of the configuration.
     */
    constructor(data) {
        this.#coordinateFormat = CoordinateFormat.ZXY;

        this.#autoTracks = data.auto_tracks ?? false;

        const frameCacheSize = data.frame_cache_size;
        if (!Number.isInteger(frameCacheSize) || frameCacheSize < 1) {
            throw new Error(`The maximum number of frames must be a positive integer. Found: ${frameCacheSize}`);
        } else {
            this.#frameCacheSize = frameCacheSize;
        }

        this.#initCameraPosition = data.init_camera_position.toVector3();
        this.#initCameraTarget = data.init_camera_target.toVector3();

        // Placeholder for now
        this.#layerSettings = {};
    }

    /**
     * Gets the raw configuration of a layer.
     * 
     * @param {string} key A key used to identify the layer. This is usually the same as the `key`
     * of the data sender that builds the response on the backend.
     * @returns {any} The configuration of the layer. This can be `null` or `undefined` if it does
     * not exist.
     */
    forLayer(key) {
        return this.#layerSettings[key];
    }
}
