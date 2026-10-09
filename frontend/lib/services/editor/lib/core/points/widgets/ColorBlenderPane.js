import * as math from 'mathjs';
import _ from 'lodash';
import { Pane } from 'tweakpane';

import { PaneController, PaneControllerDataMapper, PaneElementFactoryBuilder } from '../../../base';

import { ALL_CMAPS } from '../../colors';
import { NormalizedValueFunc, ApplyColormap, ComposeRGB } from '../data';

/**
 * @template T
 * @typedef {import('../../../../../../common/lib/utils').TypeUtils.Expand<T>} Expand
 */

/**
 * @template T
 * @typedef {import('../../../../../../common/lib/utils').TypeUtils.Immutable<T>} Immutable
 */

/**
 * @template P
 * @typedef {import('../../../base').PaneElementFactory<P>} PaneElementFactory
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
 * @typedef {import('../../colors').Colormap} Colormap
 */

/**
 * @typedef {import('../data').ColorBlender} ColorBlender
 */

/**
 * @typedef {import('../data').PointBuffer} PointBuffer
 */

/**
 * @typedef {object} NormalizedValueFuncInputtedData
 * @property {number} channelIdx The index of the channel to input to the function.
 * @property {number} vmin The minimum value to output by the function.
 * @property {number} vmax The maximum value to output by the function.
 * @property {boolean} useZScore If `true`, `vmin` and `vmax` are taken as standard scores;
 * otherwise, they are taken as static values.
 */

/**
 * @typedef {object} NormalizedValueFuncComputedData
 * @property {ReadonlyArray<string>} channelNames The name of each channel that can be
 * selected from.
 * @property {number} min The minimum value in the data.
 * @property {number} max The maximum value in the data.
 * @property {number} mean The mean of the data.
 * @property {number} std The standard deviation of the data.
 */

/**
 * @typedef {object} NormalizedValueFuncPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 */

/**
 * @typedef {object} NormalizedValueFuncTarget
 * @property {Readonly<PointBuffer>} buffer A buffer containing the values to input to the function.
 * @property {ReadonlyArray<string>} channelNames The name of each channel that can be
 * selected from.
 */

/**
 * @typedef {{
 *     inputtedData: NormalizedValueFuncInputtedData;
 *     computedData: NormalizedValueFuncComputedData;
 *     settings: NormalizedValueFuncPaneSettings;
 *     internalData: ?NormalizedValueFuncTarget;
 *     outputData: ?NormalizedValueFunc;
 * }} NormalizedValueFuncPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<NormalizedValueFuncPaneControllerParams>
 * } NormalizedValueFuncPaneElementParams
 */

/**
 * @typedef {PaneControllerState<NormalizedValueFuncPaneControllerParams>
 * } NormalizedValueFuncPaneControllerState
 */

/**
 * Represents a UI to configure a {@link NormalizedValueFunc}.
 * 
 * @augments PaneController<NormalizedValueFuncPaneControllerParams>
 */
