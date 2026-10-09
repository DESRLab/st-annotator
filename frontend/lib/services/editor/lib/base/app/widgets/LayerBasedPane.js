import { Pane } from 'tweakpane';

import { PaneController, PaneElementFactoryBuilder } from '../../widgets';

/**
 * @template T
 * @typedef {import('../../../../../../common/lib/utils').TypeUtils.Immutable<T>} Immutable
 */

/**
 * @typedef {import('../../scene').LayerCollection<any>} LayerCollection
 */

/**
 * @typedef {import('../../scene').SceneLayer<any>} SceneLayer
 */

/**
 * @template P
 * @typedef {import('../../widgets').PaneElementFactory<P>} PaneElementFactory
 */

/**
 * @typedef {import('../../widgets').PaneControllerDataTypes} PaneControllerDataTypes
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('../../widgets').PaneElementParams<P>} PaneElementParams
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('../../widgets').PaneControllerDataProcessor<P>} PaneControllerDataProcessor
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('../../widgets').PaneControllerState<P>} PaneControllerState
 */

/**
 * @typedef {object} LayerSelectionInputtedData
 * @property {?SceneLayer} selectedLayer The currently selected layer, or `null` if none
 * is selected.
 */

/**
 * @typedef {object} LayerSelectionComputedData
 * @property {ReadonlyArray<SceneLayer>} layers The collection of layers to select from.
 */

/**
 * @typedef {object} LayerBasedPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 */

/**
 * @typedef {object} LayerSelectionSource
 * @property {LayerCollection} layers The collection of layers to select from.
 */

/**
 * @typedef {object} LayerSelection
 * @property {?SceneLayer} selectedLayer The currently selected layer, or `null` if none
 * is selected.
 */

/**
 * @typedef {{
 *     inputtedData: LayerSelectionInputtedData;
 *     computedData: LayerSelectionComputedData;
 *     settings: LayerBasedPaneSettings;
 *     internalData: ?LayerSelectionSource;
 *     outputData: LayerSelection;
 * }} LayerBasedPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<LayerBasedPaneControllerParams>
 * } LayerBasedPaneElementParams
 */

/**
 * @typedef {PaneControllerState<LayerBasedPaneControllerParams>
 * } LayerBasedPaneControllerState
 */

/**
 * Represents a UI to select a {@link SceneLayer}; only the information of
 * the selected layer is displayed.
 * 
 * @augments PaneController<LayerBasedPaneControllerParams>
 */
export class LayerBasedPaneController extends PaneController {

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<LayerBasedPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            selectedLayer: null,
        },
        computedData: {
            layers: [],
        },
        settings: {
            disabled: false,
            hidden: false,
        },
    };

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link LayerBasedPaneElementParams}.
     * 
     * @param {(layer: SceneLayer) => HTMLElement} getLayerDom A function that
     * returns a DOM element containing the information of a layer.
     * @returns {PaneElementFactory<LayerBasedPaneElementParams>}
     * The resulting pane element factory.
     */
    static elementFactory(getLayerDom) {
        const nullText = '(No layer selected)';

        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        return builder.sequential([
            builder.list(['inputtedData', 'selectedLayer'], {
                options: ({ computedData: { layers }, settings: { disabled, hidden } }) => {
                    const nullOption = { text: nullText, value: null };
                    const otherOptions = layers.map((layer) => ({
                        text: layer.name,
                        value: layer,
                    }));

                    return {
                        label: 'Configure Layer:',
                        options: [nullOption, ...otherOptions],
                        disabled: disabled,
                        hidden: hidden,
                    };
                },
            }),
            builder.separator({
                options: ({ settings: { disabled, hidden } }) => ({ disabled, hidden }),
            }),
            builder.separator({
                options: ({ settings: { disabled, hidden } }) => ({ disabled, hidden }),
                modifyHTML: (element) => {
                    element.style.paddingTop = '2px';
                },
            }),
            builder.htmlContainer({
                options: ({ inputtedData: { selectedLayer } }) => ({
                    innerElem: (selectedLayer == null) ? document.createElement('div')
                        : getLayerDom(selectedLayer),
                }),
            }),
        ]);
    }

    /**
     * Data processor to pass into {@link PaneController}.
     * 
     * @type {PaneControllerDataProcessor<LayerBasedPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => ({
            layers: internalData?.layers.allLayers ?? [],
        }),
        outputData: (paneParams) => ({
            selectedLayer: paneParams.inputtedData.selectedLayer,
        }),
    };

    /**
     * Creates a new UI to select and view the information of a {@link SceneLayer}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {(layer: SceneLayer) => HTMLElement} getLayerDom A function that
     * returns a DOM element containing the information of a layer.
     * @param {Partial<LayerBasedPaneControllerState>} initialState
     * The initial state to set.
     * @returns {LayerBasedPaneController} The resulting controller.
     */
    static create(dom, getLayerDom, initialState = {}) {
        return new LayerBasedPaneController(
            () => new Pane({ container: dom }),
            this.elementFactory(getLayerDom),
            this.DATA_PROCESSOR,
            {
                inputtedData: initialState.inputtedData ?? this.FACTORY_PARAMS.inputtedData,
                internalData: initialState.internalData ?? null,
                settings: initialState.settings ?? this.FACTORY_PARAMS.settings,
            },
        );
    }
}
