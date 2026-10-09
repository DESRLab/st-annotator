import { Pane } from 'tweakpane';

import { PaneController, PaneElementFactoryBuilder } from '../../../base';

/**
 * @template T
 * @typedef {import('../../../../../../common/lib/utils').TypeUtils.Immutable<T>} Immutable
 */

/**
 * @template P
 * @typedef {import('../../../base').PaneElementFactory<P>} PaneElementFactory
 */

/**
 * @typedef {import('../../../base').PaneControllerDataTypes} PaneControllerDataTypes
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('../../../base').PaneElementParams<P>} PaneElementParams
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('../../../base').PaneControllerDataProcessor<P>} PaneControllerDataProcessor
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('../../../base').PaneControllerState<P>} PaneControllerState
 */

/**
 * @typedef {import('../display').ViewMode} ViewMode
 */

/**
 * @typedef {object} ViewModeInputtedData
 * @property {ViewMode} viewMode The selected view mode.
 */

/**
 * @typedef {object} ViewModePaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 */

/**
 * @typedef {object} ViewModeState
 * @property {ViewMode} viewMode The selected view mode.
 */

/**
 * @typedef {{
 *     inputtedData: ViewModeInputtedData;
 *     computedData: {};
 *     settings: ViewModePaneSettings;
 *     internalData: {};
 *     outputData: ViewModeState;
 * }} ViewModePaneControllerParams
 */

/**
 * @typedef {PaneElementParams<ViewModePaneControllerParams>} ViewModePaneElementParams
 */

/**
 * @typedef {PaneControllerState<ViewModePaneControllerParams>} ViewModePaneControllerState
 */

/**
 * Represents a UI to select a {@link ViewMode}.
 * 
 * @augments PaneController<ViewModePaneControllerParams>
 */
export class ViewModePaneController extends PaneController {

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<ViewModePaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            viewMode: '2D',
        },
        computedData: {},
        settings: {
            disabled: false,
            hidden: false,
        },
    };

    /**
     * @readonly
     * @type {ReadonlyArray<ViewMode>}
     */
    static gridViewModes = ['2D', '3D'];

    /**
     * @readonly
     * @type {ReadonlyArray<string>}
     */
    static gridLabels = ['2D', '3D'];

    /**
     * Obtains the settings for the view mode selector.
     * 
     * @param {Immutable<ViewModePaneElementParams>} paneParams The parameters of the pane.
     * @returns {{
     *     view: 'radiogrid',
     *     groupName: string,
     *     label: string;
     *     size: [number, number];
     *     cells: (x: number, y: number) => { title: string, value: ViewMode };
     *     disabled: boolean;
     *     hidden: boolean;
     * }} The requested settings.
     */
    static getViewModeSelectSettings({ settings: { disabled, hidden } }) {
        return {
            view: 'radiogrid',
            groupName: 'viewMode',
            label: 'View Mode',
            size: [2, 1],
            cells: (x) => ({ title: this.gridLabels[x], value: this.gridViewModes[x] }),
            disabled: disabled,
            hidden: hidden,
        };
    }

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link ViewModePaneElementParams}.
     * 
     * @returns {PaneElementFactory<ViewModePaneElementParams>}
     * The resulting pane element factory.
     */
    static elementFactory() {
        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        return builder.sequential([
            builder.input(['inputtedData', 'viewMode'], {
                options: (paneParams) => this.getViewModeSelectSettings(paneParams),
            }),
        ]);
    }

    /**
     * Data processor to pass into {@link PaneController}.
     * 
     * @type {PaneControllerDataProcessor<ViewModePaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => ({}),
        outputData: (paneParams) => {
            const { inputtedData: { viewMode } } = paneParams;

            return { viewMode };
        },
    };

    /**
     * Creates a new UI to select a {@link ViewMode}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<ViewModePaneControllerState>} initialState
     * The initial state to set.
     * @returns {ViewModePaneControllerState} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new ViewModePaneController(
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
