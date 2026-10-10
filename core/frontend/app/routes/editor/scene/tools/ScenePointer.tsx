import _ from "lodash";
import * as THREE from "three";

import { ThreeUtils } from "sta/common";
import type { Expand } from "sta/common";

import { POINTER_EVENT_KEYS } from "../display";
import type {
  ScenePointerEvent,
  ScenePointerEventMap,
  SceneWindow,
} from "../display/SceneWindow.tsx";

import {
  type GroupItem,
  type SceneObjectsGroup,
  SceneObjectsGroups,
  type GroupItems,
} from "./SceneObjects";

export interface _InteractChangeEventMap {
  change: {};
}
export type InteractControllerEventMap = Expand<
  ScenePointerEventMap & _InteractChangeEventMap
>;

export interface InteractorParams<T> {
  groups?: GroupItems<T>;
  raycaster?: THREE.Raycaster;
}

/**
 * Enables a pointer device to interact with groups of objects in a {@link SceneWindow}.
 *
 * Note that if multiple instances of this class are attached to the same window,
 * they will receive pointer events independently. To avoid duplicate interactions,
 * the object groups assigned to each instance should be non-overlapping.
 */
export class InteractController<
  T = unknown,
> extends THREE.EventDispatcher<InteractControllerEventMap> {
  /**
   * The window to listen for pointer events.
   */
  #window: SceneWindow;

  /**
   * Contains the objects to interact with.
   */
  get window() {
    return this.#window;
  }

  /**
   * Contains the objects to interact with.
   */
  #groups: SceneObjectsGroups<T>;

  /**
   * Contains the objects to interact with.
   */
  get groups() {
    return this.#groups;
  }

  /**
   * Raycasts the pointer to each object.
   */
  #raycaster: THREE.Raycaster;

  #activePointerId: number | null = null;

  #disposed = false;

  readonly #onDispose?: () => void;

  /**
   * Raycasts the pointer to each object.
   */
  get raycaster() {
    return this.#raycaster;
  }

  set raycaster(value: THREE.Raycaster) {
    if (this.#raycaster !== value) {
      this.#raycaster = value;

      this.dispatchEvent({ type: "change" });
    }
  }

  #handlePointerEvent = (event: ScenePointerEvent) => {
    if (this.#disposed) return;

    if (event.type === "pointerdown") {
      if (
        this.#activePointerId != null &&
        event.pointerId !== this.#activePointerId
      )
        return;
      this.#activePointerId = event.pointerId;
    } else if (
      this.#activePointerId != null &&
      event.pointerId !== this.#activePointerId
    ) {
      // One interactor owns one gesture. Unrelated pointers must not move its
      // raycaster or reach drag/select state while that gesture is active.
      return;
    }

    const { window: sceneWindow, raycaster } = this;

    ThreeUtils.updateRaycaster(
      raycaster,
      sceneWindow.getCamera(),
      sceneWindow.dom,
      event,
    );

    this.dispatchEvent(_.assignIn({}, event));

    if (
      this.#activePointerId === event.pointerId &&
      (event.type === "pointerup" ||
        event.type === "pointercancel" ||
        event.type === "lostpointercapture")
    ) {
      this.#activePointerId = null;
    }
  };

  #onObjectsUpdate = (event: { type: "change" }) => {
    this.dispatchEvent({ type: "change" });
  };

  /**
   * Creates a new helper for a pointer device to interact with groups of objects.
   */
  constructor(
    sceneWindow: SceneWindow,
    groups: SceneObjectsGroups<T>,
    raycaster: THREE.Raycaster,
    onDispose?: () => void,
  ) {
    super();

    this.#window = sceneWindow;
    this.#groups = groups;
    this.#raycaster = raycaster;
    this.#onDispose = onDispose;

    this.#groups.addEventListener("change", this.#onObjectsUpdate);

    for (const key of POINTER_EVENT_KEYS) {
      this.#window.pointerEvents.addEventListener(
        key,
        this.#handlePointerEvent,
      );
    }
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#activePointerId = null;
    this.#groups.removeEventListener("change", this.#onObjectsUpdate);

    for (const key of POINTER_EVENT_KEYS) {
      this.#window.pointerEvents.removeEventListener(
        key,
        this.#handlePointerEvent,
      );
    }
    this.#onDispose?.();
  }
}

