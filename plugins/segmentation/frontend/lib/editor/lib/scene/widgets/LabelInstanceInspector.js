import * as THREE from 'three';

import { LabelInstanceInspectorPaneController } from './LabelInstanceInspectorPane';
import { renderTriggers as descriptorsRenderTriggers } from './LabelInstanceDescriptorsPane';
import { renderTriggers as selectionRenderTriggers } from './LabelInstanceSelectionPane';
import { renderTriggers as relationsRenderTriggers } from './LabelInstanceRelationsPane';
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
 * @typedef {import('../data').SegmentationView} SegmentationView
 */

/**
 * @typedef {import('../data').ReadonlyLabelInstance} ReadonlyLabelInstance
 */

/**
 * @typedef {import('../data').InstanceParams} InstanceParams
 */

/**
 * @typedef {import('../data').UUID} UUID
 */

/**
 * @typedef {import('./LabelInstanceInspectorPane').LabelInstanceParams} LabelInstanceParams
 */

/**
 * @typedef {import('./LabelInstanceInspectorPane').LabelInstanceInspectorPaneControllerEventMap} LabelInstanceInspectorPaneControllerEventMap
 */

/**
 * @typedef {import('./LabelInstanceInspectorPane').LabelInstanceInspectorPaneControllerParams} LabelInstanceInspectorPaneControllerParams
 */
/* eslint-enable max-len */

/**
 * Defines each event that can be dispatched by {@link LabelInstanceInspector}.
 * 
 * @typedef {object} LabelInstanceInspectorEventMap
 * @property {{ value: ?ReadonlyLabelInstance }} select-instance The event when another
 * object instance is selected.
 */

/**
 * @typedef {object} LabelInstanceInspectorParams
 * @property {SegmentationView} labelsView The collection of labels used to update
 * the selected object instance.
 * @property {?UUID} [selectedId=null] The unique identifier of the object instance
 * that is selected, if any.
 * @property {boolean} [disabled=false] `true` if the inspector is disabled; otherwise, `false`.
 */

/**
 * Displays information about an object instance which can be edited directly.
 * 
 * @augments THREE.EventDispatcher<LabelInstanceInspectorEventMap>
 */
export class LabelInstanceInspector extends THREE.EventDispatcher {

    /**
     * The DOM element representing this inspector.
     * 
     * @readonly
     * @type {HTMLDivElement}
     */
    dom;

    /**
     * Specifies the attributes to apply to the object instance.
     * 
     * @readonly
     * @type {LabelInstanceInspectorPaneController}
     */
    #inspector;

    /**
     * A view of the collection of labels used to update the selected object instance.
     * 
     * @readonly
     * @type {SegmentationView}
     */
    labelsView;

