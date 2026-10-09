import { Pane } from 'tweakpane';

import { PaneController, PaneControllerDataMapper, PaneElementFactoryBuilder } from 'sta/services/editor/base';

import { LabelBoxDescriptorsPaneController } from './LabelBoxDescriptorsPane';
import { LabelBoxGeometryPaneController } from './LabelBoxGeometryPane';
import { LabelBoxSelectionPaneController } from './LabelBoxSelectionPane';
import { LabelBoxRelationsPaneController } from './LabelBoxRelationsPane';

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
 * @typedef {import('../../../../label/lib').BoxType} BoxType
 */

/**
 * @typedef {import('../../../../label/lib').DistinctiveLevel} DistinctiveLevel
 */

/**
 * @typedef {import('../../../../label/lib').OcclusionLevel} OcclusionLevel
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
 * @typedef {import('../data').ReadonlyBBoxIndex} ReadonlyBBoxIndex
 */

/**
 * @typedef {import('../data').UUID} UUID
 */

/**
 * @typedef {import('./LabelBoxDescriptorsPane').LabelBoxDescriptorsPaneControllerParams} LabelBoxDescriptorsPaneControllerParams
 */

/**
 * @typedef {import('./LabelBoxGeometryPane').LabelBoxGeometryPaneControllerParams} LabelBoxGeometryPaneControllerParams
 */

/**
 * @typedef {import('./LabelBoxRelationsPane').LabelBoxRelationsPaneControllerParams} LabelBoxRelationsPaneControllerParams
 */

/**
 * @typedef {import('./LabelBoxSelectionPane').LabelBoxSelectionPaneControllerParams} LabelBoxSelectionPaneControllerParams
 */
/* eslint-enable max-len */

/**
 * @typedef {object} LabelBoxInspectorInputtedData
 * @property {LabelBoxSelectionPaneControllerParams['inputtedData']} selection
 * Specifies the {@link LabelBoxSelection} representing the selected bounding box.
 * @property {LabelBoxGeometryPaneControllerParams['inputtedData']} geometry
 * Specifies the {@link LabelBoxGeometry} representing the geometry of the bounding box.
 * @property {LabelBoxRelationsPaneControllerParams['inputtedData']} relations
 * Specifies the {@link LabelBoxRelations} representing the relationships of the bounding box.
 * @property {LabelBoxDescriptorsPaneControllerParams['inputtedData']} descriptors
 * Specifies the {@link LabelBoxDescriptors} representing the descriptors of the bounding box.
 */

/**
 * @typedef {object} LabelBoxInspectorComputedData
 * @property {LabelBoxSelectionPaneControllerParams['computedData']} selection
 * Specifies the {@link LabelBoxSelection} representing the selected bounding box.
 * @property {LabelBoxGeometryPaneControllerParams['computedData']} geometry
 * Specifies the {@link LabelBoxGeometry} representing the geometry of the bounding box.
 * @property {LabelBoxRelationsPaneControllerParams['computedData']} relations
 * Specifies the {@link LabelBoxRelations} representing the relationships of the bounding box.
 * @property {LabelBoxDescriptorsPaneControllerParams['computedData']} descriptors
 * Specifies the {@link LabelBoxDescriptors} representing the descriptors of the bounding box.
 */

/**
 * @typedef {object} LabelBoxInspectorPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 * @property {boolean} drawBoxActive `true` if draw mode is active; otherwise, `false`.
 * @property {boolean} disableTransform `true` if direct manipulation of the box's transform
 * through the pane is disabled; otherwise, the default behaviour of `disabled` is applied.
 * @property {boolean} disableTrackInput `true` if the track selector is forced to be
 * disabled; otherwise, the default behaviour of `disabled` is applied.
 */

/**
 * @typedef {object} LabelBoxInspectorSource
 * @property {ReadonlyMap<UUID, ReadonlyLabelBox>} boxes Indexes each bounding box that
 * can be selected from by its unique identifier.
 * @property {ReadonlyMap<UUID, ReadonlyLabelTrack>} tracks Indexes each object track that
 * can be selected from by its unique identifier.
 * @property {ReadonlyMap<number, ReadonlyLabelClass>} classes Indexes each object class that
 * can be selected from by its unique identifier.
 */

/**
 * @typedef {object} LabelBoxParams
 * @property {?UUID} boxId The unique identifier of the selected bounding box,
 * or `null` if none is selected.
 * @property {BoxType} boxType Indicates the type of bounding box.
 * @property {Immutable<THREE.Vector3>} center The position vector of the bounding box in the
 * coordinate system of the database.
 * @property {Immutable<THREE.Vector3>} size The size vector of the bounding box in the
 * coordinate system of the database.
 * @property {number} angle The rotation of the bounding box about the vertical axis.
 * @property {?UUID} trackId The unique identifier of the associated object track,
 * or `null` if none is selected.
 * @property {?number} classId The unique identifier of the associated object class,
 * or `null` if none is associated.
 * @property {DistinctiveLevel} distinctiveLv The distinctiveness level of the represented object.
 * @property {OcclusionLevel} occlusionLv The occlusion level of the represented object.
 */

