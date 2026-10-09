import { Pane } from 'tweakpane';

import { PaneController, PaneControllerDataMapper, PaneElementFactoryBuilder } from 'sta/services/editor/base';

import { LabelClassSelectionPaneController, renderTriggers as classRenderTriggers } from './LabelClassSelectionPane';
import { LabelTrackSelectionPaneController, renderTriggers as trackRenderTriggers } from './LabelTrackSelectionPane';
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
 * @typedef {import('../data').ReadonlyLabelBox} ReadonlyLabelBox
 */

/**
 * @typedef {import('../data').ReadonlyLabelClass} ReadonlyLabelClass
 */

/**
 * @typedef {import('../data').ReadonlyLabelTrack} ReadonlyLabelTrack
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
 * @typedef {import('./LabelTrackSelectionPane').LabelTrackSelectionPaneControllerParams} LabelTrackSelectionPaneControllerParams
 */
/* eslint-enable max-len */

/**
 * @typedef {object} LabelBoxRelationsInputtedData
 * @property {LabelTrackSelectionPaneControllerParams['inputtedData']} trackSelect
 * Specifies the {@link LabelTrackSelection} representing the associated object track.
 * @property {LabelClassSelectionPaneControllerParams['inputtedData']} classSelect
 * Specifies the {@link LabelClassSelection} representing the associated object class.
 */

/**
 * @typedef {object} LabelBoxRelationsComputedData
 * @property {LabelTrackSelectionPaneControllerParams['computedData']} trackSelect
 * Specifies the {@link LabelTrackSelection} representing the associated object track.
 * @property {LabelClassSelectionPaneControllerParams['computedData']} classSelect
 * Specifies the {@link LabelClassSelection} representing the associated object class.
 */

/**
 * @typedef {object} LabelBoxRelationsPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 * @property {boolean} disableTrackInput `true` if the track input is forced to be
 * disabled; otherwise, the default behaviour of `disabled` is applied.
 */

/**
 * @typedef {object} LabelBoxRelationsSource
 * @property {ReadonlyMap<UUID, ReadonlyLabelTrack>} tracks Indexes each object track that
 * can be selected from by its unique identifier.
 * @property {ReadonlyMap<number, ReadonlyLabelClass>} classes Indexes each object class that
 * can be selected from by its unique identifier.
 */

/**
 * @typedef {object} LabelBoxRelations
 * @property {?UUID} trackId The unique identifier of the associated object track';
 * `null` if none is selected or the one provided in
 * {@link LabelBoxRelationsInputtedData#trackSelect} is not found.
 * @property {?number} classId The unique identifier of the associated object class;
 * `null` if none is selected or the one provided in
 * {@link LabelBoxRelationsInputtedData#classSelect} is not found.
 */

/**
 * @typedef {{
 *     inputtedData: LabelBoxRelationsInputtedData;
 *     computedData: LabelBoxRelationsComputedData;
 *     settings: LabelBoxRelationsPaneSettings;
 *     internalData: ?LabelBoxRelationsSource;
 *     outputData: LabelBoxRelations;
 * }} LabelBoxRelationsPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<LabelBoxRelationsPaneControllerParams>
 * } LabelBoxRelationsPaneElementParams
 */

/**
 * @typedef {PaneControllerState<LabelBoxRelationsPaneControllerParams>
 * } LabelBoxRelationsPaneControllerState
 */

export const renderTriggers = composeRenderTriggers(trackRenderTriggers, classRenderTriggers);

/**
 * Represents a UI to configure the relations of a {@link ReadonlyLabelBox}.
 * 
 * @augments PaneController<LabelBoxRelationsPaneControllerParams>
 */
export class LabelBoxRelationsPaneController extends PaneController {

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<LabelBoxRelationsPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            trackSelect: LabelTrackSelectionPaneController.FACTORY_PARAMS.inputtedData,
            classSelect: LabelClassSelectionPaneController.FACTORY_PARAMS.inputtedData,
        },
        computedData: {
            trackSelect: LabelTrackSelectionPaneController.FACTORY_PARAMS.computedData,
            classSelect: LabelClassSelectionPaneController.FACTORY_PARAMS.computedData,
        },
        settings: {
            disabled: false,
            hidden: false,
            disableTrackInput: false,
        },
    };

    /**
     * @type {PaneControllerDataMapper<
     * LabelBoxRelationsPaneControllerParams,
     * LabelTrackSelectionPaneControllerParams>}
     */
    static #trackSelectDataMapper = new PaneControllerDataMapper({
        outerToInner: {
            inputtedData: (outerInputted) => outerInputted.trackSelect,
            internalData: (outerInternal) => outerInternal,
            computedData: (outer) => outer.computedData.trackSelect,
            settings: (outer) => ({
                disabled: outer.settings.disabled || outer.settings.disableTrackInput,
                hidden: outer.settings.hidden,
            }),
        },
        innerToOuter: {
            inputtedData: (innerInputted) => ({ trackSelect: innerInputted }),
        },
    });

    /**
     * @type {PaneControllerDataMapper<
     * LabelBoxRelationsPaneControllerParams,
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
     * {@link LabelBoxRelationsPaneElementParams}.
     * 
     * @returns {PaneElementFactory<LabelBoxRelationsPaneElementParams>}
     * The resulting pane element factory.
     */
    static elementFactory() {
        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        return builder.sequential([
            builder.mapped(
                LabelTrackSelectionPaneController.elementFactory(),
                this.#trackSelectDataMapper.paramsMapper(),
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
     * @type {PaneControllerDataProcessor<LabelBoxRelationsPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => {
            const trackSelectComputedData = LabelTrackSelectionPaneController.DATA_PROCESSOR
                .computeData(
                    this.#trackSelectDataMapper.outerToInner.inputtedData(inputtedData),
                    this.#trackSelectDataMapper.outerToInner.internalData(internalData),
                );

            const classSelectComputedData = LabelClassSelectionPaneController.DATA_PROCESSOR
                .computeData(
                    this.#classSelectDataMapper.outerToInner.inputtedData(inputtedData),
                    this.#classSelectDataMapper.outerToInner.internalData(internalData),
                );

            return {
                trackSelect: trackSelectComputedData,
                classSelect: classSelectComputedData,
            };
        },
        outputData: (paneParams) => {
            const { trackId } = LabelTrackSelectionPaneController.DATA_PROCESSOR
                .outputData(this.#trackSelectDataMapper.paramsMapper().outerToInner(paneParams));

            const { classId } = LabelClassSelectionPaneController.DATA_PROCESSOR
                .outputData(this.#classSelectDataMapper.paramsMapper().outerToInner(paneParams));

            return { trackId, classId };
        },
    };

    /**
     * Creates a new UI to configure the relations of a {@link ReadonlyLabelBox}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<LabelBoxRelationsPaneControllerState>} initialState
     * The initial state to set.
     * @returns {LabelBoxRelationsPaneController} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new LabelBoxRelationsPaneController(
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
