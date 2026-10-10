import type { DataView as DataViewType } from "../../data";
import type { SceneContext } from "../SceneContext";
import type { WindowMapper } from "../display";

import { BaseSceneLayer } from "./SceneLayer.tsx";

/**
 * Represents a layer that displays data in the scene.
 *
 */
export class DataLayer<
  WM extends WindowMapper = WindowMapper,
  D extends {} | null = null,
> extends BaseSceneLayer<WM> {
  /**
   * A view of the data to display in this layer.
   */
  readonly dataView: DataViewType<D>;

  /**
   * Contains logic to run before the data to display is switched to a different one.
   *
   * @protected
   */
  onBeforeUpdateData() {}

  /**
   * Contains logic to run after the data to display is switched to a different one.
   *
   * @protected
   */
  onAfterUpdateData() {}

  /**
   * Handles the event before the data to display is switched to a different one.
   */
  #onBeforeUpdateData = () => {
    this.onBeforeUpdateData();
    this.requestRender();
  };

  /**
   * Handles the event after the data to display is switched to a different one.
   */
  #onAfterUpdateData = () => {
    this.onAfterUpdateData();
    this.requestRender();
  };

  /**
   * Creates a new data layer.
   *
   * @param context A handle to the state of the scene.
   * @param name The display name of this layer.
   * @param dataView A view of the data to display in the layer.
   */
  constructor(
    context: SceneContext<WM>,
    name: string,
    dataView: DataViewType<D>,
  ) {
    super(context, name);

    this.dataView = dataView;
    this.dataView.addEventListener("beforeload", this.#onBeforeUpdateData);
    this.dataView.addEventListener("afterload", this.#onAfterUpdateData);
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose() {
    this.dataView.removeEventListener("beforeload", this.#onBeforeUpdateData);
    this.dataView.removeEventListener("afterload", this.#onAfterUpdateData);
    this.dataView.dispose?.();

    super.dispose();
  }
}

/**
 * Represents a layer that displays source data in the scene.
 *
 */
export class SourceDataLayer<
  WM extends WindowMapper = WindowMapper,
  D extends {} | null = null,
> extends DataLayer<WM, D> {}

/**
 * Represents a layer that displays label data in the scene.
 *
 */
export class LabelDataLayer<
  WM extends WindowMapper = WindowMapper,
  D extends {} | null = null,
> extends DataLayer<WM, D> {}
