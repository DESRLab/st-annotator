import { StatusCodes as HTTPStatus } from "http-status-codes";
import * as THREE from "three";

import type {
  CacheKeyFunc,
  DataCacheOptions,
  DownloadProgressListener,
  EditorConfig,
  EditorViews,
  FrameLike,
} from "sta/app/editor";
import {
  BaseDataLookup,
  BaseDataReceiver,
  ApplyColormap,
  NormalizedValueFunc,
  PointBuffer,
  cmaps,
  readResponseArrayBuffer,
} from "sta/app/editor";

import { SENDER_KEY, getSettings } from "../../config";

import { PointCloud } from "./PointCloud";

interface PointCloudData {
  array: Float32Array;
  numPoints: number;
  numChannels: number;
  channelHeaders: string[];
}

/**
 * Estimates one cached point cloud's contribution to {@link PointCloudLookup}'s
 * size-bounded cache.
 *
 * A cloud retains the source channels plus the rendered XYZ and RGB buffers.
 * The result is clamped to a positive integer because `lru-cache` rejects a
 * size of zero, while a zero-point cloud is a legal (empty) source response.
 */
export function estimatePointCloudCacheSize(cloud: PointCloud | null): number {
  if (cloud == null) return 1;

  const byteLength =
    cloud.buffer.numPoints *
    (cloud.buffer.numChannels + 6) *
    Float32Array.BYTES_PER_ELEMENT;

  return Math.max(1, byteLength);
}

// Temporary values that will be overriden by the layer
const TEMP_BLENDER = new ApplyColormap(
  cmaps.get("rainbow"),
  new NormalizedValueFunc(0, 0, 0),
);
const TEMP_POINT_SIZE = 0;

/** Receives point clouds from the backend. */
export class PointCloudReceiver extends BaseDataReceiver<PointCloud | null> {
  readonly #pending = new Set<AbortController>();

  abortPending(): void {
    for (const controller of this.#pending) controller.abort();
    this.#pending.clear();
  }

  dispose(): void {
    this.abortPending();
  }

  /** `true` if background removal is applied server-side; otherwise, `false`. */
  removeBackground: boolean;

  /** `true` if area cropping is applied server-side; otherwise, `false`. */
  cropArea: boolean;

  /** Creates a new data lookup for point clouds. */
  constructor(
    config: EditorConfig,
    views: EditorViews,
    removeBackground?: boolean,
    cropArea?: boolean,
  ) {
    super(config, views);

    const defaults = getSettings(config);
    this.removeBackground =
      removeBackground ?? defaults.removeBackground ?? true;
    this.cropArea = cropArea ?? defaults.cropArea ?? true;
  }

  /** Gets the data of a point cloud for a frame. */
  async #getPointCloudData(
    frame: FrameLike,
    signal?: AbortSignal,
    onProgress?: DownloadProgressListener,
  ): Promise<PointCloudData | null> {
    const controller = new AbortController();
    signal?.addEventListener("abort", () => controller.abort(), {
      once: true,
    });
    if (signal?.aborted) controller.abort();
    this.#pending.add(controller);

    // A request superseded by a setting change (or by disposal) must never
    // return data, even when its response arrives before the abort is
    // processed; otherwise the stale payload would be published and cached
    // as if it belonged to the newest setting.
    const throwIfAborted = (): void => {
      if (controller.signal.aborted) {
        throw new DOMException(
          `The point cloud request at frame #${frame.id} was aborted`,
          "AbortError",
        );
      }
    };

    return this.views
      .bulkGetSourceData(
        SENDER_KEY,
        [frame.id],
        { remove_bg: this.removeBackground, crop_area: this.cropArea },
        controller.signal,
      )
      .then(async (response: Response) => {
        throwIfAborted();

        if (!response.ok) {
          throw new Error(await response.text());
        }

        // Typed as `number` so this compares plain status codes; comparing
        // the enum member directly would mix enum and non-enum types.
        const noContentStatus: number = HTTPStatus.NO_CONTENT;
        if (response.status === noContentStatus) return null;

        const data = await readResponseArrayBuffer(response, onProgress);

        const headers = response.headers;
        const numPointsStr = headers.get("X-Num-Points");
        const numChannelsStr = headers.get("X-Num-Channels");
        const channelHeadersStr = headers.get("X-Channel-Headers");

        if (
          numPointsStr == null ||
          numChannelsStr == null ||
          channelHeadersStr == null
        ) {
          throw new Error("Invalid headers");
        }

        const array = new Float32Array(data);
        const numPoints = Number(numPointsStr);
        const numChannels = Number(numChannelsStr);
        const channelHeaders: unknown = JSON.parse(channelHeadersStr);
        if (
          !Number.isInteger(numPoints) ||
          numPoints < 0 ||
          !Number.isInteger(numChannels) ||
          numChannels < 3 ||
          !Array.isArray(channelHeaders) ||
          channelHeaders.length !== numChannels ||
          !channelHeaders.every((header) => typeof header === "string") ||
          array.length !== numPoints * numChannels
        ) {
          throw new Error("Point cloud metadata does not match the payload");
        }

        throwIfAborted();

        return { array, numPoints, numChannels, channelHeaders };
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          console.error(
            `Failed to get point cloud at frame #${frame.id}:`,
            reason,
          );
        }

        throw reason;
      })
      .finally(() => this.#pending.delete(controller));
  }

