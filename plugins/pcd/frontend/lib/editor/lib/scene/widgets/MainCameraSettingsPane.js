import { Pane } from 'tweakpane';

import { PaneController, PaneControllerDataMapper, PaneElementFactoryBuilder } from 'sta/services/editor/base';
import { ViewModePane } from 'sta/services/editor/core';

const ViewModePaneController = ViewModePane.ViewModePaneController;

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
 * @typedef {import('sta/services/editor/core').MainWindow} MainWindow
 */

/**
 * @typedef {import('sta/services/editor/core').ViewMode} ViewMode
 */

/**
 * @typedef {import('sta/services/editor/core').ViewModePane.ViewModePaneControllerParams} ViewModePaneControllerParams
 */
/* eslint-enable max-len */

/**
 * @typedef {object} MainCameraSettingsInputtedData
 * @property {ViewMode} viewMode The selected view mode.
 * @property {boolean} orbitPoint If `true`, the camera orbits around the point in the point cloud
 * it is looking at; otherwise, the camera orbits around its default target in free space.
 */

/**
 * @typedef {object} MainCameraSettingsPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 */

/**
 * @typedef {object} MainCameraSettings
 * @property {ViewMode} viewMode The selected view mode.
 * @property {boolean} orbitPoint If `true`, the camera orbits around the point in the point cloud
 * it is looking at; otherwise, the camera orbits around its default target in free space.
 */

/**
 * @typedef {{
 *     inputtedData: MainCameraSettingsInputtedData;
 *     computedData: {};
 *     settings: MainCameraSettingsPaneSettings;
 *     internalData: {};
 *     outputData: MainCameraSettings;
 * }} MainCameraSettingsPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<MainCameraSettingsPaneControllerParams>
 * } MainCameraSettingsPaneElementParams
 */

/**
 * @typedef {PaneControllerState<MainCameraSettingsPaneControllerParams>
 * } MainCameraSettingsPaneControllerState
 */

/**
 * Represents a UI to configure the settings for a {@link MainCamera}.
 * 
 * @augments PaneController<MainCameraSettingsPaneControllerParams>
 */
export class MainCameraSettingsPaneController extends PaneController {

    /**
     * Cycles to the next view mode.
     * 
     * This is a no-op if the input is disabled.
     */
    cycleViewMode() {
        const settings = MainCameraSettingsPaneController
            .getViewModeSelectSettings(this.getPaneParams());
        if (settings.disabled) return;

        const allViewModes = ViewModePaneController.gridViewModes;
        const viewMode = this.inputtedData.viewMode;

        const nextIdx = (allViewModes.indexOf(viewMode) + 1) % allViewModes.length;
        const nextViewMode = allViewModes[nextIdx];

        this.updateInputtedData({ viewMode: nextViewMode });

        this.notifyChange();
    }

    /**
     * Toggles whether the camera orbits around the point in the point cloud it is looking at.
     * 
     * This is a no-op if the input is disabled.
     */
    toggleOrbitPoint() {
        const settings = MainCameraSettingsPaneController
            .getOrbitPointCheckboxSettings(this.getPaneParams());
        if (settings.disabled) return;

        this.updateInputtedData({ orbitPoint: !this.inputtedData.orbitPoint });

        this.notifyChange();
    }

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<MainCameraSettingsPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            viewMode: '2D',
            orbitPoint: false,
        },
        computedData: {},
        settings: {
            disabled: false,
            hidden: false,
        },
    };

    /**
     * @type {PaneControllerDataMapper<
     * MainCameraSettingsPaneControllerParams,
     * ViewModePaneControllerParams>}
     */
    static #viewModeDataMapper = new PaneControllerDataMapper({
        outerToInner: {
            inputtedData: (outerInputted) => ({ viewMode: outerInputted.viewMode }),
            internalData: (outerInternal) => outerInternal,
            computedData: (outer) => outer.computedData,
            settings: (outer) => outer.settings,
        },
        innerToOuter: {
            inputtedData: (innerInputted) => innerInputted,
        },
    });

    /**
     * Obtains the settings for the view mode selector.
     * 
     * @param {Immutable<MainCameraSettingsPaneElementParams>} paneParams
     * The parameters of the pane.
     * @returns {{
     *     view: 'radiogrid',
     *     groupName: string,
     *     label: string;
     *     size: [number, number];
     *     cells: (x: number, y: number) => { title: string, value: ViewMode };
     *     disabled: boolean;
     *     hidden: boolean;
     * }} The requested settings.
     */
    static getViewModeSelectSettings(paneParams) {
        const selectParams = this.#viewModeDataMapper.paramsMapper().outerToInner(paneParams);
        return ViewModePaneController.getViewModeSelectSettings(selectParams);
    }

    /**
     * Obtains the settings for the orbit point checkbox.
     * 
     * @param {Immutable<MainCameraSettingsPaneElementParams>} paneParams
     * The parameters of the pane.
     * @returns {{ label: string, disabled: boolean, hidden: boolean }} The requested settings.
     */
    static getOrbitPointCheckboxSettings({ settings: { disabled, hidden } }) {
        return {
            label: 'Orbit Point',
            disabled: disabled,
            hidden: hidden,
        };
    }

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link MainCameraSettingsPaneElementParams}.
     * 
     * @returns {PaneElementFactory<MainCameraSettingsPaneElementParams>}
     * The resulting pane element factory.
     */
    static elementFactory() {
        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        return builder.sequential([
            builder.mapped(
                ViewModePaneController.elementFactory(),
                this.#viewModeDataMapper.paramsMapper(),
                builder.identityEventMapper(),
            ),
            builder.input(['inputtedData', 'orbitPoint'], {
                options: (paneParams) => this.getOrbitPointCheckboxSettings(paneParams),
            }),
        ]);
    }

    /**
     * Data processor to pass into {@link PaneController}.
     * 
     * @type {PaneControllerDataProcessor<MainCameraSettingsPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => ({}),
        outputData: (paneParams) => {
            const { inputtedData: { orbitPoint } } = paneParams;

            const { viewMode } = ViewModePaneController.DATA_PROCESSOR
                .outputData(this.#viewModeDataMapper.paramsMapper().outerToInner(paneParams));

            return { viewMode, orbitPoint };
        },
    };

    /**
     * Creates a new UI to configure the settings for a {@link MainCamera}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<MainCameraSettingsPaneControllerState>} initialState
     * The initial state to set.
     * @returns {MainCameraSettingsPaneController} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new MainCameraSettingsPaneController(
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
