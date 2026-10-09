import { Pane } from 'tweakpane';

import { PaneController, PaneControllerDataMapper, PaneElementFactoryBuilder } from 'sta/services/editor/base';

import { LabelSelectionDescriptorsPaneController } from './LabelSelectionDescriptorsPane';
import { LabelSelectionSelectionPaneController } from './LabelSelectionSelectionPane';
import { LabelSelectionRelationsPaneController } from './LabelSelectionRelationsPane';

/* eslint-disable max-len */
/**
 * @template T
 * @typedef {import('three')} THREE
 */

/**
 * @template T
 * @typedef {import('sta/common/utils').TypeUtils.Immutable<T>} Immutable
 */

/**
 * @template P
 * @template {{}} E
 * @typedef {import('sta/services/editor/base').PaneElementFactory<P, E>} PaneElementFactory
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
 * @typedef {import('../../../../label/lib').DistinctiveLevel} DistinctiveLevel
 */

/**
 * @typedef {import('../../../../label/lib').OcclusionLevel} OcclusionLevel
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
 * @typedef {import('../data').ReadonlySegmentationIndex} ReadonlySegmentationIndex
 */

/**
 * @typedef {import('../data').UUID} UUID
 */

/**
 * @typedef {import('./LabelSelectionDescriptorsPane').LabelSelectionDescriptorsPaneControllerParams} LabelSelectionDescriptorsPaneControllerParams
 */

/**
 * @typedef {import('./LabelSelectionRelationsPane').LabelSelectionRelationsPaneControllerParams} LabelSelectionRelationsPaneControllerParams
 */

/**
 * @typedef {import('./LabelSelectionSelectionPane').LabelSelectionSelectionPaneControllerParams} LabelSelectionSelectionPaneControllerParams
 */

/**
 * @typedef {object} LabelSelectionInspectorInputtedData
 * @property {LabelSelectionSelectionPaneControllerParams['inputtedData']} selection
 * Specifies the {@link LabelSelectionSelection} representing the selected selection.
 * @property {LabelSelectionRelationsPaneControllerParams['inputtedData']} relations
 * Specifies the {@link LabelSelectionRelations} representing the relationships of the selection.
 * @property {LabelSelectionDescriptorsPaneControllerParams['inputtedData']} descriptors
 * Specifies the {@link LabelSelectionDescriptors} representing the descriptors of the selection.
 */

/**
 * @typedef {object} LabelSelectionInspectorComputedData
 * @property {LabelSelectionSelectionPaneControllerParams['computedData']} selection
 * Specifies the {@link LabelSelectionSelection} representing the selected selection.
 * @property {LabelSelectionRelationsPaneControllerParams['computedData']} relations
 * Specifies the {@link LabelSelectionRelations} representing the relationships of the selection.
 * @property {LabelSelectionDescriptorsPaneControllerParams['computedData']} descriptors
 * Specifies the {@link LabelSelectionDescriptors} representing the descriptors of the selection.
 */

/**
 * @typedef {object} LabelSelectionInspectorPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 * @property {boolean} drawSelectionActive `true` if draw mode is active; otherwise, `false`.
 * @property {boolean} disableInstanceInput `true` if the instance selector is forced to be
 * disabled; otherwise, the default behaviour of `disabled` is applied.
 */

/**
 * @typedef {object} LabelSelectionInspectorSource
 * @property {ReadonlyMap<UUID, ReadonlyLabelSelection>} selections Indexes each selection that
 * can be selected from by its unique identifier.
 * @property {ReadonlyMap<UUID, ReadonlyLabelInstance>} instances Indexes each object instance that
 * can be selected from by its unique identifier.
 * @property {ReadonlyMap<number, ReadonlyLabelClass>} classes Indexes each object class that
 * can be selected from by its unique identifier.
 */

/**
 * @typedef {object} LabelSelectionParams
 * @property {?UUID} selectionId The unique identifier of the selected selection,
 * or `null` if none is selected.
 * @property {?UUID} instanceId The unique identifier of the associated object instance,
 * or `null` if none is selected.
 * @property {?number} classId The unique identifier of the associated object class,
 * or `null` if none is associated.
 * @property {DistinctiveLevel} distinctiveLv The distinctiveness level of the represented object.
 * @property {OcclusionLevel} occlusionLv The occlusion level of the represented object.
 */

/**
 * @typedef {{
 *     inputtedData: LabelSelectionInspectorInputtedData;
 *     computedData: LabelSelectionInspectorComputedData;
 *     settings: LabelSelectionInspectorPaneSettings;
 *     internalData: ?LabelSelectionInspectorSource;
 *     outputData: LabelSelectionParams;
 * }} LabelSelectionInspectorPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<LabelSelectionInspectorPaneControllerParams>
 * } LabelSelectionInspectorPaneElementParams
 */

