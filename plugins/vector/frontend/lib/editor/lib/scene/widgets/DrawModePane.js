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
/* eslint-enable max-len */

/**
 * Represents geometry type of a vector object to be drawn.
 * 
 * @typedef {'polyline' | 'polygon' | 'point'} DrawMode
 */

/**
 * @typedef {object} DrawModeInputtedData
 * @property {DrawMode} drawMode The selected draw mode.
 */

/**
 * @typedef {object} DrawModePaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 */

/**
 * @typedef {object} DrawModeSelection
 * @property {DrawMode} drawMode The selected draw mode.
 */

/**
 * @typedef {{
 *     inputtedData: DrawModeInputtedData;
 *     computedData: {};
 *     settings: DrawModePaneSettings;
 *     internalData: {};
 *     outputData: DrawModeSelection;
 * }} DrawModePaneControllerParams
 */

/**
 * @typedef {PaneElementParams<DrawModePaneControllerParams>} DrawModePaneElementParams
 */

/**
 * @typedef {PaneControllerState<DrawModePaneControllerParams>} DrawModePaneControllerState
 */

/**
 * Represents a UI to select a {@link DrawMode}.
 * 
 * @augments PaneController<DrawModePaneControllerParams>
 */
export class DrawModePaneController extends PaneController {

    /**
     * Cycles to the next draw mode.
     * 
     * This is a no-op if the input is disabled.
     */
    cycleDrawMode() {
        const settings = DrawModePaneController.getDrawModeSelectSettings(this.getPaneParams());
        if (settings.disabled) return;

        const allModes = DrawModePaneController.gridModes;
        const nextIdx = (allModes.indexOf(this.inputtedData.drawMode) + 1) % allModes.length;

        this.updateInputtedData({ drawMode: allModes[nextIdx] });

        this.notifyChange();
    }

    /**
     * 
     * @param {DrawMode} mode The draw mode to be set.
     */
    setDrawMode(mode) {
        const settings = DrawModePaneController.getDrawModeSelectSettings(this.getPaneParams());
        if (settings.disabled) return;

        const allModes = DrawModePaneController.gridModes;
        const idx = (allModes.indexOf(mode));

        this.updateInputtedData({ drawMode: allModes[idx] });

        this.notifyChange();
    }

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<DrawModePaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            drawMode: 'polyline',
        },
        computedData: {},
        settings: {
            disabled: false,
            hidden: false,
        },
    };

    /**
     * @readonly
     * @type {ReadonlyArray<DrawMode>}
     */
    static gridModes = ['polyline', 'polygon', 'point'];

    /**
     * @readonly
     * @type {ReadonlyArray<string>}
     */
    static gridLabels = ['line', 'Polygon', 'Point'];

    /**
     * Obtains the settings for the draw mode selector.
     * 
     * @param {Immutable<DrawModePaneElementParams>} paneParams
     * The parameters of the pane.
     * @returns {{
     *     view: 'radiogrid',
     *     groupName: string,
     *     label: string;
     *     size: [number, number];
     *     cells: (x: number, y: number) => { title: string, value: DrawMode };
     *     disabled: boolean;
     *     hidden: boolean;
     * }} The requested settings.
     */
    static getDrawModeSelectSettings({ settings: { disabled, hidden } }) {
        return {
            view: 'radiogrid',
            groupName: 'drawMode',
            size: [3, 1],
            label: 'Draw',
            cells: (x) => ({ title: this.gridLabels[x], value: this.gridModes[x] }),
            disabled: disabled,
            hidden: hidden,
        };
    }

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link DrawModePaneElementParams}.
     * 
     * @returns {PaneElementFactory<DrawModePaneElementParams>}
     * The resulting pane element factory.
     */
    static elementFactory() {
        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        return builder.sequential([
            builder.input(['inputtedData', 'drawMode'], {
                options: (paneParams) => this.getDrawModeSelectSettings(paneParams),
            }),
        ]);
    }

    /**
     * Data processor to pass into {@link PaneController}.
     * 
     * @type {PaneControllerDataProcessor<DrawModePaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => ({}),
        outputData: (paneParams) => {
            const { inputtedData: { drawMode } } = paneParams;

            return { drawMode };
        },
    };

    /**
     * Creates a new UI to select a {@link DrawMode}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<DrawModePaneControllerState>} initialState
     * The initial state to set.
     * @returns {DrawModePaneController} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new DrawModePaneController(
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
