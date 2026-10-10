import { Queue } from "async-await-queue";

import type { EditableBranch } from "../labelset";
import type { EditableFrame } from "../nav";
import type { SceneContext } from "../scene";
import { VanillaEventDispatcher } from "../utils";

import type {
  DataLoader,
  DownloadProgress,
  DownloadProgressListener,
} from "./DataLoader";

/**
 * Defines each event that can be dispatched by {@link DataView}.
 */
export interface DataViewEventMap {
  beforeload: {};
  afterload: {};
  progress: DownloadProgress;
}

/**
 * Interface for objects that provide a view of data that updates based on the active frame.
 */
export interface DataView<D> extends VanillaEventDispatcher<DataViewEventMap> {
  /**
   * The data to display, if any.
   */
  readonly data: D | null;

  /**
   * The frame for which the data is displayed.
   */
  readonly frame: EditableFrame | null;

  /**
   * `true` if the data to display is being loaded; otherwise, `false`.
   */
  readonly isLoading: boolean;

  /** Byte progress for the active download, or `null` when unavailable. */
  readonly downloadProgress: DownloadProgress | null;

  /** Human-readable error from the latest load, or `null` after success/retry. */
  readonly loadError: string | null;

  /** Retries loading the currently selected frame. */
  retry(): Promise<void>;

  /**
   * Displays the data for the given frame, loading the corresponding data if necessary.
   *
   * @param frame The frame to display the data for.
   * @returns A promise representing the task.
   */
  setFrame(frame: EditableFrame | null): Promise<void>;

  /**
   * Requests that data be loaded in memory for a frame, and returns it.
   *
   * @param frame The frame to load the data for.
   * @returns A promise that resolves to the requested data; fallbacks
   * to `null` if the request has failed.
   */
  getData(frame: EditableFrame, signal?: AbortSignal): Promise<D | null>;

  /**
   * Tests whether the data for a frame is in the cache.
   *
   * @param frame The frame to load the data for.
   * @returns `true` if the data for a frame is in the cache; otherwise, `false`.
   */
  isCached(frame: EditableFrame): boolean;

  /**
   * Disposes of resources owned by this view, if any.
   */
  dispose?(): void;
}

/**
 * Represents a view of data that updates based on the active frame.
 */
