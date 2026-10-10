import type {
  SceneContext,
  DownloadProgressListener,
  EditableFrame,
} from "sta/app/editor";
import { UnitDataLoader, SourceDataView } from "sta/app/editor";

import type { PointCloud } from "./PointCloud";
import { PointCloudLookup } from "./PointCloudLookup";

/** Given a frame, loads point cloud data for that single frame. */
export class PointCloudLoader extends UnitDataLoader<PointCloud | null> {
  /** Finds the data for each frame. */
  readonly #lookup: PointCloudLookup;

  /** `true` if background removal is applied server-side; otherwise, `false`. */
  get removeBackground(): boolean {
    return this.#lookup.removeBackground;
  }

  set removeBackground(value: boolean) {
    this.#lookup.removeBackground = value;
  }

  /** `true` if area cropping is applied server-side; otherwise, `false`. */
  get cropArea(): boolean {
    return this.#lookup.cropArea;
  }

  set cropArea(value: boolean) {
    this.#lookup.cropArea = value;
  }

  /** Creates a new data loader for single frames. */
  constructor(lookup: PointCloudLookup) {
    super(lookup);

    this.#lookup = lookup;
  }
}

/** Represents a view of a point cloud that updates based on the active frame. */
export class PointCloudView extends SourceDataView<PointCloud | null> {
  /** Loads the data from the backend on demand. */
  readonly #loader: PointCloudLoader;

  /** `true` if background removal is applied server-side; otherwise, `false`. */
  get removeBackground(): boolean {
    return this.#loader.removeBackground;
  }

  /** `true` if area cropping is applied server-side; otherwise, `false`. */
  get cropArea(): boolean {
    return this.#loader.cropArea;
  }

  /**
   * Sets the options for which the data is displayed, loading the corresponding data
   * if necessary.
   */
  async setOptions(
    removeBackground: boolean,
    cropArea: boolean,
  ): Promise<void> {
    if (
      this.#loader.removeBackground === removeBackground &&
      this.#loader.cropArea === cropArea
    )
      return;

    this.#loader.removeBackground = removeBackground;
    this.#loader.cropArea = cropArea;

    await this._reloadData();
  }

  /**
   * Requests that data be loaded in memory for a frame, and returns it.
   *
   * Unlike the base implementation, a request aborted by a setting change
   * or disposal resolves to `null` silently: such an abort is an intentional
   * cancellation of a superseded request, not a load failure.
   */
  async getData(
    frame: EditableFrame,
    signal?: AbortSignal,
    onProgress?: DownloadProgressListener,
  ): Promise<PointCloud | null> {
    return this.loader
      .getData(frame, signal, onProgress)
      .then((pointCloud) => pointCloud?.clone() ?? null)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError")
          return null;
        throw reason;
      });
  }

  /** Creates a new view of point cloud data that updates based on the active frame. */
  static create(
    context: SceneContext<any>,
    maxCacheSize?: number,
  ): PointCloudView {
    const { config, views } = context;
    const lookup = PointCloudLookup.create(config, views, maxCacheSize);
    const loader = new PointCloudLoader(lookup);

    return new PointCloudView(loader);
  }

  /** Creates a new view of point cloud data that updates based on the active frame. */
  constructor(loader: PointCloudLoader) {
    super(loader);

    this.#loader = loader;
  }
}