export interface _HoverEventMap<T> {
  hoverin: { object: T };
  hoverout: { object: T };
}
export type HoverControllerEventMap<T> = Expand<
  InteractControllerEventMap & _HoverEventMap<T>
>;

/**
 * Enables a pointer device to hover over groups of objects in a {@link SceneWindow}.
 *
 * Note that if multiple instances of this class are attached to the same window,
 * they will receive pointer events independently. To avoid duplicate interactions,
 * the object groups assigned to each instance should be non-overlapping.
 */
export class HoverController<T = unknown> extends THREE.EventDispatcher<
  HoverControllerEventMap<T>
> {
  /**
   * The object to listen for interaction events.
   */
  #interactor: InteractController<T>;

  readonly #ownsInteractor: boolean;

  #disposed = false;

  /**
   * Contains the objects to interact with.
   */
  get window() {
    return this.#interactor.window;
  }

  /**
   * Contains the objects to interact with.
   */
  get groups() {
    return this.#interactor.groups;
  }

  /**
   * Raycasts the pointer to each object.
   */
  get raycaster() {
    return this.#interactor.raycaster;
  }

  #hoverEnabled = true;

  /**
   * Whether the hovered object is updated automatically when the pointer is moved.
   * In any case, it can be set manually.
   *
   * Note that the currently hovered object is un-hovered upon setting this to `false`.
   */
  get hoverEnabled() {
    return this.#hoverEnabled;
  }

  set hoverEnabled(value: boolean) {
    if (this.#hoverEnabled !== value) {
      this.#hoverEnabled = value;

      if (!value) {
        this.hoveredObj = null;
      }
    }
  }

  #hoveredObj: T | null = null;

  /**
   * A view of the object that is being hovered over, if any.
   *
   * Changes to the object are reflected in the view, and vice-versa.
   */
  get hoveredObj() {
    return this.#hoveredObj;
  }

  set hoveredObj(value: T | null) {
    const prevHoveredObj = this.hoveredObj;
    if (prevHoveredObj !== value) {
      this.#hoveredObj = value;

      if (prevHoveredObj != null) {
        this.dispatchEvent({
          type: "hoverout",
          object: prevHoveredObj,
        });
      }

      if (value != null) {
        if (!this.groups.has(value)) {
          console.warn(
            "This picker does not interact with the object to hover over",
          );
        }

        this.dispatchEvent({
          type: "hoverin",
          object: value,
        });
      }
    }
  }

  /**
   * Whether an object is being hovered over.
   */
  get isHoveringObj() {
    return this.#hoveredObj != null;
  }

  #onPointerMove = (event: ScenePointerEvent) => {
    if (!this.hoverEnabled) return;

    this.hoveredObj = this.#getHoveredObj();

    this.dispatchEvent(_.assignIn({}, event));
  };

  #handlePointerEvent = (event: ScenePointerEvent) => {
    this.dispatchEvent(_.assignIn({}, event));
  };

  #onObjectsUpdate = (event: InteractControllerEventMap["change"]) => {
    if (!this.hoverEnabled) return;

    this.hoveredObj = this.#getHoveredObj();

    this.dispatchEvent({ type: "change" });
  };

  /**
   * Creates a new helper for a pointer to hover over groups of objects.
   */
  constructor(interactor: InteractController<T>, ownsInteractor = false) {
    super();

    this.#interactor = interactor;
    this.#ownsInteractor = ownsInteractor;
    this.#interactor.addEventListener("change", this.#onObjectsUpdate);

    for (const key of POINTER_EVENT_KEYS) {
      if (key === "pointermove") {
        this.#interactor.addEventListener("pointermove", this.#onPointerMove);
      } else {
        this.#interactor.addEventListener(key, this.#handlePointerEvent);
      }
    }
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.hoveredObj = null;
    for (const key of POINTER_EVENT_KEYS) {
      if (key === "pointermove") {
        this.#interactor.removeEventListener(
          "pointermove",
          this.#onPointerMove,
        );
      } else {
        this.#interactor.removeEventListener(key, this.#handlePointerEvent);
      }
    }

    this.#interactor.removeEventListener("change", this.#onObjectsUpdate);
    if (this.#ownsInteractor) this.#interactor.dispose();
  }

  /**
   * Gets the object which the pointer is currently over.
   */
  #getHoveredObj(): T | null {
    const { groups, raycaster } = this;

    for (const group of groups.iterGroups()) {
      const hoveredObj = group.raycast(raycaster);
      if (hoveredObj) return hoveredObj;
    }

    return null;
  }
}

