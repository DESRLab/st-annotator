import * as THREE from 'three';

import { Controller } from './Component';

/**
 * @typedef {object} DraggablePanelModelParams
 * @property {string} title The title of the panel.
 * @property {Element} [content] The content of the panel. Defaults to an empty `<div>`.
 * @property {number} [top=0] The pixel offset of the top edge of the panel,
 * relative to its parent.
 * @property {number} [left=0] The pixel offset of the left edge of the panel,
 * relative to its parent.
 * @property {boolean} [isCollapsed=false] `true` if the content of the panel is collapsed;
 * otherwise, `false`.
 */

/**
 * Model class for {@link DraggablePanel}.
 * 
 * @typedef {Required<DraggablePanelModelParams>} DraggablePanelModel
 */

/**
 * @typedef {object} DraggablePanelViewParams
 * @property {number} [offsetTop=0] The pixel offset of the top edge of the panel,
 * relative to its parent.
 * @property {number} [offsetLeft=0] The pixel offset of the left edge of the panel,
 * relative to its parent.
 * @property {string} [title=''] The title of the panel.
 * @property {Element} [contentElem] The content of the panel. Defaults to an empty `<div>`.
 * @property {boolean} [isCollapsed=false] `true` if the content of the panel is collapsed;
 * otherwise, `false`.
 */

/**
 * @typedef {{ x: number, y: number }} PointerPosition
 */

/**
 * Represents the event when the panel is dragged.
 * - `prevPointerPos`: The previous position of the pointer.
 * - `pointerPos`: The current position of the pointer.
 * 
 * @typedef {{
 *     prevPointerPos: PointerPosition;
 *     pointerPos: PointerPosition;
 * }} DragEvent
 */

/**
 * Defines each event that can be dispatched by {@link DraggablePanelView}.
 * 
 * @typedef {object} DraggablePanelViewEventMap
 * @property {DragEvent} drag The event when the panel is dragged.
 * @property {{}} toggle-collapse The event when the panel is collapsed or uncollapsed.
 */

/**
 * View class for {@link DraggablePanel}.
 * 
 * @augments THREE.EventDispatcher<DraggablePanelViewEventMap>
 */
class DraggablePanelView extends THREE.EventDispatcher {

    /**
     * The DOM element representing the panel.
     * 
     * @readonly
     * @type {HTMLDivElement}
     */
    dom;

    /**
     * The pixel offset of the top edge of the panel, relative to its parent.
     * 
     * @type {number}
     */
    get offsetTop() { return this.dom.offsetTop; }

    set offsetTop(value) { this.dom.style.top = `${value}px`; }

    /**
     * The pixel offset of the left edge of the panel, relative to its parent.
     * 
     * @type {number}
     */
    get offsetLeft() { return this.dom.offsetLeft; }

    set offsetLeft(value) { this.dom.style.left = `${value}px`; }

    /**
     * Displays the title of the panel and acts as the target for click-and-dragging.
     * 
     * @readonly
     * @type {HTMLLabelElement}
     */
    #titleLabel;

