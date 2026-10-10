import type {
  ApiChangeEvents,
  BindingApiEvents,
  ButtonApiEvents,
  FolderApiEvents,
} from "@tweakpane/core";
import {
  TextBladeApi,
  type BaseBladeParams,
  type BaseParams,
  type BindingParams,
  type ButtonParams,
  type FolderParams,
  type ListBladeParams,
  type TabApi,
  type TextBladeParams,
} from "tweakpane";
import {
  HeadApi,
  type RowApi,
  type TableHeadParams,
  type TableRowParams,
} from "tweakpane-table";

import { FuncUtils, type Expand, type InnerObject } from "sta/common";

import type { BaseEvent } from "../../utils";
import {
  HTMLContainerApi,
  type HTMLContainerParams,
} from "../tweakpane-custom-plugins";

import {
  FolderPaneElement,
  TabPaneElement,
  TableRowPaneElement,
  getTableRowCellPanes,
  type CellBladeParamsForPaneElement,
  type TabApiEvents,
  type TabPageParamsForPaneElement,
} from "./CompositePaneElement.tsx";
import type { PaneElement } from "./PaneElement";
import {
  ButtonPaneElement,
  SeparatorPaneElement,
  createInputBindingPaneElement,
  createListBladePaneElement,
  createSelectGridPaneElement,
  createSimpleBladePaneElement,
  type PaneLike,
  type SelectGridInputParamsForPaneElement,
  type TweakpaneEventHandlers,
} from "./UnitPaneElement";
import {
  MappedPaneElement,
  MultiWrapperPaneElement,
  StatefulPaneElement,
  type EventsMapper,
  type ParamsMapper,
} from "./WrapperPaneElement.tsx";

