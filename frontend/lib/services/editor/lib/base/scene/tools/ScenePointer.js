import _ from 'lodash';
import * as THREE from 'three';

import { ThreeUtils } from '../../../../../../common/lib/utils';

import { POINTER_EVENT_KEYS } from '../display';

import { SceneObjectsGroups } from './SceneObjects';

/**
 * @template T
 * @typedef {import('../../../../../../common/lib/utils').TypeUtils.Expand<T>} Expand
 */

/**
 * @typedef {import('../display').ScenePointerEvent} ScenePointerEvent
 */

/**
 * @typedef {import('../display').ScenePointerEventMap} ScenePointerEventMap
 */

/**
 * @typedef {import('../display').SceneWindow} SceneWindow
 */

/**
 * @template T
 * @typedef {import('./SceneObjects').SceneObjectsGroup<T>} SceneObjectsGroup
 */

/**
 * @template T
 * @typedef {import('./SceneObjects').GroupItems<T>} GroupItems
 */

/**
 * @typedef {import('./SceneObjects').SceneObjectsGroupsEventMap} SceneObjectsGroupsEventMap
 */

/**
 * @typedef {object} _InteractChangeEventMap
 * @property {{}} change The event when the state of the interactor has been changed.
 */

/**
 * Defines each event that can be dispatched by {@link InteractController}.
 * 
 * @typedef {Expand<ScenePointerEventMap & _InteractChangeEventMap>} InteractControllerEventMap
 */

/**
 * This is to guarantee the order of event execution (where the wrapped class handles the
 * event before the wrapper class does so).
 * 
 * @template {THREE.EventDispatcher<any>} T
 * @typedef {Omit<T, keyof THREE.EventDispatcher<any>>} OmitEvents
 */

/**
 * Enables a pointer device to interact with groups of objects in a {@link SceneWindow}.
 * 
 * Note that if multiple instances of this class are attached to the same window,
 * they will receive pointer events independently. To avoid duplicate interactions,
 * the object groups assigned to each instance should be non-overlapping.
 * 
 * @template T The type of object to interact with.
 * @augments THREE.EventDispatcher<InteractControllerEventMap>
 */
export class InteractController extends THREE.EventDispatcher {

    /**
     * The window to listen for pointer events.
     * 
     * @readonly
     * @type {SceneWindow}
     */
    #window;

    /**
     * Contains the objects to interact with.
     * 
     * @type {SceneWindow}
     */
    get window() { return this.#window; }

    /**
     * Contains the objects to interact with.
     * 
     * @readonly
     * @type {SceneObjectsGroups<T>}
     */
    #groups;

    /**
     * Contains the objects to interact with.
     * 
     * @type {OmitEvents<SceneObjectsGroups<T>>}
     */
    get groups() { return this.#groups; }

    /**
     * @type {THREE.Raycaster}
     */
    #raycaster;

    /**
     * Raycasts the pointer to each object.
     * 
     * @type {THREE.Raycaster}
     */
    get raycaster() { return this.#raycaster; }

    set raycaster(value) {
        if (this.#raycaster !== value) {
            this.#raycaster = value;

            this.dispatchEvent({ type: 'change' });
        }
    }

    /**
     * @type {(event: ScenePointerEvent) => void}
     */
    #handlePointerEvent = (event) => {
        const { window, raycaster } = this;

        ThreeUtils.updateRaycaster(raycaster, window.getCamera(), window.dom, event);

        this.dispatchEvent(_.assignIn({}, event));
    };

    /**
     * @type {(event: SceneObjectsGroupsEventMap['change']) => void}
     */
    #onObjectsUpdate = (event) => {
        this.dispatchEvent({ type: 'change' });
    };

    /**
     * Creates a new helper instance for a pointer device to interact with groups of objects.
     * 
     * @param {SceneWindow} window The window to listen for pointer events.
     * @param {SceneObjectsGroups<T>} groups Contains the objects to interact with.
     * @param {THREE.Raycaster} raycaster Raycasts the pointer to each object.
     */
    constructor(window, groups, raycaster) {
        super();

        this.#window = window;
        this.#groups = groups;
        this.#raycaster = raycaster;

        this.#groups.addEventListener('change', this.#onObjectsUpdate);

        for (const key of POINTER_EVENT_KEYS) {
            this.#window.pointerEvents.addEventListener(key, this.#handlePointerEvent);
        }
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#groups.removeEventListener('change', this.#onObjectsUpdate);

        for (const key of POINTER_EVENT_KEYS) {
            this.#window.pointerEvents.removeEventListener(key, this.#handlePointerEvent);
        }
    }
}

/**
 * @template T The type of object to hover over.
 * @typedef {object} _HoverEventMap
 * @property {{ object: T }} hoverin The event when a pointer has entered an object.
 * @property {{ object: T }} hoverout The event when a pointer has exited an object.
 */

/**
 * Defines each event that can be dispatched by {@link HoverController}.
 * 
 * @template T The type of object to hover over.
 * @typedef {Expand<InteractControllerEventMap & _HoverEventMap<T>>} HoverControllerEventMap
 */

/**
 * Enables a pointer device to hover over groups of objects in a {@link SceneWindow}.
 * 
 * Note that if multiple instances of this class are attached to the same window,
 * they will receive pointer events independently. To avoid duplicate interactions,
 * the object groups assigned to each instance should be non-overlapping.
 * 
 * @template T The type of object to hover over.
 * @augments THREE.EventDispatcher<HoverControllerEventMap<T>>
 */
export class HoverController extends THREE.EventDispatcher {

