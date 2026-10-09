import * as THREE from 'three';

import { LabelTrackInspectorPaneController } from './LabelTrackInspectorPane';
import { renderTriggers as descriptorsRenderTriggers } from './LabelTrackDescriptorsPane';
import { renderTriggers as selectionRenderTriggers } from './LabelTrackSelectionPane';
import { renderTriggers as relationsRenderTriggers } from './LabelTrackRelationsPane';
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
 * @typedef {import('../data').BBoxView} BBoxView
 */

/**
 * @typedef {import('../data').ReadonlyLabelTrack} ReadonlyLabelTrack
 */

/**
 * @typedef {import('../data').TrackParams} TrackParams
 */

/**
 * @typedef {import('../data').UUID} UUID
 */

/**
 * @typedef {import('./LabelTrackInspectorPane').LabelTrackParams} LabelTrackParams
 */

/**
 * @typedef {import('./LabelTrackInspectorPane').LabelTrackInspectorPaneControllerEventMap} LabelTrackInspectorPaneControllerEventMap
 */

/**
 * @typedef {import('./LabelTrackInspectorPane').LabelTrackInspectorPaneControllerParams} LabelTrackInspectorPaneControllerParams
 */
/* eslint-enable max-len */

/**
 * Defines each event that can be dispatched by {@link LabelTrackInspector}.
 * 
 * @typedef {object} LabelTrackInspectorEventMap
 * @property {{ value: ?ReadonlyLabelTrack }} select-track The event when another
 * object track is selected.
 */

/**
 * @typedef {object} LabelTrackInspectorParams
 * @property {BBoxView} labelsView The collection of labels used to update
 * the selected object track.
 * @property {?UUID} [selectedId=null] The unique identifier of the object track
 * that is selected, if any.
 * @property {boolean} [disabled=false] `true` if the inspector is disabled; otherwise, `false`.
 */

/**
 * Displays information about an object track which can be edited directly.
 * 
 * @augments THREE.EventDispatcher<LabelTrackInspectorEventMap>
 */
export class LabelTrackInspector extends THREE.EventDispatcher {

    /**
     * The DOM element representing this inspector.
     * 
     * @readonly
     * @type {HTMLDivElement}
     */
    dom;

    /**
     * Specifies the attributes to apply to the object track.
     * 
     * @readonly
     * @type {LabelTrackInspectorPaneController}
     */
    #inspector;

    /**
     * A view of the collection of labels used to update the selected object track.
     * 
     * @readonly
     * @type {BBoxView}
     */
    labelsView;

    /**
     * Handles the event when the collection of labels is (un)loaded.
     */
    #onDataLoad = () => {
        const selectedId = this.selectedId;
        if (selectedId != null && !this.labelsView.hasLabelTrack(selectedId)) {
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
     * The unique identifier of the object track that is selected, if any.
     * 
     * @type {?UUID}
     */
    get selectedId() { return this.#selectedId; }

    /**
     * The unique identifier of the object track that is selected, if any.
     * 
     * @type {?UUID}
     */
    set selectedId(value) {
        if (this.#selectedId !== value) {
            this.#selectedId = value;

            // Need to show the attributes for the newly selected object track
            this.#render();

            this.dispatchEvent({ type: 'select-track', value: this.selectedTrack });
        }
    }

    /**
     * The object track that is selected, if any.
     * 
     * @type {?ReadonlyLabelTrack}
     */
    get selectedTrack() {
        const { selectedId, labelsView } = this;
        if (selectedId == null) return null;

        return labelsView.hasLabelTrack(selectedId) ? labelsView.getLabelTrack(selectedId)
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
     * @param {PaneControllerChangeEvent<LabelTrackInspectorPaneControllerParams>} event
     * The event to handle.
     */
    #onInspectorChange = async (event) => {
        const { trackId: prevTrackId } = event.prevOutputData;
        const { trackId } = event.outputData;

        // Select track
        if (trackId !== prevTrackId) {
            this.selectedId = trackId;
        // Edit track
        } else {
            this.#updateTrack();
        }
    };

    /**
     * Updates the currently selected track according to the view.
     */
    async #updateTrack() {
        const { labelsView, selectedTrack } = this;
        if (selectedTrack == null) return;

        const { classId, isBlack } = this.#inspector.outputData;

        if (selectedTrack.gtClassId !== classId) {
            const labelClass = (classId == null) ? null : labelsView.getLabelClass(classId);
            await labelsView.updateLabelTrackGtClass(selectedTrack, labelClass);
        }

        if (selectedTrack.isBlack !== isBlack) {
            await labelsView.updateLabelTrackIsBlack(selectedTrack, isBlack);
        }
    }

    /**
     * Updates the view according to the data in this object.
     */
    #render() {
        const { labelsView, selectedTrack, disabled } = this;
        const labels = labelsView.data;

        let inputtedData;
        if (selectedTrack == null) {
            inputtedData = { selection: { trackId: null } };
        } else {
            inputtedData = {
                selection: { trackId: selectedTrack.id },
                relations: {
                    classSelect: { classId: selectedTrack.gtClassId },
                },
                descriptors: {
                    isBlack: selectedTrack.isBlack,
                },
            };
        }

        this.#inspector.updateState({
            inputtedData: inputtedData,
            internalData: {
                tracks: new Map(Array.from(labelsView.iterLabelTracks(), (e) => [e.id, e])),
                classes: new Map(Array.from(labelsView.iterLabelClasses(), (e) => [e.id, e])),
            },
            settings: { disabled: disabled || (labels == null) },
        });

        this.#signaller.labels = labels;
    }

    #requireRender = () => this.#render();

    /**
     * Handles the event when the user creates a new object track by clicking the
     * corresponding button in the inspector.
     * 
     * @param {LabelTrackInspectorPaneControllerEventMap['click-createTrack']} event
     * The event to handle.
     */
    #onCreateTrack = async (event) => {
        const { labelsView } = this;

        const params = this.getTrackParams();
        const newTrack = await labelsView.addLabelTrack(params);

        // Triggers re-render
        this.selectedId = newTrack.id;
    };

    /**
     * Gets the parameters of an object track represented by this inspector.
     * 
     * @returns {Omit<TrackParams, 'config' | 'id'>} The requested parameters.
     */
    getTrackParams() {
        const { classId, isBlack } = this.#inspector.outputData;

        return {
            gtClassId: classId,
            isBlack: isBlack,
        };
    }

    /**
     * Creates a new object track inspector.
     * 
     * @param {LabelTrackInspectorParams} params The parameters of the inspector.
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
            this.#inspector = LabelTrackInspectorPaneController.create(this.dom);
            this.#inspector.addEventListener('change', this.#onInspectorChange);
            this.#inspector.paneEvents.addEventListener('click-createTrack', this.#onCreateTrack);
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
        this.#inspector.paneEvents.removeEventListener('click-createTrack', this.#onCreateTrack);
        this.#inspector.dispose();

        this.#signaller.removeEventListener('render', this.#requireRender);
        this.#signaller.dispose();
    }

    /**
     * Clicks on the create track button.
     * 
     * This is a no-op if the button is disabled.
     */
    clickCreateTrack() {
        this.#inspector.clickCreateTrack();
    }
}
