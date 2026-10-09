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
 * @typedef {import('../data').BBoxView} BBoxView
 */
/* eslint-enable max-len */

/**
 * @typedef {object} BBoxSettingsInputtedData
 * @property {number} timeIdxRange The maximum distance (inclusive, according to time index)
 * from the active frame for which to display the labels.
 * @property {boolean} maintainRelativeElevation If `true`, automatically adjusts the
 * elevation of the bounding box during horizontal translation to maintain its elevation relative
 * to the ground mesh; otherwise, `false`.
 * @property {boolean} showPerceivedClass If `true`, displays the color of each bounding box
 * based on their perceived class; otherwise, displays the color based on their ground truth class.
 * @property {boolean} showTooltips If `true`, displays the tooltip of each bounding box
 * and object track; otherwise, `false`.
 * @property {boolean} showOcclusion If `true`, displays the occlusion descriptors 
 * values of each bounding box in its tooltip.
 * @property {boolean} showDistinctiveness If `true`, displays the distinctiveness 
 * descriptor values of each bounding box in its tooltip.
 * @property {boolean} showTimestampDiff If `true`, displays the timestamp difference 
 * between bounding boxes' timestamps in tooltip.
 * @property {boolean} showTrackBoxId If `true`, displays the track id and box id values of 
 * each bounding box in its tooltip.
 * @property {boolean} boxTransparency If `true`, overrides opacity for each bounding box
 * with a value of `0`; otherwise, `false`.
 * @property {number} boxOpacity The opacity of each bounding box being displayed.
 * @property {Immutable<THREE.Color>} hoveredBoxColor The color of a bounding box when hovered
 * over.
 * @property {Immutable<THREE.Color>} selectedBoxColor The color of a bounding box when
 * selected.
 */

/**
 * @typedef {object} BBoxSettingsPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 * @property {boolean} disallowRelativeElevation `true` if the relative elevation is
 * unavailable; otherwise, `false`.
 * @property {number} maxTimeIdxRange The maximum allowed value of `timeIdxRange`.
 */

/**
 * @typedef {object} BBoxSettingsPaneState
 * @property {?boolean} inactiveMaintainRelativeElevation The most recent value of
 * {@link BBoxSettingsInputtedData#maintainRelativeElevation} prior to setting
 * {@link BBoxSettingsPaneSettings#disallowRelativeElevation} to `true`;
 * `null` if it is `false`.
 * @property {?number} inactiveBoxOpacity The most recent value of
 * {@link BBoxSettingsInputtedData#boxOpacity} prior to setting
 * {@link BBoxSettingsInputtedData#boxTransparency} to `true`;
 * `null` if it is `false`.
 */

/**
 * @typedef {object} BBoxSettings
 * @property {number} timeIdxRange The maximum distance (inclusive, according to time index)
 * from the active frame for which to display the labels.
 * @property {boolean} maintainRelativeElevation If `true`, automatically adjusts the
 * elevation of the bounding box during horizontal translation to maintain its elevation relative
 * to the ground mesh; otherwise, `false`.
 * (This may not be equal to {@link BBoxSettingsInputtedData#maintainRelativeElevation}
 * if {@link BBoxSettingsPaneSettings#disallowRelativeElevation} is set to `true`.)
 * @property {boolean} showPerceivedClass If `true`, displays the color of each bounding box
 * based on their perceived class; otherwise, displays the color based on their ground truth class.
 * @property {boolean} showTooltips If `true`, displays the tooltip of each bounding box
 * and object track; otherwise, `false`.
 * @property {boolean} showOcclusion If `true`, displays the occlusion descriptor 
 * values of each bounding box in its tooltip.
 * @property {boolean} showDistinctiveness If `true`, displays the distinctiveness 
 * descriptor values of each bounding box in its tooltip.
 * @property {boolean} showTimestampDiff If `true`, displays the timestamp difference 
 * between bounding boxes' timestamps in tooltip.
 * @property {boolean} showTrackBoxId If `true`, displays the track id and box id values of 
 * each bounding box in its tooltip.
 * @property {number} boxOpacity The opacity of each bounding box being displayed.
 * (This may not be equal to {@link BBoxSettingsInputtedData#boxOpacity}
 * if {@link BBoxSettingsInputtedData#boxTransparency} is set to `true`.)
 * @property {Immutable<THREE.Color>} hoveredBoxColor The color of a bounding box when hovered
 * over.
 * @property {Immutable<THREE.Color>} selectedBoxColor The color of a bounding box when
 * selected.
 */

/**
 * @typedef {{
 *     inputtedData: BBoxSettingsInputtedData;
 *     computedData: {};
 *     settings: BBoxSettingsPaneSettings;
 *     internalData: {};
 *     outputData: BBoxSettings;
 * }} BBoxSettingsPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<BBoxSettingsPaneControllerParams>
 * } BBoxSettingsPaneElementParams
 */

