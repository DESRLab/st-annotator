import _ from 'lodash';
import * as THREE from 'three';

import { bindHandlers, safeAssign } from './PaneElement';

/**
 * @template T
 * @template V
 * @typedef {import('ts-essentials').PickKeys<T, V>} PickKeys
 */

/**
 * @typedef {import('tweakpane').BaseParams} BaseParams
 */

/**
 * @typedef {import('tweakpane').BaseBladeParams} BaseBladeParams
 */

/**
 * @typedef {import('tweakpane').BladeApi<any>} BladeApi
 */

/**
 * @typedef {import('@tweakpane/core').BaseInputParams} BaseInputParams
 */

/**
 * @typedef {import('tweakpane').InputParams} InputParams
 */

/**
 * @template In The internal type.
 * @template Ex The external type (= parameter object).
 * @typedef {import('tweakpane').InputBindingApi<In, Ex>} InputBindingApi
 */

/**
 * @template Ex The external type (= parameter object).
 * @typedef {import('tweakpane').InputBindingApiEvents<Ex>} InputBindingApiEvents
 */

/**
 * @typedef {import('tweakpane').ButtonParams} ButtonParams
 */

/**
 * @typedef {import('@tweakpane/core').ButtonApi} ButtonApi
 */

/**
 * @typedef {import('@tweakpane/core').ButtonApiEvents} ButtonApiEvents
 */

/**
 * @typedef {import('tweakpane').SeparatorParams} SeparatorParams
 */

/**
 * @typedef {import('@tweakpane/core').SeparatorApi} SeparatorApi
 */

/**
 * @template T
 * @typedef {import('tweakpane').ListBladeParams<T>} ListBladeParams
 */

/**
 * @template T
 * @typedef {import('tweakpane').ListApi<T>} ListApi
 */

/**
 * @template T
 * @typedef {import('@tweakpane/core').ApiChangeEvents<T>} ApiChangeEvents
 */

/**
 * @typedef {import('tweakpane').FolderApi} FolderApi
 */

/**
 * @typedef {import('tweakpane').TabPageApi} TabPageApi
 */

/**
 * @template {string} K
 * @typedef {import('../tweakpane-custom-plugins').SelectGridValue<K>} SelectGridValue
 */

/**
 * @template {string} K
 * @typedef {import('../tweakpane-custom-plugins').SelectGridInputParams<K>} SelectGridInputParams
 */

/**
 * @template T
 * @typedef {import('../../../../../../common/lib/utils').TypeUtils.ConstructorOf<T>} ConstructorOf
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
 * @template P
 * @template {{}} E
 * @typedef {import('./PaneElement').PaneElement<P, E>} PaneElement
 */

/**
 * @typedef {FolderApi | TabPageApi} PaneLike
 */

/**
 * For each `tweakpane` event type, optionally provides the corresponding handler.
 * 
 * @template {{}} TEventMap The available `tweakpane` events.
 * @template P The type of parameters (props) passed to the pane element.
 * @template {{}} E The type of event emitted by the element.
 * @typedef {TEventMap extends Record<infer EventName extends string, { event: unknown }>
 *     ? {
 *         [K in EventName]?:
 *         (element: PaneElement<P, E>, ev: TEventMap[K]['event']) => void
 *     }
 *     : never} TweakpaneEventHandlers
 */

/**
 * Represents the configuration of a pane element.
 * 
 * @template P The type of parameters (props) passed to the pane element.
 * @template {{}} E The type of event emitted by the pane element.
 * @template {BaseParams} TOptions The type of options passed to the `tweakpane` element.
 * @template {{}} TEventMap The available `tweakpane` events.
 * @typedef {object} PaneElementConfig
 * @property {(params: Immutable<P>) => TOptions} getOptions Options to pass to the
 * `tweakpane` element, which may be dynamically computed based on the given `params`
 * each time it is rendered.
 * @property {(element: HTMLElement, params: Immutable<P>, paneElem: PaneElement<P, E>
 * ) => void} modifyHTML
 * Manipulates the HTML of the `tweakpane` element based on the given `params`.
 * This is done after applying `options`.
 * @property {TweakpaneEventHandlers<TEventMap, P, E>} eventHandlers
 * Handles events emitted by the `tweakpane` element. Usually, the pane element
 * forwards such events (see {@link PaneElement#dispatchEvent}) so that its parents
 * can listen to them.
 */

