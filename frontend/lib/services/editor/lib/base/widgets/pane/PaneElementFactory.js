import _ from 'lodash';
import * as THREE from 'three';
import { TextApi } from 'tweakpane';
import { HeadApi } from 'tweakpane-table';

import { FuncUtils } from '../../../../../../common/lib/utils';

import { HTMLContainerApi } from '../tweakpane-custom-plugins';

import {
    ButtonPaneElement, SeparatorPaneElement,
    createInputBindingPaneElement, createListBladePaneElement,
    createSimpleBladePaneElement, createSelectGridPaneElement,
} from './UnitPaneElement';
import { FolderPaneElement, TabPaneElement, TableRowPaneElement } from './CompositePaneElement';
import { MultiWrapperPaneElement, MappedPaneElement, StatefulPaneElement } from './WrapperPaneElement';

/* eslint-disable max-len */
/**
 * @typedef {import('tweakpane').BaseParams} BaseParams
 */

/**
 * @typedef {import('tweakpane').InputParams} InputParams
 */

/**
 * @template Ex The external type (= parameter object).
 * @typedef {import('tweakpane').InputBindingApiEvents<Ex>} InputBindingApiEvents
 */

/**
 * @typedef {import('tweakpane').BaseBladeParams} BaseBladeParams
 */

/**
 * @template T
 * @typedef {import('tweakpane').ListBladeParams<T>} ListBladeParams
 */

/**
 * @template T
 * @typedef {import('@tweakpane/core').ApiChangeEvents<T>} ApiChangeEvents
 */

/**
 * @typedef {import('tweakpane').FolderParams} FolderParams
 */

/**
 * @typedef {import('@tweakpane/core').FolderApiEvents} FolderApiEvents
 */

/**
 * @typedef {import('tweakpane').ButtonParams} ButtonParams
 */

/**
 * @typedef {import('@tweakpane/core').ButtonApiEvents} ButtonApiEvents
 */

/**
 * @typedef {import('tweakpane').TabParams} TabParams
 */

/**
 * @typedef {import('tweakpane').TabApi} TabApi
 */

/**
 * @typedef {import('./CompositePaneElement').TabApiEvents} TabApiEvents
 */

/**
 * @typedef {import('tweakpane').SeparatorParams} SeparatorParams
 */

/**
 * @template T
 * @typedef {import('tweakpane').TextBladeParams<T>} TextBladeParams
 */

/**
 * @typedef {import('tweakpane-table').TableHeadParams} TableHeadParams
 */

/**
 * @typedef {import('tweakpane-table').TableRowParams} TableRowParams
 */

/**
 * @template T
 * @typedef {import('../../../../../../common/lib/utils').TypeUtils.Expand<T>} Expand
 */

/**
 * @template T
 * @typedef {import('../../../../../../common/lib/utils').TypeUtils.Immutable<T>} Immutable
 */

/**
 * @template TOuter
 * @template {ReadonlyArray<string>} TPath
 * @typedef {import('../../../../../../common/lib/utils').TypeUtils.InnerObject<TOuter, TPath>} InnerObject
 */

/**
 * @typedef {import('../tweakpane-custom-plugins').HTMLContainerParams} HTMLContainerParams
 */

/**
 * @typedef {import('./CompositePaneElement').CellBladeParamsForPaneElement} CellBladeParamsForPaneElement
 */

/**
 * @typedef {import('./CompositePaneElement').TabPageParamsForPaneElement} TabPageParamsForPaneElement
 */

/**
 * @typedef {import('./PanePlugins').registerPlugins} registerPlugins
 */

/**
 * @template P
 * @template {{}} E
 * @typedef {import('./PaneElement').PaneElement<P, E>} PaneElement
 */

/**
 * @typedef {import('./UnitPaneElement').PaneLike} PaneLike
 */

/**
 * @template {{}} P The type of parameters (props) passed to the element.
 * @template {ReadonlyArray<string>} TPath The path in `P` to the value of the element.
 * @typedef {import('./UnitPaneElement').SelectGridInputParamsForPaneElement<P, TPath>} SelectGridInputParamsForPaneElement
 */

/**
 * @template {{}} TEventMap
 * @template P
 * @template {{}} E
 * @typedef {import('./UnitPaneElement').TweakpaneEventHandlers<TEventMap, P, E>} TweakpaneEventHandlers
 */

