import {
  ClassName,
  BladeController,
  BladeApi,
  createPlugin,
  parseRecord,
  type BaseBladeParams,
  type Blade,
  type View,
  type ViewProps,
  type BladePlugin,
} from "@tweakpane/core";

import type { Expand } from "sta/common";

const className = ClassName("htmlcontainer");

/** Styles for the htmlcontainer blade; registered via the plugin bundle. */
export const htmlContainerCss = `.tp-htmlcontainerv {
    display: grid;
}
`;

export interface HTMLContainerViewConfig {
  innerElem: HTMLElement;
  viewProps: ViewProps;
}

export class HTMLContainerView implements View {
  #titleElem: HTMLDivElement;

  #innerElem: HTMLElement;

  element: HTMLDivElement;

  get innerElem(): HTMLElement {
    return this.#innerElem;
  }

  set innerElem(value: HTMLElement) {
    if (this.#innerElem !== value) {
      this.#titleElem.replaceChild(value, this.#innerElem);
      this.#innerElem = value;
    }
  }

  constructor(doc: Document, config: HTMLContainerViewConfig) {
    this.element = doc.createElement("div");
    this.element.classList.add(className());
    config.viewProps.bindClassModifiers(this.element);

    const titleElem = doc.createElement("div");
    titleElem.classList.add(className("t"));
    {
      this.#innerElem = config.innerElem;
      titleElem.appendChild(this.#innerElem);
    }
    this.#titleElem = titleElem;
    this.element.appendChild(titleElem);
  }
}

export type HTMLContainerControllerConfig = Expand<
  HTMLContainerViewConfig & {
    blade: Blade;
  }
>;

class HTMLContainerController extends BladeController<HTMLContainerView> {
  constructor(doc: Document, config: HTMLContainerControllerConfig) {
    super({
      blade: config.blade,
      view: new HTMLContainerView(doc, config),
      viewProps: config.viewProps,
    });
  }
}

export type HTMLContainerParams = Expand<
  BaseBladeParams & {
    view: "htmlcontainer";
    innerElem: HTMLElement;
  }
>;

export class HTMLContainerApi extends BladeApi<HTMLContainerController> {
  get innerElem(): HTMLElement {
    return this.controller.view.innerElem;
  }

  set innerElem(value: HTMLElement) {
    this.controller.view.innerElem = value;
  }
}

/**
 * Helper blade that contains a HTML element that can be edited independently
 * of the `tweakpane` pane.
 */

export const HTMLContainerPlugin: BladePlugin<HTMLContainerParams> =
  createPlugin({
    id: "htmlcontainer",
    type: "blade",
    accept(params) {
      const r = parseRecord(params, (p) => ({
        view: p.required.constant("htmlcontainer"),
        innerElem: p.required.custom((v: unknown) => {
          if (v instanceof HTMLElement) return v;

          return undefined;
        }),
      }));
      return r != null ? { params: r } : null;
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
  });