export class NormalizedValueFuncPaneController extends PaneController {

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<NormalizedValueFuncPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            channelIdx: 0,
            vmin: -2,
            vmax: +2,
            useZScore: true,
        },
        computedData: {
            channelNames: [''],
            min: -10,
            max: +10,
            mean: 0,
            std: 1,
        },
        settings: {
            disabled: false,
            hidden: false,
        },
    };

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link NormalizedValueFuncPaneElementParams}.
     * 
     * @returns {PaneElementFactory<NormalizedValueFuncPaneElementParams>}
     * The resulting pane element factory.
     */
    static elementFactory() {
        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        return builder.sequential([
            builder.input(['inputtedData', 'channelIdx'], {
                options: ({ computedData: { channelNames }, settings: { disabled, hidden } }) => ({
                    label: 'Channel',
                    options: channelNames.map((v, i) => ({ text: `${i} (${v})`, value: i })),
                    disabled: disabled,
                    hidden: hidden,
                }),
            }),
            builder.input(['inputtedData', 'vmin'], {
                options: ({
                    inputtedData: { useZScore },
                    computedData: { min, max, mean, std },
                    settings: { disabled, hidden },
                }) => ({
                    label: useZScore ? 'Min. Z-Score' : 'Min. Value',
                    min: useZScore ? ((min - mean) / std) : min,
                    max: useZScore ? ((max - mean) / std) : max,
                    step: 0.1,
                    disabled: disabled,
                    hidden: hidden,
                }),
            }),
            builder.input(['inputtedData', 'vmax'], {
                options: ({
                    inputtedData: { useZScore },
                    computedData: { min, max, mean, std },
                    settings: { disabled, hidden },
                }) => ({
                    label: useZScore ? 'Max. Z-Score' : 'Max. Value',
                    min: useZScore ? ((min - mean) / std) : min,
                    max: useZScore ? ((max - mean) / std) : max,
                    step: 0.1,
                    disabled: disabled,
                    hidden: hidden,
                }),
            }),
            builder.input(['inputtedData', 'useZScore'], {
                options: ({ settings: { disabled, hidden } }) => ({
                    label: 'Use Z-Score',
                    disabled: disabled,
                    hidden: hidden,
                }),
            }),
        ]).withState(({ params: prevParams, state: prevState }, params) => {
            /**
             * @type {NormalizedValueFuncPaneElementParams}
             */
            const nextParams = _.cloneDeep(params);

            /**
             * @type {{}}
             */
            const nextState = _.cloneDeep(prevState);

            if (prevParams.inputtedData.useZScore !== params.inputtedData.useZScore) {
                const nextUseZScore = params.inputtedData.useZScore;

                if (prevParams.computedData.mean === params.computedData.mean
                    && prevParams.computedData.std === params.computedData.std) {
                    const { mean, std } = params.computedData;

                    // Avoid NaN values
                    if (std !== 0) {
                        /**
                         * Update the slider values to be based on absolute or normalized values
                         * 
                         * @type {(bound: number) => number}
                         */
                        const transformBound = nextUseZScore
                            // Absolute -> Normed
                            ? (bound) => (bound - mean) / std
                            // Normed -> Absolute
                            : (bound) => (bound * std) + mean;

                        nextParams.inputtedData.vmin = transformBound(params.inputtedData.vmin);
                        nextParams.inputtedData.vmax = transformBound(params.inputtedData.vmax);
                    }
                }
            }

            return { params: nextParams, state: nextState };
        }, {});
    }

    /**
     * @type {NormalizedValueFuncComputedData}
     */
    static #DEFAULT_COMPUTED_DATA = {
        channelNames: ['X', 'Y', 'Z'],
        min: -10,
        max: +10,
        mean: 0,
        std: 1,
    };

    /**
     * Data processor to pass into {@link PaneController}.
     * 
     * @type {PaneControllerDataProcessor<NormalizedValueFuncPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => {
            const { channelIdx } = inputtedData;
            if (internalData == null) return this.#DEFAULT_COMPUTED_DATA;

            const { buffer, channelNames } = internalData;
            const values = buffer.getChannel(channelIdx);
            if (values.length === 0) return this.#DEFAULT_COMPUTED_DATA;

            return {
                channelNames: channelNames,
                min: math.min(values),
                max: math.max(values),
                mean: math.mean(values),
                std: math.std(values),
            };
        },
        outputData: (paneParams) => {
            const { inputtedData: { channelIdx, vmin, vmax, useZScore } } = paneParams;

            return new NormalizedValueFunc(
                channelIdx,
                useZScore ? NormalizedValueFunc.fromStdScore(vmin) : vmin,
                useZScore ? NormalizedValueFunc.fromStdScore(vmax) : vmax,
            );
        },
    };

    /**
     * Creates a new UI to configure a {@link NormalizedValueFunc}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<NormalizedValueFuncPaneControllerState>} initialState
     * The initial state to set.
     * @returns {NormalizedValueFuncPaneControllerState} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new NormalizedValueFuncPaneController(
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

/**
 * @typedef {object} ApplyColormapInputtedData
 * @property {string} colormapName The name of the active colormap.
 * @property {NormalizedValueFuncPaneControllerParams['inputtedData']} valueFunc
 * Specifies the {@link NormalizedValueFunc} used to transform the values to input to the blender.
 */

