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
/* eslint-enable max-len */

/**
 * Contains each action that is displayed in the button grid.
 * 
 * @typedef {'select' | 'draw'} GridAction
 */

/**
 * @typedef {object} ActionsGridInputtedData
 * @property {Record<GridAction, boolean>} isActionSelected For each given action:
 * `true` it is toggled in the button grid; otherwise, `false`.
 */

/**
 * @typedef {object} ActionsGridPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 */

/**
 * @typedef {object} ActionsGridSelection
 * @property {Record<GridAction, boolean>} isActionSelected For each given action:
 * `true` it is toggled in the button grid; otherwise, `false`.
 */

/**
 * @typedef {{
 *     inputtedData: ActionsGridInputtedData;
 *     computedData: {};
 *     settings: ActionsGridPaneSettings;
 *     internalData: {};
 *     outputData: ActionsGridSelection;
 * }} ActionsGridPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<ActionsGridPaneControllerParams>} ActionsGridPaneElementParams
 */

/**
 * @typedef {PaneControllerState<ActionsGridPaneControllerParams>} ActionsGridPaneControllerState
 */

/**
 * Represents a UI to select {@link GridAction}s.
 * 
 * @augments PaneController<ActionsGridPaneControllerParams>
 */
export class ActionsGridPaneController extends PaneController {

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<ActionsGridPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            isActionSelected: {
                select: false,
                draw: false,
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
     * @type {ReadonlyArray<GridAction>}
     */
    static gridActions = ['select', 'draw'];

    /**
     * @readonly
     * @type {ReadonlyArray<string>}
     */
    static gridLabels = ['S', 'D'];

    /**
     * Obtains the settings for the action selector.
     * 
     * @param {Immutable<ActionsGridPaneElementParams>} paneParams
     * The parameters of the pane.
     * @returns {{
     *     label: string;
     *     size: [number, number];
     *     cells: (x: number, y: number) => { title: string, value: GridAction };
     *     isMultiSelect: boolean;
     *     disabled: boolean;
     *     hidden: boolean;
     * }} The requested settings.
     */
    static getActionSelectSettings({ settings: { disabled, hidden } }) {
        return {
            label: 'Action',
            size: [2, 1],
            cells: (x) => ({ title: this.gridLabels[x], value: this.gridActions[x] }),
            isMultiSelect: false,
            disabled: disabled,
            hidden: hidden,
        };
    }

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link ActionsGridPaneElementParams}.
     * 
     * @returns {PaneElementFactory<ActionsGridPaneElementParams>}
     * The resulting pane element factory.
     */
    static elementFactory() {
        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        return builder.sequential([
            builder.selectGrid(['inputtedData', 'isActionSelected'], {
                options: (paneParams) => this.getActionSelectSettings(paneParams),
                modifyHTML: (element) => {
                    const labelContainer = element.querySelector('.tp-lblv_l');
                    if (labelContainer instanceof HTMLDivElement) {
                        labelContainer.style.display = 'none';
                    } else {
                        console.warn('Cannot find label container');
                    }

                    const buttonsContainer = element.querySelector('.tp-lblv_v');
                    if (buttonsContainer instanceof HTMLDivElement) {
                        buttonsContainer.style.width = '100%';
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
     * @type {PaneControllerDataProcessor<ActionsGridPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => ({}),
        outputData: (paneParams) => {
            const { inputtedData: { isActionSelected } } = paneParams;

            return { isActionSelected };
        },
    };

    /**
     * Creates a new UI to select {@link GridAction}s.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<ActionsGridPaneControllerState>} initialState
     * The initial state to set.
     * @returns {ActionsGridPaneController} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new ActionsGridPaneController(
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
