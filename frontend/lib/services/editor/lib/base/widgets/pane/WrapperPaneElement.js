import _ from 'lodash';
import * as THREE from 'three';

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
 * @template T
 * @typedef {{ [K in keyof T]?: Partial<T[K]> }} Partial2
 */

/**
 * Note: Add more levels of recursion as necessary.
 * 
 * @template T
 * @typedef {Partial<T> | Partial2<T>} DeepPartial
 */

/**
 * Specifies the mapping between the `params` of a pair of wrapper and wrapped
 * {@link PaneElement} instances.
 * 
 * @template POuter The type of `params` in the wrapper element.
 * @template PInner The type of `params` in the wrapped element.
 * @typedef {object} ParamsMapper
 * @property {(outer: Immutable<POuter>) => PInner} outerToInner
 * A function that maps `params` from that of the wrapper to that of the wrapped element.
 * @property {(inner: Immutable<PInner>) => DeepPartial<POuter>} innerToOuter
 * A function that maps `params` from that of the wrapped to that of the wrapper element.
 */

/**
 * Specifies the mapping between the events of a pair of wrapper and wrapped
 * {@link PaneElement} instances.
 * 
 * @template {{}} EOuter The type of events in the wrapper element.
 * @template {{}} EInner The type of events in the wrapped element.
 * @typedef {object} EventsMapper
 * @property {ReadonlyArray<Extract<keyof EOuter, string>>} outerEventTypes
 * Contains each event type emited by the wrapper element.
 * @property {<TInner extends Extract<keyof EInner, string>,
 * TOuter extends Extract<keyof EOuter, string>>(
 * inner: Immutable<THREE.BaseEvent<TInner> & EInner[TInner]>) =>
 * THREE.BaseEvent<TOuter> & EOuter[TOuter]} innerToOuter
 * A function that maps events from that of the wrapped to that of the wrapper element.
 */

/**
 * Note that `TBlade` is not bound to `BladeApi`. This allows more flexibility in the definition
 * of this function.
 * 
 * @template PInner The type of parameters (props) passed to the wrapped pane element.
 * @template {{}} EInner The type of event emitted by the wrapped element.
 * @template TBlade The type of `tweakpane` element that the wrapped elements are attached to.
 * @typedef {(pane: TBlade, params: Immutable<PInner>
 * ) => ReadonlyArray<PaneElement<PInner, EInner>>} AddWrappedElemsFunc
 */

/**
 * Base class for {@link PaneElement}s that wrap multiple {@link PaneElement}s;
 * the wrapped elements are sequentially attached to `blade` when the wrapper is constructed.
 * 
 * This base class automatically forwards the calls defined by {@link PaneElement} to/from the
 * wrapped elements, with the data transformed according to `paramsMapper` and `eventsMapper`.
 * 
 * @implements {PaneElement<P, E>}
 * @template P The type of parameters (props) passed to the pane element.
 * @template {{}} E The type of event emitted by the element.
 * @template PInner The type of parameters (props) passed to the wrapped pane element.
 * @template {{}} EInner The type of event emitted by the wrapped element.
 * @template TBlade The type of `tweakpane` element that the wrapped elements are attached to.
 * @augments THREE.EventDispatcher<E>
 */
export class MultiMappedPaneElement extends THREE.EventDispatcher {

    /**
     * The `tweakpane` element that the wrapped pane elements are attached to.
     * 
     * @readonly
     * @type {TBlade}
     */
    blade;

    /**
     * Constructs the wrapped elements, attaching it to `blade`.
     * 
     * @readonly
     * @type {AddWrappedElemsFunc<PInner, EInner, TBlade>}
     */
    addWrappedElems;

    /**
     * The pane elements wrapped in this pane element.
     * 
     * @protected
     * @readonly
     * @type {ReadonlyArray<PaneElement<PInner, EInner>>}
     */
    wrappedElems;

    /**
     * The name of each event emitted by the wrapped pane elements.
     * 
     * @readonly
     * @type {ReadonlyArray<Extract<keyof EInner, string>>}
     */
    wrappedEventTypes;

    /**
     * Specifies how the `params` is mapped between the wrapper and wrapped elements.
     * 
     * @readonly
     * @type {ParamsMapper<P, PInner>}
     */
    paramsMapper;

    /**
     * Specifies how the events are mapped between the wrapper and wrapped elements.
     * 
     * @readonly
     * @type {EventsMapper<E, EInner>}
     */
    eventsMapper;

