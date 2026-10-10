import * as THREE from "three";
import { z } from "zod";

import {
  encodePointCloudEditorSegmentationEncodePcdPost,
  predictMaskEditorSegmentationPredictMaskPost,
  readAssistantHealthEditorSegmentationAssistantHealthGet,
} from "sta/client";
import type {
  EncodePointCloudEditorSegmentationEncodePcdPostData,
  PredictMaskEditorSegmentationPredictMaskPostData,
} from "sta/client";
import type {
  CacheKeyFunc,
  DownloadProgressListener,
  EditorViews,
  FrameLike,
  EditorConfig,
} from "sta/app/editor";
import {
  BulkDataLookup,
  BulkDataReceiver,
  readResponseArrayBuffer,
} from "sta/app/editor";

import {
  LabelInstanceState,
  LabelSelectionState,
  SegmentationClassSelectionState,
} from "../../../../models";
import { SENDER_KEY } from "../../config";
import { asFloat32 } from "../utils/VectorUtils";

import type {
  SelectionParams,
  ClassParams,
  InstanceParams,
  SegmentationDataParams,
} from "./SegmentationIndex";
import { decodeSegmentationResponse } from "./SegmentationDecode";

export type SegmentationData = Required<SegmentationDataParams>;
type LoadedInstanceState = z.output<typeof LabelInstanceState.PLAIN_SCHEMA>;
type LoadedSelectionState = z.output<typeof LabelSelectionState.PLAIN_SCHEMA>;

/**
 * The result of a mask prediction by the labeling assistant.
 */
export interface PredictedMaskData {
  logits: Float32Array;
}

/**
 * The fully resolved values a {@link SegmentationLabelData} is built from.
 *
 * The instance and selection entries stay plain objects: the bulk payload nests
 * the two `PLAIN_SCHEMA`s, not the class schemas, because the editor only reads
 * their fields back out.
 */
export interface SegmentationLabelDataValues {
  instances: readonly LoadedInstanceState[];
  frame_id: number;
  branch_id: number;
  head_hash: string;
  selections: readonly LoadedSelectionState[];
}

export class SegmentationLabelData {
  static readonly PLAIN_SCHEMA = z.object({
    frame_id: z.number().int(),
    branch_id: z.number().int(),
    head_hash: z.string(),
    instances: z.array(LabelInstanceState.PLAIN_SCHEMA),
    selections: z.array(LabelSelectionState.PLAIN_SCHEMA),
  });

  static readonly SCHEMA = this.PLAIN_SCHEMA.transform((data) =>
    this.create(data),
  );

  readonly instances: readonly LoadedInstanceState[];
  readonly frame_id: number;
  readonly branch_id: number;
  readonly head_hash: string;
  readonly selections: readonly LoadedSelectionState[];

  constructor(values: SegmentationLabelDataValues) {
    this.instances = values.instances;
    this.frame_id = values.frame_id;
    this.branch_id = values.branch_id;
    this.head_hash = values.head_hash;
    this.selections = values.selections;
  }

  /**
   * Creates an immutable instance from fully resolved values.
   */
  static create(values: SegmentationLabelDataValues): SegmentationLabelData {
    return Object.freeze(new SegmentationLabelData(values));
  }

  /**
   * Deserializes an instance of this class from data parsed from a JSON string.
   */
  static fromJSON(obj: unknown): SegmentationLabelData {
    return this.SCHEMA.parse(obj);
  }
}

/**
 * Receives batches of segmentation labels from the backend.
 */
export class SegmentationReceiver extends BulkDataReceiver<SegmentationData> {
  /**
   * Creates a new data receiver for segmentation labels.
   */
  constructor(config: EditorConfig, views: EditorViews) {
    super(config, views);
  }

  /** Returns the availability reported by the annotator backend. */
  async isAssistantAvailable(signal?: AbortSignal): Promise<boolean> {
    return readAssistantHealthEditorSegmentationAssistantHealthGet({
      signal,
    })
      .then(
        ({ data, error }) =>
          error == null && data?.is_assistant_available === true,
      )
      .catch(() => false);
  }

  /**
   * Sends a point cloud frame to the annotator backend for encoding.
   *
   * @param pcdArr The point cloud as a flat float32 array in database coordinates.
   * @param numPoints The number of points contained in the point cloud frame.
   * @param signal Aborts the request when a newer point cloud supersedes this one.
   * @returns A promise that resolves to `true` if the assistant encoded
   * the point cloud successfully.
   */
  async encodePointCloud(
    pcdArr: Float32Array<ArrayBuffer>,
    numPoints: number,
    pcdId: number,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const request: Omit<
      EncodePointCloudEditorSegmentationEncodePcdPostData,
      "url"
    > = {
      body: new Blob([pcdArr.buffer]),
      headers: {
        "X-Num-Points": numPoints,
        "X-Pcd-Id": pcdId,
      },
    };

    return encodePointCloudEditorSegmentationEncodePcdPost({
      ...request,
      // These proxy endpoints intentionally accept a raw Request, so their
      // binary bodies are absent from OpenAPI. Do not let the generated
      // client's default JSON serializer turn this Blob into "{}".
      bodySerializer: null,
      headers: {
        "Content-Type": "application/octet-stream",
        ...request.headers,
      },
      signal,
    })
      .then(({ error }) => {
        if (error != null) {
          // A superseded encoding is cancelled on purpose, not a failure.
          if (signal?.aborted) return false;

          console.warn(
            "The labeling assistant failed to encode the point cloud.",
          );
          return false;
        }

        return true;
      })
      .catch((reason) => {
        // A superseded encoding is cancelled on purpose, not a failure
        if (signal?.aborted) return false;

        console.warn(
          "Failed to encode point cloud with the labeling assistant:",
          reason,
        );
        return false;
      });
  }

