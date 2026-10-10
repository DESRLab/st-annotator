import * as THREE from "three";

import type { SceneDisplay, WindowMapper } from "./SceneDisplay.tsx";
import type { SceneWindow } from "./SceneWindow.tsx";

/**
 * A cached snapshot of the layout of a display.
 */
interface SceneRendererLayout {
  /**
   * The bounding rect of the canvas onto which the display is rendered.
   */
  canvasRect: DOMRect;

  /**
   * The bounding rect of each window's DOM element.
   */
  windowRects: Map<SceneWindow, DOMRect>;
}

/**
 * Helper class to render a scene.
 */
export class SceneRenderer<WM extends WindowMapper = WindowMapper> {
  /** Requests a frame when observed display geometry changes. */
  readonly #requestRender: () => void;

  /**
   * The display to render the scene to.
   */
  display: SceneDisplay<WM>;

  /**
   * The renderer of the scene.
   */
  renderer: THREE.WebGLRenderer;

  /**
   * Observes the layout of the display's canvas and windows,
   * so that their bounding rects only need to be re-read when it changes.
   *
   * This is `null` if the environment does not support `ResizeObserver`;
   * in that case the layout is re-read on every frame, as before.
   */
  readonly #resizeObserver: ResizeObserver | null;

  /**
   * The cached layout of the display. Read lazily during the first render.
   */
  #layout: SceneRendererLayout | null = null;

  /**
   * Whether {@link #layout} may be stale and must be re-read before rendering.
   */
  #layoutDirty = true;

  /**
   * Creates a new scene renderer.
   */
  constructor(
    display: SceneDisplay<WM>,
    canvas: HTMLCanvasElement = display.canvas,
    requestRender: () => void = () => {},
  ) {
    this.display = display;
    this.#requestRender = requestRender;

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      canvas: canvas,
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setScissorTest(true);

    // The windows of a display are fixed for its entire lifetime,
    // so observing the initial set of elements covers the whole display.
    const ResizeObserverCtor = globalThis.ResizeObserver;
    this.#resizeObserver =
      ResizeObserverCtor == null
        ? null
        : new ResizeObserverCtor(this.#markLayoutDirty);
    this.#resizeObserver?.observe(canvas);
    for (const sceneWindow of Object.values(display.windows)) {
      this.#resizeObserver?.observe(sceneWindow.dom);
      // Resize observation does not cover position changes
      // (e.g. dragging the minimap), so windows also report
      // geometry changes that escape it through events.
      sceneWindow.addEventListener("rect-change", this.#markLayoutDirty);
    }
  }

  /**
   * Renders a scene to the display.
   */
  render(scene: THREE.Scene): void {
    const { renderer } = this;

    let layout = this.#layout;
    if (layout == null || this.#layoutDirty) {
      layout = this.#readLayout();
      this.#layout = layout;
      // Without a resize observer there is no layout-change signal,
      // so the layout must be re-read on every frame.
      this.#layoutDirty = this.#resizeObserver == null;
    }

    const canvas = renderer.domElement;
    const { width: canvasWidth, height: canvasHeight } = layout.canvasRect;

    if (canvas.parentElement != null) {
      // The canvas stores device pixels while the layout is measured in
      // CSS pixels, so compare them through the pixel ratio.
      const pixelRatio = renderer.getPixelRatio();
      const backingWidth = Math.floor(canvasWidth * pixelRatio);
      const backingHeight = Math.floor(canvasHeight * pixelRatio);
      if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
        renderer.setSize(canvasWidth, canvasHeight, false);
      }
    }

    for (const [sceneWindow, rect] of layout.windowRects) {
      // The offsets keep the rendered portion entirely inside of `sceneWindow.dom`
      const width = Math.max(rect.width - 1, 0);
      const height = Math.max(rect.height - 1, 0);
      const left = rect.left + 1;
      const bottom = canvasHeight - rect.bottom + 1;

      // Avoid issuing a draw call for collapsed or otherwise
      // zero-sized windows. WebGL viewports cannot display them.
      if (width <= 0 || height <= 0) continue;

      const camera = sceneWindow.getCamera();
      camera.layers.set(sceneWindow.layerId);

      // https://threejs.org/examples/#webgl_multiple_elements
      renderer.setViewport(left, bottom, width, height);
      renderer.setScissor(left, bottom, width, height);
      renderer.render(scene, camera);
    }
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose(): void {
    this.#resizeObserver?.disconnect();
    for (const sceneWindow of Object.values(this.display.windows)) {
      sceneWindow.removeEventListener("rect-change", this.#markLayoutDirty);
    }

    this.renderer.dispose();
  }

  /**
   * Reads the current layout of the display.
   */
  #readLayout(): SceneRendererLayout {
    const windowRects = new Map<SceneWindow, DOMRect>();
    for (const sceneWindow of Object.values(this.display.windows)) {
      windowRects.set(sceneWindow, sceneWindow.dom.getBoundingClientRect());
    }

    return {
      canvasRect: this.renderer.domElement.getBoundingClientRect(),
      windowRects,
    };
  }

  /**
   * Handles the event when the layout of the display may have changed.
   */
  #markLayoutDirty = (): void => {
    // All elements of a display leave the document together when it is
    // torn down. Disconnecting then releases this object from the
    // document's resize observer bookkeeping.
    if (!this.renderer.domElement.isConnected) {
      this.#resizeObserver?.disconnect();
      return;
    }

    this.#layoutDirty = true;
    this.#requestRender();
  };
}
