import * as THREE from 'three';

import { registerPlugins } from './PanePlugins';

/**
 * @typedef {import('tweakpane').Pane} Pane
 */

/**
 * @template T
 * @typedef {import('../../../../../../common/lib/utils').TypeUtils.Immutable<T>} Immutable
 */

/**
 * @template P
 * @template {{}} E
 * @typedef {import('./PaneElement').PaneElement<P, E>} PaneElement
 */

/**
 * @template TOuter
 * @template TInner
 * @typedef {import('./WrapperPaneElement').ParamsMapper<TOuter, TInner>} ParamsMapper
 */

/**
 * @template P
 * @template {{}} E
 * @typedef {import('./PaneElementFactory').PaneElementFactory<P, E>} PaneElementFactory
 */

/* eslint-disable max-len */
/**
 * A helper type that indicates the data types in a {@link PaneController}.
 * 
 * [Data flow]
 * 
 * get PaneController.inputtedData  -----------------------
 *                                    \                    \
 * get PaneController.internalData  ----> computedData ------> PaneElement.render()
 *                                                         /
 * get PaneController.settings      -----------------------
 * 
 * 
 * PaneElement.updatePaneParams() --> set PaneController.inputtedData ---------------------
 *                \                                      \                                 \
 *                 \                  get PaneController.internalData ----> computedData ----> PaneController.outputData
 *                  \                                                                      /
 *                   ---------------> set PaneController.settings -------------------------
 * 
 * @typedef {{
 *     inputtedData: {};
 *     computedData: unknown;
 *     settings: {};
 *     internalData: unknown;
 *     outputData: unknown;
 * }} PaneControllerDataTypes
 */
/* eslint-enable max-len */

/**
 * Specifies the parameters to pass to the wrapped {@link PaneElement}.
 * 
 * @template {PaneControllerDataTypes} P The types of data in the controller.
 * @typedef {Pick<P, 'inputtedData' | 'computedData' | 'settings'>} PaneElementParams
 */

/* eslint-disable max-len */
/**
 * @template {PaneControllerDataTypes} POuter The types of data in the wrapper instance.
 * @template {PaneControllerDataTypes} PInner The types of data in the wrapped instance.
 * @typedef {object} PaneControllerDataMappingOuterToInner
 * @property {(outerInputted: Immutable<POuter['inputtedData']>) => Immutable<PInner['inputtedData']>} inputtedData
 * Maps `inputtedData` from that of the wrapper controller to that of the wrapped one.
 * @property {(outerInternal: Immutable<POuter['internalData']>) => Immutable<PInner['internalData']>} internalData
 * Maps `internalData` from that of the wrapper controller to that of the wrapped one.
 * @property {(outer: Immutable<PaneElementParams<POuter>>) => Immutable<PInner['computedData']>} computedData
 * Maps `computedData` from that of the wrapper controller to that of the wrapped one.
 * @property {(outer: Immutable<PaneElementParams<POuter>>) => Immutable<PInner['settings']>} settings
 * Maps `settings` from that of the wrapper controller to that of the wrapped one.
 */
/* eslint-enable max-len */

/* eslint-disable max-len */
/**
 * @template {PaneControllerDataTypes} POuter The types of data in the wrapper instance.
 * @template {PaneControllerDataTypes} PInner The types of data in the wrapped instance.
 * @typedef {object} PaneControllerDataMappingInnerToOuter
 * @property {(innerInputted: Immutable<PInner['inputtedData']>) => Partial<POuter['inputtedData']>} inputtedData
 * Maps `inputtedData` from that of the wrapped controller to that of the wrapper one.
 */
/* eslint-enable max-len */

/**
 * @template {PaneControllerDataTypes} POuter The types of data in the wrapper instance.
 * @template {PaneControllerDataTypes} PInner The types of data in the wrapped instance.
 * @typedef {object} PaneControllerDataMapping
 * @property {PaneControllerDataMappingOuterToInner<POuter, PInner>} outerToInner
 * Maps the data from that of the wrapper controller to that of the wrapped one.
 * @property {PaneControllerDataMappingInnerToOuter<POuter, PInner>} innerToOuter
 * Maps the data from that of the wrapped controller to that of the wrapper one.
 */

