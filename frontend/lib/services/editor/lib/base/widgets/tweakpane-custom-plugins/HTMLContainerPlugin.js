import {
    ClassName,
    BladeController,
    BladeApi,
    ParamsParsers,
    parseParams,
} from '@tweakpane/core';

/**
 * @typedef {import('@tweakpane/core').BaseBladeParams} BaseBladeParams
 */

/**
 * @typedef {import('@tweakpane/core').Blade} Blade
 */

/**
 * @typedef {import('@tweakpane/core').View} View
 */

/**
 * @typedef {import('@tweakpane/core').ViewProps} ViewProps
 */

/**
 * @template {BaseBladeParams} P
 * @typedef {import('@tweakpane/core').BladePlugin<P>} BladePlugin
 */

/**
 * @template T
 * @typedef {import('../../../../../../common/lib/utils').TypeUtils.Expand<T>} Expand
 */

const className = ClassName('htmlcontainer');

/**
 * @typedef {{
 *     innerElem: HTMLElement;
 *     viewProps: ViewProps;
 * }} HTMLContainerViewConfig
 */

/**
 * @implements {View}
 */
class HTMLContainerView {

    /**
     * @type {HTMLDivElement}
     */
    #titleElem;

    /**
     * @type {HTMLElement}
     */
    #innerElem;

    /**
     * @type {HTMLElement}
     */
    get innerElem() { return this.#innerElem; }

    set innerElem(value) {
        if (this.#innerElem !== value) {
            this.#titleElem.replaceChild(value, this.#innerElem);
            this.#innerElem = value;
        }
    }

    /**
     * Creates a new view object.
     * 
     * @param {Document} doc The document to attach the blade to.
     * @param {HTMLContainerViewConfig} config The configuration of the view.
     */
    constructor(doc, config) {
        this.element = doc.createElement('div');
        this.element.classList.add(className());
        config.viewProps.bindClassModifiers(this.element);

        const titleElem = doc.createElement('div');
        titleElem.classList.add(className('t'));
        {
            this.#innerElem = config.innerElem;
            titleElem.appendChild(this.#innerElem);
        }
        this.#titleElem = titleElem;
        this.element.appendChild(titleElem);
    }
}

/**
 * @typedef {Expand<HTMLContainerViewConfig & {
 *     blade: Blade;
 * }>} HTMLContainerControllerConfig
 */

/**
 * @augments BladeController<HTMLContainerView>
 */
class HTMLContainerController extends BladeController {

    /**
     * Creates a new controller object.
     * 
     * @param {Document} doc The document to attach the blade to.
     * @param {HTMLContainerControllerConfig} config The configuration of the controller.
     */
    constructor(doc, config) {
        super({
            blade: config.blade,
            view: new HTMLContainerView(doc, config),
            viewProps: config.viewProps,
        });
    }
}

/**
 * @typedef {Expand<BaseBladeParams & {
 *     view: 'htmlcontainer';
 *     innerElem: HTMLElement;
 * }>} HTMLContainerParams
 */

/**
 * @augments BladeApi<HTMLContainerController>
 */
export class HTMLContainerApi extends BladeApi {

    /**
     * @type {HTMLElement}
     */
    get innerElem() { return this.controller_.view.innerElem; }

    set innerElem(value) { this.controller_.view.innerElem = value; }
}

/**
 * Helper blade that contains a HTML element that can be edited independently
 * of the `tweakpane` pane.
 * 
 * @type {BladePlugin<HTMLContainerParams>}
 */
// eslint-disable-next-line object-shorthand
export const HTMLContainerPlugin = {
    id: 'htmlcontainer',
    type: 'blade',
    css: `.tp-htmlcontainerv {
        display: grid;
    }
    `,
    accept(params) {
        const p = ParamsParsers;
        const r = parseParams(params, {
            view: p.required.constant('htmlcontainer'),
            innerElem: p.required.custom((v) => {
                if (v instanceof HTMLElement) return v;

                return undefined;
            }),
        });
        return r ? { params: r } : null;
    },
    controller(args) {
        return new HTMLContainerController(args.document, {
            blade: args.blade,
            innerElem: args.params.innerElem,
            viewProps: args.viewProps,
        });
    },
    api(args) {
        if (!(args.controller instanceof HTMLContainerController)) {
            return null;
        }
        return new HTMLContainerApi(args.controller);
    },
};