export interface _SelectEventMap<T> {
  selectin: { object: T };
  selectout: { object: T };
}
export type SelectControllerEventMap<T> = HoverControllerEventMap<T> &
  _SelectEventMap<T>;

/**
 * Enables a pointer device to select an object in a {@link SceneWindow}
 * by hovering over and clicking on it.
 *
 * Note that if multiple instances of this class are attached to the same window,
 * they will receive pointer events independently. To avoid duplicate interactions,
 * the object groups assigned to each instance should be non-overlapping.
 */
export class SelectController<T = unknown> extends THREE.EventDispatcher<
  SelectControllerEventMap<T>
> {
  /**
   * Hovers over the available objects.
   */
  #hoverer: HoverController<T>;

  readonly #ownsHoverer: boolean;

  #disposed = false;

  /**
   * Contains the objects to interact with.
   */
  get window() {
    return this.#hoverer.window;
  }

  /**
   * Contains the objects to interact with.
   */
  get groups() {
    return this.#hoverer.groups;
  }

  /**
   * Raycasts the pointer to each object.
   */
  get raycaster() {
    return this.#hoverer.raycaster;
  }

  /**
   * Whether the hovered object is updated automatically when the pointer is moved.
   * In any case, it can be set manually.
   *
   * Note that the currently hovered object is un-hovered upon setting this to `false`.
   */
  get hoverEnabled() {
    return this.#hoverer.hoverEnabled;
  }

  set hoverEnabled(value: boolean) {
    this.#hoverer.hoverEnabled = value;
  }

  /**
   * A view of the object that is being hovered over, if any.
   *
   * Changes to the object are reflected in the view, and vice-versa.
   */
  get hoveredObj() {
    return this.#hoverer.hoveredObj;
  }

  set hoveredObj(value: T | null) {
    this.#hoverer.hoveredObj = value;
  }

  /**
   * Whether an object is being hovered over.
   */
  get isHoveringObj() {
    return this.#hoverer.isHoveringObj;
  }

  #selectEnabled = true;

  /**
   * Whether the selected object is updated automatically when the pointer is activated.
   * In any case, it can be set manually.
   *
   * Note that the currently selected object remains selected upon setting this to `false`.
   */
  get selectEnabled() {
    return this.#selectEnabled;
  }

  set selectEnabled(value: boolean) {
    if (this.#selectEnabled !== value) {
      this.#selectEnabled = value;
    }
  }

  #selectedObj: T | null = null;

  /**
   * A view of the object that is being selected, if any.
   *
   * Changes to the object are reflected in the view, and vice-versa.
   */
  get selectedObj() {
    return this.#selectedObj;
  }

  set selectedObj(value: T | null) {
    const prevSelectedObj = this.selectedObj;
    if (prevSelectedObj !== value) {
      this.#selectedObj = value;

      if (prevSelectedObj != null) {
        this.dispatchEvent({
          type: "selectout",
          object: prevSelectedObj,
        });
      }

      if (value != null) {
        if (!this.groups.has(value)) {
          console.warn(
            "This picker does not interact with the object to select",
          );
        }

        this.dispatchEvent({
          type: "selectin",
          object: value,
        });
      }
    }
  }

  /**
   * Whether an object is being selected.
   */
  get hasSelectedObj() {
    return this.#selectedObj != null;
  }

  #onHoverIn = (event: HoverControllerEventMap<T>["hoverin"]) => {
    this.dispatchEvent({ type: "hoverin", object: event.object });
  };

  #onHoverOut = (event: HoverControllerEventMap<T>["hoverout"]) => {
    this.dispatchEvent({ type: "hoverout", object: event.object });
  };

  #onPointerDown = (event: ScenePointerEvent) => {
    if (!this.selectEnabled) return;

    if (event.button === 0) {
      this.selectedObj = this.#hoverer.hoveredObj;
    }

    this.dispatchEvent(_.assignIn({}, event));
  };

  #handlePointerEvent = (event: ScenePointerEvent) => {
    this.dispatchEvent(_.assignIn({}, event));
  };

  #onObjectsUpdate = (event: HoverControllerEventMap<T>["change"]) => {
    if (!this.selectEnabled) return;

    this.selectedObj = this.#hoverer.hoveredObj;

    this.dispatchEvent({ type: "change" });
  };

  /**
   * Creates a new helper to enable a pointer to select from groups of objects.
   */
  constructor(hoverer: HoverController<T>, ownsHoverer = false) {
    super();

    this.#hoverer = hoverer;
    this.#ownsHoverer = ownsHoverer;
    this.#hoverer.addEventListener("hoverin", this.#onHoverIn);
    this.#hoverer.addEventListener("hoverout", this.#onHoverOut);
    this.#hoverer.addEventListener("change", this.#onObjectsUpdate);

    for (const key of POINTER_EVENT_KEYS) {
      if (key === "pointerdown") {
        this.#hoverer.addEventListener("pointerdown", this.#onPointerDown);
      } else {
        this.#hoverer.addEventListener(key, this.#handlePointerEvent);
      }
    }
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const key of POINTER_EVENT_KEYS) {
      if (key === "pointerdown") {
        this.#hoverer.removeEventListener("pointerdown", this.#onPointerDown);
      } else {
        this.#hoverer.removeEventListener(key, this.#handlePointerEvent);
      }
    }

    this.#hoverer.removeEventListener("change", this.#onObjectsUpdate);
    this.#hoverer.removeEventListener("hoverin", this.#onHoverIn);
    this.#hoverer.removeEventListener("hoverout", this.#onHoverOut);
    if (this.#ownsHoverer) this.#hoverer.dispose();
  }
}