/**
 * Specifies the mapping between the data of a pair of wrapper and wrapped
 * {@link PaneControllerDataProcessor} instances.
 * 
 * @template {PaneControllerDataTypes} POuter The types of data in the wrapper instance.
 * @template {PaneControllerDataTypes} PInner The types of data in the wrapped instance.
 */
export class PaneControllerDataMapper {

    /**
     * @readonly
     * @type {PaneControllerDataMapping<POuter, PInner>}
     */
    #mapping;

    /**
     * @type {PaneControllerDataMappingOuterToInner<POuter, PInner>}
     */
    get outerToInner() { return this.#mapping.outerToInner; }

    /**
     * @type {PaneControllerDataMappingInnerToOuter<POuter, PInner>}
     */
    get innerToOuter() { return this.#mapping.innerToOuter; }

    /**
     * Constructs a new {@link PaneControllerDataMapper} that wraps a mapping.
     * 
     * @param {PaneControllerDataMapping<POuter, PInner>} mapping
     * The mapping to wrap.
     */
    constructor(mapping) {
        this.#mapping = mapping;
    }

    /**
     * Creates a {@link ParamsMapper} based on this mapper.
     * 
     * @returns {ParamsMapper<PaneElementParams<POuter>, PaneElementParams<PInner>>}
     * The resulting mapper.
     */
    paramsMapper() {
        return {
            outerToInner: (outer) => ({
                inputtedData: this.outerToInner.inputtedData(outer.inputtedData),
                computedData: this.outerToInner.computedData(outer),
                settings: this.outerToInner.settings(outer),
            }),
            innerToOuter: (inner) => ({
                inputtedData: this.innerToOuter.inputtedData(inner.inputtedData),
            }),
        };
    }
}

/**
 * Processes the data in {@link PaneController}.
 * 
 * @interface
 * @template {PaneControllerDataTypes} P The types of data in the controller.
 */
export class PaneControllerDataProcessor {

    /**
     * Generates the computed data based on the user input and internal data.
     * 
     * Note that the computed data is provided on demand; it is not actually stored anywhere.
     * As such, computed data should not be used to store state.
     * 
     * @abstract
     * @param {Immutable<P['inputtedData']>} inputtedData The data that is displayed in
     * the pane.
     * @param {Immutable<P['internalData']>} internalData Internal data that provides
     * context for the computation.
     * @returns {Immutable<P['computedData']>} The data that is dynamically computed
     * before being displayed in the pane.
     */
    computeData(inputtedData, internalData) {
        throw new Error('Not implemented');
    }

    /**
     * Generates the output of the pane based on its data.
     * 
     * Note that the output data is provided on demand; it is not actually stored anywhere.
     * As such, output data should not be used to store state.
     * 
     * @abstract
     * @param {Immutable<PaneElementParams<P>>} paneParams The data in the pane.
     * @returns {P['outputData']} The resulting instance.
     */
    outputData(paneParams) {
        throw new Error('Not implemented');
    }
}

/**
 * Represents the event when the data outputted by the pane has been changed by user interaction.
 * - `prevOutputData`: The previous data outputted by the pane; this is initially based on its
 *   initial state.
 * - `outputData`: The new data outputted by the pane.
 * 
 * Note that this event is not emitted when programatically updating the state.
 * 
 * @template {PaneControllerDataTypes} P The types of data in the controller.
 * @typedef {{
 *     prevOutputData: P['outputData'];
 *     outputData: P['outputData'];
 * }} PaneControllerChangeEvent
 */

/**
 * Defines each event that can be dispatched by {@link PaneController}.
 * 
 * @template {PaneControllerDataTypes} P The types of data in the controller.
 * @typedef {object} PaneControllerEventMap
 * @property {PaneControllerChangeEvent<P>} change The event when the data outputted by the pane
 * has been changed by user interaction.
 */

/**
 * Specifies the state of a {@link PaneController}.
 * 
 * @template {PaneControllerDataTypes} P The types of data in the controller.
 * @typedef {Pick<P, 'inputtedData' | 'settings' | 'internalData'>} PaneControllerState
 */

/**
 * Wraps a `tweakpane` pane to store the parameters (props) as state.
 * This state produces output data; changes to the output can be listened to via
 * {@link PaneController#bindOutputData}.
 * 
 * @template {PaneControllerDataTypes} P The types of data in the controller.
 * @template {{}} [EPane={}] The type of event emitted by the wrapped pane;
 * such events are forwarded by the controller.
 * @augments {THREE.EventDispatcher<PaneControllerEventMap<P>>}
 */
export class PaneController extends THREE.EventDispatcher {

    /**
     * @readonly
     * @type {Pane}
     */
    #pane;

    /**
     * @type {HTMLElement}
     */
    get dom() { return this.#pane.element; }

    /**
     * @readonly
     * @type {PaneElement<PaneElementParams<P>, EPane>}
     */
    #paneElem;

    /**
     * @type {PaneControllerDataProcessor<P>}
     */
    #dataProcessor;

    /**
     * @type {PaneControllerDataProcessor<P>}
     */
    get dataProcessor() { return this.#dataProcessor; }

    /**
     * @type {P['inputtedData']}
     */
    #inputtedData;

    /**
     * The data that is displayed in the pane, and can be directly modified by user interaction.
     * 
     * This should be a plain object.
     * 
     * @type {Immutable<P['inputtedData']>}
     */
    get inputtedData() { return this.#inputtedData; }

    set inputtedData(value) {
        if (this.#inputtedData !== value) {
            this.#inputtedData = value;

            this.#onSetData();
        }
    }

    /**
     * Updates {@link PaneController#inputtedData} by shallowly assigning properties.
     * 
     * @param {Partial<Immutable<P['inputtedData']>>} props The properties to assign.
     * @returns {boolean} `true` if the data has been updated; otherwise, `false`.
     */
    #assignToInputtedData(props) {
        let updated = false;

        for (const [k, v] of Object.entries(props)) {
            if (k in this.#inputtedData) {
                // @ts-expect-error
                if (v !== this.#inputtedData[k]) {
                    // @ts-expect-error
                    this.#inputtedData[k] = v;
                    updated = true;
                }
            }
        }

        return updated;
    }

    /**
     * Updates {@link PaneController#inputtedData} by shallowly assigning properties.
     * 
     * @param {Partial<Immutable<P['inputtedData']>>} props The properties to assign.
     * @param {boolean} forceRender If `true`, forces a re-render regardless of
     * the new value of the properties. This is useful when the shallow properties are
     * themselves mutable objects, since this class does not perform deep comparison
     * when determining whether the pane element should be re-rendered.
     */
    updateInputtedData(props, forceRender = false) {
        if (this.#assignToInputtedData(props) || forceRender) this.#onSetData();
    }

    /**
     * @type {Immutable<P['settings']>}
     */
    #settings;

    /**
     * Data that is used to configure the pane.
     * 
     * This should be a plain object.
     * 
     * @type {P['settings']}
     */
    get settings() { return this.#settings; }

    set settings(value) {
        if (this.#settings !== value) {
            this.#settings = value;

            this.#onSetData();
        }
    }

    /**
     * Updates {@link PaneController#settings} by shallowly assigning properties.
     * 
     * @param {Partial<Immutable<P['settings']>>} props The properties to assign.
     * @returns {boolean} `true` if the data has been updated; otherwise, `false`.
     */
    #assignToSettings(props) {
        let updated = false;

        for (const [k, v] of Object.entries(props)) {
            if (k in this.#settings) {
                // @ts-expect-error
                if (v !== this.#settings[k]) {
                    // @ts-expect-error
                    this.#settings[k] = v;
                    updated = true;
                }
            }
        }

        return updated;
    }

    /**
     * Updates {@link PaneController#settings} by shallowly assigning properties.
     * 
     * @param {Partial<Immutable<P['settings']>>} props The properties to assign.
     * @param {boolean} forceRender If `true`, forces a re-render regardless of
     * the new value of the properties. This is useful when the shallow properties are
     * themselves mutable objects, since this class does not perform deep comparison
     * when determining whether the pane element should be re-rendered.
     */
    updateSettings(props, forceRender = false) {
        if (this.#assignToSettings(props) || forceRender) this.#onSetData();
    }

    /**
     * @type {P['internalData']}
     */
    #internalData;

    /**
     * Internal data that provides context for the computation of `computedData`,
     * which in turn is used to configure the pane alongside `settings`.
     * 
     * @type {Immutable<P['internalData']>}
     */
    get internalData() { return this.#internalData; }

    set internalData(value) {
        if (this.#internalData !== value) {
            this.#internalData = value;

            this.#onSetData();
        }
    }

    /**
     * Sets the new value of `internalData`.
     * 
     * @param {Immutable<P['internalData']>} data The data to set.
     * @returns {boolean} `true` if the data has been updated; otherwise, `false`.
     */
    #setInternalData(data) {
        let updated = false;

        if (this.#internalData !== data) {
            this.#internalData = data;
            updated = true;
        }

        return updated;
    }

    /**
     * Sets the new value of `internalData`.
     * 
     * @param {Immutable<P['internalData']>} data The data to set.
     * @param {boolean} forceRender If `true`, forces a re-render regardless of
     * the new value of the properties. This is useful when the shallow properties are
     * themselves mutable objects, since this class does not perform deep comparison
     * when determining whether the pane element should be re-rendered.
     */
    setInternalData(data, forceRender = false) {
        if (this.#setInternalData(data) || forceRender) this.#onSetData();
    }

    /**
     * Updates the new state of this object.
     * 
     * This is more efficient than updating {@link PaneController#inputtedData},
     * {@link PaneController#settings} and {@link PaneController#internalData}
     * individually as this only triggers a single re-render.
     * 
     * @param {{
     *     inputtedData?: Partial<Immutable<P['inputtedData']>>;
     *     settings?: Partial<Immutable<P['settings']>>;
     *     internalData?: Immutable<P['internalData']>;
     * }} state The state to set.
     * @param {boolean} forceRender If `true`, forces a re-render regardless of
     * the new value of the properties. This is useful when the shallow properties are
     * themselves mutable objects, since this class does not perform deep comparison
     * when determining whether the pane element should be re-rendered.
     */
    updateState(state, forceRender = false) {
        // Avoid short-circuiting
        let updated = false;
        if (this.#assignToInputtedData(state.inputtedData ?? {})) updated = true;
        if (this.#assignToSettings(state.settings ?? {})) updated = true;
        if (this.#setInternalData(state.internalData ?? this.#internalData)) updated = true;

        if (updated || forceRender) this.#onSetData();
    }

    /**
     * Gets the parameters to pass to the pane element.
     * 
     * Assumes that the relevant properties have already been set.
     * 
     * @protected
     * @returns {PaneElementParams<P>} The requested parameters.
     */
    getPaneParams() {
        const { dataProcessor, inputtedData, internalData, settings } = this;

        return {
            inputtedData: inputtedData,
            computedData: dataProcessor.computeData(inputtedData, internalData),
            settings: settings,
        };
    }

    /**
     * @type {boolean}
     */
    #isRendering = false;

    /**
     * Renders the pane element with the given parameters.
     * 
     * Note that this does not dispatch any `'change'` events.
     * 
     * @protected
     * @param {PaneElementParams<P>} params The parameters to render.
     */
    renderPaneParams(params) {
        this.#isRendering = true;

        try {
            this.#paneElem.render(params);
        } finally {
            this.#isRendering = false;
        }
    }

    /**
     * Renders the pane element with the current state of the controller.
     * 
     * Note that this does not dispatch any `'change'` events.
     */
    render() {
        const paneParams = this.getPaneParams();
        this.renderPaneParams(paneParams);
    }

    /**
     * Handles the event when the data is changed internally by the program.
     */
    #onSetData = () => {
        this.render();

        // 'change' event only occurs if the user directly edits the pane
        // this.notifyChange();

        // But we still need to update the `outputData`
        this.#outputData = this.getOutputData();
    };

    /**
     * Handles the event when the pane has been changed directly by the user.
     */
    #onPaneChange = () => {
        // Avoid infinite recursion
        if (this.#isRendering) return;

        // Update the parameters stored in the controller with the ones in the panel
        {
            const paneParams = this.getPaneParams();
            this.#paneElem.updateParams(paneParams);
            this.#inputtedData = paneParams.inputtedData;
            this.#settings = paneParams.settings;
        }

        // Re-render in case other pane elements depend on the changed data
        // Notice that `render` cannot mutate `paneParams`
        // However, `InputBindingApi.refresh` can emit 'change' events, so we
        // add a guard using this.#isRefreshing to avoid unnecessary recursion
        this.render();

        this.notifyChange();
    };

    /**
     * The `outputData` in the most recent call of {@link PaneController#getOutputData};
     * if it has never been called, defaults to the initial state.
     * 
     * @type {P['outputData']}
     */
    #outputData;

    /**
     * Computes the output data of this pane.
     * 
     * You should assign the result to `this.#outputData` such that it remains up-to-date.
     * 
     * @protected
     * @returns {P['outputData']} The requested output.
     */
    getOutputData() {
        const paneParams = this.getPaneParams();
        return this.#dataProcessor.outputData(paneParams);
    }

    /**
     * The output data of this pane, based on its current state.
     * 
     * @type {Immutable<P['outputData']>}
     */
    get outputData() { return this.#outputData; }

    /**
     * @type {THREE.EventListener<PaneControllerChangeEvent<P>, 'change', this>[]}
     */
    #handlers = [];

    /**
     * Binds an event handler to the `'change'` event of this controller, so that the handler
     * is called whenever the output data of this controller is changed.
     * 
     * @param {THREE.EventListener<PaneControllerChangeEvent<P>, 'change', this>} handler 
     * The event handler to bind.
     * @param {boolean} notifyChange If `true`, the `handler` is invoked immediately
     * after attaching it to this object. This is convenient for performing initial setup
     * of the listener object.
     */
    bindOutputData(handler, notifyChange = true) {
        this.addEventListener('change', handler);
        this.#handlers.push(handler);

        if (notifyChange) this.notifyChange();
    }

    /**
     * A handle to listen to events dispatched by the wrapped pane element.
     * 
     * Any event listeners added in this way are not owned by the pane controller;
     * you should manually dispose such event listeners before disposing the controller.
     * 
     * @type {THREE.EventDispatcher<EPane>}
     */
    get paneEvents() { return this.#paneElem; }

    /**
     * Creates a new pane controller.
     * 
     * @param {() => Pane} paneFactory Constructs the `tweakpane` pane to wrap.
     * (Such that the controller takes ownership of the pane.)
     * @param {PaneElementFactory<PaneElementParams<P>, EPane>} elemFactory
     * Constructs each pane element and attaches them to the pane.
     * @param {PaneControllerDataProcessor<P>} dataProcessor Processes the data in the pane.
     * @param {PaneControllerState<P>} initialState The initial state to set.
     */
    constructor(paneFactory, elemFactory, dataProcessor, { inputtedData, settings, internalData }) {
        super();

        this.#dataProcessor = dataProcessor;
        this.#inputtedData = inputtedData;
        this.#settings = settings;
        this.#internalData = internalData;

        this.#pane = paneFactory();
        registerPlugins(this.#pane);

        this.#paneElem = elemFactory.attachElement(this.#pane, this.getPaneParams());
        this.#outputData = this.getOutputData();

        this.#pane.on('change', this.#onPaneChange);
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#pane.dispose();

        for (const handler of this.#handlers) {
            this.removeEventListener('change', handler);
        }
        this.#handlers = [];
    }

    /**
     * Emits the `'change'` event based on the current state of the view.
     * 
     * This is also useful for simulating user interaction via the program, since by default,
     * the `'change'` event is not emitted when the data is updated programatically.
     */
    notifyChange() {
        const prevOutputData = this.#outputData;
        const outputData = this.getOutputData();
        this.#outputData = outputData;

        this.dispatchEvent({
            type: 'change',
            prevOutputData: prevOutputData,
            outputData: outputData,
        });
    }
}
