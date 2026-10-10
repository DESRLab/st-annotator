import { assignIn } from "lodash";
import * as THREE from "three";
import type { PickKeys } from "ts-essentials";

import type { Expand } from "sta/common";

export type PointerEventKeys = PickKeys<
  GlobalEventHandlersEventMap,
  PointerEvent
>;

export type ScenePointerEvent = Expand<
  PointerEvent & { type: PointerEventKeys }
>;

export type ScenePointerEventMap = {
  [K in PointerEventKeys]: GlobalEventHandlersEventMap[K];
};

export const POINTER_EVENT_KEYS: readonly (keyof ScenePointerEventMap)[] = [
  "pointermove",
  "gotpointercapture",
  "lostpointercapture",
  "pointercancel",
  "pointerdown",
  "pointerenter",
  "pointerleave",
  "pointerout",
  "pointerover",
  "pointerup",
];

/**
 * Captures and re-emits {@link PointerEvent}s emitted by a DOM element.
 *
 * To function correctly, the pointer events emitted by the DOM element
 * should only be handled directly by an instance of this class.
 *
 */
export class PointerEventsObserver extends THREE.EventDispatcher<ScenePointerEventMap> {
  /**
   * The DOM element observed by this object.
   */
  readonly dom: HTMLElement;

  /**
   * Creates a new object to manage the {@link PointerEvent}s emitted by a DOM element.
   *
   */
  constructor(dom: HTMLElement) {
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

  #handlePointerEvent = (event: PointerEvent) => {
    const { dom } = this;

    // Allows the user to continue dragging an object in the original view
    // even if the pointer moves to another view
    if (event.type === "pointerdown") {
      dom.setPointerCapture(event.pointerId);
    } else if (event.type === "pointerup" || event.type === "pointercancel") {
      dom.releasePointerCapture(event.pointerId);
    }

    this.dispatchEvent(assignIn({}, event) as ScenePointerEvent);

    event.preventDefault();
    event.stopPropagation();
  };
}

/**
 * Defines each event that any scene window can dispatch.
 */
export interface SceneWindowEventMap {
  /**
   * The event when the geometry of this window's DOM element changed in a
   * way that DOM resize observation does not cover (e.g. a position
   * change), so cached layout information may be stale.
   */
  "rect-change": {};
}

/**
 * Interface for objects that represent a window in which a scene is rendered using
 * a separate camera.
 */
export interface SceneWindow extends THREE.EventDispatcher<SceneWindowEventMap> {
  /**
   * The name of this window.
   */
  readonly name: string;

  /**
   * The `three.js` layer of this window; only objects that belong to this layer
   * will be rendered in this window.
   */
  readonly layerId: number;

  /**
   * A DOM element which boundaries define the area in which to render this window.
   *
   * When this window is added to a {@link SceneDisplay}, this element will be
   * added as a child of its canvas.
   */
  readonly dom: HTMLElement;

  /**
   * A handle for other objects to listen to the {@link ScenePointerEvent}s emitted by
   * this window.
   */
  readonly pointerEvents: THREE.EventDispatcher<ScenePointerEventMap>;

  /**
   * Gets the camera used to render this window.
   *
   * This camera should be located in world space,
   * rather than being relative to the current frame.
   *
   * Unlike other attributes of this window, a different camera may be returned
   * each time this is called.
   */
  getCamera(): THREE.Camera;

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose(): void;
}

/**
 * Abstract base implementation of {@link SceneWindow}.
 *
 */
export class BaseSceneWindow<
  TEventMap extends SceneWindowEventMap = SceneWindowEventMap,
>
  extends THREE.EventDispatcher<TEventMap>
  implements SceneWindow
{
  /**
   * The name of this window.
   */
  readonly name: string;

  /**
   * The `three.js` layer of this window; only objects that belong to this layer
   * will be rendered in this window.
   */
  readonly layerId: number;

  /**
   * A DOM element which boundaries define the area in which to render this window.
   *
   * When this window is added to a {@link SceneDisplay}, this element will be
   * added as a sibling of its rendering canvas.
   */
  get dom(): HTMLElement {
    throw new Error("Not implemented");
  }

  /**
   * Note: We can only construct this after the object is fully constructed,
   * since `this.dom` may not be defined in this constructor.
   */
  #pointerEventsObserver: PointerEventsObserver | undefined = undefined;

  /**
   * A handle for other objects to listen to the {@link ScenePointerEvent}s emitted by
   * this window.
   */
  get pointerEvents(): PointerEventsObserver {
    if (this.#pointerEventsObserver === undefined) {
      this.#pointerEventsObserver = new PointerEventsObserver(this.dom);
    }

    return this.#pointerEventsObserver;
  }

  /**
   * Creates a new window.
   *
   * @protected
   */
  constructor(name: string, layerId: number) {
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
   */
  getCamera(): THREE.Camera {
    throw new Error("Not implemented");
  }
}