/**
 * @typedef {object} ApplyColormapComputedData
 * @property {ReadonlyMap<string, Colormap>} colormaps Indexes each colormap that can be
 * selected from by its name.
 * @property {NormalizedValueFuncPaneControllerParams['computedData']} valueFunc
 * Specifies the {@link NormalizedValueFunc} used to transform the values to input to the blender.
 */

/**
 * @typedef {NormalizedValueFuncPaneControllerParams['settings']} ApplyColormapPaneSettings
 */

/**
 * @typedef {NormalizedValueFuncPaneControllerParams['internalData']} ApplyColormapTarget
 */

/**
 * @typedef {{
 *     inputtedData: ApplyColormapInputtedData;
 *     computedData: ApplyColormapComputedData;
 *     settings: ApplyColormapPaneSettings;
 *     internalData: ?ApplyColormapTarget;
 *     outputData: ?ApplyColormap;
 * }} ApplyColormapPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<ApplyColormapPaneControllerParams>} ApplyColormapPaneElementParams
 */

/**
 * @typedef {PaneControllerState<ApplyColormapPaneControllerParams>
 * } ApplyColormapPaneControllerState
 */

/**
 * Represents a UI to configure a {@link ApplyColormap}.
 * 
 * @augments PaneController<ApplyColormapPaneControllerParams>
 */
export class ApplyColormapPaneController extends PaneController {

    /**
     * @type {ReadonlyMap<string, Colormap>}
     */
    static #COLORMAPS = new Map(ALL_CMAPS.map((v) => [v.name, v]));

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {ApplyColormapPaneElementParams}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            colormapName: 'viridis',
            valueFunc: NormalizedValueFuncPaneController.FACTORY_PARAMS.inputtedData,
        },
        computedData: {
            colormaps: this.#COLORMAPS,
            valueFunc: NormalizedValueFuncPaneController.FACTORY_PARAMS.computedData,
        },
        settings: {
            ...NormalizedValueFuncPaneController.FACTORY_PARAMS.settings,
        },
    };

    /**
     * @type {PaneControllerDataMapper<
     * ApplyColormapPaneControllerParams,
     * NormalizedValueFuncPaneControllerParams>}
     */
    static #valueFuncDataMapper = new PaneControllerDataMapper({
        outerToInner: {
            inputtedData: (outerInputted) => outerInputted.valueFunc,
            internalData: (outerInternal) => outerInternal,
            computedData: (outer) => outer.computedData.valueFunc,
            settings: (outer) => outer.settings,
        },
        innerToOuter: {
            inputtedData: (innerInputted) => ({ valueFunc: innerInputted }),
        },
    });

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link ApplyColormapPaneElementParams}.
     * 
     * @returns {PaneElementFactory<ApplyColormapPaneElementParams>}
     * The resulting pane element factory.
     */
    static elementFactory() {
        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        return builder.sequential([
            builder.input(['inputtedData', 'colormapName'], {
                options: ({ computedData: { colormaps }, settings: { disabled, hidden } }) => ({
                    label: 'Colormap',
                    options: Array.from(colormaps.keys(), (v) => ({ text: v, value: v })),
                    disabled: disabled,
                    hidden: hidden,
                }),
            }),
            builder.mapped(
                NormalizedValueFuncPaneController.elementFactory(),
                this.#valueFuncDataMapper.paramsMapper(),
                builder.identityEventMapper(),
            ),
        ]);
    }

    /**
     * Data processor to pass into {@link PaneController}.
     * 
     * @type {PaneControllerDataProcessor<ApplyColormapPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => {
            const colormaps = this.#COLORMAPS;

            const valueFuncComputedData = NormalizedValueFuncPaneController.DATA_PROCESSOR
                .computeData(
                    this.#valueFuncDataMapper.outerToInner.inputtedData(inputtedData),
                    this.#valueFuncDataMapper.outerToInner.internalData(internalData),
                );

            return {
                colormaps: colormaps,
                valueFunc: valueFuncComputedData,
            };
        },
        outputData: (paneParams) => {
            const { inputtedData: { colormapName }, computedData: { colormaps } } = paneParams;
            const colormap = colormaps.get(colormapName);
            if (colormap == null) return null;

            const valueFunc = NormalizedValueFuncPaneController.DATA_PROCESSOR
                .outputData(this.#valueFuncDataMapper.paramsMapper().outerToInner(paneParams));
            if (valueFunc == null) return null;

            return new ApplyColormap(colormap, valueFunc);
        },
    };

    /**
     * Creates a new UI to configure a {@link ApplyColormap}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<ApplyColormapPaneControllerState>} initialState
     * The initial state to set.
     * @returns {ApplyColormapPaneControllerState} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new ApplyColormapPaneController(
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

/**
 * @typedef {object} ComposeRGBInputtedData
 * @property {NormalizedValueFuncPaneControllerParams['inputtedData']} valueFuncR Specifies the
 * {@link NormalizedValueFunc} to transform the values to input for the red intensity.
 * @property {NormalizedValueFuncPaneControllerParams['inputtedData']} valueFuncG Specifies the
 * {@link NormalizedValueFunc} to transform the values to input for the green intensity.
 * @property {NormalizedValueFuncPaneControllerParams['inputtedData']} valueFuncB Specifies the
 * {@link NormalizedValueFunc} to transform the values to input for the blue intensity.
 */

