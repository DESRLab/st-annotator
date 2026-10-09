import { Pane } from 'tweakpane';

import { TypeUtils } from 'sta/common/utils';
import { PaneController, PaneControllerDataMapper, PaneElementFactoryBuilder } from 'sta/services/editor/base';
import { ColorBlenderPane } from 'sta/services/editor/core';

const ColorBlenderPaneController = ColorBlenderPane.ColorBlenderPaneController;

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
 * @typedef {import('sta/services/editor/core').ColorBlender} ColorBlender
 */

/**
 * @typedef {import('sta/services/editor/core').ColorBlenderPane.ColorBlenderPaneControllerParams} ColorBlenderPaneControllerParams
 */

/**
 * @typedef {import('../data').GroundMesh} GroundMesh
 */
/* eslint-enable max-len */

/**
 * @typedef {object} GroundMeshSettingsInputtedData
 * @property {boolean} showWireframe If `true`, displays the wireframe of the ground mesh;
 * otherwise, `false`.
 * @property {number} opacity The opacity applied to the ground mesh.
 * @property {ColorBlenderPaneControllerParams['inputtedData']} blender
 * Specifies the {@link ColorBlender} to apply.
 */

/**
 * @typedef {object} GroundMeshSettingsComputedData
 * @property {ColorBlenderPaneControllerParams['computedData']} blender
 * Specifies the {@link ColorBlender} to apply.
 */

/**
 * @typedef {object} GroundMeshSettingsPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 */

/**
 * @typedef {object} GroundMeshSettings
 * @property {boolean} showWireframe If `true`, displays the wireframe of the ground mesh;
 * otherwise, `false`.
 * @property {number} opacity The opacity applied to the ground mesh.
 * @property {?ColorBlender} blender The color blender to apply.
 */

/**
 * @typedef {{
 *     inputtedData: GroundMeshSettingsInputtedData;
 *     computedData: GroundMeshSettingsComputedData;
 *     settings: GroundMeshSettingsPaneSettings;
 *     internalData: ?GroundMesh;
 *     outputData: GroundMeshSettings;
 * }} GroundMeshSettingsPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<GroundMeshSettingsPaneControllerParams>
 * } GroundMeshSettingsPaneElementParams
 */

/**
 * @typedef {PaneControllerState<GroundMeshSettingsPaneControllerParams>
 * } GroundMeshSettingsPaneControllerState
 */

/**
 * Represents a UI to configure the settings for a {@link GroundMesh}.
 * 
 * @augments PaneController<GroundMeshSettingsPaneControllerParams>
 */
export class GroundMeshSettingsPaneController extends PaneController {

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<GroundMeshSettingsPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            showWireframe: true,
            opacity: 0.3,
            blender: ColorBlenderPaneController.FACTORY_PARAMS.inputtedData,
        },
        computedData: {
            blender: ColorBlenderPaneController.FACTORY_PARAMS.computedData,
        },
        settings: {
            ...ColorBlenderPaneController.FACTORY_PARAMS.settings,
        },
    };

    /**
     * @type {PaneControllerDataMapper<
     * GroundMeshSettingsPaneControllerParams,
     * ColorBlenderPaneControllerParams>}
     */
    static #colorBlenderDataMapper = new PaneControllerDataMapper({
        outerToInner: {
            inputtedData: (outerInputted) => outerInputted.blender,
            internalData: (outerInternal) => TypeUtils.immutable((outerInternal == null) ? null : {
                buffer: outerInternal.verticesBuffer,
                channelNames: outerInternal.channelNames,
            }),
            computedData: (outer) => outer.computedData.blender,
            settings: (outer) => outer.settings,
        },
        innerToOuter: {
            inputtedData: (innerInputted) => ({ blender: innerInputted }),
        },
    });

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link GroundMeshSettingsPaneElementParams}.
     * 
     * @returns {PaneElementFactory<GroundMeshSettingsPaneElementParams>}
     * The resulting pane element factory.
     */
    static elementFactory() {
        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        return builder.sequential([
            builder.input(['inputtedData', 'showWireframe'], {
                options: ({ settings: { disabled, hidden } }) => ({
                    label: 'Show Wireframe',
                    disabled: disabled,
                    hidden: hidden,
                }),
            }),
            builder.input(['inputtedData', 'opacity'], {
                options: ({ settings: { disabled, hidden } }) => ({
                    label: 'Opacity',
                    min: 0,
                    max: 1,
                    step: 0.01,
                    disabled: disabled,
                    hidden: hidden,
                }),
            }),
            builder.separator({
                options: ({ settings: { disabled, hidden } }) => ({ disabled, hidden }),
            }),
            builder.mapped(
                ColorBlenderPaneController.elementFactory(),
                this.#colorBlenderDataMapper.paramsMapper(),
                builder.identityEventMapper(),
            ),
        ]);
    }

    /**
     * Data processor to pass into {@link PaneController}.
     * 
     * @type {PaneControllerDataProcessor<GroundMeshSettingsPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => {
            const colorBlenderComputedData = ColorBlenderPaneController.DATA_PROCESSOR
                .computeData(
                    this.#colorBlenderDataMapper.outerToInner.inputtedData(inputtedData),
                    this.#colorBlenderDataMapper.outerToInner.internalData(internalData),
                );

            return { blender: colorBlenderComputedData };
        },
        outputData: (paneParams) => {
            const { inputtedData: { showWireframe, opacity } } = paneParams;

            const blender = ColorBlenderPaneController.DATA_PROCESSOR
                .outputData(this.#colorBlenderDataMapper.paramsMapper().outerToInner(paneParams));

            return { showWireframe, opacity, blender };
        },
    };

    /**
     * Creates a new UI to configure the settings for a {@link GroundMesh}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<GroundMeshSettingsPaneControllerState>} initialState
     * The initial state to set.
     * @returns {GroundMeshSettingsPaneController} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new GroundMeshSettingsPaneController(
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
