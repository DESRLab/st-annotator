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
 * @typedef {import('./InspectorPaneRenderTrigger').InspectorPaneRenderTrigger} InspectorPaneRenderTrigger
 */
/* eslint-enable max-len */

/**
 * @typedef {object} LabelInstanceDescriptorsInputtedData
 * @property {boolean} isBlack If `true`, indicates low reflectivity; otherwise, `false`.
 */

/**
 * @typedef {object} LabelInstanceDescriptorsPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 */

/**
 * @typedef {object} LabelInstanceDescriptors
 * @property {boolean} isBlack If `true`, indicates low reflectivity; otherwise, `false`.
 */

/**
 * @typedef {{
 *     inputtedData: LabelInstanceDescriptorsInputtedData;
 *     computedData: {};
 *     settings: LabelInstanceDescriptorsPaneSettings;
 *     internalData: {};
 *     outputData: LabelInstanceDescriptors;
 * }} LabelInstanceDescriptorsPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<LabelInstanceDescriptorsPaneControllerParams>
 * } LabelInstanceDescriptorsPaneElementParams
 */

/**
 * @typedef {PaneControllerState<LabelInstanceDescriptorsPaneControllerParams>
 * } LabelInstanceDescriptorsPaneControllerState
 */

/**
 * @type {InspectorPaneRenderTrigger}
 */
export const renderTriggers = {
    // Display text is changed
    'instance-update': (e) => (e.propertyKey === 'isBlack'),
};

/**
 * Represents a UI to configure the descriptors of a {@link ReadonlyLabelInstance}.
 * 
 * @augments PaneController<LabelInstanceDescriptorsPaneControllerParams>
 */
export class LabelInstanceDescriptorsPaneController extends PaneController {

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<LabelInstanceDescriptorsPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            isBlack: false,
        },
        computedData: {},
        settings: {
            disabled: false,
            hidden: false,
        },
    };

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link LabelInstanceDescriptorsPaneElementParams}.
     * 
     * @returns {PaneElementFactory<LabelInstanceDescriptorsPaneElementParams>}
     * The resulting pane element factory.
     */
    static elementFactory() {
        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        return builder.sequential([
            builder.input(['inputtedData', 'isBlack'], {
                options: ({ settings: { disabled, hidden } }) => ({
                    label: 'Low Reflectivity',
                    disabled: disabled,
                    hidden: hidden,
                }),
            }),
        ]);
    }

    /**
     * Data processor to pass into {@link PaneController}.
     * 
     * @type {PaneControllerDataProcessor<LabelInstanceDescriptorsPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => ({}),
        outputData: (paneParams) => {
            const { inputtedData: { isBlack } } = paneParams;

            return { isBlack };
        },
    };

    /**
     * Creates a new UI to configure the descriptors of a {@link ReadonlyLabelInstance}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<LabelInstanceDescriptorsPaneControllerState>} initialState
     * The initial state to set.
     * @returns {LabelInstanceDescriptorsPaneController} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new LabelInstanceDescriptorsPaneController(
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