/**
 * @template {{}} EOuter
 * @template {{}} EInner
 * @typedef {import('./WrapperPaneElement').EventsMapper<EOuter, EInner>} EventsMapper
 */

/**
 * @template POuter
 * @template PInner
 * @typedef {import('./WrapperPaneElement').ParamsMapper<POuter, PInner>} ParamsMapper
 */
/* eslint-enable max-len */

/**
 * Represents the configuration of a pane element.
 * 
 * Unlike the one defined in `UnitPaneElement.js`, some attributes are optional.
 * 
 * @template {{}} TOptions The type of options passed to the `tweakpane` element.
 * @template {{}} TEventMap The available `tweakpane` events.
 * @template P The type of parameters (props) passed to the pane element.
 * @template {{}} E The type of event emitted by the pane element.
 * @typedef {object} PartialPaneElementConfig
 * @property {TweakpaneOptions<P, TOptions>} options Options to pass to the `tweakpane`
 * element, which may be dynamically computed each time it is rendered.
 * @property {(element: HTMLElement, params: Immutable<P>, paneElem: PaneElement<P, E>
 * ) => void} [modifyHTML]
 * Manipulates the HTML of the `tweakpane` element based on the given `params`.
 * This is done after applying `options`.
 * @property {TweakpaneEventHandlers<TEventMap, P, E>} [eventHandlers]
 * Handles events emitted by the `tweakpane` element. Usually, the pane element
 * forwards such events (see {@link PaneElement#dispatchEvent}) so that its parents
 * can listen to them.
 */

/**
 * Contains the "type" (i.e., name) of each event.
 * 
 * @template {{}} E The type of event emitted by the element.
 * @typedef {ReadonlyArray<Extract<keyof E, string>>} PaneElementEventTypes
 */

/**
 * @template P The type of parameters (props) passed to the element.
 * @template S The type of state stored in the element.
 * @typedef {object} ImmutableParamsWithState
 * @property {Immutable<P>} params The parameters passed to {@link PaneElement#render}.
 * @property {Immutable<S>} state The state stored in the pane element.
 */

/**
 * Represents a factory that creates {@link PaneElement} instances.
 * 
 * @interface
 * @template P The type of parameters (props) passed to the element.
 * @template {{}} E The type of event emitted by the element.
 */
export class PaneElementFactory {

    /**
     * Indicates the type of events emitted by the pane element.
     * 
     * @readonly
     * @type {PaneElementEventTypes<E>}
     */
    eventTypes;

    /**
     * Creates a new pane element which is attached to a pane.
     * 
     * See {@link registerPlugins} for the plugins available to the pane.
     * 
     * @abstract
     * @param {PaneLike} pane An existing pane to attach to.
     * @param {Immutable<P>} params The parameters used to initialize the pane element.
     * @returns {PaneElement<P, E>} The newly created pane element.
     */
    attachElement(pane, params) {
        throw new Error('Not implemented');
    }

    /**
     * Wraps this pane element factory so that the wrapper factory constructs a pane element
     * that stores state.
     * 
     * @abstract
     * @template S The type of state stored in the element.
     * @param {(prev: ImmutableParamsWithState<P, S>, params: Immutable<P>
     * ) => ImmutableParamsWithState<P, S>} transition
     * Given `params` externally passed to {@link PaneElement#render},
     * computes the `params` to be internally used, and the new state of the pane element.
     * @param {S} initState The state to store in the pane element when it is initialized.
     * @returns {PaneElementFactory<P, E>} The newly created pane element factory.
     */
    withState(transition, initState) {
        throw new Error('Not implemented');
    }

    /**
     * Wraps this pane element factory so that the wrapper factory constructs a pane element
     * that maps data sent to/from the wrapped pane element.
     * 
     * This allows a pane element that is designed for a particular object to
     * instead operate on an outer object, making it easier to compose
     * {@link PaneElementFactory} to work with different types of `params` and events.
     * 
     * @abstract
     * @template POuter
     * @template {{}} EOuter
     * @param {ParamsMapper<POuter, P>} paramsMapper Specifies how the `params` is mapped
     * between the wrapper and wrapped element.
     * @param {EventsMapper<EOuter, E>} eventsMapper Specifies how the events are mapped
     * between the wrapper and wrapped element.
     * @returns {PaneElementFactory<POuter, EOuter>} The newly created pane element factory.
     */
    mapped(paramsMapper, eventsMapper) {
        throw new Error('Not implemented');
    }
}

