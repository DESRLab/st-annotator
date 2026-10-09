import { Pane } from 'tweakpane';

import { PaneController, PaneControllerDataMapper, PaneElementFactoryBuilder } from 'sta/services/editor/base';

import { LabelClassSelectionPaneController, renderTriggers as classRenderTriggers } from './LabelClassSelectionPane';
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
/* eslint-enable max-len */

/**
 * @typedef {object} LabelInstanceRelationsInputtedData
 * @property {LabelClassSelectionPaneControllerParams['inputtedData']} classSelect
 * Specifies the {@link LabelClassSelection} representing the associated object class.
 */

/**
 * @typedef {object} LabelInstanceRelationsComputedData
 * @property {LabelClassSelectionPaneControllerParams['computedData']} classSelect
 * Specifies the {@link LabelClassSelection} representing the associated object class.
 */

/**
 * @typedef {object} LabelInstanceRelationsPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 */

/**
 * @typedef {object} LabelInstanceRelationsSource
 * @property {ReadonlyMap<number, ReadonlyLabelClass>} classes Indexes each object class that
 * can be selected from by its unique identifier.
 */

/**
 * @typedef {object} LabelInstanceRelations
 * @property {?number} classId The unique identifier of the associated object class;
 * `null` if none is selected or the one provided in
 * {@link LabelInstanceRelationsInputtedData#classSelect} is not found.
 */

/**
 * @typedef {{
 *     inputtedData: LabelInstanceRelationsInputtedData;
 *     computedData: LabelInstanceRelationsComputedData;
 *     settings: LabelInstanceRelationsPaneSettings;
 *     internalData: ?LabelInstanceRelationsSource;
 *     outputData: LabelInstanceRelations;
 * }} LabelInstanceRelationsPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<LabelInstanceRelationsPaneControllerParams>
 * } LabelInstanceRelationsPaneElementParams
 */

/**
 * @typedef {PaneControllerState<LabelInstanceRelationsPaneControllerParams>
 * } LabelInstanceRelationsPaneControllerState
 */

export const renderTriggers = composeRenderTriggers(classRenderTriggers);

/**
 * Represents a UI to configure the relations of a {@link ReadonlyLabelInstance}.
 * 
 * @augments PaneController<LabelInstanceRelationsPaneControllerParams>
 */
export class LabelInstanceRelationsPaneController extends PaneController {

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<LabelInstanceRelationsPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            classSelect: LabelClassSelectionPaneController.FACTORY_PARAMS.inputtedData,
        },
        computedData: {
            classSelect: LabelClassSelectionPaneController.FACTORY_PARAMS.computedData,
        },
        settings: {
            ...LabelClassSelectionPaneController.FACTORY_PARAMS.settings,
        },
    };

    /**
     * @type {PaneControllerDataMapper<
     * LabelInstanceRelationsPaneControllerParams,
     * LabelClassSelectionPaneControllerParams>}
     */
    static #classSelectDataMapper = new PaneControllerDataMapper({
        outerToInner: {
            inputtedData: (outerInputted) => outerInputted.classSelect,
            internalData: (outerInternal) => outerInternal,
            computedData: (outer) => outer.computedData.classSelect,
            settings: (outer) => outer.settings,
        },
        innerToOuter: {
            inputtedData: (innerInputted) => ({ classSelect: innerInputted }),
        },
    });

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link LabelInstanceRelationsPaneElementParams}.
     * 
     * @returns {PaneElementFactory<LabelInstanceRelationsPaneElementParams>}
     * The resulting pane element factory.
     */
    static elementFactory() {
        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        return builder.sequential([
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
     * @type {PaneControllerDataProcessor<LabelInstanceRelationsPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => {
            const classSelectComputedData = LabelClassSelectionPaneController.DATA_PROCESSOR
                .computeData(
                    this.#classSelectDataMapper.outerToInner.inputtedData(inputtedData),
                    this.#classSelectDataMapper.outerToInner.internalData(internalData),
                );

            return { classSelect: classSelectComputedData };
        },
        outputData: (paneParams) => {
            const { classId } = LabelClassSelectionPaneController.DATA_PROCESSOR
                .outputData(this.#classSelectDataMapper.paramsMapper().outerToInner(paneParams));

            return { classId };
        },
    };

    /**
     * Creates a new UI to configure the relations of a {@link ReadonlyLabelInstance}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<LabelInstanceRelationsPaneControllerState>} initialState
     * The initial state to set.
     * @returns {LabelInstanceRelationsPaneController} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new LabelInstanceRelationsPaneController(
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
