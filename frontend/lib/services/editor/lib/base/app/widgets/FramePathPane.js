import { Pane } from 'tweakpane';

import { FrameSortFunction } from '../../nav';
import { PaneController, PaneElementFactoryBuilder } from '../../widgets';

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
 * @typedef {import('../../widgets').PaneElementFactory<P, E>} PaneElementFactory
 */

/**
 * @typedef {import('../../widgets').PaneControllerDataTypes} PaneControllerDataTypes
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('../../widgets').PaneElementParams<P>} PaneElementParams
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('../../widgets').PaneControllerDataProcessor<P>} PaneControllerDataProcessor
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('../../widgets').PaneControllerState<P>} PaneControllerState
 */

/**
 * @typedef {object} FramePathInputtedData
 * @property {FrameSortFunction} sortFunc The function used to sort the available
 * frames in order to construct the path.
 * @property {number} stride The number of frames traversed in each step through
 * the available frames, in order to construct the path.
 * If this is a negative number, the frames are traversed backwards.
 * @property {boolean} showAllFrames Whether to show all frames instead of just the frames
 * in the current path.
 * @property {number} currentId The unique identifier of the current frame along `axis`.
 * @property {number} currentIdx The index of the current frame along `axis`.
 * @property {number} fps The number of frames to play per second.
 */

/**
 * @typedef {object} FramePathComputedData
 * @property {HTMLElement} pathElem An element containing each frame in the
 * current path.
 * @property {number} minIdx The minimum index of the frame that can be selected.
 * @property {number} maxIdx The maximum index of the frame that can be selected.
 * @property {string} playPauseText The text to display in the play/pause button.
 * @property {string} statusText The text to display in the status section.
 * @property {string} bufferText The text to display in the buffer section.
 */

/**
 * @typedef {object} FramePathPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 * @property {boolean} disablePlayPause `true` if the play/pause button is disabled; otherwise,
 * the default behaviour of `disabled` is applied.
 * @property {boolean} disableNav `true` if navigation is disabled; otherwise,
 * the default behaviour of `disabled` is applied.
 * @property {boolean} disableStepPrev `true` if the step previous button is disabled; otherwise,
 * the default behaviour of `disableNav` is applied.
 * @property {boolean} disableStepNext `true` if the step next button is disabled; otherwise,
 * the default behaviour of `disableNav` is applied.
 */

/**
 * @typedef {object} FramePathSource
 * @property {HTMLElement} pathElem An element containing each frame in the
 * current path.
 * @property {number} minIdx The minimum index of the frame that can be selected.
 * @property {number} maxIdx The maximum index of the frame that can be selected.
 * @property {string} playPauseText The text to display in the play/pause button.
 * @property {string} statusText The text to display in the status section.
 * @property {string} bufferText The text to display in the buffer section.
 */

/**
 * @typedef {object} FramePathState
 * @property {FrameSortFunction} sortFunc The function used to sort the available
 * frames in order to construct the path.
 * @property {number} stride The number of frames traversed in each step through
 * the available frames, in order to construct the path.
 * If this is a negative number, the frames are traversed backwards.
 * @property {boolean} showAllFrames Whether to show all frames instead of just the frames
 * in the current path.
 * @property {number} currentId The unique identifier of the current frame along `axis`.
 * @property {number} currentIdx The index of the current frame along `axis`.
 * @property {number} fps The number of frames to play per second.
 */

/**
 * @typedef {{
 *     inputtedData: FramePathInputtedData;
 *     computedData: FramePathComputedData;
 *     settings: FramePathPaneSettings;
 *     internalData: ?FramePathSource;
 *     outputData: FramePathState;
 * }} FramePathPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<FramePathPaneControllerParams>
 * } FramePathPaneElementParams
 */

/**
 * @typedef {PaneControllerState<FramePathPaneControllerParams>
 * } FramePathPaneControllerState
 */

/**
 * Defines each event that can be dispatched by {@link FramePathPaneController}.
 * 
 * @typedef {object} FramePathPaneControllerEventMap
 * @property {{}} click-stepPrev The event when the step previous button is clicked.
 * @property {{}} click-playPause The event when the play/pause button is clicked.
 * @property {{}} click-stepNext The event when the step next button is clicked.
 */

/**
 * Represents a UI to traverse a sequence of frames.
 * 
 * @augments {PaneController<FramePathPaneControllerParams, FramePathPaneControllerEventMap>}
 */
export class FramePathPaneController extends PaneController {

    /**
     * Clicks on the step previous button.
     * 
     * This is a no-op if the button is disabled.
     */
    clickStepPrevButton() {
        const settings = FramePathPaneController.getStepPrevButtonSettings(this.getPaneParams());
        if (settings.disabled) return;

        this.paneEvents.dispatchEvent({ type: 'click-stepPrev' });
    }