/**
 * @template P The type of parameters (props) passed to the element.
 * @template {{}} E The type of event emitted by the element.
 * @typedef {PaneElementFactory<P, E>['attachElement']} AttachElementFunc
 */

/**
 * Represents the debugging information of a {@link PaneElementFactory}.
 * 
 * @typedef {object} PaneElementBuilderContext
 * @property {Immutable<any>} params Indicates the type of parameters passed to the
 * pane element.
 * @property {PaneElementEventTypes<any>} eventTypes Indicates the type of events
 * emitted by the pane element.
 * @property {string} funcName The name of the function that defined the factory.
 * @property {ReadonlyArray<any>} args The parameters of the function that defined the
 * factory.
 */

/**
 * Base implementation of {@link PaneElementFactory}.
 * 
 * @template P The type of parameters (props) passed to the element.
 * @template {{}} E The type of event emitted by the element.
 * @implements {PaneElementFactory<P, E>}
 */
class BasePaneElementFactory {

    /**
     * Indicates the type of events emitted by the pane element.
     * 
     * @readonly
     * @type {PaneElementEventTypes<E>}
     */
    eventTypes;

    /**
     * @readonly
     * @type {AttachElementFunc<P, E>}
     */
    #attachElement;

    /**
     * @readonly
     * @type {PaneElementBuilderContext}
     */
    #ctx;

    /**
     * @param {PaneElementEventTypes<E>} eventTypes Indicates the type of events emitted
     * by the constructed pane element.
     * @param {AttachElementFunc<P, E>} attachElement The concrete implementation
     * of {@link PaneElementFactory#attachElement}.
     * @param {PaneElementBuilderContext} ctx The debugging information of the factory.
     */
    constructor(eventTypes, attachElement, ctx) {
        this.eventTypes = eventTypes;

        this.#attachElement = attachElement;
        this.#ctx = ctx;
    }

    /**
     * Decorates `fn` such that the debugging information of this factory is printed if
     * an error occurs.
     * 
     * This makes it easier to identify the {@link PaneElement} that causes the error.
     * 
     * @template {any[]} TArgs
     * @template TReturn
     * @param {(...args: TArgs) => TReturn} fn The function to wrap.
     * @returns {(...args: TArgs) => TReturn} The wrapped function.
     */
    #withDebugCtx(fn) {
        return (...args) => {
            try {
                return fn(...args);
            } catch (e) {
                // console.error('args:', args);
                console.error('ctx:', this.#ctx);
                throw e;
            }
        };
    }

    /**
     * Creates a new pane element which is attached to a pane.
     * 
     * See {@link registerPlugins} for the plugins available to the pane.
     * 
     * @param {PaneLike} pane An existing pane to attach to.
     * @param {Immutable<P>} params The parameters used to initialize the pane element.
     * @returns {PaneElement<P, E>} The newly created pane element.
     */
    attachElement(pane, params) {
        const factory = this;
        const eventTypes = this.eventTypes;

        /**
         * @augments THREE.EventDispatcher<E>
         * @implements {PaneElement<P, E>}
         */
        class PaneElementWithContext extends THREE.EventDispatcher {

            /**
             * @readonly
             * @type {PaneElement<P, E>}
             */
            #paneElem;

            /**
             * Handles events dispatched by the wrapped pane element.
             * 
             * @template {Extract<keyof E, string>} T
             * @param {THREE.BaseEvent<T> & E[T]} innerEvent The event to handle.
             */
            #handlePaneElemEvent = (innerEvent) => {
                this.dispatchEvent(innerEvent);
            };

            /**
             * @param {PaneElement<P, E>} paneElem The wrapped pane element.
             */
            constructor(paneElem) {
                super();

                this.#paneElem = paneElem;

                for (const innerEventType of eventTypes) {
                    this.#paneElem.addEventListener(innerEventType, this.#handlePaneElemEvent);
                }

                this.render = factory.#withDebugCtx((p) => this.#paneElem.render(p));
                this.updateParams = factory.#withDebugCtx((p) => this.#paneElem.updateParams(p));
            }

            /**
             * Disposes of this pane element. Do not use it afterwards.
             */
            dispose() {
                for (const innerEventType of eventTypes) {
                    this.#paneElem.removeEventListener(innerEventType, this.#handlePaneElemEvent);
                }

                this.#paneElem.dispose();
            }
        }

