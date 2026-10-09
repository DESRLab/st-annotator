import { Pane } from 'tweakpane';

import { PaneController, PaneElementFactoryBuilder } from '../../widgets';

/**
 * @typedef {import('three')} THREE
 */

/**
 * @template T
 * @typedef {import('../../../../../../common/lib/utils').TypeUtils.Immutable<T>} Immutable
 */

/**
 * @typedef {import('../../scene').SceneLayer<any>} SceneLayer
 */

/**
 * @template P
 * @template {{}} E
 * @typedef {import('../../widgets').PaneElementFactory<P, E>} PaneElementFactory
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
 * @typedef {object} LayersInputtedData
 * @property {ReadonlyArray<boolean>} layersEnabled The `i`th element indicates whether
 * `layers[i]` is enabled.
 */

/**
 * @typedef {object} LayersComputedData
 * @property {?SceneLayer} activeLayer The currently active layer, or `null` if none
 * is active.
 */

/**
 * @typedef {object} LayersPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 */

/**
 * @typedef {object} LayersSource
 * @property {?SceneLayer} activeLayer The currently active layer, or `null` if none
 * is active.
 */

/**
 * @typedef {object} LayersState
 * @property {Map<SceneLayer, boolean>} isLayerEnabled For each layer, `true` if it is enabled;
 * otherwise, `false`.
 */

/**
 * @typedef {{
 *     inputtedData: LayersInputtedData;
 *     computedData: LayersComputedData;
 *     settings: LayersPaneSettings;
 *     internalData: ?LayersSource;
 *     outputData: LayersState;
 * }} LayersPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<LayersPaneControllerParams>
 * } LayersPaneElementParams
 */

/**
 * @typedef {PaneControllerState<LayersPaneControllerParams>
 * } LayersPaneControllerState
 */

/**
 * Defines each event that can be dispatched by {@link LayersPaneController}.
 * 
 * @typedef {object} LayersPaneControllerEventMap
 * @property {{}} click-toggleAll The event when the toggle all button is clicked.
 * @property {{ layer: SceneLayer }} click-row The event when a row in the table has been clicked.
 */

/**
 * Represents a UI to select the active {@link SceneLayer}.
 * 
 * @augments {PaneController<LayersPaneControllerParams, LayersPaneControllerEventMap>}
 */
export class LayersPaneController extends PaneController {

    /**
     * Gets the arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @param {ReadonlyArray<SceneLayer>} layers The layers to include in the tab.
     * @returns {Immutable<LayersPaneElementParams>} The resulting dummy parameters.
     */
    static getFactoryParams(layers) {
        return {
            inputtedData: {
                layersEnabled: layers.map(() => false),
            },
            computedData: {
                activeLayer: null,
            },
            settings: {
                disabled: false,
                hidden: false,
            },
        };
    }

