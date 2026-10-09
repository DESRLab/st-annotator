import { Pane } from 'tweakpane';

import { PaneController, PaneControllerDataMapper, PaneElementFactoryBuilder } from 'sta/services/editor/base';

import { ActionsGridPaneController } from './ActionGridPane';

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
 * @typedef {import('./ActionGridPane').ActionsGridPaneControllerParams} ActionsGridPaneControllerParams
 */

/**
 * @typedef {import('./ActionGridPane').GridAction} GridAction
 */
/* eslint-enable max-len */

/**
 * Represents an action to apply to the vector layer.
 * 
 * @typedef {'edit' | 'select' | 'draw'} Action
 */

/**
 * @typedef {object} ActionsInputtedData
 * @property {Action} action The selected action.
 */

/**
 * @typedef {object} ActionPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 */

/**
 * @typedef {object} ActionsState
 * @property {Action} action The selected action.
 */

/**
 * @typedef {{
 *     inputtedData: ActionsInputtedData;
 *     computedData: {};
 *     settings: ActionPaneSettings;
 *     internalData: {};
 *     outputData: ActionsState;
 * }} ActionPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<ActionPaneControllerParams>} ActionPaneElementParams
 */

/**
 * @typedef {PaneControllerState<ActionPaneControllerParams>} ActionPaneControllerState
 */

/**
 * Represents a UI to select an {@link Action}
 * 
 * @augments PaneController<ActionPaneControllerParams>
 */
export class ActionPaneController extends PaneController {

    /**
     * Sets the action to `'draw'`; if it is already set, instead sets it to the default one.
     * 
     * This is a no-op if the input is disabled.
     */
    toggleDraw() {
        const settings = ActionPaneController.getActionSelectSettings(this.getPaneParams());
        if (settings.disabled) return;

        this.updateInputtedData({
            action: (this.inputtedData.action === 'draw') ? 'edit' : 'draw',
        });

        this.notifyChange();
    }

    /**
     * Sets the action to `'select'`; if it is already set, instead sets it to the default one.
     * 
     * This is a no-op if the input is disabled.
     */
    toggleSelect() {
        const settings = ActionPaneController.getActionSelectSettings(this.getPaneParams());
        if (settings.disabled) return;

        this.updateInputtedData({
            action: (this.inputtedData.action === 'select') ? 'edit' : 'select',
        });

        this.notifyChange();
    }

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<ActionPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            action: 'edit',
        },
        computedData: {},
        settings: {
            disabled: false,
            hidden: false,
        },
    };

    /**
     * @type {PaneControllerDataMapper<
     * ActionPaneControllerParams,
     * ActionsGridPaneControllerParams>}
     */
    static #gridDataMapper = new PaneControllerDataMapper({
        outerToInner: {
            inputtedData: (outerInputted) => {
                const action = outerInputted.action;

                return {
                    isActionSelected: {
                        select: action === 'select',
                        draw: action === 'draw',
                    },
                };
            },
            internalData: (outerInternal) => outerInternal,
            computedData: (outer) => outer.computedData,
            settings: (outer) => outer.settings,
        },
        innerToOuter: {
            inputtedData: (innerInputted) => {
                const isActionSelected = innerInputted.isActionSelected;
                if (isActionSelected.select) return { action: 'select' };
                if (isActionSelected.draw) return { action: 'draw' };

                return { action: 'edit' };
            },
        },
    });

    /**
     * Obtains the settings for the action selector.
     * 
     * @param {Immutable<ActionPaneElementParams>} paneParams
     * The parameters of the pane.
     * @returns {{
     *     label: string;
     *     size: [number, number];
     *     cells: (x: number, y: number) => { title: string, value: GridAction };
     *     disabled: boolean;
     *     hidden: boolean;
     * }} The requested settings.
     */
    static getActionSelectSettings(paneParams) {
        const gridParams = this.#gridDataMapper.paramsMapper().outerToInner(paneParams);
        return ActionsGridPaneController.getActionSelectSettings(gridParams);
    }

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link ActionPaneElementParams}.
     * 
     * @returns {PaneElementFactory<ActionPaneElementParams>}
     * The resulting pane element factory.
     */
    static elementFactory() {
        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        return builder.sequential([
            builder.mapped(
                ActionsGridPaneController.elementFactory(),
                this.#gridDataMapper.paramsMapper(),
                builder.identityEventMapper(),
            ),
        ]);
    }

    /**
     * Data processor to pass into {@link PaneController}.
     * 
     * @type {PaneControllerDataProcessor<ActionPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => ({}),
        outputData: (paneParams) => {
            const { inputtedData: { action } } = paneParams;

            return { action };
        },
    };

    /**
     * Creates a new UI to select an {@link Action}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<ActionPaneControllerState>} initialState
     * The initial state to set.
     * @returns {ActionPaneController} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new ActionPaneController(
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
