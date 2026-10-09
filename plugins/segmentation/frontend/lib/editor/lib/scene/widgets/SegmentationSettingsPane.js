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
 * @typedef {import('../data').SegmentationView} SegmentationView
 */
/* eslint-enable max-len */

/**
 * @typedef {object} SegmentationSettingsInputtedData
 * @property {number} timeIdxRange The maximum distance (inclusive, according to time index)
 * from the active frame for which to display the labels.
 * @property {boolean} showTooltips If `true`, displays the tooltip of each selection
 * and object instance; otherwise, `false`.
 * @property {boolean} showPerceivedClass If `true`, displays the color of each bounding box
 * based on their perceived class; otherwise, displays the color based on their ground truth class.
 * @property {number} brushDiameter The diameter of painting brush.
 * @property {number} brushHueStyle The painting brush hue color style.
 * @property {Immutable<THREE.Color>} strokeColor The color style for drawing a vector label.
 * @property {Immutable<THREE.Color>} hoveredSelectionColor The color of a selection when hovered
 * over.
 * @property {Immutable<THREE.Color>} selectedSelectionColor The color of a selection when
 * selected.
 */

/**
 * @typedef {object} SegmentationSettingsPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 * @property {number} maxTimeIdxRange The maximum allowed value of `timeIdxRange`.
 * @property {number} maxBrushDiameter The maximum allowed diameter value.
 * @property {number} maxBrushHueStyle The maximum allowed value of brush hue style.
 */

/**
 * @typedef {object} SegmentationSettings
 * @property {number} timeIdxRange The maximum distance (inclusive, according to time index)
 * from the active frame for which to display the labels.
 * @property {boolean} showTooltips If `true`, displays the tooltip of each selection
 * and object instance; otherwise, `false`.
 * @property {boolean} showPerceivedClass If `true`, displays the color of each bounding box
 * based on their perceived class; otherwise, displays the color based on their ground truth class. 
 * @property {number} brushDiameter The diameter of painting brush.
 * @property {number} brushHueStyle The painting brush hue color style.
 * @property {Immutable<THREE.Color>} strokeColor The color style for drawing a vector label.
 * @property {Immutable<THREE.Color>} hoveredSelectionColor The color of a selection when hovered
 * over.
 * @property {Immutable<THREE.Color>} selectedSelectionColor The color of a selection when
 * selected.
 */

/**
 * @typedef {{
 *     inputtedData: SegmentationSettingsInputtedData;
 *     computedData: {};
 *     settings: SegmentationSettingsPaneSettings;
 *     internalData: {};
 *     outputData: SegmentationSettings;
 * }} SegmentationSettingsPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<SegmentationSettingsPaneControllerParams>
 * } SegmentationSettingsPaneElementParams
 */

/**
 * @typedef {PaneControllerState<SegmentationSettingsPaneControllerParams>
 * } SegmentationSettingsPaneControllerState
 */

/**
 * Represents a UI to configure the settings for an {@link SegmentationView}.
 * 
 * @augments PaneController<SegmentationSettingsPaneControllerParams>
 */
