import {
  ClassName,
  Emitter,
  bindValue,
  bindValueToTextContent,
  type Controller,
  type ValueMap,
  type View,
  type ViewProps,
} from "@tweakpane/core";

export interface SelectButtonPropsObject extends Record<string, unknown> {
  title: string | undefined;
  selected: boolean;
}

export type SelectButtonProps = ValueMap<SelectButtonPropsObject>;

export interface SelectButtonConfig {
  props: SelectButtonProps;
  viewProps: ViewProps;
}

const className = ClassName("selectbtn");

export class SelectButtonView implements View {
  element: HTMLDivElement;
  buttonElement: HTMLButtonElement;

  constructor(doc: Document, config: SelectButtonConfig) {
    this.element = doc.createElement("div");
    this.element.classList.add(className());
    config.viewProps.bindClassModifiers(this.element);

    const buttonElem = doc.createElement("button");
    buttonElem.classList.add(className("b"));
    config.viewProps.bindDisabled(buttonElem);
    this.element.appendChild(buttonElem);
    this.buttonElement = buttonElem;
    bindValue(config.props.value("selected"), (value: boolean) => {
      if (value) {
        this.buttonElement.classList.add(className("b", "selected"));
      } else {
        this.buttonElement.classList.remove(className("b", "selected"));
      }
    });

    const titleElem = doc.createElement("div");
    titleElem.classList.add(className("t"));
    bindValueToTextContent(config.props.value("title"), titleElem);
    this.buttonElement.appendChild(titleElem);
  }
}

export interface SelectButtonEvents {
  select: {
    sender: SelectButtonController;
  };
}

export class SelectButtonController implements Controller<SelectButtonView> {
  readonly emitter = new Emitter<SelectButtonEvents>();

  readonly props: SelectButtonProps;

  readonly view: SelectButtonView;

  readonly viewProps: ViewProps;

  constructor(doc: Document, config: SelectButtonConfig) {
    this.props = config.props;
    this.viewProps = config.viewProps;

    this.view = new SelectButtonView(doc, {
      props: this.props,
      viewProps: this.viewProps,
    });
    this.view.buttonElement.addEventListener("click", this.onClick_);

    bindValue(this.props.value("selected"), () => {
      this.emitter.emit("select", {
        sender: this,
      });
    });
  }

  get selected(): boolean {
    return this.props.get("selected");
  }

  set selected(selected: boolean) {
    this.props.set("selected", selected);
  }

  private onClick_ = (): void => {
    this.selected = !this.selected;
  };
}
