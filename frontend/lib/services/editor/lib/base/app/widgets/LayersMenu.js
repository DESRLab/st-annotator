import * as THREE from 'three';

import { TabberPaneController } from '../../widgets';

import { LayersPaneController } from './LayersPane';
import { BaseMenu } from './Menu';

/**
 * @template T
 * @typedef {import('../../../../../../common/lib/utils').TypeUtils.TypeGuard<T>} TypeGuard
 */

/**
 * @typedef {import('../../scene').LayerCollection<any>} LayerCollection
 */

/**
 * @typedef {import('../../scene').SceneLayer<any>} SceneLayer
 */

/**
 * @typedef {import('../../widgets').PaneControllerDataTypes} PaneControllerDataTypes
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('../../widgets').PaneControllerChangeEvent<P>} PaneControllerChangeEvent
 */

/**
 * @typedef {import('./LayersPane').LayersPaneControllerEventMap} LayersPaneControllerEventMap
 */

/**
 * @typedef {import('./LayersPane').LayersPaneControllerParams} LayersPaneControllerParams
 */

/**
 * Defines each event that can be dispatched by {@link LayersMenuView}.
 * 
 * @typedef {object} LayersMenuViewEventMap
 * @property {{ layer: ?SceneLayer }} source-select
 * The event when a row for a source data layer has been selected.
 * @property {{ layer: ?SceneLayer, enabled: boolean }} source-setEnabled
 * The event when a checkbox in the enabled column in a row for a source data layer
 * has been toggled.
 * @property {{ layer: ?SceneLayer }} label-select
 * The event when a row for a label data layer has been selected.
 * @property {{ layer: ?SceneLayer, enabled: boolean }} label-setEnabled
 * The event when a checkbox in the enabled column in a row for a label data layer
 * has been toggled.
 */

/**
 * View class for {@link LayersMenu}.
 * 
 * @augments THREE.EventDispatcher<LayersMenuViewEventMap>
 */
export class LayersMenuView extends THREE.EventDispatcher {

    /**
     * Contains each layer in the application.
     * 
     * @readonly
     * @type {LayerCollection}
     */
    layers;

    /**
     * The DOM element representing the input.
     * 
     * @readonly
     * @type {HTMLDivElement}
     */
    dom;

    /**
     * @readonly
     * @type {TabberPaneController}
     */
    #tabber;

    /**
     * @readonly
     * @type {LayersPaneController}
     */
    #sourceLayersTab;

    /**
     * @readonly
     * @type {LayersPaneController}
     */
    #labelLayersTab;

    /**
     * Handles the event when a checkbox in the enabled column of the header row for
     * source data layers has been changed.
     * 
     * @param {LayersPaneControllerEventMap['click-toggleAll']} event
     * A description of the event to handle.
     */
    #onSourceToggleAll = (event) => {
        const isAllEnabled = this.layers.sourceDataLayers.every((layer) => layer.state.enabled);