    /**
     * Handles events dispatched by the wrapped pane elements.
     * 
     * @template {Extract<keyof EInner, string>} T
     * @param {THREE.BaseEvent<T> & EInner[T]} innerEvent The event to handle.
     */
    #handleWrappedElemEvent = (innerEvent) => {
        const event = this.eventsMapper.innerToOuter(innerEvent);
        this.dispatchEvent(event);
    };

    /**
     * Creates a new pane element and attaches it to a `tweakpane` element.
     * 
     * @param {TBlade} blade The `tweakpane` element to attach the wrapped elements to.
     * @param {Immutable<P>} params The input parameters.
     * @param {AddWrappedElemsFunc<PInner, EInner, TBlade>} addWrappedElems
     * Constructs the wrapped elements, attaching them to `blade`.
     * @param {ReadonlyArray<Extract<keyof EInner, string>>} wrappedEventTypes
     * The name of each event emitted by the wrapped pane elements.
     * @param {ParamsMapper<P, PInner>} paramsMapper Specifies how the `params` is mapped
     * between the wrapper and wrapped elements.
     * @param {EventsMapper<E, EInner>} eventsMapper Specifies how the events are mapped
     * between the wrapper and wrapped elements.
     */
    constructor(blade, params, addWrappedElems, wrappedEventTypes, paramsMapper, eventsMapper) {
        super();

        this.blade = blade;
        this.addWrappedElems = addWrappedElems;
        this.wrappedEventTypes = wrappedEventTypes;

        this.paramsMapper = paramsMapper;
        this.eventsMapper = eventsMapper;

        this.wrappedElems = this.attachWrappedElems(this.blade, this.wrappedEventTypes, params);
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.detachWrappedElems(this.wrappedElems, this.blade, this.wrappedEventTypes);
    }

    /**
     * Updates this pane element with the given parameters (props).
     * 
     * @param {Immutable<P>} params The input parameters.
     */
    render(params) {
        const innerParams = this.paramsMapper.outerToInner(params);

        for (const wrappedElem of this.wrappedElems) {
            wrappedElem.render(innerParams);
        }
    }

    /**
     * Updates the parameters with the ones that are currently represented by
     * this pane element.
     * 
     * @param {P} params The parameters to update.
     */
    updateParams(params) {
        const innerParams = this.paramsMapper.outerToInner(params);

        for (const wrappedElem of this.wrappedElems) {
            wrappedElem.updateParams(innerParams);
        }

        const paramsToUpdate = this.paramsMapper.innerToOuter(innerParams);
        _.merge(params, paramsToUpdate);
    }

    /**
     * Constructs the pane elements to wrap, attaching it to `blade`
     * and binding `handlers` to them.
     * 
     * Note: This is called during object construction, so the function should not
     * depend on any state of the class instance.
     * 
     * @protected
     * @param {TBlade} blade The `tweakpane` element to attach the wrapped elements to.
     * @param {ReadonlyArray<Extract<keyof EInner, string>>} eventTypes The event types to bind.
     * @param {Immutable<P>} params The input parameters.
     * @returns {ReadonlyArray<PaneElement<PInner, EInner>>} The newly constructed
     * wrapped elements.
     */
    attachWrappedElems(blade, eventTypes, params) {
        const innerParams = this.paramsMapper.outerToInner(params);
        const wrappedElems = this.addWrappedElems(blade, innerParams);

        for (const wrappedElem of wrappedElems) {
            for (const eventType of eventTypes) {
                wrappedElem.addEventListener(eventType, this.#handleWrappedElemEvent);
            }
        }

        return wrappedElems;
    }

    /**
     * Disposes the wrapped pane element, detaching them from `blade`
     * and unbinding `handlers` from it.
     * 
     * @protected
     * @param {ReadonlyArray<PaneElement<PInner, EInner>>} wrappedElems The wrapped elements to
     * detach, originally constructed by {@link MultiMappedPaneElement#attachWrappedElems}.
     * @param {TBlade} blade The `tweakpane` element to detach the wrapped elements from.
     * @param {ReadonlyArray<Extract<keyof EInner, string>>} eventTypes The event types to unbind.
     */
    detachWrappedElems(wrappedElems, blade, eventTypes) {
        for (const wrappedElem of wrappedElems) {
            for (const eventType of eventTypes) {
                wrappedElem.removeEventListener(eventType, this.#handleWrappedElemEvent);
            }
        }

        for (const wrappedElem of wrappedElems) {
            wrappedElem.dispose();
        }
    }
}

/**
 * Base class for {@link PaneElement}s that wrap multiple {@link PaneElement}s;
 * the wrapped elements are sequentially attached to `blade` when the wrapper is constructed.
 * 
 * This base class automatically forwards the calls defined by {@link PaneElement} to/from the
 * wrapped elements.
 * 
 * @template P The type of parameters (props) passed to the pane element.
 * @template {{}} E The type of event emitted by the element.
 * @template TBlade The type of `tweakpane` element that the wrapped elements are attached to.
 * @augments {MultiMappedPaneElement<P, E, P, E, TBlade>}
 */
export class MultiWrapperPaneElement extends MultiMappedPaneElement {

    /**
     * The name of each event emitted by this pane element.
     * 
     * @type {ReadonlyArray<Extract<keyof E, string>>}
     */
    get eventTypes() { return this.wrappedEventTypes; }

    /**
     * Creates a new pane element and attaches it to a `tweakpane` element.
     * 
     * @param {TBlade} blade The `tweakpane` element to attach the wrapped elements to.
     * @param {Immutable<P>} params The input parameters.
     * @param {AddWrappedElemsFunc<P, E, TBlade>} addWrappedElems
     * Constructs the wrapped elements, attaching them to `blade`.
     * @param {ReadonlyArray<Extract<keyof E, string>>} wrappedEventTypes
     * The name of each event emitted by the wrapped pane elements.
     */
    constructor(blade, params, addWrappedElems, wrappedEventTypes) {
        super(
            blade,
            params,
            addWrappedElems,
            wrappedEventTypes,
            { outerToInner: (outer) => outer, innerToOuter: (inner) => inner },
            /** @type {EventsMapper<E, E> } */
            ({ outerEventTypes: wrappedEventTypes, innerToOuter: (inner) => inner }),
        );
    }
}

/**
 * @template PInner The type of parameters (props) passed to the wrapped pane element.
 * @template {{}} EInner The type of event emitted by the wrapped element.
 * @template TBlade The type of `tweakpane` element that the wrapped elements are attached to.
 * @typedef {(pane: TBlade, params: Immutable<PInner>
 * ) => PaneElement<PInner, EInner>} AddWrappedElemFunc
 */

/**
 * Base class for {@link PaneElement}s that wrap a single {@link PaneElement};
 * the wrapped element is attached to `blade` when the wrapper is constructed.
 * 
 * This base class automatically forwards the calls defined by {@link PaneElement} to/from the
 * wrapped element, with the data transformed according to `paramsMapper` and `eventsMapper`.
 * 
 * @template P The type of parameters (props) passed to the pane element.
 * @template {{}} E The type of event emitted by the element.
 * @template PInner The type of parameters (props) passed to the wrapped pane element.
 * @template {{}} EInner The type of event emitted by the wrapped element.
 * @template TBlade The type of `tweakpane` element that the wrapped elements are attached to.
 * @augments {MultiMappedPaneElement<P, E, PInner, EInner, TBlade>}
 */
export class MappedPaneElement extends MultiMappedPaneElement {

    /**
     * Creates a new pane element and attaches it to a `tweakpane` element.
     * 
     * @param {TBlade} blade The `tweakpane` element to attach the wrapped elements to.
     * @param {Immutable<P>} params The input parameters.
     * @param {AddWrappedElemFunc<PInner, EInner, TBlade>} addWrappedElem
     * Constructs the wrapped element, attaching it to `blade`.
     * @param {ReadonlyArray<Extract<keyof EInner, string>>} wrappedEventTypes
     * The name of each event emitted by the wrapped pane element.
     * @param {ParamsMapper<P, PInner>} paramsMapper Specifies how the `params` is mapped
     * between the wrapper and wrapped element.
     * @param {EventsMapper<E, EInner>} eventsMapper Specifies how the events are mapped
     * between the wrapper and wrapped element.
     */
    constructor(blade, params, addWrappedElem, wrappedEventTypes, paramsMapper, eventsMapper) {
        super(
            blade,
            params,
            (pane_, params_) => [addWrappedElem(pane_, params_)],
            wrappedEventTypes,
            paramsMapper,
            eventsMapper,
        );
    }
}

/**
 * Base class for {@link PaneElement}s that wrap a single {@link PaneElement};
 * the wrapped element is attached to `blade` when the wrapper is constructed.
 * 
 * This base class automatically forwards the calls defined by {@link PaneElement} to/from the
 * wrapped elements.
 * 
 * @template P The type of parameters (props) passed to the pane element.
 * @template {{}} E The type of event emitted by the element.
 * @template TBlade The type of `tweakpane` element that the wrapped elements are attached to.
 * @augments {MappedPaneElement<P, E, P, E, TBlade>}
 */
export class WrapperPaneElement extends MappedPaneElement {

    /**
     * The name of each event emitted by this pane element.
     * 
     * @type {ReadonlyArray<Extract<keyof E, string>>}
     */
    get eventTypes() { return this.wrappedEventTypes; }

    /**
     * Creates a new pane element and attaches it to a `tweakpane` element.
     * 
     * @param {TBlade} blade The `tweakpane` element to attach the wrapped elements to.
     * @param {Immutable<P>} params The input parameters.
     * @param {AddWrappedElemFunc<P, E, TBlade>} addWrappedElem
     * Constructs the wrapped element, attaching it to `blade`.
     * @param {ReadonlyArray<Extract<keyof E, string>>} wrappedEventTypes
     * The name of each event emitted by the wrapped pane element.
     */
    constructor(blade, params, addWrappedElem, wrappedEventTypes) {
        super(
            blade,
            params,
            addWrappedElem,
            wrappedEventTypes,
            { outerToInner: (outer) => outer, innerToOuter: (inner) => inner },
            /** @type {EventsMapper<E, E> } */
            ({ outerEventTypes: wrappedEventTypes, innerToOuter: (inner) => inner }),
        );
    }
}

/**
 * @template P The type of parameters (props) passed to the element.
 * @template S The type of state stored in the element.
 * @typedef {object} ImmutableParamsWithState
 * @property {Immutable<P>} params The parameters passed to {@link PaneElement#render}.
 * @property {Immutable<S>} state The state stored in the pane element.
 */

/**
 * @template P The type of parameters (props) passed to the pane element.
 * @template S The type of state stored in the element.
 * @typedef {(prev: ImmutableParamsWithState<P, S>, params: Immutable<P>
 * ) => ImmutableParamsWithState<P, S>} PaneElementTransition
 */

/**
 * A pane element that stores state and uses it to transform the `params`
 * passed to the wrapped {@link PaneElement}.
 * 
 * @template P The type of parameters (props) passed to the pane element.
 * @template {{}} E The type of event emitted by the element.
 * @template TBlade The type of `tweakpane` element that the wrapped elements are attached to.
 * @template S The type of state stored in the element.
 * @augments {WrapperPaneElement<P, E, TBlade>}
 */
export class StatefulPaneElement extends WrapperPaneElement {

    /**
     * The most recent `params` passed to this pane element.
     * 
     * @protected
     * @type {Immutable<P>}
     */
    params;

    /**
     * The current state stored in this pane element.
     * 
     * @protected
     * @type {Immutable<S>}
     */
    state;

    /**
     * Given `params` externally passed to {@link PaneElement#render},
     * computes the `params` to be internally used, and the new state of this pane element.
     * 
     * @readonly
     * @protected
     * @type {PaneElementTransition<P, S>}
     */
    transition;

    /**
     * Creates a new pane element and attaches it to a `tweakpane` element.
     * 
     * @param {TBlade} blade The `tweakpane` element to attach the wrapped elements to.
     * @param {Immutable<P>} params The input parameters.
     * @param {AddWrappedElemFunc<P, E, TBlade>} addWrappedElem
     * Constructs the wrapped element, attaching it to `blade`.
     * @param {ReadonlyArray<Extract<keyof E, string>>} wrappedEventTypes
     * The name of each event emitted by the wrapped pane element.
     * @param {PaneElementTransition<P, S>} transition
     * Given `params` externally passed to {@link PaneElement#render},
     * computes the `params` to be internally used, and the new state of the pane element.
     * @param {Immutable<S>} state The initial state to store in the pane element.
     * A deep copy is made from this object.
     */
    constructor(blade, params, addWrappedElem, wrappedEventTypes, transition, state) {
        super(blade, params, addWrappedElem, wrappedEventTypes);

        this.params = _.cloneDeep(params);
        this.state = _.cloneDeep(state);

        this.transition = transition;
    }

    /**
     * Updates this pane element with the given parameters (props).
     * 
     * @param {Immutable<P>} params The input parameters.
     */
    render(params) {
        const { params: nextParams, state: nextState } = this.transition({
            params: this.params,
            state: this.state,
        }, params);

        super.render(nextParams);

        this.params = _.cloneDeep(nextParams);
        this.state = _.cloneDeep(nextState);
    }
}
