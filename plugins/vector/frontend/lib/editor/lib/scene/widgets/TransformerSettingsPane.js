import { Pane } from 'tweakpane';

import { PaneController, PaneElementFactoryBuilder } from 'sta/services/editor/base';

/* eslint-disable max-len */
/**
 * @template T
 * @typedef {import('sta/common/utils').TypeUtils.Immutable<T>} Immutable
 */

/**
 * @template P
 * @typedef {import('sta/services/editor/base').PaneElementFactory<P>} PaneElementFactory
 */

/**
 * @typedef {import('sta/services/editor/base').PaneControllerDataTypes} PaneControllerDataTypes
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('sta/services/editor/base').PaneElementParams<P>} PaneElementParams
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('sta/services/editor/base').PaneControllerDataProcessor<P>} PaneControllerDataProcessor
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('sta/services/editor/base').PaneControllerState<P>} PaneControllerState
 */

/**
 * @typedef {import('../controls').VectorTransformer} VectorTransformer
 */
/**
 * @typedef {import('../controls').Transformation} Transformation
 */
/* eslint-enable max-len */

/**
 * @typedef {object} TransformerSettingsInputtedData
 * @property {Record<Transformation, boolean>} isTransformSelected For each given transformation:
 * `true` it is toggled in the button grid; otherwise, `false`.
 */

/**
 * @typedef {object} TransformerSettingsPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 */

/**
 * @typedef {object} TransformerSettings
 * @property {Record<Transformation, boolean>} isTransformSelected For each given transformation:
 * `true` it is toggled in the button grid; otherwise, `false`.
 */

/**
 * @typedef {{
 *     inputtedData: TransformerSettingsInputtedData;
 *     computedData: {};
 *     settings: TransformerSettingsPaneSettings;
 *     internalData: {};
 *     outputData: TransformerSettings;
 * }} TransformerSettingsPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<
 * TransformerSettingsPaneControllerParams>} TransformerSettingsPaneElementParams
 */

/**
 * @typedef {PaneControllerState<TransformerSettingsPaneControllerParams>
 * } TransformerSettingsPaneControllerState
 */

/**
 * Represents a UI to configure the settings for a {@link VectorTransformer}.
 * 
 * @augments PaneController<TransformerSettingsPaneControllerParams>
 */
export class TransformerSettingsPaneController extends PaneController {

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<TransformerSettingsPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            isTransformSelected: {
                vertex: true,
                vertices: true,
            },
        },
        computedData: {},
        settings: {
            disabled: false,
            hidden: false,
        },
    };

    /**
     * @readonly
     * @type {ReadonlyArray<Transformation>}
     */
    static gridTransformations = ['vertex', 'vertices'];

    /**
     * @readonly
     * @type {ReadonlyArray<string>}
     */
    static gridLabels = ['Vertex', 'Vertices'];

    /**
     * Obtains the settings for the action selector.
     * 
     * @param {Immutable<TransformerSettingsPaneElementParams>} paneParams
     * The parameters of the pane.
     * @returns {{
     *     label: string;
     *     size: [number, number];
     *     cells: (x: number, y: number) => { title: string, value: Transformation };
     *     isMultiSelect: boolean;
     *     disabled: boolean;
     *     hidden: boolean;
     * }} The requested settings.
     */
    static getTransformationSelectSettings({ settings: { disabled, hidden } }) {
        return {
            label: 'Translation Modes',
            size: [2, 1],
            cells: (x) => ({ title: this.gridLabels[x], value: this.gridTransformations[x] }),
            isMultiSelect: true,
            disabled: disabled,
            hidden: hidden,
        };
    }

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link TransformerSettingsPaneElementParams}.
     * 
     * @returns {PaneElementFactory<TransformerSettingsPaneElementParams>}
     * The resulting pane element factory.
     */
    static elementFactory() {
        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        return builder.sequential([
            builder.selectGrid(['inputtedData', 'isTransformSelected'], {
                options: (paneParams) => this.getTransformationSelectSettings(paneParams),
                modifyHTML: (element) => {
                    const buttonsContainer = element.querySelector('.tp-lblv_v');
                    if (buttonsContainer instanceof HTMLDivElement) {
                        buttonsContainer.style.width = '240px';
                    } else {
                        console.warn('Cannot find buttons container');
                    }
                },
            }),
        ]);
    }

    /**
     * Data processor to pass into {@link PaneController}.
     * 
     * @type {PaneControllerDataProcessor<TransformerSettingsPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => ({}),
        outputData: (paneParams) => {
            const { inputtedData: { isTransformSelected } } = paneParams;

            return { isTransformSelected };
        },
    };

    /**
     * Creates a new UI to configure the settings for a {@link Transformer}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<TransformerSettingsPaneControllerState>} initialState
     * The initial state to set.
     * @returns {TransformerSettingsPaneController} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new TransformerSettingsPaneController(
            () => new Pane({ container: dom }),
            this.elementFactory(),
            this.DATA_PROCESSOR,
            {
                inputtedData: initialState.inputtedData ?? this.FACTORY_PARAMS.inputtedData,
                internalData: initialState.internalData ?? {},
                settings: initialState.settings ?? this.FACTORY_PARAMS.settings,
            },
        );
    }
}
