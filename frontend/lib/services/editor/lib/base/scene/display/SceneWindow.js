import _ from 'lodash';
import * as THREE from 'three';

/**
 * @template T
 * @template V
 * @typedef {import('ts-essentials').PickKeys<T, V>} PickKeys
 */

/**
 * @template T
 * @typedef {import('../../../../../../common/lib/utils').TypeUtils.Expand<T>} Expand
 */

/**
 * @typedef {import('./SceneDisplay').SceneDisplay<any>} SceneDisplay
 */

/**
 * @typedef {PickKeys<GlobalEventHandlersEventMap, PointerEvent>} PointerEventKeys
 */

/**
 * @typedef {Expand<PointerEvent & { type: PointerEventKeys }>} ScenePointerEvent
 */

/**
 * @typedef {{ [K in PointerEventKeys]: GlobalEventHandlersEventMap[K] }} ScenePointerEventMap
 */

/**
 * @type {ReadonlyArray<keyof ScenePointerEventMap>}
 */
export const POINTER_EVENT_KEYS = [
    'pointermove',
    'gotpointercapture',
    'lostpointercapture',
    'pointercancel',
    'pointerdown',
    'pointerenter',
    'pointerleave',
    'pointerout',
    'pointerover',
    'pointerup',
];

/**
 * Captures and re-emits {@link PointerEvent}s emitted by a DOM element.
 * 
 * To function correctly, the pointer events emitted by the DOM element
 * should only be handled directly by an instance of this class.
 * 
 * @augments THREE.EventDispatcher<ScenePointerEventMap>
 */
class PointerEventsObserver extends THREE.EventDispatcher {

    /**
     * The DOM element observed by this object.
     * 
     * @readonly
     * @type {HTMLElement}
     */
    dom;

    /**
     * Creates a new object to manage the {@link PointerEvent}s emitted by a DOM element.
     * 
     * @param {HTMLElement} dom The DOM element to observe.
     */
    constructor(dom) {
        super();

        this.dom = dom;

        for (const key of POINTER_EVENT_KEYS) {
            this.dom.addEventListener(key, this.#handlePointerEvent);
        }
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        for (const key of POINTER_EVENT_KEYS) {
            this.dom.removeEventListener(key, this.#handlePointerEvent);
        }
    }

    /**
     * @type {(event: PointerEvent) => void}
     */
    #handlePointerEvent = (event) => {
        const { dom } = this;

        // Allows the user to continue dragging an object in the original view
        // even if the pointer moves to another view
        if (event.type === 'pointerdown') {
            dom.setPointerCapture(event.pointerId);
        } else if (event.type === 'pointerup' || event.type === 'pointercancel') {
            dom.releasePointerCapture(event.pointerId);
        }

        this.dispatchEvent(_.assignIn({}, /** @type {ScenePointerEvent} */ (event)));

        event.preventDefault();
        event.stopPropagation();
    };
}

/**
 * Interface for objects that represent a window in which a scene is rendered using
 * a separate camera.
 * 
 * @interface
 */
export class SceneWindow {

    /**
     * The name of this window.
     * 
     * @type {string}
     * @abstract
     */
    get name() { throw new Error('Not implemented'); }

    /**
     * The `three.js` layer of this window; only objects that belong to this layer
     * will be rendered in this window.
     * 
     * @type {number}
     * @abstract
     */
    get layerId() { throw new Error('Not implemented'); }

    /**
     * A DOM element which boundaries define the area in which to render this window.
     * 
     * When this window is added to a {@link SceneDisplay}, this element will be
     * added as a child of its canvas.
     * 
     * @type {HTMLDivElement}
     * @abstract
     */
    get dom() { throw new Error('Not implemented'); }

    /**
     * A handle for other objects to listen to the {@link ScenePointerEvent}s emitted by
     * this window.
     * 
     * @type {THREE.EventDispatcher<ScenePointerEventMap>}
     * @abstract
     */
    get pointerEvents() { throw new Error('Not implemented'); }

    /**
     * Gets the camera used to render this window.
     * 
     * This camera should be located in world space,
     * rather than being relative to the current frame.
     * 
     * Unlike other attributes of this window, a different camera may be returned
     * each time this is called.
     * 
     * @returns {THREE.Camera} The requested camera.
     * @abstract
     */
    getCamera() {
        throw new Error('Not implemented');
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     * 
     * @abstract
     */
    dispose() {
        throw new Error('Not implemented');
    }
}

/**
 * Abstract base implementation of {@link SceneWindow}.
 * 
 * @template {{}} TEventMap Defines each event that can be dispatched by the window.
 * @implements {SceneWindow}
 * @augments THREE.EventDispatcher<TEventMap>
 */
export class BaseSceneWindow extends THREE.EventDispatcher {

    /**
     * The name of this window.
     * 
     * @readonly
     * @type {string}
     */
    name;

    /**
     * The `three.js` layer of this window; only objects that belong to this layer
     * will be rendered in this window.
     * 
     * @readonly
     * @type {number}
     */
    layerId;

    /**
     * A DOM element which boundaries define the area in which to render this window.
     * 
     * When this window is added to a {@link SceneDisplay}, this element will be
     * added as a sibling of its rendering canvas.
     * 
     * @type {HTMLDivElement}
     * @abstract
     */
    get dom() { throw new Error('Not implemented'); }

    /**
     * Note: We can only construct this after the object is fully constructed,
     * since `this.dom` may not be defined in this constructor.
     * 
     * @type {PointerEventsObserver | undefined}
     */
    #pointerEventsObserver = undefined;

    /**
     * A handle for other objects to listen to the {@link ScenePointerEvent}s emitted by
     * this window.
     * 
     * @type {THREE.EventDispatcher<ScenePointerEventMap>}
     */
    get pointerEvents() {
        if (this.#pointerEventsObserver === undefined) {
            this.#pointerEventsObserver = new PointerEventsObserver(this.dom);
        }

        return this.#pointerEventsObserver;
    }

    /**
     * Creates a new window.
     * 
     * @protected
     * @param {string} name The name of the window.
     * @param {number} layerId The `three.js` layer of the window.
     */
    constructor(name, layerId) {
        super();

        this.name = name;
        this.layerId = layerId;
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#pointerEventsObserver?.dispose();
    }

    /**
     * Gets the camera used to render this window.
     * 
     * This camera should be located in world space,
     * rather than being relative to the current frame.
     * 
     * Unlike other attributes of this window, a different camera may be returned
     * each time this is called.
     * 
     * @returns {THREE.Camera} The requested camera.
     * @abstract
     */
    getCamera() {
        throw new Error('Not implemented');
    }
}
