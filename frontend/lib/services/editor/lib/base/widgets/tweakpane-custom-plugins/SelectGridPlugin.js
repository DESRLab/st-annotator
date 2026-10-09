import {
    ValueMap,
    PlainView,
    ViewProps,
    bindValue,
    TpChangeEvent,
    ParamsParsers,
    parseParams,
} from '@tweakpane/core';
import _ from 'lodash';

import { SelectButtonController } from './SelectButtonPlugin';

/**
 * @typedef {import('@tweakpane/core').BaseInputParams} BaseInputParams
 */

/**
 * @typedef {import('@tweakpane/core').BindingTarget} BindingTarget
 */

/**
 * @template In
 * @template Ex
 * @template {BaseInputParams} P
 * @typedef {import('@tweakpane/core').InputBindingPlugin<In, Ex, P>} InputBindingPlugin
 */

/**
 * @template T
 * @typedef {import('@tweakpane/core').Value<T>} Value
 */

/**
 * @template T
 * @template {View} V
 * @typedef {import('@tweakpane/core').ValueController<T, V>} ValueController
 */

/**
 * @typedef {import('@tweakpane/core').View} View
 */

/**
 * @template T
 * @typedef {import('../../../../../../common/lib/utils').TypeUtils.Expand<T>} Expand
 */

/**
 * @typedef {import('./SelectButtonPlugin').SelectButtonPropsObject} SelectButtonPropsObject
 */

/**
 * @typedef {import('./SelectButtonPlugin').SelectButtonEvents} SelectButtonEvents
 */

/**
 * @template {string} K
 * @typedef {{
 *     title: string;
 *     value: K;
 * }} SelectCellConfig
 */

/**
 * @template {string} K
 * @typedef {Record<K, boolean>} SelectGridValue
 */

/**
 * @template {string} K
 * @typedef {{
 *     size: [number, number];
 *     cellConfig: (x: number, y: number) => SelectCellConfig<K>;
 *     isMultiSelect: boolean;
 *     value: Value<SelectGridValue<K>>;
 *     viewProps: ViewProps;
 * }} SelectGridConfig
 */

/**
 * @template {string} K
 * @implements {ValueController<SelectGridValue<K>, PlainView>}
 */
class SelectGridController {

    /**
     * @readonly
     * @type {[number, number]}
     */
    size;

    /**
     * @readonly
     * @type {boolean}
     */
    isMultiSelect;

    /**
     * @readonly
     * @type {Value<SelectGridValue<K>>}
     */
    value;

    /**
     * @readonly
     * @type {PlainView}
     */
    view;

    /**
     * @readonly
     * @type {ViewProps}
     */
    viewProps;

    /**
     * @private
     * @type {SelectButtonController[]}
     */
    cellCs_ = [];

    /**
     * @private
     * @type {K[]}
     */
    cellValues_ = [];

    /**
     * Creates a new view object.
     * 
     * @param {Document} doc The document to attach the blade to.
     * @param {SelectGridConfig<K>} config The configuration of the view.
     */
    constructor(doc, config) {
        this.onCellSelect_ = this.onCellSelect_.bind(this);

        this.size = config.size;
        this.isMultiSelect = config.isMultiSelect;

        const [w, h] = this.size;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const cellConfig = config.cellConfig(x, y);
                const { value } = cellConfig;

                const gridValueKey = value;
                const isSelected = config.value.rawValue[gridValueKey];
                if (typeof isSelected !== 'boolean') {
                    console.error('Bound value:', config.value.rawValue);
                    throw new Error(`Expected boolean value for entry with key: ${gridValueKey}`);
                }

                const bc = new SelectButtonController(doc, {
                    props: ValueMap.fromObject(/** @type {SelectButtonPropsObject} */ ({
                        ...cellConfig,
                        selected: isSelected,
                    })),
                    viewProps: ViewProps.create(),
                });
                this.cellCs_.push(bc);
                this.cellValues_.push(value);
            }
        }

        this.value = config.value;
        bindValue(this.value, (value) => {
            this.cellCs_.forEach((cc, i) => {
                const gridValueKey = this.cellValues_[i];

                cc.selected = value[gridValueKey];
            });
        });

        this.viewProps = config.viewProps;
        this.view = new PlainView(doc, {
            viewProps: this.viewProps,
            viewName: 'selectgrid',
        });
        this.view.element.style.gridTemplateColumns = `repeat(${w}, 1fr)`;

        this.cellCs_.forEach((bc) => {
            bc.emitter.on('select', this.onCellSelect_);
            this.view.element.appendChild(bc.view.element);
        });
    }

    /**
     * @type {SelectButtonController[]}
     */
    get cellControllers() {
        return this.cellCs_;
    }

    /**
     * @type {boolean}
     */
    #isUpdating = false;

    /**
     * @private
     * @param {SelectButtonEvents['select']} ev The event to handle.
     */
    onCellSelect_(ev) {
        if (this.#isUpdating) return;

        const buttonView = ev.sender.view;
        const index = this.cellCs_.findIndex((c) => c.view === buttonView);
        if (index === -1) return;

        const gridValueKey = this.cellValues_[index];

        let newValue;
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
    }
}

