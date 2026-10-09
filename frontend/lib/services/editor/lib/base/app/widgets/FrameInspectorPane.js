import { Pane } from 'tweakpane';

import { CoordBounds } from '../../../../../../common/lib/spatial';
import { Timestamp } from '../../../../../../common/lib/utils';

import { PaneController, PaneElementFactoryBuilder } from '../../widgets';

/**
 * @template T
 * @typedef {import('../../../../../../common/lib/utils').TypeUtils.Immutable<T>} Immutable
 */

/**
 * @template P
 * @typedef {import('../../widgets').PaneElementFactory<P>} PaneElementFactory
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
 * Represents the status of a frame.
 * 
 * @typedef {'incomplete' | 'complete'} FrameStatus
 */

/**
 * @typedef {object} FrameInspectorInputtedData
 * @property {?CoordBounds} xBounds The `x` boundaries of the selected frame.
 * @property {?CoordBounds} yBounds The `y` boundaries of the selected frame.
 * @property {?CoordBounds} zBounds The `z` boundaries of the selected frame.
 * @property {?CoordBounds} tBounds The `t` boundaries` of the selected frame.
 * @property {FrameStatus} status The status of the selected frame.
 */

/**
 * @typedef {object} FrameInspectorPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 * @property {boolean} disableSTInput `true` if setting the spatiotemporal boundaries is disabled;
 * otherwise, `false`.
 */

/**
 * @typedef {object} FrameInspectorState
 * @property {?CoordBounds} xBounds The `x` boundaries of the selected frame.
 * @property {?CoordBounds} yBounds The `y` boundaries of the selected frame.
 * @property {?CoordBounds} zBounds The `z` boundaries of the selected frame.
 * @property {?CoordBounds} tBounds The `t` boundaries` of the selected frame.
 * @property {FrameStatus} status The status of the selected frame.
 */

/**
 * @typedef {{
 *     inputtedData: FrameInspectorInputtedData;
 *     computedData: {};
 *     settings: FrameInspectorPaneSettings;
 *     internalData: {};
 *     outputData: FrameInspectorState;
 * }} FrameInspectorPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<FrameInspectorPaneControllerParams>
 * } FrameInspectorPaneElementParams
 */

/**
 * @typedef {PaneControllerState<FrameInspectorPaneControllerParams>
 * } FrameInspectorPaneControllerState
 */

/**
 * Represents a UI to inspect a frame.
 * 
 * @augments PaneController<FrameInspectorPaneControllerParams>
 */
export class FrameInspectorPaneController extends PaneController {

    /**
     * Tests whether the frame status input is disabled.
     * 
     * @returns {boolean} `true` if the input is disabled; otherwise, `false`.
     */
    isStatusSelectEnabled() {
        const settings = FrameInspectorPaneController
            .getCurrentStatusSelectSettings(this.getPaneParams());

        return !settings.disabled;
    }