export class BaseDataView<D>
  extends VanillaEventDispatcher<DataViewEventMap>
  implements DataView<D>
{
  static #disposeData(value: unknown): void {
    if (
      value != null &&
      typeof value === "object" &&
      "dispose" in value &&
      typeof value.dispose === "function"
    ) {
      value.dispose();
    }
  }

  #data: D | null;

  /** The data to display, if any. */
  get data(): D | null {
    return this.#data;
  }

  protected _frame: EditableFrame | null;

  /** The frame for which the data is displayed. */
  get frame(): EditableFrame | null {
    return this._frame;
  }

  /** Ensures that all load operations are run sequentially. */
  #loadQueue = new Queue(1, 0);

  /** `true` if the data to display is being loaded; otherwise, `false`. */
  get isLoading(): boolean {
    const { waiting, running } = this.#loadQueue.stat();
    return waiting > 0 || running > 0;
  }

  #downloadProgress: DownloadProgress | null = null;

  #loadError: string | null = null;

  get downloadProgress(): DownloadProgress | null {
    return this.#downloadProgress;
  }

  get loadError(): string | null {
    return this.#loadError;
  }

  /**
   * A monotonically increasing generation, incremented on every load.
   *
   * Frame identity alone cannot detect staleness: a retry may return to the
   * SAME frame id (A -> B -> A), so a stale failure for the first visit must
   * not publish over the retry. Each load captures the generation and only
   * the latest one may publish.
   */
  #loadGeneration = 0;

  #loadController: AbortController | null = null;

  protected loader: DataLoader<D>;

  /**
   * Creates a new view of data that updates based on the active frame.
   *
   * @param loader Loads the data from the server on demand.
   */
  constructor(loader: DataLoader<D>) {
    super();

    this.loader = loader;

    this.#data = null;
    this._frame = null;
  }

  /**
   * Updates the data stored in this layer according to its current state.
   *
   * Note that display data is `null` while waiting for it to load.
   * You can listen to this change through the `'beforeload'` event.
   *
   * @returns A promise representing the task.
   */
  protected async _reloadData(): Promise<void> {
    // Capture the request target and generation. Navigation can change
    // `_frame` while a loader promise is pending; such a stale response
    // must never replace the data for the newer load, including a retry
    // that returns to the same frame id.
    const requestedFrame = this.frame;
    const generation = ++this.#loadGeneration;
    this.#loadController?.abort();
    const controller = new AbortController();
    this.#loadController = controller;

    return this.#loadQueue
      .run(async () => {
        if (generation !== this.#loadGeneration) return false;
        if (this.frame?.id !== requestedFrame?.id) return false;

        this.dispatchEvent({ type: "beforeload" });

        BaseDataView.#disposeData(this.#data);
        this.#data = null;
        this.#downloadProgress = null;
        this.#loadError = null;

        const loaded =
          requestedFrame == null
            ? null
            : await this.getData(
                requestedFrame,
                controller.signal,
                (progress) => {
                  if (
                    generation !== this.#loadGeneration ||
                    this.frame?.id !== requestedFrame.id
                  )
                    return;
                  this.#downloadProgress = progress;
                  this.dispatchEvent({
                    type: "progress",
                    ...progress,
                  });
                },
              );
        if (generation !== this.#loadGeneration) return false;
        if (this.frame?.id !== requestedFrame?.id) return false;

        this.#data = loaded;
        return true;
      })
      .then((published) => {
        if (published) {
          this.dispatchEvent({ type: "afterload" });
        }
      })
      .catch((reason: unknown) => {
        if (
          generation === this.#loadGeneration &&
          this.frame?.id === requestedFrame?.id
        ) {
          this.#loadError =
            reason instanceof Error ? reason.message : String(reason);
          this.dispatchEvent({ type: "afterload" });
        }
      });
  }

  /**
   * Displays the data for the given frame, loading the corresponding data if necessary.
   *
   * @param frame The frame to display the data for.
   * @returns A promise representing the task.
   */
  async setFrame(frame: EditableFrame | null): Promise<void> {
    if (this._frame?.id === frame?.id) return;

    // Set before loading the data so that repeated calls only invoke _reloadData once
    this._frame = frame;

    await this._reloadData();
  }

  async retry(): Promise<void> {
    await this._reloadData();
  }

  /**
   * Requests that data be loaded in memory for a frame, and returns it.
   *
   * @param frame The frame to load the data for.
   * @returns A promise that resolves to the requested data. Abortions resolve
   * to `null`; other failures reject and are exposed through `loadError`.
   */
  async getData(
    frame: EditableFrame,
    signal?: AbortSignal,
    onProgress?: DownloadProgressListener,
  ): Promise<D | null> {
    try {
      return await this.loader.getData(frame, signal, onProgress);
    } catch (reason: unknown) {
      if (reason instanceof DOMException && reason.name === "AbortError")
        return null;
      throw reason;
    }
  }

  /**
   * Tests whether the data for a frame is in the cache.
   *
   * @param frame The frame to load the data for.
   * @returns `true` if the data for a frame is in the cache; otherwise, `false`.
   */
  isCached(frame: EditableFrame): boolean {
    return this.loader.isCached(frame);
  }

  /**
   * Disposes of resources owned by this data view.
   */
  dispose() {
    this.#loadController?.abort();
    BaseDataView.#disposeData(this.#data);
    this.#data = null;
    this.loader.dispose?.();
  }
}

/**
 * Represents a view of source data that updates based on the active frame.
 */
export class SourceDataView<D> extends BaseDataView<D> {
  /**
   * Creates a new view of source data that updates based on the active frame.
   *
   * @param loader Loads the data from the server on demand.
   */
  constructor(loader: DataLoader<D>) {
    super(loader);
  }
}

/**
 * Represents a view of label data that updates based on the active frame.
 */
export class LabelDataView<D> extends BaseDataView<D> {
  /** A handle to the state of the scene. */
  readonly context: SceneContext<any>;

  /** The currently selected label branch, or `null` if none. */
  get currentBranch(): EditableBranch | null {
    return this.context.currentLabelBranch;
  }

  /**
   * Creates a new view of label data that updates based on the active frame.
   *
   * @param loader Loads the data from the server on demand.
   * @param context A handle to the state of the scene.
   */
  constructor(loader: DataLoader<D>, context: SceneContext<any>) {
    super(loader);

    this.context = context;
  }
}
