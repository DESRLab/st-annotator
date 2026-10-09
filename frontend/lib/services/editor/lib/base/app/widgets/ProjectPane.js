import { Pane } from 'tweakpane';

import { PaneController, PaneElementFactoryBuilder } from '../../widgets';

/**
 * @template T
 * @typedef {import('../../../../../../common/lib/utils').TypeUtils.Immutable<T>} Immutable
 */

/**
 * @typedef {import('../../../../../project/lib').TaskState} TaskState
 */

/**
 * @typedef {import('../../../../../label/lib').LabelGroupState} LabelGroupState
 */

/**
 * @typedef {import('../../../../../source/lib').SourceGroupState} SourceGroupState
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
 * @typedef {object} ProjectNavComputedData
 * @property {HTMLDivElement} sceneSelectionElem An element containing the scene selection UI.
 * @property {HTMLDivElement} framePathElem An element containing the frame path UI.
 * @property {HTMLDivElement} frameInspectorElem An element containing the frame inspector UI.
 */

/**
 * @typedef {object} ProjectPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 */

/**
 * @typedef {object} ProjectNavSource
 * @property {HTMLDivElement} sceneSelectionElem An element containing the scene selection UI.
 * @property {HTMLDivElement} framePathElem An element containing the frame path UI.
 * @property {HTMLDivElement} frameInspectorElem An element containing the frame inspector UI.
 */

/**
 * @typedef {{
 *     inputtedData: {};
 *     computedData: ProjectNavComputedData;
 *     settings: ProjectPaneSettings;
 *     internalData: ?ProjectNavSource;
 *     outputData: {};
 * }} ProjectPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<ProjectPaneControllerParams>
 * } ProjectPaneElementParams
 */

/**
 * @typedef {PaneControllerState<ProjectPaneControllerParams>
 * } ProjectPaneControllerState
 */

/**
 * Represents a UI to navigate the currently open project.
 * 
 * @augments PaneController<ProjectPaneControllerParams>
 */
export class ProjectPaneController extends PaneController {

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<ProjectPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {},
        computedData: {
            sceneSelectionElem: document.createElement('div'),
            framePathElem: document.createElement('div'),
            frameInspectorElem: document.createElement('div'),
        },
        settings: {
            disabled: false,
            hidden: false,
        },
    };

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link ProjectPaneElementParams}.
     * 
     * @returns {PaneElementFactory<ProjectPaneElementParams>}
     * The resulting pane element factory.
     */
    static elementFactory() {
        /**
         * @type {PaneElementFactoryBuilder<ProjectPaneElementParams>}
         */
        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        return builder.tab([
            {
                factory: builder.htmlContainer({
                    options: ({ computedData: { sceneSelectionElem } }) => ({
                        innerElem: sceneSelectionElem,
                    }),
                }),
                options: ({ settings: { disabled, hidden } }) => ({
                    title: 'Task',
                    disabled: disabled,
                    hidden: hidden,
                }),
            },
            {
                factory: builder.htmlContainer({
                    options: ({ computedData: { framePathElem } }) => ({
                        innerElem: framePathElem,
                    }),
                }),
                options: ({ settings: { disabled, hidden } }) => ({
                    title: 'Scene',
                    disabled: disabled,
                    hidden: hidden,
                }),
            },
            {
                factory: builder.htmlContainer({
                    options: ({ computedData: { frameInspectorElem } }) => ({
                        innerElem: frameInspectorElem,
                    }),
                }),
                options: ({ settings: { disabled, hidden } }) => ({
                    title: 'Frame',
                    disabled: disabled,
                    hidden: hidden,
                }),
            },
        ], {
            options: ({ settings: { disabled, hidden } }) => ({ disabled, hidden }),
        });
    }

    /**
     * Data processor to pass into {@link PaneController}.
     * 
     * @type {PaneControllerDataProcessor<ProjectPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => ({
            sceneSelectionElem: internalData?.sceneSelectionElem ?? document.createElement('div'),
            framePathElem: internalData?.framePathElem ?? document.createElement('div'),
            frameInspectorElem: internalData?.frameInspectorElem ?? document.createElement('div'),
        }),
        outputData: (paneParams) => ({}),
    };

    /**
     * Creates a new UI to navigate the currently open project.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<ProjectPaneControllerState>} initialState
     * The initial state to set.
     * @returns {ProjectPaneController} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new ProjectPaneController(
            () => new Pane({ container: dom }),
            this.elementFactory(),
            this.DATA_PROCESSOR,
            {
                inputtedData: initialState.inputtedData ?? this.FACTORY_PARAMS.inputtedData,
                internalData: initialState.internalData ?? null,
                settings: initialState.settings ?? this.FACTORY_PARAMS.settings,
            },
        );
    }
}