  /**
   * Prompts the labeling assistant through the annotator backend.
   *
   * @param points The coordinates of each prompted point in database coordinates.
   * @param labels The foreground (1) or background (0) label of each prompted point.
   * @returns A promise that resolves to the predicted mask, or `null`
   * if no assistant is configured or the prediction failed.
   */
  async predictMask(
    points: readonly THREE.Vector3[],
    labels: readonly number[],
    pcdId: number,
  ): Promise<PredictedMaskData | null> {
    const request: Omit<
      PredictMaskEditorSegmentationPredictMaskPostData,
      "url"
    > = {
      body: new Blob([asFloat32([...points]).buffer]),
      headers: {
        "X-Num-Points": points.length,
        "X-Labels": labels.join(","),
        "X-Pcd-Id": pcdId,
      },
    };

    return predictMaskEditorSegmentationPredictMaskPost({
      ...request,
      bodySerializer: null,
      headers: {
        "Content-Type": "application/octet-stream",
        ...request.headers,
      },
      parseAs: "arrayBuffer",
    })
      .then(({ data, error }) => {
        if (error != null || !(data instanceof ArrayBuffer)) {
          console.warn("Failed to predict mask:", error);
          return null;
        }

        return { logits: new Float32Array(data) };
      })
      .catch((reason) => {
        console.warn("Failed to predict mask:", reason);
        return null;
      });
  }

  /**
   * Gets the segmentation labels for any number of frames.
   */
  async #bulkGetSegmentationLabels(
    frames: readonly FrameLike[],
    signal?: AbortSignal,
    onProgress?: DownloadProgressListener,
  ): Promise<SegmentationLabelData[]> {
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

        const buffer = await readResponseArrayBuffer(response, onProgress);
        const data = await decodeSegmentationResponse(buffer, signal);
        return z.array(SegmentationLabelData.SCHEMA).parse(data);
      })
      .catch((reason) => {
        console.error(
          "Failed to get segmentation labels at:",
          { frames },
          "Reason:",
          reason,
        );

        throw reason;
      });
  }

  /**
   * Converts a state object into parameters to construct an editable object.
   */
  #toClassParams(
    state: SegmentationClassSelectionState["objclasses"][number],
  ): ClassParams {
    return {
      id: state.id,
      name: state.name,
      selectionColor: state.color,
    };
  }

  /**
   * Converts a state object into parameters to construct an editable object.
   */
  #toSelectionParams(state: LoadedSelectionState): SelectionParams {
    return {
      id: state.id,
      entityId: state.entity_id,
      timestamp: state.timestamp,
      points:
        state.points instanceof Float32Array
          ? (state.points as unknown as THREE.Vector3[])
          : state.points.map((point) => point.toVector3()),
      qualityRank: state.quality_rank,
      distinctiveLv: state.distinctive_lv,
      occlusionLv: state.occlusion_lv,
      perceivedClassId: state.perceived_class_id ?? null,
    };
  }

  /**
   * Converts a state object into parameters to construct an editable object.
   */
  #toInstanceParams(state: LoadedInstanceState): InstanceParams {
    return {
      id: state.id,
      isBlack: state.is_black ?? undefined,
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
  ): Promise<readonly SegmentationData[]> {
    const dataByFrame = await this.#bulkGetSegmentationLabels(
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
      const classSelection = SegmentationClassSelectionState.SCHEMA.parse(
        selections[index],
      );
      const classes = classSelection.objclasses.map((value) =>
        this.#toClassParams(value),
      );
      return {
        classes,
        selections: data.selections.map((e) => this.#toSelectionParams(e)),
        instances: data.instances.map((value) => this.#toInstanceParams(value)),
      };
    });
  }
}

/**
 * Finds segmentation labels for a batch of frames.
 */
export class SegmentationLookup extends BulkDataLookup<SegmentationData> {
  /**
   * Receives the data from the backend to be loaded by this object.
   */
  receiver: SegmentationReceiver;

  /**
   * Creates a new data lookup for segmentation labels.
   */
  static create(config: EditorConfig, views: EditorViews): SegmentationLookup {
    return new SegmentationLookup(
      this.BUILD_CACHE_KEY.LABEL_DATA,
      new SegmentationReceiver(config, views),
      // maxCacheSize is fixed so that the local (newer) data is not overwritten by
      // the remote (older) data
      65536,
    );
  }

  /**
   * Creates a new data lookup for segmentation labels.
   */
  constructor(
    buildCacheKey: CacheKeyFunc,
    receiver: SegmentationReceiver,
    maxCacheSize: number,
  ) {
    super(buildCacheKey, receiver, maxCacheSize);

    this.receiver = receiver;
  }
}
