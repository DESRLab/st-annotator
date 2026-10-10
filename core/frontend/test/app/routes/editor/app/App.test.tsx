/* @vitest-environment jsdom */

import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { EventDispatcher, Group } from "three";
import type Stats from "three/examples/jsm/libs/stats.module";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppViewComponent } from "../../../../../app/routes/editor/app/App.react.tsx";
import { App } from "../../../../../app/routes/editor/app/App.tsx";
import { ComposableKeybindHandler } from "../../../../../app/routes/editor/app/Keybinds";
import type {
  SceneDisplay,
  SceneLayer,
} from "../../../../../app/routes/editor/scene";
import { LayerCollection } from "../../../../../app/routes/editor/scene/layer/LayerCollection.tsx";
import { LayerState } from "../../../../../app/routes/editor/scene/layer/LayerState";
import { EditorIntentsProvider } from "../../../../../app/routes/editor/store/EditorIntents.react.tsx";
import { EditorStoreProvider } from "../../../../../app/routes/editor/store/EditorStore.react.tsx";
import {
  createEditorStateFixture,
  createMockEditorStore,
  noopEditorIntents,
} from "../../../../../app/routes/editor/store/testing";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../../../../app/routes/editor/app/widgets", async () => {
  const { ComposableKeybindHandler } =
    await import("../../../../../app/routes/editor/app/Keybinds");
  return {
    ControlsMenuView: () => <span>Controls menu</span>,
    LayersMenuView: () => (
      <span data-test="react-layers-panel">React layers panel</span>
    ),
    MenuKeybinds: class {
      keydownHandler = new ComposableKeybindHandler();
      keyupHandler = new ComposableKeybindHandler();
      dispose(): void {}
    },
    ProjectMenuView: () => <span>Project menu</span>,
    ToolsMenuView: () => <span>Tools menu</span>,
  };
});

vi.mock("../../../../../app/routes/editor/scene", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../../../app/routes/editor/scene")
    >();
  return {
    ...actual,
    // The real renderer requires a WebGL context, which jsdom lacks.
    SceneRenderer: class {
      render(): void {}
      dispose(): void {}
    },
  };
});

vi.mock("three/examples/jsm/libs/stats.module", () => ({
  // The real panels require a canvas 2d context, which jsdom lacks.
  default: class {
    dom = document.createElement("div");
    begin(): void {}
    end(): void {}
  },
}));

function makeElem(text) {
  const elem = document.createElement("div");
  elem.textContent = text;
  return elem;
}

function makeAppViewState() {
  return {
    context: { currentFrame: null },
    layers: { layerEntries: [] },
    menus: {
      project: { keydownHandler: {}, playback: null },
      tools: { keydownHandler: {} },
      prefs: {
        keydownHandler: {},
        renderView: () => <span>Preferences menu</span>,
      },
      layers: { keydownHandler: {} },
      controls: { keydownHandler: {} },
    },
    stats: { dom: makeElem("stats panel") } as Stats,
    webgl2Available: true,
  };
}

function setHint(
  state: ReturnType<typeof createEditorStateFixture>,
  hint: ReactNode,
) {
  return { ...state, ui: { ...state.ui, hint } };
}

