import $ from 'jquery';
import 'jstree';
import * as THREE from 'three';

import { LabelBoxSelectionPaneController, renderTriggers as boxSelectionRenderTriggers } from './LabelBoxSelectionPane';
import { LabelTrackSelectionPaneController, renderTriggers as trackSelectionRenderTriggers } from './LabelTrackSelectionPane';
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
 * @typedef {import('../data').ReadonlyLabelBox} ReadonlyLabelBox
 */

/**
 * @typedef {import('../data').ReadonlyLabelTrack} ReadonlyLabelTrack
 */

/**
 * @typedef {import('../data').ReadonlyBBoxIndex} ReadonlyBBoxIndex
 */

/**
 * @typedef {import('../data').UUID} UUID
 */

/**
 * @typedef {import('./LabelBoxSelectionPane').LabelBoxSelection} LabelBoxSelection
 */

/**
 * @typedef {import('./LabelBoxSelectionPane').LabelBoxSelectionPaneControllerParams} LabelBoxSelectionPaneControllerParams
 */

/**
 * @typedef {import('./LabelTrackSelectionPane').LabelTrackSelection} LabelTrackSelection
 */

/**
 * @typedef {import('./LabelTrackSelectionPane').LabelTrackSelectionPaneControllerParams} LabelTrackSelectionPaneControllerParams
 */
/* eslint-enable max-len */

/**
 * @typedef {{ id: UUID, text: string, selected: boolean }} BoxItem
 */

/**
 * @typedef {{
 *     id: ?UUID;
 *     text: string;
 *     selected: boolean, items: ReadonlyArray<BoxItem>;
 * }} TrackItem
 */

/**
 * @typedef {ReadonlyArray<TrackItem>} TreeItems
 */

/**
 * Defines each event that can be dispatched by {@link BBoxLabelsTreeView}.
 * 
 * @typedef {object} BBoxLabelsTreeViewEventMap
 * @property {{ id: ?UUID }} click-box-item The event when the element for another bounding box
 * is clicked.
 * @property {{ id: ?UUID }} click-track-item The event when the element for another object track
 * is clicked.
 */

/**
 * @typedef {object} BBoxLabelsTreeViewParams
 * @property {TreeItems} [items=[]] The information of each element to display in the tree view.
 * @property {boolean} [disabled=false] `true` if the view is disabled; otherwise, `false`.
 */

/**
 * View class for {@link BBoxLabelsTree}.
 * 
 * @augments THREE.EventDispatcher<BBoxLabelsTreeViewEventMap>
 */
class BBoxLabelsTreeView extends THREE.EventDispatcher {

    /**
     * The DOM element representing the input.
     * 
     * @readonly
     * @type {HTMLDivElement}
     */
    dom;

    /**
     * Contains the tree list.
     * 
     * @readonly
     * @type {HTMLDivElement}
     */
    #items;