  /** Gets the source data for a frame, bypassing the cache. */
  async getDataNoCache(
    frame: FrameLike,
    signal?: AbortSignal,
    onProgress?: DownloadProgressListener,
  ): Promise<PointCloud | null> {
    const dto = await this.#getPointCloudData(frame, signal, onProgress);
    if (dto == null) return null;

    const config = this.config;
    const format = config.coordinateFormat;
    const buffer = new PointBuffer(dto.array, format, dto.numChannels);

    return new PointCloud(
      buffer,
      dto.channelHeaders,
      new THREE.Vector3(),
      TEMP_BLENDER,
      TEMP_POINT_SIZE,
    );
  }
}

/** Finds point cloud data for a given frame. */
export class PointCloudLookup extends BaseDataLookup<PointCloud | null> {
  /** Receives the data from the backend to be loaded by this object. */
  readonly #receiver: PointCloudReceiver;

  /** `true` if background removal is applied server-side; otherwise, `false`. */
  get removeBackground(): boolean {
    return this.#receiver.removeBackground;
  }

  set removeBackground(value: boolean) {
    if (this.#receiver.removeBackground !== value) {
      this.#receiver.abortPending();
      this.clearCache();

      this.#receiver.removeBackground = value;
    }
  }

  /** `true` if area cropping is applied server-side; otherwise, `false`. */
  get cropArea(): boolean {
    return this.#receiver.cropArea;
  }

  set cropArea(value: boolean) {
    if (this.#receiver.cropArea !== value) {
      this.#receiver.abortPending();
      this.clearCache();

      this.#receiver.cropArea = value;
    }
  }

  /** Creates a new data lookup for point clouds. */
  static create(
    config: EditorConfig,
    views: EditorViews,
    maxCacheSize?: number,
  ): PointCloudLookup {
    return new PointCloudLookup(
      this.BUILD_CACHE_KEY.SOURCE_DATA,
      new PointCloudReceiver(config, views),
      {
        maxEntries: maxCacheSize ?? config.frameCacheSize,
        // Point clouds retain the source channels plus rendered XYZ and
        // RGB buffers. Bound both count and their estimated footprint.
        maxSize: 512 * 1024 * 1024,
        sizeCalculation: estimatePointCloudCacheSize,
        dispose: (pointCloud) => pointCloud?.dispose(),
      },
    );
  }

  /** Creates a new data lookup for point clouds. */
  constructor(
    buildCacheKey: CacheKeyFunc,
    receiver: PointCloudReceiver,
    cacheOptions: number | DataCacheOptions<PointCloud | null>,
  ) {
    super(buildCacheKey, receiver, cacheOptions);

    this.#receiver = receiver;
  }
}