    /**
     * The title of the panel.
     * 
     * @type {string}
     */
    get title() { return this.#titleLabel.textContent ?? ''; }

    set title(value) { this.#titleLabel.textContent = value; }

    /**
     * When clicked on, toggles whether the content of the panel is collapsed or not.
     * 
     * @readonly
     * @type {HTMLLabelElement}
     */
    #toggleCollapsedLabel;

    /**
     * Contains the content of this panel.
     * 
     * @readonly
     * @type {HTMLDivElement}
     */
    #contentWrapper;

    /**
     * An element containing the content of the panel.
     * 
     * @type {Element}
     */
    get contentElem() { return this.#contentWrapper.children[0]; }

    set contentElem(value) {
        const prevValue = this.contentElem;
        if (prevValue !== value) {
            this.#contentWrapper.replaceChild(value, prevValue);
        }
    }

    /**
     * The previous position of the pointer. It is `null` if the panel is not being dragged.
     * 
     * @type {?PointerPosition}
     */
    #prevPointerPos = null;

    /**
     * Handles the event when the pointer is activated on the title.
     * 
     * @param {PointerEvent} event The event to handle.
     */
    #onTitlePointerDown = (event) => {
        this.#titleLabel.setPointerCapture(event.pointerId);

        this.#prevPointerPos = { x: event.clientX, y: event.clientY };
        this.#titleLabel.style.cursor = 'grabbing';

        event.preventDefault();     // Avoid highlighting content
        event.stopPropagation();
    };

    /**
     * Handles the event when the pointer is moved on the title.
     * 
     * @param {PointerEvent} event The event to handle.
     */
    #onTitlePointerMove = (event) => {
        if (this.#prevPointerPos == null) return;

        const prevPointerPos = this.#prevPointerPos;
        const pointerPos = { x: event.clientX, y: event.clientY };
        this.#prevPointerPos = pointerPos;

        this.dispatchEvent({
            type: 'drag',
            prevPointerPos: prevPointerPos,
            pointerPos: pointerPos,
        });

        event.preventDefault();
        event.stopPropagation();
    };

    /**
     * Handles the event when the pointer is deactivated on the title.
     * 
     * @param {PointerEvent} event The event to handle.
     */
    #onTitlePointerUp = (event) => {
        this.#titleLabel.releasePointerCapture(event.pointerId);

        this.#prevPointerPos = null;
        this.#titleLabel.style.cursor = 'grab';

        event.preventDefault();
        event.stopPropagation();
    };

    /**
     * Handles the event when the pointer is activated on the label
     * acting as a button to toggle the collapsed status.
     * 
     * @param {PointerEvent} event The event to handle.
     */
    #onCollapsePointerDown = (event) => {
        this.dispatchEvent({ type: 'toggle-collapse' });

        event.preventDefault();     // Avoid highlighting content
        event.stopPropagation();
    };

