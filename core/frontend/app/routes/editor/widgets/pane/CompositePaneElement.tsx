import type {
  BindingApi,
  FolderApiEvents,
  TpChangeEvent,
  TpTabSelectEvent,
} from "@tweakpane/core";
import {
  Pane,
  type BaseBladeParams,
  type BaseParams,
  type BladeApi,
  type FolderApi,
  type FolderParams,
  type TabApi,
  type TabPageParams,
} from "tweakpane";
import type { CellBladeParams, RowApi, TableRowParams } from "tweakpane-table";

import type { Expand } from "sta/common";

import type { BaseEvent } from "../../utils";

import { bindHandlers, safeAssign } from "./PaneElement";
import { registerPlugins } from "./PanePlugins";
import { UnitPaneElement } from "./UnitPaneElement";
import type {
  PaneElementConfig,
  PaneLike,
  TweakpaneEventHandlers,
} from "./UnitPaneElement";
import {
  MultiWrapperPaneElement,
  type AddWrappedElemsFunc,
} from "./WrapperPaneElement.tsx";

export interface TabApiEvents {
  change: TpChangeEvent<unknown>;
  select: TpTabSelectEvent<TabApi>;
}

export type TabPageParamsForPaneElement = Expand<
  TabPageParams & { selected?: boolean }
>;

type TabParamsForPaneElement = Expand<
  BaseBladeParams & { pages: TabPageParamsForPaneElement[] }
>;

export type CellBladeParamsForPaneElement = Expand<
  CellBladeParams & { minWidth?: string; maxWidth?: string }
>;

type TableRowParamsForPaneElement = Expand<
  BaseBladeParams &
    Pick<TableRowParams, "label"> & {
      cells: CellBladeParamsForPaneElement[];
    }
>;

type AddSubElemsFunc<P, E extends {}, TBlade> = AddWrappedElemsFunc<
  P,
  E,
  TBlade
>;

/**
 * Base class for pane elements that contain other pane elements.
 *
 * This base class automatically forwards the calls defined by PaneElement to/from
 * the contained elements, such that the abstract methods in UnitPaneElement only
 * involve the container element.
 */
export class CompositePaneElement<
  P,
  E extends {},
  TOptions extends BaseParams,
  TEventMap extends {},
  TBlade extends BladeApi<any>,
  TData,