/**
 * @typedef {object} ComposeRGBComputedData
 * @property {NormalizedValueFuncPaneControllerParams['computedData']} valueFuncR Specifies the
 * {@link NormalizedValueFunc} to transform the values to input for the red intensity.
 * @property {NormalizedValueFuncPaneControllerParams['computedData']} valueFuncG Specifies the
 * {@link NormalizedValueFunc} to transform the values to input for the green intensity.
 * @property {NormalizedValueFuncPaneControllerParams['computedData']} valueFuncB Specifies the
 * {@link NormalizedValueFunc} to transform the values to input for the blue intensity.
 */

/**
 * @typedef {NormalizedValueFuncPaneControllerParams['settings']} ComposeRGBPaneSettings
 */

/**
 * @typedef {NormalizedValueFuncPaneControllerParams['internalData']} ComposeRGBTarget
 */

/**
 * @typedef {{
 *     inputtedData: ComposeRGBInputtedData;
 *     computedData: ComposeRGBComputedData;
 *     settings: ComposeRGBPaneSettings;
 *     internalData: ?ComposeRGBTarget;
 *     outputData: ?ComposeRGB;
 * }} ComposeRGBPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<ComposeRGBPaneControllerParams>} ComposeRGBPaneElementParams
 */

/**
 * @typedef {PaneControllerState<ComposeRGBPaneControllerParams>} ComposeRGBPaneControllerState
 */

/**
 * Represents a UI to configure a {@link ComposeRGB}.
 * 
 * @augments PaneController<ComposeRGBPaneControllerParams>
 */