export interface _DragEventMap<T> {
  dragin: { object: T };
  dragout: { object: T };
}
export type DragControllerEventMap<T> = HoverControllerEventMap<T> &
  _DragEventMap<T>;

/**
 * Enables a pointer device to drag an object in a {@link SceneWindow}
 * by hovering over and click-and-holding on it.
 *
 * Note that if multiple instances of this class are attached to the same window,
 * they will receive pointer events independently. To avoid duplicate interactions,
 * the object groups assigned to each instance should be non-overlapping.
 */
export class DragController<T = unknown> extends THREE.EventDispatcher<
  DragControllerEventMap<T>
> {
  /**
   * Hovers over the available objects.
   */
  #hoverer: HoverController<T>;

  readonly #ownsHoverer: boolean;

  #disposed = false;

  /**
   * Contains the objects to interact with.
   */
  get window() {
    return this.#hoverer.window;
  }

  /**
   * Contains the objects to interact with.
   */
  get groups() {
    return this.#hoverer.groups;
  }

  /**
   * Raycasts the pointer to each object.
   */
  get raycaster() {
    return this.#hoverer.raycaster;
  }

  /**
   * Whether the hovered object is updated automatically when the pointer is moved.
   * In any case, it can be set manually.
   *
   * Note that the currently hovered object is un-hovered upon setting this to `false`.
   */
  get hoverEnabled() {
    return this.#hoverer.hoverEnabled;
  }

  set hoverEnabled(value: boolean) {
    this.#hoverer.hoverEnabled = value;
  }

  /**
   * A view of the object that is being hovered over, if any.
   *
   * Changes to the object are reflected in the view, and vice-versa.
   */
  get hoveredObj() {
    return this.#hoverer.hoveredObj;
  }

  set hoveredObj(value: T | null) {
    this.#hoverer.hoveredObj = value;
  }

  /**
   * Whether an object is being hovered over.
   */
  get isHoveringObj() {
    return this.#hoverer.isHoveringObj;
  }

  #dragEnabled = true;

  /**
   * Whether the dragged object is updated automatically when the pointer is activated.
   * In any case, it can be set manually.
   *
   * Note that the currently dragged object is un-dragged upon setting this to `false`.
   */
  get dragEnabled() {
    return this.#dragEnabled;
  }

  set dragEnabled(value: boolean) {
    if (this.#dragEnabled !== value) {
      this.#dragEnabled = value;

      if (!value) {
        this.draggedObj = null;
      }
    }
  }

  #draggedObj: T | null = null;

  /**
   * A view of the object that is being dragged, if any.
   *
   * Changes to the object are reflected in the view, and vice-versa.
   */
  get draggedObj() {
    return this.#draggedObj;
  }

  set draggedObj(value: T | null) {
    const prevDraggedObj = this.draggedObj;
    if (prevDraggedObj !== value) {
      this.#draggedObj = value;

      if (prevDraggedObj != null) {
        this.dispatchEvent({
          type: "dragout",
          object: prevDraggedObj,
        });
      }

      if (value != null) {
        if (!this.groups.has(value)) {
          console.warn(
            "This picker does not interact with the object to select",
          );
        }

        this.dispatchEvent({
          type: "dragin",
          object: value,
        });
      }
    }
  }

  /**
   * Whether an object is being dragged.
   */
  get hasDraggedObj() {
    return this.#draggedObj != null;
  }

  #onHoverIn = (event: HoverControllerEventMap<T>["hoverin"]) => {
    this.dispatchEvent({ type: "hoverin", object: event.object });
  };

  #onHoverOut = (event: HoverControllerEventMap<T>["hoverout"]) => {
    this.dispatchEvent({ type: "hoverout", object: event.object });
  };

  #onPointerDown = (event: ScenePointerEvent) => {
    if (!this.dragEnabled) return;

    if (event.button === 0) {
      this.draggedObj = this.#hoverer.hoveredObj;
    }

    this.dispatchEvent(_.assignIn({}, event));
  };

  #onPointerUp = (event: ScenePointerEvent) => {
    if (!this.dragEnabled) return;

    if (event.button === 0) {
      this.draggedObj = null;
    }

    this.dispatchEvent(_.assignIn({}, event));
  };

  #onPointerCancel = (event: ScenePointerEvent) => {
    if (!this.dragEnabled) return;
    this.draggedObj = null;
    this.dispatchEvent(_.assignIn({}, event));
  };

  #handlePointerEvent = (event: ScenePointerEvent) => {
    this.dispatchEvent(_.assignIn({}, event));
  };

  #onObjectsUpdate = (event: HoverControllerEventMap<T>["change"]) => {
    if (!this.dragEnabled) return;

    this.draggedObj = this.#hoverer.hoveredObj;

    this.dispatchEvent({ type: "change" });
  };

  /**
   * Creates a new helper to enable a pointer to drag an existing set of objects.
   */
  constructor(hoverer: HoverController<T>, ownsHoverer = false) {
    super();

    this.#hoverer = hoverer;
    this.#ownsHoverer = ownsHoverer;
    this.#hoverer.addEventListener("hoverin", this.#onHoverIn);
    this.#hoverer.addEventListener("hoverout", this.#onHoverOut);
    this.#hoverer.addEventListener("change", this.#onObjectsUpdate);

    for (const key of POINTER_EVENT_KEYS) {
      if (key === "pointerdown") {
        this.#hoverer.addEventListener("pointerdown", this.#onPointerDown);
      } else if (key === "pointerup") {
        this.#hoverer.addEventListener("pointerup", this.#onPointerUp);
      } else if (key === "pointercancel" || key === "lostpointercapture") {
        this.#hoverer.addEventListener(key, this.#onPointerCancel);
      } else {
        this.#hoverer.addEventListener(key, this.#handlePointerEvent);
      }
    }
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.draggedObj = null;
    for (const key of POINTER_EVENT_KEYS) {
      if (key === "pointerdown") {
        this.#hoverer.removeEventListener("pointerdown", this.#onPointerDown);
      } else if (key === "pointerup") {
        this.#hoverer.removeEventListener("pointerup", this.#onPointerUp);
      } else if (key === "pointercancel" || key === "lostpointercapture") {
        this.#hoverer.removeEventListener(key, this.#onPointerCancel);
      } else {
        this.#hoverer.removeEventListener(key, this.#handlePointerEvent);
      }
    }

    this.#hoverer.removeEventListener("change", this.#onObjectsUpdate);
    this.#hoverer.removeEventListener("hoverin", this.#onHoverIn);
    this.#hoverer.removeEventListener("hoverout", this.#onHoverOut);
    if (this.#ownsHoverer) this.#hoverer.dispose();
  }
}