    /**
     * Creates a view for a {@link DraggablePanel}.
     * 
     * @param {DraggablePanelViewParams} params The parameters to pass to the view.
     */
    constructor(params) {
        super();

        this.dom = document.createElement('div');
        this.dom.className = 'draggable-panel';
        this.dom.style.position = 'absolute';

        this.offsetLeft = params.offsetLeft ?? 0;
        this.offsetTop = params.offsetTop ?? 0;

        const headerDiv = document.createElement('div');
        headerDiv.className = 'header';
        {
            this.#titleLabel = document.createElement('label');
            this.#titleLabel.style.cursor = 'grab';
            this.#titleLabel.addEventListener('pointerdown', this.#onTitlePointerDown);
            this.#titleLabel.addEventListener('pointermove', this.#onTitlePointerMove);
            this.#titleLabel.addEventListener('pointerup', this.#onTitlePointerUp);
            headerDiv.appendChild(this.#titleLabel);

            this.title = params.title ?? '';

            this.#toggleCollapsedLabel = document.createElement('label');
            this.#toggleCollapsedLabel.addEventListener('pointerdown', this.#onCollapsePointerDown);
            headerDiv.appendChild(this.#toggleCollapsedLabel);
        }
        this.dom.appendChild(headerDiv);

        this.#contentWrapper = document.createElement('div');
        this.#contentWrapper.className = 'content';
        {
            const contentElem = params.contentElem ?? document.createElement('div');
            this.#contentWrapper.appendChild(contentElem);
        }
        this.dom.appendChild(this.#contentWrapper);

        this.renderCollapsed(params.isCollapsed ?? false);
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#titleLabel.removeEventListener('pointerdown', this.#onTitlePointerDown);
        this.#titleLabel.removeEventListener('pointermove', this.#onTitlePointerMove);
        this.#titleLabel.removeEventListener('pointerup', this.#onTitlePointerUp);
        this.#toggleCollapsedLabel.removeEventListener('pointerdown', this.#onCollapsePointerDown);
    }

    /**
     * Updates the view according to the given collapsed status.
     * 
     * @param {boolean} isCollapsed `true` if the content is collapsed; otherwise, `false`.
     */
    renderCollapsed(isCollapsed) {
        const dom = this.dom;
        const toggleCollapsedLabel = this.#toggleCollapsedLabel;

        if (isCollapsed) {
            dom.classList.add('collapsed');
            toggleCollapsedLabel.textContent = '+';
        } else {
            dom.classList.remove('collapsed');
            toggleCollapsedLabel.textContent = '\u2212';
        }
    }
}

/**
 * @typedef {DraggablePanelModelParams} DraggablePanelControllerParams
 */

/**
 * Controller class for {@link DraggablePanel}.
 * 
 * @augments {Controller<DraggablePanelModel, DraggablePanelView, THREE.Event>}
 */
class DraggablePanelController extends Controller {

    // [Handle view event]

    /**
     * @type {THREE.EventListener<DraggablePanelViewEventMap['drag'],
     * 'drag', DraggablePanelView>}
     */
    #onViewDrag = ({ prevPointerPos, pointerPos }) => {
        const rect = this.view.dom.getBoundingClientRect();

        this.top = rect.top + pointerPos.y - prevPointerPos.y;
        this.left = rect.left + pointerPos.x - prevPointerPos.x;
    };

    /**
     * @type {THREE.EventListener<DraggablePanelViewEventMap['toggle-collapse'],
     * 'toggle-collapse', DraggablePanelView>}
     */
    #onViewToggleCollapse = () => {
        this.isCollapsed = !this.model.isCollapsed;
    };

    // [Mutate controller]

    /**
     * The DOM element representing the panel.
     * 
     * @type {HTMLDivElement}
     */
    get dom() { return this.view.dom; }

    /**
     * @type {ResizeObserver}
     */
    #resizeObserver;

    /**
     * The title of the panel.
     * 
     * @type {string}
     */
    get title() { return this.model.title; }

    set title(value) {
        this.model.title = value;

        // For simplicity, skip [Emit model event] and [Handle model event]
        this.view.title = value;
    }

    /**
     * The content of the panel.
     * 
     * @type {Element}
     */
    get content() { return this.model.content; }

    set content(value) {
        this.model.content = value;

        // For simplicity, skip [Emit model event] and [Handle model event]
        this.view.contentElem = value;
    }

    /**
     * The pixel offset of the top edge of the panel, relative to its parent.
     * 
     * @type {number}
     */
    get top() { return this.model.top; }

    set top(value) {
        this.model.top = value;

        // For simplicity, skip [Emit model event] and [Handle model event]
        this.view.offsetTop = value;
    }

    /**
     * The pixel offset of the left edge of the panel, relative to its parent.
     * 
     * @type {number}
     */
    get left() { return this.model.left; }

    set left(value) {
        this.model.left = value;

        // For simplicity, skip [Emit model event] and [Handle model event]
        this.view.offsetLeft = value;
    }

    /**
     * `true` if the content of the panel is collapsed; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get isCollapsed() { return this.model.isCollapsed; }

    set isCollapsed(value) {
        this.model.isCollapsed = value;

        // For simplicity, skip [Emit model event] and [Handle model event]
        this.view.renderCollapsed(value);
    }

    /**
     * Updates the view according to the data in the model.
     */
    #render() {
        const { model, view } = this;
        const { title, content, top, left, isCollapsed } = model;

        view.title = title;
        view.contentElem = content;
        view.offsetTop = top;
        view.offsetLeft = left;
        view.renderCollapsed(isCollapsed);
    }

    // [Handle model event]
    // ...

    /**
     * Creates a controller for a {@link DraggablePanel}.
     * 
     * @param {DraggablePanelControllerParams} params The parameters to pass to the controller.
     * @returns {DraggablePanelController} The new controller.
     */
    static fromParams(params) {
        const model = {
            title: params.title,
            content: params.content ?? document.createElement('div'),
            top: params.top ?? 0,
            left: params.left ?? 0,
            isCollapsed: params.isCollapsed ?? false,
        };

        const view = new DraggablePanelView({});

        return new DraggablePanelController(model, view);
    }

    /**
     * @type {boolean}
     */
    #isAdjustingSize = false;

    #onResize = () => {
        if (this.#isAdjustingSize) return;

        this.#isAdjustingSize = true;

        try {
            const domRect = this.dom.getBoundingClientRect();
            const parentRect = this.dom.parentElement?.getBoundingClientRect() ?? {
                top: 0,
                left: 0,
                bottom: window.innerHeight,
                right: window.innerWidth,
            };

            this.top += Math.max(parentRect.top - domRect.top, 0);
            this.left += Math.max(parentRect.left - domRect.left, 0);
            this.top -= Math.max(domRect.bottom - parentRect.bottom, 0);
            this.left -= Math.max(domRect.right - parentRect.right, 0);
        } finally {
            this.#isAdjustingSize = false;
        }
    };