    /**
     * Cycles to the next frame status.
     * 
     * This is a no-op if the input is disabled.
     */
    cycleStatus() {
        if (!this.isStatusSelectEnabled()) return;

        const allStatuses = FrameInspectorPaneController.currentStatusGridValues;
        const nextIdx = (allStatuses.indexOf(this.inputtedData.status) + 1)
            % allStatuses.length;

        this.updateInputtedData({ status: allStatuses[nextIdx] });

        this.notifyChange();
    }

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<FrameInspectorPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            xBounds: null,
            yBounds: null,
            zBounds: null,
            tBounds: null,
            status: 'incomplete',
        },
        computedData: {},
        settings: {
            disabled: false,
            hidden: false,
            disableSTInput: false,
        },
    };

    /**
     * @readonly
     * @type {ReadonlyArray<FrameStatus>}
     */
    static currentStatusGridValues = ['incomplete', 'complete'];

    /**
     * @readonly
     * @type {ReadonlyArray<string>}
     */
    static currentStatusGridLabels = ['Incomplete', 'Complete'];

    /**
     * Obtains the settings for the status selector.
     * 
     * @param {Immutable<FrameInspectorPaneElementParams>} paneParams
     * The parameters of the pane.
     * @returns {{
     *     view: 'radiogrid',
     *     groupName: string,
     *     label: string;
     *     size: [number, number];
     *     cells: (x: number, y: number) => { title: string, value: FrameStatus };
     *     disabled: boolean;
     *     hidden: boolean;
     * }} The requested settings.
     */
    static getCurrentStatusSelectSettings({ settings: { disabled, hidden } }) {
        return {
            view: 'radiogrid',
            groupName: 'status',
            size: [2, 1],
            label: 'Frame Status',
            cells: (x) => ({
                title: this.currentStatusGridLabels[x],
                value: this.currentStatusGridValues[x],
            }),
            disabled: disabled,
            hidden: hidden,
        };
    }

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link FrameInspectorPaneElementParams}.
     * 
     * @returns {PaneElementFactory<FrameInspectorPaneElementParams>}
     * The resulting pane element factory.
     */
    static elementFactory() {
        /**
         * @type {PaneElementFactoryBuilder<FrameInspectorPaneElementParams>}
         */
        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        /**
         * @type {(value: string) => ?CoordBounds}
         */
        const coordBoundsParser = (value) => {
            const parsedValue = JSON.parse(value);
            if (parsedValue == null || !Array.isArray(parsedValue)) return null;

            const [min, max] = parsedValue.map((x) => ((x == null) ? null : Number(x)));
            return CoordBounds.create({ min, max });
        };

        /**
         * @type {(value: ?CoordBounds) => string}
         */
        const coordBoundsFormatter = (value) => `[${value?.min ?? null}, ${value?.max ?? null}]`;

        /**
         * @type {(value: string) => ?CoordBounds}
         */
        const timestampBoundsParser = (value) => {
            const parsedValue = JSON.parse(value);
            if (parsedValue == null || !Array.isArray(parsedValue)) return null;

            const [min, max] = parsedValue.map((x) => ((x == null) ? null : Number(x)));
            return CoordBounds.create({ min, max });
        };

        /**
         * @type {(value: ?number) => string}
         */
        const boundFormatter = (value) => (value == null ? 'null' : new Timestamp(value).toISOString());

        /**
         * @type {(value: ?CoordBounds) => string}
         */
        const timestampBoundsFormatter = (value) => `[${boundFormatter(value?.min ?? null)}, ${boundFormatter(value?.max ?? null)}]`;

        return builder.sequential([
            builder.text({
                options: ({
                    inputtedData: { xBounds },
                    settings: { disabled, disableSTInput, hidden },
                }) => ({
                    view: 'text',
                    label: 'X Bounds',
                    value: xBounds,
                    parse: coordBoundsParser,
                    format: coordBoundsFormatter,
                    disabled: disabled || disableSTInput,
                    hidden: hidden,
                }),
                modifyHTML: (element) => {
                    const textContainer = element.querySelector('.tp-lblv_v');
                    if (textContainer instanceof HTMLDivElement) {
                        textContainer.style.width = '66%';
                    } else {
                        console.warn('Cannot find text container');
                    }
                },
            }),
            builder.text({
                options: ({
                    inputtedData: { yBounds },
                    settings: { disabled, disableSTInput, hidden },
                }) => ({
                    view: 'text',
                    label: 'Y Bounds',
                    value: yBounds,
                    parse: coordBoundsParser,
                    format: coordBoundsFormatter,
                    disabled: disabled || disableSTInput,
                    hidden: hidden,
                }),
                modifyHTML: (element) => {
                    const textContainer = element.querySelector('.tp-lblv_v');
                    if (textContainer instanceof HTMLDivElement) {
                        textContainer.style.width = '66%';
                    } else {
                        console.warn('Cannot find text container');
                    }
                },
            }),
            builder.text({
                options: ({
                    inputtedData: { zBounds },
                    settings: { disabled, disableSTInput, hidden },
                }) => ({
                    view: 'text',
                    label: 'Z Bounds',
                    value: zBounds,
                    parse: coordBoundsParser,
                    format: coordBoundsFormatter,
                    disabled: disabled || disableSTInput,
                    hidden: hidden,
                }),
                modifyHTML: (element) => {
                    const textContainer = element.querySelector('.tp-lblv_v');
                    if (textContainer instanceof HTMLDivElement) {
                        textContainer.style.width = '66%';
                    } else {
                        console.warn('Cannot find text container');
                    }
                },
            }),
            builder.text({
                options: ({
                    inputtedData: { tBounds },
                    settings: { disabled, disableSTInput, hidden },
                }) => ({
                    view: 'text',
                    label: 'T Bounds',
                    value: tBounds,
                    parse: timestampBoundsParser,
                    format: timestampBoundsFormatter,
                    disabled: disabled || disableSTInput,
                    hidden: hidden,
                }),
                modifyHTML: (element) => {
                    const textContainer = element.querySelector('.tp-lblv_v');
                    if (textContainer instanceof HTMLDivElement) {
                        textContainer.style.width = '66%';
                    } else {
                        console.warn('Cannot find text container');
                    }
                },
            }),
            builder.separator({
                options: ({ settings: { disabled, hidden } }) => ({ disabled, hidden }),
            }),
            builder.input(['inputtedData', 'status'], {
                options: (paneParams) => this.getCurrentStatusSelectSettings(paneParams),
                modifyHTML: (element) => {
                    const buttonsContainer = element.querySelector('.tp-lblv_v');
                    if (buttonsContainer instanceof HTMLDivElement) {
                        buttonsContainer.style.width = '66%';
                    } else {
                        console.warn('Cannot find buttons container');
                    }
                },
            }),
        ]);
    }

    /**
     * Data processor to pass into {@link PaneController}.
     * 
     * @type {PaneControllerDataProcessor<FrameInspectorPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => ({}),
        outputData: (paneParams) => ({
            xBounds: paneParams.inputtedData.xBounds,
            yBounds: paneParams.inputtedData.yBounds,
            zBounds: paneParams.inputtedData.zBounds,
            tBounds: paneParams.inputtedData.tBounds,
            status: paneParams.inputtedData.status,
        }),
    };

    /**
     * Creates a new UI to inspect a frame.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<FrameInspectorPaneControllerState>} initialState
     * The initial state to set.
     * @returns {FrameInspectorPaneController} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new FrameInspectorPaneController(
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