export class ComposeRGBPaneController extends PaneController {

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<ComposeRGBPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            valueFuncR: NormalizedValueFuncPaneController.FACTORY_PARAMS.inputtedData,
            valueFuncG: NormalizedValueFuncPaneController.FACTORY_PARAMS.inputtedData,
            valueFuncB: NormalizedValueFuncPaneController.FACTORY_PARAMS.inputtedData,
        },
        computedData: {
            valueFuncR: NormalizedValueFuncPaneController.FACTORY_PARAMS.computedData,
            valueFuncG: NormalizedValueFuncPaneController.FACTORY_PARAMS.computedData,
            valueFuncB: NormalizedValueFuncPaneController.FACTORY_PARAMS.computedData,
        },
        settings: {
            ...NormalizedValueFuncPaneController.FACTORY_PARAMS.settings,
        },
    };

    /**
     * @type {PaneControllerDataMapper<
     * ComposeRGBPaneControllerParams,
     * NormalizedValueFuncPaneControllerParams>}
     */
    static #valueFuncRDataMapper = new PaneControllerDataMapper({
        outerToInner: {
            inputtedData: (outerInputted) => outerInputted.valueFuncR,
            internalData: (outerInternal) => outerInternal,
            computedData: (outer) => outer.computedData.valueFuncR,
            settings: (outer) => outer.settings,
        },
        innerToOuter: {
            inputtedData: (innerInputted) => ({ valueFuncR: innerInputted }),
        },
    });

    /**
     * @type {PaneControllerDataMapper<
     * ComposeRGBPaneControllerParams,
     * NormalizedValueFuncPaneControllerParams>}
     */
    static #valueFuncGDataMapper = new PaneControllerDataMapper({
        outerToInner: {
            inputtedData: (outerInputted) => outerInputted.valueFuncG,
            internalData: (outerInternal) => outerInternal,
            computedData: (outer) => outer.computedData.valueFuncG,
            settings: (outer) => outer.settings,
        },
        innerToOuter: {
            inputtedData: (innerInputted) => ({ valueFuncG: innerInputted }),
        },
    });

    /**
     * @type {PaneControllerDataMapper<
     * ComposeRGBPaneControllerParams,
     * NormalizedValueFuncPaneControllerParams>}
     */
    static #valueFuncBDataMapper = new PaneControllerDataMapper({
        outerToInner: {
            inputtedData: (outerInputted) => outerInputted.valueFuncB,
            internalData: (outerInternal) => outerInternal,
            computedData: (outer) => outer.computedData.valueFuncB,
            settings: (outer) => outer.settings,
        },
        innerToOuter: {
            inputtedData: (innerInputted) => ({ valueFuncB: innerInputted }),
        },
    });

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link ComposeRGBPaneElementParams}.
     * 
     * @returns {PaneElementFactory<ComposeRGBPaneElementParams>}
     * The resulting pane element factory.
     */
    static elementFactory() {
        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        return builder.tab([
            {
                factory: builder.mapped(
                    NormalizedValueFuncPaneController.elementFactory(),
                    this.#valueFuncRDataMapper.paramsMapper(),
                    builder.identityEventMapper(),
                ),
                options: { title: 'Red' },
            },
            {
                factory: builder.mapped(
                    NormalizedValueFuncPaneController.elementFactory(),
                    this.#valueFuncGDataMapper.paramsMapper(),
                    builder.identityEventMapper(),
                ),
                options: { title: 'Green' },
            },
            {
                factory: builder.mapped(
                    NormalizedValueFuncPaneController.elementFactory(),
                    this.#valueFuncBDataMapper.paramsMapper(),
                    builder.identityEventMapper(),
                ),
                options: { title: 'Blue' },
            },
        ], {
            options: ({ settings: { disabled, hidden } }) => ({ disabled, hidden }),
        });
    }

    /**
     * Data processor to pass into {@link PaneController}.
     * 
     * @type {PaneControllerDataProcessor<ComposeRGBPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => {
            const valueFuncRComputedData = NormalizedValueFuncPaneController.DATA_PROCESSOR
                .computeData(
                    this.#valueFuncRDataMapper.outerToInner.inputtedData(inputtedData),
                    this.#valueFuncRDataMapper.outerToInner.internalData(internalData),
                );
            const valueFuncGComputedData = NormalizedValueFuncPaneController.DATA_PROCESSOR
                .computeData(
                    this.#valueFuncGDataMapper.outerToInner.inputtedData(inputtedData),
                    this.#valueFuncGDataMapper.outerToInner.internalData(internalData),
                );
            const valueFuncBComputedData = NormalizedValueFuncPaneController.DATA_PROCESSOR
                .computeData(
                    this.#valueFuncBDataMapper.outerToInner.inputtedData(inputtedData),
                    this.#valueFuncBDataMapper.outerToInner.internalData(internalData),
                );

            return {
                valueFuncR: valueFuncRComputedData,
                valueFuncG: valueFuncGComputedData,
                valueFuncB: valueFuncBComputedData,
            };
        },
        outputData: (paneParams) => {
            const valueFuncR = NormalizedValueFuncPaneController.DATA_PROCESSOR
                .outputData(this.#valueFuncRDataMapper.paramsMapper().outerToInner(paneParams));
            if (valueFuncR == null) return null;

            const valueFuncG = NormalizedValueFuncPaneController.DATA_PROCESSOR
                .outputData(this.#valueFuncGDataMapper.paramsMapper().outerToInner(paneParams));
            if (valueFuncG == null) return null;

            const valueFuncB = NormalizedValueFuncPaneController.DATA_PROCESSOR
                .outputData(this.#valueFuncBDataMapper.paramsMapper().outerToInner(paneParams));
            if (valueFuncB == null) return null;

            return new ComposeRGB(valueFuncR, valueFuncG, valueFuncB);
        },
    };

    /**
     * Creates a new UI to configure a {@link ComposeRGB}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<ComposeRGBPaneControllerState>} initialState
     * The initial state to set.
     * @returns {ComposeRGBPaneControllerState} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new ComposeRGBPaneController(
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

/**
 * @typedef {object} ColorBlenderInputtedData
 * @property {'apply-colormap' | 'compose-rgb'} blenderType Indicates the type of
 * {@link ColorBlender} that is selected.
 * @property {ApplyColormapPaneControllerParams['inputtedData']} applyColormap
 * Specifies the {@link ApplyColormap} when its type is selected.
 * @property {ComposeRGBPaneControllerParams['inputtedData']} composeRGB
 * Specifies the {@link ComposeRGB} when its type is selected.
 */

