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
 * @typedef {object} AccordionPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 */

/**
 * @typedef {{
 *     inputtedData: {};
 *     computedData: {};
 *     settings: AccordionPaneSettings;
 *     internalData: {};
 *     outputData: {};
 * }} AccordionPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<AccordionPaneControllerParams>} AccordionPaneElementParams
 */

/**
 * @typedef {PaneControllerState<AccordionPaneControllerParams>} AccordionPaneControllerState
 */

/**
 * Represents an accordion with folders containing HTML elements.
 * 
 * @augments PaneController<AccordionPaneControllerParams>
 */
export class AccordionPaneController extends PaneController {

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<AccordionPaneElementParams>}
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
     * {@link AccordionPaneElementParams}.
     * 
     * @param {Record<string, HTMLElement>} folders For each folder, an entry with its title being
     * the key and the HTML element being the value.
     * @returns {PaneElementFactory<AccordionPaneElementParams>} The resulting pane element factory.
     */
    static elementFactory(folders) {
        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        return builder.sequential(
            Object.entries(folders).map(([title, innerElem]) => builder.folder(
                builder.htmlContainer({ options: { innerElem } }),
                { options: ({ settings: { disabled, hidden } }) => ({ title, disabled, hidden }) },
            )),
        );
    }

    /**
     * Data processor to pass into {@link PaneController}.
     * 
     * @type {PaneControllerDataProcessor<AccordionPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => ({}),
        outputData: (paneParams) => ({}),
    };

    /**
     * Creates a new accordion with folders containing HTML elements.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Record<string, HTMLElement>} folders For each folder, an entry with its title being
     * the key and the HTML element being the value.
     * @param {Partial<AccordionPaneControllerState>} initialState
     * The initial state to set.
     * @returns {AccordionPaneController} The resulting controller.
     */
    static create(dom, folders, initialState = {}) {
        return new AccordionPaneController(
            () => new Pane({ container: dom }),
            this.elementFactory(folders),
            this.DATA_PROCESSOR,
            {
                inputtedData: initialState.inputtedData ?? this.FACTORY_PARAMS.inputtedData,
                internalData: initialState.internalData ?? {},
                settings: initialState.settings ?? this.FACTORY_PARAMS.settings,
            },
        );
    }
}