    /**
     * Handles the event when the collection of labels is (un)loaded.
     */
    #onDataLoad = () => {
        const selectedId = this.selectedId;
        if (selectedId != null && !this.labelsView.hasLabelInstance(selectedId)) {
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
     * The unique identifier of the object instance that is selected, if any.
     * 
     * @type {?UUID}
     */
    get selectedId() { return this.#selectedId; }

    /**
     * The unique identifier of the object instance that is selected, if any.
     * 
     * @type {?UUID}
     */
    set selectedId(value) {
        if (this.#selectedId !== value) {
            this.#selectedId = value;

            // Need to show the attributes for the newly selected object instance
            this.#render();

            this.dispatchEvent({ type: 'select-instance', value: this.selectedInstance });
        }
    }

    /**
     * The object instance that is selected, if any.
     * 
     * @type {?ReadonlyLabelInstance}
     */
    get selectedInstance() {
        const { selectedId, labelsView } = this;
        if (selectedId == null) return null;

        return labelsView.hasLabelInstance(selectedId) ? labelsView.getLabelInstance(selectedId)
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
     * Handles the event when the attributes in the inspector have been updated.
     * 
     * @param {PaneControllerChangeEvent<LabelInstanceInspectorPaneControllerParams>} event
     * The event to handle.
     */
    #onInspectorChange = async (event) => {
        const { instanceId: prevInstanceId } = event.prevOutputData;
        const { instanceId } = event.outputData;

        // Select instance
        if (instanceId !== prevInstanceId) {
            this.selectedId = instanceId;
        // Edit instance
        } else {
            this.#updateInstance();
        }
    };

    /**
     * Updates the currently selected instance according to the view.
     */
    async #updateInstance() {
        const { labelsView, selectedInstance } = this;
        if (selectedInstance == null) return;

        const { classId, isBlack } = this.#inspector.outputData;

        if (selectedInstance.gtClassId !== classId) {
            const labelClass = (classId == null) ? null : labelsView.getLabelClass(classId);
            await labelsView.updateLabelInstanceGtClass(selectedInstance, labelClass);
        }

        if (selectedInstance.isBlack !== isBlack) {
            await labelsView.updateLabelInstanceIsBlack(selectedInstance, isBlack);
        }
    }

    /**
     * Updates the view according to the data in this object.
     */
    #render() {
        const { labelsView, selectedInstance, disabled } = this;
        const labels = labelsView.data;

        let inputtedData;
        if (selectedInstance == null) {
            inputtedData = { selection: { instanceId: null } };
        } else {
            inputtedData = {
                selection: { instanceId: selectedInstance.id },
                relations: {
                    classSelect: { classId: selectedInstance.gtClassId },
                },
                descriptors: {
                    isBlack: selectedInstance.isBlack,
                },
            };
        }

        this.#inspector.updateState({
            inputtedData: inputtedData,
            internalData: {
                instances: new Map(Array.from(labelsView.iterLabelInstances(), (e) => [e.id, e])),
                classes: new Map(Array.from(labelsView.iterLabelClasses(), (e) => [e.id, e])),
            },
            settings: { disabled: disabled || (labels == null) },
        });

        this.#signaller.labels = labels;
    }

    #requireRender = () => this.#render();

    /**
     * Handles the event when the user creates a new object instance by clicking the
     * corresponding button in the inspector.
     * 
     * @param {LabelInstanceInspectorPaneControllerEventMap['click-createInstance']} event
     * The event to handle.
     */
    #onCreateInstance = async (event) => {
        const { labelsView } = this;

        const params = this.getInstanceParams();
        const newInstance = await labelsView.addLabelInstance(params);

        // Triggers re-render
        this.selectedId = newInstance.id;
    };

    /**
     * Gets the parameters of an object instance represented by this inspector.
     * 
     * @returns {Omit<InstanceParams, 'config' | 'id'>} The requested parameters.
     */
    getInstanceParams() {
        const { classId, isBlack } = this.#inspector.outputData;

        return {
            gtClassId: classId,
            isBlack: isBlack,
        };
    }

    /**
     * Creates a new object instance inspector.
     * 
     * @param {LabelInstanceInspectorParams} params The parameters of the inspector.
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
            this.#inspector = LabelInstanceInspectorPaneController.create(this.dom);
            this.#inspector.addEventListener('change', this.#onInspectorChange);
            this.#inspector.paneEvents.addEventListener('click-createInstance', this.#onCreateInstance);
        }

        this.#signaller = new InspectorRenderSignaller(composeRenderTriggers(
            selectionRenderTriggers,
            relationsRenderTriggers,
            descriptorsRenderTriggers,
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
        this.#inspector.paneEvents.removeEventListener('click-createInstance', this.#onCreateInstance);
        this.#inspector.dispose();

        this.#signaller.removeEventListener('render', this.#requireRender);
        this.#signaller.dispose();
    }

    /**
     * Clicks on the create instance button.
     * 
     * This is a no-op if the button is disabled.
     */
    clickCreateInstance() {
        this.#inspector.clickCreateInstance();
    }
}