/**
 * Base class for {@link PaneElement}s that do not contain other {@link PaneElement}s.
 * 
 * @implements {PaneElement<P, E>}
 * @template P The type of parameters (props) passed to the pane element.
 * @template {{}} E The type of event emitted by the element.
 * @template {BaseParams} TOptions The type of options passed to the `tweakpane` element.
 * @template {{}} TEventMap The available `tweakpane` events.
 * @template {BladeApi} TBlade The type of `tweakpane` element (wrapped by the pane element),
 * along with any associated data.
 * @template TData The type of data that is stored alongside the `tweakpane` element.
 * @augments THREE.EventDispatcher<E>
 */
export class UnitPaneElement extends THREE.EventDispatcher {

    /**
     * The `tweakpane` pane containing the wrapped `tweakpane` element.
     * 
     * @readonly
     * @type {PaneLike}
     */
    pane;

    /**
     * The configuration of this pane element.
     * 
     * @readonly
     * @type {PaneElementConfig<P, E, TOptions, TEventMap>}
     */
    config;

    /**
     * The wrapped `tweakpane` element.
     * 
     * @protected
     * @type {TBlade}
     */
    blade;

    /**
     * The data associated with the `tweakpane` element.
     * 
     * @protected
     * @type {TData}
     */
    data;

    /**
     * Creates a new pane element and attaches it to a `tweakpane` pane.
     * 
     * @param {PaneLike} pane The `tweakpane` pane to attach the element to.
     * @param {Immutable<P>} params The input parameters.
     * @param {PaneElementConfig<P, E, TOptions, TEventMap>} config
     * The configuration of the pane element.
     */
    constructor(pane, params, config) {
        super();

        this.pane = pane;
        this.config = config;

        const { blade, data } = this.attachBlade(
            this.pane, this.config.eventHandlers,
            params, this.config.getOptions(params),
        );
        this.blade = blade;
        this.data = data;

        this.config.modifyHTML(this.blade.element, params, this);
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.detachBlade(this.blade, this.pane, this.config.eventHandlers);
    }

    /**
     * Updates this pane element with the given parameters (props).
     * 
     * @param {Immutable<P>} params The input parameters.
     */
    render(params) {
        // Prevent the new value from conforming to the old options
        {
            const { blade, data } = this.setOptions(this.blade, this.data, params);
            this.blade = blade;
            this.data = data;
        }

        {
            const { blade, data } = this.setData(this.blade, this.data, params);
            this.blade = blade;
            this.data = data;
        }

        this.config.modifyHTML(this.blade.element, params, this);
    }

    /**
     * Updates the parameters with the ones that are currently represented by
     * this pane element.
     * 
     * @param {P} params The parameters to update.
     */
    updateParams(params) {
        this.setParams(params, this.blade, this.data);
    }

    /**
     * Constructs the `tweakpane` element to wrap, attaching it to `pane`
     * and binding `handlers` to it.
     * 
     * Note: This is called during object construction, so the function should not
     * depend on any state of the class instance.
     * 
     * @abstract
     * @protected
     * @param {PaneLike} pane The `tweakpane` pane to attach the element to.
     * @param {TweakpaneEventHandlers<TEventMap, P, E>} handlers
     * The event handlers to bind, such that they listen to the events emitted by
     * the `tweakpane` element.
     * @param {Immutable<P>} params The input parameters.
     * @param {Immutable<TOptions>} options Options to pass to the `tweakpane` element.
     * @returns {{ blade: TBlade, data: TData }} The newly constructed `tweakpane` element
     * and its associated data.
     */
    attachBlade(pane, handlers, params, options) {
        throw new Error('Not implemented');
    }

    /**
     * Disposes the wrapped `tweakpane` element, detaching it from `pane`
     * and unbinding `handlers` from it.
     * 
     * @protected
     * @param {TBlade} blade The `tweakpane` element to detach,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     * @param {PaneLike} pane The `tweakpane` pane to detach the element from.
     * @param {TweakpaneEventHandlers<TEventMap, P, E>} handlers
     * The event handlers to unbind, such that they stop listening to the events emitted by
     * the `tweakpane` element.
     */
    detachBlade(blade, pane, handlers) {
        blade.dispose();
    }

    /**
     * Updates the wrapped `tweakpane` element and its associated data with the options
     * stored in the given `params`.
     * 
     * @protected
     * @param {TBlade} blade The `tweakpane` element to update,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     * @param {TData} data The associated data to update,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     * @param {Immutable<P>} params The input parameters to refer to.
     * @returns {{ blade: TBlade, data: TData }} The updated `tweakpane` element and its
     * associated data, both of which are reassigned to this object.
     * This avoids the need to explicitly mutate the state of this object in the function.
     */
    setOptions(blade, data, params) {
        const nextOptions = this.config.getOptions(params);
        const unsafeNextOptions = safeAssign(blade, nextOptions);

        if (Object.entries(unsafeNextOptions).length > 0) {
            console.warn('Failed to assign some options:');
            console.warn(unsafeNextOptions);
        }

        return { blade, data };
    }

