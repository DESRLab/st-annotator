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
 * @typedef {import('../data').PointCloud} PointCloud
 */
/* eslint-enable max-len */

/**
 * @typedef {object} PointCloudSettingsInputtedData
 * @property {boolean} removeBackground If `true`, mask out points that represent the
 * background; otherwise, `false`.
 * @property {boolean} cropArea If `true`, mask out points that are not within the
 * area of interest; otherwise, `false`.
 * @property {number} pointSize The size of the points in the point cloud to display.
 * @property {ColorBlenderPaneControllerParams['inputtedData']} blender
 * Specifies the {@link ColorBlender} to apply.
 */

/**
 * @typedef {object} PointCloudSettingsComputedData
 * @property {ColorBlenderPaneControllerParams['computedData']} blender
 * Specifies the {@link ColorBlender} to apply.
 */

/**
 * @typedef {object} PointCloudSettingsPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 */

/**
 * @typedef {object} PointCloudSettings
 * @property {boolean} removeBackground If `true`, mask out points that represent the
 * background; otherwise, `false`.
 * @property {boolean} cropArea If `true`, mask out points that are not within the
 * area of interest; otherwise, `false`.
 * @property {number} pointSize The size of the points in the point cloud to display.
 * @property {?ColorBlender} blender The color blender to apply.
 */

/**
 * @typedef {{
 *     inputtedData: PointCloudSettingsInputtedData;
 *     computedData: PointCloudSettingsComputedData;
 *     settings: PointCloudSettingsPaneSettings;
 *     internalData: ?PointCloud;
 *     outputData: PointCloudSettings;
 * }} PointCloudSettingsPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<PointCloudSettingsPaneControllerParams>
 * } PointCloudSettingsPaneElementParams
 */

/**
 * @typedef {PaneControllerState<PointCloudSettingsPaneControllerParams>
 * } PointCloudSettingsPaneControllerState
 */

/**
 * Represents a UI to configure the settings for a {@link PointCloud}.
 * 
 * @augments PaneController<PointCloudSettingsPaneControllerParams>
 */
export class PointCloudSettingsPaneController extends PaneController {

    /**
     * Toggles the remove background checkbox.
     * 
     * This is a no-op if the checkbox is disabled.
     */
    toggleRemoveBackground() {
        const settings = PointCloudSettingsPaneController
            .getRemoveBackgroundCheckboxSettings(this.getPaneParams());
        if (settings.disabled) return;

        this.updateInputtedData({ removeBackground: !this.inputtedData.removeBackground });

        this.notifyChange();
    }

    /**
     * Toggles the crop area checkbox.
     * 
     * This is a no-op if the checkbox is disabled.
     */
    toggleCropArea() {
        const settings = PointCloudSettingsPaneController
            .getCropAreaCheckboxSettings(this.getPaneParams());
        if (settings.disabled) return;

        this.updateInputtedData({ cropArea: !this.inputtedData.cropArea });

        this.notifyChange();
    }

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<PointCloudSettingsPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            removeBackground: true,
            cropArea: true,
            pointSize: 2,
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
     * PointCloudSettingsPaneControllerParams,
     * ColorBlenderPaneControllerParams>}
     */
    static #colorBlenderDataMapper = new PaneControllerDataMapper({
        outerToInner: {
            inputtedData: (outerInputted) => outerInputted.blender,
            internalData: (outerInternal) => TypeUtils.immutable((outerInternal == null) ? null : {
                buffer: outerInternal.buffer,
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
     * Obtains the settings for the remove background checkbox.
     * 
     * @param {Immutable<PointCloudSettingsPaneElementParams>} paneParams
     * The parameters of the pane.
     * @returns {{ label: string, disabled: boolean, hidden: boolean }} The requested settings.
     */
    static getRemoveBackgroundCheckboxSettings({ settings: { disabled, hidden } }) {
        return {
            label: 'RemoveBG',
            disabled: disabled,
            hidden: hidden,
        };
    }

    /**
     * Obtains the settings for the crop area checkbox.
     * 
     * @param {Immutable<PointCloudSettingsPaneElementParams>} paneParams
     * The parameters of the pane.
     * @returns {{ label: string, disabled: boolean, hidden: boolean }} The requested settings.
     */
    static getCropAreaCheckboxSettings({ settings: { disabled, hidden } }) {
        return {
            label: 'CropArea',
            disabled: disabled,
            hidden: hidden,
        };
    }

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link PointCloudSettingsPaneElementParams}.
     * 
     * @returns {PaneElementFactory<PointCloudSettingsPaneElementParams>}
     * The resulting pane element factory.
     */
    static elementFactory() {
        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        return builder.sequential([
            builder.input(['inputtedData', 'removeBackground'], {
                options: (paneParams) => this.getRemoveBackgroundCheckboxSettings(paneParams),
            }),
            builder.input(['inputtedData', 'cropArea'], {
                options: (paneParams) => this.getCropAreaCheckboxSettings(paneParams),
            }),
            builder.input(['inputtedData', 'pointSize'], {
                options: ({ settings: { disabled, hidden } }) => ({
                    label: 'Point Size',
                    min: 0,
                    max: 4,
                    step: 0.1,
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
     * @type {PaneControllerDataProcessor<PointCloudSettingsPaneControllerParams>}
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
            const { inputtedData: { removeBackground, cropArea, pointSize } } = paneParams;

            const blender = ColorBlenderPaneController.DATA_PROCESSOR
                .outputData(this.#colorBlenderDataMapper.paramsMapper().outerToInner(paneParams));

            return { removeBackground, cropArea, pointSize, blender };
        },
    };

    /**
     * Creates a new UI to configure the settings for a {@link PointCloud}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<PointCloudSettingsPaneControllerState>} initialState
     * The initial state to set.
     * @returns {PointCloudSettingsPaneController} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new PointCloudSettingsPaneController(
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