function hasPath(value: unknown, path: readonly string[]): boolean {
  let current = value;
  for (const key of path) {
    if (
      current == null ||
      !Object.prototype.hasOwnProperty.call(current, key)
    ) {
      return false;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return true;
}

export type TweakpaneOptions<P, TOptions> =
  TOptions | ((params: Readonly<P>) => TOptions);

export type PaneElementEventTypes<E extends {}> = readonly Extract<
  keyof E,
  string
>[];

export type AttachElementFunc<P, E extends {}> = (
  pane: PaneLike,
  params: Readonly<P>,
) => PaneElement<P, E>;

export interface PaneElementBuilderContext {
  operationPath: readonly string[];
}

export interface ImmutableParamsWithState<P, S> {
  params: Readonly<P>;
  state: Readonly<S>;
}

export interface PartialPaneElementConfig<
  TOptions extends {},
  TEventMap extends {},
  P,
  E extends {},
> {
  options: TweakpaneOptions<P, TOptions>;
  modifyHTML?: (
    element: HTMLElement,
    params: Readonly<P>,
    paneElem: PaneElement<P, E>,
  ) => void;
  eventHandlers?: TweakpaneEventHandlers<TEventMap, P, E>;
}

type TextParamsForPaneElement<T> = Expand<
  BaseBladeParams &
    Pick<TextBladeParams<T>, "parse" | "value" | "format" | "label">
>;

type HTMLContainerParamsForPaneElement = Expand<
  BaseBladeParams & Pick<HTMLContainerParams, "innerElem">
>;

type TableHeadParamsForPaneElement = Expand<
  BaseBladeParams & Pick<TableHeadParams, "label" | "headers">
>;

export interface TabPageSpec<P, E extends {}> {
  factory: PaneElementFactory<P, E>;
  options: TweakpaneOptions<P, TabPageParamsForPaneElement>;
}

export interface TableCellSpec<P, E extends {}> {
  factory: PaneElementFactory<P, E>;
  options: TweakpaneOptions<P, CellBladeParamsForPaneElement>;
}

/**
 * Represents a factory that creates {@link PaneElement} instances.
 */
export interface PaneElementFactory<P, E extends {} = {}> {
  /**
   * Indicates the type of events emitted by the pane element.
   */
  readonly eventTypes: PaneElementEventTypes<E>;

  /**
   * Creates a new pane element which is attached to a pane.
   *
   * See the pane plugin registration for the plugins available to the pane.
   */
  attach(this: void, pane: PaneLike, params: Readonly<P>): PaneElement<P, E>;

  /** Debug metadata consumed by the React host when an imperative operation fails. */
  readonly debugContext: PaneElementBuilderContext;
}

export function createPaneFactory<P, E extends {} = {}>(
  eventTypes: PaneElementEventTypes<E>,
  attach: AttachElementFunc<P, E>,
  debugContext: PaneElementBuilderContext,
): PaneElementFactory<P, E> {
  return Object.freeze({ eventTypes, attach, debugContext });
}

/** Creates a stable factory while deferring a definition that depends on runtime DOM slots. */
export function lazyPaneFactory<P, E extends {} = {}>(
  eventTypes: PaneElementEventTypes<E>,
  build: () => PaneElementFactory<P, E>,
  debugContext: PaneElementBuilderContext,
): PaneElementFactory<P, E> {
  return createPaneFactory(
    eventTypes,
    (pane, params) => build().attach(pane, params),
    debugContext,
  );
}

export function withPaneState<P, E extends {}, S>(
  factory: PaneElementFactory<P, E>,
  transition: (
    prev: ImmutableParamsWithState<P, S>,
    params: Readonly<P>,
  ) => ImmutableParamsWithState<P, S>,
  initState: S,
): PaneElementFactory<P, E> {
  return createPaneFactory(
    factory.eventTypes,
    (pane, params) =>
      new StatefulPaneElement(
        pane,
        params,
        factory.attach,
        factory.eventTypes,
        transition,
        initState,
      ),
    { operationPath: [...factory.debugContext.operationPath, "withState"] },
  );
}

export function mapPane<POuter, PInner, EOuter extends {}, EInner extends {}>(
  factory: PaneElementFactory<PInner, EInner>,
  paramsMapper: ParamsMapper<POuter, PInner>,
  eventsMapper: EventsMapper<EOuter, EInner>,
): PaneElementFactory<POuter, EOuter> {
  return createPaneFactory(
    eventsMapper.outerEventTypes,
    (pane, params) =>
      new MappedPaneElement(
        pane,
        params,
        factory.attach,
        factory.eventTypes,
        paramsMapper,
        eventsMapper,
      ),
    { operationPath: [...factory.debugContext.operationPath, "mapped"] },
  );
}

/**
 * Helper class to construct {@link PaneElementFactory} instances.
 */
export class PaneElementFactoryBuilder<P extends {}, E extends {} = {}> {
  /**
   * Indicates the type of parameters passed to the pane element.
   */
  readonly #params: Readonly<P>;

  /**
   * Indicates the type of events emitted by the pane element.
   */
  readonly #eventTypes: PaneElementEventTypes<E>;

  /**
   * Creates a new builder for constructing pane element factories, which in turn construct
   * pane elements that do not emit any events. (The generic value of {@link Event} is
   * just there for type correctness).
   *
   */
  static withoutEvents<P extends {}>(
    params: Readonly<P>,
  ): PaneElementFactoryBuilder<P> {
    return new PaneElementFactoryBuilder(params, []);
  }

  /**
   * Creates a new builder for constructing pane element factories.
   *
   * pane element.
   *
   */
  constructor(params: Readonly<P>, eventTypes: PaneElementEventTypes<E>) {
    this.#params = params;
    this.#eventTypes = eventTypes;
  }

  /**
   * Creates the context for a builder function.
   *
   * @param args
   */
  #makeCtx(
    funcName: string,
    ..._args: readonly unknown[]
  ): PaneElementBuilderContext {
    return { operationPath: [funcName] };
  }

  /**
   * Creates a pane element factory that constructs a pane element which
   * represents a `tweakpane` input binding.
   *
   * value for the input.
   *
   */
  input<TPath extends readonly string[]>(
    path: [...TPath],
    {
      options,
      modifyHTML = () => {},
      eventHandlers = {},
    }: PartialPaneElementConfig<
      BindingParams,
      BindingApiEvents<InnerObject<P, TPath>>,
      P,
      E
    >,
  ): PaneElementFactory<P, E> {
    if (!hasPath(this.#params, path)) {
      throw new Error(
        `Invalid path in params! Path: ${JSON.stringify(path)}; Params: ${JSON.stringify(this.#params)}`,
      );
    }

    return createPaneFactory<P, E>(
      this.#eventTypes,
      (pane, params) =>
        createInputBindingPaneElement(path, pane, params, {
          getOptions: FuncUtils.makeGetFunc(options),
          modifyHTML: modifyHTML,
          eventHandlers: eventHandlers,
        }),
      this.#makeCtx("input", {
        path,
        options,
        modifyHTML,
        eventHandlers,
      }),
    );
  }

  /**
   * Creates a pane element factory that constructs a pane element which
   * represents a `tweakpane` list blade.
   *
   * This is more flexible than the equivalent input binding since there can be
   * mixed data types in the options.
   *
   * value for the list.
   * The configuration applied to the list.
   *
   */
  list<TPath extends readonly string[]>(
    path: [...TPath],
    {
      options,
      modifyHTML = () => {},
      eventHandlers = {},
    }: Expand<
      PartialPaneElementConfig<
        BaseBladeParams &
          Pick<ListBladeParams<InnerObject<P, TPath>>, "options" | "label">,
        ApiChangeEvents<InnerObject<P, TPath>>,
        P,
        E
      >
    >,
  ): PaneElementFactory<P, E> {
    if (!hasPath(this.#params, path)) {
      throw new Error(
        `Invalid path in params! Path: ${JSON.stringify(path)}; Params: ${JSON.stringify(this.#params)}`,
      );
    }

    return createPaneFactory<P, E>(
      this.#eventTypes,
      (pane, params) =>
        createListBladePaneElement(path, pane, params, {
          getOptions: FuncUtils.makeGetFunc(options),
          modifyHTML: modifyHTML,
          eventHandlers: eventHandlers,
        }),
      this.#makeCtx("list", { path, options, modifyHTML, eventHandlers }),
    );
  }

  /**
   * Creates a pane element factory that constructs a pane element which
   * represents a `tweakpane` button.
   *
   * The configuration applied to the button.
   *
   */
  button({
    options,
    modifyHTML = () => {},
    eventHandlers = {},
  }: PartialPaneElementConfig<
    ButtonParams,
    ButtonApiEvents,
    P,
    E
  >): PaneElementFactory<P, E> {
    return createPaneFactory<P, E>(
      this.#eventTypes,
      (pane, params) =>
        new ButtonPaneElement(pane, params, {
          getOptions: FuncUtils.makeGetFunc(options),
          modifyHTML: modifyHTML,
          eventHandlers: eventHandlers,
        }),
      this.#makeCtx("button", { options, modifyHTML, eventHandlers }),
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
   * value for the input.
   * The configuration applied to the HTML element.
   *
   */
  selectGrid<TPath extends readonly string[]>(
    path: [...TPath],
    {
      options,
      modifyHTML = () => {},
      eventHandlers = {},
    }: PartialPaneElementConfig<
      SelectGridInputParamsForPaneElement<P, TPath>,
      BindingApiEvents<InnerObject<P, TPath>>,
      P,
      E
    >,
  ): PaneElementFactory<P, E> {
    return createPaneFactory<P, E>(
      this.#eventTypes,
      (pane, params) =>
        createSelectGridPaneElement(path, pane, params, {
          getOptions: FuncUtils.makeGetFunc(options),
          modifyHTML: modifyHTML,
          eventHandlers: eventHandlers,
        }),
      this.#makeCtx("selectGrid", { options, modifyHTML, eventHandlers }),
    );
  }

  /**
   * Creates a pane element factory that constructs a pane element which
   * represents a `tweakpane` separator.
   *
   * The configuration applied to the separator.
   *
   */
  separator({
    options,
    modifyHTML = () => {},
    eventHandlers = {},
  }: PartialPaneElementConfig<BaseBladeParams, {}, P, E>): PaneElementFactory<
    P,
    E
  > {
    return createPaneFactory<P, E>(
      this.#eventTypes,
      (pane, params) =>
        new SeparatorPaneElement(pane, params, {
          getOptions: FuncUtils.makeGetFunc(options),
          modifyHTML: modifyHTML,
          eventHandlers: eventHandlers,
        }),
      this.#makeCtx("separator", { options, modifyHTML, eventHandlers }),
    );
  }

  /**
   * Creates a pane element factory that constructs a pane element which
   * contains text.
   *
   * The configuration applied to the text.
   *
   */
  text<T>({
    options,
    modifyHTML = () => {},
    eventHandlers = {},
  }: PartialPaneElementConfig<
    TextParamsForPaneElement<T>,
    {},
    P,
    E
  >): PaneElementFactory<P, E> {
    return createPaneFactory<P, E>(
      this.#eventTypes,
      (pane, params) =>
        createSimpleBladePaneElement("text", TextBladeApi, pane, params, {
          getOptions: FuncUtils.makeGetFunc(options),
          modifyHTML: modifyHTML,
          eventHandlers: eventHandlers,
        }),
      this.#makeCtx("text", { options, modifyHTML, eventHandlers }),
    );
  }

  /**
   * Creates a pane element factory that constructs a pane element which
   * contains a HTML element.
   *
   * The configuration applied to the HTML element.
   *
   */
  htmlContainer({
    options,
    modifyHTML = () => {},
    eventHandlers = {},
  }: PartialPaneElementConfig<
    HTMLContainerParamsForPaneElement,
    {},
    P,
    E
  >): PaneElementFactory<P, E> {
    return createPaneFactory<P, E>(
      this.#eventTypes,
      (pane, params) =>
        createSimpleBladePaneElement(
          "htmlcontainer",
          HTMLContainerApi,
          pane,
          params,
          {
            getOptions: FuncUtils.makeGetFunc(options),
            modifyHTML: modifyHTML,
            eventHandlers: eventHandlers,
          },
        ),
      this.#makeCtx("htmlContainer", {
        options,
        modifyHTML,
        eventHandlers,
      }),
    );
  }

  /**
   * Creates a pane element factory that constructs a pane element which
   * contains a header row for a table.
   *
   * The configuration applied to the header row for a table.
   *
   */
  tableHead({
    options,
    modifyHTML = () => {},
    eventHandlers = {},
  }: PartialPaneElementConfig<
    TableHeadParamsForPaneElement,
    {},
    P,
    E
  >): PaneElementFactory<P, E> {
    return createPaneFactory<P, E>(
      this.#eventTypes,
      (pane, params) =>
        createSimpleBladePaneElement("tableHead", HeadApi, pane, params, {
          getOptions: FuncUtils.makeGetFunc(options),
          modifyHTML: modifyHTML,
          eventHandlers: eventHandlers,
        }),
      this.#makeCtx("tableHead", { options, modifyHTML, eventHandlers }),
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
   * each cell contains the element created by a factory.
   * The configuration applied to the tab.
   *
   */
  tableRow(
    cells: readonly TableCellSpec<P, E>[],
    {
      options,
      modifyHTML = () => {},
      eventHandlers = {},
    }: Expand<
      PartialPaneElementConfig<
        BaseBladeParams & Pick<TableRowParams, "label">,
        {},
        P,
        E
      >
    >,
  ): PaneElementFactory<P, E> {
    return createPaneFactory<P, E>(
      this.#eventTypes,
      (pane, params) =>
        new TableRowPaneElement(
          pane,
          params,
          {
            getOptions: (params_: Readonly<P>) => ({
              ...FuncUtils.makeGetFunc(options)(params_),
              cells: cells.map((cell) =>
                FuncUtils.makeGetFunc(cell.options)(params_),
              ),
            }),
            modifyHTML: modifyHTML,
            eventHandlers: eventHandlers,
          },
          (tab: RowApi, params_: Readonly<P>) =>
            getTableRowCellPanes(tab).map((cellPane, i) =>
              cells[i].factory.attach(cellPane, params_),
            ),
          this.#eventTypes,
        ),
      this.#makeCtx("tableRow", {
        cells,
        options,
        modifyHTML,
        eventHandlers,
      }),
    );
  }

  /**
   * Wraps a pane element factory so that the wrapper factory constructs a pane element
   * that represents a `tweakpane` folder containing the wrapped element.
   *
   * The wrapper pane element operates on the `params` and events of this builder,
   * forwarding `params` to the wrapped pane element, and events from it.
   *
   * This is usually a factory created by {@link PaneElementFactoryBuilder#sequential}
   * or {@link PaneElementFactoryBuilder#mapped}.
   * The configuration applied to the folder.
   *
   */
  folder(
    factory: PaneElementFactory<P, E>,
    {
      options,
      modifyHTML = () => {},
      eventHandlers = {},
    }: PartialPaneElementConfig<FolderParams, FolderApiEvents, P, E>,
  ): PaneElementFactory<P, E> {
    return createPaneFactory<P, E>(
      this.#eventTypes,
      (pane, params) =>
        new FolderPaneElement(
          pane,
          params,
          {
            getOptions: FuncUtils.makeGetFunc(options),
            modifyHTML: modifyHTML,
            eventHandlers: eventHandlers,
          },
          (folder, params_) => [factory.attach(folder, params_)],
          this.#eventTypes,
        ),
      this.#makeCtx("folder", {
        factory,
        options,
        modifyHTML,
        eventHandlers,
      }),
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
   * each page contains the element created by a factory.
   * The configuration applied to the tab.
   *
   */
  tab(
    pages: readonly TabPageSpec<P, E>[],
    {
      options,
      modifyHTML = () => {},
      eventHandlers = {},
    }: PartialPaneElementConfig<BaseParams, TabApiEvents, P, E>,
  ): PaneElementFactory<P, E> {
    return createPaneFactory<P, E>(
      this.#eventTypes,
      (pane, params) =>
        new TabPaneElement(
          pane,
          params,
          {
            getOptions: (params_: Readonly<P>) => ({
              ...FuncUtils.makeGetFunc(options)(params_),
              pages: pages.map((page) =>
                FuncUtils.makeGetFunc(page.options)(params_),
              ),
            }),
            modifyHTML: modifyHTML,
            eventHandlers: eventHandlers,
          },
          (tab: TabApi, params_: Readonly<P>) =>
            pages.map((page, i) => page.factory.attach(tab.pages[i], params_)),
          this.#eventTypes,
        ),
      this.#makeCtx("tab", { pages, options, modifyHTML, eventHandlers }),
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
   * A factory for each sub-element.
   *
   */
  sequential(
    factories: readonly PaneElementFactory<P, E>[],
  ): PaneElementFactory<P, E> {
    return createPaneFactory<P, E>(
      this.#eventTypes,
      (pane, params) =>
        new MultiWrapperPaneElement(
          pane,
          params,
          (pane_, params_) =>
            factories.map((factory) => factory.attach(pane_, params_)),
          this.#eventTypes,
        ),
      this.#makeCtx("compose", { factories }),
    );
  }

  /**
   * Convenience method which creates the `eventsMapper` argument to
   * {@link PaneElementFactoryBuilder#mapped} for the common case where
   * the events emitted by the wrapped element is a subset of those
   * emitted by the wrapper element.
   *
   * A newly created `eventsMapper`.
   */
  identityEventMapper(): Pick<EventsMapper<E, E>, "innerToOuter"> {
    return {
      innerToOuter: <
        TInner extends Extract<keyof E, string>,
        TOuter extends Extract<keyof E, string>,
      >(
        inner: Readonly<BaseEvent<TInner> & E[TInner]>,
      ) => inner as unknown as BaseEvent<TOuter> & E[TOuter],
    };
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
   * between the wrapper and wrapped element.
   * Specifies how the events are mapped between the wrapper and wrapped element.
   *
   */
  mapped<PInner, EInner extends {}>(
    factory: PaneElementFactory<PInner, EInner>,
    paramsMapper: ParamsMapper<P, PInner>,
    eventsMapper: Pick<EventsMapper<E, EInner>, "innerToOuter">,
  ): PaneElementFactory<P, E> {
    return mapPane(factory, paramsMapper, {
      outerEventTypes: this.#eventTypes,
      innerToOuter: eventsMapper.innerToOuter,
    });
  }
}
