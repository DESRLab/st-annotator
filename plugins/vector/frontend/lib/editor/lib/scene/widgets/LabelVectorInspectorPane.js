import { Pane } from 'tweakpane';

import { PaneController, PaneControllerDataMapper, PaneElementFactoryBuilder } from 'sta/services/editor/base';

import { LabelVectorSelectionPaneController } from './LabelVectorSelectionPane';
import { LabelVectorRelationsPaneController } from './LabelVectorRelationsPane';

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
 * @typedef {import('../../../../label/lib').VectorType} VectorType
 */

/**
 * @typedef {import('../data').ReadonlyLabelVector} ReadonlyLabelVector
 */

/**
 * @typedef {import('../data').ReadonlyLabelClass} ReadonlyLabelClass
 */

/**
 * @typedef {import('../data').ReadonlyVectorIndex} ReadonlyVectorIndex
 */

/**
 * @typedef {import('../data').UUID} UUID
 */

/**
 * @typedef {import('./LabelVectorRelationsPane').LabelVectorRelationsPaneControllerParams} LabelVectorRelationsPaneControllerParams
 */

/**
 * @typedef {import('./LabelVectorSelectionPane').LabelVectorSelectionPaneControllerParams} LabelVectorSelectionPaneControllerParams
 */
/* eslint-enable max-len */

/**
 * @typedef {object} LabelVectorInspectorInputtedData
 * @property {LabelVectorSelectionPaneControllerParams['inputtedData']} selection
 * Specifies the {@link LabelVectorSelection} representing the selected vector.
 * @property {LabelVectorRelationsPaneControllerParams['inputtedData']} relations 
 * Specifies the {@link LabelVectorRelations} representing the relationships of the vector.
 */

/**
 * @typedef {object} LabelVectorInspectorComputedData
 * @property {LabelVectorSelectionPaneControllerParams['computedData']} selection
 * Specifies the {@link LabelVectorSelection} representing the selected vector.
 * @property {LabelVectorRelationsPaneControllerParams['computedData']} relations 
 * Specifies the {@link LabelVectorRelations} representing the relationships of the vector.
 */

/**
 * @typedef {object} LabelVectorInspectorPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 * @property {boolean} drawVectorActive `true` if draw mode is active; otherwise, `false`.
 * @property {boolean} disableTransform `true` if direct manipulation of the vector's transform
 * through the pane is disabled; otherwise, the default behaviour of `disabled` is applied.
 */

/**
 * @typedef {object} LabelVectorInspectorSource
 * @property {ReadonlyMap<UUID, ReadonlyLabelVector>} vectors Indexes each vector object that
 * can be selected from by its unique identifier.
 * @property {ReadonlyMap<number, ReadonlyLabelClass>} classes Indexes each object class that
 * can be selected from by its unique identifier.
 */

/**
 * @typedef {object} LabelVectorParams 
 * @property {?UUID} vectorId The unique identifier of the selected vector object,
 * or `null` if none is selected.
 * @property {?number} classId The unique identifier of the associated object class,
 * or `null` if none is associated.
 */

/**
 * @typedef {{
 *     inputtedData: LabelVectorInspectorInputtedData;
 *     computedData: LabelVectorInspectorComputedData;
 *     settings: LabelVectorInspectorPaneSettings;
 *     internalData: ?LabelVectorInspectorSource;
 *     outputData: LabelVectorParams;
 * }} LabelVectorInspectorPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<LabelVectorInspectorPaneControllerParams>
 * } LabelVectorInspectorPaneElementParams
 */

/**
 * @typedef {PaneControllerState<LabelVectorInspectorPaneControllerParams>
 * } LabelVectorInspectorPaneControllerState
 */

/**
 * Defines each event that can be dispatched by {@link LabelVectorInspectorPaneController}.
 * 
 * @typedef {object} LabelVectorInspectorPaneControllerEventMap
 * @property {{}} click-drawVector The event when the draw vector button is clicked.
 */

/**
 * Represents a UI to inspect a {@link ReadonlyLabelVector}
 * 
 * @augments {PaneController<LabelVectorInspectorPaneControllerParams,
 * LabelVectorInspectorPaneControllerEventMap>}
 */
export class LabelVectorInspectorPaneController extends PaneController {

