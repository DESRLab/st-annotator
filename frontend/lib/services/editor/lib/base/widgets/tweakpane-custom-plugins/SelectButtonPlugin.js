import { ClassName, Emitter, bindValue, bindValueToTextContent } from '@tweakpane/core';

/**
 * @template {View} V
 * @typedef {import('@tweakpane/core').Controller<V>} Controller
 */

/**
 * @typedef {import('@tweakpane/core').View} View
 */

/**
 * @template {Record<string, unknown>} O
 * @typedef {import('@tweakpane/core').ValueMap<O>} ValueMap
 */

/**
 * @typedef {import('@tweakpane/core').ViewProps} ViewProps
 */

/**
 * @typedef {{
 *     title: string | undefined;
 *     selected: boolean;
 * }} SelectButtonPropsObject
 */

/**
 * @typedef {ValueMap<SelectButtonPropsObject>} SelectButtonProps
 */

/**
 * @typedef {{
 *     props: SelectButtonProps;
 *     viewProps: ViewProps;
 * }} SelectButtonConfig
 */

const className = ClassName('selectbtn');

/**
 * @implements {View}
 */
export class SelectButtonView {

    /**
     * Creates a new view object.
     * 
     * @param {Document} doc The document to attach the blade to.
     * @param {SelectButtonConfig} config The configuration of the view.
     */
    constructor(doc, config) {
        this.element = doc.createElement('div');
        this.element.classList.add(className());
        config.viewProps.bindClassModifiers(this.element);

        const buttonElem = doc.createElement('button');
        buttonElem.classList.add(className('b'));
        config.viewProps.bindDisabled(buttonElem);
        this.element.appendChild(buttonElem);
        this.buttonElement = buttonElem;
        bindValue(config.props.value('selected'), (value) => {
            if (value) {
                this.buttonElement.classList.add(className('b', 'selected'));
            } else {
                this.buttonElement.classList.remove(className('b', 'selected'));
            }
        });

        const titleElem = doc.createElement('div');
        titleElem.classList.add(className('t'));
        bindValueToTextContent(config.props.value('title'), titleElem);
        this.buttonElement.appendChild(titleElem);
    }
}

/**
 * @typedef {{
 *     select: {
 *         sender: SelectButtonController;
 *     };
 * }} SelectButtonEvents
 */

/**
 * @implements {Controller<SelectButtonView>}
 */
export class SelectButtonController {

    /**
     * @readonly
     * @type {Emitter<SelectButtonEvents>}
     */
    emitter = new Emitter();

    /**
     * @readonly
     * @type {SelectButtonProps}
     */
    props;

    /**
     * @readonly
     * @type {SelectButtonView}
     */
    view;

    /**
     * @readonly
     * @type {ViewProps}
     */
    viewProps;

    /**
     * Creates a new controller object.
     * 
     * @param {Document} doc The document to attach the blade to.
     * @param {SelectButtonConfig} config The configuration of the controller.
     */
    constructor(doc, config) {
        this.onClick_ = this.onClick_.bind(this);

        this.props = config.props;
        this.viewProps = config.viewProps;

        this.view = new SelectButtonView(doc, {
            props: this.props,
            viewProps: this.viewProps,
        });
        this.view.buttonElement.addEventListener('click', this.onClick_);

        bindValue(this.props.value('selected'), () => {
            this.emitter.emit('select', {
                sender: this,
            });
        });
    }

    /**
     * @type {boolean}
     */
    get selected() {
        return this.props.get('selected');
    }

    set selected(selected) {
        this.props.set('selected', selected);
    }

    /**
     * @private
     */
    onClick_() {
        this.selected = !this.selected;
    }
}