/**
 * @typedef {object} ColorBlenderComputedData
 * @property {ApplyColormapPaneControllerParams['computedData']} applyColormap
 * Specifies the {@link ApplyColormap} when its type is selected.
 * @property {ComposeRGBPaneControllerParams['computedData']} composeRGB
 * Specifies the {@link ComposeRGB} when its type is selected.
 */

/**
 * @typedef {Expand<ApplyColormapPaneControllerParams['settings']
 * & ComposeRGBPaneControllerParams['settings']>} ColorBlenderPaneSettings
 */

/**
 * @typedef {Expand<ApplyColormapPaneControllerParams['internalData']
 * & ComposeRGBPaneControllerParams['internalData']>} ColorBlenderTarget
 */

/**
 * @typedef {{
 *     inputtedData: ColorBlenderInputtedData;
 *     computedData: ColorBlenderComputedData;
 *     settings: ColorBlenderPaneSettings;
 *     internalData: ?ColorBlenderTarget;
 *     outputData: ?ColorBlender;
 * }} ColorBlenderPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<ColorBlenderPaneControllerParams>} ColorBlenderPaneElementParams
 */

/**
 * @typedef {PaneControllerState<ColorBlenderPaneControllerParams>} ColorBlenderPaneControllerState
 */

/**
 * Represents a UI to configure a {@link ColorBlender}.
 * 
 * @augments PaneController<ColorBlenderPaneControllerParams>
 */