    /**
     * Updates the wrapped `tweakpane` element and its associated data with the data
     * stored in the given `params`.
     * 
     * @abstract
     * @protected
     * @param {TBlade} blade The `tweakpane` element to update,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     * @param {TData} data The associated data to update,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     * @param {Immutable<P>} params The input parameters to refer to.
     * @returns {{ blade: TBlade, data: TData }} The updated `tweakpane` element and its
     * associated data, both of which are reassigned to this object.
     * This avoids the need to explicitly mutate the state of this object in the function.
     */
    setData(blade, data, params) {
        throw new Error('Not implemented');
    }

    /**
     * Updates the given `params` with the wrapped `tweakpane` element and its associated data.
     * 
     * @abstract
     * @protected
     * @param {Immutable<P>} params The input parameters to update.
     * @param {TBlade} blade The `tweakpane` element to refer to,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     * @param {TData} data The associated data to refer,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     */
    setParams(params, blade, data) {
        throw new Error('Not implemented');
    }
}

/**
 * A {@link UnitPaneElement} that recreates the wrapped `tweakpane` element when the options
 * cannot be directly updated via assignment to the `tweakpane` element.
 * 
 * @template P The type of parameters (props) passed to the pane element.
 * @template {{}} E The type of event emitted by the element.
 * @template {BaseParams} TOptions The type of options passed to the `tweakpane` element.
 * @template {{}} TEventMap The available `tweakpane` events.
 * @template {BladeApi} TBlade The type of `tweakpane` element (wrapped by the pane element),
 * along with any associated data.
 * @template TData The type of data that is stored alongside the `tweakpane` element.
 * @augments {UnitPaneElement<P, E, TOptions, TEventMap, TBlade, TData>}
 */
export class UnitPaneElementWithRecreate extends UnitPaneElement {

    /**
     * The options in the most recent `params` passed to this pane element.
     * 
     * @protected
     * @type {TOptions}
     */
    prevOptions;

    /**
     * Creates a new pane element and attaches it to a `tweakpane` pane.
     * 
     * @param {PaneLike} pane The `tweakpane` pane to attach the element to.
     * @param {Immutable<P>} params The input parameters.
     * @param {PaneElementConfig<P, E, TOptions, TEventMap>} config
     * The configuration of the pane element.
     */
    constructor(pane, params, config) {
        super(pane, params, config);

        this.prevOptions = config.getOptions(params);
    }

    /**
     * Updates the wrapped `tweakpane` element and its associated data with the options
     * stored in the given `params`.
     * 
     * @protected
     * @param {TBlade} blade The `tweakpane` element to update,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     * @param {TData} data The associated data to update,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     * @param {Immutable<P>} params The input parameters to refer to.
     * @returns {{ blade: TBlade, data: TData }} The updated `tweakpane` element and its
     * associated data, both of which are reassigned to this object.
     * This avoids the need to explicitly mutate the state of this object in the function.
     */
    setOptions(blade, data, params) {
        const nextOptions = this.config.getOptions(params);
        const unsafeNextOptions = safeAssign(blade, nextOptions);

        // Avoid unnecessary recreation
        const unsafeOptionsToUpdate = Object.entries(unsafeNextOptions)
            // @ts-ignore
            .filter(([k, v]) => v !== this.prevOptions[k]);

        if (unsafeOptionsToUpdate.length > 0) {
            // Need to recreate the tweakpane element
            // https://github.com/cocopon/tweakpane/issues/63

            // This should no longer be required in v4
            // https://github.com/cocopon/tweakpane/issues/455

            const idx = this.pane.children.indexOf(this.blade);
            if (idx === -1) {
                throw new Error('Missing parent');
            }

            this.detachBlade(this.blade, this.pane, this.config.eventHandlers);

            const { blade: nextBlade, data: nextData } = this.attachBlade(
                this.pane, this.config.eventHandlers,
                params, { index: idx, ...nextOptions },
            );

            /* eslint-disable no-param-reassign */
            blade = nextBlade;
            data = nextData;
            /* eslint-enable no-param-reassign */
        }

        this.prevOptions = nextOptions;

        return { blade, data };
    }
}

/**
 * @template {{}} P The type of parameters (props) passed to the element.
 * @template {ReadonlyArray<string>} TPath The path in `P` to the value of the element.
 * @typedef {{ [x: string]: InnerObject<P, TPath> }} InputBindingPaneElementData
 */