/**
 * @typedef {PaneControllerState<LabelSelectionInspectorPaneControllerParams>
 * } LabelSelectionInspectorPaneControllerState
 */

/**
 * Defines each event that can be dispatched by {@link LabelSelectionInspectorPaneController}.
 * 
 * @typedef {object} LabelSelectionInspectorPaneControllerEventMap
 * @property {{}} click-drawSelection The event when the draw selection button is clicked.
 */

/**
 * Represents a UI to inspect a {@link ReadonlyLabelSelection}.
 * 
 * @augments {PaneController<LabelSelectionInspectorPaneControllerParams,
 * LabelSelectionInspectorPaneControllerEventMap>}
 */
export class LabelSelectionInspectorPaneController extends PaneController {

    /**
     * Clicks on the draw selection button.
     * 
     * This is a no-op if the button is disabled.
     */
    clickDrawSelection() {
        const settings = LabelSelectionInspectorPaneController
            .getDrawSelectionButtonSettings(this.getPaneParams());
        if (settings.disabled) return;

        this.paneEvents.dispatchEvent({ type: 'click-drawSelection' });
    }

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<LabelSelectionInspectorPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            selection: LabelSelectionSelectionPaneController.FACTORY_PARAMS.inputtedData,
            relations: LabelSelectionRelationsPaneController.FACTORY_PARAMS.inputtedData,
            descriptors: LabelSelectionDescriptorsPaneController.FACTORY_PARAMS.inputtedData,
        },
        computedData: {
            selection: LabelSelectionSelectionPaneController.FACTORY_PARAMS.computedData,
            relations: LabelSelectionRelationsPaneController.FACTORY_PARAMS.computedData,
            descriptors: LabelSelectionDescriptorsPaneController.FACTORY_PARAMS.computedData,
        },
        settings: {
            disabled: false,
            hidden: false,
            drawSelectionActive: false,
            disableInstanceInput: false,
        },
    };

    /**
     * @type {PaneControllerDataMapper<
     * LabelSelectionInspectorPaneControllerParams,
     * LabelSelectionSelectionPaneControllerParams>}
     */
    static #selectionDataMapper = new PaneControllerDataMapper({
        outerToInner: {
            inputtedData: (outerInputted) => outerInputted.selection,
            internalData: (outerInternal) => outerInternal,
            computedData: (outer) => outer.computedData.selection,
            settings: (outer) => ({
                disabled: outer.settings.disabled,
                hidden: outer.settings.hidden,
            }),
        },
        innerToOuter: {
            inputtedData: (innerInputted) => ({ selection: innerInputted }),
        },
    });

    /**
     * @type {PaneControllerDataMapper<
     * LabelSelectionInspectorPaneControllerParams,
     * LabelSelectionRelationsPaneControllerParams>}
     */
    static #relationsDataMapper = new PaneControllerDataMapper({
        outerToInner: {
            inputtedData: (outerInputted) => outerInputted.relations,
            internalData: (outerInternal) => outerInternal,
            computedData: (outer) => outer.computedData.relations,
            settings: (outer) => ({
                disabled: outer.settings.disabled,
                hidden: outer.settings.hidden,
                disableInstanceInput: outer.settings.disableInstanceInput,
            }),
        },
        innerToOuter: {
            inputtedData: (innerInputted) => ({ relations: innerInputted }),
        },
    });

    /**
     * @type {PaneControllerDataMapper<
     * LabelSelectionInspectorPaneControllerParams,
     * LabelSelectionDescriptorsPaneControllerParams>}
     */
    static #descriptorsDataMapper = new PaneControllerDataMapper({
        outerToInner: {
            inputtedData: (outerInputted) => outerInputted.descriptors,
            internalData: (outerInternal) => outerInternal ?? {},
            computedData: (outer) => outer.computedData.descriptors,
            settings: (outer) => ({
                disabled: outer.settings.disabled,
                hidden: outer.settings.hidden,
            }),
        },
        innerToOuter: {
            inputtedData: (innerInputted) => ({ descriptors: innerInputted }),
        },
    });

    /**
     * Obtains the settings for the draw selection button.
     * 
     * @param {Immutable<LabelSelectionInspectorPaneElementParams>} paneParams
     * The parameters of the pane.
     * @returns {{ title: string, disabled: boolean, hidden: boolean }} The requested settings.
     */
    static getDrawSelectionButtonSettings({ settings: { disabled, hidden } }) {
        return {
            title: 'D',
            disabled: disabled,
            hidden: hidden,
        };
    }

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link LabelSelectionInspectorPaneElementParams}.
     * 
     * @returns {PaneElementFactory<LabelSelectionInspectorPaneElementParams,
     * LabelSelectionInspectorPaneControllerEventMap>}
     * The resulting pane element factory.
     */
    static elementFactory() {
        /**
         * @type {PaneElementFactoryBuilder<LabelSelectionInspectorPaneElementParams,
         * LabelSelectionInspectorPaneControllerEventMap>}
         */
        const builder = new PaneElementFactoryBuilder(this.FACTORY_PARAMS, ['click-drawSelection']);

        return builder.sequential([
            builder.tableRow([
                {
                    factory: builder.mapped(
                        LabelSelectionSelectionPaneController.elementFactory({
                            nullText: '(New selection)',
                        }),
                        this.#selectionDataMapper.paramsMapper(),
                        builder.identityEventMapper(),
                    ),
                    // The default width would otherwise be the full width of the row
                    options: { minWidth: '128px' },
                },
                {
                    factory: builder.button({
                        options: (paneParams) => this.getDrawSelectionButtonSettings(paneParams),
                        modifyHTML: (element, { settings: { drawSelectionActive } }) => {
                            if (element instanceof HTMLDivElement) {
                                element.style.marginTop = '0';
                            } else {
                                console.warn('Unexpected type of cell container');
                            }

                            const [buttonElem] = element.getElementsByTagName('button');
                            if (buttonElem === undefined) {
                                throw new Error('Cannot find button');
                            }

                            buttonElem.title = 'Toggle Draw Mode';
                            buttonElem.style.backgroundColor = drawSelectionActive ? 'skyblue' : '';
                        },
                        eventHandlers: {
                            click: (paneElem) => paneElem.dispatchEvent({ type: 'click-drawSelection' }),
                        },
                    }),
                    options: { width: '24px' },
                },
            ], {
                options: ({ settings: { disabled, hidden } }) => ({
                    label: 'Select item to inspect:',
                    disabled: disabled,
                    hidden: hidden,
                }),
            }),
            builder.separator({
                options: ({ settings: { disabled, hidden } }) => ({ disabled, hidden }),
            }),
            builder.folder(
                builder.mapped(
                    LabelSelectionRelationsPaneController.elementFactory(),
                    this.#relationsDataMapper.paramsMapper(),
                    builder.identityEventMapper(),
                ),
                {
                    options: ({ settings: { disabled, hidden } }) => ({
                        title: 'Relationships',
                        disabled: disabled,
                        hidden: hidden,
                    }),
                },
            ),
            builder.folder(
                builder.mapped(
                    LabelSelectionDescriptorsPaneController.elementFactory(),
                    this.#descriptorsDataMapper.paramsMapper(),
                    builder.identityEventMapper(),
                ),
                {
                    options: ({ settings: { disabled, hidden } }) => ({
                        title: 'Descriptors',
                        disabled: disabled,
                        hidden: hidden,
                    }),
                },
            ),
        ]);
    }

    /**
     * Data processor to pass into {@link PaneController}.
     * 
     * @type {PaneControllerDataProcessor<LabelSelectionInspectorPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => {
            const selectionComputedData = LabelSelectionSelectionPaneController.DATA_PROCESSOR
                .computeData(
                    this.#selectionDataMapper.outerToInner.inputtedData(inputtedData),
                    this.#selectionDataMapper.outerToInner.internalData(internalData),
                );

            const relationsComputedData = LabelSelectionRelationsPaneController.DATA_PROCESSOR
                .computeData(
                    this.#relationsDataMapper.outerToInner.inputtedData(inputtedData),
                    this.#relationsDataMapper.outerToInner.internalData(internalData),
                );

            const descriptorsComputedData = LabelSelectionDescriptorsPaneController.DATA_PROCESSOR
                .computeData(
                    this.#descriptorsDataMapper.outerToInner.inputtedData(inputtedData),
                    this.#descriptorsDataMapper.outerToInner.internalData(internalData),
                );

            return {
                selection: selectionComputedData,
                relations: relationsComputedData,
                descriptors: descriptorsComputedData,
            };
        },
        outputData: (paneParams) => {
            const { selectionId } = LabelSelectionSelectionPaneController.DATA_PROCESSOR
                .outputData(this.#selectionDataMapper.paramsMapper().outerToInner(paneParams));

            const { instanceId, classId } = LabelSelectionRelationsPaneController.DATA_PROCESSOR
                .outputData(this.#relationsDataMapper.paramsMapper().outerToInner(paneParams));

            const { distinctiveLv, occlusionLv } = LabelSelectionDescriptorsPaneController.DATA_PROCESSOR
                .outputData(this.#descriptorsDataMapper.paramsMapper().outerToInner(paneParams));

            return {
                selectionId,
                instanceId,
                classId,
                distinctiveLv,
                occlusionLv,
            };
        },
    };

    /**
     * Creates a new UI to inspect a {@link ReadonlyLabelSelection}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<LabelSelectionInspectorPaneControllerState>} initialState
     * The initial state to set.
     * @returns {LabelSelectionInspectorPaneController} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new LabelSelectionInspectorPaneController(
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