/**
 * Represents a pointer that is used to interact with a {@link SceneWindow}.
 */
export class WindowPointer {
  /**
   * The window to listen for pointer events.
   */
  window: SceneWindow;

  // The set is intentionally heterogeneous: each registered interactor can
  // manage groups of a different object type.
  #instancesGroups = new Set<SceneObjectsGroups<any>>();

  #interactors = new Set<InteractController<any>>();

  /**
   * Tests whether a collection of groups can already be interacted with through this
   * {@link SceneWindow} associated with this object.
   */
  #isGroupRegistered<T>(groups: readonly SceneObjectsGroup<T>[]): boolean {
    const existingGroups = [...this.#instancesGroups].flatMap(
      (gs: SceneObjectsGroups<any>) => [...gs.iterGroups()],
    );

    return _.intersection(existingGroups, groups).length > 0;
  }

  /**
   * Creates a new helper instance for a pointer device to interact with a {@link SceneWindow}.
   */
  constructor(sceneWindow: SceneWindow) {
    this.window = sceneWindow;
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
   */
  createInteractor<T>(params: InteractorParams<T>): InteractController<T> {
    const groups = params.groups ?? [];
    const raycaster = params.raycaster ?? new THREE.Raycaster();

    const groupsArr = groups.map(({ group }: GroupItem<T>) => group);
    if (this.#isGroupRegistered(groupsArr)) {
      console.warn(groupsArr);
      console.warn("Found duplicate group being interacted with in window");
    }

    const groupsObj = new SceneObjectsGroups(groups);

    const interactor = new InteractController(
      this.window,
      groupsObj,
      raycaster,
      () => {
        this.#instancesGroups.delete(groupsObj);
        this.#interactors.delete(interactor);
      },
    );

    this.#instancesGroups.add(groupsObj);
    this.#interactors.add(interactor);

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
   */
  createHoverController<T>(params: InteractorParams<T>): HoverController<T> {
    const interactor = this.createInteractor(params);

    return new HoverController(interactor, true);
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
   */
  createSelectController<T>(params: InteractorParams<T>): SelectController<T> {
    const hoverer = this.createHoverController(params);

    return new SelectController(hoverer, true);
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
   */
  createDragController<T>(params: InteractorParams<T>): DragController<T> {
    const hoverer = this.createHoverController(params);

    return new DragController(hoverer, true);
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose() {
    for (const interactor of [...this.#interactors]) interactor.dispose();
    this.#interactors.clear();
    this.#instancesGroups.clear();
  }
}