    /**
     * Clicks on the play/pause button.
     * 
     * This is a no-op if the button is disabled.
     */
    clickPlayPauseButton() {
        const settings = FramePathPaneController.getPlayPauseButtonSettings(this.getPaneParams());
        if (settings.disabled) return;

        this.paneEvents.dispatchEvent({ type: 'click-playPause' });
    }

    /**
     * Clicks on the step next button.
     * 
     * This is a no-op if the button is disabled.
     */
    clickStepNextButton() {
        const settings = FramePathPaneController.getStepNextButtonSettings(this.getPaneParams());
        if (settings.disabled) return;

        this.paneEvents.dispatchEvent({ type: 'click-stepNext' });
    }

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<FramePathPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            sortFunc: FrameSortFunction.TXY,
            stride: 5,
            showAllFrames: true,
            currentId: -1,
            currentIdx: 0,
            fps: 3,
        },
        computedData: {
            pathElem: document.createElement('div'),
            minIdx: 0,
            maxIdx: 0,
            playPauseText: '',
            statusText: '',
            bufferText: '',
        },
        settings: {
            disabled: false,
            hidden: false,
            disablePlayPause: false,
            disableNav: false,
            disableStepPrev: false,
            disableStepNext: false,
        },
    };

    /**
     * Obtains the settings for the step previous button.
     * 
     * @param {Immutable<FramePathPaneElementParams>} paneParams
     * The parameters of the pane.
     * @returns {{ title: string, disabled: boolean, hidden: boolean }} The requested settings.
     */
    static getStepPrevButtonSettings(
        { settings: { disabled, hidden, disableNav, disableStepPrev } },
    ) {
        return {
            title: '< Step',
            disabled: disabled || disableNav || disableStepPrev,
            hidden: hidden,
        };
    }

    /**
     * Obtains the settings for the play/pause button.
     * 
     * @param {Immutable<FramePathPaneElementParams>} paneParams
     * The parameters of the pane.
     * @returns {{ title: string, disabled: boolean, hidden: boolean }} The requested settings.
     */
    static getPlayPauseButtonSettings({
        computedData: { playPauseText },
        settings: { disabled, hidden, disablePlayPause },
    }) {
        return {
            title: playPauseText,
            disabled: disabled || disablePlayPause,
            hidden: hidden,
        };
    }

    /**
     * Obtains the settings for the step next button.
     * 
     * @param {Immutable<FramePathPaneElementParams>} paneParams
     * The parameters of the pane.
     * @returns {{ title: string, disabled: boolean, hidden: boolean }} The requested settings.
     */
    static getStepNextButtonSettings(
        { settings: { disabled, hidden, disableNav, disableStepNext } },
    ) {
        return {
            title: 'Step >',
            disabled: disabled || disableNav || disableStepNext,
            hidden: hidden,
        };
    }

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link FramePathPaneElementParams}.
     * 
     * @returns {PaneElementFactory<FramePathPaneElementParams, FramePathPaneControllerEventMap>}
     * The resulting pane element factory.
     */
    static elementFactory() {
        /**
         * @type {PaneElementFactoryBuilder<FramePathPaneElementParams,
         * FramePathPaneControllerEventMap>}
         */
        const builder = new PaneElementFactoryBuilder(
            this.FACTORY_PARAMS,
            ['click-stepPrev', 'click-playPause', 'click-stepNext'],
        );

        const statusElem = document.createElement('div');

        return builder.sequential([
            builder.folder(
                builder.sequential([
                    builder.list(['inputtedData', 'sortFunc'], {
                        options: ({ settings: { disabled, hidden } }) => ({
                            label: 'Sort by axes:',
                            options: Object.values(FrameSortFunction).map(
                                (sortFunc) => ({ text: sortFunc.toString(), value: sortFunc })),
                            disabled: disabled,
                            hidden: hidden,
                        }),
                    }),
                    builder.input(['inputtedData', 'stride'], {
                        options: ({ settings: { disabled, hidden } }) => ({
                            label: 'Stride',
                            min: -50,
                            max: 50,
                            step: 1,
                            disabled: disabled,
                            hidden: hidden,
                        }),
                    }),
                ]),
                {
                    options: ({ settings: { disabled, hidden } }) => ({
                        title: 'Path Setup',
                        disabled: disabled,
                        hidden: hidden,
                    }),
                },
            ),
            builder.folder(
                builder.sequential([
                    builder.htmlContainer({
                        options: ({ computedData: { pathElem } }) => ({ innerElem: pathElem }),
                    }),
                    builder.separator({
                        options: ({ settings: { disabled, hidden } }) => ({ disabled, hidden }),
                    }),
                    builder.input(['inputtedData', 'showAllFrames'], {
                        options: ({ settings: { disabled, hidden } }) => ({
                            label: 'Show all frames',
                            disabled: disabled,
                            hidden: hidden,
                        }),
                    }),
                    builder.input(['inputtedData', 'currentId'], {
                        options: ({ settings: { disabled, hidden, disableNav } }) => ({
                            label: 'Current Frame ID',
                            step: 1,
                            disabled: disabled || disableNav,
                            hidden: hidden,
                        }),
                    }),
                ]),
                {
                    options: ({ settings: { disabled, hidden } }) => ({
                        title: 'Frames',
                        disabled: disabled,
                        hidden: hidden,
                    }),
                },
            ),
            builder.folder(
                builder.sequential([
                    builder.input(['inputtedData', 'currentIdx'], {
                        options: ({
                            computedData: { minIdx, maxIdx },
                            settings: { disabled, hidden, disableNav },
                        }) => ({
                            label: 'Current index along path:',
                            min: minIdx,
                            max: maxIdx,
                            step: 1,
                            disabled: disabled || disableNav,
                            hidden: hidden,
                        }),
                    }),
                    builder.input(['inputtedData', 'fps'], {
                        options: ({ settings: { disabled, hidden } }) => ({
                            label: 'FPS',
                            min: 1,
                            max: 10,
                            step: 1,
                            disabled: disabled,
                            hidden: hidden,
                        }),
                    }),
                    builder.separator({
                        options: ({ settings: { disabled, hidden } }) => ({ disabled, hidden }),
                    }),
                    builder.htmlContainer({
                        options: { innerElem: statusElem },
                        modifyHTML: (element, { computedData: { statusText, bufferText } }) => {
                            element.style.paddingLeft = 'var(--cnt-h-p)';

                            statusElem.textContent = `Status: ${statusText} | Buffer: ${bufferText}`;
                            statusElem.style.paddingLeft = '4px';
                        },
                    }),
                    builder.tableRow([
                        {
                            factory: builder.button({
                                options: (paneParams) => this.getStepPrevButtonSettings(paneParams),
                                modifyHTML: (element) => {
                                    element.style.marginTop = 'var(--bld-s)';
                                },
                                eventHandlers: {
                                    click: (paneElem) => paneElem.dispatchEvent({
                                        type: 'click-stepPrev',
                                    }),
                                },
                            }),
                            // The default width would otherwise be the full width of the row
                            options: { minWidth: '96px', width: '33%' },
                        },
                        {
                            factory: builder.button({
                                options: (paneParams) => this
                                    .getPlayPauseButtonSettings(paneParams),
                                eventHandlers: {
                                    click: (paneElem) => paneElem.dispatchEvent({
                                        type: 'click-playPause',
                                    }),
                                },
                            }),
                            // The default width would otherwise be the full width of the row
                            options: { minWidth: '96px', width: '33%' },
                        },
                        {
                            factory: builder.button({
                                options: (paneParams) => this.getStepNextButtonSettings(paneParams),
                                eventHandlers: {
                                    click: (paneElem) => paneElem.dispatchEvent({
                                        type: 'click-stepNext',
                                    }),
                                },
                            }),
                            // The default width would otherwise be the full width of the row
                            options: { minWidth: '96px', width: '33%' },
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

                            const buttonsContainer = element.querySelector('.tp-lblv_v');
                            if (buttonsContainer instanceof HTMLDivElement) {
                                buttonsContainer.style.width = '100%';
                            } else {
                                console.warn('Cannot find buttons container');
                            }
                        },
                    }),
                ]),
                {
                    options: ({ settings: { disabled, hidden } }) => ({
                        title: 'Playback',
                        disabled: disabled,
                        hidden: hidden,
                    }),
                },
            ),
        ]);
    }

    /**
     * Data processor to pass into {@link PaneController}.
     * 
     * @type {PaneControllerDataProcessor<FramePathPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => ({
            pathElem: internalData?.pathElem ?? document.createElement('div'),
            minIdx: internalData?.minIdx ?? 0,
            maxIdx: internalData?.maxIdx ?? 0,
            playPauseText: internalData?.playPauseText ?? '',
            statusText: internalData?.statusText ?? '',
            bufferText: internalData?.bufferText ?? '',
        }),
        outputData: (paneParams) => ({
            sortFunc: paneParams.inputtedData.sortFunc,
            stride: paneParams.inputtedData.stride,
            showAllFrames: paneParams.inputtedData.showAllFrames,
            currentId: paneParams.inputtedData.currentId,
            currentIdx: paneParams.inputtedData.currentIdx,
            fps: paneParams.inputtedData.fps,
        }),
    };

    /**
     * Creates a new UI to traverse a sequence of frames.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<FramePathPaneControllerState>} initialState
     * The initial state to set.
     * @returns {FramePathPaneController} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new FramePathPaneController(
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