        this.dispatchEvent({
            type: 'source-setEnabled',
            layer: null,
            enabled: !isAllEnabled,
        });
    };

    /**
     * Handles the event when a checkbox in the enabled column in a row for a source data layer
     * has been changed.
     * 
     * @param {PaneControllerChangeEvent<LayersPaneControllerParams>} event
     * A description of the event to handle.
     */
    #onSourceRowChange = (event) => {
        const { prevOutputData: { isLayerEnabled: prevIsLayerEnabled } } = event;
        const { outputData: { isLayerEnabled } } = event;

        const toggledLayer = [...prevIsLayerEnabled.keys()]
            .find((k) => prevIsLayerEnabled.get(k) !== isLayerEnabled.get(k));
        if (toggledLayer == null) {
            throw new Error('Cannot find toggled layer');
        }

        this.dispatchEvent({
            type: 'source-setEnabled',
            layer: toggledLayer,
            enabled: isLayerEnabled.get(toggledLayer) ?? false,
        });
    };

    /**
     * Handles the event when a row for a source data layer has been clicked.
     * 
     * @param {LayersPaneControllerEventMap['click-row']} event
     * A description of the event to handle.
     */
    #onSourceRowClick = (event) => {
        this.dispatchEvent({ type: 'source-select', layer: event.layer });
    };

    /**
     * Handles the event when a checkbox in the enabled column of the header row for
     * label data layers has been changed.
     * 
     * @param {LayersPaneControllerEventMap['click-toggleAll']} event
     * A description of the event to handle.
     */
    #onLabelToggleAll = (event) => {
        const isAllEnabled = this.layers.labelDataLayers.every((layer) => layer.state.enabled);

        this.dispatchEvent({
            type: 'label-setEnabled',
            layer: null,
            enabled: !isAllEnabled,
        });
    };

    /**
     * Handles the event when a checkbox in the enabled column in a row for a label data layer
     * has been changed.
     * 
     * @param {PaneControllerChangeEvent<LayersPaneControllerParams>} event
     * A description of the event to handle.
     */
    #onLabelRowChange = (event) => {
        const { prevOutputData: { isLayerEnabled: prevIsLayerEnabled } } = event;
        const { outputData: { isLayerEnabled } } = event;

        const toggledLayer = [...prevIsLayerEnabled.keys()]
            .find((k) => prevIsLayerEnabled.get(k) !== isLayerEnabled.get(k));
        if (toggledLayer == null) {
            throw new Error('Cannot find toggled layer');
        }

        this.dispatchEvent({
            type: 'label-setEnabled',
            layer: toggledLayer,
            enabled: isLayerEnabled.get(toggledLayer) ?? false,
        });
    };

    /**
     * Handles the event when a row for a source data layer has been clicked.
     * 
     * @param {LayersPaneControllerEventMap['click-row']} event
     * A description of the event to handle.
     */
    #onLabelRowClick = (event) => {
        this.dispatchEvent({ type: 'label-select', layer: event.layer });
    };

    /**
     * Updates the view according to the data in this object.
     */
    #render() {
        const { sourceDataLayers, labelDataLayers, activeLayer } = this.layers;

        this.#sourceLayersTab.updateState({
            inputtedData: {
                layersEnabled: sourceDataLayers.map((layer) => layer.state.enabled),
            },
            internalData: { activeLayer },
        });

        this.#labelLayersTab.updateState({
            inputtedData: {
                layersEnabled: labelDataLayers.map((layer) => layer.state.enabled),
            },
            internalData: { activeLayer },
        });
    }

    #onLayersUpdate = () => {
        this.#render();
    };

    /**
     * Creates a view for a {@link LayersMenu}.
     * 
     * @param {LayerCollection} layers Contains each layer in the application.
     */
    constructor(layers) {
        super();

        this.layers = layers;

        this.dom = document.createElement('div');
        this.dom.className = 'layer-menu';

        const sourceLayersTabDom = document.createElement('div');
        const labelsLayersTabDom = document.createElement('div');

        this.#tabber = TabberPaneController.create(
            this.dom,
            {
                'Source Data': sourceLayersTabDom,
                'Label Data': labelsLayersTabDom,
            },
        );

        // Open the Label Data tab by default
        const tabs = labelsLayersTabDom
            .parentElement?.parentElement?.parentElement?.parentElement?.parentElement
            ?.querySelector('.tp-tabv_t');

        if (tabs) {
            const labelDataTab = [...tabs.children].find((elem) => elem.textContent === 'Label Data');
            labelDataTab?.querySelector('button')?.click();
        }

        this.#sourceLayersTab = LayersPaneController.create(
            sourceLayersTabDom,
            this.layers.sourceDataLayers,
        );

        this.#labelLayersTab = LayersPaneController.create(
            labelsLayersTabDom,
            this.layers.labelDataLayers,
        );

        this.layers.addEventListener('layer-activate', this.#onLayersUpdate);
        for (const layer of this.layers.allLayers) {
            layer.state.addEventListener('change', this.#onLayersUpdate);
        }

        this.#sourceLayersTab.paneEvents.addEventListener('click-toggleAll', this.#onSourceToggleAll);
        this.#sourceLayersTab.paneEvents.addEventListener('click-row', this.#onSourceRowClick);
        this.#sourceLayersTab.addEventListener('change', this.#onSourceRowChange);

        this.#labelLayersTab.paneEvents.addEventListener('click-toggleAll', this.#onLabelToggleAll);
        this.#labelLayersTab.paneEvents.addEventListener('click-row', this.#onLabelRowClick);
        this.#labelLayersTab.addEventListener('change', this.#onLabelRowChange);

        this.#render();
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        for (const layer of this.layers.allLayers) {
            layer.state.removeEventListener('change', this.#onLayersUpdate);
        }
        this.layers.removeEventListener('layer-activate', this.#onLayersUpdate);

        this.#sourceLayersTab.paneEvents.removeEventListener('click-toggleAll', this.#onSourceToggleAll);
        this.#sourceLayersTab.paneEvents.removeEventListener('click-row', this.#onSourceRowClick);
        this.#sourceLayersTab.removeEventListener('change', this.#onSourceRowChange);
        this.#sourceLayersTab.dispose();

        this.#labelLayersTab.paneEvents.removeEventListener('click-toggleAll', this.#onLabelToggleAll);
        this.#labelLayersTab.paneEvents.removeEventListener('click-row', this.#onLabelRowClick);
        this.#labelLayersTab.removeEventListener('change', this.#onLabelRowChange);
        this.#labelLayersTab.dispose();

        this.#tabber.dispose();
    }
}

/**
 * Displays the available layers and allows the user to set the active layer.
 */
export class LayersMenu extends BaseMenu {

    /**
     * @readonly
     * @type {LayersMenuView}
     */
    #view;

    /**
     * Contains each layer in the application.
     * 
     * @readonly
     * @type {LayerCollection}
     */
    get layers() { return this.#view.layers; }

    /**
     * Handles the event when a row for a source data layer is selected.
     * 
     * @param {LayersMenuViewEventMap['source-select']} event The event to handle.
     */
    #onSourceSelect = (event) => {
        this.layers.activeLayer = event.layer;
    };

    /**
     * Handles the event when the enabled checkbox in a row for a source data layer is toggled.
     * 
     * @param {LayersMenuViewEventMap['source-setEnabled']} event The event to handle.
     */
    #onSourceSetEnabled = (event) => {
        const layer = event.layer;

        if (layer == null) {
            for (const l of this.layers.sourceDataLayers) {
                l.state.enabled = event.enabled;
            }
        } else {
            layer.state.enabled = event.enabled;
        }
    };

    /**
     * Handles the event when a row for a label data layer is selected.
     * 
     * @param {LayersMenuViewEventMap['label-select']} event The event to handle.
     */
    #onLabelSelect = (event) => {
        const layer = event.layer;

        this.layers.activeLayer = layer;
    };

    /**
     * Handles the event when the enabled checkbox in a row for a label data layer is toggled.
     * 
     * @param {LayersMenuViewEventMap['label-setEnabled']} event The event to handle.
     */
    #onLabelSetEnabled = (event) => {
        const layer = event.layer;

        if (layer == null) {
            for (const l of this.layers.labelDataLayers) {
                l.state.enabled = event.enabled;
            }
        } else {
            layer.state.enabled = event.enabled;
        }
    };

    /**
     * Creates a new menu for the objects in the active layer.
     * 
     * @param {LayerCollection} layers Contains each layer in the application.
     */
    constructor(layers) {
        super();

        this.#view = new LayersMenuView(layers);
        this.dom.appendChild(this.#view.dom);
        this.#view.addEventListener('source-select', this.#onSourceSelect);
        this.#view.addEventListener('source-setEnabled', this.#onSourceSetEnabled);
        this.#view.addEventListener('label-select', this.#onLabelSelect);
        this.#view.addEventListener('label-setEnabled', this.#onLabelSetEnabled);
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#view.removeEventListener('source-select', this.#onSourceSelect);
        this.#view.removeEventListener('source-setEnabled', this.#onSourceSetEnabled);
        this.#view.removeEventListener('label-select', this.#onLabelSelect);
        this.#view.removeEventListener('label-setEnabled', this.#onLabelSetEnabled);
        this.#view.dispose();

        super.dispose();
    }
}
