import { LabelSelection } from './LabelSelection';

/**
 * @typedef {import('../controls/SelectionEditControl').LocalSelectionData} LocalSelectionData
 */

/**
 * @typedef {import('./LabelSelection').ReadonlyLabelSelection} ReadonlyLabelSelection
 */

/**
 * Since the selection's `three.js` representation can be modified directly,
 * we have to periodically check whether it has been updated in order to fire
 * the change events.
 * 
 * However, it is too costly to continuously monitor all selection objects,
 * so this class is used to monitor specific selection obejcts.
 */
export class LabelSelectionReformMonitor {
    /**
     * @type {?ReadonlyLabelSelection}
     */
    #selection;

    /**
     * The selection object to monitor, if any.
     * 
     * @type {?ReadonlyLabelSelection}
     */
    get selection() { return this.#selection; }

    set selection(value) {
        if (this.#selection !== value) {
            this.#selection = value;

            this.#setPrevTransform(value);
        }
    }

    /**
     * @type {?LocalSelectionData}
     */
    #prevTransform = null;

    /**
     * Updates the value of `this.#prevTransform` according to a selection object.
     * 
     * @param {?ReadonlyLabelSelection} selection The reference selection object.
     */
    #setPrevTransform(selection) {
        if (selection == null) {
            this.#prevTransform = null;
            return;
        }

        this.#prevTransform = {
            pointCoords: [...selection.pointCoords],
            centerPoint: selection.centerPoint.clone(),
        };
    }

    /**
     * Monitors any modifications on label selection data points on 
     * its threejs object to dispatch corresponding change event.
     */
    #monitorReform = () => {
        const selection = this.#selection;
        const prevTransform = this.#prevTransform;
        if (selection == null) return;

        if (!(selection instanceof LabelSelection)) {
            console.error(selection);
            throw new Error('Incorrect type of selection');
        }

        if (prevTransform != null) {
            if (!selection.centerPoint.equals(prevTransform.centerPoint)) {
                selection.dispatchEvent({ type: 'change', obj: selection, propertyKey: 'points' });
            }
        }

        this.#setPrevTransform(selection);
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
     * @param {?ReadonlyLabelSelection} selection The bounding box to monitor, if any. 
     */
    constructor(selection = null) {
        this.#selection = selection;
        this.#setPrevTransform(selection);

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
