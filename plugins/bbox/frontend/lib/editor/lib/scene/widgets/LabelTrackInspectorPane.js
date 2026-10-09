import { Pane } from 'tweakpane';

import { PaneController, PaneControllerDataMapper, PaneElementFactoryBuilder } from 'sta/services/editor/base';

import { LabelTrackDescriptorsPaneController } from './LabelTrackDescriptorsPane';
import { LabelTrackSelectionPaneController } from './LabelTrackSelectionPane';
import { LabelTrackRelationsPaneController } from './LabelTrackRelationsPane';

/* eslint-disable max-len */
/**
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
 * @typedef {import('../data').ReadonlyLabelClass} ReadonlyLabelClass
 */

/**
 * @typedef {import('../data').ReadonlyLabelTrack} ReadonlyLabelTrack
 */

/**
 * @typedef {import('../data').ReadonlyBBoxIndex} ReadonlyBBoxIndex
 */

/**
 * @typedef {import('../data').UUID} UUID
 */

/**
 * @typedef {import('./LabelTrackDescriptorsPane').LabelTrackDescriptorsPaneControllerParams} LabelTrackDescriptorsPaneControllerParams
 */

/**
 * @typedef {import('./LabelTrackRelationsPane').LabelTrackRelationsPaneControllerParams} LabelTrackRelationsPaneControllerParams
 */

/**
 * @typedef {import('./LabelTrackSelectionPane').LabelTrackSelectionPaneControllerParams} LabelTrackSelectionPaneControllerParams
 */
/* eslint-enable max-len */

/**
 * @typedef {object} LabelTrackInspectorInputtedData
 * @property {LabelTrackSelectionPaneControllerParams['inputtedData']} selection
 * Specifies the {@link LabelTrackSelection} representing the selected object track.
 * @property {LabelTrackRelationsPaneControllerParams['inputtedData']} relations
 * Specifies the {@link LabelTrackRelations} representing the relationships of the object track.
 * @property {LabelTrackDescriptorsPaneControllerParams['inputtedData']} descriptors
 * Specifies the {@link LabelTrackDescriptors} representing the descriptors of the object track.
 */

/**
 * @typedef {object} LabelTrackInspectorComputedData
 * @property {LabelTrackSelectionPaneControllerParams['computedData']} selection
 * Specifies the {@link LabelTrackSelection} epresenting the selected object track.
 * @property {LabelTrackRelationsPaneControllerParams['computedData']} relations
 * Specifies the {@link LabelTrackRelations} representing the relationships of the object track.
 * @property {LabelTrackDescriptorsPaneControllerParams['computedData']} descriptors
 * Specifies the {@link LabelTrackDescriptors} representing the descriptors of the object track.
 */

/**
 * @typedef {object} LabelTrackInspectorPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 */

/**
 * @typedef {object} LabelTrackInspectorSource
 * @property {ReadonlyMap<UUID, ReadonlyLabelTrack>} tracks Indexes each object track that
 * can be selected from by its unique identifier.
 * @property {ReadonlyMap<number, ReadonlyLabelClass>} classes Indexes each object class that
 * can be selected from by its unique identifier.
 */

/**
 * @typedef {object} LabelTrackParams
 * @property {?UUID} trackId The unique identifier of the selected object track,
 * or `null` if none is selected.
 * @property {?number} classId The unique identifier of the associated object class,
 * or `null` if none is associated.
 * @property {boolean} isBlack If `true`, indicates low reflectivity; otherwise, `false`.
 */

/**
 * @typedef {{
 *     inputtedData: LabelTrackInspectorInputtedData;
 *     computedData: LabelTrackInspectorComputedData;
 *     settings: LabelTrackInspectorPaneSettings;
 *     internalData: ?LabelTrackInspectorSource;
 *     outputData: LabelTrackParams;
 * }} LabelTrackInspectorPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<LabelTrackInspectorPaneControllerParams>
 * } LabelTrackInspectorPaneElementParams
 */

/**
 * @typedef {PaneControllerState<LabelTrackInspectorPaneControllerParams>
 * } LabelTrackInspectorPaneControllerState
 */

/**
 * Defines each event that can be dispatched by {@link LabelTrackInspectorPaneController}.
 * 
 * @typedef {object} LabelTrackInspectorPaneControllerEventMap
 * @property {{}} click-createTrack The event when the create track button is clicked.
 */

/**
 * Represents a UI to inspect a {@link ReadonlyLabelTrack}.
 * 
 * @augments {PaneController<LabelTrackInspectorPaneControllerParams,
 * LabelTrackInspectorPaneControllerEventMap>}
 */
export class LabelTrackInspectorPaneController extends PaneController {