    /**
     * Creates a controller for a {@link DraggablePanel}.
     * 
     * @protected
     * @param {DraggablePanelModel} model The model to keep in sync with the view.
     * @param {DraggablePanelView} view The view to keep in sync with the model.
     */
    constructor(model, view) {
        super(model, view);

        this.#render();

        this.#resizeObserver = new ResizeObserver(this.#onResize);
        this.#resizeObserver.observe(this.dom);

        this.view.addEventListener('drag', this.#onViewDrag);
        this.view.addEventListener('toggle-collapse', this.#onViewToggleCollapse);
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#resizeObserver.disconnect();

        this.view.removeEventListener('drag', this.#onViewDrag);
        this.view.removeEventListener('toggle-collapse', this.#onViewToggleCollapse);
    }
}

/**
 * @typedef {DraggablePanelControllerParams} DraggablePanelParams
 */

/**
 * A panel which can be dragged inside the current window.
 */
export class DraggablePanel {

    /**
     * @readonly
     * @type {DraggablePanelController}
     */
    #controller;

    /**
     * The DOM element representing this panel.
     * 
     * @type {HTMLDivElement}
     */
    get dom() { return this.#controller.dom; }

    /**
     * The title of this panel.
     * 
     * @type {string}
     */
    get title() { return this.#controller.title; }

    set title(value) { this.#controller.title = value; }

    /**
     * The content of this panel.
     * 
     * @type {Element}
     */
    get content() { return this.#controller.content; }

    set content(value) { this.#controller.content = value; }

    /**
     * The pixel offset of the top edge of this panel, relative to its parent.
     * 
     * @type {number}
     */
    get top() { return this.#controller.top; }

    set top(value) { this.#controller.top = value; }

    /**
     * The pixel offset of the left edge of this panel, relative to its parent.
     * 
     * @type {number}
     */
    get left() { return this.#controller.left; }

    set left(value) { this.#controller.left = value; }

    /**
     * `true` if the content of this panel is collapsed; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get isCollapsed() { return this.#controller.isCollapsed; }

    set isCollapsed(value) { this.#controller.isCollapsed = value; }

    /**
     * Creates a new draggable panel.
     * 
     * @param {DraggablePanelParams} params The parameters of the panel.
     */
    constructor(params) {
        this.#controller = DraggablePanelController.fromParams(params);
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#controller.dispose();
    }

    /**
     * Aligns this panel with the top edge of its parent.
     * 
     * @returns {this} This object.
     */
    alignTop() {
        this.top = 0;

        return this;
    }

    /**
     * Aligns this panel with the bottom edge of its parent.
     * 
     * @returns {this} This object.
     */
    alignBottom() {
        const controller = this.#controller;

        const parentElement = controller.dom.parentElement;
        const parentHeight = (parentElement == null) ? window.innerHeight
            : parentElement.getBoundingClientRect().height;

        this.top = parentHeight - controller.dom.getBoundingClientRect().height;

        return this;
    }

    /**
     * Vertically aligns this panel with the center of its parent.
     * 
     * @returns {this} This object.
     */
    alignCenterVertical() {
        this.alignBottom();

        this.top /= 2;

        return this;
    }

    /**
     * Aligns this panel with the left edge of its parent.
     * 
     * @returns {this} This object.
     */
    alignLeft() {
        this.left = 0;

        return this;
    }

    /**
     * Aligns this panel with the right edge of its parent.
     * 
     * @returns {this} This object.
     */
    alignRight() {
        const controller = this.#controller;

        const parentElement = controller.dom.parentElement;
        const parentWidth = (parentElement == null) ? window.innerWidth
            : parentElement.getBoundingClientRect().width;

        this.left = parentWidth - controller.dom.getBoundingClientRect().width;

        return this;
    }

    /**
     * Horizontally aligns this panel with the center of its parent.
     * 
     * @returns {this} This object.
     */
    alignCenterHorizontal() {
        this.alignRight();

        this.left /= 2;

        return this;
    }
}
