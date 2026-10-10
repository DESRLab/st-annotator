/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { EventDispatcher, Group, Object3D } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SceneDisplay, SceneLayer } from "..";
import { ComposableKeybindHandler } from "../../../../../../app/routes/editor/app/Keybinds";
import { LayerCollectionOverlaysView } from "../../../../../../app/routes/editor/scene/layer/LayerCollection.react.tsx";
import { LayerCollection } from "../../../../../../app/routes/editor/scene/layer/LayerCollection.tsx";
import { LayerState } from "../../../../../../app/routes/editor/scene/layer/LayerState";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const display = {
  windows: {
    main: { layerId: 0 },
    minimap: { layerId: 1 },
  },
};

const context = { display };

function makeLayer(name) {
  const objects = new Group();
  objects.add(new Object3D());
  const events = new EventDispatcher();
  let overlayView = <output>{name} overlay</output>;
  const overlaySizes: { height: number; width: number }[] = [];

  return {
    name,
    context,
    state: new LayerState(display as unknown as SceneDisplay),
    objects,
    get overlayView() {
      return overlayView;
    },
    setOverlaySize(width, height) {
      overlaySizes.push({ height, width });
    },
    overlaySizes,
    updateOverlay(view) {
      overlayView = view;
      events.dispatchEvent({ type: "overlay-change" });
    },
    dispatchHintChange() {
      events.dispatchEvent({ type: "hint-change" });
    },
    dispatchObjectsChange() {
      events.dispatchEvent({ type: "objects-change" });
    },
    dispatchRenderRequest() {
      events.dispatchEvent({ type: "render-request" });
    },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    keydownHandler: new ComposableKeybindHandler(),
    keyupHandler: new ComposableKeybindHandler(),
    renderCount: 0,
    disposed: false,
    getHint: () => name + " hint",
    render() {
      this.renderCount += 1;
    },
    dispose() {
      this.disposed = true;
      this.keydownHandler.dispose();
      this.keyupHandler.dispose();
    },
  };
}