    /**
     * Obtains the settings for the save button.
     * 
     * @param {ReadonlyArray<SceneLayer>} layers The layers to include in the tab.
     * @param {Immutable<LayersPaneElementParams>} paneParams
     * The parameters of the pane.
     * @returns {{ title: string, disabled: boolean, hidden: boolean }} The requested settings.
     */
    static getToggleAllButtonSettings(layers, { settings: { disabled, hidden } }) {
        const isAllEnabled = layers.every((layer) => layer.state.enabled);

        return {
            title: isAllEnabled ? 'Disable All' : 'Enable All',
            disabled: disabled,
            hidden: hidden,
        };
    }

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link LayersPaneElementParams}.
     * 
     * @param {ReadonlyArray<SceneLayer>} layers The layers to include in the tab.
     * @returns {PaneElementFactory<LayersPaneElementParams, LayersPaneControllerEventMap>}
     * The resulting pane element factory.
     */
    static elementFactory(layers) {
        /**
         * @type {PaneElementFactoryBuilder<LayersPaneElementParams, LayersPaneControllerEventMap>}
         */
        const builder = new PaneElementFactoryBuilder(
            this.getFactoryParams(layers),
            ['click-toggleAll', 'click-row'],
        );

        /**
         * @type {Map<SceneLayer, () => void>}
         */
        const clickRowEventListeners = new Map();

        return builder.sequential([
            builder.tableHead({
                options: ({ settings: { disabled, hidden } }) => ({
                    label: 'Layer',
                    headers: [
                        { label: 'Enabled', width: '64px' },
                        { label: 'Actions', width: 'auto' },
                    ],
                    disabled: disabled,
                    hidden: hidden,
                }),
                modifyHTML: (element) => {
                    element.classList.add('layer-menu-table-header');

                    for (const label of element.querySelectorAll('.tp-lblv .tp-lblv_l')) {
                        if (label instanceof HTMLDivElement) {
                            label.style.textDecorationLine = 'underline';
                        }
                    }

                    const cellsContainer = element.querySelector('.tp-lblv_v');
                    if (cellsContainer instanceof HTMLDivElement) {
                        const cellsWrapper = cellsContainer.querySelector('.tp-brkv.tp-rotv_c');
                        if (cellsWrapper instanceof HTMLDivElement) {
                            cellsWrapper.style.alignItems = 'center';

                            const lastCell = cellsWrapper.querySelector('.tp-v-lst.tp-v-vlst');
                            if (lastCell instanceof HTMLDivElement) {
                                lastCell.style.marginTop = '0px';
                                lastCell.style.flexGrow = '1';
                            } else {
                                console.warn('Cannot find last cell');
                            }
                        } else {
                            console.warn('Cannot find cells wrapper');
                        }
                    } else {
                        console.warn('Cannot find cells container');
                    }
                },
            }),
            ...layers.map((layer, i) => builder.tableRow([
                {
                    factory: builder.input(['inputtedData', 'layersEnabled', i.toString()], {
                        options: ({ settings: { disabled, hidden } }) => ({ disabled, hidden }),
                    }),
                    options: ({ settings: { disabled, hidden } }) => ({
                        width: '64px',
                        disabled: disabled,
                        hidden: hidden,
                    }),
                },
                {
                    factory: builder.htmlContainer({
                        options: () => ({ innerElem: layer.actionsElem }),
                        modifyHTML: (element) => {
                            element.style.marginTop = '0px';
                        },
                    }),
                    options: ({ settings: { disabled, hidden } }) => ({ disabled, hidden }),
                },
            ], {
                options: ({ settings: { disabled, hidden } }) => ({
                    label: layer.name,
                    disabled: disabled,
                    hidden: hidden,
                }),
                modifyHTML: (element, { computedData: { activeLayer } }, paneElem) => {
                    element.classList.add('layer-menu-table-row');

                    const labelContainer = element.querySelector('.tp-lblv_l');
                    if (labelContainer instanceof HTMLDivElement) {
                        labelContainer.classList.add('layer-name');

                        if (layer === activeLayer) {
                            labelContainer.classList.add('active');
                        } else {
                            labelContainer.classList.remove('active');
                        }

                        const eventListener = clickRowEventListeners.get(layer)
                            ?? (() => paneElem.dispatchEvent({ type: 'click-row', layer: layer }));
                        clickRowEventListeners.set(layer, eventListener);

                        if (layer.state.enabled) {
                            labelContainer.style.cursor = 'pointer';

                            labelContainer.removeEventListener('click', eventListener);
                            labelContainer.addEventListener('click', eventListener);
                        } else {
                            labelContainer.style.cursor = 'not-allowed';

                            labelContainer.removeEventListener('click', eventListener);
                        }
                    } else {
                        console.warn('Cannot find label container');
                    }

                    const cellsContainer = element.querySelector('.tp-lblv_v');
                    if (cellsContainer instanceof HTMLDivElement) {
                        const cellsWrapper = cellsContainer.querySelector('.tp-brkv.tp-rotv_c');
                        if (cellsWrapper instanceof HTMLDivElement) {
                            cellsWrapper.style.alignItems = 'center';

                            const lastCell = cellsWrapper.querySelector('.tp-v-lst.tp-v-vlst');
                            if (lastCell instanceof HTMLDivElement) {
                                lastCell.style.marginTop = '0px';
                                lastCell.style.flexGrow = '1';
                            } else {
                                console.warn('Cannot find last cell');
                            }
                        } else {
                            console.warn('Cannot find cells wrapper');
                        }
                    } else {
                        console.warn('Cannot find cells container');
                    }
                },
            })),
            builder.separator({
                options: ({ settings: { disabled, hidden } }) => ({ disabled, hidden }),
            }),
            builder.button({
                options: (paneParams) => this.getToggleAllButtonSettings(layers, paneParams),
                eventHandlers: {
                    click: (paneElem) => paneElem.dispatchEvent({ type: 'click-toggleAll' }),
                },
            }),
        ]);
    }

    /**
     * Gets the processor to pass into {@link PaneController}.
     * 
     * @param {ReadonlyArray<SceneLayer>} layers The layers to include in the tab.
     * @returns {PaneControllerDataProcessor<LayersPaneControllerParams>} The resulting
     * processor.
     */
    static getDataProcessor(layers) {
        return {
            computeData: (inputtedData, internalData) => ({
                activeLayer: internalData?.activeLayer ?? null,
            }),
            outputData: ({ inputtedData: { layersEnabled } }) => ({
                isLayerEnabled: new Map(layers.map((layer, i) => [layer, layersEnabled[i]])),
            }),
        };
    }

    /**
     * Creates a new UI to select the active {@link SceneLayer}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {ReadonlyArray<SceneLayer>} layers The layers to include in the tab.
     * @param {Partial<LayersPaneControllerState>} initialState
     * The initial state to set.
     * @returns {LayersPaneController} The resulting controller.
     */
    static create(dom, layers, initialState = {}) {
        const factoryParams = this.getFactoryParams(layers);

        return new LayersPaneController(
            () => new Pane({ container: dom }),
            this.elementFactory(layers),
            this.getDataProcessor(layers),
            {
                inputtedData: initialState.inputtedData ?? factoryParams.inputtedData,
                internalData: initialState.internalData ?? null,
                settings: initialState.settings ?? factoryParams.settings,
            },
        );
    }
}
