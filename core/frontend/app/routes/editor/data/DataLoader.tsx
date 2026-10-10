import { FrameSortFunction } from "../nav";
import type { EditableFrame } from "../nav";
import type { SceneContext } from "../scene";

import type { BaseDataLookup, BulkDataLookup } from "./DataLookup";

export interface DownloadProgress {
  loadedBytes: number;
  totalBytes: number | null;
}

export type DownloadProgressListener = (progress: DownloadProgress) => void;

/**
 * Interface for classes that load data for a given frame.
 */
export interface DataLoader<D> {
  /**
   * Requests that data be loaded in memory for a frame, and returns it.
   *
   * @param frame The frame to load the data for.
   * @returns A promise that resolves to the requested data.
   */
  getData(
    frame: EditableFrame,
    signal?: AbortSignal,
    onProgress?: DownloadProgressListener,
  ): Promise<D>;

  /**
   * Tests whether the data for a frame is in the cache.
   *
   * @param frame The frame to load the data for.
   * @returns `true` if the data for a frame is in the cache; otherwise, `false`.
   */
  isCached(frame: EditableFrame): boolean;

  /**
   * Disposes of resources owned by this loader, if any.
   */
  dispose?(): void;
}

/**
 * Given a frame, loads data for that single frame.
 */
export class UnitDataLoader<D> implements DataLoader<D> {
  /** Finds the data for each frame. */
  readonly lookup: BaseDataLookup<D>;

  /**
   * Creates a new data loader for single frames.
   *
   * @param lookup Finds the data for each frame.
   */
  constructor(lookup: BaseDataLookup<D>) {
    this.lookup = lookup;
  }

  /**
   * Requests that data be loaded in memory for a frame, and returns it.
   *
   * @param frame The frame to load the data for.
   * @returns A promise that resolves to the requested data.
   */
  async getData(
    frame: EditableFrame,
    signal?: AbortSignal,
    onProgress?: DownloadProgressListener,
  ): Promise<D> {
    return this.lookup.getData(frame, true, signal, onProgress);
  }

  /**
   * Tests whether the data for a frame is in the cache.
   *
   * @param frame The frame to load the data for.
   * @returns `true` if the data for a frame is in the cache; otherwise, `false`.
   */
  isCached(frame: EditableFrame): boolean {
    return this.lookup.isCached(frame);
  }

  /**
   * Disposes of resources owned by this loader.
   */
  dispose() {
    this.lookup.dispose?.();
  }
}

/**
 * Given a frame, loads data composed from the data for that single frame as well as that
 * for neighbouring frames.
 *
 * @param W The type of data that represents the sliding window.
 * (This is usually a container that consists of `U` from any number of frames.)
 * @param U The type of data to display for an individual frame.
 * (This corresponds to a unit in the window.)
 */
export abstract class WindowDataLoader<W, U> implements DataLoader<W> {
  /** Finds the data for each frame. */
  readonly lookup: BulkDataLookup<U>;

  /** Represents the active scene. */
  readonly context: SceneContext<any>;

  /** Maximum number of frames on either side of the active frame's time path. */
  timePathRange: number;

  /**
   * Creates a new data loader for a sliding window of frames.
   *
   * @param lookup Finds the data for each frame.
   * @param context Represents the active scene.
   * @param timePathRange The maximum number of adjacent frames on either side of
   * the active frame in the time-sorted frame path.
   */
  constructor(
    lookup: BulkDataLookup<U>,
    context: SceneContext<any>,
    timePathRange: number,
  ) {
    this.lookup = lookup;
    this.context = context;
    this.timePathRange = timePathRange;
  }

  /**
   * Combines the data from individual frames into a window.
   *
   * @param windowData The data to combine.
   * @returns The combined data.
   */
  protected abstract combineData(windowData: readonly U[]): W;

  readonly #backgroundListeners = new Set<
    (frame: EditableFrame, data: W) => void
  >();

  addBackgroundLoadListener(
    listener: (frame: EditableFrame, data: W) => void,
  ): void {
    this.#backgroundListeners.add(listener);
  }

  removeBackgroundLoadListener(
    listener: (frame: EditableFrame, data: W) => void,
  ): void {
    this.#backgroundListeners.delete(listener);
  }

  /**
   * Gets the window centered around a frame.
   *
   * @param frame The query frame.
   * @returns An array containing each frame
   * within {@link WindowDataLoader#timePathRange} positions of the given frame
   * in the time-sorted path. Frames sharing a timestamp still occupy separate
   * path positions.
   */
  getFramesInWindow(frame: EditableFrame): readonly EditableFrame[] {
    const path = FrameSortFunction.TXY.sortedFrames(this.context.frames);
    const idx = path.indexOf(frame);
    if (idx < 0) return [];

    const start = Math.max(0, idx - this.timePathRange);
    const end = Math.min(path.length, idx + this.timePathRange + 1);
    return path.slice(start, end);
  }

  /**
   * Requests that data be loaded in memory for a frame, and returns it.
   *
   * @param frame The frame to load the data for.
   * @returns A promise that resolves to the requested data.
   */
  async getData(
    frame: EditableFrame,
    signal?: AbortSignal,
    onProgress?: DownloadProgressListener,
  ): Promise<W> {
    const [currentData] = await this.lookup.bulkGetData(
      [frame],
      true,
      signal,
      onProgress,
    );
    const neighbors = this.getFramesInWindow(frame).filter(
      ({ id }) => id !== frame.id,
    );
    if (neighbors.length > 0) {
      void this.lookup
        .bulkGetData(neighbors, true, signal)
        .then((neighborResults) => {
          neighborResults.forEach((neighborData) => {
            if (!signal?.aborted) {
              const combined = this.combineData([neighborData]);
              for (const listener of this.#backgroundListeners)
                listener(frame, combined);
            }
          });
        })
        .catch((reason: unknown) => {
          if (!(
            reason instanceof DOMException && reason.name === "AbortError"
          )) {
            console.error("Failed to load neighboring frame data:", reason);
          }
        });
    }
    return this.combineData([currentData]);
  }

  /**
   * Tests whether the data for a frame is in the cache.
   *
   * @param frame The frame to load the data for.
   * @returns `true` if the data for a frame is in the cache; otherwise, `false`.
   */
  isCached(frame: EditableFrame): boolean {
    return this.lookup.isCached(frame);
  }

  /**
   * Disposes of resources owned by this loader.
   */
  dispose() {
    this.#backgroundListeners.clear();
    this.lookup.dispose?.();
  }
}
