import * as THREE from 'three';

import { OptionalVector3 } from 'sta/common/spatial';
import { ThreeUtils } from 'sta/common/utils';

/**
 * @typedef {import('sta/services/editor/base').EditorConfig} EditorConfig
 */

/**
 * @typedef {import('./BBoxIndex')
 * .ReadonlyBBoxIndex} ReadonlyBBoxIndex
 */

/**
 * Checks that a default size is valid.
 * 
 * @param {Readonly<OptionalVector3>} defaultSize The input default size.
 * @returns {OptionalVector3} A copy of the input default size with each component
 * potentially set to a fallback value.
 */
export function checkDefaultSize(defaultSize) {
    return defaultSize.clone().map((v) => ThreeUtils.checkSize(v));
}

/**
 * @typedef {object} LabelClassParams
 * @property {EditorConfig} config The configuration of the application.
 * @property {?ReadonlyBBoxIndex} labels A collection of labels from which related labels
 * are queried for this object class.
 * 
 * This is usually the collection of labels containing this object class.
 * @property {number} id The unique identifier of the object class.
 * @property {string} name The display name of the object class.
 * @property {Readonly<THREE.Color>} boxColor The display color of a bounding box
 * associated with the object class.
 * 
 * A shallow copy of the color is made to this object.
 * @property {Readonly<OptionalVector3>} [defaultSizeDatabase] The default size of a
 * bounding box associated with the object class, in the coordinate system of the database.
 * Defaults to an empty vector.
 * 
 * A shallow copy of the default size is made to this object.
 */

/**
 * Represents the event when a property (except for `labels`) has been changed.
 * - `obj`: The object which property has been changed.
 * - `propertyKey`: The name of the property that was changed.
 * 
 * @typedef {{
 *     obj: LabelClass;
 *     propertyKey: Exclude<keyof LabelClassParams, 'config' | 'labels'>;
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
 * | keyof LabelClassParams | 'defaultSizeThreeJS'>} ReadonlyLabelClass
 */

/**
 * Represents an object class.
 * 
 * @augments THREE.EventDispatcher<LabelClassEventMap>
 */
export class LabelClass extends THREE.EventDispatcher {

    /**
     * The configuration of the application.
     * 
     * @readonly
     * @type {EditorConfig}
     */
    config;

    /**
     * @type {?ReadonlyBBoxIndex}
     */
    #labels;

    /**
     * A collection of labels from which related labels are queried for this object class.
     * 
     * This is usually the collection of labels containing this object class.
     * 
     * @type {?ReadonlyBBoxIndex}
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
     * The display name of the object class.
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
    #boxColor;

    /**
     * The display color of a bounding box associated with the class.
     * 
     * @type {Readonly<THREE.Color>}
     */
    get boxColor() { return this.#boxColor; }

    set boxColor(value) {
        if (this.#boxColor !== value) {
            this.#boxColor = value;

            this.dispatchEvent({ type: 'change', obj: this, propertyKey: 'boxColor' });
        }
    }

    /**
     * @type {OptionalVector3}
     */
    #defaultSizeDatabase;

    /**
     * The default size of a bounding box associated with the class,
     * in the coordinate system of the database.
     * 
     * @type {Readonly<OptionalVector3>}
     */
    get defaultSizeDatabase() { return this.#defaultSizeDatabase; }

    set defaultSizeDatabase(value) {
        if (this.#defaultSizeDatabase !== value) {
            this.#defaultSizeDatabase = checkDefaultSize(value);

            this.dispatchEvent({ type: 'change', obj: this, propertyKey: 'defaultSizeDatabase' });
        }
    }

    /**
     * The default size of a bounding box associated with the class,
     * in the coordinate system of `three.js`.
     * 
     * @type {Readonly<OptionalVector3>}
     */
    get defaultSizeThreeJS() {
        return LabelClass.#toThreeJSDefaultSize(this.config, this.#defaultSizeDatabase);
    }

    /**
     * Updates the view according to the data in this object.
     */
    #render() {
        // Nothing to update
    }

    /**
     * Converts a default size from database format into `three.js` format.
     * 
     * @param {EditorConfig} config The configuration of the application.
     * @param {Readonly<OptionalVector3>} dbSize The original default size.
     * @returns {Readonly<OptionalVector3>} The converted default size.
     */
    static #toThreeJSDefaultSize(config, dbSize) {
        const format = config.coordinateFormat;
        return format.toThreeJSCoords(dbSize);
    }

    /**
     * Creates a new object class.
     * 
     * @param {LabelClassParams} params The parameters of the input.
     */
    constructor(params) {
        super();

        this.config = params.config;

        this.#labels = params.labels;

        this.#id = params.id;
        this.#name = params.name;
        this.#boxColor = params.boxColor.clone();
        this.#defaultSizeDatabase = checkDefaultSize(
            params.defaultSizeDatabase ?? new OptionalVector3(),
        );
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {}

    /**
     * Converts a default size from `three.js` format into database format.
     * 
     * @param {EditorConfig} config The configuration of the application.
     * @param {Readonly<OptionalVector3>} threeSize The original default size.
     * @returns {Readonly<OptionalVector3>} The converted default size.
     */
    static #toDatabaseDefaultSize(config, threeSize) {
        const format = config.coordinateFormat;
        return format.toDatabaseCoords(threeSize);
    }
}
