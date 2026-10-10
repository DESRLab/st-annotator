import { cloneDeep, merge } from "lodash";

import { VanillaEventDispatcher, type BaseEvent } from "../../utils";

import type { PaneElement } from "./PaneElement";

export type Partial2<T> = { [K in keyof T]?: Partial<T[K]> };

export type DeepPartial<T> = Partial<T> | Partial2<T>;

export interface ParamsMapper<POuter, PInner> {
  outerToInner: (outer: Readonly<POuter>) => PInner;
  innerToOuter: (inner: Readonly<PInner>) => DeepPartial<POuter>;
}

export interface EventsMapper<EOuter extends {}, EInner extends {}> {
  outerEventTypes: readonly Extract<keyof EOuter, string>[];
  innerToOuter: <
    TInner extends Extract<keyof EInner, string>,
    TOuter extends Extract<keyof EOuter, string>,
  >(
    inner: Readonly<BaseEvent<TInner> & EInner[TInner]>,
  ) => BaseEvent<TOuter> & EOuter[TOuter];
}

export type AddWrappedElemsFunc<PInner, EInner extends {}, TBlade> = (
  pane: TBlade,
  params: Readonly<PInner>,
) => readonly PaneElement<PInner, EInner>[];

export type AddWrappedElemFunc<PInner, EInner extends {}, TBlade> = (
  pane: TBlade,
  params: Readonly<PInner>,
) => PaneElement<PInner, EInner>;

interface ImmutableParamsWithState<P, S> {
  params: Readonly<P>;
  state: Readonly<S>;
}

type PaneElementTransition<P, S> = (
  prev: ImmutableParamsWithState<P, S>,
  params: Readonly<P>,
) => ImmutableParamsWithState<P, S>;

/**
 * Base class for {@link PaneElement}s that wrap multiple {@link PaneElement}s;
 * the wrapped elements are sequentially attached to `blade` when the wrapper is constructed.
 *
 * This base class automatically forwards the calls defined by {@link PaneElement} to/from the
 * wrapped elements, with the data transformed according to `paramsMapper` and `eventsMapper`.
 *
 */
export class MultiMappedPaneElement<
  P,
  E extends {},
  PInner,
  EInner extends {},
  TBlade,
