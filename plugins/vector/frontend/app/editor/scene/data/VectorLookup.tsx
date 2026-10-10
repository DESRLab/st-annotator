import { z } from "zod";

import {
  BulkDataLookup,
  BulkDataReceiver,
  readResponseJson,
} from "sta/app/editor";
import type {
  CacheKeyFunc,
  DownloadProgressListener,
  EditorViews,
  FrameLike,
  EditorConfig,
} from "sta/app/editor";

import {
  LabelVectorState,
  VectorClassSelectionState,
} from "../../../../models";
import { SENDER_KEY } from "../../config";

import type {
  VectorParams,
  ClassParams,
  VectorDataParams,
} from "./VectorIndex";

export type VectorData = Required<VectorDataParams>;

/**
 * The fully resolved values a {@link VectorLabelData} is built from.
 */
export interface VectorLabelDataValues {
  frame_id: number;
  branch_id: number;
  head_hash: string;
  vectors: readonly LabelVectorState[];
}

export class VectorLabelData {
  static readonly PLAIN_SCHEMA = z.object({
    frame_id: z.number().int(),
    branch_id: z.number().int(),
    head_hash: z.string(),
    vectors: z.array(LabelVectorState.SCHEMA),
  });

  static readonly SCHEMA = this.PLAIN_SCHEMA.transform((data) =>
    this.create(data),
  );

  readonly vectors: readonly LabelVectorState[];
  readonly frame_id: number;
  readonly branch_id: number;
  readonly head_hash: string;

  constructor(values: VectorLabelDataValues) {
    this.vectors = values.vectors;
    this.frame_id = values.frame_id;
    this.branch_id = values.branch_id;
    this.head_hash = values.head_hash;
  }

  /**
   * Creates an immutable instance from fully resolved values.
   */
  static create(values: VectorLabelDataValues): VectorLabelData {
    return Object.freeze(new VectorLabelData(values));
  }

  static fromJSON(obj: unknown): VectorLabelData {
    return this.SCHEMA.parse(obj);
  }
}

export class VectorReceiver extends BulkDataReceiver<VectorData> {
  constructor(config: EditorConfig, views: EditorViews) {
    super(config, views);
  }

  async #bulkGetVectorLabels(
    frames: readonly FrameLike[],
    signal?: AbortSignal,
    onProgress?: DownloadProgressListener,
  ): Promise<VectorLabelData[]> {
    return this.views
      .bulkGetLabelData(
        SENDER_KEY,
        frames.map((frame: FrameLike) => frame.id),
        {},
        signal,
      )
      .then(async (response: Response) => {
        if (!response.ok) {
          throw new Error(await response.text());
        }

        const data = await readResponseJson(response, onProgress);

        return z.array(VectorLabelData.SCHEMA).parse(data);
      })
      .catch((reason: unknown) => {
        console.error(
          "Failed to get vector labels at:",
          { frames },
          "Reason:",
          reason,
        );

        throw reason;
      });
  }

  #toClassParams(
    state: VectorClassSelectionState["objclasses"][number],
  ): ClassParams {
    return {
      id: state.id,
      name: state.name,
      vectorColor: state.color,
    };
  }

  #toVectorParams(state: LabelVectorState): VectorParams {
    return {
      id: state.id,
      timestamp: state.timestamp,
      vertices: state.vertices.map((vertex: any) => vertex.toVector3()),
      gtClassId: state.gt_class_id ?? null,
      vectorType: state.type,
    };
  }

  async bulkGetDataNoCache(
    frames: readonly FrameLike[],
    signal?: AbortSignal,
    onProgress?: DownloadProgressListener,
  ): Promise<readonly VectorData[]> {
    const dataByFrame = await this.#bulkGetVectorLabels(
      frames,
      signal,
      onProgress,
    );
    const selections = await Promise.all(
      dataByFrame.map((data) =>
        this.views.getClassSelectionForBranch(data.branch_id),
      ),
    );
    return dataByFrame.map((data, index) => {
      const classSelection = VectorClassSelectionState.SCHEMA.parse(
        selections[index],
      );
      return {
        classes: classSelection.objclasses.map((e: any) =>
          this.#toClassParams(e),
        ),
        vectors: data.vectors.map((e: any) => this.#toVectorParams(e)),
      };
    });
  }
}

export class VectorLookup extends BulkDataLookup<VectorData> {
  readonly receiver: VectorReceiver;

  static create(config: EditorConfig, views: EditorViews): VectorLookup {
    return new VectorLookup(
      this.BUILD_CACHE_KEY.LABEL_DATA,
      new VectorReceiver(config, views),
      50052,
    );
  }

  constructor(
    buildCacheKey: CacheKeyFunc,
    receiver: VectorReceiver,
    maxCacheSize: number,
  ) {
    super(buildCacheKey, receiver, maxCacheSize);

    this.receiver = receiver;
  }
}
