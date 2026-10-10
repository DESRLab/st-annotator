/* @vitest-environment jsdom */

import { EventDispatcher, Scene, type Camera } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SceneRenderer } from "../../../../../../app/routes/editor/scene/display/SceneRenderer";

import type { SceneDisplay, SceneWindow } from ".";

interface WindowRect {
  bottom: number;
  height: number;
  left: number;
  top: number;
  width: number;
}

/**
 * A stand-in for THREE.WebGLRenderer mirroring the real one's sizing
 * semantics (the backing store holds device pixels, `setSize` receives
 * CSS pixels), without needing a WebGL context.
 */
const { FakeWebGLRenderer } = vi.hoisted(() => {
  class FakeWebGLRenderer {
    readonly domElement: HTMLCanvasElement;
    readonly setSizeCalls: { height: number; width: number }[] = [];
    readonly viewportCalls: (readonly number[])[] = [];
    renderCalls = 0;
    disposed = false;
    #pixelRatio = 1;

    constructor({ canvas }: { canvas?: HTMLCanvasElement }) {
      this.domElement = canvas ?? document.createElement("canvas");
    }

    setPixelRatio(ratio: number): void {
      this.#pixelRatio = ratio;
    }

    getPixelRatio(): number {
      return this.#pixelRatio;
    }

    setScissorTest(): void {}

    setSize(width: number, height: number): void {
      this.setSizeCalls.push({ height, width });
      this.domElement.width = Math.floor(width * this.#pixelRatio);
      this.domElement.height = Math.floor(height * this.#pixelRatio);
    }

    setViewport(...args: number[]): void {
      this.viewportCalls.push(args);
    }

    setScissor(): void {}

    render(): void {
      this.renderCalls += 1;
    }

    dispose(): void {
      this.disposed = true;
    }
  }

  return { FakeWebGLRenderer };
});

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  return { ...actual, WebGLRenderer: FakeWebGLRenderer };
});

/** A ResizeObserver stub that observes but never reports, so that layout updates can only come through events. */
class SilentResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

function mockRect(elem: Element, rect: WindowRect): void {
  vi.spyOn(elem, "getBoundingClientRect").mockReturnValue({
    ...rect,
    right: rect.left + rect.width,
    x: rect.left,
    y: rect.top,
    toJSON: () => rect,
  } as DOMRect);
}

function makeWindow(name: string, rect: WindowRect) {
  const dom = document.createElement("div");
  mockRect(dom, rect);

  const camera = { layers: { set: (): void => {} } } as unknown as Camera;
  const sceneWindow = Object.assign(new EventDispatcher(), {
    dom,
    getCamera: (): Camera => camera,
    layerId: 1,
    name,
  });

  return sceneWindow as unknown as SceneWindow & { dom: HTMLDivElement };
}

function makeDisplay() {
  const canvas = document.createElement("canvas");
  document.body.appendChild(document.createElement("div")).appendChild(canvas);
  mockRect(canvas, { bottom: 200, height: 200, left: 0, top: 0, width: 300 });

  const minimap = makeWindow("minimap", {
    bottom: 60,
    height: 50,
    left: 10,
    top: 10,
    width: 100,
  });
  const display = {
    canvas,
    context: {},
    windows: { minimap },
  } as unknown as SceneDisplay;

  return { canvas, display, minimap };
}

interface TestRenderer {
  dispose(): void;
  render(scene: Scene): void;
  renderer: FakeWebGLRenderer;
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", SilentResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("SceneRenderer", () => {
  it.each([1, 2])(
    "resizes the backing store once at pixel ratio %i",
    (pixelRatio) => {
      vi.stubGlobal("devicePixelRatio", pixelRatio);
      const { display } = makeDisplay();
      const renderer = new SceneRenderer(display) as unknown as TestRenderer;

      const scene = new Scene();
      renderer.render(scene);
      renderer.render(scene);
      renderer.render(scene);

      // The size is stable across frames, so the backing store is
      // resized exactly once even at a device pixel ratio above 1.
      expect(renderer.renderer.setSizeCalls).toEqual([
        { height: 200, width: 300 },
      ]);
      expect(display.canvas.width).toBe(300 * pixelRatio);
      expect(display.canvas.height).toBe(200 * pixelRatio);

      renderer.dispose();
    },
  );

  it("re-reads the layout when a window reports a geometry change", () => {
    vi.stubGlobal("devicePixelRatio", 1);
    const { display, minimap } = makeDisplay();
    const renderer = new SceneRenderer(display) as unknown as TestRenderer;

    const scene = new Scene();
    renderer.render(scene);
    const [, initialBottom, initialWidth] =
      renderer.renderer.viewportCalls.at(-1)!;
    expect(initialWidth).toBe(99); // rect.width - 1

    // Moving the window changes only its position, which resize
    // observation does not cover. Without the report, the cached
    // layout (and viewport) stays stale.
    mockRect(minimap.dom, {
      bottom: 110,
      height: 50,
      left: 60,
      top: 60,
      width: 100,
    });
    renderer.render(scene);
    expect(renderer.renderer.viewportCalls.at(-1)).toEqual(
      renderer.renderer.viewportCalls.at(-2),
    );

    minimap.dispatchEvent({ type: "rect-change" });
    renderer.render(scene);
    const [, movedBottom, movedWidth] = renderer.renderer.viewportCalls.at(-1)!;
    expect(movedWidth).toBe(initialWidth);
    expect(movedBottom).not.toBe(initialBottom);

    renderer.dispose();
  });

  it("requests a frame when observed window geometry changes", () => {
    vi.stubGlobal("devicePixelRatio", 1);
    const { display, minimap } = makeDisplay();
    const requestRender = vi.fn();
    const renderer = new SceneRenderer(
      display,
      display.canvas,
      requestRender,
    ) as unknown as TestRenderer;

    minimap.dispatchEvent({ type: "rect-change" });
    expect(requestRender).toHaveBeenCalledOnce();

    renderer.dispose();
    minimap.dispatchEvent({ type: "rect-change" });
    expect(requestRender).toHaveBeenCalledOnce();
  });

  it.each([
    { height: 50, width: 1 },
    { height: 1, width: 100 },
    { height: 0, width: 0 },
  ])("skips zero-sized viewports: $width x $height", ({ height, width }) => {
    vi.stubGlobal("devicePixelRatio", 1);
    const { display, minimap } = makeDisplay();
    mockRect(minimap.dom, {
      bottom: height,
      height,
      left: 0,
      top: 0,
      width,
    });
    const renderer = new SceneRenderer(display) as unknown as TestRenderer;

    renderer.render(new Scene());

    expect(renderer.renderer.viewportCalls).toHaveLength(0);
    expect(renderer.renderer.renderCalls).toBe(0);
    renderer.dispose();
  });

  it("detaches from the display on disposal", () => {
    vi.stubGlobal("devicePixelRatio", 1);
    const { display, minimap } = makeDisplay();
    const renderer = new SceneRenderer(display) as unknown as TestRenderer;

    renderer.render(new Scene());
    renderer.dispose();

    expect(renderer.renderer.disposed).toBe(true);

    // Layout reports after disposal no longer reach the renderer.
    const layoutReads = vi.mocked(minimap.dom.getBoundingClientRect);
    layoutReads.mockClear();
    minimap.dispatchEvent({ type: "rect-change" });
    renderer.render(new Scene());
    expect(layoutReads).not.toHaveBeenCalled();
  });
});
