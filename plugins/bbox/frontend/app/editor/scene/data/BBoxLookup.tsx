import { z } from "zod";

import {
  BulkDataLookup,
  BulkDataReceiver,
  readResponseJson,
} from "sta/app/editor";
import type {
  CacheKeyFunc,
  DownloadProgressListener,
  EditorConfig,
  EditorViews,
  FrameLike,
} from "sta/app/editor";

import {
  BBoxClassSelectionState,
  type BBoxClassState,
  LabelBoxState,
  LabelTrackState,
} from "../../../../models";
import { SENDER_KEY } from "../../config";

import type {
  BoxParams,
  ClassParams,
  TrackParams,
  BBoxDataParams,
} from "./BBoxIndex";

export type BBoxData = Required<BBoxDataParams>;

/**
 * The fully resolved values a {@link BBoxLabelData} is built from.
 */
export interface BBoxLabelDataValues {
  tracks: readonly LabelTrackState[];
  boxes: readonly LabelBoxState[];
  frame_id: number;
  branch_id: number;
  head_hash: string;
}

export class BBoxLabelData {
  static readonly PLAIN_SCHEMA = z
    .object({
      frame_id: z.number().int(),
      branch_id: z.number().int(),
      head_hash: z.string(),
      tracks: z.array(LabelTrackState.SCHEMA).optional(),
      entities: z.array(LabelTrackState.SCHEMA).optional(),
      boxes: z.array(LabelBoxState.SCHEMA).optional(),
      elements: z.array(LabelBoxState.SCHEMA).optional(),
    })
    .transform((data) => ({
      tracks: data.tracks ?? data.entities ?? [],
      boxes: data.boxes ?? data.elements ?? [],
      frame_id: data.frame_id,
      branch_id: data.branch_id,
      head_hash: data.head_hash,
    }));

  static readonly SCHEMA = this.PLAIN_SCHEMA.transform((data) =>
    this.create(data),
  );

  readonly tracks: readonly LabelTrackState[];
  readonly boxes: readonly LabelBoxState[];
  readonly frame_id: number;
  readonly branch_id: number;
  readonly head_hash: string;

  constructor(values: BBoxLabelDataValues) {
    this.tracks = values.tracks;
    this.boxes = values.boxes;
    this.frame_id = values.frame_id;
    this.branch_id = values.branch_id;
    this.head_hash = values.head_hash;
  }

  /**
   * Creates an immutable instance from fully resolved values.
   */
  static create(values: BBoxLabelDataValues): BBoxLabelData {
    return Object.freeze(new BBoxLabelData(values));
  }

  /**
   * Deserializes an instance of this class from data parsed from a JSON string.
   */
  static fromJSON(obj: unknown): BBoxLabelData {
    return this.SCHEMA.parse(obj);
  }
}

/**
 * Receives batches of bounding box labels from the backend.
 */
export class BBoxReceiver extends BulkDataReceiver<BBoxData> {
  /**
   * Creates a new data receiver for bounding box labels.
   */
  constructor(config: EditorConfig, views: EditorViews) {
    super(config, views);
  }

  /**
   * Gets the bounding box labels for any number of frames.
   */
  async #bulkGetBBoxLabels(
    frames: readonly FrameLike[],
    signal?: AbortSignal,
    onProgress?: DownloadProgressListener,
  ): Promise<BBoxLabelData[]> {
    return this.views
      .bulkGetLabelData(
        SENDER_KEY,
        frames.map((frame) => frame.id),
        {},
        signal,
      )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await response.text());
        }

        const data = await readResponseJson(response, onProgress);

        return z.array(BBoxLabelData.SCHEMA).parse(data);
      })
      .catch((reason) => {
        console.error(
          "Failed to get bounding box labels at:",
          { frames },
          "Reason:",
          reason,
        );

        throw reason;
      });
  }

  /**
   * Gets the bounding box labels for a frame.
   */
  /**
   * Converts a state object into parameters to construct an editable object.
   */
  #toClassParams(state: BBoxClassState): ClassParams {
    return {
      id: state.id,
      name: state.name,
      boxColor: state.color,
      defaultSizeDatabase: state.default_size.toOptionalVector3(),
    };
  }

  /**
   * Converts a state object into parameters to construct an editable object.
   */
  #toBoxParams(state: LabelBoxState): BoxParams {
    return {
      id: state.id,
      entityId: state.entity_id,
      timestamp: state.timestamp,
      boxType: state.type,
      center: state.center.toVector3(),
      angle: Number(state.angle),
      size: state.size.toVector3(),
      qualityRank: state.quality_rank,
      distinctiveLv: state.distinctive_lv,
      occlusionLv: state.occlusion_lv,
      perceivedClassId: state.perceived_class_id ?? null,
    };
  }

  /**
   * Converts a state object into parameters to construct an editable object.
   */
  #toTrackParams(state: LabelTrackState): TrackParams {
    return {
      id: state.id,
      isBlack: state.is_black ?? false,
      gtClassId: state.gt_class_id ?? null,
    };
  }

  /**
   * Gets the data for any number of frames, bypassing the cache.
   */
  async bulkGetDataNoCache(
    frames: readonly FrameLike[],
    signal?: AbortSignal,
    onProgress?: DownloadProgressListener,
  ): Promise<readonly BBoxData[]> {
    const dataByFrame = await this.#bulkGetBBoxLabels(
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
      const classSelection = BBoxClassSelectionState.SCHEMA.parse(
        selections[index],
      );
      return {
        classes: classSelection.objclasses.map((e) => this.#toClassParams(e)),
        boxes: data.boxes.map((e) => this.#toBoxParams(e)),
        tracks: data.tracks.map((e) => this.#toTrackParams(e)),
      };
    });
  }
}

/**
 * Finds bounding box labels for a batch of frames.
 */
export class BBoxLookup extends BulkDataLookup<BBoxData> {
  /**
   * Receives the data from the backend to be loaded by this object.
   */
  readonly receiver: BBoxReceiver;

  /**
   * Creates a new data lookup for bounding box labels.
   */
  static create(config: EditorConfig, views: EditorViews): BBoxLookup {
    return new BBoxLookup(
      this.BUILD_CACHE_KEY.LABEL_DATA,
      new BBoxReceiver(config, views),
      // maxCacheSize is fixed so that the local (newer) data is not overwritten by
      // the remote (older) data
      65536,
    );
  }

  /**
   * Creates a new data lookup for bounding box labels.
   */
  protected constructor(
    buildCacheKey: CacheKeyFunc,
    receiver: BBoxReceiver,
    maxCacheSize: number,
  ) {
    super(buildCacheKey, receiver, maxCacheSize);

    this.receiver = receiver;
  }
}
