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
 * @typedef {'add' | 'erase'} EditMode
 */

/**
 * @typedef {object} EditModeInputtedData
 * @property {EditMode} editMode The selected edit mode.
 */

/**
 * @typedef {object} EditModePaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 */

/**
 * @typedef {object} EditModeState
 * @property {EditMode} editMode The selected edit mode.
 */

/**
 * @typedef {{
 *     inputtedData: EditModeInputtedData;
 *     computedData: {};
 *     settings: EditModePaneSettings;
 *     internalData: {};
 *     outputData: EditModeState;
 * }} EditModePaneControllerParams
 */

/**
 * @typedef {PaneElementParams<EditModePaneControllerParams>} EditModePaneElementParams
 */

/**
 * @typedef {PaneControllerState<EditModePaneControllerParams>} EditModePaneControllerState
 */

/**
 * Represents a UI to select a {@link EditMode}
 * 
 * @augments PaneController<EditModePaneControllerParams>
 */
export class EditModePaneController extends PaneController {

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<EditModePaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            editMode: 'add',
        },
        computedData: {},
        settings: {
            disabled: false,
            hidden: false,
        },
    };

    /**
     * @readonly
     * @type {ReadonlyArray<EditMode>}
     */
    static gridEditModes = ['add', 'erase'];

    /**
     * @readonly
     * @type {ReadonlyArray<string>}
     */
    static gridLabels = ['Add', 'Erase'];

    /**
     * Obtains the settings for the view mode selector.
     * 
     * @param {Immutable<EditModePaneElementParams>} paneParams The parameters of the pane.
     * @returns {{
     *     view: 'radiogrid',
     *     groupName: string,
     *     label: string;
     *     size: [number, number];
     *     cells: (x: number, y: number) => { title: string, value: EditMode };
     *     disabled: boolean;
     *     hidden: boolean;
     * }} The requested settings.
     */
    static getEditModeSelectSettings({ settings: { disabled, hidden } }) {
        return {
            view: 'radiogrid',
            groupName: 'editMode',
            label: 'Edit Mode',
            size: [2, 1],
            cells: (x) => ({ title: this.gridLabels[x], value: this.gridEditModes[x] }),
            disabled: disabled,
            hidden: hidden,
        };
    }

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link EditModePaneElementParams}.
     * 
     * @returns {PaneElementFactory<EditModePaneElementParams>}
     * The resulting pane element factory.
     */
    static elementFactory() {
        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        return builder.sequential([
            builder.input(['inputtedData', 'editMode'], {
                options: (paneParams) => this.getEditModeSelectSettings(paneParams),
            }),
        ]);
    }

    /**
     * Data processor to pass into {@link PaneController}.
     * 
     * @type {PaneControllerDataProcessor<EditModePaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => ({}),
        outputData: (paneParams) => {
            const { inputtedData: { editMode } } = paneParams;

            return { editMode };
        },
    };

    /**
     * Cycles to the next view mode.
     * 
     * This is a no-op if the input is disabled.
     */
    cycleEditMode() {
        const settings = EditModePaneController.getEditModeSelectSettings(this.getPaneParams());
        if (settings.disabled) return;

        const allEditModes = EditModePaneController.gridEditModes;
        const editMode = this.inputtedData.editMode;

        const nextIdx = (allEditModes.indexOf(editMode) + 1) % allEditModes.length;
        const nextEditMode = allEditModes[nextIdx];

        this.updateInputtedData({ editMode: nextEditMode });

        this.notifyChange();
    }

    /**
     * Creates a new UI to select a {@link EditMode}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<EditModePaneControllerState>} initialState
     * The initial state to set.
     * @returns {EditModePaneController} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new EditModePaneController(
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