async function renderAppView(
  appViewState: unknown,
  store: ReturnType<typeof createMockEditorStore>,
) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <EditorStoreProvider store={store.store}>
        <EditorIntentsProvider intents={noopEditorIntents}>
          <AppViewComponent
            app={appViewState as Parameters<typeof AppViewComponent>[0]["app"]}
          />
        </EditorIntentsProvider>
      </EditorStoreProvider>,
    );
  });
  return { host, root };
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("AppViewComponent", () => {
  it("hosts editor shell DOM, panel content, hints, and stats through React", async () => {
    const appViewState = makeAppViewState();
    const store = createMockEditorStore(createEditorStateFixture());
    const { host, root } = await renderAppView(appViewState, store);

    const appElement = host.querySelector<HTMLElement>(
      '[data-test="editor-app-view"]',
    );
    expect(appElement?.textContent).toContain("stats panel");
    expect(appViewState.stats.dom.style.right).toBe("0px");
    expect(appViewState.stats.dom.style.left).toBe("");
    expect(
      appElement?.querySelector('[data-test="editor-panel-project"]')
        ?.textContent,
    ).toContain("Project");
    expect(
      appElement?.querySelector('[data-test="editor-panel-tools"]')
        ?.textContent,
    ).toContain("Tools");
    expect(
      appElement?.querySelector('[data-test="editor-panel-preferences"]')
        ?.textContent,
    ).toContain("Preferences");
    expect(
      appElement?.querySelector('[data-test="editor-panel-layers"]')
        ?.textContent,
    ).toContain("Layers");
    expect(
      appElement?.querySelector<HTMLElement>(
        '[data-test="editor-panel-controls"]',
      )?.style.width,
    ).toBe("384px");
    expect(
      appElement?.querySelector<HTMLElement>(
        '[data-test="editor-panel-controls"]',
      )?.style.maxHeight,
    ).toBe("240px");
    expect(
      appElement?.querySelector<HTMLElement>(
        '[data-test="editor-panel-project"] .content',
      )?.style.width,
    ).toBe("384px");
    expect(
      appElement?.querySelector<HTMLElement>(
        '[data-test="editor-panel-project"] .content',
      )?.style.maxHeight,
    ).toBe("360px");
    expect(
      appElement?.querySelector('[data-test="react-layers-panel"]')
        ?.textContent,
    ).toBe("React layers panel");

    // The hint is read from the editor state snapshot.
    await act(async () => {
      store.setState(
        setHint(
          store.store.getSnapshot(),
          <>
            Press <kbd>S</kbd> to select a box, or <kbd>D</kbd> to draw a box
          </>,
        ),
      );
    });
    const hint = appElement?.querySelector(".hint");
    expect(hint?.textContent).toBe(
      "Press S to select a box, or D to draw a box",
    );
    expect(
      [...(hint?.querySelectorAll("kbd") ?? [])].map((key) => key.textContent),
    ).toEqual(["S", "D"]);

    await act(async () => {
      store.setState(
        setHint(store.store.getSnapshot(), "Choose a frame to open"),
      );
    });
    expect(appElement?.querySelector(".hint")?.textContent).toBe(
      "Choose a frame to open",
    );
    expect(appElement?.querySelector(".hint kbd")).toBeNull();

    await act(async () => root.unmount());
    expect(appViewState.stats.dom.style.right).toBe("");
    expect(host.innerHTML).toBe("");
  });

  it("blocks the editor and reports each plugin while current-frame data loads", async () => {
    const sourceDataEvents = new EventDispatcher();
    const labelsEvents = new EventDispatcher();
    const sourceData = {
      isLoading: true,
      downloadProgress: null as {
        loadedBytes: number;
        totalBytes: number | null;
      } | null,
      addEventListener:
        sourceDataEvents.addEventListener.bind(sourceDataEvents),
      removeEventListener:
        sourceDataEvents.removeEventListener.bind(sourceDataEvents),
    };
    const labels = {
      isLoading: false,
      addEventListener: labelsEvents.addEventListener.bind(labelsEvents),
      removeEventListener: labelsEvents.removeEventListener.bind(labelsEvents),
    };
    const appViewState = {
      ...makeAppViewState(),
      context: { currentFrame: { id: 42 } },
      layers: {
        layerEntries: [
          {
            key: "source-data",
            layer: { name: "Source Data", dataView: sourceData },
          },
          {
            key: "annotations",
            layer: { name: "Annotations", dataView: labels },
          },
          { key: "camera", layer: { name: "Camera" } },
        ],
      },
    };
    const store = createMockEditorStore(createEditorStateFixture());
    const { host, root } = await renderAppView(appViewState, store);

    const overlay = host.querySelector(
      '[data-test="frame-data-loading-overlay"]',
    );
    expect(
      (overlay?.firstElementChild as HTMLElement | null)?.style.width,
    ).toBe("560px");
    expect(overlay?.textContent).toContain("1 of 2 layers ready");
    expect(overlay?.textContent).toContain("Source DataLoading…");
    expect(overlay?.textContent).toContain("AnnotationsReady");
    expect(overlay?.querySelectorAll("progress")).toHaveLength(2);
    expect(
      overlay
        ?.querySelector('[data-plugin-key="source-data"] progress')
        ?.hasAttribute("value"),
    ).toBe(false);

    await act(async () => {
      sourceData.downloadProgress = {
        loadedBytes: 512 * 1024,
        totalBytes: 20 * 1048576,
      };
      sourceDataEvents.dispatchEvent({ type: "progress" });
    });
    const sourceDataRow = host.querySelector('[data-plugin-key="source-data"]');
    expect(sourceDataRow?.textContent).toContain("3% · 0.5 MB / 20.0 MB");
    expect(sourceDataRow?.querySelector("progress")?.value).toBeCloseTo(0.025);

    await act(async () => {
      sourceData.isLoading = false;
      sourceDataEvents.dispatchEvent({ type: "afterload" });
    });
    expect(
      host.querySelector('[data-test="frame-data-loading-overlay"]'),
    ).toBeNull();

    await act(async () => root.unmount());
  });

  it("retains the downloaded size when another plugin is still loading", async () => {
    const events = new EventDispatcher();
    const appViewState = {
      ...makeAppViewState(),
      context: { currentFrame: { id: 42 } },
      layers: {
        layerEntries: [
          {
            key: "source-data",
            layer: {
              name: "Source Data",
              dataView: {
                isLoading: false,
                downloadProgress: {
                  loadedBytes: 12.5 * 1048576,
                  totalBytes: 12.5 * 1048576,
                },
                addEventListener: events.addEventListener.bind(events),
                removeEventListener: events.removeEventListener.bind(events),
              },
            },
          },
          {
            key: "annotations",
            layer: {
              name: "Annotations",
              dataView: {
                isLoading: true,
                downloadProgress: null,
                addEventListener: events.addEventListener.bind(events),
                removeEventListener: events.removeEventListener.bind(events),
              },
            },
          },
        ],
      },
    };
    const store = createMockEditorStore(createEditorStateFixture());
    const { host, root } = await renderAppView(appViewState, store);

    expect(
      host.querySelector('[data-plugin-key="source-data"]')?.textContent,
    ).toContain("Ready · 12.5 MB");

    await act(async () => root.unmount());
  });

  it("uses KB instead of rounding small label payloads to zero MB", async () => {
    const events = new EventDispatcher();
    const appViewState = {
      ...makeAppViewState(),
      context: { currentFrame: { id: 42 } },
      layers: {
        layerEntries: [
          {
            key: "annotations",
            layer: {
              name: "Annotations",
              dataView: {
                isLoading: false,
                downloadProgress: {
                  loadedBytes: 24 * 1024,
                  totalBytes: 24 * 1024,
                },
                addEventListener: events.addEventListener.bind(events),
                removeEventListener: events.removeEventListener.bind(events),
              },
            },
          },
          {
            key: "geometry",
            layer: {
              name: "Geometry",
              dataView: {
                isLoading: true,
                downloadProgress: null,
                addEventListener: events.addEventListener.bind(events),
                removeEventListener: events.removeEventListener.bind(events),
              },
            },
          },
        ],
      },
    };
    const store = createMockEditorStore(createEditorStateFixture());
    const { host, root } = await renderAppView(appViewState, store);

    expect(
      host.querySelector('[data-plugin-key="annotations"]')?.textContent,
    ).toContain("Ready · 24.0 KB");

    await act(async () => root.unmount());
  });

  it("hides the frame-loading overlay while playback is active", async () => {
    const dataEvents = new EventDispatcher();
    const playbackEvents = new EventDispatcher();
    const playback = {
      isPlaying: false,
      addEventListener: playbackEvents.addEventListener.bind(playbackEvents),
      removeEventListener:
        playbackEvents.removeEventListener.bind(playbackEvents),
    };
    const baseState = makeAppViewState();
    const appViewState = {
      ...baseState,
      context: { currentFrame: { id: 42 } },
      menus: {
        ...baseState.menus,
        project: { ...baseState.menus.project, playback },
      },
      layers: {
        layerEntries: [
          {
            key: "source-data",
            layer: {
              name: "Source Data",
              dataView: {
                isLoading: true,
                downloadProgress: null,
                addEventListener: dataEvents.addEventListener.bind(dataEvents),
                removeEventListener:
                  dataEvents.removeEventListener.bind(dataEvents),
              },
            },
          },
        ],
      },
    };
    const store = createMockEditorStore(createEditorStateFixture());
    const { host, root } = await renderAppView(appViewState, store);
    expect(
      host.querySelector('[data-test="frame-data-loading-overlay"]'),
    ).not.toBeNull();

    await act(async () => {
      playback.isPlaying = true;
      playbackEvents.dispatchEvent({ type: "change" });
    });
    expect(
      host.querySelector('[data-test="frame-data-loading-overlay"]'),
    ).toBeNull();

    await act(async () => {
      playback.isPlaying = false;
      playbackEvents.dispatchEvent({ type: "change" });
    });
    expect(
      host.querySelector('[data-test="frame-data-loading-overlay"]'),
    ).not.toBeNull();

    await act(async () => root.unmount());
  });
});