    /**
     * The object to listen for interaction events.
     * 
     * @readonly
     * @type {InteractController<T>}
     */
    #interactor;

    /**
     * Contains the objects to interact with.
     * 
     * @type {SceneWindow}
     */
    get window() { return this.#interactor.window; }

    /**
     * Contains the objects to interact with.
     * 
     * @type {OmitEvents<SceneObjectsGroups<T>>}
     */
    get groups() { return this.#interactor.groups; }

    /**
     * Raycasts the pointer to each object.
     * 
     * @type {THREE.Raycaster}
     */
    get raycaster() { return this.#interactor.raycaster; }

    /**
     * @type {boolean}
     */
    #hoverEnabled = true;

    /**
     * Whether the hovered object is updated automatically when the pointer is moved.
     * In any case, it can be set manually.
     * 
     * Note that the currently hovered object is un-hovered upon setting this to `false`.
     * 
     * @type {boolean}
     */
    get hoverEnabled() { return this.#hoverEnabled; }

    set hoverEnabled(value) {
        if (this.#hoverEnabled !== value) {
            this.#hoverEnabled = value;

            if (!value) {
                this.hoveredObj = null;
            }
        }
    }

    /**
     * @type {?T}
     */
    #hoveredObj = null;

    /**
     * A view of the object that is being hovered over, if any.
     * 
     * Changes to the object are reflected in the view, and vice-versa.
     * 
     * @type {?T}
     */
    get hoveredObj() { return this.#hoveredObj; }

    set hoveredObj(value) {
        const prevHoveredObj = this.hoveredObj;
        if (prevHoveredObj !== value) {
            this.#hoveredObj = value;

            if (prevHoveredObj != null) {
                this.dispatchEvent({
                    type: 'hoverout',
                    object: prevHoveredObj,
                });
            }

            if (value != null) {
                if (!this.groups.has(value)) {
                    console.warn('This picker does not interact with the object to hover over');
                }

                this.dispatchEvent({
                    type: 'hoverin',
                    object: value,
                });
            }
        }
    }

    /**
     * Whether an object is being hovered over.
     * 
     * @type {boolean}
     */
    get isHoveringObj() { return this.#hoveredObj != null; }

    /**
     * @type {(event: ScenePointerEvent) => void}
     */
    #onPointerMove = (event) => {
        if (!this.hoverEnabled) return;

        this.hoveredObj = this.#getHoveredObj();

        this.dispatchEvent(_.assignIn({}, event));
    };

    /**
     * @type {(event: ScenePointerEvent) => void}
     */
    #handlePointerEvent = (event) => {
        this.dispatchEvent(_.assignIn({}, event));
    };

    /**
     * @type {(event: InteractControllerEventMap['change']) => void}
     */
    #onObjectsUpdate = (event) => {
        if (!this.hoverEnabled) return;

        this.hoveredObj = this.#getHoveredObj();

        this.dispatchEvent({ type: 'change' });
    };

    /**
     * Creates a new helper for a pointer to hover over groups of objects.
     * 
     * @param {InteractController<T>} interactor The object to listen for interact events.
     */
    constructor(interactor) {
        super();

        this.#interactor = interactor;
        this.#interactor.addEventListener('change', this.#onObjectsUpdate);

        for (const key of POINTER_EVENT_KEYS) {
            if (key === 'pointermove') {
                this.#interactor.addEventListener('pointermove', this.#onPointerMove);
            } else {
                this.#interactor.addEventListener(key, this.#handlePointerEvent);
            }
        }
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        for (const key of POINTER_EVENT_KEYS) {
            if (key === 'pointermove') {
                this.#interactor.removeEventListener('pointermove', this.#onPointerMove);
            } else {
                this.#interactor.removeEventListener(key, this.#handlePointerEvent);
            }
        }

        this.#interactor.removeEventListener('change', this.#onObjectsUpdate);
    }

    /**
     * Gets the object which the pointer is currently over.
     * 
     * @returns {?T} The hovered object, if any.
     */
    #getHoveredObj() {
        const { groups, raycaster } = this;

        for (const group of groups.iterGroups()) {
            const hoveredObj = group.raycast(raycaster);
            if (hoveredObj) return hoveredObj;
        }

        return null;
    }
}

/**
 * @template T The type of object to select.
 * @typedef {object} _SelectEventMap
 * @property {{ object: T }} selectin The event when an object is starting to be selected.
 * @property {{ object: T }} selectout The event when an object has finished being selected.
 */

/**
 * Defines each event that can be dispatched by {@link SelectController}.
 * 
 * @template T The type of object to select.
 * @typedef {HoverControllerEventMap<T> & _SelectEventMap<T>} SelectControllerEventMap
 */

/**
 * Enables a pointer device to select an object in a {@link SceneWindow}
 * by hovering over and clicking on it.
 * 
 * Note that if multiple instances of this class are attached to the same window,
 * they will receive pointer events independently. To avoid duplicate interactions,
 * the object groups assigned to each instance should be non-overlapping.
 * 
 * @template T The type of object to select.
 * @augments THREE.EventDispatcher<SelectControllerEventMap<T>>
 */
export class SelectController extends THREE.EventDispatcher {

    /**
     * Hovers over the available objects.
     * 
     * @readonly
     * @type {HoverController<T>}
     */
    #hoverer;

    /**
     * Contains the objects to interact with.
     * 
     * @type {SceneWindow}
     */
    get window() { return this.#hoverer.window; }

    /**
     * Contains the objects to interact with.
     * 
     * @type {OmitEvents<SceneObjectsGroups<T>>}
     */
    get groups() { return this.#hoverer.groups; }

    /**
     * Raycasts the pointer to each object.
     * 
     * @type {THREE.Raycaster}
     */
    get raycaster() { return this.#hoverer.raycaster; }

    /**
     * Whether the hovered object is updated automatically when the pointer is moved.
     * In any case, it can be set manually.
     * 
     * Note that the currently hovered object is un-hovered upon setting this to `false`.
     * 
     * @type {boolean}
     */
    get hoverEnabled() { return this.#hoverer.hoverEnabled; }

    set hoverEnabled(value) { this.#hoverer.hoverEnabled = value; }

    /**
     * A view of the object that is being hovered over, if any.
     * 
     * Changes to the object are reflected in the view, and vice-versa.
     * 
     * @type {?T}
     */
    get hoveredObj() { return this.#hoverer.hoveredObj; }

    set hoveredObj(value) { this.#hoverer.hoveredObj = value; }

    /**
     * Whether an object is being hovered over.
     * 
     * @type {boolean}
     */
    get isHoveringObj() { return this.#hoverer.isHoveringObj; }

    /**
     * @type {boolean}
     */
    #selectEnabled = true;

    /**
     * Whether the selected object is updated automatically when the pointer is activated.
     * In any case, it can be set manually.
     * 
     * Note that the currently selected object remains selected upon setting this to `false`.
     * 
     * @type {boolean}
     */
    get selectEnabled() { return this.#selectEnabled; }

    set selectEnabled(value) {
        if (this.#selectEnabled !== value) {
            this.#selectEnabled = value;

            // if (!value) {
            //     this.selectedObj = null;
            // }
        }
    }

    /**
     * @type {?T}
     */
    #selectedObj = null;

    /**
     * A view of the object that is being selected, if any.
     * 
     * Changes to the object are reflected in the view, and vice-versa.
     * 
     * @type {?T}
     */
    get selectedObj() { return this.#selectedObj; }

    set selectedObj(value) {
        const prevSelectedObj = this.selectedObj;
        if (prevSelectedObj !== value) {
            this.#selectedObj = value;

            if (prevSelectedObj != null) {
                this.dispatchEvent({
                    type: 'selectout',
                    object: prevSelectedObj,
                });
            }

            if (value != null) {
                if (!this.groups.has(value)) {
                    console.warn('This picker does not interact with the object to select');
                }

                this.dispatchEvent({
                    type: 'selectin',
                    object: value,
                });
            }
        }
    }

    /**
     * Whether an object is being selected.
     * 
     * @type {boolean}
     */
    get hasSelectedObj() { return this.#selectedObj != null; }

    /**
     * @type {(event: HoverControllerEventMap<T>['hoverin']) => void}
     */
    #onHoverIn = (event) => {
        this.dispatchEvent({ type: 'hoverin', object: event.object });
    };

    /**
     * @type {(event: HoverControllerEventMap<T>['hoverout']) => void}
     */
    #onHoverOut = (event) => {
        this.dispatchEvent({ type: 'hoverout', object: event.object });
    };

    /**
     * @type {(event: ScenePointerEvent) => void}
     */
    #onPointerDown = (event) => {
        if (!this.selectEnabled) return;

        if (event.button === 0) {
            this.selectedObj = this.#hoverer.hoveredObj;
        }

        this.dispatchEvent(_.assignIn({}, event));
    };

    /**
     * @type {(event: ScenePointerEvent) => void}
     */
    #handlePointerEvent = (event) => {
        this.dispatchEvent(_.assignIn({}, event));
    };

    /**
     * @type {(event: HoverControllerEventMap<T>['change']) => void}
     */
    #onObjectsUpdate = (event) => {
        if (!this.selectEnabled) return;

        this.selectedObj = this.#hoverer.hoveredObj;

        this.dispatchEvent({ type: 'change' });
    };

    /**
     * Creates a new helper to enable a pointer to select from groups of objects.
     * 
     * @param {HoverController<T>} hoverer The object to listen for hover events.
     */
    constructor(hoverer) {
        super();

        this.#hoverer = hoverer;
        this.#hoverer.addEventListener('hoverin', this.#onHoverIn);
        this.#hoverer.addEventListener('hoverout', this.#onHoverOut);
        this.#hoverer.addEventListener('change', this.#onObjectsUpdate);

        for (const key of POINTER_EVENT_KEYS) {
            if (key === 'pointerdown') {
                this.#hoverer.addEventListener('pointerdown', this.#onPointerDown);
            } else {
                this.#hoverer.addEventListener(key, this.#handlePointerEvent);
            }
        }
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        for (const key of POINTER_EVENT_KEYS) {
            if (key === 'pointerdown') {
                this.#hoverer.removeEventListener('pointerdown', this.#onPointerDown);
            } else {
                this.#hoverer.removeEventListener(key, this.#handlePointerEvent);
            }
        }

        this.#hoverer.removeEventListener('change', this.#onObjectsUpdate);
        this.#hoverer.removeEventListener('hoverin', this.#onHoverIn);
        this.#hoverer.removeEventListener('hoverout', this.#onHoverOut);
    }
}

/**
 * @template T The type of object to drag.
 * @typedef {object} _DragEventMap
 * @property {{ object: T }} dragin The event when an object is starting to be dragged.
 * @property {{ object: T }} dragout The event when an object has finished being dragged.
 */

/**
 * Defines each event that can be dispatched by {@link DragController}.
 * 
 * @template T The type of object to hover over.
 * @typedef {HoverControllerEventMap<T> & _DragEventMap<T>} DragControllerEventMap
 */

/**
 * Enables a pointer device to drag an object in a {@link SceneWindow}
 * by hovering over and click-and-holding on it.
 * 
 * Note that if multiple instances of this class are attached to the same window,
 * they will receive pointer events independently. To avoid duplicate interactions,
 * the object groups assigned to each instance should be non-overlapping.
 * 
 * @template T The type of object to drag.
 * @augments THREE.EventDispatcher<DragControllerEventMap<T>>
 */
export class DragController extends THREE.EventDispatcher {

    /**
     * Hovers over the available objects.
     * 
     * @readonly
     * @type {HoverController<T>}
     */
    #hoverer;

    /**
     * Contains the objects to interact with.
     * 
     * @type {SceneWindow}
     */
    get window() { return this.#hoverer.window; }

    /**
     * Contains the objects to interact with.
     * 
     * @type {OmitEvents<SceneObjectsGroups<T>>}
     */
    get groups() { return this.#hoverer.groups; }

    /**
     * Raycasts the pointer to each object.
     * 
     * @type {THREE.Raycaster}
     */
    get raycaster() { return this.#hoverer.raycaster; }

    /**
     * Whether the hovered object is updated automatically when the pointer is moved.
     * In any case, it can be set manually.
     * 
     * Note that the currently hovered object is un-hovered upon setting this to `false`.
     * 
     * @type {boolean}
     */
    get hoverEnabled() { return this.#hoverer.hoverEnabled; }

    set hoverEnabled(value) { this.#hoverer.hoverEnabled = value; }

    /**
     * A view of the object that is being hovered over, if any.
     * 
     * Changes to the object are reflected in the view, and vice-versa.
     * 
     * @type {?T}
     */
    get hoveredObj() { return this.#hoverer.hoveredObj; }

    set hoveredObj(value) { this.#hoverer.hoveredObj = value; }

    /**
     * Whether an object is being hovered over.
     * 
     * @type {boolean}
     */
    get isHoveringObj() { return this.#hoverer.isHoveringObj; }

    /**
     * @type {boolean}
     */
    #dragEnabled = true;

    /**
     * Whether the dragged object is updated automatically when the pointer is activated.
     * In any case, it can be set manually.
     * 
     * Note that the currently dragged object is un-dragged upon setting this to `false`.
     * 
     * @type {boolean}
     */
    get dragEnabled() { return this.#dragEnabled; }

    set dragEnabled(value) {
        if (this.#dragEnabled !== value) {
            this.#dragEnabled = value;

            if (!value) {
                this.draggedObj = null;
            }
        }
    }

    /**
     * @type {?T}
     */
    #draggedObj = null;

    /**
     * A view of the object that is being dragged, if any.
     * 
     * Changes to the object are reflected in the view, and vice-versa.
     * 
     * @type {?T}
     */
    get draggedObj() { return this.#draggedObj; }

    set draggedObj(value) {
        const prevDraggedObj = this.draggedObj;
        if (prevDraggedObj !== value) {
            this.#draggedObj = value;

            if (prevDraggedObj != null) {
                this.dispatchEvent({
                    type: 'dragout',
                    object: prevDraggedObj,
                });
            }

            if (value != null) {
                if (!this.groups.has(value)) {
                    console.warn('This picker does not interact with the object to select');
                }

                this.dispatchEvent({
                    type: 'dragin',
                    object: value,
                });
            }
        }
    }

    /**
     * Whether an object is being dragged.
     * 
     * @type {boolean}
     */
    get hasDraggedObj() { return this.#draggedObj != null; }

    /**
     * @type {(event: HoverControllerEventMap<T>['hoverin']) => void}
     */
    #onHoverIn = (event) => {
        this.dispatchEvent({ type: 'hoverin', object: event.object });
    };

    /**
     * @type {(event: HoverControllerEventMap<T>['hoverout']) => void}
     */
    #onHoverOut = (event) => {
        this.dispatchEvent({ type: 'hoverout', object: event.object });
    };

    /**
     * @type {(event: ScenePointerEvent) => void}
     */
    #onPointerDown = (event) => {
        if (!this.dragEnabled) return;

        if (event.button === 0) {
            this.draggedObj = this.#hoverer.hoveredObj;
        }

        this.dispatchEvent(_.assignIn({}, event));
    };

    /**
     * @type {(event: ScenePointerEvent) => void}
     */
    #onPointerUp = (event) => {
        if (!this.dragEnabled) return;

        if (event.button === 0) {
            this.draggedObj = null;
        }

        this.dispatchEvent(_.assignIn({}, event));
    };

    /**
     * @type {(event: ScenePointerEvent) => void}
     */
    #handlePointerEvent = (event) => {
        this.dispatchEvent(_.assignIn({}, event));
    };

    /**
     * @type {(event: HoverControllerEventMap<T>['change']) => void}
     */
    #onObjectsUpdate = (event) => {
        if (!this.dragEnabled) return;

        this.draggedObj = this.#hoverer.hoveredObj;

        this.dispatchEvent({ type: 'change' });
    };

    /**
     * Creates a new helper to enable a pointer to drag an existing set of objects.
     * 
     * @param {HoverController<T>} hoverer The object to listen for hover events.
     */
    constructor(hoverer) {
        super();

        this.#hoverer = hoverer;
        this.#hoverer.addEventListener('hoverin', this.#onHoverIn);
        this.#hoverer.addEventListener('hoverout', this.#onHoverOut);
        this.#hoverer.addEventListener('change', this.#onObjectsUpdate);

        for (const key of POINTER_EVENT_KEYS) {
            if (key === 'pointerdown') {
                this.#hoverer.addEventListener('pointerdown', this.#onPointerDown);
            } else if (key === 'pointerup') {
                this.#hoverer.addEventListener('pointerup', this.#onPointerUp);
            } else {
                this.#hoverer.addEventListener(key, this.#handlePointerEvent);
            }
        }
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        for (const key of POINTER_EVENT_KEYS) {
            if (key === 'pointerdown') {
                this.#hoverer.removeEventListener('pointerdown', this.#onPointerDown);
            } else if (key === 'pointerup') {
                this.#hoverer.removeEventListener('pointerup', this.#onPointerUp);
            } else {
                this.#hoverer.removeEventListener(key, this.#handlePointerEvent);
            }
        }

        this.#hoverer.removeEventListener('change', this.#onObjectsUpdate);
        this.#hoverer.removeEventListener('hoverin', this.#onHoverIn);
        this.#hoverer.removeEventListener('hoverout', this.#onHoverOut);
    }
}

/**
 * @template T The type of object to interact with.
 * @typedef {object} InteractorParams
 * @property {GroupItems<T>} [groups=[]] An array containing each group and its
 * corresponding priority to include in the collection.
 * A shallow copy of this array is made to this object.
 * @property {THREE.Raycaster} [raycaster] Raycasts the pointer to each object.
 * Defaults to a new raycaster.
 */

/**
 * Represents a pointer that is used to interact with a {@link SceneWindow}.
 */
export class WindowPointer {

    /**
     * The window to listen for pointer events.
     * 
     * @readonly
     * @type {SceneWindow}
     */
    window;

    /**
     * @type {Set<SceneObjectsGroups<any>>}
     */
    #instancesGroups = new Set();

    /**
     * Tests whether a collection of groups can already be interacted with in the
     * {@link SceneWindow} associated with this object.
     * 
     * @param {ReadonlyArray<SceneObjectsGroup<any>>} groups The query collection of groups.
     * @returns {boolean} `true` if the collection can already be interacted with;
     * otherwise, `false`.
     */
    #isGroupRegistered(groups) {
        const existingGroups = [...this.#instancesGroups].flatMap((gs) => [...gs.iterGroups()]);

        return _.intersection(existingGroups, groups).length > 0;
    }

    /**
     * Creates a new helper instance for a pointer device to interact with a {@link SceneWindow}.
     * 
     * @param {SceneWindow} window The window to listen for pointer events.
     */
    constructor(window) {
        this.window = window;
    }

    /**
     * Creates a new helper class that is used to interact with groups of objects in the
     * {@link SceneWindow} associated with this object.
     * 
     * Note that if multiple instances of an interactor are attached to the same window,
     * they will receive pointer events independently. To avoid duplicate interactions,
     * the object groups assigned to each instance should be non-overlapping.
     * 
     * You are responsible for disposing interactors created through this method.
     * 
     * @template T the type of object to interact with.
     * @param {InteractorParams<T>} params Parameters to pass to the interactor.
     * @returns {InteractController<T>} The newly created controller.
     */
    createInteractor(params) {
        const groups = params.groups ?? [];
        const raycaster = params.raycaster ?? new THREE.Raycaster();

        const groupsArr = groups.map(({ group }) => group);
        if (this.#isGroupRegistered(groupsArr)) {
            console.warn(groupsArr);
            console.warn('Found duplicate group being interacted with in window');
        }

        const groupsObj = new SceneObjectsGroups(groups);

        const interactor = new InteractController(this.window, groupsObj, raycaster);

        this.#instancesGroups.add(groupsObj);

        return interactor;
    }

    /**
     * Creates a new helper class that is used to interact with groups of objects in the
     * {@link SceneWindow} associated with this object.
     * 
     * Note that if multiple instances of an interactor are attached to the same window,
     * they will receive pointer events independently. To avoid duplicate interactions,
     * the object groups assigned to each instance should be non-overlapping.
     * 
     * You are responsible for disposing interactors created through this method.
     * 
     * @template T The type of object to interact with.
     * @param {InteractorParams<T>} params Parameters to pass to the interactor.
     * @returns {HoverController<T>} The newly created controller.
     */
    createHoverController(params) {
        const interactor = this.createInteractor(params);

        return new HoverController(interactor);
    }

    /**
     * Creates a new helper class that is used to interact with groups of objects in the
     * {@link SceneWindow} associated with this object.
     * 
     * Note that if multiple instances of an interactor are attached to the same window,
     * they will receive pointer events independently. To avoid duplicate interactions,
     * the object groups assigned to each instance should be non-overlapping.
     * 
     * You are responsible for disposing interactors created through this method.
     * 
     * @template T the type of object to interact with.
     * @param {InteractorParams<T>} params Parameters to pass to the interactor.
     * @returns {SelectController<T>} The newly created controller.
     */
    createSelectController(params) {
        const hoverer = this.createHoverController(params);

        return new SelectController(hoverer);
    }

    /**
     * Creates a new helper class that is used to interact with groups of objects in the
     * {@link SceneWindow} associated with this object.
     * 
     * Note that if multiple instances of an interactor are attached to the same window,
     * they will receive pointer events independently. To avoid duplicate interactions,
     * the object groups assigned to each instance should be non-overlapping.
     * 
     * You are responsible for disposing interactors created through this method.
     * 
     * @template T The type of object to interact with.
     * @param {InteractorParams<T>} params Parameters to pass to the interactor.
     * @returns {DragController<T>} The newly created controller.
     */
    createDragController(params) {
        const hoverer = this.createHoverController(params);

        return new DragController(hoverer);
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#instancesGroups.clear();
    }
}
