import * as THREE from 'three';

import { LabelBoxInspectorPaneController } from './LabelBoxInspectorPane';
import { renderTriggers as descriptorsRenderTriggers, LabelBoxDescriptorsPaneController } from './LabelBoxDescriptorsPane';
import { renderTriggers as geometryRenderTriggers, LabelBoxGeometryPaneController } from './LabelBoxGeometryPane';
import { renderTriggers as selectionRenderTriggers } from './LabelBoxSelectionPane';
import { renderTriggers as relationsRenderTriggers } from './LabelBoxRelationsPane';
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
 * @typedef {import('../data').BoxParams} BoxParams
 */

/**
 * @typedef {import('../data').BBoxView} BBoxView
 */

/**
 * @typedef {import('../data').ReadonlyLabelBox} ReadonlyLabelBox
 */

/**
 * @typedef {import('../data').ReadonlyLabelTrack} ReadonlyLabelTrack
 */

/**
 * @typedef {import('../data').UUID} UUID
 */

/**
 * @typedef {import('../data/LabelBox').PropertyChangeEvent} LabelBoxChangeEvent
 */

/**
 * @typedef {import('./LabelBoxInspectorPane').LabelBoxParams} LabelBoxParams
 */

/**
 * @typedef {import('./LabelBoxInspectorPane').LabelBoxInspectorPaneControllerEventMap} LabelBoxInspectorPaneControllerEventMap
 */

/**
 * @typedef {import('./LabelBoxInspectorPane').LabelBoxInspectorPaneControllerParams} LabelBoxInspectorPaneControllerParams
 */
/* eslint-enable max-len */

/**
 * Defines each event that can be dispatched by {@link LabelBoxInspector}.
 * 
 * @typedef {object} LabelBoxInspectorEventMap
 * @property {{ value: ?ReadonlyLabelBox }} select-box The event when another bounding box
 * is selected.
 * @property {{ drawBoxActive: boolean }} toggle-drawBox The event when the draw box button
 * is toggled.
 * @property {{ value: ?ReadonlyLabelTrack }} select-track The event when another object track
 * is selected.
 */

/**
 * @typedef {object} LabelBoxInspectorParams
 * @property {BBoxView} labelsView The collection of labels used to update
 * the selected bounding box.
 * @property {?UUID} [selectedId=null] The unique identifier of the bounding box
 * that is selected, if any.
 * @property {boolean} [disabled=false] `true` if the inspector is disabled; otherwise, `false`.
 * @property {boolean} [autoTracks=false] If `true`, each object track only has one bounding box,
 * and such objects are managed by the program without explicit input from the user.
 */

/**
 * Displays information about a bounding box which can be edited directly.
 * 
 * @augments THREE.EventDispatcher<LabelBoxInspectorEventMap>
 */
export class LabelBoxInspector extends THREE.EventDispatcher {

    /**
     * The DOM element representing this inspector.
     * 
     * @readonly
     * @type {HTMLDivElement}
     */
    dom;

