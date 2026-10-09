import { Pane } from 'tweakpane';

import { PaneController, PaneElementFactoryBuilder } from '../../../base';

/**
 * @typedef {import('three')} THREE
 */

/**
 * @template T
 * @typedef {import('../../../../../../common/lib/utils').TypeUtils.Immutable<T>} Immutable
 */

/**
 * @template P
 * @template {{}} E
 * @typedef {import('../../../base').PaneElementFactory<P, E>} PaneElementFactory
 */

/**
 * @typedef {import('../../../base').PaneControllerDataTypes} PaneControllerDataTypes
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('../../../base').PaneElementParams<P>} PaneElementParams
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('../../../base').PaneControllerDataProcessor<P>} PaneControllerDataProcessor
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('../../../base').PaneControllerState<P>} PaneControllerState
 */

/**
 * @typedef {object} ClipboardPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 * @property {boolean} disableCopy `true` if the copy button is disabled; otherwise, the
 * default behaviour of `disabled` is applied.
 * @property {boolean} disablePaste `true` if the paste button is disabled; otherwise, the
 * default behaviour of `disabled` is applied.
 */

/**
 * @typedef {{
 *     inputtedData: {};
 *     computedData: {};
 *     settings: ClipboardPaneSettings;
 *     internalData: {};
 *     outputData: {};
 * }} ClipboardPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<ClipboardPaneControllerParams>} ClipboardPaneElementParams
 */

/**
 * @typedef {PaneControllerState<ClipboardPaneControllerParams>} ClipboardPaneControllerState
 */

/**
 * Defines each event that can be dispatched by {@link ClipboardPaneController}.
 * 
 * @typedef {object} ClipboardPaneControllerEventMap
 * @property {{}} click-copy The event when the copy button is clicked.
 * @property {{}} click-paste The event when the paste button is clicked.
 */

/**
 * Represents a UI to configure the settings of a {@link LabelBoxClipboard}.
 * 
 * @augments {PaneController<ClipboardPaneControllerParams, ClipboardPaneControllerEventMap>}
 */
export class ClipboardPaneController extends PaneController {

    /**
     * Whether the copy button is disabled.
     * 
     * @type {boolean}
     */
    get isCopyDisabled() {
        const settings = ClipboardPaneController.getCopyButtonSettings(this.getPaneParams());

        return settings.disabled;
    }

    /**
     * Whether the paste button is disabled.
     * 
     * @type {boolean}
     */
    get isPasteDisabled() {
        const settings = ClipboardPaneController.getPasteButtonSettings(this.getPaneParams());

        return settings.disabled;
    }

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<ClipboardPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {},
        computedData: {},
        settings: {
            disabled: false,
            hidden: false,
            disableCopy: false,
            disablePaste: false,
        },
    };

    /**
     * Obtains the settings for the copy button.
     * 
     * @param {Immutable<ClipboardPaneElementParams>} paneParams
     * The parameters of the pane.
     * @returns {{ title: string, disabled: boolean, hidden: boolean }} The requested settings.
     */
    static getCopyButtonSettings({ settings: { disabled, hidden, disableCopy } }) {
        return {
            title: 'Copy',
            disabled: disabled || disableCopy,
            hidden: hidden,
        };
    }

    /**
     * Obtains the settings for the paste button.
     * 
     * @param {Immutable<ClipboardPaneElementParams>} paneParams
     * The parameters of the pane.
     * @returns {{ title: string, disabled: boolean, hidden: boolean }} The requested settings.
     */
    static getPasteButtonSettings({ settings: { disabled, hidden, disablePaste } }) {
        return {
            title: 'Paste',
            disabled: disabled || disablePaste,
            hidden: hidden,
        };
    }

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link ClipboardPaneElementParams}.
     * 
     * @returns {PaneElementFactory<ClipboardPaneElementParams, ClipboardPaneControllerEventMap>}
     * The resulting pane element factory.
     */
    static elementFactory() {
        /**
         * @type {PaneElementFactoryBuilder<ClipboardPaneElementParams,
         * ClipboardPaneControllerEventMap>}
         */
        const builder = new PaneElementFactoryBuilder(
            this.FACTORY_PARAMS,
            ['click-copy', 'click-paste'],
        );

        return builder.sequential([
            builder.tableRow([
                {
                    factory: builder.button({
                        options: (paneParams) => this.getCopyButtonSettings(paneParams),
                        eventHandlers: {
                            click: (paneElem) => paneElem.dispatchEvent({ type: 'click-copy' }),
                        },
                    }),
                    // The default width would otherwise be the full width of the row
                    options: { minWidth: '128px', width: '50%' },
                },
                {
                    factory: builder.button({
                        options: (paneParams) => this.getPasteButtonSettings(paneParams),
                        eventHandlers: {
                            click: (paneElem) => paneElem.dispatchEvent({ type: 'click-paste' }),
                        },
                    }),
                    // The default width would otherwise be the full width of the row
                    options: { minWidth: '128px', width: '50%' },
                },
            ], {
                options: ({ settings: { disabled, hidden } }) => ({
                    label: 'Actions:',
                    disabled: disabled,
                    hidden: hidden,
                }),
                modifyHTML: (element) => {
                    const labelContainer = element.querySelector('.tp-lblv_l');
                    if (labelContainer instanceof HTMLDivElement) {
                        labelContainer.style.display = 'none';
                    } else {
                        console.warn('Cannot find label container');
                    }

                    const cellsContainer = element.querySelector('.tp-lblv_v');
                    if (cellsContainer instanceof HTMLDivElement) {
                        cellsContainer.style.width = '100%';
                    } else {
                        console.warn('Cannot find cells container');
                    }
                },
            }),
        ]);
    }

    /**
     * Data processor to pass into {@link PaneController}.
     * 
     * @type {PaneControllerDataProcessor<ClipboardPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => ({}),
        outputData: (paneParams) => ({}),
    };

    /**
     * Creates a new UI to configure the settings of a {@link LabelBoxClipboard}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<ClipboardPaneControllerState>} initialState
     * The initial state to set.
     * @returns {ClipboardPaneController} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new ClipboardPaneController(
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