/**
 * @typedef {{
 *     inputtedData: LabelBoxInspectorInputtedData;
 *     computedData: LabelBoxInspectorComputedData;
 *     settings: LabelBoxInspectorPaneSettings;
 *     internalData: ?LabelBoxInspectorSource;
 *     outputData: LabelBoxParams;
 * }} LabelBoxInspectorPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<LabelBoxInspectorPaneControllerParams>
 * } LabelBoxInspectorPaneElementParams
 */

/**
 * @typedef {PaneControllerState<LabelBoxInspectorPaneControllerParams>
 * } LabelBoxInspectorPaneControllerState
 */

/**
 * Defines each event that can be dispatched by {@link LabelBoxInspectorPaneController}.
 * 
 * @typedef {object} LabelBoxInspectorPaneControllerEventMap
 * @property {{}} click-drawBox The event when the draw box button is clicked.
 */

/**
 * Represents a UI to inspect a {@link ReadonlyLabelBox}.
 * 
 * @augments {PaneController<LabelBoxInspectorPaneControllerParams,
 * LabelBoxInspectorPaneControllerEventMap>}
 */
export class LabelBoxInspectorPaneController extends PaneController {

    /**
     * Clicks on the draw box button.
     * 
     * This is a no-op if the button is disabled.
     */
    clickDrawBox() {
        const settings = LabelBoxInspectorPaneController
            .getDrawBoxButtonSettings(this.getPaneParams());
        if (settings.disabled) return;

        this.paneEvents.dispatchEvent({ type: 'click-drawBox' });
    }

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<LabelBoxInspectorPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            selection: LabelBoxSelectionPaneController.FACTORY_PARAMS.inputtedData,
            geometry: LabelBoxGeometryPaneController.FACTORY_PARAMS.inputtedData,
            relations: LabelBoxRelationsPaneController.FACTORY_PARAMS.inputtedData,
            descriptors: LabelBoxDescriptorsPaneController.FACTORY_PARAMS.inputtedData,
        },
        computedData: {
            selection: LabelBoxSelectionPaneController.FACTORY_PARAMS.computedData,
            geometry: LabelBoxGeometryPaneController.FACTORY_PARAMS.computedData,
            relations: LabelBoxRelationsPaneController.FACTORY_PARAMS.computedData,
            descriptors: LabelBoxDescriptorsPaneController.FACTORY_PARAMS.computedData,
        },
        settings: {
            disabled: false,
            hidden: false,
            drawBoxActive: false,
            disableTransform: false,
            disableTrackInput: false,
        },
    };

    /**
     * @type {PaneControllerDataMapper<
     * LabelBoxInspectorPaneControllerParams,
     * LabelBoxSelectionPaneControllerParams>}
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
     * LabelBoxInspectorPaneControllerParams,
     * LabelBoxGeometryPaneControllerParams>}
     */
    static #geometryDataMapper = new PaneControllerDataMapper({
        outerToInner: {
            inputtedData: (outerInputted) => outerInputted.geometry,
            internalData: (outerInternal) => outerInternal ?? {},
            computedData: (outer) => outer.computedData.geometry,
            settings: (outer) => ({
                disabled: outer.settings.disabled,
                hidden: outer.settings.hidden,
                disableTransform: outer.settings.disableTransform,
            }),
        },
        innerToOuter: {
            inputtedData: (innerInputted) => ({ geometry: innerInputted }),
        },
    });

    /**
     * @type {PaneControllerDataMapper<
     * LabelBoxInspectorPaneControllerParams,
     * LabelBoxRelationsPaneControllerParams>}
     */
    static #relationsDataMapper = new PaneControllerDataMapper({
        outerToInner: {
            inputtedData: (outerInputted) => outerInputted.relations,
            internalData: (outerInternal) => outerInternal,
            computedData: (outer) => outer.computedData.relations,
            settings: (outer) => ({
                disabled: outer.settings.disabled,
                hidden: outer.settings.hidden,
                disableTrackInput: outer.settings.disableTrackInput,
            }),
        },
        innerToOuter: {
            inputtedData: (innerInputted) => ({ relations: innerInputted }),
        },
    });

    /**
     * @type {PaneControllerDataMapper<
     * LabelBoxInspectorPaneControllerParams,
     * LabelBoxDescriptorsPaneControllerParams>}
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
     * Obtains the settings for the draw box button.
     * 
     * @param {Immutable<LabelBoxInspectorPaneElementParams>} paneParams
     * The parameters of the pane.
     * @returns {{ title: string, disabled: boolean, hidden: boolean }} The requested settings.
     */
    static getDrawBoxButtonSettings({ settings: { disabled, hidden } }) {
        return {
            title: 'D',
            disabled: disabled,
            hidden: hidden,
        };
    }

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link LabelBoxInspectorPaneElementParams}.
     * 
     * @returns {PaneElementFactory<LabelBoxInspectorPaneElementParams,
     * LabelBoxInspectorPaneControllerEventMap>}
     * The resulting pane element factory.
     */
    static elementFactory() {
        /**
         * @type {PaneElementFactoryBuilder<LabelBoxInspectorPaneElementParams,
         * LabelBoxInspectorPaneControllerEventMap>}
         */
        const builder = new PaneElementFactoryBuilder(this.FACTORY_PARAMS, ['click-drawBox']);

        return builder.sequential([
            builder.tableRow([
                {
                    factory: builder.mapped(
                        LabelBoxSelectionPaneController.elementFactory({
                            nullText: '(New box)',
                        }),
                        this.#selectionDataMapper.paramsMapper(),
                        builder.identityEventMapper(),
                    ),
                    // The default width would otherwise be the full width of the row
                    options: { minWidth: '128px' },
                },
                {
                    factory: builder.button({
                        options: (paneParams) => this.getDrawBoxButtonSettings(paneParams),
                        modifyHTML: (element, { settings: { drawBoxActive } }) => {
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
                            buttonElem.style.backgroundColor = drawBoxActive ? 'skyblue' : '';
                        },
                        eventHandlers: {
                            click: (paneElem) => paneElem.dispatchEvent({ type: 'click-drawBox' }),
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
                    LabelBoxGeometryPaneController.elementFactory(),
                    this.#geometryDataMapper.paramsMapper(),
                    builder.identityEventMapper(),
                ),
                {
                    options: ({ settings: { disabled, hidden } }) => ({
                        title: 'Geometry',
                        disabled: disabled,
                        hidden: hidden,
                    }),
                },
            ),
            builder.folder(
                builder.mapped(
                    LabelBoxRelationsPaneController.elementFactory(),
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
                    LabelBoxDescriptorsPaneController.elementFactory(),
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
     * @type {PaneControllerDataProcessor<LabelBoxInspectorPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => {
            const selectionComputedData = LabelBoxSelectionPaneController.DATA_PROCESSOR
                .computeData(
                    this.#selectionDataMapper.outerToInner.inputtedData(inputtedData),
                    this.#selectionDataMapper.outerToInner.internalData(internalData),
                );

            const geometryComputedData = LabelBoxGeometryPaneController.DATA_PROCESSOR
                .computeData(
                    this.#geometryDataMapper.outerToInner.inputtedData(inputtedData),
                    this.#geometryDataMapper.outerToInner.internalData(internalData),
                );

            const relationsComputedData = LabelBoxRelationsPaneController.DATA_PROCESSOR
                .computeData(
                    this.#relationsDataMapper.outerToInner.inputtedData(inputtedData),
                    this.#relationsDataMapper.outerToInner.internalData(internalData),
                );

            const descriptorsComputedData = LabelBoxDescriptorsPaneController.DATA_PROCESSOR
                .computeData(
                    this.#descriptorsDataMapper.outerToInner.inputtedData(inputtedData),
                    this.#descriptorsDataMapper.outerToInner.internalData(internalData),
                );

            return {
                selection: selectionComputedData,
                geometry: geometryComputedData,
                relations: relationsComputedData,
                descriptors: descriptorsComputedData,
            };
        },
        outputData: (paneParams) => {
            const { boxId } = LabelBoxSelectionPaneController.DATA_PROCESSOR
                .outputData(this.#selectionDataMapper.paramsMapper().outerToInner(paneParams));

            const { boxType, center, size, angle } = LabelBoxGeometryPaneController.DATA_PROCESSOR
                .outputData(this.#geometryDataMapper.paramsMapper().outerToInner(paneParams));

            const { trackId, classId } = LabelBoxRelationsPaneController.DATA_PROCESSOR
                .outputData(this.#relationsDataMapper.paramsMapper().outerToInner(paneParams));

            const { distinctiveLv, occlusionLv } = LabelBoxDescriptorsPaneController.DATA_PROCESSOR
                .outputData(this.#descriptorsDataMapper.paramsMapper().outerToInner(paneParams));

            return {
                boxId,
                boxType,
                center,
                size,
                angle,
                trackId,
                classId,
                distinctiveLv,
                occlusionLv,
            };
        },
    };

    /**
     * Creates a new UI to inspect a {@link ReadonlyLabelBox}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<LabelBoxInspectorPaneControllerState>} initialState
     * The initial state to set.
     * @returns {LabelBoxInspectorPaneController} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new LabelBoxInspectorPaneController(
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