/**
 * Creates a new pane element that wraps a `tweakpane` input binding.
 * 
 * @template {ReadonlyArray<string>} TPath The path in `P` to the value of the element.
 * @template {{}} P The type of parameters (props) passed to the element.
 * @template {{}} E The type of event emitted by the element.
 * @param {[...TPath]} path The path in `params` of this builder that provides the
 * value for the input.
 * @param {PaneLike} pane_ An existing pane to attach to.
 * @param {Immutable<P>} params_ The parameters used to initialize the pane element.
 * @param {PaneElementConfig<P, E, InputParams,
 * InputBindingApiEvents<InnerObject<P, TPath>>>} config_
 * The configuration applied to the input.
 * @returns {PaneElement<P, E>} The newly created pane element.
 */
export function createInputBindingPaneElement(path, pane_, params_, config_) {
    // We need to provide `path` before the pane element is constructed.
    // Here, this is achieved via an outer scope.

    const strPath = path.join('.');

    /**
     * @augments {UnitPaneElementWithRecreate<P, E, InputParams,
     * InputBindingApiEvents<InnerObject<P, TPath>>,
     * InputBindingApi<unknown, InnerObject<P, TPath>>,
     * InputBindingPaneElementData<P, TPath>>}
     */
    class InputBindingPaneElement extends UnitPaneElementWithRecreate {

        /**
         * Constructs the `tweakpane` element to wrap, attaching it to `pane`
         * and binding `handlers` to it.
         * 
         * Note: This is called during object construction, so the function should not
         * depend on any state of the class instance.
         * 
         * @protected
         * @param {PaneLike} pane The `tweakpane` pane to attach the element to.
         * @param {TweakpaneEventHandlers<InputBindingApiEvents<InnerObject<P, TPath>>, P, E>
         * } handlers The event handlers to bind, such that they listen to the events emitted by
         * the `tweakpane` element.
         * @param {Immutable<P>} params The input parameters.
         * @param {Immutable<InputParams>} options Options to pass to the `tweakpane` element.
         * @returns {{
         *     blade: InputBindingApi<unknown, InnerObject<P, TPath>>;
         *     data: InputBindingPaneElementData<P, TPath>;
         * }} The newly constructed `tweakpane` element and its associated data.
         */
        attachBlade(pane, handlers, params, options) {
            /**
             * @type {InputBindingPaneElementData<P, TPath>}
             */
            const boundParams = { [strPath]: _.get(params, path) };
            const input = pane.addInput(boundParams, strPath, options);

            bindHandlers(this, ['change'], handlers, input);

            return { blade: input, data: boundParams };
        }

        /**
         * Updates the wrapped `tweakpane` element and its associated data with the data
         * stored in the given `params`.
         * 
         * @protected
         * @param {InputBindingApi<unknown, InnerObject<P, TPath>>} blade The `tweakpane` element
         * to update, originally constructed by {@link UnitPaneElement#attachBlade}.
         * @param {InputBindingPaneElementData<P, TPath>} data The associated data to update,
         * originally constructed by {@link UnitPaneElement#attachBlade}.
         * @param {Immutable<P>} params The input parameters to refer to.
         * @returns {{
         *     blade: InputBindingApi<unknown, InnerObject<P, TPath>>;
         *     data: InputBindingPaneElementData<P, TPath>;
         * }} The updated `tweakpane` element and its associated data,
         * both of which are reassigned to this object.
         * This avoids the need to explicitly mutate the state of this object in the function.
         */
        setData(blade, data, params) {
            data[strPath] = _.get(params, path);

            blade.refresh();

            return { blade, data };
        }

        /**
         * Updates the given `params` with the wrapped `tweakpane` element and its associated data.
         * 
         * @protected
         * @param {P} params The input parameters to update.
         * @param {InputBindingApi<unknown, InnerObject<P, TPath>>} blade The `tweakpane` element
         * to refer to, originally constructed by {@link UnitPaneElement#attachBlade}.
         * @param {InputBindingPaneElementData<P, TPath>} data The associated data to refer to,
         * originally constructed by {@link UnitPaneElement#attachBlade}.
         */
        setParams(params, blade, data) {
            _.set(params, path, data[strPath]);
        }
    }

    return new InputBindingPaneElement(pane_, params_, config_);
}

/**
 * @template P The type of parameters (props) passed to the element.
 * @template {ReadonlyArray<string>} TPath The path in `P` to the value of the element.
 * @typedef {Expand<BaseBladeParams
 * & Pick<ListBladeParams<InnerObject<P, TPath>>, 'options' | 'label'>>
 * } ListBladeParamsForPaneElement
 */

