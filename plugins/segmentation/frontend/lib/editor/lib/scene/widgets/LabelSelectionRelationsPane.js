import { Pane } from 'tweakpane';

import { PaneController, PaneControllerDataMapper, PaneElementFactoryBuilder } from 'sta/services/editor/base';

import { LabelClassSelectionPaneController, renderTriggers as classRenderTriggers } from './LabelClassSelectionPane';
import { LabelInstanceSelectionPaneController, renderTriggers as instanceRenderTriggers } from './LabelInstanceSelectionPane';
import { composeRenderTriggers } from './InspectorPaneRenderTrigger';

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
 * @typedef {import('../data').ReadonlyLabelSelection} ReadonlyLabelSelection
 */

/**
 * @typedef {import('../data').ReadonlyLabelClass} ReadonlyLabelClass
 */

/**
 * @typedef {import('../data').ReadonlyLabelInstance} ReadonlyLabelInstance
 */

/**
 * @typedef {import('../data').UUID} UUID
 */

/**
 * @typedef {import('./LabelClassSelectionPane').LabelClassSelectionPaneControllerParams} LabelClassSelectionPaneControllerParams
 */

/**
 * @typedef {import('./LabelClassSelectionPane').LabelClassSelectionSource} LabelClassSelectionSource
 */

/**
 * @typedef {import('./LabelInstanceSelectionPane').LabelInstanceSelectionPaneControllerParams} LabelInstanceSelectionPaneControllerParams
 */
/* eslint-enable max-len */

/**
 * @typedef {object} LabelSelectionRelationsInputtedData
 * @property {LabelInstanceSelectionPaneControllerParams['inputtedData']} instanceSelect
 * Specifies the {@link LabelInstanceSelection} representing the associated object instance.
 * @property {LabelClassSelectionPaneControllerParams['inputtedData']} classSelect
 * Specifies the {@link LabelClassSelection} representing the associated object class.
 */

/**
 * @typedef {object} LabelSelectionRelationsComputedData
 * @property {LabelInstanceSelectionPaneControllerParams['computedData']} instanceSelect
 * Specifies the {@link LabelInstanceSelection} representing the associated object instance.
 * @property {LabelClassSelectionPaneControllerParams['computedData']} classSelect
 * Specifies the {@link LabelClassSelection} representing the associated object class.
 */

/**
 * @typedef {object} LabelSelectionRelationsPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 * @property {boolean} disableInstanceInput `true` if the instance input is forced to be
 * disabled; otherwise, the default behaviour of `disabled` is applied.
 */

/**
 * @typedef {object} LabelSelectionRelationsSource
 * @property {ReadonlyMap<UUID, ReadonlyLabelInstance>} instances Indexes each object instance that
 * can be selected from by its unique identifier.
 * @property {ReadonlyMap<number, ReadonlyLabelClass>} classes Indexes each object class that
 * can be selected from by its unique identifier.
 */

/**
 * @typedef {object} LabelSelectionRelations
 * @property {?UUID} instanceId The unique identifier of the associated object instance';
 * `null` if none is selected or the one provided in
 * {@link LabelSelectionRelationsInputtedData#instanceSelect} is not found.
 * @property {?number} classId The unique identifier of the associated object class;
 * `null` if none is selected or the one provided in
 * {@link LabelSelectionRelationsInputtedData#classSelect} is not found.
 */

/**
 * @typedef {{
 *     inputtedData: LabelSelectionRelationsInputtedData;
 *     computedData: LabelSelectionRelationsComputedData;
 *     settings: LabelSelectionRelationsPaneSettings;
 *     internalData: ?LabelSelectionRelationsSource;
 *     outputData: LabelSelectionRelations;
 * }} LabelSelectionRelationsPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<LabelSelectionRelationsPaneControllerParams>
 * } LabelSelectionRelationsPaneElementParams
 */

/**
 * @typedef {PaneControllerState<LabelSelectionRelationsPaneControllerParams>
 * } LabelSelectionRelationsPaneControllerState
 */

export const renderTriggers = composeRenderTriggers(instanceRenderTriggers, classRenderTriggers);

/**
 * Represents a UI to configure the relations of a {@link ReadonlyLabelSelection}.
 * 
 * @augments PaneController<LabelSelectionRelationsPaneControllerParams>
 */
