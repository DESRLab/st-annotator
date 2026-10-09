import * as THREE from 'three';

import { LabelVectorInspectorPaneController } from './LabelVectorInspectorPane';
import { renderTriggers as selectionRenderTriggers } from './LabelVectorSelectionPane';
import { renderTriggers as relationsRenderTriggers } from './LabelVectorRelationsPane';
import { InspectorRenderSignaller, composeRenderTriggers } from './InspectorPaneRenderTrigger';

/* eslint-disable max-len */
/**
 * @typedef {import('sta/services/editor/base').PaneControllerDataTypes} PaneControllerDataTypes
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('sta/services/editor/base').PaneControllerChangeEvent<P>} PaneControllerChangeEvent
 */

/**
 * @typedef {import ('../data').VectorParams} VectorParams
 */

/**
 * @typedef {import('../data').VectorView} VectorView
 */

/**
 * @typedef {import('../data').ReadonlyLabelVector} ReadonlyLabelVector
 */

/**
 * @typedef {import('../data').UUID} UUID
 */

/**
 * @typedef {import('../data/LabelVector').PropertyChangeEvent} LabelVectorChangeEvent
 */

/**
 * @typedef {import('./LabelVectorInspectorPane').LabelVectorParams} LabelVectorParams
 */

/**
 * @typedef {import('./LabelVectorInspectorPane').LabelVectorInspectorPaneControllerEventMap} LabelVectorInspectorPaneControllerEventMap
 */

/**
 * @typedef {import('./LabelVectorInspectorPane').LabelVectorInspectorPaneControllerParams} LabelVectorInspectorPaneControllerParams
 */
/* eslint-enable max-len */

/**
 * Defines each event that can be dispatched by {@link LabelVectorInspector}.
 * 
 * @typedef {object} LabelVectorInspectorEventMap
 * @property {{ value: ?ReadonlyLabelVector }} select-vector The event when another vector object
 * is selected.
 * @property {{ drawVectorActive: boolean }} toggle-drawVector The event when the draw vector button
 * is toggled.
 */

/**
 * @typedef {object} LabelVectorInspectorParams
 * @property {VectorView} labelsView The collection of labels used to update
 * the selected vector object.
 * @property {?UUID} [selectedId=null] The unique identifier of the vector object.
 * that is selected, if any.
 * @property {boolean} [disabled=false] `true` if the inspector is disabled; otherwise, `false`.
 */

/**
 * Displays information about a vector object which can be edited directly.
 * 
 * @augments THREE.EventDispatcher<LabelVectorInspectorEventMap>
 */
export class LabelVectorInspector extends THREE.EventDispatcher {

    /**
     * The DOM element representing this inspector.
     * 
     * @readonly
     * @type {HTMLDivElement}
     */
    dom;

    /**
     * @readonly
     * @type {LabelVectorInspectorPaneController}
     */
    #inspector;

    /**
     * A view of the collection of labels used to update the selected vector object.
     * 
     * @readonly
     * @type {VectorView}
     */
    labelsView;

    /**
     * Handles the event when the collection of labels is (un)loaded.
     */
    #onDataLoad = () => {
        const selectedId = this.selectedId;
        if (selectedId != null && !this.labelsView.hasLabelVector(selectedId)) {
            // The label no longer exists
            this.selectedId = null;
        }