    /**
     * Handles the event when an item is selected.
     * 
     * @param {JQuery.Event} event The event to handle.
     * @param {{ node: { data: { id: ?UUID, type: 'track' | 'box' } }}} data The data of the event.
     */
    #onItemSelect = (event, data) => {
        const { id, type } = data.node.data;
        if (type === 'track') {
            this.dispatchEvent({ type: 'click-track-item', id: id });
        } else {
            this.dispatchEvent({ type: 'click-box-item', id: id });
        }
    };

    /**
     * Creates a new view for a {@link BBoxLabelsTree}.
     * 
     * @param {BBoxLabelsTreeViewParams} params The parameters to pass to the view.
     */
    constructor(params) {
        super();

        this.dom = document.createElement('div');
        this.dom.className = 'bbox-tree';

        this.#items = document.createElement('div');
        this.dom.appendChild(this.#items);

        this.render(params.items ?? [], params.disabled ?? false);
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        $(this.#items).off('changed.jstree');
    }

    /**
     * Updates the view to display the given items.
     * 
     * @param {TreeItems} items The information of each element to display.
     * @param {boolean} disabled `true` if the view is disabled; otherwise, `false`.
     */
    render(items, disabled) {
        $(this.#items).off('changed.jstree');

        // @ts-expect-error
        $(this.#items).jstree({
            core: {
                data: [{
                    text: '(All Labels)',
                    children: items.map((trackItem) => ({
                        text: trackItem.text,
                        state: { selected: trackItem.selected, disabled: disabled },
                        data: { id: trackItem.id, type: 'track' },
                        children: trackItem.items.map((boxItem) => ({
                            text: boxItem.text,
                            state: { selected: boxItem.selected, disabled: disabled },
                            data: { id: boxItem.id, type: 'box' },
                        })),
                    })),
                }],
            },
            plugins: ['wholerow'],
        });

        $(this.#items).on('changed.jstree', this.#onItemSelect);
    }
}

/**
 * @typedef {object} BBoxViewTreeParams
 * @property {BBoxView} labelsView The collection of labels used to update
 * the selected bounding box.
 * @property {?UUID} [selectedTrackId=null] The unique identifier of the object track
 * that is selected, if any.
 * @property {?UUID} [selectedBoxId=null] The unique identifier of the bounding box
 * that is selected, if any.
 * @property {boolean} [disabled=false] `true` if the view is disabled; otherwise, `false`.
 */

/**
 * Defines each event that can be dispatched by {@link BBoxLabelsTree}.
 * 
 * @typedef {object} BBoxLabelsTreeEventMap
 * @property {{ box: ?ReadonlyLabelBox }} select-box The event when another bounding box
 * is selected.
 * @property {{ track: ?ReadonlyLabelTrack }} select-track The event when another object track
 * is selected.
 */

/**
 * Displays a tree view of bounding box labels, and allows the user to
 * add, delete, and select them.
 * 
 * @augments THREE.EventDispatcher<BBoxLabelsTreeEventMap>
 */
export class BBoxLabelsTree extends THREE.EventDispatcher {

    /**
     * @readonly
     * @type {BBoxLabelsTreeView}
     */
    #view;

    /**
     * The DOM element representing this view.
     * 
     * @type {HTMLDivElement}
     */
    get dom() { return this.#view.dom; }

    /**
     * Handles the event when an element for a bounding box has been selected.
     * 
     * @param {BBoxLabelsTreeViewEventMap['click-box-item']} event The event to handle.
     */
    #onClickBoxItem = (event) => {
        const id = event.id;

        if (this.selectedBoxId === id) {
            // Deselect
            this.selectedBoxId = null;
        } else {
            // Select
            this.selectedBoxId = id;
        }
    };

    /**
     * Handles the event when an element for an object track has been selected.
     * 
     * @param {BBoxLabelsTreeViewEventMap['click-track-item']} event The event to handle.
     */
    #onClickTrackItem = (event) => {
        const id = event.id;

        if (this.selectedTrackId === id) {
            // Deselect
            this.selectedTrackId = null;
        } else {
            // Select
            this.selectedTrackId = id;
        }
    };

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
        const selectedTrackId = this.selectedTrackId;
        if (selectedTrackId != null && !this.labelsView.hasLabelTrack(selectedTrackId)) {
            // The label no longer exists
            this.selectedTrackId = null;
        }

        const selectedBoxId = this.selectedBoxId;
        if (selectedBoxId != null && !this.labelsView.hasLabelBox(selectedBoxId)) {
            // The label no longer exists
            this.selectedBoxId = null;
        }

        // Need to show the new list of available labels
        this.#render();
    };

    /**
     * Selects the object track.
     * 
     * (This is to conveniently handle the case when `selectedTrack` is not in `labels`)
     * 
     * @type {LabelTrackSelectionPaneController}
     */
    #trackInput;

    /**
     * The current attributes in the object track selector.
     * 
     * @type {LabelTrackSelection}
     */
    #trackInputParams;

    /**
     * Selects the bounding box.
     * 
     * (This is to conveniently handle the case when `selectedBox` is not in `labels`)
     * 
     * @type {LabelBoxSelectionPaneController}
     */
    #boxInput;

    /**
     * The current attributes in the bounding box selector.
     * 
     * @type {LabelBoxSelection}
     */
    #boxInputParams;

    /**
     * @readonly
     * @type {InspectorRenderSignaller}
     */
    #signaller;

    /**
     * @type {?UUID}
     */
    #selectedTrackId;

    /**
     * The unique identifier of the object track that is selected, if any.
     * 
     * @type {?UUID}
     */
    get selectedTrackId() { return this.#selectedTrackId; }

    /**
     * The unique identifier of the object track that is selected, if any.
     * 
     * @type {?UUID}
     */
    set selectedTrackId(value) {
        if (this.#selectedTrackId !== value) {
            this.#selectedTrackId = value;

            // Need to show the attributes for the newly selected object track
            this.#render();

            this.dispatchEvent({ type: 'select-track', track: this.selectedTrack });
        }
    }

    /**
     * The object track that is selected, if any.
     * 
     * @type {?ReadonlyLabelTrack}
     */
    get selectedTrack() {
        const { selectedTrackId: selectedId, labelsView } = this;
        if (selectedId == null) return null;

        return labelsView.hasLabelTrack(selectedId) ? labelsView.getLabelTrack(selectedId)
            : null;     // May not exist if the data is currently being loaded
    }

    /**
     * @type {?UUID}
     */
    #selectedBoxId;

    /**
     * The unique identifier of the bounding box that is selected, if any.
     * 
     * @type {?UUID}
     */
    get selectedBoxId() { return this.#selectedBoxId; }

    /**
     * The unique identifier of the bounding box that is selected, if any.
     * 
     * @type {?UUID}
     */
    set selectedBoxId(value) {
        if (this.#selectedBoxId !== value) {
            this.#selectedBoxId = value;

            // Need to show the attributes for the newly selected bounding box
            this.#render();

            this.dispatchEvent({ type: 'select-box', box: this.selectedBox });
        }
    }

    /**
     * The bounding box that is selected, if any.
     * 
     * @type {?ReadonlyLabelBox}
     */
    get selectedBox() {
        const { selectedBoxId: selectedId, labelsView } = this;
        if (selectedId == null) return null;

        return labelsView.hasLabelBox(selectedId) ? labelsView.getLabelBox(selectedId)
            : null;     // May not exist if the data is currently being loaded
    }

    /**
     * @type {boolean}
     */
    #disabled;

    /**
     * `true` if this view is disabled; otherwise, `false`.
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
     * Handles the event when the value in the track input has been changed.
     * 
     * @param {PaneControllerChangeEvent<LabelTrackSelectionPaneControllerParams>} event
     * The event to handle.
     */
    #onTrackInputChange = (event) => {
        const { trackId: prevTrackId } = this.#trackInputParams;

        this.#trackInputParams = event.outputData;

        const { trackId } = this.#trackInputParams;

        // Select track
        if (trackId !== prevTrackId) {
            this.selectedTrackId = trackId;
        }
    };

    /**
     * Handles the event when the value in the class input has been changed.
     * 
     * @param {PaneControllerChangeEvent<LabelBoxSelectionPaneControllerParams>} event
     * The event to handle.
     */
    #onBoxInputChange = (event) => {
        const { boxId: prevBoxId } = this.#boxInputParams;

        this.#boxInputParams = event.outputData;

        const { boxId } = this.#boxInputParams;

        // Select box
        if (boxId !== prevBoxId) {
            this.selectedBoxId = boxId;
        }
    };

    /**
     * Updates the view according to the data in this object.
     */
    #render() {
        const { labelsView, selectedTrack, selectedBox, disabled } = this;
        const labels = labelsView.data;

        this.#trackInput.updateState({
            inputtedData: {
                trackId: selectedTrack?.id ?? null,
            },
            internalData: {
                tracks: new Map(Array.from(labelsView.iterLabelTracks(), (e) => [e.id, e])),
            },
            settings: {
                disabled: disabled || (labels == null),
            },
        });

        this.#boxInput.updateState({
            inputtedData: {
                boxId: selectedBox?.id ?? null,
            },
            internalData: {
                boxes: new Map(Array.from(labelsView.iterLabelBoxes(), (e) => [e.id, e])),
            },
            settings: {
                disabled: disabled || (labels == null),
            },
        });

        const treeItems = this.#createTreeItems(labels, selectedTrack, selectedBox);
        this.#view.render(treeItems, disabled || (labels == null));
    }

    /**
     * Gets the text to display for an object track.
     * 
     * @param {?ReadonlyLabelTrack} track The input object track.
     * @returns {string} The display text.
     */
    #getTrackText(track) {
        return (track == null) ? '(No track)'
            : LabelTrackSelectionPaneController.getItemText(track);
    }

    /**
     * Gets the text to display for a bounding box.
     * 
     * @param {?ReadonlyLabelBox} box The input bounding box.
     * @returns {string} The display text.
     */
    #getBoxText(box) {
        return (box == null) ? '(No box)'
            : LabelBoxSelectionPaneController.getItemText(box);
    }

    /**
     * Creates the information for each element to display in the tree view.
     * 
     * @param {?ReadonlyBBoxIndex} labels The collection of labels to select from.
     * @param {?ReadonlyLabelTrack} selectedTrack The object track that is selected.
     * @param {?ReadonlyLabelBox} selectedBox The bounding box that is selected.
     * @returns {TreeItems} The information of each element to display.
     */
    #createTreeItems(labels, selectedTrack, selectedBox) {
        if (labels == null) return [];

        const orphanBoxes = [...labels.iterLabelBoxes()].filter((box) => box.entityId == null);

        return [...labels.iterLabelTracks(), null].map((track) => ({
            id: track?.id ?? null,
            text: this.#getTrackText(track),
            selected: track === selectedTrack,
            items: ((track == null) ? orphanBoxes : [...track.elements]).map((box) => ({
                id: box.id,
                text: this.#getBoxText(box),
                selected: box === selectedBox,
            })),
        }));
    }

    #requireRender = () => this.#render();

    /**
     * Creates a new tree view for bounding box labels.
     * 
     * @param {BBoxViewTreeParams} params The parameters of the inspector.
     */
    constructor(params) {
        super();

        this.labelsView = params.labelsView ?? null;
        this.labelsView.addEventListener('beforeload', this.#onDataLoad);
        this.labelsView.addEventListener('afterload', this.#onDataLoad);

        this.#selectedTrackId = params.selectedTrackId ?? null;
        this.#selectedBoxId = params.selectedBoxId ?? null;
        this.#disabled = params.disabled ?? false;

        // Dummy element, not actually displayed
        const trackDom = document.createElement('div');
        {
            this.#trackInput = LabelTrackSelectionPaneController.create(trackDom, {
                inputtedData: { trackId: null },
            });
            this.#trackInput.addEventListener('change', this.#onTrackInputChange);
        }

        // Dummy element, not actually displayed
        const boxDom = document.createElement('div');
        {
            this.#boxInput = LabelBoxSelectionPaneController.create(boxDom, {
                inputtedData: { boxId: null },
            });
            this.#boxInput.addEventListener('change', this.#onBoxInputChange);
        }

        this.#signaller = new InspectorRenderSignaller(composeRenderTriggers(
            boxSelectionRenderTriggers,
            trackSelectionRenderTriggers,
        ));
        this.#signaller.addEventListener('render', this.#requireRender);

        this.#view = new BBoxLabelsTreeView({});
        this.#view.addEventListener('click-box-item', this.#onClickBoxItem);
        this.#view.addEventListener('click-track-item', this.#onClickTrackItem);

        this.#render();
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#view.removeEventListener('click-box-item', this.#onClickBoxItem);
        this.#view.removeEventListener('click-track-item', this.#onClickTrackItem);
        this.#view.dispose();

        this.labelsView.removeEventListener('beforeload', this.#onDataLoad);
        this.labelsView.removeEventListener('afterload', this.#onDataLoad);

        this.#trackInput.removeEventListener('change', this.#onTrackInputChange);
        this.#trackInput.dispose();

        this.#boxInput.removeEventListener('change', this.#onBoxInputChange);
        this.#boxInput.dispose();

        this.#signaller.removeEventListener('render', this.#requireRender);
        this.#signaller.dispose();
    }
}