export class LabelSelectionRelationsPaneController extends PaneController {

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<LabelSelectionRelationsPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            instanceSelect: LabelInstanceSelectionPaneController.FACTORY_PARAMS.inputtedData,
            classSelect: LabelClassSelectionPaneController.FACTORY_PARAMS.inputtedData,
        },
        computedData: {
            instanceSelect: LabelInstanceSelectionPaneController.FACTORY_PARAMS.computedData,
            classSelect: LabelClassSelectionPaneController.FACTORY_PARAMS.computedData,
        },
        settings: {
            disabled: false,
            hidden: false,
            disableInstanceInput: false,
        },
    };

    /**
     * @type {PaneControllerDataMapper<
     * LabelSelectionRelationsPaneControllerParams,
     * LabelInstanceSelectionPaneControllerParams>}
     */
    static #instanceSelectDataMapper = new PaneControllerDataMapper({
        outerToInner: {
            inputtedData: (outerInputted) => outerInputted.instanceSelect,
            internalData: (outerInternal) => outerInternal,
            computedData: (outer) => outer.computedData.instanceSelect,
            settings: (outer) => ({
                disabled: outer.settings.disabled || outer.settings.disableInstanceInput,
                hidden: outer.settings.hidden,
            }),
        },
        innerToOuter: {
            inputtedData: (innerInputted) => ({ instanceSelect: innerInputted }),
        },
    });

    /**
     * @type {PaneControllerDataMapper<
     * LabelSelectionRelationsPaneControllerParams,
     * LabelClassSelectionPaneControllerParams>}
     */
    static #classSelectDataMapper = new PaneControllerDataMapper({
        outerToInner: {
            inputtedData: (outerInputted) => outerInputted.classSelect,
            internalData: (outerInternal) => outerInternal,
            computedData: (outer) => outer.computedData.classSelect,
            settings: (outer) => ({
                disabled: outer.settings.disabled,
                hidden: outer.settings.hidden,
            }),
        },
        innerToOuter: {
            inputtedData: (innerInputted) => ({ classSelect: innerInputted }),
        },
    });

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link LabelSelectionRelationsPaneElementParams}.
     * 
     * @returns {PaneElementFactory<LabelSelectionRelationsPaneElementParams>}
     * The resulting pane element factory.
     */
    static elementFactory() {
        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        return builder.sequential([
            builder.mapped(
                LabelInstanceSelectionPaneController.elementFactory(),
                this.#instanceSelectDataMapper.paramsMapper(),
                builder.identityEventMapper(),
            ),
            builder.mapped(
                LabelClassSelectionPaneController.elementFactory(),
                this.#classSelectDataMapper.paramsMapper(),
                builder.identityEventMapper(),
            ),
        ]);
    }

    /**
     * Data processor to pass into {@link PaneController}.
     * 
     * @type {PaneControllerDataProcessor<LabelSelectionRelationsPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => {
            const instanceSelectComputedData = LabelInstanceSelectionPaneController.DATA_PROCESSOR
                .computeData(
                    this.#instanceSelectDataMapper.outerToInner.inputtedData(inputtedData),
                    this.#instanceSelectDataMapper.outerToInner.internalData(internalData),
                );

            const classSelectComputedData = LabelClassSelectionPaneController.DATA_PROCESSOR
                .computeData(
                    this.#classSelectDataMapper.outerToInner.inputtedData(inputtedData),
                    this.#classSelectDataMapper.outerToInner.internalData(internalData),
                );

            return {
                instanceSelect: instanceSelectComputedData,
                classSelect: classSelectComputedData,
            };
        },
        outputData: (paneParams) => {
            const { instanceId } = LabelInstanceSelectionPaneController.DATA_PROCESSOR
                .outputData(this.#instanceSelectDataMapper.paramsMapper().outerToInner(paneParams));

            const { classId } = LabelClassSelectionPaneController.DATA_PROCESSOR
                .outputData(this.#classSelectDataMapper.paramsMapper().outerToInner(paneParams));

            return { instanceId, classId };
        },
    };

    /**
     * Creates a new UI to configure the relations of a {@link ReadonlyLabelSelection}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<LabelSelectionRelationsPaneControllerState>} initialState
     * The initial state to set.
     * @returns {LabelSelectionRelationsPaneController} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new LabelSelectionRelationsPaneController(
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
