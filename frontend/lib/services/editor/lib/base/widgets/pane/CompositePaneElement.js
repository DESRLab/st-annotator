import { bindHandlers, safeAssign } from './PaneElement';
import { registerPlugins } from './PanePlugins';
import { UnitPaneElement } from './UnitPaneElement';
import { MultiWrapperPaneElement } from './WrapperPaneElement';

/* eslint-disable max-len */
/**
 * @typedef {import('three')} THREE
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
 * @template In The internal type.
 * @template Ex The external type (= parameter object).
 * @typedef {import('tweakpane').InputBindingApi<In, Ex>} InputBindingApi
 */

/**
 * @typedef {import('tweakpane').FolderParams} FolderParams
 */

/**
 * @typedef {import('tweakpane').FolderApi} FolderApi
 */

/**
 * @typedef {import('@tweakpane/core').FolderApiEvents} FolderApiEvents
 */

/**
 * @typedef {import('tweakpane').TabParams} TabParams
 */

/**
 * @typedef {import('tweakpane').TabPageParams} TabPageParams
 */

/**
 * @typedef {import('tweakpane').TabApi} TabApi
 */

/**
 * This is not exported by the library for some reason, so we redefine it here.
 * 
 * @typedef {{
 *     change: {
 *         event: import('@tweakpane/core').TpChangeEvent<unknown>;
 *     };
 *     select: {
 *         event: import('@tweakpane/core').TpTabSelectEvent;
 *     };
 *     update: {
 *         event: import('@tweakpane/core').TpUpdateEvent<unknown>;
 *     };
 * }} TabApiEvents
 */

/**
 * @typedef {import('tweakpane-table').TableRowParams} TableRowParams
 */

/**
 * @typedef {import('tweakpane-table').CellBladeParams} CellBladeParams
 */

/**
 * @typedef {import('tweakpane-table').RowApi} RowApi
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
 * @template P
 * @template {{}} E
 * @typedef {import('./PaneElement').PaneElement<P, E>} PaneElement
 */

/**
 * @typedef {import('./UnitPaneElement').PaneLike} PaneLike
 */

/**
 * @template P
 * @template {{}} E
 * @template {BaseParams} TOptions
 * @template {{}} TEventMap
 * @typedef {import('./UnitPaneElement').PaneElementConfig<P, E, TOptions, TEventMap>} PaneElementConfig
 */

/**
 * @template {{}} TEventMap
 * @template P
 * @template {{}} E
 * @typedef {import('./UnitPaneElement').TweakpaneEventHandlers<TEventMap, P, E>} TweakpaneEventHandlers
 */

/**
 * @template P
 * @template {{}} E
 * @template {BladeApi} TBlade
 * @typedef {import('./WrapperPaneElement').AddWrappedElemsFunc<P, E, TBlade>} AddSubElemsFunc
 */
/* eslint-enable max-len */

/**
 * Base class for {@link PaneElement}s that contain other {@link PaneElement}s.
 * 
 * This base class automatically forwards the calls defined by {@link PaneElement} to/from
 * the contained elements, such that the abstract methods in {@link UnitPaneElement} only
 * involve the container element.
 * 
 * @implements {PaneElement<P, E>}
 * @template P The type of parameters (props) passed to the pane element.
 * @template {{}} E The type of event emitted by the element.
 * @template {BaseParams} TOptions The type of options passed to the `tweakpane` element.
 * @template {{}} TEventMap The available `tweakpane` events.
 * @template {BladeApi} TBlade The type of `tweakpane` element (wrapped by the pane element),
 * along with any associated data.
 * @template TData The type of data that is stored alongside the `tweakpane` element.
 * @augments {UnitPaneElement<P, E, TOptions, TEventMap, TBlade, TData>}
 */
export class CompositePaneElement extends UnitPaneElement {

    /**
     * The sub-elements contained in this pane element.
     * 
     * @protected
     * @readonly
     * @type {MultiWrapperPaneElement<P, E, TBlade>}
     */
    subElems;

    /**
     * Constructs the sub-elements elements, attaching it to pane.
     * 
     * @type {AddSubElemsFunc<P, E, TBlade>}
     */
    get addSubElems() { return this.subElems.addWrappedElems; }

    /**
     * The name of each event emitted by this pane element.
     * 
     * @type {ReadonlyArray<Extract<keyof E, string>>}
     */
    get eventTypes() { return this.subElems.eventTypes; }

