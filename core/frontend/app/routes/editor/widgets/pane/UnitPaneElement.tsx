import type {
  BaseInputParams,
  BindingApi,
  ButtonApi,
  ButtonApiEvents,
  BindingApiEvents,
  ApiChangeEvents,
} from "@tweakpane/core";
import _ from "lodash";
import type {
  BaseParams,
  BaseBladeParams,
  BindingParams,
  BladeApi,
  ButtonParams,
  ListBladeParams,
  ListBladeApi,
  SeparatorBladeApi,
  FolderApi,
  TabPageApi,
} from "tweakpane";

import type { Expand, InnerObject, ConstructorOf } from "sta/common";

import { VanillaEventDispatcher } from "../../utils";
import type { SelectGridInputParams } from "../tweakpane-custom-plugins";

import { bindHandlers, safeAssign, type PaneElement } from "./PaneElement";

export type PaneLike = FolderApi | TabPageApi;

/**
 * For each `tweakpane` event type, optionally provides the corresponding handler.
 */
export type TweakpaneEventHandlers<TEventMap extends {}, P, E extends {}> = {
  [K in Extract<keyof TEventMap, string>]?: (
    element: PaneElement<P, E>,
    ev: TEventMap[K],
  ) => void;
};

/**
 * Represents the configuration of a pane element.
 */
export interface PaneElementConfig<
  P,
  E extends {},
  TOptions extends BaseParams,
  TEventMap extends {},
> {
  /** Options to pass to the `tweakpane` element, which may be dynamically computed based on the given `params` each time it is rendered. */
  getOptions: (params: Readonly<P>) => TOptions;
  /**
   * Manipulates the HTML of the `tweakpane` element based on the given `params`.
   * This is done after applying `options`.
   */
  modifyHTML: (
    element: HTMLElement,
    params: Readonly<P>,
    paneElem: PaneElement<P, E>,
  ) => void;
  /**
   * Handles events emitted by the `tweakpane` element. Usually, the pane element
   * forwards such events so that its parents can listen to them.
   */
  eventHandlers: TweakpaneEventHandlers<TEventMap, P, E>;
}

/**
 * Base class for pane elements that do not contain other pane elements.
 */
export class UnitPaneElement<
  P,
  E extends {},
  TOptions extends BaseParams,
  TEventMap extends {},
  TBlade extends BladeApi<any>,
  TData,
