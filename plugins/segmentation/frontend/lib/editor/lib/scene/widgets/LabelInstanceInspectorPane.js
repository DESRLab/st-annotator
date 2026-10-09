import { Pane } from 'tweakpane';

import { PaneController, PaneControllerDataMapper, PaneElementFactoryBuilder } from 'sta/services/editor/base';

import { LabelInstanceDescriptorsPaneController } from './LabelInstanceDescriptorsPane';
import { LabelInstanceSelectionPaneController } from './LabelInstanceSelectionPane';
import { LabelInstanceRelationsPaneController } from './LabelInstanceRelationsPane';

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
 * @typedef {import('../data').ReadonlyLabelInstance} ReadonlyLabelInstance
 */

/**
 * @typedef {import('../data').ReadonlySegmentationIndex} ReadonlySegmentationIndex
 */

/**
 * @typedef {import('../data').UUID} UUID
 */

/**
 * @typedef {import('./LabelInstanceDescriptorsPane').LabelInstanceDescriptorsPaneControllerParams} LabelInstanceDescriptorsPaneControllerParams
 */

/**
 * @typedef {import('./LabelInstanceRelationsPane').LabelInstanceRelationsPaneControllerParams} LabelInstanceRelationsPaneControllerParams
 */

/**
 * @typedef {import('./LabelInstanceSelectionPane').LabelInstanceSelectionPaneControllerParams} LabelInstanceSelectionPaneControllerParams
 */

/**
 * @typedef {object} LabelInstanceInspectorInputtedData
 * @property {LabelInstanceSelectionPaneControllerParams['inputtedData']} selection
 * Specifies the {@link LabelInstanceSelection} representing the selected object instance.
 * @property {LabelInstanceRelationsPaneControllerParams['inputtedData']} relations
 * Specifies the {@link LabelInstanceRelations} representing the relationships of the object instance.
 * @property {LabelInstanceDescriptorsPaneControllerParams['inputtedData']} descriptors
 * Specifies the {@link LabelInstanceDescriptors} representing the descriptors of the object instance.
 */

/**
 * @typedef {object} LabelInstanceInspectorComputedData
 * @property {LabelInstanceSelectionPaneControllerParams['computedData']} selection
 * Specifies the {@link LabelInstanceSelection} epresenting the selected object instance.
 * @property {LabelInstanceRelationsPaneControllerParams['computedData']} relations
 * Specifies the {@link LabelInstanceRelations} representing the relationships of the object instance.
 * @property {LabelInstanceDescriptorsPaneControllerParams['computedData']} descriptors
 * Specifies the {@link LabelInstanceDescriptors} representing the descriptors of the object instance.
 */

/**
 * @typedef {object} LabelInstanceInspectorPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 */

/**
 * @typedef {object} LabelInstanceInspectorSource
 * @property {ReadonlyMap<UUID, ReadonlyLabelInstance>} instances Indexes each object instance that
 * can be selected from by its unique identifier.
 * @property {ReadonlyMap<number, ReadonlyLabelClass>} classes Indexes each object class that
 * can be selected from by its unique identifier.
 */

/**
 * @typedef {object} LabelInstanceParams
 * @property {?UUID} instanceId The unique identifier of the selected object instance,
 * or `null` if none is selected.
 * @property {?number} classId The unique identifier of the associated object class,
 * or `null` if none is associated.
 * @property {boolean} isBlack If `true`, indicates low reflectivity; otherwise, `false`.
 */

/**
 * @typedef {{
 *     inputtedData: LabelInstanceInspectorInputtedData;
 *     computedData: LabelInstanceInspectorComputedData;
 *     settings: LabelInstanceInspectorPaneSettings;
 *     internalData: ?LabelInstanceInspectorSource;
 *     outputData: LabelInstanceParams;
 * }} LabelInstanceInspectorPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<LabelInstanceInspectorPaneControllerParams>
 * } LabelInstanceInspectorPaneElementParams
 */

/**
 * @typedef {PaneControllerState<LabelInstanceInspectorPaneControllerParams>
 * } LabelInstanceInspectorPaneControllerState
 */
/* eslint-enable max-len */

/**
 * Defines each event that can be dispatched by {@link LabelInstanceInspectorPaneController}.
 * 
 * @typedef {object} LabelInstanceInspectorPaneControllerEventMap
 * @property {{}} click-createInstance The event when the create instance button is clicked.
 */

/**
 * Represents a UI to inspect a {@link ReadonlyLabelInstance}.
 * 
 * @augments {PaneController<LabelInstanceInspectorPaneControllerParams,
 * LabelInstanceInspectorPaneControllerEventMap>}
 */
export class LabelInstanceInspectorPaneController extends PaneController {

