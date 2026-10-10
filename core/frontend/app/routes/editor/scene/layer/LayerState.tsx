import { VanillaEventDispatcher } from "../../utils";
import type { SceneDisplay, WindowMapper } from "../display";

/**
 * Defines each event that can be dispatched by {@link LayerState}.
 */
export interface LayerStateEventMap {
  /** The event when the state of the layer has been updated. */
  change: {};
}

/**
 * Represents the state of a layer.
 */
export class LayerState<
  WM extends WindowMapper = WindowMapper,
> extends VanillaEventDispatcher<LayerStateEventMap> {
  /**
   * A handle to the display of the scene.
   */
  readonly display: SceneDisplay<WM>;

  #enabled: boolean;

  /**
   * `true` if the layer is enabled; otherwise, `false`.
   *
   * When the layer is disabled, its `three.js` objects are prevented from being
   * displayed in the application, regardless of the setting of {@link LayerState#isVisible}.
   *
   * Implementators of {@link SceneLayer} should prevent user interaction with
   * the layer while it is disabled.
   */
  get enabled(): boolean {
    return this.#enabled;
  }

  set enabled(value: boolean) {
    if (this.#enabled !== value) {
      this.#enabled = value;

      this.dispatchEvent({ type: "change" });
    }
  }

  #visible: Record<string, boolean>;

  /**
   * Instantiates a new state for a layer.
   */
  constructor(display: SceneDisplay<WM>) {
    super();

    this.display = display;

    this.#enabled = true;

    this.#visible = Object.fromEntries(
      Object.keys(display.windows).map((k) => [k, true]),
    );
  }

  /**
   * Tests whether the layer is visible in a window.
   */
  isVisible(key: keyof WM & string): boolean {
    return this.#visible[key];
  }

  /**
   * Sets whether the layer is visible in a window.
   */
  setVisible(key: keyof WM & string, value: boolean): void {
    if (this.#visible[key] !== value) {
      this.#visible[key] = value;

      this.dispatchEvent({ type: "change" });
    }
  }
}