const hintTestDisplay = {
  windows: {
    main: { layerId: 0 },
    minimap: { layerId: 1 },
  },
};

function makeHintTestContext(currentFrame: unknown = {}) {
  const events = new EventDispatcher();

  return {
    currentFrame,
    currentTask: null as unknown,
    currentLabelBranch: null as unknown,
    hasUnsavedChanges: false,
    display: hintTestDisplay,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
    dispose: vi.fn(),
  };
}

function makeHintTestLayer(name: string, context: unknown) {
  const events = new EventDispatcher();
  let hint: ReactNode = `${name} hint`;

  return {
    name,
    context,
    state: new LayerState(hintTestDisplay as unknown as SceneDisplay),
    objects: new Group(),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchHintChange(): void {
      events.dispatchEvent({ type: "hint-change" });
    },
    setHint(nextHint: ReactNode): void {
      hint = nextHint;
    },
    getHint(): ReactNode {
      return hint;
    },
    keydownHandler: new ComposableKeybindHandler(),
    keyupHandler: new ComposableKeybindHandler(),
    render(): void {},
    dispose(): void {},
  };
}

function makeHintTestMenus() {
  const makeMenu = () => ({
    keydownHandler: new ComposableKeybindHandler(),
    keyupHandler: new ComposableKeybindHandler(),
    dispose: vi.fn(),
  });

  return {
    project: makeMenu(),
    prefs: { ...makeMenu(), renderView: (): ReactNode => null },
    tools: makeMenu(),
  };
}