    /**
     * Clicks on the create instance button.
     * 
     * This is a no-op if the button is disabled.
     */
    clickCreateInstance() {
        const settings = LabelInstanceInspectorPaneController
            .getCreateInstanceButtonSettings(this.getPaneParams());
        if (settings.disabled) return;

        this.paneEvents.dispatchEvent({ type: 'click-createInstance' });
    }

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<LabelInstanceInspectorPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            selection: LabelInstanceSelectionPaneController.FACTORY_PARAMS.inputtedData,
            relations: LabelInstanceRelationsPaneController.FACTORY_PARAMS.inputtedData,
            descriptors: LabelInstanceDescriptorsPaneController.FACTORY_PARAMS.inputtedData,
        },
        computedData: {
            selection: LabelInstanceSelectionPaneController.FACTORY_PARAMS.computedData,
            relations: LabelInstanceRelationsPaneController.FACTORY_PARAMS.computedData,
            descriptors: LabelInstanceDescriptorsPaneController.FACTORY_PARAMS.computedData,
        },
        settings: {
            disabled: false,
            hidden: false,
        },
    };

    /**
     * @type {PaneControllerDataMapper<
     * LabelInstanceInspectorPaneControllerParams,
     * LabelInstanceSelectionPaneControllerParams>}
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
     * LabelInstanceInspectorPaneControllerParams,
     * LabelInstanceRelationsPaneControllerParams>}
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
     * LabelInstanceInspectorPaneControllerParams,
     * LabelInstanceDescriptorsPaneControllerParams>}
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
     * Obtains the settings for the create instance button.
     * 
     * @param {Immutable<LabelInstanceInspectorPaneElementParams>} paneParams
     * The parameters of the pane.
     * @returns {{ title: string, disabled: boolean, hidden: boolean }} The requested settings.
     */
    static getCreateInstanceButtonSettings({ settings: { disabled, hidden } }) {
        return {
            title: '+',
            disabled: disabled,
            hidden: hidden,
        };
    }

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link LabelInstanceInspectorPaneElementParams}.
     * 
     * @returns {PaneElementFactory<LabelInstanceInspectorPaneElementParams, 
     * LabelInstanceInspectorPaneControllerEventMap>}
     * The resulting pane element factory.
     */
    static elementFactory() {
        /**
         * @type {PaneElementFactoryBuilder<LabelInstanceInspectorPaneElementParams,
         * LabelInstanceInspectorPaneControllerEventMap>}
         */
        const builder = new PaneElementFactoryBuilder(this.FACTORY_PARAMS, ['click-createInstance']);

        return builder.sequential([
            builder.tableRow([
                {
                    factory: builder.mapped(
                        LabelInstanceSelectionPaneController.elementFactory({
                            nullText: '(New instance)',
                        }),
                        this.#selectionDataMapper.paramsMapper(),
                        builder.identityEventMapper(),
                    ),
                    // The default width would otherwise be the full width of the row
                    options: { minWidth: '128px' },
                },
                {
                    factory: builder.button({
                        options: (paneParams) => this.getCreateInstanceButtonSettings(paneParams),
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

                            const { instanceId } = this.#selectionDataMapper.outerToInner
                                .inputtedData(inputtedData);

                            buttonElem.title = (instanceId == null) ? 'Add Instance' : 'Clone Instance';
                        },
                        eventHandlers: {
                            click: (paneElem) => paneElem.dispatchEvent({
                                type: 'click-createInstance',
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
                    LabelInstanceRelationsPaneController.elementFactory(),
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
                    LabelInstanceDescriptorsPaneController.elementFactory(),
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
     * @type {PaneControllerDataProcessor<LabelInstanceInspectorPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => {
            const selectionComputedData = LabelInstanceSelectionPaneController.DATA_PROCESSOR
                .computeData(
                    this.#selectionDataMapper.outerToInner.inputtedData(inputtedData),
                    this.#selectionDataMapper.outerToInner.internalData(internalData),
                );

            const relationsComputedData = LabelInstanceRelationsPaneController.DATA_PROCESSOR
                .computeData(
                    this.#relationsDataMapper.outerToInner.inputtedData(inputtedData),
                    this.#relationsDataMapper.outerToInner.internalData(internalData),
                );

            const descriptorsComputedData = LabelInstanceDescriptorsPaneController.DATA_PROCESSOR
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
            const { instanceId } = LabelInstanceSelectionPaneController.DATA_PROCESSOR
                .outputData(this.#selectionDataMapper.paramsMapper().outerToInner(paneParams));

            const { classId } = LabelInstanceRelationsPaneController.DATA_PROCESSOR
                .outputData(this.#relationsDataMapper.paramsMapper().outerToInner(paneParams));

            const { isBlack } = LabelInstanceDescriptorsPaneController.DATA_PROCESSOR
                .outputData(this.#descriptorsDataMapper.paramsMapper().outerToInner(paneParams));

            return { instanceId, classId, isBlack };
        },
    };

    /**
     * Creates a new UI to inspect a {@link ReadonlyLabelInstance}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<LabelInstanceInspectorPaneControllerState>} initialState
     * The initial state to set.
     * @returns {LabelInstanceInspectorPaneController} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new LabelInstanceInspectorPaneController(
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
