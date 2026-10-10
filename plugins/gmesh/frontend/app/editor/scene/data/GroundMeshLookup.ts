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

import { SENDER_KEY } from "../../config";

import { GroundMesh } from "./GroundMesh";

interface GroundMeshData {
  vertices: Float32Array;
  faces: Int32Array;
}

export function estimateGroundMeshCacheSize(mesh: GroundMesh | null): number {
  if (mesh == null) return 1;
  const byteLength =
    mesh.verticesBuffer.numPoints * 9 * Float32Array.BYTES_PER_ELEMENT +
    mesh.facesBuffer.length * 2 * Int32Array.BYTES_PER_ELEMENT;
  return Math.max(1, byteLength);
}

// Temporary values that will be overriden by the layer
const TEMP_BLENDER = new ApplyColormap(
  cmaps.get("rainbow"),
  new NormalizedValueFunc(0, 0, 0),
);
const TEMP_OPACITY = 0;

/**
 * Receives ground meshes from the backend.
 */
export class GroundMeshReceiver extends BaseDataReceiver<GroundMesh | null> {
  readonly #pending = new Set<AbortController>();

  dispose(): void {
    for (const controller of this.#pending) controller.abort();
    this.#pending.clear();
  }

  /**
   * Creates a new data receiver for ground meshes.
   */
  constructor(config: EditorConfig, views: EditorViews) {
    super(config, views);
  }

  /**
   * Gets the data of a ground mesh for a frame.
   * If the mesh does not exist, the promise resolves to `null` instead.
   */
  async #getGroundMeshData(
    frame: FrameLike,
    signal?: AbortSignal,
    onProgress?: DownloadProgressListener,
  ): Promise<GroundMeshData | null> {
    const controller = new AbortController();
    signal?.addEventListener("abort", () => controller.abort(), {
      once: true,
    });
    if (signal?.aborted) controller.abort();
    this.#pending.add(controller);
    return this.views
      .bulkGetSourceData(SENDER_KEY, [frame.id], {}, controller.signal)
      .then(async (response: Response) => {
        if (!response.ok) {
          throw new Error(await response.text());
        }

        // Typed as `number` so this compares plain status codes; comparing
        // the enum member directly would mix enum and non-enum types.
        const noContentStatus: number = HTTPStatus.NO_CONTENT;
        if (response.status === noContentStatus) return null;

        const data = await readResponseArrayBuffer(response, onProgress);

        const headers = response.headers;
        const verticesByteLengthStr = headers.get("X-Vertices-ByteLength");
        const facesByteLengthStr = headers.get("X-Faces-ByteLength");

        if (verticesByteLengthStr == null || facesByteLengthStr == null) {
          throw new Error("Invalid headers");
        }

        const verticesByteLength = Number(verticesByteLengthStr);
        const facesByteLength = Number(facesByteLengthStr);

        const vertices = new Float32Array(data.slice(0, verticesByteLength));
        const faces = new Int32Array(
          data.slice(verticesByteLength, verticesByteLength + facesByteLength),
        );

        return { vertices, faces };
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          console.error(
            `Failed to get ground mesh at frame #${frame.id}:`,
            reason,
          );
        }

        throw reason;
      })
      .finally(() => this.#pending.delete(controller));
  }

  /**
   * Gets the source data for a frame, bypassing the cache.
   */
  async getDataNoCache(
    frame: FrameLike,
    signal?: AbortSignal,
    onProgress?: DownloadProgressListener,
  ): Promise<GroundMesh | null> {
    const dto = await this.#getGroundMeshData(frame, signal, onProgress);
    if (dto == null) return null;

    const config = this.config;
    const format = config.coordinateFormat;
    const verticesBuffer = new PointBuffer(dto.vertices, format, 3);
    const facesBuffer = dto.faces;

    return new GroundMesh(
      verticesBuffer,
      facesBuffer,
      new THREE.Vector3(),
      TEMP_BLENDER,
      TEMP_OPACITY,
    );
  }
}

/**
 * Finds ground mesh data for a given frame.
 */
export class GroundMeshLookup extends BaseDataLookup<GroundMesh | null> {
  /**
   * Creates a new data lookup for ground meshes.
   */
  static create(
    config: EditorConfig,
    views: EditorViews,
    maxCacheSize?: number,
  ): GroundMeshLookup {
    return new GroundMeshLookup(
      this.BUILD_CACHE_KEY.SOURCE_DATA,
      new GroundMeshReceiver(config, views),
      {
        maxEntries: maxCacheSize ?? config.frameCacheSize,
        maxSize: 256 * 1024 * 1024,
        sizeCalculation: estimateGroundMeshCacheSize,
        dispose: (mesh) => mesh?.dispose(),
      },
    );
  }

  /**
   * Creates a new data lookup for ground meshes.
   */
  constructor(
    buildCacheKey: CacheKeyFunc,
    receiver: GroundMeshReceiver,
    cacheOptions: number | DataCacheOptions<GroundMesh | null>,
  ) {
    super(buildCacheKey, receiver, cacheOptions);
  }
}
