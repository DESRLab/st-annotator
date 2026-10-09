import { LabelBox } from './LabelBox';

/**
 * @typedef {import('sta-gmesh/editor').LocalTransform} LocalTransform
 */

/**
 * @typedef {import('./LabelBox').ReadonlyLabelBox} ReadonlyLabelBox
 */

/**
 * Since the box's `three.js` representation can be modified directly,
 * we have to periodically check whether it has been updated in order to fire
 * the change events.
 * 
 * However, it is too costly to continuously monitor all boxes,
 * so this class is used to monitor specific boxes.
 */
export class LabelBoxTransformMonitor {

    /**
     * @type {?ReadonlyLabelBox}
     */
    #box;

    /**
     * The bounding box to monitor, if any.
     * 
     * @type {?ReadonlyLabelBox}
     */
    get box() { return this.#box; }

    set box(value) {
        if (this.#box !== value) {
            this.#box = value;

            this.#setPrevTransform(value);
        }
    }

    /**
     * @type {?LocalTransform}
     */
    #prevTransform;

    /**
     * Updates the value of `this.#prevTransform` according to a bounding box.
     * 
     * @param {?ReadonlyLabelBox} box The reference bounding box.
     */
    #setPrevTransform(box) {
        if (box == null) {
            this.#prevTransform = null;
            return;
        }

        const { position, rotation, scale } = box.asObject3D();

        this.#prevTransform = {
            position: position.clone(),
            rotation: rotation.clone(),
            scale: scale.clone(),
        };
    }

    /**
     * Since the box's `three.js` representation can be modified directly,
     * we have to periodically check whether it has been updated.
     */
    #monitorTransform = () => {
        const box = this.#box;
        if (box == null) return;

        if (!(box instanceof LabelBox)) {
            console.error(box);
            throw new Error('Incorrect type of box');
        }

        const { position, rotation, scale } = box.asObject3D();
        const prevTransform = this.#prevTransform;

        if (prevTransform != null) {
            if (!prevTransform.position.equals(position)) {
                box.dispatchEvent({ type: 'change', obj: box, propertyKey: 'center' });
            }
            if (!prevTransform.rotation.equals(rotation)) {
                box.dispatchEvent({ type: 'change', obj: box, propertyKey: 'angle' });
            }
            if (!prevTransform.scale.equals(scale)) {
                box.dispatchEvent({ type: 'change', obj: box, propertyKey: 'size' });
            }
        }

        this.#setPrevTransform(box);
    };

    /**
     * @readonly
     * @type {number}
     */
    #MONITOR_TRANSFORM_INTERVAL_MS = 100;

    /**
     * @readonly
     * @type {ReturnType<setInterval>}
     */
    #monitorTransformTimer;

    /**
     * Creates a new object to monitor changes to the transform of a bounding box.
     * 
     * @param {?ReadonlyLabelBox} box The bounding box to monitor, if any. 
     */
    constructor(box = null) {
        this.#box = box;
        this.#setPrevTransform(box);

        this.#monitorTransformTimer = setInterval(
            this.#monitorTransform,
            this.#MONITOR_TRANSFORM_INTERVAL_MS,
        );
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        clearInterval(this.#monitorTransformTimer);
    }
}