        const attachElement = this.#withDebugCtx(
            /** @type {AttachElementFunc<P, E>} */
            ((pane_, params_) => {
                const elem = this.#attachElement(pane_, params_);
                return new PaneElementWithContext(elem);
            }),
        );

        return attachElement(pane, params);
    }

    /**
     * Creates a {@link PaneElementBuilderContext} for a transform function.
     * 
     * @param {string} funcName The name of the transform function.
     * @param  {...any} args The arguments to the transform function.
     * @returns {PaneElementBuilderContext} The resulting context.
     */
    #makeCtx(funcName, ...args) {
        return {
            params: this.#ctx.params,
            eventTypes: this.#ctx.eventTypes,
            funcName: funcName,
            args: args,
        };
    }

    /**
     * Wraps this pane element factory so that the wrapper factory constructs a pane element
     * that stores state.
     * 
     * @template S The type of state stored in the element.
     * @param {(prev: ImmutableParamsWithState<P, S>, params: Immutable<P>
     * ) => ImmutableParamsWithState<P, S>} transition
     * Given `params` externally passed to {@link PaneElement#render},
     * computes the `params` to be internally used, and the new state of the pane element.
     * @param {S} initState The initial state to store in the pane element.
     * A deep copy is made from this object each time a pane element is initialized.
     * @returns {PaneElementFactory<P, E>} The newly created pane element factory.
     */
    withState(transition, initState) {
        return new BasePaneElementFactory(
            this.eventTypes,
            (pane, params) => new StatefulPaneElement(
                pane,
                params,
                (pane_, params_) => this.attachElement(pane_, params_),
                this.eventTypes,
                transition,
                initState,
            ),
            this.#makeCtx('withState', { transition, initState }),
        );
    }

    /**
     * Wraps this pane element factory so that the wrapper factory constructs a pane element
     * that maps data sent to/from the wrapped pane element.
     * 
     * This allows a pane element that is designed for a particular object to
     * instead operate on an outer object, making it easier to compose
     * {@link PaneElementFactory} to work with different types of `params` and events.
     * 
     * @template POuter
     * @template {{}} EOuter
     * @param {ParamsMapper<POuter, P>} paramsMapper Specifies how the `params` is mapped
     * between the wrapper and wrapped element.
     * @param {EventsMapper<EOuter, E>} eventsMapper Specifies how the events are mapped
     * between the wrapper and wrapped element.
     * @returns {PaneElementFactory<POuter, EOuter>} The newly created pane element factory.
     */
    mapped(paramsMapper, eventsMapper) {
        return new BasePaneElementFactory(
            eventsMapper.outerEventTypes,
            (pane, params) => new MappedPaneElement(
                pane,
                params,
                (pane_, params_) => this.attachElement(pane_, params_),
                this.eventTypes,
                paramsMapper,
                eventsMapper,
            ),
            this.#makeCtx('mapped', { paramsMapper, eventsMapper }),
        );
    }
}

/**
 * @template P The type of parameters (props) passed to the wrapping pane element.
 * @template {{}} TOptions The type of `tweakpane` options.
 * @typedef {TOptions | ((params: Immutable<P>) => TOptions)} TweakpaneOptions
 */

/**
 * @template {{}} P The type of parameters (props) passed to the element.
 * @template {{}} E The type of event emitted by the element.
 * @typedef {object} TabPageSpec
 * @property {PaneElementFactory<P, E>} factory The factory to wrap.
 * This is usually a factory created by {@link PaneElementFactoryBuilder#sequential}
 * or {@link PaneElementFactoryBuilder#mapped}.
 * @property {TweakpaneOptions<P, TabPageParamsForPaneElement>} options Options to pass to
 * the `tweakpane` element, which may be dynamically computed each time it is rendered.
 */

/**
 * @template {{}} P The type of parameters (props) passed to the element.
 * @template {{}} E The type of event emitted by the element.
 * @typedef {object} TableCellSpec
 * @property {PaneElementFactory<P, E>} factory The factory to wrap.
 * This is usually a factory created by {@link PaneElementFactoryBuilder#sequential}
 * or {@link PaneElementFactoryBuilder#mapped}.
 * @property {TweakpaneOptions<P, CellBladeParamsForPaneElement>} options Options to pass to
 * the `tweakpane` element, which may be dynamically computed each time it is rendered.
 */

