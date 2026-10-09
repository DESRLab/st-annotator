import * as THREE from 'three';

import { LabelSelectionInspectorPaneController } from './LabelSelectionInspectorPane';
import {
    LabelSelectionDescriptorsPaneController,
    renderTriggers as descriptorsRenderTriggers,
} from './LabelSelectionDescriptorsPane';
import { renderTriggers as selectionRenderTriggers } from './LabelSelectionSelectionPane';
import { renderTriggers as relationsRenderTriggers } from './LabelSelectionRelationsPane';
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
 * @typedef {import('../data').SelectionParams} SelectionParams
 */

/**
 * @typedef {import('../data').SegmentationView} SegmentationView
 */

/**
 * @typedef {import('../data').ReadonlyLabelSelection} ReadonlyLabelSelection
 */

/**
 * @typedef {import('../data').ReadonlyLabelInstance} ReadonlyLabelInstance
 */

/**
 * @typedef {import('../data').UUID} UUID
 */

/**
 * @typedef {import('../data/LabelSelection').PropertyChangeEvent} LabelSelectionChangeEvent
 */

/**
 * @typedef {import('./LabelSelectionInspectorPane').LabelSelectionParams} LabelSelectionParams
 */

/**
 * @typedef {import('./LabelSelectionInspectorPane').LabelSelectionInspectorPaneControllerEventMap} LabelSelectionInspectorPaneControllerEventMap
 */

/**
 * @typedef {import('./LabelSelectionInspectorPane').LabelSelectionInspectorPaneControllerParams} LabelSelectionInspectorPaneControllerParams
 */
/* eslint-enable max-len */

/**
 * Defines each event that can be dispatched by {@link LabelSelectionInspector}.
 * 
 * @typedef {object} LabelSelectionInspectorEventMap
 * @property {{ value: ?ReadonlyLabelSelection }} select-selection The event when
 * another selection is selected.
 * @property {{ drawSelectionActive: boolean }} toggle-drawSelection The event when
 * the draw selection button is toggled.
 * @property {{ value: ?ReadonlyLabelInstance }} select-instance The event when
 * another object instance is selected.
 */

/**
 * @typedef {object} LabelSelectionInspectorParams
 * @property {SegmentationView} labelsView The collection of labels used to update
 * the selected selection.
 * @property {?UUID} [selectedId=null] The unique identifier of the selection
 * that is selected, if any.
 * @property {boolean} [disabled=false] `true` if the inspector is disabled; otherwise, `false`.
 * @property {boolean} [autoInstances=false] If `true`, each object instance only has one selection,
 * and such objects are managed by the program without explicit input from the user.
 */

/**
 * Displays information about a selection which can be edited directly.
 * 
 * @augments THREE.EventDispatcher<LabelSelectionInspectorEventMap>
 */
export class LabelSelectionInspector extends THREE.EventDispatcher {

    /**
     * The DOM element representing this inspector.
     * 
     * @readonly
     * @type {HTMLDivElement}
     */
    dom;