/**
 * @typedef {PaneControllerState<BBoxSettingsPaneControllerParams>
 * } BBoxSettingsPaneControllerState
 */

/**
 * Represents a UI to configure the settings for an {@link BBoxView}.
 * 
 * @augments PaneController<BBoxSettingsPaneControllerParams>
 */
export class BBoxSettingsPaneController extends PaneController {

    /**
     * Toggles the maintain relative elevation checkbox.
     * 
     * This is a no-op if the checkbox is disabled.
     */
    toggleMaintainRelativeElevation() {
        const settings = BBoxSettingsPaneController
            .getMaintainRelElevCheckboxSettings(this.getPaneParams());
        if (settings.disabled) return;

        this.updateInputtedData({
            maintainRelativeElevation: !this.inputtedData.maintainRelativeElevation,
        });

        this.notifyChange();
    }

    /**
     * Toggles the show perceived class checkbox.
     * 
     * This is a no-op if the checkbox is disabled.
     */
    toggleShowPerceivedClass() {
        const settings = BBoxSettingsPaneController
            .getShowPerceivedClassCheckboxSettings(this.getPaneParams());
        if (settings.disabled) return;

        this.updateInputtedData({ showPerceivedClass: !this.inputtedData.showPerceivedClass });

        this.notifyChange();
    }

    /**
     * Toggles the show tooltips checkbox.
     * 
     * This is a no-op if the checkbox is disabled.
     */
    toggleTooltips() {
        const settings = BBoxSettingsPaneController
            .getShowTooltipsCheckboxSettings(this.getPaneParams());
        if (settings.disabled) return;

        this.updateInputtedData({ showTooltips: !this.inputtedData.showTooltips });

        this.notifyChange();
    }

