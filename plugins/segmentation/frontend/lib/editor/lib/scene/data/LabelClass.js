import * as THREE from 'three';

/* eslint-disable max-len */
/**
 * @typedef {import('sta/services/editor/base').EditorConfig} EditorConfig
 */

/**
 * @typedef {import('./SegmentationIndex').ReadonlySegmentationIndex} ReadonlySegmentationIndex
 */

/**
 * @typedef {object} LabelClassParams
 * @property {EditorConfig} config The configuration of the application.
 * @property {?ReadonlySegmentationIndex} labels A collection of labels from which related labels
 * are queried from this object class.
 * 
 * This is usually the collection of labels containing this object class.
 * @property {number} id The unique identifier of the object class.
 * @property {string} name The display name of the object class.
 * @property {Readonly<THREE.Color>} selectionColor The dispaly color of points selection
 * associated with the object class.
 */

/**
 * Represents the event when a property (except for `labels`) has been changed.
 * - `obj`: The object which property has been changed.
 * - `propertyKey`: The name of the property that was changed.
 * 
 * @typedef {{
 *      obj: LabelClass;
 *      propertyKey: Exclude<keyof LabelClassParams, 'config' | 'labels'>;
 * }} PropertyChangeEvent
 */

/**
 * Defines each event that can be dispatched by {@link LabelClass}.
 * 
 * @typedef {object} LabelClassEventMap
 * @property {PropertyChangeEvent} change The event when a property (except for `labels`)
 * has been changed.
 */

/**
 * @typedef {Pick<Readonly<LabelClass>, keyof THREE.EventDispatcher<LabelClassEventMap> 
 * | keyof LabelClassParams>} ReadonlyLabelClass
 */

/**
 * Represents an object class.
 * 
 * @augments THREE.EventDispatcher<LabelClassEventMap>
 */
export class LabelClass extends THREE.EventDispatcher {
    /**
     * The configuration of the application,
     * 
     * @readonly
     * @type {EditorConfig}
     */
    config;

    /**
     * @type {?ReadonlySegmentationIndex}
     */
    #labels;

    /**
     * A collection of labels from which related labels are queried for this object class.
     * 
     * This is usually the collection of labels containing this object class.
     * 
     * @type {?ReadonlySegmentationIndex}
     */
    get labels() { return this.#labels; }

    set labels(value) {
        const prevValue = this.#labels;
        if (prevValue !== value) {
            this.#labels = value;

            this.#render();
        }
    }

    /**
     * @type {number}
     */
    #id;

    /**
     * The unique identifier of the object class.
     * 
     * @type {number}
     */
    get id() { return this.#id; }

    set id(value) {
        if (this.#id !== value) {
            this.#id = value;

            this.dispatchEvent({ type: 'change', obj: this, propertyKey: 'id' });
        }
    }

    /**
     * @type {string}
     */
    #name;

    /**
     * The display name of the object class
     * 
     * @type {string}
     */
    get name() { return this.#name; }

    set name(value) {
        if (this.#name !== value) {
            this.#name = value;

            this.dispatchEvent({ type: 'change', obj: this, propertyKey: 'name' });
        }
    }

    /**
     * @type {THREE.Color}
     */
    #selectionColor;

    /**
     * The display color of a points selection associated with the class.
     * 
     * @type {Readonly<THREE.Color>}
     */
    get selectionColor() { return this.#selectionColor; }

    set selectionColor(value) {
        if (this.#selectionColor !== value) {
            this.#selectionColor = value;

            this.dispatchEvent({ type: 'change', obj: this, propertyKey: 'selectionColor' });
        }
    }

    /**
     * Updates the view according to the data in this object.
     */
    #render() {
        // Nothing to update
    }

    /**
     * Creates a new object class
     * 
     * @param {LabelClassParams} params The parameters of the input.
     */
    constructor(params) {
        super();

        this.config = params.config;

        this.#labels = params.labels;

        this.#id = params.id;
        this.#name = params.name;
        this.#selectionColor = params.selectionColor.clone();
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {}
}
