import {
  ValueMap,
  PlainView,
  ViewProps,
  bindValue,
  TpChangeEvent,
  createPlugin,
  parseRecord,
  type BaseInputParams,
  type BindingTarget,
  type InputBindingPlugin,
  type Value,
  type ValueController,
} from "@tweakpane/core";
import _ from "lodash";

import type { Expand } from "sta/common";

import type {
  SelectButtonEvents,
  SelectButtonPropsObject,
} from "./SelectButtonPlugin";
import { SelectButtonController } from "./SelectButtonPlugin";

/** Styles for the selectgrid blade; registered via the plugin bundle. */
export const selectGridCss = `.tp-selectgridv {
    border-radius: var(--bld-br);
    display: grid;
    overflow: hidden;
    gap: 2px;
}

.tp-selectgridv.tp-v-disabled {
    opacity: 0.5;
}

.tp-selectgridv .tp-selectbtnv_b-selected,
.tp-selectgridv .tp-selectbtnv_b-selected:not(:disabled):hover,
.tp-selectgridv .tp-selectbtnv_b-selected:not(:disabled):focus,
.tp-selectgridv .tp-selectbtnv_b-selected:not(:disabled):active {
    background-color: var(--selectgrid-selected-bg, royalblue);
    color: var(--selectgrid-selected-fg, #fff);
}

.tp-selectgridv .tp-selectbtnv_b:disabled .tp-selectbtnv_t {
    opacity: 0.5;
}

.tp-selectgridv .tp-selectbtnv_b {
    border-radius: 0;
}

.tp-selectbtnv_b {
    appearance: none;
    background-color: rgba(0,0,0,0);
    border-width: 0;
    font-family: inherit;
    font-size: inherit;
    font-weight: inherit;
    margin: 0;
    outline: none;
    padding: 0;

    background-color: var(--btn-bg);
    border-radius: var(--bld-br);
    color: var(--btn-fg);
    cursor: pointer;
    display: block;
    font-weight: bold;
    height: var(--cnt-usz);
    line-height: var(--cnt-usz);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    min-width: 20px;
    width: 100%;
}

.tp-selectbtnv_b:not(:disabled):hover {
    background-color: var(--btn-bg-h);
}

.tp-selectbtnv_b:not(:disabled):focus {
    background-color: var(--btn-bg-f);
}

.tp-selectbtnv_b:not(:disabled):active {
    background-color: var(--btn-bg-a);
}

.tp-selectbtnv_b:disabled {
    opacity: 0.5;
}

.tp-selectbtnv_t {
    text-align: center;
}
`;

export interface SelectCellConfig<K extends string> {
  title: string;
  value: K;
}

export type SelectGridValue<K extends string> = Record<K, boolean>;

export interface SelectGridConfig<K extends string> {
  size: [number, number];
  cellConfig: (x: number, y: number) => SelectCellConfig<K>;
  isMultiSelect: boolean;
  value: Value<SelectGridValue<K>>;
  viewProps: ViewProps;
}

class SelectGridController<K extends string> implements ValueController<
  SelectGridValue<K>,
  PlainView
> {
  readonly size: [number, number];

  readonly isMultiSelect: boolean;

  readonly value: Value<SelectGridValue<K>>;

  readonly view: PlainView;

  readonly viewProps: ViewProps;

  private cellCs_: SelectButtonController[] = [];

  private cellValues_: K[] = [];

  #isUpdating = false;

  constructor(doc: Document, config: SelectGridConfig<K>) {
    this.size = config.size;
    this.isMultiSelect = config.isMultiSelect;

    const [w, h] = this.size;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const cellConfig = config.cellConfig(x, y);
        const { value } = cellConfig;

        const gridValueKey = value;
        const isSelected = config.value.rawValue[gridValueKey];
        if (typeof isSelected !== "boolean") {
          console.error("Bound value:", config.value.rawValue);
          throw new Error(
            `Expected boolean value for entry with key: ${gridValueKey}`,
          );
        }

        const buttonProps: SelectButtonPropsObject = {
          ...cellConfig,
          selected: isSelected,
        };

        const bc = new SelectButtonController(doc, {
          props: ValueMap.fromObject(buttonProps),
          viewProps: ViewProps.create(),
        });
        this.cellCs_.push(bc);
        this.cellValues_.push(value);
      }
    }

    this.value = config.value;
    bindValue(this.value, (value: SelectGridValue<K>) => {
      this.cellCs_.forEach((cc, i) => {
        const gridValueKey = this.cellValues_[i];

        cc.selected = value[gridValueKey];
      });
    });

    this.viewProps = config.viewProps;
    this.view = new PlainView(doc, {
      viewProps: this.viewProps,
      viewName: "selectgrid",
    });
    this.view.element.style.gridTemplateColumns = `repeat(${w}, 1fr)`;

    this.cellCs_.forEach((bc) => {
      bc.emitter.on("select", this.onCellSelect_);
      this.view.element.appendChild(bc.view.element);
    });
  }

  get cellControllers(): SelectButtonController[] {
    return this.cellCs_;
  }

  private onCellSelect_ = (ev: SelectButtonEvents["select"]): void => {
    if (this.#isUpdating) return;

    const buttonView = ev.sender.view;
    const index = this.cellCs_.findIndex((c) => c.view === buttonView);
    if (index === -1) return;

    const gridValueKey = this.cellValues_[index];

    let newValue: SelectGridValue<K>;
    if (this.isMultiSelect) {
      newValue = {
        ...this.value.rawValue,
        [gridValueKey]: !this.value.rawValue[gridValueKey],
      };
    } else {
      newValue = {
        ...this.value.rawValue,
        ...Object.fromEntries(this.cellValues_.map((v) => [v, false])),
        [gridValueKey]: !this.value.rawValue[gridValueKey],
      };
    }

    // Avoid unnecessary updates
    if (_.isEqual(this.value.rawValue, newValue)) return;

    this.#isUpdating = true;

    try {
      this.value.setRawValue(newValue);
    } finally {
      this.#isUpdating = false;
    }
  };
}