type AppConstructorArgs = ConstructorParameters<typeof App>;

function makeHintTestApp(
  context: unknown,
  layers: LayerCollection,
  menus: unknown,
): App {
  return new App(
    context as AppConstructorArgs[0],
    layers,
    menus as AppConstructorArgs[2],
  );
}

describe("App hint updates", () => {
  it("coalesces render requests and leaves the animation loop idle after each frame", () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextFrameId = 1;
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      const id = nextFrameId++;
      callbacks.set(id, callback);
      return id;
    });
    const cancelAnimationFrame = vi.fn((id: number) => {
      callbacks.delete(id);
    });
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);

    const context = makeHintTestContext();
    const layer = makeHintTestLayer("A", context);
    const renderLayer = vi.spyOn(layer, "render");
    const layers = new LayerCollection(
      { a: layer as unknown as SceneLayer },
      layer as unknown as SceneLayer,
    );
    const app = makeHintTestApp(context, layers, makeHintTestMenus());

    // Construction and repeated invalidations share one pending frame.
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    app.requestRender();
    app.requestRender();
    expect(requestAnimationFrame).toHaveBeenCalledOnce();

    const firstFrame = callbacks.values().next().value as FrameRequestCallback;
    callbacks.clear();
    firstFrame(0);
    expect(renderLayer).toHaveBeenCalledOnce();
    expect(app.renderGeneration).toBe(1);
    expect(app.isRenderPending).toBe(false);
    expect(callbacks.size).toBe(0);
    expect(requestAnimationFrame).toHaveBeenCalledOnce();

    // A layer becoming dirty wakes exactly one new frame.
    layers.dispatchEvent({ type: "render-request" });
    layers.dispatchEvent({ type: "render-request" });
    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
    expect(callbacks.size).toBe(1);

    const secondFrame = callbacks.values().next().value as FrameRequestCallback;
    callbacks.clear();
    secondFrame(1);
    expect(renderLayer).toHaveBeenCalledTimes(2);
    expect(app.renderGeneration).toBe(2);
    expect(callbacks.size).toBe(0);

    // Preference controls outside the scene canvas also wake rendering.
    document.dispatchEvent(new Event("change"));
    expect(requestAnimationFrame).toHaveBeenCalledTimes(3);
    expect(callbacks.size).toBe(1);

    app.dispose();
    layers.dispatchEvent({ type: "render-request" });
    expect(requestAnimationFrame).toHaveBeenCalledTimes(3);
  });

  it("sets the initial hint at construction and follows hint changes of the active layer", () => {
    const context = makeHintTestContext();
    const layer = makeHintTestLayer("A", context);
    const layers = new LayerCollection(
      { a: layer as unknown as SceneLayer },
      layer as unknown as SceneLayer,
    );
    const app = makeHintTestApp(context, layers, makeHintTestMenus());

    expect(app.hintText).toBe("A hint");

    const onHintChange = vi.fn();
    app.addEventListener("hint-change", onHintChange);

    layer.setHint("Press S to select");
    layer.dispatchHintChange();

    expect(onHintChange).toHaveBeenCalledOnce();
    expect(app.hintText).toBe("Press S to select");

    app.dispose();
  });

  it("re-reads the hint when the active layer changes", () => {
    const context = makeHintTestContext();
    const layerA = makeHintTestLayer("A", context);
    const layerB = makeHintTestLayer("B", context);
    const layers = new LayerCollection(
      {
        a: layerA as unknown as SceneLayer,
        b: layerB as unknown as SceneLayer,
      },
      layerA as unknown as SceneLayer,
    );
    const app = makeHintTestApp(context, layers, makeHintTestMenus());
    const onHintChange = vi.fn();
    app.addEventListener("hint-change", onHintChange);

    expect(app.hintText).toBe("A hint");

    layers.activeLayer = layerB as unknown as SceneLayer;

    expect(app.hintText).toBe("B hint");
    expect(onHintChange).toHaveBeenCalledOnce();

    app.dispose();
  });

  it("does not update the hint when an inactive layer's hint changes", () => {
    const context = makeHintTestContext();
    const layerA = makeHintTestLayer("A", context);
    const layerB = makeHintTestLayer("B", context);
    const layers = new LayerCollection(
      {
        a: layerA as unknown as SceneLayer,
        b: layerB as unknown as SceneLayer,
      },
      layerA as unknown as SceneLayer,
    );
    const app = makeHintTestApp(context, layers, makeHintTestMenus());
    const onHintChange = vi.fn();
    app.addEventListener("hint-change", onHintChange);

    layerB.setHint("B updated hint");
    layerB.dispatchHintChange();

    expect(onHintChange).not.toHaveBeenCalled();
    expect(app.hintText).toBe("A hint");

    app.dispose();
  });

  it("re-reads the project-level hints when the navigation state changes", () => {
    const context = makeHintTestContext(null);
    const layers = new LayerCollection({});
    const menus = makeHintTestMenus();
    const app = makeHintTestApp(context, layers, menus);
    const onHintChange = vi.fn();
    app.addEventListener("hint-change", onHintChange);

    // Neither a task, a branch, nor a frame is selected yet.
    const chooseTaskHint = app.hintText;
    expect(chooseTaskHint).not.toBeNull();

    context.currentTask = { id: 1 };
    context.dispatchEvent({
      type: "nav-source-group",
      prevGroup: null,
      group: null,
    });
    const chooseBranchHint = app.hintText;
    expect(chooseBranchHint).not.toBe(chooseTaskHint);
    expect(onHintChange).toHaveBeenCalledOnce();

    // Repeated navigation without a state change does not re-dispatch.
    context.dispatchEvent({
      type: "nav-source-group",
      prevGroup: null,
      group: null,
    });
    expect(onHintChange).toHaveBeenCalledOnce();

    context.currentLabelBranch = { id: 2 };
    context.dispatchEvent({
      type: "nav-label-branch",
      prevBranch: null,
      branch: null,
    });
    expect(app.hintText).not.toBe(chooseBranchHint);
    expect(onHintChange).toHaveBeenCalledTimes(2);

    app.dispose();
  });
});

describe("App dirty-navigation guard", () => {
  it("blocks unload only while label changes are unsaved and removes the guard on disposal", () => {
    const context = makeHintTestContext();
    const layers = new LayerCollection({});
    const app = makeHintTestApp(context, layers, makeHintTestMenus());

    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    context.hasUnsavedChanges = true;
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);

    app.dispose();
    const afterDispose = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(afterDispose);
    expect(afterDispose.defaultPrevented).toBe(false);
  });
});
