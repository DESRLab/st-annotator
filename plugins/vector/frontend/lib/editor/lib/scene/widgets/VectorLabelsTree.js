import $ from 'jquery';
import 'jstree';
import * as THREE from 'three';

import { LabelVectorSelectionPaneController, renderTriggers as vectorSelectionRenderTriggers } from './LabelVectorSelectionPane';
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
 * @typedef {import('../data').VectorView} VectorView
 */

/**
 * @typedef {import('../data').ReadonlyLabelVector} ReadonlyLabelVector
 */

/**
 * @typedef {import('../data').ReadonlyVectorIndex} ReadonlyVectorIndex
 */

/**
 * @typedef {import('../data').UUID} UUID
 */

/**
 * @typedef {import('./LabelVectorSelectionPane').LabelVectorSelection} LabelVectorSelection 
 */

/**
 * @typedef {import('./LabelVectorSelectionPane').LabelVectorSelectionPaneControllerParams} LabelVectorSelectionPaneControllerParams
 */
/* eslint-enable max-len */

/**
 * @typedef {{ id: UUID, text: string, selected: boolean }} VectorItem
 */

/**
 * @typedef {ReadonlyArray<VectorItem>} TreeItems
 */

/**
 * @typedef {object} VectorLabelsTreeViewParams
 * @property {TreeItems} [items=[]] The information of each element to display in the tree view.
 * @property {boolean} [disabled=false] `true` if the view is disabled; otherwise, `false`.
 */

/**
 * Defines each event that can be dispatched by {@link VectorLabelsTreeView}.
 * 
 * @typedef {object} VectorLabelsTreeViewEventMap
 * @property {{ id: ?UUID }} click-vector-item The event when the element for another vector object
 * is clicked.
 */

/**
 * View class for {@link VectorLabelsTree}.
 * 
 * @augments THREE.EventDispatcher<VectorLabelsTreeViewEventMap>
 */
class VectorLabelsTreeView extends THREE.EventDispatcher {

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
     * @param {{ node: { data: { id: ?UUID, type: 'vector' } }}} data The data of the event.
     */
    #onItemSelect = (event, data) => {
        const { id } = data.node.data;

        this.dispatchEvent({ type: 'click-vector-item', id: id });
    };

    /**
     * Creates a new view for a {@link VectorLabelsTree}.
     * 
     * @param {VectorLabelsTreeViewParams} params The parameters to pass to the view.
     */
    constructor(params) {
        super();

        this.dom = document.createElement('div');
        this.dom.className = 'vector-tree';

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
                    children: items.map((vectorItem) => ({
                        text: vectorItem.text,
                        state: { selected: vectorItem.selected, disabled: disabled },
                        data: { id: vectorItem.id, type: 'vector' },
                    })),

                }],
            },
            plugins: ['wholerow'],
        });

        $(this.#items).on('changed.jstree', this.#onItemSelect);
    }
}

/**
 * @typedef {object} VectorViewTreeParams
 * @property {VectorView} labelsView The collection of labels used to update
 * the selected vector object.
 * @property {?UUID} [selectedVectorId=null] The unique identifier of the vector object
 * that is selected, if any.
 * @property {boolean} [disabled=false] `true` if the view is disabled; otherwise, `false`.
 */

/**
 * Defines each event that can be dispatched by {@link VectorLabelsTree}.
 * 
 * @typedef {object} VectorLabelsTreeEventMap
 * @property {{ vector: ?ReadonlyLabelVector }} select-vector The event when another vector object
 * is selected.
 */

/**
 * Displays a tree view of vector labels, and allows the user to
 * add, delete, and select them.
 * 
 * @augments THREE.EventDispatcher<VectorLabelsTreeEventMap>
 */
export class VectorLabelsTree extends THREE.EventDispatcher {
    /**
     * @readonly
     * @type {VectorLabelsTreeView}
     */
    #view;

    /**
     * The DOM element representing this view.
     * 
     * @type {HTMLDivElement}
     */
    get dom() { return this.#view.dom; }

    /**
     * Handles the event when an element for a vector object has been selected.
     * 
     * @param {VectorLabelsTreeViewEventMap['click-vector-item']} event The event to handle.
     */
    #onClickVectorItem = (event) => {
        const id = event.id;

        if (this.selectedVectorId === id) {
            // Deselect
            this.selectedVectorId = null;
        } else {
            // Select
            this.selectedVectorId = id;
        }
    };

    /**
     * A view of the collection of labels used to update the selected object track.
     * 
     * @readonly
     * @type {VectorView}
     */
    labelsView;

    /**
     * Handles the event when the collection of labels is (un)loaded.
     */
    #onDataLoad = () => {
        const selectedVectorId = this.selectedVectorId;
        if (selectedVectorId != null && !this.labelsView.hasLabelVector(selectedVectorId)) {
            // The label no longer exists
            this.selectedVectorId = null;
        }