export class ColorBlenderPaneController extends PaneController {

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<ColorBlenderPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            blenderType: 'apply-colormap',
            applyColormap: ApplyColormapPaneController.FACTORY_PARAMS.inputtedData,
            composeRGB: ComposeRGBPaneController.FACTORY_PARAMS.inputtedData,
        },
        computedData: {
            applyColormap: ApplyColormapPaneController.FACTORY_PARAMS.computedData,
            composeRGB: ComposeRGBPaneController.FACTORY_PARAMS.computedData,
        },
        settings: {
            ...ApplyColormapPaneController.FACTORY_PARAMS.settings,
            ...ComposeRGBPaneController.FACTORY_PARAMS.settings,
        },
    };

    /**
     * @type {PaneControllerDataMapper<
     * ColorBlenderPaneControllerParams,
     * ApplyColormapPaneControllerParams>}
     */
    static #applyColormapDataMapper = new PaneControllerDataMapper({
        outerToInner: {
            inputtedData: (outerInputted) => outerInputted.applyColormap,
            internalData: (outerInternal) => outerInternal,
            computedData: (outer) => outer.computedData.applyColormap,
            settings: (outer) => ({
                disabled: outer.settings.disabled,
                hidden: outer.settings.hidden || outer.inputtedData.blenderType !== 'apply-colormap',
            }),
        },
        innerToOuter: {
            inputtedData: (innerInputted) => ({ applyColormap: innerInputted }),
        },
    });

    /**
     * @type {PaneControllerDataMapper<
     * ColorBlenderPaneControllerParams,
     * ComposeRGBPaneControllerParams>}
     */
    static #composeRGBDataMapper = new PaneControllerDataMapper({
        outerToInner: {
            inputtedData: (outerInputted) => outerInputted.composeRGB,
            internalData: (outerInternal) => outerInternal,
            computedData: (outer) => outer.computedData.composeRGB,
            settings: (outer) => ({
                disabled: outer.settings.disabled,
                hidden: outer.settings.hidden || outer.inputtedData.blenderType !== 'compose-rgb',
            }),
        },
        innerToOuter: {
            inputtedData: (innerInputted) => ({ composeRGB: innerInputted }),
        },
    });

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link ColorBlenderPaneElementParams}.
     * 
     * @returns {PaneElementFactory<ColorBlenderPaneElementParams>}
     * The resulting pane element factory.
     */
    static elementFactory() {
        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        return builder.sequential([
            builder.input(['inputtedData', 'blenderType'], {
                options: ({ settings: { disabled, hidden } }) => ({
                    label: 'Blender Type',
                    options: {
                        ApplyColormap: 'apply-colormap',
                        ComposeRGB: 'compose-rgb',
                    },
                    disabled: disabled,
                    hidden: hidden,
                }),
            }),
            builder.mapped(
                ApplyColormapPaneController.elementFactory(),
                this.#applyColormapDataMapper.paramsMapper(),
                builder.identityEventMapper(),
            ),
            builder.mapped(
                ComposeRGBPaneController.elementFactory(),
                this.#composeRGBDataMapper.paramsMapper(),
                builder.identityEventMapper(),
            ),
        ]);
    }

    /**
     * Data processor to pass into {@link PaneController}.
     * 
     * @type {PaneControllerDataProcessor<ColorBlenderPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => {
            const applyColormapComputedData = ApplyColormapPaneController.DATA_PROCESSOR
                .computeData(
                    this.#applyColormapDataMapper.outerToInner.inputtedData(inputtedData),
                    this.#applyColormapDataMapper.outerToInner.internalData(internalData),
                );
            const composeRGBComputedData = ComposeRGBPaneController.DATA_PROCESSOR
                .computeData(
                    this.#composeRGBDataMapper.outerToInner.inputtedData(inputtedData),
                    this.#composeRGBDataMapper.outerToInner.internalData(internalData),
                );

            return {
                applyColormap: applyColormapComputedData,
                composeRGB: composeRGBComputedData,
            };
        },
        outputData: (paneParams) => {
            const { inputtedData: { blenderType } } = paneParams;

            switch (blenderType) {
                case 'apply-colormap': {
                    return ApplyColormapPaneController.DATA_PROCESSOR
                        .outputData(this.#applyColormapDataMapper.paramsMapper()
                            .outerToInner(paneParams));
                }
                case 'compose-rgb': {
                    return ComposeRGBPaneController.DATA_PROCESSOR
                        .outputData(this.#composeRGBDataMapper.paramsMapper()
                            .outerToInner(paneParams));
                }
                default:
                    throw new Error(`Unknown blender type: ${blenderType}`);
            }
        },
    };

    /**
     * Creates a new UI to configure a {@link ColorBlender}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<ColorBlenderPaneControllerState>} initialState
     * The initial state to set.
     * @returns {ColorBlenderPaneControllerState} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new ColorBlenderPaneController(
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