> extends UnitPaneElement<P, E, TOptions, TEventMap, TBlade, TData> {
  /** The sub-elements contained in this pane element. */
  protected subElems: MultiWrapperPaneElement<P, E, TBlade>;

  /** The name of each event emitted by this pane element. */
  get addSubElems(): AddSubElemsFunc<P, E, TBlade> {
    return this.subElems.addWrappedElems;
  }

  /** The name of each event emitted by this pane element. */
  get eventTypes(): readonly Extract<keyof E, string>[] {
    return this.subElems.eventTypes;
  }

  /**
   * Handles events dispatched by a sub-element.
   */
  #handleSubElemEvent = <T extends Extract<keyof E, string>>(
    innerEvent: BaseEvent<T> & E[T],
  ): void => {
    this.dispatchEvent(innerEvent);
  };

  constructor(
    pane: PaneLike,
    params: Readonly<P>,
    config: PaneElementConfig<P, E, TOptions, TEventMap>,
    addSubElems: AddSubElemsFunc<P, E, TBlade>,
    eventTypes: readonly Extract<keyof E, string>[],
  ) {
    // Avoid calling modifyHTML before the subelements have been attached
    const { modifyHTML, ...restConfig } = config;

    super(pane, params, { ...restConfig, modifyHTML: () => {} });

    this.subElems = new MultiWrapperPaneElement(
      this.blade,
      params,
      addSubElems,
      eventTypes,
    );
    for (const eventType of this.subElems.eventTypes) {
      this.subElems.addEventListener(eventType, this.#handleSubElemEvent);
    }

    // Restore the original config
    (
      this as unknown as {
        config: PaneElementConfig<P, E, TOptions, TEventMap>;
      }
    ).config = config;

    modifyHTML(this.blade.element, params, this);
  }

  dispose(): void {
    for (const eventType of this.subElems.eventTypes) {
      this.subElems.removeEventListener(eventType, this.#handleSubElemEvent);
    }
    this.subElems.dispose();

    super.dispose();
  }

  render(params: Readonly<P>): void {
    super.render(params);

    this.subElems.render(params);
  }

  updateParams(params: P): void {
    super.updateParams(params);

    this.subElems.updateParams(params);
  }
}

/**
 * A pane element that wraps a `tweakpane` folder, which in turn contains other
 * pane elements (all under the same folder).
 */
export class FolderPaneElement<P, E extends {}> extends CompositePaneElement<
  P,
  E,
  FolderParams,
  FolderApiEvents,
  FolderApi,
  {}
> {
  protected attachBlade(
    pane: PaneLike,
    handlers: TweakpaneEventHandlers<FolderApiEvents, P, E>,
    params: Readonly<P>,
    options: Readonly<FolderParams>,
  ): { blade: FolderApi; data: {} } {
    const folder = pane.addFolder(options);

    bindHandlers(this, ["change", "fold"], handlers, folder);

    return { blade: folder, data: {} };
  }

  protected setData(
    blade: FolderApi,
    data: {},
    params: Readonly<P>,
  ): { blade: FolderApi; data: {} } {
    return { blade, data };
  }

  protected setParams(params: Readonly<P>, blade: FolderApi, data: {}): void {
    // No-op
  }
}

/**
 * A pane element that wraps a `tweakpane` tab, which in turn contains other
 * pane elements (one per page).
 */
export class TabPaneElement<P, E extends {}> extends CompositePaneElement<
  P,
  E,
  TabParamsForPaneElement,
  TabApiEvents,
  TabApi,
  {}
> {
  constructor(
    pane: PaneLike,
    params: Readonly<P>,
    config: PaneElementConfig<P, E, TabParamsForPaneElement, TabApiEvents>,
    addSubElems: AddSubElemsFunc<P, E, TabApi>,
    eventTypes: readonly Extract<keyof E, string>[],
  ) {
    super(pane, params, config, addSubElems, eventTypes);

    // Apply the other options that cannot be provided in attachBlade
    const { pages: pagesOptions } = this.config.getOptions(params);
    pagesOptions.forEach(
      (pageOptions: TabPageParamsForPaneElement, i: number) => {
        safeAssign(this.blade.pages[i], pageOptions);
      },
    );
  }

  protected attachBlade(
    pane: PaneLike,
    handlers: TweakpaneEventHandlers<TabApiEvents, P, E>,
    params: Readonly<P>,
    options: Readonly<TabParamsForPaneElement>,
  ): { blade: TabApi; data: {} } {
    const { pages: pagesOptions, ...otherOptions } = options;

    const tabParams = {
      ...otherOptions,
      pages: pagesOptions.map(({ title }) => ({ title })),
    };

    const tab = pane.addTab(tabParams);

    bindHandlers(this, ["change", "select"], handlers, tab);

    return { blade: tab, data: {} };
  }

  protected setOptions(
    blade: TabApi,
    data: {},
    params: Readonly<P>,
  ): { blade: TabApi; data: {} } {
    const { pages: pagesOptions, ...otherOptions } =
      this.config.getOptions(params);

    safeAssign(blade, otherOptions);

    pagesOptions.forEach(
      (pageOptions: TabPageParamsForPaneElement, i: number) => {
        // `selected` is a one-shot initial-selection option applied on attach;
        // re-applying it here would fight manual tab switches.
        const { selected: _selected, ...pageRenderOptions } = pageOptions;
        safeAssign(blade.pages[i], pageRenderOptions);
      },
    );

    return { blade, data };
  }

  protected setData(
    blade: TabApi,
    data: {},
    params: Readonly<P>,
  ): { blade: TabApi; data: {} } {
    return { blade, data };
  }

  protected setParams(params: Readonly<P>, blade: TabApi, data: {}): void {
    // No-op
  }
}

/**
 * The panes hosted inside each cell of a table row, keyed by the row blade.
 *
 * `tweakpane-table` v0.4 cells are standalone blades rather than containers
 * with their own rack, so each cell hosts a nested `Pane` for the pane
 * elements attached by the engine.
 */
const tableRowCellPanes = new WeakMap<RowApi, readonly Pane[]>();

/** Obtains the per-cell panes created for the given table row, if any. */
export function getTableRowCellPanes(row: RowApi): readonly Pane[] {
  return tableRowCellPanes.get(row) ?? [];
}

/** Obtains the wrapper element of a table row cell, which carries its width. */
function getTableRowCellWrapper(
  row: RowApi,
  index: number,
): HTMLElement | undefined {
  return row.getCell(index)?.element.parentElement ?? undefined;
}

/**
 * A pane element that wraps a `tweakpane` table row, which in turn contains other
 * pane elements (one per cell).
 *
 * Note that this requires the use of the `tweakpane-table` plugin.
 */
export class TableRowPaneElement<P, E extends {}> extends CompositePaneElement<
  P,
  E,
  TableRowParamsForPaneElement,
  {},
  RowApi,
  {}
> {
  #dummyInput: BindingApi<unknown, boolean>;

  #dummyBoundParams: { value: boolean };

  constructor(
    pane: PaneLike,
    params: Readonly<P>,
    config: PaneElementConfig<P, E, TableRowParamsForPaneElement, {}>,
    addSubElems: AddSubElemsFunc<P, E, RowApi>,
    eventTypes: readonly Extract<keyof E, string>[],
  ) {
    super(pane, params, config, addSubElems, eventTypes);

    // Apply the other options that cannot be provided in attachBlade
    const { cells: cellsOptions } = this.config.getOptions(params);
    cellsOptions.forEach(
      (cellOptions: CellBladeParamsForPaneElement, i: number) => {
        const cellWrapper = getTableRowCellWrapper(this.blade, i);
        if (cellWrapper != null) {
          safeAssign(cellWrapper.style, cellOptions);
        }
      },
    );

    // This is used to trigger `'change'` events in the parent pane
    // when an input in a sub-element has changed
    this.#dummyBoundParams = { value: true };
    this.#dummyInput = this.pane.addBinding(this.#dummyBoundParams, "value", {
      hidden: true,
    });
  }

  protected attachBlade(
    pane: PaneLike,
    handlers: TweakpaneEventHandlers<{}, P, E>,
    params: Readonly<P>,
    options: Readonly<TableRowParamsForPaneElement>,
  ): { blade: RowApi; data: {} } {
    // The cells are created here (rather than in the sub-elements closure)
    // because each needs its own pane for the engine to attach blades to
    const { cells: cellsOptions, ...otherOptions } = options;

    const tableRowParams = {
      ...otherOptions,
      view: "tableRow",
    };

    const tableRow = pane.addBlade(tableRowParams) as RowApi;

    const cellPanes = cellsOptions.map(() => {
      const cellElem = document.createElement("div");
      // `addCell` creates any blade through the plugin pool, but its
      // parameter type only covers the row's own cell options
      tableRow.addCell({ view: "htmlcontainer", innerElem: cellElem });

      const cellPane = new Pane({ container: cellElem });
      registerPlugins(cellPane);
      cellPane.on("change", () => {
        // In case this object has not been fully initialized yet
        if (
          this.#dummyBoundParams === undefined ||
          this.#dummyInput === undefined
        )
          return;

        // Note that this means the controller should not assume anything about
        // the value of TpChangeEvent
        this.#dummyBoundParams.value = !this.#dummyBoundParams.value;
        this.#dummyInput.refresh();
      });

      return cellPane;
    });

    tableRowCellPanes.set(tableRow, cellPanes);

    return { blade: tableRow, data: {} };
  }

  protected detachBlade(
    blade: RowApi,
    pane: PaneLike,
    handlers: TweakpaneEventHandlers<{}, P, E>,
  ): void {
    for (const cellPane of getTableRowCellPanes(blade)) {
      cellPane.dispose();
    }
    tableRowCellPanes.delete(blade);

    super.detachBlade(blade, pane, handlers);
  }

  protected setOptions(
    blade: RowApi,
    data: {},
    params: Readonly<P>,
  ): { blade: RowApi; data: {} } {
    const { cells: cellsOptions, ...otherOptions } =
      this.config.getOptions(params);

    safeAssign(blade, otherOptions);

    cellsOptions.forEach(
      (cellOptions: CellBladeParamsForPaneElement, i: number) => {
        const cellWrapper = getTableRowCellWrapper(blade, i);
        if (cellWrapper != null) {
          safeAssign(cellWrapper.style, cellOptions);
        }
      },
    );

    return { blade, data };
  }

  protected setData(
    blade: RowApi,
    data: {},
    params: Readonly<P>,
  ): { blade: RowApi; data: {} } {
    return { blade, data };
  }

  protected setParams(params: Readonly<P>, blade: RowApi, data: {}): void {
    // No-op
  }
}