    /**
     * Clicks on the draw vector button.
     * 
     * This is a no-op if the button is disabled.
     */
    clickDrawVector() {
        const settings = LabelVectorInspectorPaneController
            .getDrawVectorButtonSettings(this.getPaneParams());
        if (settings.disabled) return;

        this.paneEvents.dispatchEvent({ type: 'click-drawVector' });
    }

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<LabelVectorInspectorPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            selection: LabelVectorSelectionPaneController.FACTORY_PARAMS.inputtedData,
            relations: LabelVectorRelationsPaneController.FACTORY_PARAMS.inputtedData,
        },
        computedData: {
            selection: LabelVectorSelectionPaneController.FACTORY_PARAMS.computedData,
            relations: LabelVectorRelationsPaneController.FACTORY_PARAMS.computedData,
        },
        settings: {
            disabled: false,
            hidden: false,
            drawVectorActive: false,
            disableTransform: false,
        },
    };

    /**
     * @type {PaneControllerDataMapper<
     * LabelVectorInspectorPaneControllerParams,
     * LabelVectorSelectionPaneControllerParams>}
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
     * LabelVectorInspectorPaneControllerParams,
     * LabelVectorRelationsPaneControllerParams>}
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
     * Obtains the settings for the draw vector button.
     * 
     * @param {Immutable<LabelVectorInspectorPaneElementParams>} paneParams
     * The parameters of the pane.
     * @returns {{ title: string, disabled: boolean, hidden: boolean }} The requested settings.
     */
    static getDrawVectorButtonSettings({ settings: { disabled, hidden } }) {
        return {
            title: 'D',
            disabled: disabled,
            hidden: hidden,
        };
    }

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link LabelVectorInspectorPaneElementParams}.
     * 
     * @returns {PaneElementFactory<LabelVectorInspectorPaneElementParams,
     * LabelVectorInspectorPaneControllerEventMap>}
     * The resulting pane element factory.
     */
    static elementFactory() {
        /**
         * @type {PaneElementFactoryBuilder<LabelVectorInspectorPaneElementParams, 
         * LabelVectorInspectorPaneControllerEventMap>}
         */
        const builder = new PaneElementFactoryBuilder(this.FACTORY_PARAMS, ['click-drawVector']);

        return builder.sequential([
            builder.tableRow([
                {
                    factory: builder.mapped(
                        LabelVectorSelectionPaneController.elementFactory({
                            nullText: '(New vector)',
                        }),
                        this.#selectionDataMapper.paramsMapper(),
                        builder.identityEventMapper(),
                    ),
                    options: { minWidth: '128px' },
                },
                {
                    factory: builder.button({
                        options: (paneParams) => this.getDrawVectorButtonSettings(paneParams),
                        modifyHTML: (element, { settings: { drawVectorActive } }) => {
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
                            buttonElem.style.backgroundColor = drawVectorActive ? 'skyblue' : '';
                        },
                        eventHandlers: {
                            click: (paneElem) => paneElem.dispatchEvent({ type: 'click-drawVector' }),
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
                    LabelVectorRelationsPaneController.elementFactory(),
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
        ]);
    }

    /**
     * Data processor to pass into {@link PaneController}.
     * 
     * @type {PaneControllerDataProcessor<LabelVectorInspectorPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => {
            const selectionComputedData = LabelVectorSelectionPaneController.DATA_PROCESSOR
                .computeData(
                    this.#selectionDataMapper.outerToInner.inputtedData(inputtedData),
                    this.#selectionDataMapper.outerToInner.internalData(internalData),
                );

            const relationsComputedData = LabelVectorRelationsPaneController.DATA_PROCESSOR
                .computeData(
                    this.#relationsDataMapper.outerToInner.inputtedData(inputtedData),
                    this.#relationsDataMapper.outerToInner.internalData(internalData),
                );

            return {
                selection: selectionComputedData,
                relations: relationsComputedData,
            };
        },
        outputData: (paneParams) => {
            const { vectorId } = LabelVectorSelectionPaneController.DATA_PROCESSOR
                .outputData(this.#selectionDataMapper.paramsMapper().outerToInner(paneParams));

            const { classId } = LabelVectorRelationsPaneController.DATA_PROCESSOR
                .outputData(this.#relationsDataMapper.paramsMapper().outerToInner(paneParams));

            return { vectorId, classId };
        },
    };

    /**
     * Creates a new UI to inspect a {@link ReadonlyLabelVector}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<LabelVectorInspectorPaneControllerState>} initialState
     * The initial state to set.
     * @returns {LabelVectorInspectorPaneController} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new LabelVectorInspectorPaneController(
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