        // Need to show the new list of available labels
        this.#render();
    };

    /**
     * @readonly
     * @type {InspectorRenderSignaller}
     */
    #signaller;

    /**
     * @type {?UUID}
     */
    #selectedId;

    /**
     * The unique identifier of the vector object that is selected, if any.
     * 
     * @type {?UUID}
     */
    get selectedId() { return this.#selectedId; }

    /**
     * The unique identifier of the vector object that is selected, if any.
     * 
     * @type {?UUID}
     */
    set selectedId(value) {
        if (this.#selectedId !== value) {
            this.#selectedId = value;

            // Need to show the attributes for the newly selected vector object
            this.#render();

            this.dispatchEvent({ type: 'select-vector', value: this.selectedVector });
        }
    }

    /**
     * The bounding box that is selected, if any.
     * 
     * @type {?ReadonlyLabelVector}
     */
    get selectedVector() {
        const { selectedId, labelsView } = this;
        if (selectedId == null) return null;

        return labelsView.hasLabelVector(selectedId) ? labelsView.getLabelVector(selectedId)
            : null;     // May not exist if the data is currently being loaded
    }

    /**
     * @type {boolean}
     */
    #disabled;

    /**
     * `true` if this inspector is disabled; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get disabled() { return this.#disabled; }

    set disabled(value) {
        if (this.#disabled !== value) {
            this.#disabled = value;

            // Need to update the settings
            this.#render();
        }
    }

    /**
     * @type {boolean}
     */
    #drawVectorActive;

    /**
     * `true` if the draw box button is active; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get drawVectorActive() { return this.#drawVectorActive; }

    set drawVectorActive(value) {
        if (this.#drawVectorActive !== value) {
            this.#drawVectorActive = value;

            // Need to update the settings
            this.#render();
        }
    }

    /**
     * Handles the event when the attributes in the inspector have been updated.
     * 
     * @param {PaneControllerChangeEvent<LabelVectorInspectorPaneControllerParams>} event
     * The event to handle.
     */
    #onInspectorChange = async (event) => {
        const { vectorId: prevVectorId } = event.prevOutputData;
        const { vectorId } = event.outputData;

        // Select vector
        if (vectorId !== prevVectorId) {
            this.selectedId = vectorId;
        // Edit vector
        } else {
            this.#updateVector();
        }
    };

    async #updateVector() {
        const { labelsView, selectedVector } = this;
        if (selectedVector == null) return;

        const { classId } = this.#inspector.outputData;

        if (selectedVector.gtClassId !== classId) {
            const labelClass = (classId == null) ? null : labelsView.getLabelClass(classId);
            await labelsView.updateLabelVectorGtClass(selectedVector, labelClass);
        }
    }

    /**
     * Updates the view according to the data in this object.
     */
    #render() {
        const { labelsView, selectedVector, disabled, drawVectorActive } = this;
        const labels = labelsView.data;

        let inputtedData;
        if (selectedVector == null) {
            inputtedData = {
                selection: { vectorId: null },
                relations: {
                    classSelect: { classId: null },
                },
            };
        } else {
            inputtedData = {
                selection: { vectorId: selectedVector.id },
                relations: {
                    classSelect: { classId: selectedVector.gtClassId },
                },
            };
        }

        this.#inspector.updateState({
            inputtedData: inputtedData,
            internalData: {
                vectors: new Map(Array.from(labelsView.iterLabelVectors(), (e) => [e.id, e])),
                classes: new Map(Array.from(labelsView.iterLabelClasses(), (e) => [e.id, e])),
            },
            settings: {
                disabled: disabled || (labels == null),
                drawVectorActive: drawVectorActive,
            },
        });

        this.#signaller.labels = labels;
    }

    #requireRender = () => this.#render();

    /**
     * Handles the event when the user begins drawing a new vector object.
     * 
     * @param {LabelVectorInspectorPaneControllerEventMap['click-drawVector']} event
     * The event to handle.
     */
    #onDrawVector = (event) => {
        this.drawVectorActive = !this.drawVectorActive;

        this.dispatchEvent({ type: 'toggle-drawVector', drawVectorActive: this.drawVectorActive });
    };

    /**
     * Gets the parameters of a vector object represented by this inspector.
     * 
     * @returns {Omit<VectorParams, 'config'| 'id'| 'vertices' | 'vectorType'>} The requested
     * parameters.
     */
    getVectorParams() {
        const { classId } = this.#inspector.outputData;

        return {
            gtClassId: classId,
        };
    }

    /**
     * Creates a new vector object inspector.
     * 
     * @param {LabelVectorInspectorParams} params The parameters of the inspector.
     */
    constructor(params) {
        super();

        this.labelsView = params.labelsView ?? null;
        this.labelsView.addEventListener('beforeload', this.#onDataLoad);
        this.labelsView.addEventListener('afterload', this.#onDataLoad);

        this.#selectedId = params.selectedId ?? null;
        this.#disabled = params.disabled ?? false;

        this.dom = document.createElement('div');
        {
            this.#inspector = LabelVectorInspectorPaneController.create(this.dom, {
                settings: {
                    disabled: false,
                    hidden: false,
                    drawVectorActive: false,
                    disableTransform: true,
                },
            });
            this.#inspector.addEventListener('change', this.#onInspectorChange);
            this.#inspector.paneEvents.addEventListener('click-drawVector', this.#onDrawVector);
        }

        this.#signaller = new InspectorRenderSignaller(composeRenderTriggers(
            selectionRenderTriggers,
            relationsRenderTriggers,
        ));
        this.#signaller.addEventListener('render', this.#requireRender);

        this.#render();
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.labelsView.removeEventListener('beforeload', this.#onDataLoad);
        this.labelsView.removeEventListener('afterload', this.#onDataLoad);

        this.#inspector.removeEventListener('change', this.#onInspectorChange);
        this.#inspector.paneEvents.removeEventListener('click-drawVector', this.#onDrawVector);
        this.#inspector.dispose();

        this.#signaller.removeEventListener('render', this.#requireRender);
        this.#signaller.dispose();
    }

    /**
     * Clicks on the draw Vector button.
     * 
     * This is a no-op if the button is disabled.
     */
    clickDrawVector() {
        this.#inspector.clickDrawVector();
    }
}