async function flushReact() {
  await act(async () => {});
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("LayerCollection", () => {
  it("renders into React-owned layer hosts and updates active render order", async () => {
    const layerA = makeLayer("A");
    const layerB = makeLayer("B");
    let collection;

    await act(async () => {
      collection = new LayerCollection(
        {
          a: layerA as unknown as SceneLayer,
          b: layerB as unknown as SceneLayer,
        },
        layerB as unknown as SceneLayer,
      );
    });
    const rootHost = document.createElement("div");
    document.body.append(rootHost);
    const root = createRoot(rootHost);
    await act(async () => {
      root.render(<LayerCollectionOverlaysView source={collection} />);
    });
    await flushReact();

    expect(collection.getLayer("a")).toBe(layerA);
    expect(() => collection.getLayer("missing")).toThrow(/Cannot find layer/);
    expect(collection.getHint()).toBe("B hint");
    expect(rootHost.querySelector("#overlays-container")).not.toBeNull();
    expect(
      rootHost.querySelectorAll("#overlays-container > div")[0].style.zIndex,
    ).toBe("0");
    expect(
      rootHost.querySelectorAll("#overlays-container > div")[1].style.zIndex,
    ).toBe("2");
    expect(rootHost.textContent).toContain("A overlay");
    expect(layerA.overlaySizes).toHaveLength(1);
    expect(layerB.overlaySizes).toHaveLength(1);

    await act(async () => {
      layerA.updateOverlay(<output>Updated A overlay</output>);
    });
    expect(rootHost.textContent).toContain("Updated A overlay");

    await act(async () => collection.render());

    expect(layerA.renderCount).toBe(1);
    expect(layerB.renderCount).toBe(1);
    expect(collection.objects.children).toEqual([
      layerA.objects,
      layerB.objects,
    ]);
    expect(layerA.objects.renderOrder).toBe(0);
    expect(layerB.objects.renderOrder).toBe(2);
    expect(layerA.objects.children[0].layers.isEnabled(0)).toBe(true);
    expect(layerA.objects.children[0].layers.isEnabled(1)).toBe(true);

    const onOverlayChange = vi.fn();
    collection.addEventListener("overlays-change", onOverlayChange);
    await act(async () => collection.render());
    expect(onOverlayChange).not.toHaveBeenCalled();
    collection.removeEventListener("overlays-change", onOverlayChange);

    await act(async () => {
      collection.activeLayer = layerA;
      collection.render();
    });

    expect(collection.activeLayer).toBe(layerA);
    expect(collection.getHint()).toBe("A hint");
    expect(
      rootHost.querySelectorAll("#overlays-container > div")[0].style.zIndex,
    ).toBe("2");
    expect(
      rootHost.querySelectorAll("#overlays-container > div")[1].style.zIndex,
    ).toBe("0");
    expect(layerA.objects.renderOrder).toBe(2);
    expect(layerB.objects.renderOrder).toBe(0);

    await act(async () => root.unmount());
  });

  it("clears disabled active layers while React owns overlay rendering", async () => {
    const layerA = makeLayer("A");
    const layerB = makeLayer("B");
    let collection;

    await act(async () => {
      collection = new LayerCollection(
        {
          a: layerA as unknown as SceneLayer,
          b: layerB as unknown as SceneLayer,
        },
        layerA as unknown as SceneLayer,
      );
    });
    const rootHost = document.createElement("div");
    document.body.append(rootHost);
    const root = createRoot(rootHost);
    await act(async () => {
      root.render(<LayerCollectionOverlaysView source={collection} />);
    });
    await flushReact();

    await act(async () => {
      layerA.state.enabled = false;
    });

    expect(collection.activeLayer).toBeNull();

    await act(async () => collection.render());
    expect(
      rootHost
        .querySelector("#overlays-container > div")
        ?.getAttribute("style"),
    ).toContain("z-index: 0");
    expect(layerA.objects.children[0].layers.isEnabled(0)).toBe(false);
    expect(layerA.objects.children[0].layers.isEnabled(1)).toBe(false);

    await act(async () => root.unmount());
    await act(async () => collection.dispose());

    expect(layerA.disposed).toBe(true);
    expect(layerB.disposed).toBe(true);
  });

  it("performs no observable work while rendering with no state changes", async () => {
    const layerA = makeLayer("A");
    const layerB = makeLayer("B");
    let collection;

    await act(async () => {
      collection = new LayerCollection(
        {
          a: layerA as unknown as SceneLayer,
          b: layerB as unknown as SceneLayer,
        },
        layerA as unknown as SceneLayer,
      );
    });

    // The first render applies every layer's masks.
    await act(async () => collection.render());
    expect(layerA.objects.children[0].layers.isEnabled(0)).toBe(true);
    expect(layerB.objects.children[0].layers.isEnabled(1)).toBe(true);

    const onAnyChange = vi.fn();
    collection.addEventListener("overlays-change", onAnyChange);
    collection.addEventListener("layer-activate", onAnyChange);
    collection.addEventListener("hint-change", onAnyChange);

    // Tamper with a mask behind the collection's back. An idle render
    // must neither re-traverse (restoring it) nor re-parent or notify.
    const childB = layerB.objects.children[0];
    childB.layers.disable(1);
    const childrenBefore = collection.objects.children;

    await act(async () => collection.render());

    expect(onAnyChange).not.toHaveBeenCalled();
    expect(collection.objects.children).toBe(childrenBefore);
    expect(childB.layers.isEnabled(1)).toBe(false);

    // A state change marks that layer dirty, so its masks are re-applied.
    await act(async () => {
      layerB.state.enabled = false;
    });
    await act(async () => collection.render());
    expect(childB.layers.isEnabled(0)).toBe(false);
    expect(childB.layers.isEnabled(1)).toBe(false);

    await act(async () => {
      layerB.state.enabled = true;
    });
    await act(async () => collection.render());
    expect(childB.layers.isEnabled(0)).toBe(true);
    expect(childB.layers.isEnabled(1)).toBe(true);

    // Object membership is explicit rather than polled on every frame.
    // Once a layer reports its rebuilt group, masks are applied to its
    // new children on the next collection render.
    const addedChild = new Object3D();
    layerB.objects.add(addedChild);
    await act(async () => collection.render());
    expect(addedChild.layers.isEnabled(1)).toBe(false);

    layerB.dispatchObjectsChange();
    await act(async () => collection.render());
    expect(addedChild.layers.isEnabled(1)).toBe(true);

    collection.removeEventListener("overlays-change", onAnyChange);
    collection.removeEventListener("layer-activate", onAnyChange);
    collection.removeEventListener("hint-change", onAnyChange);
  });

  it("relays layer render requests and detaches the relay on disposal", async () => {
    const layer = makeLayer("A");
    const collection = new LayerCollection({
      a: layer as unknown as SceneLayer,
    });
    const onRenderRequest = vi.fn();
    collection.addEventListener("render-request", onRenderRequest);

    layer.dispatchRenderRequest();
    expect(onRenderRequest).toHaveBeenCalledOnce();

    await act(async () => collection.dispose());
    layer.dispatchRenderRequest();
    expect(onRenderRequest).toHaveBeenCalledOnce();
  });

  it("relays hint changes of the active layer only, re-reading the hint on activation", async () => {
    const layerA = makeLayer("A");
    const layerB = makeLayer("B");
    let collection;

    await act(async () => {
      collection = new LayerCollection(
        {
          a: layerA as unknown as SceneLayer,
          b: layerB as unknown as SceneLayer,
        },
        layerA as unknown as SceneLayer,
      );
    });

    const onHintChange = vi.fn();
    collection.addEventListener("hint-change", onHintChange);

    // Hint changes of an inactive layer are not relayed.
    layerB.dispatchHintChange();
    expect(onHintChange).not.toHaveBeenCalled();

    // Hint changes of the active layer are relayed.
    layerA.dispatchHintChange();
    expect(onHintChange).toHaveBeenCalledOnce();

    // Switching the active layer changes the hint source,
    // so the collection reports the (new) hint once.
    onHintChange.mockClear();
    await act(async () => {
      collection.activeLayer = layerB;
    });
    expect(collection.getHint()).toBe("B hint");
    expect(onHintChange).toHaveBeenCalledOnce();

    // Only the newly active layer relays hint changes now.
    onHintChange.mockClear();
    layerA.dispatchHintChange();
    expect(onHintChange).not.toHaveBeenCalled();
    layerB.dispatchHintChange();
    expect(onHintChange).toHaveBeenCalledOnce();

    // Clearing the active layer reports the (empty) hint once
    // and unsubscribes from the last active layer.
    onHintChange.mockClear();
    await act(async () => {
      collection.activeLayer = null;
    });
    expect(collection.getHint()).toBeNull();
    expect(onHintChange).toHaveBeenCalledOnce();

    onHintChange.mockClear();
    layerB.dispatchHintChange();
    expect(onHintChange).not.toHaveBeenCalled();

    // Disposal detaches the hint relay entirely.
    onHintChange.mockClear();
    await act(async () => collection.dispose());
    layerA.dispatchHintChange();
    layerB.dispatchHintChange();
    expect(onHintChange).not.toHaveBeenCalled();
  });

  it("routes keybinds only to the active layer and clears them when it is disabled", async () => {
    const layerA = makeLayer("A");
    const layerB = makeLayer("B");
    const bindA = { keyCombo: "x", name: "Tool A", handler: vi.fn() };
    const bindB = { keyCombo: "y", name: "Tool B", handler: vi.fn() };
    layerA.keydownHandler.register(bindA);
    layerB.keydownHandler.register(bindB);

    let collection;
    await act(async () => {
      collection = new LayerCollection(
        {
          a: layerA as unknown as SceneLayer,
          b: layerB as unknown as SceneLayer,
        },
        layerA as unknown as SceneLayer,
      );
    });

    // The active layer receives its keybinds.
    expect(collection.keydownHandler.handle({ keyCombo: "x" } as never)).toBe(
      true,
    );
    expect(bindA.handler).toHaveBeenCalledTimes(1);
    expect(bindB.handler).not.toHaveBeenCalled();

    // Right after switching layers, keybinds never reach the formerly
    // active tool.
    await act(async () => {
      collection.activeLayer = layerB;
    });
    expect(collection.keydownHandler.handle({ keyCombo: "x" } as never)).toBe(
      false,
    );
    expect(bindA.handler).toHaveBeenCalledTimes(1);
    expect(collection.keydownHandler.handle({ keyCombo: "y" } as never)).toBe(
      true,
    );
    expect(bindB.handler).toHaveBeenCalledTimes(1);

    // Disabling the active layer (e.g. during loading or a layer switch)
    // clears key routing entirely.
    await act(async () => {
      layerB.state.enabled = false;
    });
    expect(collection.activeLayer).toBeNull();
    expect(collection.keydownHandler.handle({ keyCombo: "y" } as never)).toBe(
      false,
    );
    expect(bindB.handler).toHaveBeenCalledTimes(1);

    await act(async () => collection.dispose());
  });
});