    /**
     * Handles events dispatched by a sub-element.
     * 
     * @template {Extract<keyof E, string>} T
     * @param {THREE.BaseEvent<T> & E[T]} innerEvent The event to handle.
     */
    #handleSubElemEvent = (innerEvent) => {
        this.dispatchEvent(innerEvent);
    };

    /**
     * Creates a new pane element and attaches it to a `tweakpane` pane.
     * 
     * @param {PaneLike} pane The `tweakpane` pane to attach the element to.
     * @param {Immutable<P>} params The input parameters.
     * @param {PaneElementConfig<P, E, TOptions, TEventMap>} config
     * The configuration of the pane element.
     * @param {AddSubElemsFunc<P, E, TBlade>} addSubElems
     * Constructs the sub-elements, attaching them to `blade`.
     * @param {ReadonlyArray<Extract<keyof E, string>>} eventTypes
     * The name of each event emitted by the pane element, which is the union
     * of those emitted by the sub-elements.
     */
    constructor(pane, params, config, addSubElems, eventTypes) {
        // Avoid calling modifyHTML before the subelements have been attached
        const { modifyHTML, ...restConfig } = config;

        super(pane, params, { ...restConfig, modifyHTML: () => {} });

        this.subElems = new MultiWrapperPaneElement(this.blade, params, addSubElems, eventTypes);
        for (const eventType of this.subElems.eventTypes) {
            this.subElems.addEventListener(eventType, this.#handleSubElemEvent);
        }

        // Restore the original config
        this.config = config;

        modifyHTML(this.blade.element, params, this);
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        for (const eventType of this.subElems.eventTypes) {
            this.subElems.removeEventListener(eventType, this.#handleSubElemEvent);
        }
        this.subElems.dispose();

        super.dispose();
    }

    /**
     * Updates this pane element with the given parameters (props).
     * 
     * @param {Immutable<P>} params The input parameters.
     */
    render(params) {
        super.render(params);

        this.subElems.render(params);
    }

    /**
     * Updates the parameters with the ones that are currently represented by
     * this pane element.
     * 
     * @param {P} params The parameters to update.
     */
    updateParams(params) {
        super.updateParams(params);

        this.subElems.updateParams(params);
    }
}

/**
 * A pane element that wraps a `tweakpane` folder, which in turn contains other
 * {@link PaneElement}s (all under the same folder).
 * 
 * @template P The type of parameters (props) passed to the element.
 * @template {{}} E The type of event emitted by the element.
 * @augments {CompositePaneElement<P, E, FolderParams, FolderApiEvents, FolderApi, {}>}
 */
export class FolderPaneElement extends CompositePaneElement {

    /**
     * Constructs the `tweakpane` element to wrap, attaching it to `pane`
     * and binding `handlers` to it.
     * 
     * Note: This is called during object construction, so the function should not
     * depend on any state of the class instance.
     * 
     * @protected
     * @param {PaneLike} pane The `tweakpane` pane to attach the element to.
     * @param {TweakpaneEventHandlers<FolderApiEvents, P, E>} handlers
     * The event handlers to bind, such that they listen to the events emitted by
     * the `tweakpane` element.
     * @param {Immutable<P>} params The input parameters.
     * @param {Immutable<FolderParams>} options Options to pass to the `tweakpane` element.
     * @returns {{
     *     blade: FolderApi;
     *     data: {};
     * }} The newly constructed `tweakpane` element and its associated data.
     */
    attachBlade(pane, handlers, params, options) {
        const folder = pane.addFolder(options);

        bindHandlers(this, ['change', 'fold', 'update'], handlers, folder);

        return { blade: folder, data: {} };
    }

    /**
     * Updates the wrapped `tweakpane` element and its associated data with the data
     * stored in the given `params`.
     * 
     * @protected
     * @param {FolderApi} blade The `tweakpane` element to update,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     * @param {{}} data The associated data to update,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     * @param {Immutable<P>} params The input parameters to refer to.
     * @returns {{
     *     blade: FolderApi;
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
     * @param {Immutable<P>} params The input parameters.
     * @param {FolderApi} blade The `tweakpane` element to refer to,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     * @param {{}} data The associated data to refer to,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     */
    setParams(params, blade, data) {
        // No-op
    }
}

/**
 * @typedef {Expand<TabPageParams & {
 *     selected?: boolean;
 * }>} TabPageParamsForPaneElement
 */

/**
 * @typedef {Expand<BaseBladeParams
 * & { pages: TabPageParamsForPaneElement[] }>} TabParamsForPaneElement
 */

/**
 * A pane element that wraps a `tweakpane` tab, which in turn contains other
 * {@link PaneElement}s (one per page).
 * 
 * @template P The type of parameters (props) passed to the pane element.
 * @template {{}} E The type of event emitted by the element.
 * @augments {CompositePaneElement<P, E, TabParamsForPaneElement, TabApiEvents, TabApi, {}>}
 */
export class TabPaneElement extends CompositePaneElement {

    /**
     * Creates a new pane element and attaches it to a `tweakpane` pane.
     * 
     * @param {PaneLike} pane The `tweakpane` pane to attach the element to.
     * @param {Immutable<P>} params The input parameters.
     * @param {PaneElementConfig<P, E, TabParamsForPaneElement, TabApiEvents>} config
     * The configuration of the pane element.
     * @param {AddSubElemsFunc<P, E, TabApi>} addSubElems
     * Constructs the sub-elements, attaching them to `blade`.
     * @param {ReadonlyArray<Extract<keyof E, string>>} eventTypes
     * The name of each event emitted by the pane element, which is the union
     * of those emitted by the sub-elements.
     */
    constructor(pane, params, config, addSubElems, eventTypes) {
        super(pane, params, config, addSubElems, eventTypes);

        // Apply the other options that cannot be provided in attachBlade
        const { pages: pagesOptions } = this.config.getOptions(params);
        pagesOptions.forEach((pageOptions, i) => {
            safeAssign(this.blade.pages[i], pageOptions);
        });
    }

    /**
     * Constructs the `tweakpane` element to wrap, attaching it to `pane`
     * and binding `handlers` to it.
     * 
     * Note: This is called during object construction, so the function should not
     * depend on any state of the class instance.
     * 
     * @protected
     * @param {PaneLike} pane The `tweakpane` pane to attach the element to.
     * @param {TweakpaneEventHandlers<TabApiEvents, P, E>} handlers
     * The event handlers to bind, such that they listen to the events emitted by
     * the `tweakpane` element.
     * @param {Immutable<P>} params The input parameters.
     * @param {Immutable<TabParamsForPaneElement>} options Options to pass to the
     * `tweakpane` element.
     * @returns {{
     *     blade: TabApi;
     *     data: {};
     * }} The newly constructed `tweakpane` element and its associated data.
     */
    attachBlade(pane, handlers, params, options) {
        const { pages: pagesOptions, ...otherOptions } = options;

        /**
         * @type {TabParams}
         */
        const tabParams = {
            ...otherOptions,
            pages: pagesOptions.map(({ title }) => ({ title })),
        };

        const tab = pane.addTab(tabParams);

        bindHandlers(this, ['change', 'update', 'select'], handlers, tab);

        return { blade: tab, data: {} };
    }

    /**
     * Updates the wrapped `tweakpane` element and its associated data with the options
     * stored in the given `params`.
     * 
     * @protected
     * @param {TabApi} blade The `tweakpane` element to update,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     * @param {{}} data The associated data to update,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     * @param {Immutable<P>} params The input parameters to refer to.
     * @returns {{ blade: TabApi, data: {} }} The updated `tweakpane` element and its
     * associated data, both of which are reassigned to this object.
     * This avoids the need to explicitly mutate the state of this object in the function.
     */
    setOptions(blade, data, params) {
        const { pages: pagesOptions, ...otherOptions } = this.config.getOptions(params);

        safeAssign(blade, otherOptions);

        pagesOptions.forEach((pageOptions, i) => {
            safeAssign(blade.pages[i], pageOptions);
        });

        return { blade, data };
    }

    /**
     * Updates the wrapped `tweakpane` element and its associated data with the data
     * stored in the given `params`.
     * 
     * @protected
     * @param {TabApi} blade The `tweakpane` element to update,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     * @param {{}} data The associated data to update,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     * @param {Immutable<P>} params The input parameters to refer to.
     * @returns {{
     *     blade: TabApi;
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
     * @param {Immutable<P>} params The input parameters.
     * @param {TabApi} blade The `tweakpane` element to refer to,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     * @param {{}} data The associated data to refer to,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     */
    setParams(params, blade, data) {
        // No-op
    }
}

/**
 * @typedef {Expand<CellBladeParams & {
 *     minWidth?: string;
 *     maxWidth?: string;
 * }>} CellBladeParamsForPaneElement
 */

/**
 * @typedef {Expand<BaseBladeParams & Pick<TableRowParams, 'label'>
 * & { cells: Array<CellBladeParamsForPaneElement> }>} TableRowParamsForPaneElement
 */

/**
 * A pane element that wraps a `tweakpane` table row, which in turn contains other
 * {@link PaneElement}s (one per cell).
 * 
 * Note that this requires the use of the `tweakpane-table` plugin.
 * 
 * @template P The type of parameters (props) passed to the pane element.
 * @template {{}} E The type of event emitted by the element.
 * @augments {CompositePaneElement<P, E, TableRowParamsForPaneElement, {}, RowApi, {}>}
 */
export class TableRowPaneElement extends CompositePaneElement {

    /**
     * @readonly
     * @type {InputBindingApi<unknown, boolean>}
     */
    #dummyInput;

    /**
     * @readonly
     * @type {{ value: boolean }}
     */
    #dummyBoundParams;

    /**
     * Creates a new pane element and attaches it to a `tweakpane` pane.
     * 
     * @param {PaneLike} pane The `tweakpane` pane to attach the element to.
     * @param {Immutable<P>} params The input parameters.
     * @param {PaneElementConfig<P, E, TableRowParamsForPaneElement, {}>} config
     * The configuration of the pane element.
     * @param {AddSubElemsFunc<P, E, RowApi>} addSubElems
     * Constructs the sub-elements, attaching them to `blade`.
     * @param {ReadonlyArray<Extract<keyof E, string>>} eventTypes
     * The name of each event emitted by the pane element, which is the union
     * of those emitted by the sub-elements.
     */
    constructor(pane, params, config, addSubElems, eventTypes) {
        super(pane, params, config, addSubElems, eventTypes);

        // Apply the other options that cannot be provided in attachBlade
        const { cells: cellsOptions } = this.config.getOptions(params);
        cellsOptions.forEach((cellOptions, i) => {
            safeAssign(this.blade.getCell(i).element.style, cellOptions);
        });

        // This is used to trigger `'change'` events in the parent pane
        // when an input in a sub-element has changed
        this.#dummyBoundParams = { value: true };
        this.#dummyInput = this.pane.addInput(this.#dummyBoundParams, 'value', {
            hidden: true,
        });
    }

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
     * @param {Immutable<TableRowParamsForPaneElement>} options Options to pass to the
     * `tweakpane` element.
     * @returns {{
     *     blade: RowApi;
     *     data: {};
     * }} The newly constructed `tweakpane` element and its associated data.
     */
    attachBlade(pane, handlers, params, options) {
        // We attach the cells manually after addBlade is called via addSubElems
        // eslint-disable-next-line no-unused-vars
        const { cells: cellsOptions, ...otherOptions } = options;

        /**
         * @type {TableRowParams}
         */
        const tableRowParams = {
            ...otherOptions,
            view: 'tableRow',
        };

        /**
         * @type {RowApi}
         */
        // @ts-expect-error
        const tableRow = pane.addBlade(tableRowParams);

        const tablePane = tableRow.getPane();
        registerPlugins(tablePane);
        tablePane.on('change', () => {
            // In case this object has not been fully initialized yet
            if (this.#dummyBoundParams === undefined || this.#dummyInput === undefined) return;

            // Note that this means the controller should not assume anything about
            // the value of TpChangeEvent
            this.#dummyBoundParams.value = !this.#dummyBoundParams.value;
            this.#dummyInput.refresh();
        });

        return { blade: tableRow, data: {} };
    }

    /**
     * Disposes the wrapped `tweakpane` element, detaching it from `pane`
     * and unbinding `handlers` from it.
     * 
     * @protected
     * @param {RowApi} blade The `tweakpane` element to detach,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     * @param {PaneLike} pane The `tweakpane` pane to detach the element from.
     * @param {TweakpaneEventHandlers<{}, P, E>} handlers
     * The event handlers to unbind, such that they stop listening to the events emitted by
     * the `tweakpane` element.
     */
    detachBlade(blade, pane, handlers) {
        blade.getPane().dispose();

        super.dispose();
    }

    /**
     * Updates the wrapped `tweakpane` element and its associated data with the options
     * stored in the given `params`.
     * 
     * @protected
     * @param {RowApi} blade The `tweakpane` element to update,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     * @param {{}} data The associated data to update,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     * @param {Immutable<P>} params The input parameters to refer to.
     * @returns {{ blade: RowApi, data: {} }} The updated `tweakpane` element and its
     * associated data, both of which are reassigned to this object.
     * This avoids the need to explicitly mutate the state of this object in the function.
     */
    setOptions(blade, data, params) {
        const { cells: cellsOptions, ...otherOptions } = this.config.getOptions(params);

        safeAssign(blade, otherOptions);

        cellsOptions.forEach((cellOptions, i) => {
            safeAssign(blade.getCell(i).element.style, cellOptions);
        });

        return { blade, data };
    }

    /**
     * Updates the wrapped `tweakpane` element and its associated data with the data
     * stored in the given `params`.
     * 
     * @protected
     * @param {RowApi} blade The `tweakpane` element to update,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     * @param {{}} data The associated data to update,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     * @param {Immutable<P>} params The input parameters to refer to.
     * @returns {{
     *     blade: RowApi;
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
     * @param {Immutable<P>} params The input parameters.
     * @param {RowApi} blade The `tweakpane` element to refer to,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     * @param {{}} data The associated data to refer to,
     * originally constructed by {@link UnitPaneElement#attachBlade}.
     */
    setParams(params, blade, data) {
        // No-op
    }
}
