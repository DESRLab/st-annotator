/* @vitest-environment jsdom */

import { act } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DefaultSceneDisplayHost } from "../../../../../../app/routes/editor/scene/display/DefaultSceneDisplay.react.tsx";
import { DefaultSceneDisplay } from "../../../../../../app/routes/editor/scene/display/DefaultSceneDisplay.tsx";
import { MainWindowView } from "../../../../../../app/routes/editor/scene/display/MainWindow.react.tsx";
import { MainWindow } from "../../../../../../app/routes/editor/scene/display/MainWindow.tsx";
import { MinimapWindowView } from "../../../../../../app/routes/editor/scene/display/MinimapWindow.react.tsx";
import { MinimapWindow } from "../../../../../../app/routes/editor/scene/display/MinimapWindow.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const resizeObservers: ResizeObserverStub[] = [];

class ResizeObserverStub {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();

  constructor() {
    resizeObservers.push(this);
  }
}

class TestVector3 extends Vector3 {
  clone(): any {
    return new TestVector3(this.x, this.y, this.z);
  }

  fillScalar() {
    return this;
  }
}

const config = {
  coordinateFormat: {
    toDatabaseCoords: (value) => value,
  },
};

class EventSource {
  #listeners = new Map();

  addEventListener(type, listener) {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.#listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event) {
    for (const listener of this.#listeners.get(event.type) ?? []) {
      listener(event);
    }
  }
}

function createDisplayContext() {
  return new (class extends EventSource {
    config = {
      coordinateFormat: {
        toDatabaseCoords: (value) => value.clone?.() ?? value,
        toThreeJSCoords: (value) =>
          new TestVector3(value.x ?? 0, value.y ?? 0, value.z ?? 0),
      },
      initCameraPosition: new TestVector3(1, 2, 3),
      initCameraTarget: new TestVector3(4, 5, 6),
    };
  })();
}

function createFrame(center = new TestVector3(10, 20, 30)) {
  return {
    getSpatialCenter: () => center.clone(),
    st_bounds: {
      getSpatialBounds: () => ({
        xBounds: { contains: () => false },
        yBounds: { contains: () => false },
      }),
    },
  };
}

async function flushReact() {
  await act(async () => {});
}