        // Need to show the new list of available labels
        this.#render();
    };

    /**
     * Selects the vector object.
     * 
     * (This is to conveniently handle the case when `selectedVector` is not in `labels`)
     * 
     * @type {LabelVectorSelectionPaneController}
     */
    #vectorInput;

    /**
     * The current attributes in the vector object selector.
     * 
     * @type {LabelVectorSelection}
     */
    #vectorInputParams;

    /**
     * @readonly
     * @type {InspectorRenderSignaller}
     */
    #signaller;

    /**
     * @type {?UUID}
     */
    #selectedVectorId;

    /**
     * The unique identifier of the vector object that is selected, if any.
     * 
     * @type {?UUID}
     */
    get selectedVectorId() { return this.#selectedVectorId; }

    /**
     * The unique identifier of the vector object that is selected, if any.
     * 
     * @type {?UUID}
     */
    set selectedVectorId(value) {
        if (this.#selectedVectorId !== value) {
            this.#selectedVectorId = value;

            // Need to show the attributes for the newly selected vector object
            this.#render();

            this.dispatchEvent({ type: 'select-vector', vector: this.selectedVector });
        }
    }

    /**
     * The vector object that is selected, if any.
     * 
     * @type {?ReadonlyLabelVector}
     */
    get selectedVector() {
        const { selectedVectorId: selectedId, labelsView } = this;
        if (selectedId == null) return null;

        return labelsView.hasLabelVector(selectedId) ? labelsView.getLabelVector(selectedId)
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
     * Handles the event when the value in the class input has been changed.
     * 
     * @param {PaneControllerChangeEvent<LabelVectorSelectionPaneControllerParams>} event
     * The event to handle.
     */
    #onVectorInputChange = (event) => {
        const { vectorId: prevVectorId } = this.#vectorInputParams;

        this.#vectorInputParams = event.outputData;

        const { vectorId } = this.#vectorInputParams;

        // Select box
        if (vectorId !== prevVectorId) {
            this.selectedVectorId = vectorId;
        }
    };

    /**
     * Updates the view according to the data in this object.
     */
    #render() {
        const { labelsView, selectedVector, disabled } = this;
        const labels = labelsView.data;

        this.#vectorInput.updateState({
            inputtedData: {
                vectorId: selectedVector?.id ?? null,
            },
            internalData: {
                vectors: new Map(Array.from(labelsView.iterLabelVectors(), (e) => [e.id, e])),
            },
            settings: {
                disabled: disabled || (labels == null),
            },
        });

        const treeItems = this.#createTreeItems(labels, selectedVector);
        this.#view.render(treeItems, disabled || (labels == null));
    }

    /**
     * Gets the text to display for a vector object.
     * 
     * @param {?ReadonlyLabelVector} vector The input vector object.
     * @returns {string} The display text.
     */
    #getVectorText(vector) {
        return (vector == null) ? '(No Vector)'
            : LabelVectorSelectionPaneController.getItemText(vector);
    }

    /**
     * 
     * @param {?ReadonlyVectorIndex} labels The collection of labels to select from.
     * @param {?ReadonlyLabelVector} selectedVector The vector object that is selected.
     * @returns {TreeItems} The information of each element to display.
     */
    #createTreeItems(labels, selectedVector) {
        if (labels == null) return [];

        return [...labels.iterLabelVectors()].map((vector) => ({
            id: vector.id,
            text: this.#getVectorText(vector),
            selected: vector === selectedVector,
        }));
    }

    #requireRender = () => this.#render();

    /**
     * Creates a new tree view for vector labels.
     * 
     * @param {VectorViewTreeParams} params The parameters of the inspector.
     */
    constructor(params) {
        super();

        this.labelsView = params.labelsView ?? null;
        this.labelsView.addEventListener('beforeload', this.#onDataLoad);
        this.labelsView.addEventListener('afterload', this.#onDataLoad);

        this.#selectedVectorId = params.selectedVectorId ?? null;

        const vectorDom = document.createElement('div');

        {
            this.#vectorInput = LabelVectorSelectionPaneController.create(vectorDom, {
                inputtedData: { vectorId: null },
            });
            this.#vectorInput.addEventListener('change', this.#onVectorInputChange);
        }

        this.#signaller = new InspectorRenderSignaller(composeRenderTriggers(
            vectorSelectionRenderTriggers,
        ));
        this.#signaller.addEventListener('render', this.#requireRender);

        this.#view = new VectorLabelsTreeView({});
        this.#view.addEventListener('click-vector-item', this.#onClickVectorItem);

        this.#render();
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#view.removeEventListener('click-vector-item', this.#onClickVectorItem);
        this.#view.dispose();

        this.labelsView.removeEventListener('beforeload', this.#onDataLoad);
        this.labelsView.removeEventListener('afterload', this.#onDataLoad);

        this.#vectorInput.removeEventListener('change', this.#onVectorInputChange);
        this.#vectorInput.dispose();

        this.#signaller.removeEventListener('render', this.#requireRender);
        this.#signaller.dispose();
    }
}
