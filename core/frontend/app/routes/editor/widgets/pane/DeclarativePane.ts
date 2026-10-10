import type {
  ApiChangeEvents,
  BindingApiEvents,
  ButtonApiEvents,
} from "@tweakpane/core";
import type {
  BaseBladeParams,
  BindingParams,
  ButtonParams,
  ListBladeParams,
} from "tweakpane";

import type { Expand, InnerObject } from "sta/common";

import type {
  PaneElementEventTypes,
  PaneElementFactory,
  PartialPaneElementConfig,
} from "./PaneElementFactory.tsx";
import { PaneElementFactoryBuilder } from "./PaneElementFactory.tsx";
import type { SelectGridInputParamsForPaneElement } from "./UnitPaneElement";

/** A declarative control tree compiled by the existing imperative Tweakpane adapter. */
export interface PaneControl<P extends {}, E extends {} = {}> {
  build(builder: PaneElementFactoryBuilder<P, E>): PaneElementFactory<P, E>;
}

export interface PaneControls<P extends {}, E extends {} = {}> {
  input<TPath extends readonly string[]>(
    path: [...TPath],
    config: PartialPaneElementConfig<
      BindingParams,
      BindingApiEvents<InnerObject<P, TPath>>,
      P,
      E
    >,
  ): PaneControl<P, E>;
  list<TPath extends readonly string[]>(
    path: [...TPath],
    config: Expand<
      PartialPaneElementConfig<
        BaseBladeParams &
          Pick<ListBladeParams<InnerObject<P, TPath>>, "options" | "label">,
        ApiChangeEvents<InnerObject<P, TPath>>,
        P,
        E
      >
    >,
  ): PaneControl<P, E>;
  button(
    config: PartialPaneElementConfig<ButtonParams, ButtonApiEvents, P, E>,
  ): PaneControl<P, E>;
  selectGrid<TPath extends readonly string[]>(
    path: [...TPath],
    config: PartialPaneElementConfig<
      SelectGridInputParamsForPaneElement<P, TPath>,
      BindingApiEvents<InnerObject<P, TPath>>,
      P,
      E
    >,
  ): PaneControl<P, E>;
  separator(
    config: PartialPaneElementConfig<BaseBladeParams, {}, P, E>,
  ): PaneControl<P, E>;
  sequential(children: readonly PaneControl<P, E>[]): PaneControl<P, E>;
}

/** Creates typed declarative controls for one pane parameter/event model. */
export function paneControls<P extends {}, E extends {} = {}>(): PaneControls<
  P,
  E
> {
  return {
    input: (path, config) => ({
      build: (builder) => builder.input(path, config),
    }),
    list: (path, config) => ({
      build: (builder) => builder.list(path, config),
    }),
    button: (config) => ({ build: (builder) => builder.button(config) }),
    selectGrid: (path, config) => ({
      build: (builder) => builder.selectGrid(path, config),
    }),
    separator: (config) => ({
      build: (builder) => builder.separator(config),
    }),
    sequential: (children) => ({
      build: (builder) =>
        builder.sequential(children.map((child) => child.build(builder))),
    }),
  };
}

/** Compiles a declarative control tree to the native Tweakpane adapter. */
export function definePaneElements<P extends {}, E extends {} = {}>(
  params: Readonly<P>,
  eventTypes: PaneElementEventTypes<E>,
  root: PaneControl<P, E>,
): PaneElementFactory<P, E> {
  return root.build(new PaneElementFactoryBuilder(params, eventTypes));
}
