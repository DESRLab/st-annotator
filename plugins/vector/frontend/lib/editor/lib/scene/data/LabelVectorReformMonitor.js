import { ThreeUtils } from 'sta/common/utils';

import { LabelVector } from './LabelVector';

/**
 * @typedef {import('../controls/VectorTransformer').LocalTransform} LocalTransform 
 */

/**
 * @typedef {import('sta/services/editor/base').EditorConfig} EditorConfig
 */

/**
 * @typedef {import('./LabelVector').ReadonlyLabelVector} ReadonlyLabelVector
 */

/**
 * Since the vector's `three.js` representation can be modified directly,
 * we have to periodically check whether it has been updated in order to fire
 * the change events.
 * 
 * However, it is too costly to continuously monitor all vector objects,
 * so this class is used to monitor specific vector obejcts.
 */
export class LabelVectorReformMonitor {

    /**
     * The configuration of the application.
     * 
     * @readonly
     * @type {EditorConfig}
     */
    config;

    /**
     * @type {?ReadonlyLabelVector}
     */
    #vector;

    /**
     * The vector object to monitor, if any.
     * 
     * @type {?ReadonlyLabelVector}
     */
    get vector() { return this.#vector; }

    set vector(value) {
        if (this.#vector !== value) {
            this.#vector = value;

            this.#setPrevTransform(value);
        }
    }

    /**
     * @type {?LocalTransform}
     */
    #prevTransform = null;

    /**
     * Updates the value of `this.#prevTransform` according to a vector object.
     * 
     * @param {?ReadonlyLabelVector} vector The reference vector object.
     */
    #setPrevTransform(vector) {
        if (vector == null) {
            this.#prevTransform = null;
            return;
        }

        this.#prevTransform = { vectorCoords: vector.vectorCoords };
    }

    #monitorReform = () => {
        const vector = this.#vector;
        const prevTransform = this.#prevTransform;
        if (vector == null) return;

        if (!(vector instanceof LabelVector)) {
            console.error(vector);
            throw new Error('Incorrect type of vector');
        }

        if (prevTransform != null) {
            if (!ThreeUtils.areVerticesEqual(prevTransform.vectorCoords, vector.vectorCoords)) {
                vector.dispatchEvent({ type: 'change', obj: vector, propertyKey: 'vertices' });
            }
        }

        this.#setPrevTransform(vector);
    };

    /**
     * @readonly
     * @type {number}
     */
    #MONITOR_REFORM_INTERVAL_MS = 100;

    /**
     * @readonly
     * @type {ReturnType<setInterval>}
     */
    #monitorReformTimer;

    /**
     * Creates a new object to monitor changes to the transform of a bounding box.
     * 
     * @param {EditorConfig} config The configuration of the application.
     * @param {?ReadonlyLabelVector} vector The bounding box to monitor, if any. 
     */
    constructor(config, vector = null) {
        this.config = config;
        this.#vector = vector;
        this.#setPrevTransform(vector);

        this.#monitorReformTimer = setInterval(
            this.#monitorReform,
            this.#MONITOR_REFORM_INTERVAL_MS,
        );
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        clearInterval(this.#monitorReformTimer);
    }
}