    /**
     * Clicks on the create track button.
     * 
     * This is a no-op if the button is disabled.
     */
    clickCreateTrack() {
        const settings = LabelTrackInspectorPaneController
            .getCreateTrackButtonSettings(this.getPaneParams());
        if (settings.disabled) return;

        this.paneEvents.dispatchEvent({ type: 'click-createTrack' });
    }

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<LabelTrackInspectorPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            selection: LabelTrackSelectionPaneController.FACTORY_PARAMS.inputtedData,
            relations: LabelTrackRelationsPaneController.FACTORY_PARAMS.inputtedData,
            descriptors: LabelTrackDescriptorsPaneController.FACTORY_PARAMS.inputtedData,
        },
        computedData: {
            selection: LabelTrackSelectionPaneController.FACTORY_PARAMS.computedData,
            relations: LabelTrackRelationsPaneController.FACTORY_PARAMS.computedData,
            descriptors: LabelTrackDescriptorsPaneController.FACTORY_PARAMS.computedData,
        },
        settings: {
            disabled: false,
            hidden: false,
        },
    };

    /**
     * @type {PaneControllerDataMapper<
     * LabelTrackInspectorPaneControllerParams,
     * LabelTrackSelectionPaneControllerParams>}
     */
    static #selectionDataMapper = new PaneControllerDataMapper({
        outerToInner: {
            inputtedData: (outerInputted) => outerInputted.selection,
            internalData: (outerInternal) => outerInternal,
            computedData: (outer) => outer.computedData.selection,
            settings: (outer) => outer.settings,
        },
        innerToOuter: {
            inputtedData: (innerInputted) => ({ selection: innerInputted }),
        },
    });

    /**
     * @type {PaneControllerDataMapper<
     * LabelTrackInspectorPaneControllerParams,
     * LabelTrackRelationsPaneControllerParams>}
     */
    static #relationsDataMapper = new PaneControllerDataMapper({
        outerToInner: {
            inputtedData: (outerInputted) => outerInputted.relations,
            internalData: (outerInternal) => outerInternal,
            computedData: (outer) => outer.computedData.relations,
            settings: (outer) => outer.settings,
        },
        innerToOuter: {
            inputtedData: (innerInputted) => ({ relations: innerInputted }),
        },
    });

    /**
     * @type {PaneControllerDataMapper<
     * LabelTrackInspectorPaneControllerParams,
     * LabelTrackDescriptorsPaneControllerParams>}
     */
    static #descriptorsDataMapper = new PaneControllerDataMapper({
        outerToInner: {
            inputtedData: (outerInputted) => outerInputted.descriptors,
            internalData: (outerInternal) => outerInternal ?? {},
            computedData: (outer) => outer.computedData.descriptors,
            settings: (outer) => outer.settings,
        },
        innerToOuter: {
            inputtedData: (innerInputted) => ({ descriptors: innerInputted }),
        },
    });

    /**
     * Obtains the settings for the create track button.
     * 
     * @param {Immutable<LabelTrackInspectorPaneElementParams>} paneParams
     * The parameters of the pane.
     * @returns {{ title: string, disabled: boolean, hidden: boolean }} The requested settings.
     */
    static getCreateTrackButtonSettings({ settings: { disabled, hidden } }) {
        return {
            title: '+',
            disabled: disabled,
            hidden: hidden,
        };
    }

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link LabelTrackInspectorPaneElementParams}.
     * 
     * @returns {PaneElementFactory<LabelTrackInspectorPaneElementParams,
     * LabelTrackInspectorPaneControllerEventMap>}
     * The resulting pane element factory.
     */
    static elementFactory() {
        /**
         * @type {PaneElementFactoryBuilder<LabelTrackInspectorPaneElementParams,
         * LabelTrackInspectorPaneControllerEventMap>}
         */
        const builder = new PaneElementFactoryBuilder(this.FACTORY_PARAMS, ['click-createTrack']);

        return builder.sequential([
            builder.tableRow([
                {
                    factory: builder.mapped(
                        LabelTrackSelectionPaneController.elementFactory({
                            nullText: '(New track)',
                        }),
                        this.#selectionDataMapper.paramsMapper(),
                        builder.identityEventMapper(),
                    ),
                    // The default width would otherwise be the full width of the row
                    options: { minWidth: '128px' },
                },
                {
                    factory: builder.button({
                        options: (paneParams) => this.getCreateTrackButtonSettings(paneParams),
                        modifyHTML: (element, { inputtedData }) => {
                            if (element instanceof HTMLDivElement) {
                                element.style.marginTop = '0';
                            } else {
                                console.warn('Unexpected type of cell container');
                            }

                            const [buttonElem] = element.getElementsByTagName('button');
                            if (buttonElem === undefined) {
                                throw new Error('Cannot find button');
                            }

                            const { trackId } = this.#selectionDataMapper.outerToInner
                                .inputtedData(inputtedData);

                            buttonElem.title = (trackId == null) ? 'Add Track' : 'Clone Track';
                        },
                        eventHandlers: {
                            click: (paneElem) => paneElem.dispatchEvent({
                                type: 'click-createTrack',
                            }),
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
                    LabelTrackRelationsPaneController.elementFactory(),
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
                    LabelTrackDescriptorsPaneController.elementFactory(),
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
     * @type {PaneControllerDataProcessor<LabelTrackInspectorPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => {
            const selectionComputedData = LabelTrackSelectionPaneController.DATA_PROCESSOR
                .computeData(
                    this.#selectionDataMapper.outerToInner.inputtedData(inputtedData),
                    this.#selectionDataMapper.outerToInner.internalData(internalData),
                );

            const relationsComputedData = LabelTrackRelationsPaneController.DATA_PROCESSOR
                .computeData(
                    this.#relationsDataMapper.outerToInner.inputtedData(inputtedData),
                    this.#relationsDataMapper.outerToInner.internalData(internalData),
                );

            const descriptorsComputedData = LabelTrackDescriptorsPaneController.DATA_PROCESSOR
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
            const { trackId } = LabelTrackSelectionPaneController.DATA_PROCESSOR
                .outputData(this.#selectionDataMapper.paramsMapper().outerToInner(paneParams));

            const { classId } = LabelTrackRelationsPaneController.DATA_PROCESSOR
                .outputData(this.#relationsDataMapper.paramsMapper().outerToInner(paneParams));

            const { isBlack } = LabelTrackDescriptorsPaneController.DATA_PROCESSOR
                .outputData(this.#descriptorsDataMapper.paramsMapper().outerToInner(paneParams));

            return { trackId, classId, isBlack };
        },
    };

    /**
     * Creates a new UI to inspect a {@link ReadonlyLabelTrack}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<LabelTrackInspectorPaneControllerState>} initialState
     * The initial state to set.
     * @returns {LabelTrackInspectorPaneController} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new LabelTrackInspectorPaneController(
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