/**
 * Creates a new pane element that wraps a `tweakpane` list blade.
 * 
 * This is more flexible than the equivalent input binding since there can be
 * mixed data types in the options.
 * 
 * @template {ReadonlyArray<string>} TPath The path in `P` to the value of the element.
 * @template {{}} P The type of parameters (props) passed to the element.
 * @template {{}} E The type of event emitted by the element.
 * @param {[...TPath]} path The path in `params` of this builder that provides the
 * value for the input.
 * @param {PaneLike} pane_ An existing pane to attach to.
 * @param {Immutable<P>} params_ The parameters used to initialize the pane element.
 * @param {PaneElementConfig<P, E, ListBladeParamsForPaneElement<P, TPath>,
 * ApiChangeEvents<InnerObject<P, TPath>>>} config_
 * The configuration applied to the input.
 * @returns {PaneElement<P, E>} The newly created pane element.
 */
export function createListBladePaneElement(path, pane_, params_, config_) {
    // We need to provide `path` before the pane element is constructed.
    // Here, this is achieved via an outer scope.

    /**
     * @augments {UnitPaneElementWithRecreate<P, E, ListBladeParamsForPaneElement<P, TPath>,
     * ApiChangeEvents<InnerObject<P, TPath>>,
     * ListApi<InnerObject<P, TPath>>,
     * InnerObject<P, TPath>>}
     */
    class ListBladePaneElement extends UnitPaneElementWithRecreate {

        /**
         * Constructs the `tweakpane` element to wrap, attaching it to `pane`
         * and binding `handlers` to it.
         * 
         * Note: This is called during object construction, so the function should not
         * depend on any state of the class instance.
         * 
         * @protected
         * @param {PaneLike} pane The `tweakpane` pane to attach the element to.
         * @param {TweakpaneEventHandlers<ApiChangeEvents<InnerObject<P, TPath>>, P, E>} handlers
         * The event handlers to bind, such that they listen to the events emitted by
         * the `tweakpane` element.
         * @param {Immutable<P>} params The input parameters.
         * @param {Immutable<ListBladeParamsForPaneElement<P, TPath>>} options
         * Options to pass to the `tweakpane` element.
         * @returns {{
         *     blade: ListApi<InnerObject<P, TPath>>;
         *     data: InnerObject<P, TPath>;
         * }} The newly constructed `tweakpane` element and its associated data.
         */
        attachBlade(pane, handlers, params, options) {
            /**
             * @type {InnerObject<P, TPath>}
             */
            const value = _.get(params, path);

            /**
             * @type {ListBladeParams<InnerObject<P, TPath>>}
             */
            const listParams = { ...options, view: 'list', value: value };

            /**
             * @type {ListApi<InnerObject<P, TPath>>}
             */
            // @ts-expect-error
            const listBlade = pane.addBlade(listParams);

            listBlade.on('change', (ev) => {
                this.data = ev.value;

                handlers.change?.(this, ev);
            });

            return { blade: listBlade, data: value };
        }

        /**
         * Updates the wrapped `tweakpane` element and its associated data with the data
         * stored in the given `params`.
         * 
         * @protected
         * @param {ListApi<InnerObject<P, TPath>>} blade The `tweakpane` element to update,
         * originally constructed by {@link UnitPaneElement#attachBlade}.
         * @param {InnerObject<P, TPath>} data The associated data to update,
         * originally constructed by {@link UnitPaneElement#attachBlade}.
         * @param {Immutable<P>} params The input parameters to refer to.
         * @returns {{
         *     blade: ListApi<InnerObject<P, TPath>>;
         *     data: InnerObject<P, TPath>;
         * }} The updated `tweakpane` element and its associated data,
         * both of which are reassigned to this object.
         * This avoids the need to explicitly mutate the state of this object in the function.
         */
        setData(blade, data, params) {
            const value = _.get(params, path);

            blade.value = value;

            return { blade: blade, data: value };
        }

        /**
         * Updates the given `params` with the wrapped `tweakpane` element and its associated data.
         * 
         * @protected
         * @param {P} params The input parameters to update.
         * @param {ListApi<InnerObject<P, TPath>>} blade The `tweakpane` element to refer to,
         * originally constructed by {@link UnitPaneElement#attachBlade}.
         * @param {InnerObject<P, TPath>} data The associated data to refer to,
         * originally constructed by {@link UnitPaneElement#attachBlade}.
         */
        setParams(params, blade, data) {
            _.set(params, path, data);
        }
    }

    return new ListBladePaneElement(pane_, params_, config_);
}

