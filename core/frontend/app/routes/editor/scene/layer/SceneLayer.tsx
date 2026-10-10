import type { ReactNode } from "react";
import { EventDispatcher, Group } from "three";

import { ComposableKeybindHandler } from "../../app/Keybinds";
import type { SceneContext } from "../SceneContext";
import type { WindowMapper } from "../display";

import type { LayerControlsSection } from "./LayerControlsContent.react.tsx";
import { LayerState } from "./LayerState";
import { LayerPanelPlaceholder } from "./SceneLayer.react.tsx";

export interface SceneLayerEventMap {
  "controls-change": {};
  "hint-change": {};
  "overlay-change": {};
  "objects-change": {};
  "render-request": {};
  "settings-change": {};
}

/**
 * Interface for objects that represent a layer in the scene.
 */
export interface SceneLayer<WM extends WindowMapper = WindowMapper> {
  /**
   * A handle to the state of the scene.
   */
  readonly context: SceneContext<WM>;

  /**
   * The display name of this layer.
   */
  readonly name: string;

  /**
   * The state of this layer.
   */
  readonly state: LayerState<WM>;

  /**
   * A container of the `three.js` objects to include in the scene
   * when this layer is displayed.
   *
   * This container and its children should be in world space,
   * rather than being relative to the current frame.
   */
  readonly objects: Group;

  /** React-owned content for the Actions column of the Layers panel. */
  readonly actionsView: ReactNode;

  /** React-owned content rendered over the scene. */
  readonly overlayView: ReactNode | null;

  /** Receives the current React-owned overlay size. */
  setOverlaySize(_width: number, _height: number): void;

  addEventListener(
    _eventType:
      | "controls-change"
      | "hint-change"
      | "objects-change"
      | "overlay-change"
      | "render-request",
    _listener: () => void,
  ): void;

  removeEventListener(
    _eventType:
      | "controls-change"
      | "hint-change"
      | "objects-change"
      | "overlay-change"
      | "render-request",
    _listener: () => void,
  ): void;

  /** React-owned content for the Tools panel. */
  readonly toolsView: ReactNode | null;

  /** React-owned content for the Preferences panel. */
  readonly prefsView: ReactNode | null;

  /** React-owned content for the Scene Objects panel. */
  readonly objectTreeView: ReactNode | null;

  /** React-owned fallback content for the Controls panel. */
  readonly controlsView: ReactNode | null;

  /**
   * The React-owned sections shown in the Controls panel, or `null` when
   * this layer still supplies a legacy controls DOM element.
   */
  readonly controlsSections: readonly LayerControlsSection[] | null;

  /**
   * Handles the event when a key is pressed in this layer.
   */
  readonly keydownHandler: ComposableKeybindHandler;

  /**
   * Handles the when when a key is released in this layer.
   */
  readonly keyupHandler: ComposableKeybindHandler;

  /**
   * Gets the content to display as a hint to the user when this layer is active.
   *
   * If `null`, no hint is displayed.
   */
  getHint(): ReactNode;

  /**
   * Updates the `three.js` objects and the DOM elements of this layer.
   * It is called during each requested scene frame while this layer is displayed.
   */
  render(): void;

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose(): void;
}

/**
 * Abstract base implementation of {@link SceneLayer}.
 */
export class BaseSceneLayer<WM extends WindowMapper = WindowMapper>
  extends EventDispatcher<SceneLayerEventMap>
  implements SceneLayer<WM>
{
  /**
   * A handle to the state of the scene.
   */
  readonly context: SceneContext<WM>;

  /**
   * The display name of this layer.
   */
  readonly name: string;

  /**
   * The state of this layer.
   */
  readonly state: LayerState<WM>;

  /**
   * A container of the `three.js` objects to include in the scene
   * when this layer is displayed.
   *
   * This container and its children should be in world space,
   * rather than being relative to the current frame.
   */
  readonly objects: Group;

  // Left-aligned, as on `main`; the other placeholders are centered.
  get actionsView(): ReactNode {
    return <LayerPanelPlaceholder align="flex-start" text="(None)" />;
  }

  get overlayView(): ReactNode | null {
    return null;
  }

  setOverlaySize(_width: number, _height: number): void {}

  /**
   * A DOM element that is shown in the Tools panel
   * when this layer is active.
   */
  get toolsView(): ReactNode {
    return <LayerPanelPlaceholder text="(No tools available)" />;
  }

  /**
   * A DOM element that is shown in the Preferences panel
   * when this layer is active.
   */
  get prefsView(): ReactNode {
    return <LayerPanelPlaceholder text="(No options available)" />;
  }

  /**
   * A DOM element that is shown in the Scene Objects panel
   * when this layer is active.
   */
  get objectTreeView(): ReactNode {
    return <LayerPanelPlaceholder text="(No objects available)" />;
  }

  /**
   * A DOM element that is shown in the Controls panel
   * when this layer is active.
   */
  get controlsView(): ReactNode | null {
    return this.#controlsSections == null ? (
      <LayerPanelPlaceholder text="(No controls available)" />
    ) : null;
  }

  /**
   * Handles the event when a key is pressed in this layer.
   */
  readonly keydownHandler: ComposableKeybindHandler;

  /**
   * Handles the event when a key is released in this layer.
   */
  readonly keyupHandler: ComposableKeybindHandler;

  #controlsSections: readonly LayerControlsSection[] | null = null;

  get controlsSections(): readonly LayerControlsSection[] | null {
    return this.#controlsSections;
  }

  /** Notifies the route-owned overlay host that this layer's overlay changed. */
  refreshOverlay(): void {
    this.dispatchEvent({ type: "overlay-change" });
  }

  /** Notifies subscribers that the hint content of this layer changed. */
  refreshHint(): void {
    this.dispatchEvent({ type: "hint-change" });
  }

  /** Notifies the layer collection that this layer rebuilt its Three.js objects. */
  protected refreshObjects(): void {
    this.dispatchEvent({ type: "objects-change" });
  }

  /** Requests a scene frame after this layer has become dirty. */
  protected requestRender(): void {
    this.dispatchEvent({ type: "render-request" });
  }

  setControlsSections(sections: readonly LayerControlsSection[]): void {
    this.#controlsSections = sections;

    this.dispatchEvent({ type: "controls-change" });
  }

  /**
   * `true` if this layer is the currently active one; otherwise, `false`.
   */
  get isActive() {
    return this.context.isLayerActive(this);
  }

  /**
   * Creates a new data layer.
   *
   * @protected
   */
  constructor(context: SceneContext<WM>, name: string) {
    super();

    this.context = context;
    this.name = name;
    this.state = new LayerState(context.display);

    this.objects = new Group();

    this.keydownHandler = new ComposableKeybindHandler();
    this.keyupHandler = new ComposableKeybindHandler();
  }

  /**
   * Gets the content to display as a hint to the user when this layer is active.
   *
   * If `null`, no hint is displayed.
   */
  getHint(): ReactNode {
    return null;
  }

  /**
   * Updates the `three.js` objects and the DOM elements of this layer.
   * It is called during each requested scene frame while this layer is displayed.
   */
  render() {
    // No-op by default
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose() {
    this.keydownHandler.dispose();
    this.keyupHandler.dispose();
  }
}