/**
 * @template T
 * @typedef {Expand<BaseBladeParams
 * & Pick<TextBladeParams<T>, 'parse' | 'value' | 'format' | 'label'>>
 * } TextParamsForPaneElement
 */

/**
 * @typedef {Expand<BaseBladeParams & Pick<HTMLContainerParams, 'innerElem'>>
 * } HTMLContainerParamsForPaneElement
 */

/**
 * @typedef {Expand<BaseBladeParams & Pick<TableHeadParams, 'label' | 'headers'>>
 * } TableHeadParamsForPaneElement
 */

/**
 * Helper class to construct {@link PaneElementFactory} instances.
 * 
 * @template {{}} P The type of parameters (props) passed to the element.
 * @template {{}} [E={}] The type of event emitted by the element.
 */
export class PaneElementFactoryBuilder {

    /**
     * Indicates the type of parameters passed to the pane element.
     * 
     * @readonly
     * @type {Immutable<P>}
     */
    #params;

    /**
     * Indicates the type of events emitted by the pane element.
     * 
     * @readonly
     * @type {PaneElementEventTypes<E>}
     */
    #eventTypes;

    /**
     * Creates a new builder for constructing pane element factories, which in turn construct
     * pane elements that do not emit any events. (The generic value of {@link THREE.Event} is
     * just there for type correctness).
     * 
     * @template {{}} P The type of parameters (props) passed to the element.
     * @param {Immutable<P>} params Indicates the type of parameters passed to the pane element.
     * @returns {PaneElementFactoryBuilder<P>} The newly created builder.
     */
    static withoutEvents(params) {
        return new PaneElementFactoryBuilder(params, []);
    }

    /**
     * Creates a new builder for constructing pane element factories.
     * 
     * @param {Immutable<P>} params Indicates the type of parameters passed to the pane element.
     * @param {PaneElementEventTypes<E>} eventTypes Indicates the type of events emitted by the
     * pane element.
     */
    constructor(params, eventTypes) {
        this.#params = params;
        this.#eventTypes = eventTypes;
    }