/**
 * @template {string} K
 * @augments TpChangeEvent<SelectGridValue<K>>
 */
export class TpSelectGridChangeEvent extends TpChangeEvent {

    /**
     * @readonly
     * @type {SelectCellApi}
     */
    cell;

    /**
     * @readonly
     * @type {[number, number]}
     */
    index;

    /**
     * Creates a new event object.
     * 
     * @param {unknown} target The event dispatcher.
     * @param {SelectCellApi} cell The cell that emitted the event.
     * @param {[number, number]} index The index of the cell in the grid.
     * @param {SelectGridValue<K>} value The new value in the controller.
     * @param {string} [presetKey] The preset key of the event target.
     */
    constructor(target, cell, index, value, presetKey = undefined) {
        super(target, value, presetKey);

        this.cell = cell;
        this.index = index;
    }
}

export class SelectCellApi {

    /**
     * @private
     * @type {SelectButtonController}
     */
    controller_;

    /**
     * Creates a new API object.
     * 
     * @param {SelectButtonController} controller_ The wrapped controller.
     */
    constructor(controller_) {
        this.controller_ = controller_;
    }

    /**
     * @type {boolean}
     */
    get disabled() {
        return this.controller_.viewProps.get('disabled');
    }

    set disabled(value) {
        this.controller_.viewProps.set('disabled', value);
    }

    /**
     * @type {string}
     */
    get title() {
        return this.controller_.props.get('title') ?? '';
    }

    set title(value) {
        this.controller_.props.set('title', value);
    }
}

/**
 * @template {string} K
 * @typedef {Expand<BaseInputParams & {
 *     view: 'selectgrid';
 *     size: [number, number];
 *     cells: (x: number, y: number) => SelectCellConfig<K>;
 *     isMultiSelect?: boolean;
 * }>} SelectGridInputParams
 */

/**
 * @param {unknown} exValue The bound value.
 * @returns {SelectGridValue<string>} A converted value.
 */
export function gridValueFromUnknown(exValue) {
    if (!_.isPlainObject(exValue)) return {};

    return Object.fromEntries(
        // @ts-expect-error
        Object.entries(exValue).filter(([, v]) => (typeof v === 'boolean')),
    );
}

/**
 * @param {BindingTarget} target The target to be written.
 * @param {SelectGridValue<string>} inValue The value to write.
 */
function writeGridValue(target, inValue) {
    for (const [k, v] of Object.entries(inValue)) {
        if (typeof v === 'boolean') {
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
 * 
 * @template {string} K
 * @type {InputBindingPlugin<SelectGridValue<K>, SelectGridValue<K>, SelectGridInputParams<K>>}
 */
// eslint-disable-next-line object-shorthand
export const SelectGridPlugin = {
    id: 'selectgrid',
    type: 'input',
    css: `.tp-selectgridv {
        border-radius: var(--elm-br);
        display: grid;
        overflow: hidden;
        gap: 2px;
    }

    .tp-selectgridv.tp-v-disabled {
        opacity: 0.5;
    }

    .tp-selectgridv .tp-selectbtnv_b-selected {
        background-color: var(--btn-bg-a);
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
        border-radius: var(--elm-br);
        color: var(--btn-fg);
        cursor: pointer;
        display: block;
        font-weight: bold;
        height: var(--bld-us);
        line-height: var(--bld-us);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;

        min-width: 20px;
        width: 100%;
    }

    .tp-selectbtnv_b:hover {
        background-color: var(--btn-bg-h);
    }

    .tp-selectbtnv_b:focus {
        background-color: var(--btn-bg-f);
    }

    .tp-selectbtnv_b:active {
        background-color: var(--btn-bg-a);
    }

    .tp-selectbtnv_b:disabled {
        opacity: 0.5;
    }

    .tp-selectbtnv_t {
        text-align: center;
    }
    `,
    // @ts-expect-error
    accept(exValue, params) {
        if (!_.isPlainObject(exValue)) return null;

        const p = ParamsParsers;
        const result = parseParams(params, {
            view: p.required.constant('selectgrid'),
            size: p.required.array(p.required.number),
            cells: p.required.function,
            isMultiSelect: p.optional.boolean,
        });
        if (!result) return null;

        return {
            initialValue: exValue,
            params: result,
        };
    },
    binding: {
        reader: (_args) => gridValueFromUnknown,
        writer: (_args) => writeGridValue,
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
};