    /**
     * @readonly
     * @type {LabelBoxInspectorPaneController}
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
        if (selectedId != null && !this.labelsView.hasLabelBox(selectedId)) {
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
     * The unique identifier of the bounding box that is selected, if any.
     * 
     * @type {?UUID}
     */
    get selectedId() { return this.#selectedId; }

    /**
     * The unique identifier of the bounding box that is selected, if any.
     * 
     * @type {?UUID}
     */
    set selectedId(value) {
        if (this.#selectedId !== value) {
            this.#selectedId = value;

            // Need to show the attributes for the newly selected bounding box
            this.#render();

            this.dispatchEvent({ type: 'select-box', value: this.selectedBox });
        }
    }

    /**
     * The bounding box that is selected, if any.
     * 
     * @type {?ReadonlyLabelBox}
     */
    get selectedBox() {
        const { selectedId, labelsView } = this;
        if (selectedId == null) return null;

        return labelsView.hasLabelBox(selectedId) ? labelsView.getLabelBox(selectedId)
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
    #autoTracks;

    /**
     * If `true`, each object track only has one bounding box, and such objects
     * are managed by the program without explicit input from the user.
     * 
     * @type {boolean}
     */
    get autoTracks() { return this.#autoTracks; }

    set autoTracks(value) {
        if (this.#autoTracks !== value) {
            this.#autoTracks = value;

            // Need to update the settings
            this.#render();
        }
    }

    /**
     * @type {boolean}
     */
    #drawBoxActive;

    /**
     * `true` if the draw box button is active; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get drawBoxActive() { return this.#drawBoxActive; }

    set drawBoxActive(value) {
        if (this.#drawBoxActive !== value) {
            this.#drawBoxActive = value;

            // Need to update the settings
            this.#render();
        }
    }

    /**
     * Handles the event when the attributes in the inspector have been updated.
     * 
     * @param {PaneControllerChangeEvent<LabelBoxInspectorPaneControllerParams>} event
     * The event to handle.
     */
    #onInspectorChange = async (event) => {
        const { boxId: prevBoxId, trackId: prevTrackId } = event.prevOutputData;
        const { boxId, trackId } = event.outputData;

        // Select box
        if (boxId !== prevBoxId) {
            this.selectedId = boxId;
        // Edit box
        } else {
            this.#updateBox();
        }

        // Select track
        if (trackId !== prevTrackId) {
            const { labelsView } = this;

            const track = (trackId == null) ? null : labelsView.getLabelTrack(trackId);
            this.dispatchEvent({ type: 'select-track', value: track });
        }
    };

    /**
     * Updates the currently selected box according to the view.
     */
    async #updateBox() {
        const { labelsView, selectedBox } = this;
        if (selectedBox == null) return;

        const {
            boxType, trackId, classId,
            distinctiveLv, occlusionLv,
        } = this.#inspector.outputData;

        if (selectedBox.boxType !== boxType) {
            await labelsView.updateLabelBoxType(selectedBox, boxType);
        }

        if (selectedBox.entityId !== trackId) {
            const track = (trackId == null) ? null : labelsView.getLabelTrack(trackId);
            await labelsView.updateLabelBoxParentTrack(selectedBox, track);
        }

        if (selectedBox.perceivedClassId !== classId) {
            const labelClass = (classId == null) ? null : labelsView.getLabelClass(classId);
            await labelsView.updateLabelBoxPerceivedClass(selectedBox, labelClass);

            if (this.autoTracks) {
                if (labelClass != null) {
                    const track = await labelsView.addLabelTrack({ gtClassId: classId });
                    await labelsView.updateLabelBoxParentTrack(selectedBox, track);
                } else {
                    await labelsView.updateLabelBoxParentTrack(selectedBox, null);
                }
            }
        }

        if (!selectedBox.distinctiveLv.equals(distinctiveLv)) {
            await labelsView.updateLabelBoxDistinctiveLv(selectedBox, distinctiveLv);
        }

        if (!selectedBox.occlusionLv.equals(occlusionLv)) {
            await labelsView.updateLabelBoxOcclusionLv(selectedBox, occlusionLv);
        }
    }

    /**
     * Updates the view according to the data in this object.
     */
    #render() {
        const { labelsView, selectedBox, disabled, autoTracks, drawBoxActive } = this;
        const labels = labelsView.data;

        const geometryDefault = LabelBoxGeometryPaneController.FACTORY_PARAMS.inputtedData;
        const descriptorsDefault = LabelBoxDescriptorsPaneController.FACTORY_PARAMS.inputtedData;

        let inputtedData;
        if (selectedBox == null) {
            inputtedData = {
                selection: { boxId: null },
                geometry: geometryDefault,
                relations: {
                    trackSelect: { trackId: null },
                    classSelect: { classId: null },
                },
                descriptors: descriptorsDefault,
            };
        } else {
            inputtedData = {
                selection: { boxId: selectedBox.id },
                geometry: {
                    boxType: selectedBox.boxType,
                    center: selectedBox.center,
                    size: selectedBox.size,
                    angle: selectedBox.angle,
                },
                relations: {
                    trackSelect: { trackId: selectedBox.entityId },
                    classSelect: { classId: selectedBox.perceivedClassId },
                },
                descriptors: {
                    distinctiveLv: selectedBox.distinctiveLv,
                    occlusionLv: selectedBox.occlusionLv,
                },
            };
        }

        this.#inspector.updateState({
            inputtedData: inputtedData,
            internalData: {
                boxes: new Map(Array.from(labelsView.iterLabelBoxes(), (e) => [e.id, e])),
                tracks: new Map(Array.from(labelsView.iterLabelTracks(), (e) => [e.id, e])),
                classes: new Map(Array.from(labelsView.iterLabelClasses(), (e) => [e.id, e])),
            },
            settings: {
                disabled: disabled || (labels == null),
                drawBoxActive: drawBoxActive,
                disableTrackInput: autoTracks,
            },
        });

        this.#signaller.labels = labels;
    }

    #requireRender = () => this.#render();

    /**
     * Handles the event when the user begins drawing a new bounding box.
     * 
     * @param {LabelBoxInspectorPaneControllerEventMap['click-drawBox']} event The event to handle.
     */
    #onDrawBox = (event) => {
        this.drawBoxActive = !this.drawBoxActive;

        this.dispatchEvent({ type: 'toggle-drawBox', drawBoxActive: this.drawBoxActive });
    };

    /**
     * Gets the parameters of a bounding box represented by this inspector.
     * 
     * @returns {Omit<BoxParams, 'config' | 'id' | 'center' | 'angle' | 'size'>} The requested
     * parameters.
     */
    getBoxParams() {
        const {
            boxType, trackId, classId,
            distinctiveLv, occlusionLv,
        } = this.#inspector.outputData;

        return {
            boxType: boxType,
            entityId: trackId,
            perceivedClassId: classId,
            distinctiveLv: distinctiveLv,
            occlusionLv: occlusionLv,
        };
    }

    /**
     * Creates a new bounding box inspector.
     * 
     * @param {LabelBoxInspectorParams} params The parameters of the inspector.
     */
    constructor(params) {
        super();

        this.labelsView = params.labelsView ?? null;
        this.labelsView.addEventListener('beforeload', this.#onDataLoad);
        this.labelsView.addEventListener('afterload', this.#onDataLoad);

        this.#selectedId = params.selectedId ?? null;
        this.#disabled = params.disabled ?? false;
        this.#autoTracks = params.autoTracks ?? false;

        this.dom = document.createElement('div');
        {
            this.#inspector = LabelBoxInspectorPaneController.create(this.dom, {
                settings: {
                    disabled: false,
                    hidden: false,
                    drawBoxActive: false,
                    disableTransform: true,
                    disableTrackInput: false,
                },
            });
            this.#inspector.addEventListener('change', this.#onInspectorChange);
            this.#inspector.paneEvents.addEventListener('click-drawBox', this.#onDrawBox);
        }

        this.#signaller = new InspectorRenderSignaller(composeRenderTriggers(
            selectionRenderTriggers,
            geometryRenderTriggers,
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
        this.#inspector.paneEvents.removeEventListener('click-drawBox', this.#onDrawBox);
        this.#inspector.dispose();

        this.#signaller.removeEventListener('render', this.#requireRender);
        this.#signaller.dispose();
    }

    /**
     * Clicks on the draw box button.
     * 
     * This is a no-op if the button is disabled.
     */
    clickDrawBox() {
        this.#inspector.clickDrawBox();
    }
}
