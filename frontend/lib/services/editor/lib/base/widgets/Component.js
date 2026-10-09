import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';

/**
 * Although the base classes are named after the MVC (model-view-controller) pattern,
 * we actually follow the PAC (presentation-abstraction-control) pattern.
 * 
 * Each MVC triad should be wrapped with an agent class that contains other connected agents.
 * Agent classes should not be passed into MVC classes.
 */

/**
 * Represents the (M)odel component in MVC.
 * 
 * This class should focus on data manipulation, such as storage/retrival and keeping
 * different components of the data consistent with each other.
 * 
 * @typedef {{}} Model
 */

/**
 * Represents the (V)iew component in MVC.
 * 
 * This class should focus on displaying the user interface; there should be
 * no data manipulation unless it facilitates the user interaction.
 * 
 * @typedef {{}} View
 */

/* eslint-disable max-len */
/**
 * Represents the (C)ontroller component in MVC.
 * 
 * This class should focus on syncing the pair of model and view instances with each
 * other.
 * 
 * The flow of function calls should be as follows (numbers indicate call order within the same function):
 * ```
 * View: [User input] -> [Emit view event]                            [1. Update view] --X--> [Emit view event]
 *                              |                                           /|\
 *                             \|/                                           |
 * Controller:         [Handle view event] -> [Mutate controller] =?= [Handle model event] -> [2. Emit controller event]
 *                                                    |                     /|\
 *                                                   \|/                     |
 * Model:                                     [0. Update model] --> [Emit model event]
 * ```
 * 
 * Note 1: For simplicity, can [Update view] right after [Update model] without involving [Emit model event] and [Handle model event].
 * Note 2: To avoid infinite recursion, [Update view] should not [Emit view event].
 * 
 * The flow is implemented this way to support [Mutate controller] from external code (as opposed to [User input])
 * without resulting in further code duplication.
 * 
 * @template {Model} M The type of model instance.
 * @template {View} V The type of view instance.
 * @template {{}} E The type of events that are available.
 * @augments THREE.EventDispatcher<E>
 */
export class Controller extends THREE.EventDispatcher {

    /**
     * The model being kept in sync with the view.
     * 
     * @protected
     * @readonly
     * @type {M}
     */
    model;

    /**
     * The view being kept in sync with the model.
     * 
     * @protected
     * @readonly
     * @type {V}
     */
    view;

    /**
     * Creates a controller that keeps a pair of model and view instances in sync with each other.
     * 
     * (Ideally this constructor should be protected, but TypeScript incorrectly generates
     * one with no parameters)
     * Subclasses should construct this class with `model` and `view` automatically provided.
     * 
     * @param {M} model The model to keep in sync with the view.
     * @param {V} view The view to keep in sync with the model.
     */
    constructor(model, view) {
        super();

        this.model = model;
        this.view = view;

        // Attach event listeners to model/view in the constructor
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        // Detach event listeners and dispose model/views in this method
    }
}
/* eslint-enable max-len */

/**
 * @type {Set<string>}
 */
const generatedIds = new Set();

/**
 * Creates a unique `id` attribute for a DOM element.
 * 
 * @returns {string} The newly created unique identifier.
 */
export function createId() {
    let newId;

    do {
        // IDs should not start with a digit; otherwise, they have to be escaped in CSS selectors.
        newId = `uuid-${uuidv4()}`;
    } while (generatedIds.has(newId));

    return newId;
}
