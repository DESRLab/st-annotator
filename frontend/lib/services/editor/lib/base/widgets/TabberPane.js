import { Pane } from 'tweakpane';

import { PaneController, PaneElementFactoryBuilder } from './pane';

/**
 * @template T
 * @typedef {import('../../../../../common/lib/utils').TypeUtils.Immutable<T>} Immutable
 */

/**
 * @template P
 * @typedef {import('./pane').PaneElementFactory<P>} PaneElementFactory
 */

/**
 * @typedef {import('./pane').PaneControllerDataTypes} PaneControllerDataTypes
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('./pane').PaneElementParams<P>} PaneElementParams
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('./pane').PaneControllerDataProcessor<P>} PaneControllerDataProcessor
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('./pane').PaneControllerState<P>} PaneControllerState
 */

/**
 * @typedef {object} TabberPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 */

/**
 * @typedef {{
 *     inputtedData: {};
 *     computedData: {};
 *     settings: TabberPaneSettings;
 *     internalData: {};
 *     outputData: {};
 * }} TabberPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<TabberPaneControllerParams>} TabberPaneElementParams
 */

/**
 * @typedef {PaneControllerState<TabberPaneControllerParams>} TabberPaneControllerState
 */

/**
 * Represents a tabber with tabs containing HTML elements.
 * 
 * @augments PaneController<TabberPaneControllerParams>
 */
export class TabberPaneController extends PaneController {

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<TabberPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {},
        computedData: {},
        settings: {
            disabled: false,
            hidden: false,
        },
    };

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link TabberPaneElementParams}.
     * 
     * @param {Record<string, HTMLElement>} tabs For each tab, an entry with its title being the
     * key and the HTML element being the value.
     * @returns {PaneElementFactory<TabberPaneElementParams>} The resulting pane element factory.
     */
    static elementFactory(tabs) {
        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        return builder.tab(
            Object.entries(tabs).map(([title, innerElem]) => ({
                factory: builder.htmlContainer({ options: { innerElem } }),
                options: { title },
            })),
            { options: ({ settings: { disabled, hidden } }) => ({ disabled, hidden }) },
        );
    }

    /**
     * Data processor to pass into {@link PaneController}.
     * 
     * @type {PaneControllerDataProcessor<TabberPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => ({}),
        outputData: (paneParams) => ({}),
    };

    /**
     * Creates a new tabber with tabs containing HTML elements.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Record<string, HTMLElement>} tabs For each tab, an entry with its title being the
     * key and the HTML element being the value.
     * @param {Partial<TabberPaneControllerState>} initialState
     * The initial state to set.
     * @returns {TabberPaneController} The resulting controller.
     */
    static create(dom, tabs, initialState = {}) {
        return new TabberPaneController(
            () => new Pane({ container: dom }),
            this.elementFactory(tabs),
            this.DATA_PROCESSOR,
            {
                inputtedData: initialState.inputtedData ?? this.FACTORY_PARAMS.inputtedData,
                internalData: initialState.internalData ?? {},
                settings: initialState.settings ?? this.FACTORY_PARAMS.settings,
            },
        );
    }
}