    /**
     * Creates a {@link PaneElementBuilderContext} for a builder function.
     * 
     * @param {string} funcName The name of the builder function.
     * @param  {...any} args The arguments to the builder function.
     * @returns {PaneElementBuilderContext} The resulting context.
     */
    #makeCtx(funcName, ...args) {
        return {
            params: this.#params,
            eventTypes: this.#eventTypes,
            funcName: funcName,
            args: args,
        };
    }

    /**
     * Creates a pane element factory that constructs a pane element which
     * represents a `tweakpane` input binding.
     * 
     * @template {ReadonlyArray<string>} TPath
     * @param {[...TPath]} path The path in `params` of this builder that provides the
     * value for the input.
     * @param {PartialPaneElementConfig<InputParams, InputBindingApiEvents<InnerObject<P, TPath>>,
     * P, E>} config The configuration applied to the input.
     * @returns {PaneElementFactory<P, E>} The newly created pane element factory.
     */
    input(path, { options, modifyHTML = () => {}, eventHandlers = {} }) {
        if (!_.has(this.#params, path)) {
            throw new Error(`Invalid path in params! Path: ${JSON.stringify(path)}; Params: ${JSON.stringify(this.#params)}`);
        }

        return new BasePaneElementFactory(
            this.#eventTypes,
            (pane, params) => createInputBindingPaneElement(path, pane, params, {
                getOptions: FuncUtils.makeGetFunc(options),
                modifyHTML: modifyHTML,
                eventHandlers: eventHandlers,
            }),
            this.#makeCtx('input', { path, options, modifyHTML, eventHandlers }),
        );
    }

    /**
     * Creates a pane element factory that constructs a pane element which
     * represents a `tweakpane` list blade.
     * 
     * This is more flexible than the equivalent input binding since there can be
     * mixed data types in the options.
     * 
     * @template {ReadonlyArray<string>} TPath
     * @param {[...TPath]} path The path in `params` of this builder that provides the
     * value for the list.
     * @param {Expand<PartialPaneElementConfig<BaseBladeParams
     * & Pick<ListBladeParams<InnerObject<P, TPath>>, 'options' | 'label'>,
     * ApiChangeEvents<InnerObject<P, TPath>>, P, E>>} config
     * The configuration applied to the list.
     * @returns {PaneElementFactory<P, E>} The newly created pane element factory.
     */
    list(path, { options, modifyHTML = () => {}, eventHandlers = {} }) {
        if (!_.has(this.#params, path)) {
            throw new Error(`Invalid path in params! Path: ${JSON.stringify(path)}; Params: ${JSON.stringify(this.#params)}`);
        }

        return new BasePaneElementFactory(
            this.#eventTypes,
            (pane, params) => createListBladePaneElement(path, pane, params, {
                getOptions: FuncUtils.makeGetFunc(options),
                modifyHTML: modifyHTML,
                eventHandlers: eventHandlers,
            }),
            this.#makeCtx('list', { path, options, modifyHTML, eventHandlers }),
        );
    }

    /**
     * Creates a pane element factory that constructs a pane element which
     * represents a `tweakpane` button.
     * 
     * @param {PartialPaneElementConfig<ButtonParams, ButtonApiEvents, P, E>} config
     * The configuration applied to the button.
     * @returns {PaneElementFactory<P, E>} The newly created pane element factory.
     */
    button({ options, modifyHTML = () => {}, eventHandlers = {} }) {
        return new BasePaneElementFactory(
            this.#eventTypes,
            (pane, params) => new ButtonPaneElement(pane, params, {
                getOptions: FuncUtils.makeGetFunc(options),
                modifyHTML: modifyHTML,
                eventHandlers: eventHandlers,
            }),
            this.#makeCtx('button', { options, modifyHTML, eventHandlers }),
        );
    }

    /**
     * Creates a pane element factory that constructs a pane element which
     * contains a grid of buttons that can each be selected.
     * 
     * The value bound to the input should be a plain object: for each cell,
     * there should be an entry with the value in the cell as the key, and
     * whether the cell is selected as the boolean value.
     * 
     * The `isMultiSelect` option (default `false`) controls whether more than
     * one button can be selected at a time.
     * 
     * @template {ReadonlyArray<string>} TPath
     * @param {[...TPath]} path The path in `params` of this builder that provides the
     * value for the input.
     * @param {PartialPaneElementConfig<SelectGridInputParamsForPaneElement<P, TPath>,
     * InputBindingApiEvents<InnerObject<P, TPath>>, P, E>} config
     * The configuration applied to the HTML element.
     * @returns {PaneElementFactory<P, E>} The newly created pane element factory.
     */
    selectGrid(path, { options, modifyHTML = () => {}, eventHandlers = {} }) {
        return new BasePaneElementFactory(
            this.#eventTypes,
            (pane, params) => createSelectGridPaneElement(path, pane, params, {
                getOptions: FuncUtils.makeGetFunc(options),
                modifyHTML: modifyHTML,
                eventHandlers: eventHandlers,
            }),
            this.#makeCtx('selectGrid', { options, modifyHTML, eventHandlers }),
        );
    }

    /**
     * Creates a pane element factory that constructs a pane element which
     * represents a `tweakpane` separator.
     * 
     * @param {PartialPaneElementConfig<SeparatorParams, {}, P, E>} config
     * The configuration applied to the separator.
     * @returns {PaneElementFactory<P, E>} The newly created pane element factory.
     */
    separator({ options, modifyHTML = () => {}, eventHandlers = {} }) {
        return new BasePaneElementFactory(
            this.#eventTypes,
            (pane, params) => new SeparatorPaneElement(pane, params, {
                getOptions: FuncUtils.makeGetFunc(options),
                modifyHTML: modifyHTML,
                eventHandlers: eventHandlers,
            }),
            this.#makeCtx('separator', { options, modifyHTML, eventHandlers }),
        );
    }

    /**
     * Creates a pane element factory that constructs a pane element which
     * contains text.
     * 
     * @template T
     * @param {PartialPaneElementConfig<TextParamsForPaneElement<T>, {}, P, E>} config
     * The configuration applied to the text.
     * @returns {PaneElementFactory<P, E>} The newly created pane element factory.
     */
    text({ options, modifyHTML = () => {}, eventHandlers = {} }) {
        return new BasePaneElementFactory(
            this.#eventTypes,
            (pane, params) => createSimpleBladePaneElement(
                'text', TextApi,
                pane, params,
                {
                    getOptions: FuncUtils.makeGetFunc(options),
                    modifyHTML: modifyHTML,
                    eventHandlers: eventHandlers,
                },
            ),
            this.#makeCtx('text', { options, modifyHTML, eventHandlers }),
        );
    }

    /**
     * Creates a pane element factory that constructs a pane element which
     * contains a HTML element.
     * 
     * @param {PartialPaneElementConfig<HTMLContainerParamsForPaneElement, {}, P, E>} config
     * The configuration applied to the HTML element.
     * @returns {PaneElementFactory<P, E>} The newly created pane element factory.
     */
    htmlContainer({ options, modifyHTML = () => {}, eventHandlers = {} }) {
        return new BasePaneElementFactory(
            this.#eventTypes,
            (pane, params) => createSimpleBladePaneElement(
                'htmlcontainer', HTMLContainerApi,
                pane, params,
                {
                    getOptions: FuncUtils.makeGetFunc(options),
                    modifyHTML: modifyHTML,
                    eventHandlers: eventHandlers,
                },
            ),
            this.#makeCtx('htmlContainer', { options, modifyHTML, eventHandlers }),
        );
    }

    /**
     * Creates a pane element factory that constructs a pane element which
     * contains a header row for a table.
     * 
     * @param {PartialPaneElementConfig<TableHeadParamsForPaneElement, {}, P, E>} config
     * The configuration applied to the header row for a table.
     * @returns {PaneElementFactory<P, E>} The newly created pane element factory.
     */
    tableHead({ options, modifyHTML = () => {}, eventHandlers = {} }) {
        return new BasePaneElementFactory(
            this.#eventTypes,
            (pane, params) => createSimpleBladePaneElement(
                'tableHead', HeadApi,
                pane, params,
                {
                    getOptions: FuncUtils.makeGetFunc(options),
                    modifyHTML: modifyHTML,
                    eventHandlers: eventHandlers,
                },
            ),
            this.#makeCtx('tableHead', { options, modifyHTML, eventHandlers }),
        );
    }

    /**
     * Wraps a list of pane element factories so that the wrapper factory constructs a pane element
     * that represents a `tweakpane` table row containing the wrapped elements; each element is
     * attached to a cell in the parent row.
     * 
     * The wrapper pane element operates on the `params` and events of this builder,
     * forwarding `params` to the wrapped pane elements, and events from them.
     * 
     * @param {ReadonlyArray<TableCellSpec<P, E>>} cells Parameters passed to each cell in the row;
     * each cell contains the element created by a factory.
     * @param {Expand<PartialPaneElementConfig<BaseBladeParams & Pick<TableRowParams, 'label'>,
     * {}, P, E>>} config
     * The configuration applied to the tab.
     * @returns {PaneElementFactory<P, E>} The newly created pane element factory.
     */
    tableRow(cells, { options, modifyHTML = () => {}, eventHandlers = {} }) {
        return new BasePaneElementFactory(
            this.#eventTypes,
            (pane, params) => new TableRowPaneElement(
                pane,
                params,
                {
                    getOptions: (params_) => ({
                        ...FuncUtils.makeGetFunc(options)(params_),
                        cells: cells.map((cell) => FuncUtils.makeGetFunc(cell.options)(params_)),
                    }),
                    modifyHTML: modifyHTML,
                    eventHandlers: eventHandlers,
                },
                (tab, params_) => cells.map(
                    (cell) => cell.factory.attachElement(tab.getPane(), params_)),
                this.#eventTypes,
            ),
            this.#makeCtx('tableRow', { cells, options, modifyHTML, eventHandlers }),
        );
    }

    /**
     * Wraps a pane element factory so that the wrapper factory constructs a pane element
     * that represents a `tweakpane` folder containing the wrapped element.
     * 
     * The wrapper pane element operates on the `params` and events of this builder,
     * forwarding `params` to the wrapped pane element, and events from it.
     * 
     * @param {PaneElementFactory<P, E>} factory The factory to wrap.
     * This is usually a factory created by {@link PaneElementFactoryBuilder#sequential}
     * or {@link PaneElementFactoryBuilder#mapped}.
     * @param {PartialPaneElementConfig<FolderParams, FolderApiEvents, P, E>} config
     * The configuration applied to the folder.
     * @returns {PaneElementFactory<P, E>} The newly created pane element factory.
     */
    folder(factory, { options, modifyHTML = () => {}, eventHandlers = {} }) {
        return new BasePaneElementFactory(
            this.#eventTypes,
            (pane, params) => new FolderPaneElement(
                pane,
                params,
                {
                    getOptions: FuncUtils.makeGetFunc(options),
                    modifyHTML: modifyHTML,
                    eventHandlers: eventHandlers,
                },
                (folder, params_) => [factory.attachElement(folder, params_)],
                this.#eventTypes,
            ),
            this.#makeCtx('folder', { factory, options, modifyHTML, eventHandlers }),
        );
    }

    /**
     * Wraps a list of pane element factories so that the wrapper factory constructs a pane element
     * that represents a `tweakpane` tab containing the wrapped elements; each element is attached
     * to a page of the parent tab.
     * 
     * The wrapper pane element operates on the `params` and events of this builder,
     * forwarding `params` to the wrapped pane elements, and events from them.
     * 
     * @param {ReadonlyArray<TabPageSpec<P, E>>} pages Parameters passed to each page in the tab;
     * each page contains the element created by a factory.
     * @param {PartialPaneElementConfig<BaseParams, TabApiEvents, P, E>} config
     * The configuration applied to the tab.
     * @returns {PaneElementFactory<P, E>} The newly created pane element factory.
     */
    tab(pages, { options, modifyHTML = () => {}, eventHandlers = {} }) {
        return new BasePaneElementFactory(
            this.#eventTypes,
            (pane, params) => new TabPaneElement(
                pane,
                params,
                {
                    getOptions: (params_) => ({
                        ...FuncUtils.makeGetFunc(options)(params_),
                        pages: pages.map((page) => FuncUtils.makeGetFunc(page.options)(params_)),
                    }),
                    modifyHTML: modifyHTML,
                    eventHandlers: eventHandlers,
                },
                (tab, params_) => pages.map(
                    (page, i) => page.factory.attachElement(tab.pages[i], params_)),
                this.#eventTypes,
            ),
            this.#makeCtx('tab', { pages, options, modifyHTML, eventHandlers }),
        );
    }

    /**
     * Wraps a list of pane element factories so that the wrapper factory constructs a pane element
     * that virtually contains the wrapped pane elements; each element is sequentially attached to
     * the same parent `pane`.
     * 
     * The wrapper pane element operates on the `params` and events of this builder,
     * forwarding `params` to the wrapped pane elements, and events from them.
     * 
     * @param {ReadonlyArray<PaneElementFactory<P, E>>} factories
     * A factory for each sub-element.
     * @returns {PaneElementFactory<P, E>} The newly created pane element factory.
     */
    sequential(factories) {
        return new BasePaneElementFactory(
            this.#eventTypes,
            (pane, params) => new MultiWrapperPaneElement(
                pane,
                params,
                (pane_, params_) => factories.map(
                    (factory) => factory.attachElement(pane_, params_)),
                this.#eventTypes,
            ),
            this.#makeCtx('compose', { factories }),
        );
    }

    /**
     * Convenience method which creates the `eventsMapper` argument to
     * {@link PaneElementFactoryBuilder#mapped} for the common case where
     * the events emitted by the wrapped element is a subset of those
     * emitted by the wrapper element.
     * 
     * @returns {Pick<EventsMapper<E, E>, 'innerToOuter'>}
     * A newly created `eventsMapper`.
     */
    identityEventMapper() {
        return { innerToOuter: _.identity };
    }

    /**
     * Wraps a pane element factory so that the wrapper factory constructs a pane element
     * that maps data sent to/from the wrapped pane element.
     * 
     * The wrapper pane element operates on the `params` and events of this builder,
     * mapping `params` to the wrapped pane element, and events from it.
     * 
     * This allows a pane element that is designed for a particular object to
     * instead operate on an outer object, making it easier to compose
     * {@link PaneElementFactory} to work with different types of `params` and events.
     * 
     * @template PInner
     * @template {{}} EInner
     * @param {PaneElementFactory<PInner, EInner>} factory The factory to wrap.
     * @param {ParamsMapper<P, PInner>} paramsMapper Specifies how the `params` is mapped
     * between the wrapper and wrapped element.
     * @param {Pick<EventsMapper<E, EInner>, 'innerToOuter'>} eventsMapper
     * Specifies how the events are mapped between the wrapper and wrapped element.
     * @returns {PaneElementFactory<P, E>} The newly created pane element factory.
     */
    mapped(factory, paramsMapper, eventsMapper) {
        return factory.mapped(paramsMapper, {
            outerEventTypes: this.#eventTypes,
            innerToOuter: eventsMapper.innerToOuter,
        });
    }
}