/**
 * A pane element that wraps a `tweakpane` button.
 * 
 * @template P The type of parameters (props) passed to the element.
 * @template {{}} E The type of event emitted by the element.
 * @augments {UnitPaneElementWithRecreate<P, E, ButtonParams, ButtonApiEvents, ButtonApi, {}>}
 */
export class ButtonPaneElement extends UnitPaneElementWithRecreate {

    /**
     * Constructs the `tweakpane` element to wrap, attaching it to `pane`
     * and binding `handlers` to it.
     * 
     * Note: This is called during object construction, so the function should not
     * depend on any state of the class instance.
     * 
     * @protected
     * @param {PaneLike} pane The `tweakpane` pane to attach the element to.
     * @param {TweakpaneEventHandlers<ButtonApiEvents, P, E>} handlers
     * The event handlers to bind, such that they listen to the events emitted by
     * the `tweakpane` element.
     * @param {Immutable<P>} params The input parameters.
     * @param {Immutable<ButtonParams>} options Options to pass to the `tweakpane` element.
     * @returns {{
     *     blade: ButtonApi;
     *     data: {};
     * }} The newly constructed `tweakpane` element and its associated data.
     */
    attachBlade(pane, handlers, params, options) {
        const button = pane.addButton(options);

        bindHandlers(this, ['click'], handlers, button);

        return { blade: button, data: {} };
    }

    /**
     * Updates the wrapped `tweakpane` element and its associated data with the data
     * stored in the given `params`.
     * 
     * @protected
     * @param {ButtonApi} blade The `tweakpane` element to update,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     * @param {{}} data The associated data to update,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     * @param {Immutable<P>} params The input parameters to refer to.
     * @returns {{
     *     blade: ButtonApi;
     *     data: {};
     * }} The updated `tweakpane` element and its associated data,
     * both of which are reassigned to this object.
     * This avoids the need to explicitly mutate the state of this object in the function.
     */
    setData(blade, data, params) {
        // No-op
        return { blade, data };
    }

    /**
     * Updates the given `params` with the wrapped `tweakpane` element and its associated data.
     * 
     * @protected
     * @param {P} params The input parameters to update.
     * @param {ButtonApi} blade The `tweakpane` element to refer to,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     * @param {{}} data The associated data to refer to,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     */
    setParams(params, blade, data) {
        // No-op
    }
}

/**
 * A pane element that wraps a `tweakpane` separator.
 * 
 * @template P The type of parameters (props) passed to the element.
 * @template {{}} E The type of event emitted by the element.
 * @augments {UnitPaneElementWithRecreate<P, E, SeparatorParams, {}, SeparatorApi, {}>}
 */
export class SeparatorPaneElement extends UnitPaneElementWithRecreate {

    /**
     * Constructs the `tweakpane` element to wrap, attaching it to `pane`
     * and binding `handlers` to it.
     * 
     * Note: This is called during object construction, so the function should not
     * depend on any state of the class instance.
     * 
     * @protected
     * @param {PaneLike} pane The `tweakpane` pane to attach the element to.
     * @param {TweakpaneEventHandlers<{}, P, E>} handlers
     * The event handlers to bind, such that they listen to the events emitted by
     * the `tweakpane` element.
     * @param {Immutable<P>} params The input parameters.
     * @param {Immutable<SeparatorParams>} options Options to pass to the `tweakpane` element.
     * @returns {{
     *     blade: SeparatorApi;
     *     data: {};
     * }} The newly constructed `tweakpane` element and its associated data.
     */
    attachBlade(pane, handlers, params, options) {
        const separator = pane.addSeparator(options);

        return { blade: separator, data: {} };
    }

    /**
     * Updates the wrapped `tweakpane` element and its associated data with the data
     * stored in the given `params`.
     * 
     * @protected
     * @param {SeparatorApi} blade The `tweakpane` element to update,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     * @param {{}} data The associated data to update,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     * @param {Immutable<P>} params The input parameters to refer to.
     * @returns {{
     *     blade: SeparatorApi;
     *     data: {};
     * }} The updated `tweakpane` element and its associated data,
     * both of which are reassigned to this object.
     * This avoids the need to explicitly mutate the state of this object in the function.
     */
    setData(blade, data, params) {
        // No-op
        return { blade, data };
    }

    /**
     * Updates the given `params` with the wrapped `tweakpane` element and its associated data.
     * 
     * @protected
     * @param {P} params The input parameters to update.
     * @param {SeparatorApi} blade The `tweakpane` element to refer to,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     * @param {{}} data The associated data to refer to,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     */
    setParams(params, blade, data) {
        // No-op
    }
}

