import type { EditorConfig } from "../config";
import type { EditableFrame } from "../nav";
import type { EditorViews } from "../views";
import type { DownloadProgressListener } from "./DataLoader";

/**
 * Interface for classes that read data from the backend.
 */
export interface DataReceiver<D> {
  /**
   * Gets the data for a frame, bypassing the cache.
   *
   * @param frame The frame to load the data for.
   * @returns A promise that resolves to the requested data.
   */
  getDataNoCache(
    frame: EditableFrame,
    signal?: AbortSignal,
    onProgress?: DownloadProgressListener,
  ): Promise<D>;

  /**
   * Disposes of resources owned by this receiver, if any.
   */
  dispose?(): void;
}

/**
 * Abstract base implementation of {@link DataReceiver}.
 */
export class BaseDataReceiver<D> implements DataReceiver<D> {
  /** The configuration of the application. */
  readonly config: EditorConfig;

  /** The interface of the application with the backend. */
  readonly views: EditorViews;

  /**
   * Creates a new data receiver.
   *
   * @param config The configuration of the application.
   * @param views The interface of the application with the backend.
   */
  constructor(config: EditorConfig, views: EditorViews) {
    this.config = config;
    this.views = views;
  }

  /**
   * Gets the data for a frame, bypassing the cache.
   *
   * @param frame The frame to load the data for.
   * @returns A promise that resolves to the requested data.
   */
  getDataNoCache(
    frame: EditableFrame,
    signal?: AbortSignal,
    _onProgress?: DownloadProgressListener,
  ): Promise<D> {
    throw new Error("Not implemented");
  }
}

/**
 * As {@link BaseDataReceiver}, but also supports reading a batch of data.
 */
export class BulkDataReceiver<D> extends BaseDataReceiver<D> {
  /**
   * Gets the data for a frame, bypassing the cache.
   *
   * @param frame The frame to load the data for.
   * @returns A promise that resolves to the requested data.
   */
  async getDataNoCache(
    frame: EditableFrame,
    signal?: AbortSignal,
    onProgress?: DownloadProgressListener,
  ): Promise<D> {
    const [data] = await this.bulkGetDataNoCache([frame], signal, onProgress);
    return data;
  }

  /**
   * Gets the data for any number of frames, bypassing the cache.
   *
   * @param frames Each frame to load the data for.
   * @returns A promise that resolves to the requested data
   * for each frame: the `i`th element corresponds to the data for the `i`th frame.
   */
  bulkGetDataNoCache(
    frames: readonly EditableFrame[],
    signal?: AbortSignal,
    _onProgress?: DownloadProgressListener,
  ): Promise<readonly D[]> {
    throw new Error("Not implemented");
  }
}