    /**
     * @readonly
     * @type {LabelSelectionInspectorPaneController}
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
        if (selectedId != null && !this.labelsView.hasLabelSelection(selectedId)) {
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
     * The unique identifier of the selection that is selected, if any.
     * 
     * @type {?UUID}
     */
    get selectedId() { return this.#selectedId; }

    /**
     * The unique identifier of the selection that is selected, if any.
     * 
     * @type {?UUID}
     */
    set selectedId(value) {
        if (this.#selectedId !== value) {
            this.#selectedId = value;

            // Need to show the attributes for the newly selected selection
            this.#render();

            this.dispatchEvent({ type: 'select-selection', value: this.selectedSelection });
        }
    }

    /**
     * The selection that is selected, if any.
     * 
     * @type {?ReadonlyLabelSelection}
     */
    get selectedSelection() {
        const { selectedId, labelsView } = this;
        if (selectedId == null) return null;

        return labelsView.hasLabelSelection(selectedId) ? labelsView.getLabelSelection(selectedId)
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
    #autoInstances = true;

    /**
     * If `true`, each object instance only has one selection, and such objects
     * are managed by the program without explicit input from the user.
     * 
     * @type {boolean}
     */
    get autoInstances() { return this.#autoInstances; }

    set autoInstances(value) {
        if (this.#autoInstances !== value) {
            this.#autoInstances = value;

            // Need to update the settings
            this.#render();
        }
    }

    /**
     * @type {boolean}
     */
    #drawSelectionActive;

    /**
     * `true` if the draw selection button is active; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get drawSelectionActive() { return this.#drawSelectionActive; }

    set drawSelectionActive(value) {
        if (this.#drawSelectionActive !== value) {
            this.#drawSelectionActive = value;

            // Need to update the settings
            this.#render();
        }
    }

    /**
     * Handles the event when the attributes in the inspector have been updated.
     * 
     * @param {PaneControllerChangeEvent<LabelSelectionInspectorPaneControllerParams>} event
     * The event to handle.
     */
    #onInspectorChange = async (event) => {
        const { selectionId: prevSelectionId, instanceId: prevInstanceId } = event.prevOutputData;
        const { selectionId, instanceId } = event.outputData;

        // Select selection
        if (selectionId !== prevSelectionId) {
            this.selectedId = selectionId;
        // Edit selection
        } else {
            this.#updateSelection();
        }

        // Select instance
        if (instanceId !== prevInstanceId) {
            const { labelsView } = this;

            const instance = (instanceId == null) ? null : labelsView.getLabelInstance(instanceId);
            this.dispatchEvent({ type: 'select-instance', value: instance });
        }
    };

    /**
     * Updates the currently selected selection according to the view.
     */
    async #updateSelection() {
        const { labelsView, selectedSelection } = this;
        if (selectedSelection == null) return;

        const {
            instanceId, classId,
            distinctiveLv, occlusionLv,
        } = this.#inspector.outputData;

        if (selectedSelection.entityId !== instanceId) {
            const instance = (instanceId == null) ? null : labelsView.getLabelInstance(instanceId);
            await labelsView.updateLabelSelectionParentInstance(selectedSelection, instance);
        }

        if (selectedSelection.perceivedClassId !== classId) {
            const labelClass = (classId == null) ? null : labelsView.getLabelClass(classId);
            await labelsView.updateLabelSelectionPerceivedClass(selectedSelection, labelClass);

            if (this.autoInstances) {
                if (labelClass != null) {
                    const instance = await labelsView.addLabelInstance({ gtClassId: classId });
                    await labelsView
                        .updateLabelSelectionParentInstance(selectedSelection, instance);
                } else {
                    await labelsView.updateLabelSelectionParentInstance(selectedSelection, null);
                }
            }
        }

        if (!selectedSelection.distinctiveLv.equals(distinctiveLv)) {
            await labelsView.updateLabelSelectionDistinctiveLv(selectedSelection, distinctiveLv);
        }

        if (!selectedSelection.occlusionLv.equals(occlusionLv)) {
            await labelsView.updateLabelSelectionOcclusionLv(selectedSelection, occlusionLv);
        }
    }

    /**
     * Updates the view according to the data in this object.
     */
    #render() {
        const {
            labelsView, selectedSelection,
            disabled, autoInstances,
            drawSelectionActive,
        } = this;
        const labels = labelsView.data;

        const descriptorsDefault = LabelSelectionDescriptorsPaneController
            .FACTORY_PARAMS.inputtedData;

        let inputtedData;
        if (selectedSelection == null) {
            inputtedData = {
                selection: { selectionId: null },
                relations: {
                    instanceSelect: { instanceId: null },
                    classSelect: { classId: null },
                },
                descriptors: descriptorsDefault,
            };
        } else {
            inputtedData = {
                selection: { selectionId: selectedSelection.id },
                relations: {
                    instanceSelect: { instanceId: selectedSelection.entityId },
                    classSelect: { classId: selectedSelection.perceivedClassId },
                },
                descriptors: {
                    distinctiveLv: selectedSelection.distinctiveLv,
                    occlusionLv: selectedSelection.occlusionLv,
                },
            };
        }

        this.#inspector.updateState({
            inputtedData: inputtedData,
            internalData: {
                selections: new Map(Array
                    .from(labelsView.iterLabelSelections(), (e) => [e.id, e])),
                instances: new Map(Array
                    .from(labelsView.iterLabelInstances(), (e) => [e.id, e])),
                classes: new Map(Array
                    .from(labelsView.iterLabelClasses(), (e) => [e.id, e])),
            },
            settings: {
                disabled: disabled || (labels == null),
                drawSelectionActive: drawSelectionActive,
                disableInstanceInput: !autoInstances,
            },
        });

        this.#signaller.labels = labels;
    }

    #requireRender = () => this.#render();

    /**
     * Handles the event when the user begins drawing a new selection.
     * 
     * @param {LabelSelectionInspectorPaneControllerEventMap['click-drawSelection']} event
     * The event to handle.
     */
    #onDrawSelection = (event) => {
        this.drawSelectionActive = !this.drawSelectionActive;

        this.dispatchEvent({ type: 'toggle-drawSelection', drawSelectionActive: this.drawSelectionActive });
    };

    /**
     * Gets the parameters of a selection represented by this inspector.
     * 
     * @returns {Omit<SelectionParams, 'config' | 'id' | 'points'>} The requested
     * parameters.
     */
    getSelectionParams() {
        const {
            instanceId, classId,
            distinctiveLv, occlusionLv,
        } = this.#inspector.outputData;

        return {
            entityId: instanceId,
            perceivedClassId: classId,
            distinctiveLv: distinctiveLv,
            occlusionLv: occlusionLv,
        };
    }

    /**
     * Creates a new selection inspector.
     * 
     * @param {LabelSelectionInspectorParams} params The parameters of the inspector.
     */
    constructor(params) {
        super();

        this.labelsView = params.labelsView ?? null;
        this.labelsView.addEventListener('beforeload', this.#onDataLoad);
        this.labelsView.addEventListener('afterload', this.#onDataLoad);

        this.#selectedId = params.selectedId ?? null;
        this.#disabled = params.disabled ?? false;
        this.#autoInstances = params.autoInstances ?? false;

        this.dom = document.createElement('div');
        {
            this.#inspector = LabelSelectionInspectorPaneController.create(this.dom, {
                settings: {
                    disabled: false,
                    hidden: false,
                    drawSelectionActive: false,
                    disableInstanceInput: false,
                },
            });
            this.#inspector.addEventListener('change', this.#onInspectorChange);
            this.#inspector.paneEvents.addEventListener('click-drawSelection', this.#onDrawSelection);
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
        this.#inspector.paneEvents.removeEventListener('click-drawSelection', this.#onDrawSelection);
        this.#inspector.dispose();

        this.#signaller.removeEventListener('render', this.#requireRender);
        this.#signaller.dispose();
    }

    /**
     * Clicks on the draw selection button.
     * 
     * This is a no-op if the button is disabled.
     */
    clickDrawSelection() {
        this.#inspector.clickDrawSelection();
    }
}