beforeEach(() => {
  globalThis.ResizeObserver = ResizeObserverStub;
  resizeObservers.length = 0;
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("MainWindow", () => {
  it("uses an externally supplied main-window element", () => {
    const dom = document.createElement("div");
    const window = new MainWindow("Main", 2, dom);

    expect(window.dom).toBe(dom);
    expect(window.controls2D.domElement).toBe(dom);
    expect(window.controls3D.domElement).toBe(dom);

    window.dispose();
  });

  it("hosts its crosshair through React and preserves camera/control state", async () => {
    let window;
    const viewModes = [];

    await act(async () => {
      window = new MainWindow("Main", 2, document.createElement("div"));
    });
    document.body.appendChild(window.dom);
    const rootHost = document.createElement("div");
    document.body.appendChild(rootHost);
    const root = createRoot(rootHost);
    const updateCameraAspects = vi.spyOn(window, "updateCameraAspects");
    await act(async () => {
      root.render(createPortal(<MainWindowView window={window} />, window.dom));
    });
    window.addEventListener("viewMode-change", (event) =>
      viewModes.push(event.viewMode),
    );
    await flushReact();

    expect(window.name).toBe("Main");
    expect(window.layerId).toBe(2);
    expect(window.dom.id).toBe("");
    expect(window.dom.textContent).toContain("+");
    expect(window.getCamera()).toBe(window.camera2D);
    expect(window.getControls()).toBe(window.controls2D);
    expect(window.controls2D.enabled).toBe(true);
    expect(window.controls3D.enabled).toBe(false);
    expect(updateCameraAspects).toHaveBeenCalledOnce();
    expect(resizeObservers).toHaveLength(1);
    expect(resizeObservers[0].observe).toHaveBeenCalledWith(window.dom);

    await act(async () => {
      window.viewMode = "3D";
    });
    expect(viewModes).toEqual(["3D"]);
    expect(window.getCamera()).toBe(window.camera3D);
    expect(window.getControls()).toBe(window.controls3D);
    expect(window.controls2D.enabled).toBe(false);
    expect(window.controls3D.enabled).toBe(true);

    await act(async () => {
      window.enableCameraControls = false;
    });
    expect(window.controls2D.enabled).toBe(false);
    expect(window.controls3D.enabled).toBe(false);

    await act(async () => root.unmount());
    expect(resizeObservers[0].disconnect).toHaveBeenCalledOnce();
    await act(async () => window.dispose());
    expect(window.dom.innerHTML).toBe("");
  });
});

describe("MinimapWindow", () => {
  it("reports different coordinates for different pointer positions", () => {
    const dom = document.createElement("div");
    vi.spyOn(dom, "getBoundingClientRect").mockReturnValue({
      bottom: 100,
      height: 100,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const mainWindow = new MainWindow("Main", 0, document.createElement("div"));
    const minimapWindow = new MinimapWindow(
      "Minimap",
      1,
      config as unknown as ConstructorParameters<typeof MinimapWindow>[2],
      mainWindow,
      dom,
    );
    minimapWindow.updateCameraAspects();

    const first = minimapWindow.getPointerTooltipContent(
      new MouseEvent("pointermove", {
        clientX: 25,
        clientY: 25,
      }) as PointerEvent,
    );
    const second = minimapWindow.getPointerTooltipContent(
      new MouseEvent("pointermove", {
        clientX: 75,
        clientY: 75,
      }) as PointerEvent,
    );

    expect(first).toMatch(/\(-?\d+\.\d{3}, -?\d+\.\d{3}\)/);
    expect(second).toMatch(/\(-?\d+\.\d{3}, -?\d+\.\d{3}\)/);
    expect(second).not.toBe(first);

    minimapWindow.dispose();
    mainWindow.dispose();
  });

  it("uses an externally supplied minimap element", () => {
    const dom = document.createElement("div");
    const mainWindow = new MainWindow("Main", 0, document.createElement("div"));
    const minimapWindow = new MinimapWindow(
      "Minimap",
      1,
      config as unknown as ConstructorParameters<typeof MinimapWindow>[2],
      mainWindow,
      dom,
    );

    expect(minimapWindow.dom).toBe(dom);
    expect(minimapWindow.controls2D.domElement).toBe(dom);

    const minimapControlsDispose = vi.spyOn(
      minimapWindow.controls2D,
      "dispose",
    );
    const main2DControlsDispose = vi.spyOn(mainWindow.controls2D, "dispose");
    const main3DControlsDispose = vi.spyOn(mainWindow.controls3D, "dispose");

    minimapWindow.dispose();
    mainWindow.dispose();

    expect(minimapControlsDispose).toHaveBeenCalledOnce();
    expect(main2DControlsDispose).toHaveBeenCalledOnce();
    expect(main3DControlsDispose).toHaveBeenCalledOnce();
  });

  it("hosts camera markers through React and tracks the main window camera state", async () => {
    let mainWindow;
    let minimapWindow;

    await act(async () => {
      mainWindow = new MainWindow("Main", 0, document.createElement("div"));
      minimapWindow = new MinimapWindow(
        "Minimap",
        1,
        config as unknown as ConstructorParameters<typeof MinimapWindow>[2],
        mainWindow,
        document.createElement("div"),
      );
    });
    document.body.appendChild(minimapWindow.dom);
    const rootHost = document.createElement("div");
    document.body.appendChild(rootHost);
    const root = createRoot(rootHost);
    const updateCameraAspects = vi.spyOn(minimapWindow, "updateCameraAspects");
    await act(async () => {
      root.render(
        createPortal(
          <MinimapWindowView window={minimapWindow} />,
          minimapWindow.dom,
        ),
      );
    });
    await flushReact();

    expect(minimapWindow.name).toBe("Minimap");
    expect(minimapWindow.layerId).toBe(1);
    expect(minimapWindow.dom.textContent).toContain("🞜");
    expect(minimapWindow.dom.textContent).toContain("⮞");
    expect(minimapWindow.dom.dataset.coordinateTooltipReady).toBe("true");
    expect(minimapWindow.getCamera()).toBe(minimapWindow.camera2D);
    expect(minimapWindow.getControls()).toBe(minimapWindow.controls2D);
    expect(minimapWindow.controls2D.enabled).toBe(true);
    expect(updateCameraAspects).toHaveBeenCalledOnce();
    expect(resizeObservers).toHaveLength(1);
    expect(resizeObservers[0].observe).toHaveBeenCalledWith(minimapWindow.dom);

    const onRectChange = vi.fn();
    minimapWindow.addEventListener("rect-change", onRectChange);
    const rect = { top: 48, left: 64, width: 320, height: 192 };
    minimapWindow.setRect(rect);
    expect(minimapWindow.rect).toBe(rect);
    expect(onRectChange).toHaveBeenCalledOnce();
    minimapWindow.removeEventListener("rect-change", onRectChange);

    await act(async () => {
      minimapWindow.enableCameraControls = false;
    });
    expect(minimapWindow.controls2D.enabled).toBe(false);

    await act(async () => root.unmount());
    expect(minimapWindow.dom.dataset.coordinateTooltipReady).toBeUndefined();
    expect(resizeObservers[0].disconnect).toHaveBeenCalledOnce();
    await act(async () => {
      minimapWindow.dispose();
      mainWindow.dispose();
    });
    expect(minimapWindow.dom.innerHTML).toBe("");
  });
});
describe("DefaultSceneDisplay", () => {
  it("reports React-mounted display elements before an imperative display is available", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const onReady = vi.fn();
    document.body.append(container);

    await act(async () => {
      root.render(<DefaultSceneDisplayHost display={null} onReady={onReady} />);
    });

    const displayDom = container.querySelector("#display-container");
    const canvas = displayDom?.querySelector("canvas");
    const mainWindowDom = container.querySelector("#main-window");
    const minimapWindowDom = container.querySelector("#minimap-window");
    expect(displayDom).toBeInstanceOf(HTMLDivElement);
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(mainWindowDom).toBeInstanceOf(HTMLDivElement);
    expect(minimapWindowDom).toBeInstanceOf(HTMLDivElement);
    expect(mainWindowDom?.style.position).toBe("absolute");
    expect(mainWindowDom?.style.width).toBe("100%");
    expect(onReady).toHaveBeenCalledWith({
      canvas,
      displayDom,
      mainWindowDom,
      minimapWindowDom,
    });

    await act(async () => root.unmount());
  });

  it("renders minimap layout from the display rectangle state", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const context = createDisplayContext();
    let elements;
    let display = null;
    const onReady = vi.fn((nextElements) => {
      elements = nextElements;
    });
    document.body.append(container);

    await act(async () => {
      root.render(
        <DefaultSceneDisplayHost display={display} onReady={onReady} />,
      );
    });
    display = new DefaultSceneDisplay(
      context as unknown as ConstructorParameters<
        typeof DefaultSceneDisplay
      >[0],
      elements,
    );
    await act(async () => {
      root.render(
        <DefaultSceneDisplayHost display={display} onReady={onReady} />,
      );
    });

    const minimapDom =
      container.querySelector<HTMLDivElement>("#minimap-window");
    expect(minimapDom?.style.cssText).toContain("top: 32px");
    expect(minimapDom?.style.cssText).toContain("left: 32px");
    await act(async () => {
      display.windows.minimap.setRect({
        top: 48,
        left: 64,
        width: 320,
        height: 192,
      });
    });
    expect(minimapDom?.style.cssText).toContain("top: 48px");
    expect(minimapDom?.style.cssText).toContain("left: 64px");
    expect(minimapDom?.style.cssText).toContain("width: 320px");
    expect(minimapDom?.style.cssText).toContain("height: 192px");

    await act(async () => root.unmount());
    display.dispose();
  });

  it("uses supplied React-owned elements and recenters cameras on frame navigation", async () => {
    const context = createDisplayContext();
    const elements = {
      canvas: document.createElement("canvas"),
      displayDom: document.createElement("div"),
      mainWindowDom: document.createElement("div"),
      minimapWindowDom: document.createElement("div"),
    };
    let display;

    await act(async () => {
      display = new DefaultSceneDisplay(
        context as unknown as ConstructorParameters<
          typeof DefaultSceneDisplay
        >[0],
        elements,
      );
    });

    expect(display.windows.main).toBeInstanceOf(MainWindow);
    expect(display.windows.minimap).toBeInstanceOf(MinimapWindow);
    expect(display.dom).toBe(elements.displayDom);
    expect(display.canvas).toBe(elements.canvas);
    expect(display.windows.main.dom).toBe(elements.mainWindowDom);
    expect(display.windows.minimap.dom).toBe(elements.minimapWindowDom);

    const setPose = vi.spyOn(display.windows.main, "setPose3D");
    const panCamera = vi.spyOn(display.windows.main, "panCamera3D");

    const manualPosition = new Vector3(5, 6, 7);
    const manualTarget = new Vector3(8, 9, 10);
    await act(async () => {
      display.setMainCameraPose(manualPosition, manualTarget);
      display.panMainCamera(manualPosition);
    });
    expect(setPose).toHaveBeenLastCalledWith(manualPosition, manualTarget);
    expect(panCamera).toHaveBeenLastCalledWith(manualPosition);

    const frame = createFrame();
    await act(async () => {
      context.dispatchEvent({
        type: "nav-frame",
        prevFrame: null,
        frame,
      });
    });

    const [navPosition, navTarget] = setPose.mock.calls.at(-1);
    expect((navPosition as any).equals(new Vector3(11, 22, 33))).toBe(true);
    expect((navTarget as any).equals(new Vector3(14, 25, 36))).toBe(true);

    await act(async () => display.dispose());
    expect(display.dom.innerHTML).toBe("");
  });
});
