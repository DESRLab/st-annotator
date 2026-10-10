import type { ReactNode } from "react";
import { EventDispatcher, Group } from "three";

import { ComposableKeybindHandler } from "../../app/Keybinds";
import type { WindowMapper } from "../display";

import { DataLayer, LabelDataLayer, SourceDataLayer } from "./DataLayer";
import type { SceneLayer } from "./SceneLayer.tsx";

export interface LayerCollectionEventMap<WM extends WindowMapper> {
  "hint-change": {};
  "layer-activate": { activeLayer: SceneLayer<WM> | null };
  "overlays-change": {};
  "render-request": {};
}

/** A plain per-layer record consumed by the route-owned overlay host. */
export interface OverlayModel {
  /** The key of the layer that owns this overlay. */
  key: string;
  /** The CSS `z-index` applied to this overlay. */
  zIndex: number;
  /** The React-owned content to display over the scene. */
  overlayView: ReactNode | null;
  /** Reports the current React-owned overlay size to the owning layer. */
  onSizeChange(this: void, width: number, height: number): void;
}

const NOOP_OVERLAY_SIZE_CHANGE = (): void => {};

/**
 * Represents a collection of layers.
 */
export class LayerCollection<
  WM extends WindowMapper = WindowMapper,
> extends EventDispatcher<LayerCollectionEventMap<WM>> {
  /**
   * The [Object3D render order](https://threejs.org/docs/#api/en/core/Object3D.renderOrder)
   * applied to each layer depending on
   * its status.
   */
  static RENDER_ORDER: Readonly<{
    SOURCE_DATA: number;
    DEFAULT: number;
    LABEL_DATA: number;
    ACTIVE: number;
  }> = {
    SOURCE_DATA: -1,
    DEFAULT: 0,
    LABEL_DATA: 1,
    ACTIVE: 2,
  };

  /**
   * Handles the event when a key is pressed in this menu.
   */
  readonly keydownHandler: ComposableKeybindHandler;

  /**
   * Handles the event when a key is released in this menu.
   */
  readonly keyupHandler: ComposableKeybindHandler;

  /**
   * Contains each layer in this collection.
   */
  readonly #layers: ReadonlyMap<string, SceneLayer<WM>>;

  /**
   * An array containing each layer in this collection.
   */
  get allLayers(): readonly SceneLayer<WM>[] {
    return [...this.#layers.values()];
  }

  /**
   * An array containing each data layer in this collection.
   */
  get dataLayers(): readonly DataLayer<WM, any>[] {
    return this.allLayers.filter(
      (layer): layer is DataLayer<WM, any> => layer instanceof DataLayer,
    );
  }

  /**
   * An array containing each source data layer in this collection.
   */
  get sourceDataLayers(): readonly SourceDataLayer<WM, any>[] {
    return this.allLayers.filter(
      (layer): layer is SourceDataLayer<WM, any> =>
        layer instanceof SourceDataLayer,
    );
  }

  /**
   * An array containing each label data layer in this collection.
   */
  get labelDataLayers(): readonly LabelDataLayer<WM, any>[] {
    return this.allLayers.filter(
      (layer): layer is LabelDataLayer<WM, any> =>
        layer instanceof LabelDataLayer,
    );
  }

  #activeLayer: SceneLayer<WM> | null = null;

  /**
   * The layer that is currently active, or `null` if none.
   *
   * Note that disabled layers cannot be set as active; attempting to do so results in a no-op.
   */
  get activeLayer(): SceneLayer<WM> | null {
    return this.#activeLayer;
  }

  set activeLayer(value: SceneLayer<WM> | null) {
    if (value != null && !value.state.enabled) {
      console.warn("Cannot activate a disabled layer");
      return;
    }

    if (this.#activeLayer !== value) {
      const previous = this.#activeLayer;
      this.#activeLayer = value;
      this.keydownHandler.setChildren(
        value == null ? [] : [value.keydownHandler],
      );
      this.keyupHandler.setChildren(value == null ? [] : [value.keyupHandler]);
      this.#setHintSource(value);

      // The render order of the previously and newly active layers
      // depends on this change, so re-apply them on the next render.
      if (previous != null) this.#dirtyLayers.add(previous);
      if (value != null) this.#dirtyLayers.add(value);

      this.dispatchEvent({ type: "layer-activate", activeLayer: value });
      // The source of this collection's hint changed, so notify that
      // the hint itself changed as well.
      this.dispatchEvent({ type: "hint-change" });
      this.#syncObjects();
      this.#updateOverlayModels();
      this.dispatchEvent({ type: "render-request" });
    }
  }

  /**
   * The layer whose `hint-change` events are relayed by this collection,
   * i.e. the active layer, or `null` if none.
   */
  #hintSource: SceneLayer<WM> | null = null;

  /**
   * Handles the event when the hint of the active layer changed.
   */
  #onActiveLayerHintChange = (): void => {
    this.dispatchEvent({ type: "hint-change" });
  };

  /**
   * Relays the `hint-change` events of the given layer, replacing the
   * layer previously subscribed to (if any).
   */
  #setHintSource(layer: SceneLayer<WM> | null): void {
    if (this.#hintSource != null) {
      this.#hintSource.removeEventListener(
        "hint-change",
        this.#onActiveLayerHintChange,
      );
    }

    this.#hintSource = layer;

    if (layer != null) {
      layer.addEventListener("hint-change", this.#onActiveLayerHintChange);
    }
  }

  /**
   * Gets the layer with the given key.
   *
   * @throws {Error} If no such layer exists.
   */
  getLayer(key: string): SceneLayer<WM> {
    const layer = this.#layers.get(key);
    if (layer != null) return layer;

    throw new Error(`Cannot find layer with key: ${key}`);
  }

  /**
   * The key/layer pairs of this collection, in insertion order.
   */
  get layerEntries(): readonly { key: string; layer: SceneLayer<WM> }[] {
    return [...this.#layers].map(([key, layer]) => ({ key, layer }));
  }

  /**
   * Activates the layer with the given key.
   *
   * If no such layer exists, this method performs no operation.
   */
  activateLayer(key: string): void {
    const layer = this.#layers.get(key);
    if (layer == null) {
      console.warn(`Cannot activate unknown layer: ${key}`);
      return;
    }

    this.activeLayer = layer;
  }

  /**
   * Enables or disables the layer with the given key.
   *
   * If no such layer exists, this method performs no operation.
   */
  setLayerEnabled(key: string, enabled: boolean): void {
    const layer = this.#layers.get(key);
    if (layer == null) {
      console.warn(`Cannot change the enabled state of unknown layer: ${key}`);
      return;
    }

    layer.state.enabled = enabled;
  }

  /**
   * Enables or disables every layer in this collection.
   */
  setAllLayersEnabled(enabled: boolean): void {
    for (const layer of this.#layers.values()) {
      layer.state.enabled = enabled;
    }
  }

  /**
   * A container of the `three.js` objects to include in the scene.
   *
   * This container and its children should be in world space,
   * rather than being relative to the current frame.
   */
  readonly objects: Group;

  #overlayModels: readonly {
    key: string;
    layer: SceneLayer<WM>;
    zIndex: number;
  }[] = [];

  /**
   * The plain overlay records of each layer, rebuilt on each access,
   * so that the React-owned overlay views are always up to date.
   */
  get overlayModels(): readonly OverlayModel[] {
    return this.#overlayModels.map(({ key, layer, zIndex }) => ({
      key,
      zIndex,
      overlayView: layer.overlayView,
      onSizeChange:
        this.#overlaySizeReporters.get(layer) ?? NOOP_OVERLAY_SIZE_CHANGE,
    }));
  }

  /**
   * The stable `overlayModels` size reporters bound to each layer.
   */
  #overlaySizeReporters = new Map<
    SceneLayer<WM>,
    (width: number, height: number) => void
  >();

  /**
   * The `overlay-change` listeners relayed by this collection,
   * keyed by layer.
   */
  #layerOverlayListeners = new Map<SceneLayer<WM>, () => void>();

  /**
   * The layers whose per-window visibility masks and render order still
   * need to be re-applied on the next call to {@link render}.
   */
  #dirtyLayers = new Set<SceneLayer<WM>>();

  /**
   * The `change` listener registered on the state of each layer,
   * keyed by layer.
   */
  #layerStateListeners = new Map<SceneLayer<WM>, () => void>();

  /** The object-change listener registered on each layer. */
  #layerObjectListeners = new Map<SceneLayer<WM>, () => void>();

  /** The render-request listener registered on each layer. */
  #layerRenderListeners = new Map<SceneLayer<WM>, () => void>();

  /**
   * Handles the event when the state of the given layer has been updated.
   */
  #onLayerStateUpdate = (layer: SceneLayer<WM>) => {
    this.#dirtyLayers.add(layer);
    this.dispatchEvent({ type: "render-request" });

    if (this.activeLayer != null && !this.activeLayer.state.enabled) {
      this.activeLayer = null;
    }
  };

  /**
   * Subscribes to the state of the given layer and marks it dirty,
   * so that the next render applies its visibility masks.
   *
   * Also relays the layer's `overlay-change` events as `overlays-change`
   * events of this collection, so that the overlay host only needs
   * the collection-level subscription.
   */
  #registerLayer(layer: SceneLayer<WM>): void {
    const listener = () => this.#onLayerStateUpdate(layer);
    this.#layerStateListeners.set(layer, listener);
    layer.state.addEventListener("change", listener);

    const objectListener = (): void => {
      this.#dirtyLayers.add(layer);
    };
    this.#layerObjectListeners.set(layer, objectListener);
    layer.addEventListener("objects-change", objectListener);

    const renderListener = (): void => {
      this.dispatchEvent({ type: "render-request" });
    };
    this.#layerRenderListeners.set(layer, renderListener);
    layer.addEventListener("render-request", renderListener);

    const overlayListener = (): void => {
      this.dispatchEvent({ type: "overlays-change" });
    };
    this.#layerOverlayListeners.set(layer, overlayListener);
    layer.addEventListener("overlay-change", overlayListener);

    this.#overlaySizeReporters.set(
      layer,
      (width: number, height: number): void =>
        layer.setOverlaySize(width, height),
    );
    this.#dirtyLayers.add(layer);
  }

  /**
   * Unsubscribes from the state and overlay events of the given layer.
   */
  #unregisterLayer(layer: SceneLayer<WM>): void {
    const listener = this.#layerStateListeners.get(layer);
    if (listener != null) layer.state.removeEventListener("change", listener);
    this.#layerStateListeners.delete(layer);

    const objectListener = this.#layerObjectListeners.get(layer);
    if (objectListener != null)
      layer.removeEventListener("objects-change", objectListener);
    this.#layerObjectListeners.delete(layer);

    const renderListener = this.#layerRenderListeners.get(layer);
    if (renderListener != null)
      layer.removeEventListener("render-request", renderListener);
    this.#layerRenderListeners.delete(layer);

    const overlayListener = this.#layerOverlayListeners.get(layer);
    if (overlayListener != null)
      layer.removeEventListener("overlay-change", overlayListener);
    this.#layerOverlayListeners.delete(layer);

    this.#overlaySizeReporters.delete(layer);
    this.#dirtyLayers.delete(layer);
  }

  /**
   * Rebuilds the children of the aggregate {@link objects} group from the
   * layers of this collection, sorted (stably) by their render order.
   */
  #syncObjects(): void {
    const layers = [...this.#layers.values()].sort(
      (a, b) => this.#getLayerRenderOrder(a) - this.#getLayerRenderOrder(b),
    );

    this.objects.clear();
    for (const layer of layers) {
      this.objects.add(layer.objects);
    }
  }

  #getLayerRenderOrder(layer: SceneLayer<WM>): number {
    const RENDER_ORDER = LayerCollection.RENDER_ORDER;

    if (layer === this.activeLayer) return RENDER_ORDER.ACTIVE;
    if (layer instanceof LabelDataLayer) return RENDER_ORDER.LABEL_DATA;
    if (layer instanceof SourceDataLayer) return RENDER_ORDER.SOURCE_DATA;

    return RENDER_ORDER.DEFAULT;
  }

  #updateOverlayModels = (): void => {
    const nextModels = [...this.#layers].map(([key, layer]) => ({
      key,
      layer,
      zIndex: this.#getLayerRenderOrder(layer),
    }));
    const isUnchanged =
      nextModels.length === this.#overlayModels.length &&
      nextModels.every((model, index) => {
        const previous = this.#overlayModels[index];
        return (
          previous.key === model.key &&
          previous.layer === model.layer &&
          previous.zIndex === model.zIndex
        );
      });
    if (isUnchanged) return;

    this.#overlayModels = nextModels;
    this.dispatchEvent({ type: "overlays-change" });
  };

  /**
   * Creates a new collection of layers.
   *
   * Ownership is transferred to this object.
   * or `null` (default) if none.
   *
   */
  constructor(
    layers: Record<string, SceneLayer<WM>>,
    activeLayer: SceneLayer<WM> | null = null,
  ) {
    super();

    this.keydownHandler = new ComposableKeybindHandler();
    this.keyupHandler = new ComposableKeybindHandler();

    this.#layers = new Map(Object.entries(layers));
    this.objects = new Group();

    // Registers each layer's state listener and marks it dirty,
    // so that the first render applies every layer's visibility masks.
    for (const layer of this.#layers.values()) {
      this.#registerLayer(layer);
    }

    this.activeLayer = activeLayer; // Invoke the setter

    // Initialize membership and overlay models even when the setter
    // above was a no-op (i.e. `activeLayer` remained `null`).
    this.#syncObjects();
    this.#updateOverlayModels();
  }

  /**
   * Gets the content to display as a hint to the user.
   *
   * If `null`, no hint is displayed.
   */
  getHint(): ReactNode {
    return this.activeLayer?.getHint() ?? null;
  }

  /**
   * Updates the `three.js` objects and the DOM elements of each layer
   * in this collection.
   *
   * It is called during each animation frame. Each layer's own
   * {@link SceneLayer#render} runs every frame, but the per-window
   * visibility masks and render orders are re-applied only for layers
   * that changed since the previous update; otherwise, this method
   * performs no additional work.
   */
  render() {
    for (const layer of this.#layers.values()) {
      layer.render();
    }

    for (const layer of this.#dirtyLayers) {
      const layerObjects = layer.objects;
      const layerWindows = layer.context.display.windows;

      for (const [windowKey, sceneWindow] of Object.entries(layerWindows)) {
        // Layers setting does not propagate to children automatically,
        // so we need to traverse the descendents and set it one by one
        if (layer.state.enabled && layer.state.isVisible(windowKey)) {
          layerObjects.traverse((obj) => {
            obj.layers.enable(sceneWindow.layerId);
          });
        } else {
          layerObjects.traverse((obj) => {
            obj.layers.disable(sceneWindow.layerId);
          });
        }
      }

      layerObjects.renderOrder = this.#getLayerRenderOrder(layer);
    }
    this.#dirtyLayers.clear();
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose() {
    for (const layer of [...this.#layerStateListeners.keys()]) {
      this.#unregisterLayer(layer);
    }
    this.#setHintSource(null);

    for (const layer of this.#layers.values()) {
      layer.dispose();
    }

    this.keydownHandler.dispose();
    this.keyupHandler.dispose();
  }
}