>
  extends VanillaEventDispatcher<E>
  implements PaneElement<P, E>
{
  /**
   * The `tweakpane` element that the wrapped pane elements are attached to.
   */
  readonly blade: TBlade;

  /**
   * Constructs the wrapped elements, attaching it to `blade`.
   */
  readonly addWrappedElems: AddWrappedElemsFunc<PInner, EInner, TBlade>;

  /**
   * The pane elements wrapped in this pane element.
   *
   * @protected
   */
  readonly wrappedElems: readonly PaneElement<PInner, EInner>[];

  /**
   * The name of each event emitted by the wrapped pane elements.
   */
  readonly wrappedEventTypes: readonly Extract<keyof EInner, string>[];

  /**
   * Specifies how the `params` is mapped between the wrapper and wrapped elements.
   */
  readonly paramsMapper: ParamsMapper<P, PInner>;

  /**
   * Specifies how the events are mapped between the wrapper and wrapped elements.
   */
  readonly eventsMapper: EventsMapper<E, EInner>;

  /**
   * Handles events dispatched by the wrapped pane elements.
   */
  #handleWrappedElemEvent = <T extends Extract<keyof EInner, string>>(
    innerEvent: BaseEvent<T> & EInner[T],
  ): void => {
    const event = this.eventsMapper.innerToOuter(innerEvent);
    this.dispatchEvent(event);
  };

  /**
   * Creates a new pane element and attaches it to a `tweakpane` element.
   *
   * Constructs the wrapped elements, attaching them to `blade`.
   * The name of each event emitted by the wrapped pane elements.
   * between the wrapper and wrapped elements.
   * between the wrapper and wrapped elements.
   */
  constructor(
    blade: TBlade,
    params: Readonly<P>,
    addWrappedElems: AddWrappedElemsFunc<PInner, EInner, TBlade>,
    wrappedEventTypes: readonly Extract<keyof EInner, string>[],
    paramsMapper: ParamsMapper<P, PInner>,
    eventsMapper: EventsMapper<E, EInner>,
  ) {
    super();

    this.blade = blade;
    this.addWrappedElems = addWrappedElems;
    this.wrappedEventTypes = wrappedEventTypes;

    this.paramsMapper = paramsMapper;
    this.eventsMapper = eventsMapper;

    this.wrappedElems = this.attachWrappedElems(
      this.blade,
      this.wrappedEventTypes,
      params,
    );
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose(): void {
    this.detachWrappedElems(
      this.wrappedElems,
      this.blade,
      this.wrappedEventTypes,
    );
  }

  /**
   * Updates this pane element with the given parameters (props).
   */
  render(params: Readonly<P>): void {
    const innerParams = this.paramsMapper.outerToInner(params);

    for (const wrappedElem of this.wrappedElems) {
      wrappedElem.render(innerParams);
    }
  }

  /**
   * Updates the parameters with the ones that are currently represented by
   * this pane element.
   */
  updateParams(params: P): void {
    const innerParams = this.paramsMapper.outerToInner(params);

    for (const wrappedElem of this.wrappedElems) {
      wrappedElem.updateParams(innerParams);
    }

    const paramsToUpdate = this.paramsMapper.innerToOuter(innerParams);
    merge(params, paramsToUpdate);
  }

  /**
   * Constructs the pane elements to wrap, attaching it to `blade`
   * and binding `handlers` to them.
   *
   * Note: This is called during object construction, so the function should not
   * depend on any state of the class instance.
   *
   * @protected
   * wrapped elements.
   */
  attachWrappedElems(
    blade: TBlade,
    eventTypes: readonly Extract<keyof EInner, string>[],
    params: Readonly<P>,
  ): readonly PaneElement<PInner, EInner>[] {
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
   * detach, originally constructed by {@link MultiMappedPaneElement#attachWrappedElems}.
   */
  detachWrappedElems(
    wrappedElems: readonly PaneElement<PInner, EInner>[],
    blade: TBlade,
    eventTypes: readonly Extract<keyof EInner, string>[],
  ): void {
    for (const wrappedElem of wrappedElems) {
      for (const eventType of eventTypes) {
        wrappedElem.removeEventListener(
          eventType,
          this.#handleWrappedElemEvent,
        );
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
 */
export class MultiWrapperPaneElement<
  P,
  E extends {},
  TBlade,
> extends MultiMappedPaneElement<P, E, P, E, TBlade> {
  /**
   * The name of each event emitted by this pane element.
   */
  get eventTypes(): readonly Extract<keyof E, string>[] {
    return this.wrappedEventTypes;
  }

  /**
   * Creates a new pane element and attaches it to a `tweakpane` element.
   *
   * Constructs the wrapped elements, attaching them to `blade`.
   * The name of each event emitted by the wrapped pane elements.
   *
   */
  constructor(
    blade: TBlade,
    params: Readonly<P>,
    addWrappedElems: AddWrappedElemsFunc<P, E, TBlade>,
    wrappedEventTypes: readonly Extract<keyof E, string>[],
  ) {
    super(
      blade,
      params,
      addWrappedElems,
      wrappedEventTypes,
      { outerToInner: (outer) => outer, innerToOuter: (inner) => inner },
      {
        outerEventTypes: wrappedEventTypes,
        innerToOuter: <
          TInner extends Extract<keyof E, string>,
          TOuter extends Extract<keyof E, string>,
        >(
          inner: Readonly<BaseEvent<TInner> & E[TInner]>,
        ) => inner as unknown as BaseEvent<TOuter> & E[TOuter],
      },
    );
  }
}

/**
 * Base class for {@link PaneElement}s that wrap a single {@link PaneElement};
 * the wrapped element is attached to `blade` when the wrapper is constructed.
 *
 * This base class automatically forwards the calls defined by {@link PaneElement} to/from the
 * wrapped element, with the data transformed according to `paramsMapper` and `eventsMapper`.
 *
 */
export class MappedPaneElement<
  P,
  E extends {},
  PInner,
  EInner extends {},
  TBlade,
> extends MultiMappedPaneElement<P, E, PInner, EInner, TBlade> {
  /**
   * Creates a new pane element and attaches it to a `tweakpane` element.
   *
   * Constructs the wrapped element, attaching it to `blade`.
   * The name of each event emitted by the wrapped pane element.
   * between the wrapper and wrapped element.
   * between the wrapper and wrapped element.
   *
   */
  constructor(
    blade: TBlade,
    params: Readonly<P>,
    addWrappedElem: AddWrappedElemFunc<PInner, EInner, TBlade>,
    wrappedEventTypes: readonly Extract<keyof EInner, string>[],
    paramsMapper: ParamsMapper<P, PInner>,
    eventsMapper: EventsMapper<E, EInner>,
  ) {
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
 */
export class WrapperPaneElement<
  P,
  E extends {},
  TBlade,
> extends MappedPaneElement<P, E, P, E, TBlade> {
  /**
   * The name of each event emitted by this pane element.
   */
  get eventTypes(): readonly Extract<keyof E, string>[] {
    return this.wrappedEventTypes;
  }

  /**
   * Creates a new pane element and attaches it to a `tweakpane` element.
   *
   * Constructs the wrapped element, attaching it to `blade`.
   * The name of each event emitted by the wrapped pane element.
   *
   */
  constructor(
    blade: TBlade,
    params: Readonly<P>,
    addWrappedElem: AddWrappedElemFunc<P, E, TBlade>,
    wrappedEventTypes: readonly Extract<keyof E, string>[],
  ) {
    super(
      blade,
      params,
      addWrappedElem,
      wrappedEventTypes,
      { outerToInner: (outer) => outer, innerToOuter: (inner) => inner },
      {
        outerEventTypes: wrappedEventTypes,
        innerToOuter: <
          TInner extends Extract<keyof E, string>,
          TOuter extends Extract<keyof E, string>,
        >(
          inner: Readonly<BaseEvent<TInner> & E[TInner]>,
        ) => inner as unknown as BaseEvent<TOuter> & E[TOuter],
      },
    );
  }
}

/**
 * A pane element that stores state and uses it to transform the `params`
 * passed to the wrapped {@link PaneElement}.
 *
 */
export class StatefulPaneElement<
  P,
  E extends {},
  TBlade,
  S,
> extends WrapperPaneElement<P, E, TBlade> {
  /**
   * The most recent `params` passed to this pane element.
   *
   * @protected
   */
  params: Readonly<P>;

  /**
   * The current state stored in this pane element.
   *
   * @protected
   */
  state: Readonly<S>;

  /**
   * Given `params` externally passed to {@link _PaneElement.render},
   * computes the `params` to be internally used, and the new state of this pane element.
   *
   * @protected
   */
  readonly transition: PaneElementTransition<P, S>;

  /**
   * Creates a new pane element and attaches it to a `tweakpane` element.
   *
   * Constructs the wrapped element, attaching it to `blade`.
   * The name of each event emitted by the wrapped pane element.
   * Given `params` externally passed to {@link _PaneElement.render},
   * computes the `params` to be internally used, and the new state of the pane element.
   * A deep copy is made from this object.
   *
   */
  constructor(
    blade: TBlade,
    params: Readonly<P>,
    addWrappedElem: AddWrappedElemFunc<P, E, TBlade>,
    wrappedEventTypes: readonly Extract<keyof E, string>[],
    transition: PaneElementTransition<P, S>,
    state: S,
  ) {
    super(blade, params, addWrappedElem, wrappedEventTypes);

    this.params = cloneDeep(params);
    this.state = cloneDeep(state);

    this.transition = transition;
  }

  /**
   * Updates this pane element with the given parameters (props).
   *
   */
  render(params: Readonly<P>): void {
    const { params: nextParams, state: nextState } = this.transition(
      {
        params: this.params,
        state: this.state,
      },
      params,
    );

    super.render(nextParams);

    this.params = cloneDeep(nextParams);
    this.state = cloneDeep(nextState);
  }
}