    /**
     * Toggles the box transparency checkbox.
     * 
     * This is a no-op if the checkbox is disabled.
     */
    toggleTransparency() {
        const settings = BBoxSettingsPaneController
            .getBoxTransparencyCheckboxSettings(this.getPaneParams());
        if (settings.disabled) return;

        this.updateInputtedData({ boxTransparency: !this.inputtedData.boxTransparency });

        this.notifyChange();
    }

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<BBoxSettingsPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            timeIdxRange: 20,
            maintainRelativeElevation: true,
            showPerceivedClass: true,
            showTooltips: false,
            boxTransparency: false,
            showOcclusion: true,
            showDistinctiveness: false,
            showTimestampDiff: false,
            showTrackBoxId: false,
            boxOpacity: 0.2,
            hoveredBoxColor: new THREE.Color('red'),
            selectedBoxColor: new THREE.Color('blue'),
        },
        computedData: {},
        settings: {
            disabled: false,
            hidden: false,
            disallowRelativeElevation: true,
            maxTimeIdxRange: 10,
        },
    };

    /**
     * Obtains the settings for the maintain relative elevation checkbox.
     * 
     * @param {Immutable<BBoxSettingsPaneElementParams>} paneParams
     * The parameters of the pane.
     * @returns {{ label: string, disabled: boolean, hidden: boolean }} The requested settings.
     */
    static getMaintainRelElevCheckboxSettings(
        { settings: { disabled, hidden, disallowRelativeElevation } },
    ) {
        return {
            label: 'Maintain elevation\nrelative to ground mesh',
            disabled: disabled || disallowRelativeElevation,
            hidden: hidden,
        };
    }

    /**
     * Obtains the settings for the show perceived class checkbox.
     * 
     * @param {Immutable<BBoxSettingsPaneElementParams>} paneParams
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
     * Obtains the settings for the show tooltips checkbox.
     * 
     * @param {Immutable<BBoxSettingsPaneElementParams>} paneParams
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
     * Obtains the settings for the show track info checkbox.
     * 
     * @param {Immutable<BBoxSettingsPaneElementParams>} paneParams
     * The parameters of the pane.
     * @returns {{ label: string, disabled: boolean, hidden: boolean }} The requested settings.
     */
    static getShowshowTrackBoxIdCheckboxSettings({ settings: { disabled, hidden } }) {
        return {
            label: 'Show Track & Box IDs',
            disabled: disabled,
            hidden: hidden,
        };
    }

    /**
     * Obtains the settings for the show bbox descriptors checkbox.
     * 
     * @param {Immutable<BBoxSettingsPaneElementParams>} paneParams
     * The parameters of the pane.
     * @returns {{ label: string, disabled: boolean, hidden: boolean }} The requested settings.
     */
    static getShowOcclusionCheckboxSettings({ settings: { disabled, hidden } }) {
        return {
            label: 'Show Occlusion',
            disabled: disabled,
            hidden: hidden,
        };
    }

    /**
     * Obtains the settings for the show bbox distinctiveness descriptor checkbox.
     * 
     * @param {Immutable<BBoxSettingsPaneElementParams>} paneParams
     * The parameters of the pane.
     * @returns {{ label: string, disabled: boolean, hidden: boolean }} The requested settings.
     */
    static getShowDistinctivenessCheckboxSettings({ settings: { disabled, hidden } }) {
        return {
            label: 'Show Distinctiveness',
            disabled: disabled,
            hidden: hidden,
        };
    }

    /**
     * Obtains the settings for the show bbox timestamp difference checkbox.
     * 
     * @param {Immutable<BBoxSettingsPaneElementParams>} paneParams
     * The parameters of the pane.
     * @returns {{ label: string, disabled: boolean, hidden: boolean }} The requested settings.
     */
    static getShowTimestampDiffCheckboxSettings({ settings: { disabled, hidden } }) {
        return {
            label: 'Show Timestamp Difference',
            disabled: disabled,
            hidden: hidden,
        };
    }

    /**
     * Obtains the settings for the box transparency checkbox.
     * 
     * @param {Immutable<BBoxSettingsPaneElementParams>} paneParams
     * The parameters of the pane.
     * @returns {{ label: string, disabled: boolean, hidden: boolean }} The requested settings.
     */
    static getBoxTransparencyCheckboxSettings({ settings: { disabled, hidden } }) {
        return {
            label: 'Transparent Faces',
            disabled: disabled,
            hidden: hidden,
        };
    }

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link BBoxSettingsPaneElementParams}.
     * 
     * @returns {PaneElementFactory<BBoxSettingsPaneElementParams>}
     * The resulting pane element factory.
     */
    static elementFactory() {
        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        const OPACITY_STEP = 0.01;

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
            builder.input(['inputtedData', 'maintainRelativeElevation'], {
                options: (paneParams) => this.getMaintainRelElevCheckboxSettings(paneParams),
            }),
            builder.separator({
                options: ({ settings: { disabled, hidden } }) => ({ disabled, hidden }),
            }),
            builder.input(['inputtedData', 'showPerceivedClass'], {
                options: (paneParams) => this.getShowPerceivedClassCheckboxSettings(paneParams),
            }),
            builder.input(['inputtedData', 'showTooltips'], {
                options: (paneParams) => this.getShowTooltipsCheckboxSettings(paneParams),
            }),
            builder.input(['inputtedData', 'showOcclusion'], {
                options: (paneParams) => this.getShowOcclusionCheckboxSettings(paneParams),
            }),
            builder.input(['inputtedData', 'showDistinctiveness'], {
                options: (paneParams) => this.getShowDistinctivenessCheckboxSettings(paneParams),
            }),
            builder.input(['inputtedData', 'showTimestampDiff'], {
                options: (paneParams) => this.getShowTimestampDiffCheckboxSettings(paneParams),
            }),
            builder.input(['inputtedData', 'showTrackBoxId'], {
                options: (paneParams) => this.getShowshowTrackBoxIdCheckboxSettings(paneParams),
            }),
            builder.separator({
                options: ({ settings: { disabled, hidden } }) => ({ disabled, hidden }),
            }),
            builder.input(['inputtedData', 'boxTransparency'], {
                options: (paneParams) => this.getBoxTransparencyCheckboxSettings(paneParams),
            }),
            builder.input(['inputtedData', 'boxOpacity'], {
                options: ({
                    inputtedData: { boxTransparency },
                    settings: { disabled, hidden },
                }) => ({
                    label: 'Face Opacity',
                    min: 0,
                    max: 1,
                    step: OPACITY_STEP,
                    disabled: disabled || boxTransparency,
                    hidden: hidden,
                }),
            }),
            builder.separator({
                options: ({ settings: { disabled, hidden } }) => ({ disabled, hidden }),
            }),
            builder.input(['inputtedData', 'hoveredBoxColor'], {
                options: ({ settings: { disabled, hidden } }) => ({
                    color: { alpha: false, type: 'float' },
                    label: 'Hover color',
                    disabled: disabled,
                    hidden: hidden,
                }),
            }),
            builder.input(['inputtedData', 'selectedBoxColor'], {
                options: ({ settings: { disabled, hidden } }) => ({
                    color: { alpha: false, type: 'float' },
                    label: 'Select color',
                    disabled: disabled,
                    hidden: hidden,
                }),
            }),
        ]).withState(({ params: prevParams, state: prevState }, params) => {
            /**
             * @type {BBoxSettingsPaneElementParams}
             */
            const nextParams = _.cloneDeep(params);

            /**
             * @type {BBoxSettingsPaneState}
             */
            const nextState = _.cloneDeep(prevState);

            // Manage interactions between [disallow/maintain]RelativeElevation
            {
                const prevDisallowRE = prevParams.settings.disallowRelativeElevation;
                const prevMaintainRE = prevParams.inputtedData.maintainRelativeElevation;
                const prevInactiveMaintainRE = prevState.inactiveMaintainRelativeElevation;

                const disallowRE = params.settings.disallowRelativeElevation;
                const maintainRE = params.inputtedData.maintainRelativeElevation;

                const updateDisallowRE = prevDisallowRE !== disallowRE;
                const updateMaintainRE = prevMaintainRE !== maintainRE;

                /**
                 * @type {boolean}
                 */
                let nextMaintainRE;

                /**
                 * @type {?boolean}
                 */
                let nextInactiveMaintainRE;

                if (updateDisallowRE) {
                    if (prevInactiveMaintainRE == null) {
                        // disallowRelativeElevation: false -> true
                        nextInactiveMaintainRE = prevMaintainRE;
                        nextMaintainRE = false;
                    } else {
                        // disallowRelativeElevation: true -> false
                        nextMaintainRE = updateMaintainRE ? maintainRE : prevInactiveMaintainRE;
                        nextInactiveMaintainRE = null;
                    }
                } else {
                    nextMaintainRE = maintainRE;
                    nextInactiveMaintainRE = updateMaintainRE ? null : prevInactiveMaintainRE;
                }

                nextParams.inputtedData.maintainRelativeElevation = nextMaintainRE;
                nextState.inactiveMaintainRelativeElevation = nextInactiveMaintainRE;
            }

            // Manage interactions between box[Transparency/Opacity]
            {
                const prevTransparency = prevParams.inputtedData.boxTransparency;
                const prevOpacity = prevParams.inputtedData.boxOpacity;
                const prevInactiveOpacity = prevState.inactiveBoxOpacity;

                const transparency = params.inputtedData.boxTransparency;
                const opacity = params.inputtedData.boxOpacity;

                const updateTransparency = prevTransparency !== transparency;
                const updateOpacity = Math.abs(prevOpacity - opacity) >= OPACITY_STEP / 2;

                /**
                 * @type {number}
                 */
                let nextOpacity;

                /**
                 * @type {?number}
                 */
                let nextInactiveOpacity;

                if (updateTransparency) {
                    if (prevInactiveOpacity == null) {
                        // boxTransparency: false -> true
                        nextInactiveOpacity = prevOpacity;
                        nextOpacity = 0;
                    } else {
                        // boxTransparency: true -> false
                        nextOpacity = updateOpacity ? opacity : prevInactiveOpacity;
                        nextInactiveOpacity = null;
                    }
                } else {
                    nextOpacity = opacity;
                    nextInactiveOpacity = updateOpacity ? null : prevInactiveOpacity;
                }

                nextParams.inputtedData.boxOpacity = nextOpacity;
                nextState.inactiveBoxOpacity = nextInactiveOpacity;
            }

            return { params: nextParams, state: nextState };
        }, /** @type {BBoxSettingsPaneState} */ ({
            inactiveMaintainRelativeElevation: null,
            inactiveBoxOpacity: null,
        }));
    }

    /**
     * Data processor to pass into {@link PaneController}.
     * 
     * @type {PaneControllerDataProcessor<BBoxSettingsPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => ({}),
        outputData: (paneParams) => {
            const {
                inputtedData: {
                    timeIdxRange,
                    maintainRelativeElevation,
                    showPerceivedClass, showTooltips,
                    showOcclusion, showDistinctiveness,
                    showTimestampDiff, showTrackBoxId: showTrackId,
                    boxTransparency, boxOpacity,
                    hoveredBoxColor, selectedBoxColor,
                },
                settings: { disallowRelativeElevation },
            } = paneParams;

            return {
                timeIdxRange: timeIdxRange,
                maintainRelativeElevation: disallowRelativeElevation ? false
                    : maintainRelativeElevation,
                showPerceivedClass: showPerceivedClass,
                showTooltips: showTooltips,
                showOcclusion: showOcclusion,
                showDistinctiveness: showDistinctiveness,
                showTimestampDiff: showTimestampDiff,
                showTrackBoxId: showTrackId,
                boxOpacity: boxTransparency ? 0 : boxOpacity,
                hoveredBoxColor: hoveredBoxColor.clone(),
                selectedBoxColor: selectedBoxColor.clone(),
            };
        },
    };

    /**
     * Creates a new UI to configure the settings for an {@link BBoxView}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<BBoxSettingsPaneControllerState>} initialState
     * The initial state to set.
     * @returns {BBoxSettingsPaneController} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new BBoxSettingsPaneController(
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