/**
 * Creates a new pane element that wraps a `tweakpane` blade that does not involve any
 * data processing.
 * 
 * The `view` parameter for the blade is automatically provided as `viewType`.
 * 
 * @template {string} V The type of view.
 * @template {BladeApi} A The type of API.
 * @template {{}} P The type of parameters (props) passed to the element.
 * @template {{}} E The type of event emitted by the element.
 * @template {BaseBladeParams & { view?: V }} TOptions The type of options.
 * @template {{}} TEventMap The type of events.
 * @param {V} viewType The view to use for the blade.
 * @param {ConstructorOf<A>} apiType The type of API that is constructed for the blade.
 * @param {PaneLike} pane_ An existing pane to attach to.
 * @param {Immutable<P>} params_ The parameters used to initialize the pane element.
 * @param {PaneElementConfig<P, E, TOptions, TEventMap>} config_
 * The configuration applied to the input.
 * @returns {PaneElement<P, E>} The newly created pane element.
 */
export function createSimpleBladePaneElement(viewType, apiType, pane_, params_, config_) {
    /**
     * @template P The type of parameters (props) passed to the element.
     * @template {{}} E The type of event emitted by the element.
     * @augments {UnitPaneElementWithRecreate<P, E, TOptions, TEventMap, A, {}>}
     */
    class SimpleBladePaneElement extends UnitPaneElementWithRecreate {

        /**
         * Constructs the `tweakpane` element to wrap, attaching it to `pane`
         * and binding `handlers` to it.
         * 
         * Note: This is called during object construction, so the function should not
         * depend on any state of the class instance.
         * 
         * @protected
         * @param {PaneLike} pane The `tweakpane` pane to attach the element to.
         * @param {TweakpaneEventHandlers<TEventMap, P, E>} handlers
         * The event handlers to bind, such that they listen to the events emitted by
         * the `tweakpane` element.
         * @param {Immutable<P>} params The input parameters.
         * @param {Immutable<TOptions>} options Options to pass to
         * the `tweakpane` element.
         * @returns {{
         *     blade: A;
         *     data: {};
         * }} The newly constructed `tweakpane` element and its associated data.
         */
        attachBlade(pane, handlers, params, options) {
            /**
             * @type {BaseBladeParams & { view: V }}
             */
            const bladeParams = {
                ...options,
                view: viewType,
            };

            const blade = pane.addBlade(bladeParams);
            if (!(blade instanceof apiType)) {
                console.error(blade);
                throw new Error(`Incorrect type of blade! Expected type: ${apiType.constructor.name}`);
            }

            return { blade: blade, data: {} };
        }

        /**
         * Updates the wrapped `tweakpane` element and its associated data with the data
         * stored in the given `params`.
         * 
         * @protected
         * @param {A} blade The `tweakpane` element to update,
         * originally constructed by {@link UnitPaneElement#attachBlade}.
         * @param {{}} data The associated data to update,
         * originally constructed by {@link UnitPaneElement#attachBlade}.
         * @param {Immutable<P>} params The input parameters to refer to.
         * @returns {{
         *     blade: A;
         *     data: {};
         * }} The updated `tweakpane` element and its associated data,
         * both of which are reassigned to this object.
         * This avoids the need to explicitly mutate the state of this object in the function.
         */
        setData(blade, data, params) {
            // No-op
            return { blade, data };
        }

        /**
         * Updates the given `params` with the wrapped `tweakpane` element and its associated data.
         * 
         * @protected
         * @param {P} params The input parameters to update.
         * @param {A} blade The `tweakpane` element to refer to,
         * originally constructed by {@link UnitPaneElement#attachBlade}.
         * @param {{}} data The associated data to refer to,
         * originally constructed by {@link UnitPaneElement#attachBlade}.
         */
        setParams(params, blade, data) {
            // No-op
        }
    }

    return new SimpleBladePaneElement(pane_, params_, config_);
}

/**
 * @template T
 * @typedef {Extract<PickKeys<T, boolean>, string>} KeysOfBooleanProperties
 */

/**
 * @template {{}} P The type of parameters (props) passed to the element.
 * @template {ReadonlyArray<string>} TPath The path in `P` to the value of the element.
 * @typedef {Expand<BaseInputParams
 * & Pick<SelectGridInputParams<KeysOfBooleanProperties<InnerObject<P, TPath>>>, 'size' | 'cells'>>
 * } SelectGridInputParamsForPaneElement
 */