export class TpSelectGridChangeEvent<K extends string> extends TpChangeEvent<
  SelectGridValue<K>
> {
  readonly cell: SelectCellApi;

  readonly index: [number, number];

  constructor(
    target: unknown,
    cell: SelectCellApi,
    index: [number, number],
    value: SelectGridValue<K>,
    last?: boolean,
  ) {
    super(target, value, last);

    this.cell = cell;
    this.index = index;
  }
}

export class SelectCellApi {
  private controller_: SelectButtonController;

  constructor(controller_: SelectButtonController) {
    this.controller_ = controller_;
  }

  get disabled(): boolean {
    return this.controller_.viewProps.get("disabled");
  }

  set disabled(value: boolean) {
    this.controller_.viewProps.set("disabled", value);
  }

  get title(): string {
    return this.controller_.props.get("title") ?? "";
  }

  set title(value: string) {
    this.controller_.props.set("title", value);
  }
}

export type SelectGridInputParams<K extends string> = Expand<
  BaseInputParams & {
    view: "selectgrid";
    size: [number, number];
    cells: (x: number, y: number) => SelectCellConfig<K>;
    isMultiSelect?: boolean;
  }
>;

export function gridValueFromUnknown(
  exValue: unknown,
): SelectGridValue<string> {
  if (!_.isPlainObject(exValue)) return {};

  return Object.fromEntries(
    Object.entries(exValue as Record<string, unknown>).filter(
      ([, v]) => typeof v === "boolean",
    ),
  ) as SelectGridValue<string>;
}

function writeGridValue(
  target: BindingTarget,
  inValue: SelectGridValue<string>,
): void {
  for (const [k, v] of Object.entries(inValue)) {
    if (typeof v === "boolean") {
      target.writeProperty(k, v);
    }
  }
}

/**
 * A grid of buttons that can each be selected.
 *
 * The value bound to the input should be a plain object: for each cell,
 * there should be an entry with the value in the cell as the key, and
 * whether the cell is selected as the boolean value.
 *
 * The `isMultiSelect` option (default `false`) controls whether more than
 * one button can be selected at a time.
 */

export const SelectGridPlugin: InputBindingPlugin<
  SelectGridValue<string>,
  unknown,
  SelectGridInputParams<string>
> = createPlugin({
  id: "selectgrid",
  type: "input",
  accept(exValue: unknown, params: Record<string, unknown>) {
    if (!_.isPlainObject(exValue)) return null;

    const result = parseRecord(params, (p) => ({
      view: p.required.constant("selectgrid"),
      size: p.required.array(p.required.number),
      cells: p.required.function,
      isMultiSelect: p.optional.boolean,
    }));
    if (!result) return null;

    return {
      initialValue: exValue,
      params: result as unknown as SelectGridInputParams<string>,
    };
  },
  binding: {
    reader: () => gridValueFromUnknown,
    writer: () => writeGridValue,
  },
  controller(args) {
    return new SelectGridController(args.document, {
      size: args.params.size,
      cellConfig: args.params.cells,
      isMultiSelect: args.params.isMultiSelect ?? false,
      value: args.value,
      viewProps: args.viewProps,
    });
  },
});
