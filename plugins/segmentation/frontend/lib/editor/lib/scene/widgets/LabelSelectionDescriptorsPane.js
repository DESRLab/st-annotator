import * as _ from 'lodash';
import { Pane } from 'tweakpane';

import { PaneController, PaneElementFactoryBuilder } from 'sta/services/editor/base';

import { DistinctiveLevel, OcclusionLevel } from '../../../../label/lib';

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
 * @typedef {object} LabelSelectionDescriptorsInputtedData
 * @property {DistinctiveLevel} distinctiveLv The distinctiveness level of the represented object.
 * @property {OcclusionLevel} occlusionLv The occlusion level of the represented object.
 */

/**
 * @typedef {object} LabelSelectionDescriptorsPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 */

/**
 * @typedef {object} LabelSelectionDescriptors
 * @property {DistinctiveLevel} distinctiveLv The distinctiveness level of the represented object.
 * @property {OcclusionLevel} occlusionLv The occlusion level of the represented object.
 */

/**
 * @typedef {{
 *     inputtedData: LabelSelectionDescriptorsInputtedData;
 *     computedData: {};
 *     settings: LabelSelectionDescriptorsPaneSettings;
 *     internalData: {};
 *     outputData: LabelSelectionDescriptors;
 * }} LabelSelectionDescriptorsPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<LabelSelectionDescriptorsPaneControllerParams>
 * } LabelSelectionDescriptorsPaneElementParams
 */

/**
 * @typedef {PaneControllerState<LabelSelectionDescriptorsPaneControllerParams>
 * } LabelSelectionDescriptorsPaneControllerState
 */

/**
 * @type {InspectorPaneRenderTrigger}
 */
export const renderTriggers = {
    // Display text is changed
    'selection-update': (e) => (e.propertyKey === 'distinctiveLv' || e.propertyKey === 'occlusionLv'),
};

/**
 * Represents a UI to configure the descriptors of a {@link ReadonlyLabelSelection}.
 * 
 * @augments PaneController<LabelSelectionDescriptorsPaneControllerParams>
 */
export class LabelSelectionDescriptorsPaneController extends PaneController {

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<LabelSelectionDescriptorsPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            distinctiveLv: DistinctiveLevel.Unknown,
            occlusionLv: OcclusionLevel.Unknown,
        },
        computedData: {},
        settings: {
            disabled: false,
            hidden: false,
        },
    };

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link LabelSelectionDescriptorsPaneElementParams}.
     * 
     * @returns {PaneElementFactory<LabelSelectionDescriptorsPaneElementParams>}
     * The resulting pane element factory.
     */
    static elementFactory() {
        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        return builder.sequential([
            builder.list(['inputtedData', 'distinctiveLv'], {
                options: ({ settings: { disabled, hidden } }) => ({
                    label: 'Distinctiveness Level',
                    options: Object.values(DistinctiveLevel).map((v) => ({
                        text: v.name,
                        value: v,
                    })),
                    disabled: disabled,
                    hidden: hidden,
                }),
            }),
            builder.list(['inputtedData', 'occlusionLv'], {
                options: ({ settings: { disabled, hidden } }) => ({
                    label: 'Occlusion Level',
                    options: Object.values(OcclusionLevel).map((v) => ({
                        text: v.name,
                        value: v,
                    })),
                    disabled: disabled,
                    hidden: hidden,
                }),
            }),
        ]);
    }

    /**
     * Data processor to pass into {@link PaneController}.
     * 
     * @type {PaneControllerDataProcessor<LabelSelectionDescriptorsPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => ({}),
        outputData: (paneParams) => {
            const { inputtedData: { distinctiveLv, occlusionLv } } = paneParams;

            return {
                distinctiveLv: _.cloneDeep(distinctiveLv),
                occlusionLv: _.cloneDeep(occlusionLv),
            };
        },
    };

    /**
     * Creates a new UI to configure the descriptors of a {@link ReadonlyLabelSelection}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<LabelSelectionDescriptorsPaneControllerState>} initialState
     * The initial state to set.
     * @returns {LabelSelectionDescriptorsPaneController} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new LabelSelectionDescriptorsPaneController(
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