export class SegmentationSettingsPaneController extends PaneController {
    /**
     * Toggles the show tooltips checkbox.
     * 
     * This is a no-op if the checkbox is disabled.
     */
    toggleTooltips() {
        const settings = SegmentationSettingsPaneController
            .getShowTooltipsCheckboxSettings(this.getPaneParams());
        if (settings.disabled) return;

        this.updateInputtedData({ showTooltips: !this.inputtedData.showTooltips });

        this.notifyChange();
    }

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<SegmentationSettingsPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            timeIdxRange: 5,
            showTooltips: false,
            brushDiameter: 40,
            brushHueStyle: 0.3,
            showPerceivedClass: false,
            strokeColor: new THREE.Color('red'),
            hoveredSelectionColor: new THREE.Color('red'),
            selectedSelectionColor: new THREE.Color('blue'),
        },
        computedData: {},
        settings: {
            disabled: false,
            hidden: false,
            maxTimeIdxRange: 10,
            maxBrushDiameter: 100,
            maxBrushHueStyle: 1,
        },
    };

    /**
     * Obtains the settings for the show tooltips checkbox.
     * 
     * @param {Immutable<SegmentationSettingsPaneElementParams>} paneParams
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
     * Toggles the show perceived class checkbox.
     * 
     * This is a no-op if the checkbox is disabled.
     */
    toggleShowPerceivedClass() {
        const settings = SegmentationSettingsPaneController
            .getShowPerceivedClassCheckboxSettings(this.getPaneParams());
        if (settings.disabled) return;

        this.updateInputtedData({ showPerceivedClass: !this.inputtedData.showPerceivedClass });

        this.notifyChange();
    }

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link SegmentationSettingsPaneElementParams}.
     * 
     * @returns {PaneElementFactory<SegmentationSettingsPaneElementParams>}
     * The resulting pane element factory.
     */
    static elementFactory() {
        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        return builder.sequential([
            builder.input(['inputtedData', 'timeIdxRange'], {
                options: ({ settings: { disabled, hidden, maxTimeIdxRange } }) => ({
                    label: 'Display Range',
                    min: 0,
                    max: maxTimeIdxRange,
                    step: 1,
                    disabled: disabled,
                    hidden: hidden,
                }),
            }),
            builder.separator({
                options: ({ settings: { disabled, hidden } }) => ({ disabled, hidden }),
            }),
            builder.separator({
                options: ({ settings: { disabled, hidden } }) => ({ disabled, hidden }),
            }),
            builder.input(['inputtedData', 'showTooltips'], {
                options: (paneParams) => this.getShowTooltipsCheckboxSettings(paneParams),
            }),
            builder.separator({
                options: ({ settings: { disabled, hidden } }) => ({ disabled, hidden }),
            }),
            builder.input(['inputtedData', 'showPerceivedClass'], {
                options: (paneParams) => this.getShowPerceivedClassCheckboxSettings(paneParams),
            }),
            builder.separator({
                options: ({ settings: { disabled, hidden } }) => ({ disabled, hidden }),
            }),
            builder.input(['inputtedData', 'brushDiameter'], {
                options: ({ settings: { disabled, hidden, maxBrushDiameter } }) => ({
                    label: 'Brush Diameter',
                    min: 10,
                    max: maxBrushDiameter,
                    step: 1,
                    disabled: disabled,
                    hidden: hidden,
                }),
            }),
            builder.input(['inputtedData', 'brushHueStyle'], {
                options: ({ settings: { disabled, hidden, maxBrushHueStyle } }) => ({
                    label: 'Brush Hue',
                    min: 0.1,
                    max: maxBrushHueStyle,
                    step: 0.1,
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
            builder.input(['inputtedData', 'hoveredSelectionColor'], {
                options: ({ settings: { disabled, hidden } }) => ({
                    color: { alpha: false, type: 'float' },
                    label: 'Hover color',
                    disabled: disabled,
                    hidden: hidden,
                }),
            }),
            builder.input(['inputtedData', 'selectedSelectionColor'], {
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
             * @type {SegmentationSettingsPaneElementParams}
             */
            const nextParams = _.cloneDeep(params);
            return { params: nextParams, state: prevState };
        }, {});
    }

    /**
     * Data processor to pass into {@link PaneController}.
     * 
     * @type {PaneControllerDataProcessor<SegmentationSettingsPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => ({}),
        outputData: (paneParams) => {
            const {
                inputtedData: {
                    timeIdxRange, showTooltips,
                    showPerceivedClass,
                    brushDiameter, brushHueStyle,
                    strokeColor,
                    hoveredSelectionColor, selectedSelectionColor,
                },
            } = paneParams;

            return {
                timeIdxRange: timeIdxRange,
                showTooltips: showTooltips,
                showPerceivedClass: showPerceivedClass,
                brushDiameter: brushDiameter,
                brushHueStyle: brushHueStyle,
                strokeColor: strokeColor.clone(),
                hoveredSelectionColor: hoveredSelectionColor.clone(),
                selectedSelectionColor: selectedSelectionColor.clone(),
            };
        },
    };

    /**
     * Obtains the settings for the show perceived class checkbox.
     * 
     * @param {Immutable<SegmentationSettingsPaneElementParams>} paneParams
     * The parameters of the pane.
     * @returns {{ label: string, disabled: boolean, hidden: boolean }} The requested settings.
     */
    static getShowPerceivedClassCheckboxSettings({ settings: { disabled, hidden } }) {
        return {
            label: 'Show perceived class',
            disabled: disabled,
            hidden: hidden,
        };
    }

    /**
     * Creates a new UI to configure the settings for an {@link SegmentationView}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<SegmentationSettingsPaneControllerState>} initialState
     * The initial state to set.
     * @returns {SegmentationSettingsPaneController} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new SegmentationSettingsPaneController(
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
