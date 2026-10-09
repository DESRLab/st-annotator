import _ from 'lodash';
import * as THREE from 'three';
import { Pane } from 'tweakpane';

import { PaneController, PaneElementFactoryBuilder } from 'sta/services/editor/base';

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
 * @typedef {import('../data').VectorView} VectorView
 */
/* eslint-enable max-len */

/**
 * @typedef {object} VectorSettingsInputtedData
 * @property {boolean} showTooltips If `true`, displays the tooltip of each bounding box
 * and object track; otherwise, `false`.
 * @property {number} strokeWidth The line width for drawing a vector label.
 * @property {Immutable<THREE.Color>} strokeColor The color style for drawing a vector label.
 * @property {Immutable<THREE.Color>} hoveredVectorColor The color of a bounding box when hovered
 * over.
 * @property {Immutable<THREE.Color>} selectedVectorColor The color of a bounding box when
 * selected.
 */

/**
 * @typedef {object} VectorSettingsPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 */

/**
 * @typedef {object} VectorSettings
 * @property {boolean} showTooltips If `true`, displays the tooltip of each vector object
 * and object track; otherwise, `false`.
 * @property {number} strokeWidth The line width for drawing a vector label.
 * @property {Immutable<THREE.Color>} strokeColor The color style for drawing a vector label.
 * @property {Immutable<THREE.Color>} hoveredVectorColor The color of a vector object when hovered
 * over.
 * @property {Immutable<THREE.Color>} selectedVectorColor The color of a vector object when
 * selected.
 */

/**
 * @typedef {{
 *     inputtedData: VectorSettingsInputtedData;
 *     computedData: {};
 *     settings: VectorSettingsPaneSettings;
 *     internalData: {};
 *     outputData: VectorSettings;
 * }} VectorSettingsPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<VectorSettingsPaneControllerParams>} VectorSettingsPaneElementParams
 */

/**
 * @typedef {PaneControllerState<VectorSettingsPaneControllerParams>
 * } VectorSettingsPaneControllerState
 */

/**
 * Represents a UI to configure the settings for an {@link VectorView}
 * 
 * @augments PaneController<VectorSettingsPaneControllerParams>
 */
export class VectorSettingsPaneController extends PaneController {

    /**
     * Toggles the show tooltips checkbox.
     * 
     * This is a no-op if the checkbox is disabled.
     */
    toggleTooltips() {
        const settings = VectorSettingsPaneController
            .getShowTooltipsCheckboxSettings(this.getPaneParams());
        if (settings.disabled) return;

        this.updateInputtedData({ showTooltips: !this.inputtedData.showTooltips });

        this.notifyChange();
    }

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<VectorSettingsPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            showTooltips: false,
            strokeWidth: 3,
            strokeColor: new THREE.Color('red'),
            hoveredVectorColor: new THREE.Color('red'),
            selectedVectorColor: new THREE.Color('blue'),
        },
        computedData: {},
        settings: {
            disabled: false,
            hidden: false,
        },
    };

    /**
     * Obtains the settings for the show tooltips checkbox.
     * 
     * @param {Immutable<VectorSettingsPaneElementParams>} paneParams
     * The parameters of the pane.
     * @returns {{ label: string, disabled: boolean, hidden: boolean }} The requested settings.
     */
    static getShowTooltipsCheckboxSettings({ settings: { disabled, hidden } }) {
        return {
            label: 'Show tooltips',
            disabled: disabled,
            hidden: hidden,
        };
    }

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link VectorSettingsPaneElementParams}
     * 
     * @returns {PaneElementFactory<VectorSettingsPaneElementParams>}
     * The resulting pane element factory.
     */
    static elementFactory() {
        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        const STROKE_WIDTH_STEP = 1;

        return builder.sequential([
            builder.input(['inputtedData', 'showTooltips'], {
                options: (paneParams) => this.getShowTooltipsCheckboxSettings(paneParams),
            }),
            builder.separator({
                options: ({ settings: { disabled, hidden } }) => ({ disabled, hidden }),
            }),
            builder.input(['inputtedData', 'strokeWidth'], {
                options: ({ settings: { disabled, hidden } }) => ({
                    label: 'stroke width',
                    min: 1,
                    max: 10,
                    step: STROKE_WIDTH_STEP,
                    disabled: disabled,
                    hidden: hidden,
                }),
            }),
            builder.input(['inputtedData', 'strokeColor'], {
                options: ({ settings: { disabled, hidden } }) => ({
                    color: { alpha: false, type: 'float' },
                    label: 'stroke color',
                    disabled: disabled,
                    hidden: hidden,
                }),
            }),
            builder.separator({
                options: ({ settings: { disabled, hidden } }) => ({ disabled, hidden }),
            }),
            builder.input(['inputtedData', 'hoveredVectorColor'], {
                options: ({ settings: { disabled, hidden } }) => ({
                    color: { alpha: false, type: 'float' },
                    label: 'Hover color',
                    disabled: disabled,
                    hidden: hidden,
                }),
            }),
            builder.input(['inputtedData', 'selectedVectorColor'], {
                options: ({ settings: { disabled, hidden } }) => ({
                    color: { alpha: false, type: 'float' },
                    label: 'Select color',
                    disabled: disabled,
                    hidden: hidden,
                }),
            }),
        ]).withState(({ params: prevParams, state: prevState }, params) => {
            // The color field selection tends to lose the color information [r,g,b] of selected 
            // colors upon chaning color in a different field. by cloning the params we can
            // preserve the state of elements in the pane to solve this issue.

            /**
             * @type {VectorSettingsPaneElementParams}
             */
            const nextParams = _.cloneDeep(params);
            return { params: nextParams, state: prevState };
        }, {});
    }

    /**
     * Data processor to pass into {@link PaneController}
     * 
     * @type {PaneControllerDataProcessor<VectorSettingsPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => ({}),
        outputData: (paneParams) => {
            const {
                inputtedData: {
                    showTooltips,
                    strokeWidth,
                    strokeColor,
                    hoveredVectorColor,
                    selectedVectorColor,
                },
            } = paneParams;

            return {
                showTooltips: showTooltips,
                strokeWidth: strokeWidth,
                strokeColor: strokeColor.clone(),
                hoveredVectorColor: hoveredVectorColor.clone(),
                selectedVectorColor: selectedVectorColor.clone(),
            };
        },
    };

    /**
     * Creates a new UI to configure the settings for an {@link VectorView}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<VectorSettingsPaneControllerState>} initialState
     * The initial state to set.
     * @returns {VectorSettingsPaneController} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new VectorSettingsPaneController(
            () => new Pane({ container: dom }),
            this.elementFactory(),
            this.DATA_PROCESSOR,
            {
                inputtedData: initialState.inputtedData ?? this.FACTORY_PARAMS.inputtedData,
                internalData: initialState.internalData ?? {},
                settings: initialState.settings ?? this.FACTORY_PARAMS.settings,
            },
        );
    }
}