>
  extends VanillaEventDispatcher<E>
  implements PaneElement<P, E>
{
  /** The `tweakpane` pane containing the wrapped `tweakpane` element. */
  readonly pane: PaneLike;

  /** The configuration of this pane element. */
  readonly config: PaneElementConfig<P, E, TOptions, TEventMap>;

  /** The wrapped `tweakpane` element. */
  protected blade: TBlade;

  /** The data associated with the `tweakpane` element. */
  protected data: TData;

  constructor(
    pane: PaneLike,
    params: Readonly<P>,
    config: PaneElementConfig<P, E, TOptions, TEventMap>,
  ) {
    super();

    this.pane = pane;
    this.config = config;

    const { blade, data } = this.attachBlade(
      this.pane,
      this.config.eventHandlers,
      params,
      this.config.getOptions(params),
    );
    this.blade = blade;
    this.data = data;

    this.config.modifyHTML(this.blade.element, params, this);
  }

  dispose(): void {
    this.detachBlade(this.blade, this.pane, this.config.eventHandlers);
  }

  render(params: Readonly<P>): void {
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

  updateParams(params: P): void {
    this.setParams(params, this.blade, this.data);
  }

  /**
   * Constructs the `tweakpane` element to wrap, attaching it to `pane`
   * and binding `handlers` to it.
   *
   * Note: This is called during object construction, so the function should not
   * depend on any state of the class instance.
   */
  protected attachBlade(
    pane: PaneLike,
    handlers: TweakpaneEventHandlers<TEventMap, P, E>,
    params: Readonly<P>,
    options: Readonly<TOptions>,
  ): { blade: TBlade; data: TData } {
    throw new Error("Not implemented");
  }

  /**
   * Disposes the wrapped `tweakpane` element, detaching it from `pane`
   * and unbinding `handlers` from it.
   */
  protected detachBlade(
    blade: TBlade,
    pane: PaneLike,
    handlers: TweakpaneEventHandlers<TEventMap, P, E>,
  ): void {
    blade.dispose();
  }

  /**
   * Updates the wrapped `tweakpane` element and its associated data with the options
   * stored in the given `params`.
   */
  protected setOptions(
    blade: TBlade,
    data: TData,
    params: Readonly<P>,
  ): { blade: TBlade; data: TData } {
    const nextOptions = this.config.getOptions(params);
    const unsafeNextOptions = safeAssign(blade, nextOptions);

    if (Object.entries(unsafeNextOptions).length > 0) {
      console.warn("Failed to assign some options:");
      console.warn(unsafeNextOptions);
    }

    return { blade, data };
  }

  /**
   * Updates the wrapped `tweakpane` element and its associated data with the data
   * stored in the given `params`.
   */
  protected setData(
    blade: TBlade,
    data: TData,
    params: Readonly<P>,
  ): { blade: TBlade; data: TData } {
    throw new Error("Not implemented");
  }

  /**
   * Updates the given `params` with the wrapped `tweakpane` element and its associated data.
   */
  protected setParams(params: Readonly<P>, blade: TBlade, data: TData): void {
    throw new Error("Not implemented");
  }
}

/**
 * A UnitPaneElement that recreates the wrapped `tweakpane` element when the options
 * cannot be directly updated via assignment to the `tweakpane` element.
 */
export class UnitPaneElementWithRecreate<
  P,
  E extends {},
  TOptions extends BaseParams,
  TEventMap extends {},
  TBlade extends BladeApi<any>,
  TData,
> extends UnitPaneElement<P, E, TOptions, TEventMap, TBlade, TData> {
  /** The options in the most recent `params` passed to this pane element. */
  protected prevOptions: TOptions;

  constructor(
    pane: PaneLike,
    params: Readonly<P>,
    config: PaneElementConfig<P, E, TOptions, TEventMap>,
  ) {
    super(pane, params, config);

    this.prevOptions = config.getOptions(params);
  }

  protected setOptions(
    blade: TBlade,
    data: TData,
    params: Readonly<P>,
  ): { blade: TBlade; data: TData } {
    const nextOptions = this.config.getOptions(params);
    const unsafeNextOptions = safeAssign(blade, nextOptions);

    // Avoid unnecessary recreation
    const prevOptions = this.prevOptions as Readonly<Record<string, unknown>>;
    const unsafeOptionsToUpdate = Object.entries(unsafeNextOptions).filter(
      ([k, v]) => v !== prevOptions[k],
    );

    if (unsafeOptionsToUpdate.length > 0) {
      // Need to recreate the tweakpane element
      // https://github.com/cocopon/tweakpane/issues/63

      // This should no longer be required in v4
      // https://github.com/cocopon/tweakpane/issues/455

      const idx = this.pane.children.indexOf(this.blade);
      if (idx === -1) {
        throw new Error("Missing parent");
      }

      this.detachBlade(this.blade, this.pane, this.config.eventHandlers);

      const { blade: nextBlade, data: nextData } = this.attachBlade(
        this.pane,
        this.config.eventHandlers,
        params,
        { index: idx, ...nextOptions },
      );

      blade = nextBlade;
      data = nextData;
    }

    this.prevOptions = nextOptions;

    return { blade, data };
  }
}

type InputBindingPaneElementData<P, TPath extends readonly string[]> = Record<
  string,
  InnerObject<P, TPath>
>;

/**
 * Creates a new pane element that wraps a `tweakpane` input binding.
 */
export function createInputBindingPaneElement<
  TPath extends readonly string[],
  P,
  E extends {},
>(
  path: [...TPath],
  pane_: PaneLike,
  params_: Readonly<P>,
  config_: PaneElementConfig<
    P,
    E,
    BindingParams,
    BindingApiEvents<InnerObject<P, TPath>>
  >,
): PaneElement<P, E> {
  const strPath = path.join(".");

  class InputBindingPaneElement extends UnitPaneElementWithRecreate<
    P,
    E,
    BindingParams,
    BindingApiEvents<InnerObject<P, TPath>>,
    BindingApi<unknown, InnerObject<P, TPath>>,
    InputBindingPaneElementData<P, TPath>
  > {
    protected attachBlade(
      pane: PaneLike,
      handlers: TweakpaneEventHandlers<
        BindingApiEvents<InnerObject<P, TPath>>,
        P,
        E
      >,
      params: Readonly<P>,
      options: Readonly<BindingParams>,
    ): {
      blade: BindingApi<unknown, InnerObject<P, TPath>>;
      data: InputBindingPaneElementData<P, TPath>;
    } {
      const boundParams: InputBindingPaneElementData<P, TPath> = {
        [strPath]: _.get(params, path),
      };
      const input = pane.addBinding(boundParams, strPath, options);

      bindHandlers(this, ["change"], handlers, input);

      return { blade: input, data: boundParams };
    }

    protected setData(
      blade: BindingApi<unknown, InnerObject<P, TPath>>,
      data: InputBindingPaneElementData<P, TPath>,
      params: Readonly<P>,
    ): {
      blade: BindingApi<unknown, InnerObject<P, TPath>>;
      data: InputBindingPaneElementData<P, TPath>;
    } {
      data[strPath] = _.get(params, path);

      blade.refresh();

      return { blade, data };
    }

    protected setParams(
      params: Readonly<P>,
      blade: BindingApi<unknown, InnerObject<P, TPath>>,
      data: InputBindingPaneElementData<P, TPath>,
    ): void {
      _.set(params, path, data[strPath]);
    }
  }

  return new InputBindingPaneElement(pane_, params_, config_);
}

type ListBladeParamsForPaneElement<P, TPath extends readonly string[]> = Expand<
  BaseBladeParams &
    Pick<ListBladeParams<InnerObject<P, TPath>>, "options" | "label">
>;

/**
 * Creates a new pane element that wraps a `tweakpane` list blade.
 */
export function createListBladePaneElement<
  TPath extends readonly string[],
  P,
  E extends {},
>(
  path: [...TPath],
  pane_: PaneLike,
  params_: Readonly<P>,
  config_: PaneElementConfig<
    P,
    E,
    ListBladeParamsForPaneElement<P, TPath>,
    ApiChangeEvents<InnerObject<P, TPath>>
  >,
): PaneElement<P, E> {
  class ListBladePaneElement extends UnitPaneElementWithRecreate<
    P,
    E,
    ListBladeParamsForPaneElement<P, TPath>,
    ApiChangeEvents<InnerObject<P, TPath>>,
    ListBladeApi<InnerObject<P, TPath>>,
    InnerObject<P, TPath>
  > {
    protected attachBlade(
      pane: PaneLike,
      handlers: TweakpaneEventHandlers<
        ApiChangeEvents<InnerObject<P, TPath>>,
        P,
        E
      >,
      params: Readonly<P>,
      options: Readonly<ListBladeParamsForPaneElement<P, TPath>>,
    ): {
      blade: ListBladeApi<InnerObject<P, TPath>>;
      data: InnerObject<P, TPath>;
    } {
      const value: InnerObject<P, TPath> = _.get(params, path);

      const listParams: ListBladeParams<InnerObject<P, TPath>> = {
        ...options,
        view: "list",
        value: value,
      };

      const listBlade = pane.addBlade(listParams) as ListBladeApi<
        InnerObject<P, TPath>
      >;

      listBlade.on("change", (ev) => {
        this.data = ev.value;

        handlers.change?.(this, ev);
      });

      return { blade: listBlade, data: value };
    }

    protected setData(
      blade: ListBladeApi<InnerObject<P, TPath>>,
      data: InnerObject<P, TPath>,
      params: Readonly<P>,
    ): {
      blade: ListBladeApi<InnerObject<P, TPath>>;
      data: InnerObject<P, TPath>;
    } {
      const value = _.get(params, path);

      blade.value = value;

      return { blade: blade, data: value };
    }

    protected setParams(
      params: Readonly<P>,
      blade: ListBladeApi<InnerObject<P, TPath>>,
      data: InnerObject<P, TPath>,
    ): void {
      _.set(params, path, data);
    }
  }

  return new ListBladePaneElement(pane_, params_, config_);
}

/**
 * A pane element that wraps a `tweakpane` button.
 */
export class ButtonPaneElement<
  P,
  E extends {},
> extends UnitPaneElementWithRecreate<
  P,
  E,
  ButtonParams,
  ButtonApiEvents,
  ButtonApi,
  {}
> {
  protected attachBlade(
    pane: PaneLike,
    handlers: TweakpaneEventHandlers<ButtonApiEvents, P, E>,
    params: Readonly<P>,
    options: Readonly<ButtonParams>,
  ): { blade: ButtonApi; data: {} } {
    const button = pane.addButton(options);

    bindHandlers(this, ["click"], handlers, button);

    return { blade: button, data: {} };
  }

  protected setData(
    blade: ButtonApi,
    data: {},
    params: Readonly<P>,
  ): { blade: ButtonApi; data: {} } {
    return { blade, data };
  }

  protected setParams(params: Readonly<P>, blade: ButtonApi, data: {}): void {
    // No-op
  }
}

/**
 * A pane element that wraps a `tweakpane` separator.
 */
export class SeparatorPaneElement<
  P,
  E extends {},
> extends UnitPaneElementWithRecreate<
  P,
  E,
  BaseBladeParams,
  {},
  SeparatorBladeApi,
  {}
> {
  protected attachBlade(
    pane: PaneLike,
    handlers: TweakpaneEventHandlers<{}, P, E>,
    params: Readonly<P>,
    options: Readonly<BaseBladeParams>,
  ): { blade: SeparatorBladeApi; data: {} } {
    const separator = pane.addBlade({
      ...options,
      view: "separator",
    }) as SeparatorBladeApi;

    return { blade: separator, data: {} };
  }

  protected setData(
    blade: SeparatorBladeApi,
    data: {},
    params: Readonly<P>,
  ): { blade: SeparatorBladeApi; data: {} } {
    return { blade, data };
  }

  protected setParams(
    params: Readonly<P>,
    blade: SeparatorBladeApi,
    data: {},
  ): void {
    // No-op
  }
}

/**
 * Creates a new pane element that wraps a `tweakpane` blade that does not involve any
 * data processing.
 *
 * The `view` parameter for the blade is automatically provided as `viewType`.
 */
export function createSimpleBladePaneElement<
  V extends string,
  A extends BladeApi<any>,
  P,
  E extends {},
  TOptions extends BaseBladeParams & { view?: V },
  TEventMap extends {},
>(
  viewType: V,
  apiType: ConstructorOf<A>,
  pane_: PaneLike,
  params_: Readonly<P>,
  config_: PaneElementConfig<P, E, TOptions, TEventMap>,
): PaneElement<P, E> {
  class SimpleBladePaneElement extends UnitPaneElementWithRecreate<
    P,
    E,
    TOptions,
    TEventMap,
    A,
    {}
  > {
    protected attachBlade(
      pane: PaneLike,
      handlers: TweakpaneEventHandlers<TEventMap, P, E>,
      params: Readonly<P>,
      options: Readonly<TOptions>,
    ): { blade: A; data: {} } {
      const bladeParams: BaseBladeParams & { view: V } = {
        ...options,
        view: viewType,
      };

      const blade = pane.addBlade(bladeParams) as A;
      if (!(blade instanceof apiType)) {
        console.error(blade);
        throw new Error(
          `Incorrect type of blade! Expected type: ${apiType.constructor.name}`,
        );
      }

      return { blade: blade, data: {} };
    }

    protected setData(
      blade: A,
      data: {},
      params: Readonly<P>,
    ): { blade: A; data: {} } {
      return { blade, data };
    }

    protected setParams(params: Readonly<P>, blade: A, data: {}): void {
      // No-op
    }
  }

  return new SimpleBladePaneElement(pane_, params_, config_);
}

type KeysOfBooleanProperties<T> = Extract<
  keyof { [K in keyof T as T[K] extends boolean ? K : never]: true },
  string
>;

export type SelectGridInputParamsForPaneElement<
  P,
  TPath extends readonly string[],
> = Expand<
  BaseInputParams &
    Pick<
      SelectGridInputParams<KeysOfBooleanProperties<InnerObject<P, TPath>>>,
      "size" | "cells"
    >
>;

/**
 * Creates a new pane element that wraps a grid of buttons that can be selected independent
 * of each other.
 */
export function createSelectGridPaneElement<
  TPath extends readonly string[],
  P,
  E extends {},
>(
  path: [...TPath],
  pane_: PaneLike,
  params_: Readonly<P>,
  config_: PaneElementConfig<
    P,
    E,
    SelectGridInputParamsForPaneElement<P, TPath>,
    BindingApiEvents<InnerObject<P, TPath>>
  >,
): PaneElement<P, E> {
  const strPath = path.join(".");

  class SelectGridPaneElement extends UnitPaneElementWithRecreate<
    P,
    E,
    SelectGridInputParamsForPaneElement<P, TPath>,
    BindingApiEvents<InnerObject<P, TPath>>,
    BindingApi<unknown, InnerObject<P, TPath>>,
    InputBindingPaneElementData<P, TPath>
  > {
    protected attachBlade(
      pane: PaneLike,
      handlers: TweakpaneEventHandlers<
        BindingApiEvents<InnerObject<P, TPath>>,
        P,
        E
      >,
      params: Readonly<P>,
      options: Readonly<SelectGridInputParamsForPaneElement<P, TPath>>,
    ): {
      blade: BindingApi<unknown, InnerObject<P, TPath>>;
      data: InputBindingPaneElementData<P, TPath>;
    } {
      const boundParams: InputBindingPaneElementData<P, TPath> = {
        [strPath]: _.get(params, path),
      };

      const selectGridOptions: SelectGridInputParams<
        Extract<keyof InnerObject<P, TPath>, string>
      > = {
        ...options,
        view: "selectgrid",
      };

      const input = pane.addBinding(boundParams, strPath, selectGridOptions);

      bindHandlers(this, ["change"], handlers, input);

      return { blade: input, data: boundParams };
    }

    protected setData(
      blade: BindingApi<unknown, InnerObject<P, TPath>>,
      data: InputBindingPaneElementData<P, TPath>,
      params: Readonly<P>,
    ): {
      blade: BindingApi<unknown, InnerObject<P, TPath>>;
      data: InputBindingPaneElementData<P, TPath>;
    } {
      data[strPath] = _.get(params, path);

      blade.refresh();

      return { blade, data };
    }

    protected setParams(
      params: Readonly<P>,
      blade: BindingApi<unknown, InnerObject<P, TPath>>,
      data: InputBindingPaneElementData<P, TPath>,
    ): void {
      _.set(params, path, data[strPath]);
    }
  }

  return new SelectGridPaneElement(pane_, params_, config_);
}
