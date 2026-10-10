import type { SceneContext } from "../SceneContext";

import type { SceneWindow } from "./SceneWindow.tsx";

export type WindowMapper = Record<string, SceneWindow>;

/**
 * Interface for objects that define how a scene is displayed to the user.
 */
export interface SceneDisplay<WM extends WindowMapper = WindowMapper> {
  /**
   * A handle to the state of the scene.
   */
  readonly context: SceneContext<WM>;

  /**
   * The DOM element representing this display.
   */
  readonly dom: HTMLDivElement;

  /**
   * A canvas onto which each component window of this display is rendered.
   */
  readonly canvas: HTMLCanvasElement;

  /**
   * Contains each component window of this display.
   */
  readonly windows: WM;

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose(): void;
}

/**
 * Abstract base implementation of {@link SceneDisplay}.
 */
export class BaseSceneDisplay<
  WM extends WindowMapper = WindowMapper,
> implements SceneDisplay<WM> {
  /**
   * A handle to the state of the scene.
   */
  readonly context: SceneContext<WM>;

  /**
   * The DOM element representing this display.
   */
  readonly dom: HTMLDivElement;

  /**
   * A canvas onto which each component window of this display is rendered.
   */
  readonly canvas: HTMLCanvasElement;

  /**
   * Contains each component window of this display.
   */
  readonly windows: WM;

  /**
   * Creates a new default display.
   *
   * @protected
   */
  constructor(
    context: SceneContext<WM>,
    windows: WM,
    elements: { canvas: HTMLCanvasElement; dom: HTMLDivElement },
  ) {
    this.context = context;

    this.dom = elements.dom;
    this.canvas = elements.canvas;
    this.windows = windows;
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose() {
    for (const window of Object.values(this.windows)) {
      window.dispose();
    }
  }
}