/**
 * Creates a new pane element that wraps a grid of buttons that can be selected independent
 * of each other.
 * 
 * @template {ReadonlyArray<string>} TPath The path in `P` to the value of the element.
 * @template {{}} P The type of parameters (props) passed to the element.
 * @template {{}} E The type of event emitted by the element.
 * @param {[...TPath]} path The path in `params` of this builder that provides the
 * value for the input.
 * @param {PaneLike} pane_ An existing pane to attach to.
 * @param {Immutable<P>} params_ The parameters used to initialize the pane element.
 * @param {PaneElementConfig<P, E,
 * SelectGridInputParamsForPaneElement<P, TPath>,
 * InputBindingApiEvents<InnerObject<P, TPath>>>} config_
 * The configuration applied to the input.
 * @returns {PaneElement<P, E>} The newly created pane element.
 */
export function createSelectGridPaneElement(path, pane_, params_, config_) {
    // We need to provide `path` before the pane element is constructed.
    // Here, this is achieved via an outer scope.

    const strPath = path.join('.');

    /**
     * @augments {UnitPaneElementWithRecreate<P, E, SelectGridInputParamsForPaneElement<P, TPath>,
     * InputBindingApiEvents<InnerObject<P, TPath>>,
     * InputBindingApi<unknown, InnerObject<P, TPath>>,
     * InputBindingPaneElementData<P, TPath>>}
     */
    class SelectGridPaneElement extends UnitPaneElementWithRecreate {

        /**
         * Constructs the `tweakpane` element to wrap, attaching it to `pane`
         * and binding `handlers` to it.
         * 
         * Note: This is called during object construction, so the function should not
         * depend on any state of the class instance.
         * 
         * @protected
         * @param {PaneLike} pane The `tweakpane` pane to attach the element to.
         * @param {TweakpaneEventHandlers<InputBindingApiEvents<InnerObject<P, TPath>>, P, E>
         * } handlers The event handlers to bind, such that they listen to the events emitted by
         * the `tweakpane` element.
         * @param {Immutable<P>} params The input parameters.
         * @param {Immutable<SelectGridInputParamsForPaneElement<P, TPath>>} options
         * Options to pass to the `tweakpane` element.
         * @returns {{
         *     blade: InputBindingApi<unknown, InnerObject<P, TPath>>;
         *     data: InputBindingPaneElementData<P, TPath>;
         * }} The newly constructed `tweakpane` element and its associated data.
         */
        attachBlade(pane, handlers, params, options) {
            /**
             * @type {InputBindingPaneElementData<P, TPath>}
             */
            const boundParams = { [strPath]: _.get(params, path) };

            /**
             * @type {SelectGridInputParams<Extract<keyof InnerObject<P, TPath>, string>>}
             */
            const selectGridOptions = {
                ...options,
                view: 'selectgrid',
            };

            const input = pane.addInput(boundParams, strPath, selectGridOptions);

            bindHandlers(this, ['change'], handlers, input);

            return { blade: input, data: boundParams };
        }

        /**
         * Updates the wrapped `tweakpane` element and its associated data with the data
         * stored in the given `params`.
         * 
         * @protected
         * @param {InputBindingApi<unknown, InnerObject<P, TPath>>} blade The `tweakpane` element
         * to update, originally constructed by {@link UnitPaneElement#attachBlade}.
         * @param {InputBindingPaneElementData<P, TPath>} data The associated data to update,
         * originally constructed by {@link UnitPaneElement#attachBlade}.
         * @param {Immutable<P>} params The input parameters to refer to.
         * @returns {{
         *     blade: InputBindingApi<unknown, InnerObject<P, TPath>>;
         *     data: InputBindingPaneElementData<P, TPath>;
         * }} The updated `tweakpane` element and its associated data,
         * both of which are reassigned to this object.
         * This avoids the need to explicitly mutate the state of this object in the function.
         */
        setData(blade, data, params) {
            data[strPath] = _.get(params, path);

            blade.refresh();

            return { blade, data };
        }

        /**
         * Updates the given `params` with the wrapped `tweakpane` element and its associated data.
         * 
         * @protected
         * @param {P} params The input parameters to update.
         * @param {InputBindingApi<unknown, InnerObject<P, TPath>>} blade The `tweakpane` element
         * to refer to, originally constructed by {@link UnitPaneElement#attachBlade}.
         * @param {InputBindingPaneElementData<P, TPath>} data The associated data to refer to,
         * originally constructed by {@link UnitPaneElement#attachBlade}.
         */
        setParams(params, blade, data) {
            _.set(params, path, data[strPath]);
        }
    }

    return new SelectGridPaneElement(pane_, params_, config_);
}
