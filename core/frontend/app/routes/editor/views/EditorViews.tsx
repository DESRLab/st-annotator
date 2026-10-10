import { Queue } from "async-await-queue";
import { z } from "zod";

import { markErrorSurfaced, normalizeError } from "../../../errors";
import {
  CommitGraphState,
  FrameState,
  LabelsetBranchState,
  ProjectConfig,
  SourceGroupState,
  TaskState,
} from "../models";
import {
  listProjectTasksEditorTasksGet,
  listTaskFramesEditorTaskFramesGet,
  listTaskLabelBranchesEditorTaskLabelBranchesGet,
  listTaskSourceGroupsEditorTaskSourceGroupsGet,
  pushLabelsetCommitsEditorLabelsetPushPost,
  readLabelsetBranchEditorLabelsetBranchGet,
  readLabelsetGraphEditorLabelsetGraphGet,
  readProjectConfigEditorConfigGet,
  listSelectionsLabelSpecObjclassSelectionsGet,
  type ObjectClassSelectionPublic,
  touchFrameLastViewedAtEditorFrameLastViewedAtPost,
  updateFrameIsCompleteEditorFrameIsCompletePost,
} from "sta/client";
import { client } from "sta/client-instance";

import { FairKeyedQueue } from "./FairKeyedQueue";

/**
 * @param value - The value to normalize.
 * @returns The normalized project id, or `null` if the value is not a valid project id.
 */
export function normalizeEditorProjectId(value: unknown): number | null {
  if (value == null || value === "") return null;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * @param pathnameOrUrl - The pathname or URL to parse.
 * @returns The project id extracted from the path, or `null` if not found.
 */
export function parseEditorProjectIdFromPathname(
  pathnameOrUrl: string,
): number | null {
  let pathname = pathnameOrUrl;

  try {
    pathname = new URL(pathnameOrUrl, window.location.origin).pathname;
  } catch {
    // Treat the input as an already-parsed pathname.
  }

  const match = /(?:^|\/)projects\/([^/]+)\/(?:annotate|review)(?:\/|$)/.exec(
    pathname,
  );
  return normalizeEditorProjectId(match?.[1]);
}

/**
 * The values a {@link PushCommitsResult} is built from.
 */
export interface PushCommitsResultValues {
  op_results: readonly unknown[];
  branch: LabelsetBranchState;
}

/**
 * The response of a push of commits, mirroring the `LabelsetPushResult`
 * Pydantic model on the backend: the results of the pushed operations together
 * with the branch state the same transaction committed.
 */
export class PushCommitsResult {
  static readonly PLAIN_SCHEMA = z.object({
    op_results: z.array(z.object({}).passthrough().or(z.unknown())),
    branch: LabelsetBranchState.SCHEMA,
  });

  static readonly SCHEMA = this.PLAIN_SCHEMA.transform((data) =>
    this.create(data),
  );

  /**
   * The wire schema of the response body. `branch` is the raw
   * `LabelsetBranchPublic` payload, so it is normalized by
   * {@link LabelsetBranchState.fromJSON}; `PLAIN_SCHEMA` expects an already
   * normalized branch and cannot parse the payload as-is.
   */
  static readonly WIRE_SCHEMA = z.object({
    branch: z.record(z.string(), z.unknown()),
    op_results: z.array(z.unknown()).default([]),
  });

  readonly op_results: readonly unknown[];

  readonly branch: LabelsetBranchState;

  constructor(values: PushCommitsResultValues) {
    this.op_results = values.op_results;
    this.branch = values.branch;
  }

  /**
   * Creates an immutable instance from fully resolved values.
   */
  static create(values: PushCommitsResultValues): PushCommitsResult {
    return Object.freeze(new PushCommitsResult(values));
  }

  /**
   * Deserializes an instance of this class from data parsed from a JSON string.
   *
   * @param obj - The data to deserialize.
   * @returns The resulting new instance.
   */
  static fromJSON(obj: unknown): PushCommitsResult {
    const { branch, op_results } = this.WIRE_SCHEMA.parse(obj);

    return this.create({
      branch: LabelsetBranchState.fromJSON(branch),
      op_results,
    });
  }
}

export interface LabelsetCommitInstruction {
  op_name: string;
  op_params: unknown;
  result_placeholder_key: string | null;
  timestamp: Date;
  overwrites: LabelsetCommitInstruction[];
}

export interface PushCommitsData {
  last_fetched_head_hash: string;
  commits: LabelsetCommitInstruction[];
  placeholder_keys: string[];
}

export interface EditorViewsOptions {
  apiBaseUrl?: string;
  editorUrl?: string;
  projectId?: number;
}

/**
 * Represents an interface of the application with the backend.
 *
 * Each public method sends a request to the corresponding view function on the backend.
 */
export class EditorViews {
  readonly #groupByBranch = new Map<number, number>();
  readonly #classSelections = new Map<
    number,
    Promise<ObjectClassSelectionPublic>
  >();

  /** Loads the selection shared by every label layer in a group. */
  async getClassSelection(
    groupId: number,
  ): Promise<ObjectClassSelectionPublic> {
    let pending = this.#classSelections.get(groupId);
    if (pending == null) {
      pending = listSelectionsLabelSpecObjclassSelectionsGet(
        this.#apiOptions({ query: { group_id: groupId, limit: 1 } }),
      )
        .then(
          (result) =>
            this.#unwrap(result) as Promise<ObjectClassSelectionPublic[]>,
        )
        .then((selections) => {
          const selection = selections[0];
          if (selection == null)
            throw new Error(
              `No object-class selection is configured for label group ${groupId}`,
            );
          return selection;
        })
        // Plugin class adapters read `color`; the API exposes `color_rgb`.
        .then((selection) => ({
          ...selection,
          objclasses: selection.objclasses.map((objclass) => ({
            ...objclass,
            ...(objclass.color_rgb == null
              ? {}
              : {
                  color: `#${objclass.color_rgb.toString(16).padStart(6, "0")}`,
                }),
          })),
        }));
      this.#classSelections.set(groupId, pending);
      void pending.catch(() => {
        if (this.#classSelections.get(groupId) === pending)
          this.#classSelections.delete(groupId);
      });
    }
    return pending;
  }

  /** Finds the selection for a frame's label branch. */
  getClassSelectionForBranch(
    branchId: number,
  ): Promise<ObjectClassSelectionPublic> {
    const groupId = this.#groupByBranch.get(branchId);
    if (groupId == null) throw new Error(`Unknown label branch ${branchId}`);
    return this.getClassSelection(groupId);
  }
  /**
   * Shares frame-list work across navigators using the same scene selection.
   * Spatial bounds come from source frames, so label commits do not change them;
   * frame metadata writes through this class clear the cache.
   */
  readonly #framesBySelection = new Map<string, Promise<FrameState[]>>();

  readonly workType: "annotate" | "review";
  /**
   * The base URL of each corresponding view function on the backend.
   */
  readonly baseUrl: string;

  /**
   * The URL of the current editor page.
   */
  readonly editorUrl: string;

  /**
   * The unique identifier of the project shown by this editor.
   */
  readonly projectId: number | null;

  /**
   * Creates a new interface of the application with the backend.
   *
   * @param options - The route/API options to use.
   */
  constructor(options: EditorViewsOptions = {}) {
    const apiRoot = client.getConfig().baseUrl ?? "";
    this.baseUrl = options.apiBaseUrl ?? `${apiRoot}/editor`;
    this.editorUrl = options.editorUrl ?? window.location.pathname;
    this.projectId =
      normalizeEditorProjectId(options.projectId) ??
      parseEditorProjectIdFromPathname(this.editorUrl);
    this.workType = /(?:^|\/)projects\/[^/]+\/review(?:\/|$)/.test(
      this.editorUrl,
    )
      ? "review"
      : "annotate";
  }

  /**
   * Adds the current project id to a URL search parameter set.
   *
   * @param params - The params to mutate.
   * @returns The same params instance.
   */
  #withProjectId(params: URLSearchParams): URLSearchParams {
    if (this.projectId != null) {
      params.set("project_id", this.projectId.toString());
    }

    return params;
  }

  #requireProjectId(): number {
    const projectId = normalizeEditorProjectId(this.projectId);
    if (projectId == null) {
      throw new Error("Missing project id");
    }

    return projectId;
  }

  async #unwrap(result: { error?: unknown; data?: unknown }): Promise<unknown> {
    if (result.error != null) {
      throw result.error instanceof Error
        ? result.error
        : new Error(normalizeError(result.error));
    }

    return result.data;
  }

  #apiOptions(options: Record<string, unknown>): any {
    return { ...options };
  }

  #fetchHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
    };
  }

  /**
   * Navigates to the editor interface for a frame.
   *
   * @param frame - The target frame.
   */
  async navEditor(frame: FrameState): Promise<void> {
    window.location.href = `${this.editorUrl}?task_id=${frame.task.id}&frame_id=${frame.id}`;
  }

  /**
   * Updates the address bar to deep-link the given frame without reloading
   * or navigating the page, so the editor URL stays shareable as the user
   * moves between frames.
   *
   * Accepts any frame-like object exposing only the identifiers needed to
   * build the deep link, so both `FrameState` and `EditableFrame` work.
   *
   * @param frame - The frame currently displayed by the editor,
   * or `null` if no frame is displayed.
   */
  syncEditorUrl(frame: Pick<FrameState, "id" | "task"> | null): void {
    if (typeof window === "undefined" || window.history?.replaceState == null)
      return;

    const url = new URL(window.location.href);
    if (frame != null) {
      url.searchParams.set("task_id", frame.task.id.toString());
      url.searchParams.set("frame_id", frame.id.toString());
    } else {
      url.searchParams.delete("frame_id");
    }

    if (url.href === window.location.href) return;

    // Preserve the router's history entry state; only the URL changes.
    window.history.replaceState(window.history.state, "", url);
  }

  /**
   * Gets the configuration data for the currently opened project.
   *
   * @returns A promise that resolves to the requested data.
   */
  async getConfigData(): Promise<ProjectConfig> {
    return readProjectConfigEditorConfigGet(
      this.#apiOptions({
        query: {
          project_id: this.#requireProjectId(),
          work_type: this.workType,
        },
      }),
    )
      .then((result) => this.#unwrap(result))
      .then((d) => ProjectConfig.fromJSON(d))
      .catch((reason) => {
        console.error("Failed to get project configuration:", reason);
        alert(
          `Failed to get project configuration. Please reload the window.\n\n${reason}`,
        );

        throw reason;
      });
  }

  /**
   * Gets the list of tasks in the currently opened project.
   *
   * @returns A promise that resolves to the requested data.
   */
  async listTasks(): Promise<TaskState[]> {
    return listProjectTasksEditorTasksGet(
      this.#apiOptions({
        query: {
          project_id: this.#requireProjectId(),
          work_type: this.workType,
        },
      }),
    )
      .then((result) => this.#unwrap(result))
      .then((data) =>
        ((data as unknown[]) ?? []).map((d: unknown) =>
          TaskState.fromJSON(d as Record<string, any>),
        ),
      )
      .catch((reason) => {
        console.error("Failed to get list of tasks:", reason);
        alert(
          `Failed to get list of tasks. Please reload the window.\n\n${reason}`,
        );

        return [];
      });
  }

  /**
   * Loads the source groups for a task from the backend.
   *
   * @param taskId - The unique identifier of the task.
   * @returns A promise that resolves to
   * the labelset branches for the task.
   */
  async getSourceGroups(taskId: number): Promise<SourceGroupState[]> {
    const groups = await listTaskSourceGroupsEditorTaskSourceGroupsGet(
      this.#apiOptions({
        query: { task_id: taskId, work_type: this.workType },
      }),
    )
      .then((result) => this.#unwrap(result))
      .then((data) =>
        ((data as unknown[]) ?? []).map((d: unknown) =>
          SourceGroupState.fromJSON(d as Record<string, any>),
        ),
      )
      .catch((reason) => {
        console.error(
          "Failed to get source groups at:",
          { taskId },
          "Reason:",
          reason,
        );

        return [];
      });

    return groups;
  }

  /**
   * Loads the labelset branches for a task from the backend.
   *
   * @param taskId - The unique identifier of the task.
   * @returns A promise that resolves to
   * the labelset branches for the task.
   */
  async getLabelBranches(taskId: number): Promise<LabelsetBranchState[]> {
    const branches = await listTaskLabelBranchesEditorTaskLabelBranchesGet(
      this.#apiOptions({
        query: { task_id: taskId, work_type: this.workType },
      }),
    )
      .then((result) => this.#unwrap(result))
      .then((data) =>
        ((data as unknown[]) ?? []).map((d: unknown) =>
          LabelsetBranchState.fromJSON(d as Record<string, any>),
        ),
      )
      .catch((reason) => {
        console.error(
          "Failed to get label branches at:",
          { taskId },
          "Reason:",
          reason,
        );

        return [];
      });

    for (const branch of branches)
      this.#groupByBranch.set(branch.id, branch.group.id);
    return branches;
  }

  /**
   * Loads the frames for a task that are based on the given source group and label branch
   * from the backend.
   *
   * @param taskId - The unique identifier of the task.
   * @param sourceGroupId - The unique identifier of the source group. If not provided,
   * gets the frames for all available source groups.
   * @param labelBranchId - The unique identifier of the label branch. If not provided,
   * gets the frames for all available label branches.
   * @returns A promise that resolves to
   * the frames for the task.
   */
  async getFrames(
    taskId: number,
    sourceGroupId: number | null,
    labelBranchId: number | null,
  ): Promise<FrameState[]> {
    if (sourceGroupId == null || labelBranchId == null) {
      return [];
    }

    const cacheKey = [taskId, this.workType, sourceGroupId, labelBranchId].join(
      ":",
    );
    const cached = this.#framesBySelection.get(cacheKey);
    if (cached != null) return cached;

    const request = listTaskFramesEditorTaskFramesGet(
      this.#apiOptions({
        query: {
          task_id: taskId,
          work_type: this.workType,
          source_group_id: sourceGroupId,
          label_branch_id: labelBranchId,
        },
      }),
    )
      .then((result) => this.#unwrap(result))
      .then((data) => {
        const task = TaskState.fromJSON({
          id: taskId,
          name: "",
          project_id: this.#requireProjectId(),
        });
        return ((data as unknown[]) ?? []).map((value: unknown) =>
          FrameState.fromJSON(value as Record<string, any>, task),
        );
      })
      .catch((reason) => {
        if (this.#framesBySelection.get(cacheKey) === request)
          this.#framesBySelection.delete(cacheKey);
        console.error(`Failed to get frames of task #${taskId}:`, reason);

        return [];
      });
    this.#framesBySelection.set(cacheKey, request);
    return request;
  }

  /** Invalidates cached frame lists after a persisted frame mutation. */
  #invalidateFrames(): void {
    this.#framesBySelection.clear();
  }

  /**
   * Gets the source data for any number of frames.
   *
   * @param key - A key used to identify the data receiver that builds the response
   * on the backend.
   * @param frameIds - The unique identifier of each frame.
   * @param otherArgs - Other arguments to pass to the data receiver on the backend.
   * Defaults to an empty plain object.
   * @returns A promise that resolves to a response containing the
   * requested data.
   */
  async bulkGetSourceData(
    key: string,
    frameIds: readonly number[],
    otherArgs: object = {},
    signal?: AbortSignal,
  ): Promise<Response> {
    const urlParams = new URLSearchParams([
      ["key", key],
      ...frameIds.map((frameId: number) => ["frame_ids", frameId.toString()]),
    ]);
    this.#withProjectId(urlParams);

    return fetch(`${this.baseUrl}/source/data/bulk?${urlParams}`, {
      // Fetch API does not allow JSON body in GET request
      method: "POST",
      headers: this.#fetchHeaders(),
      body: JSON.stringify(otherArgs),
      signal,
    });
  }

  /** Bounds label-data concurrency so independent layers can load together. */
  #bulkGetLabelDataQueue = new FairKeyedQueue<string>(4);

  /**
   * Gets the label data for any number of frames.
   *
   * @param key - A key used to identify the data receiver that builds the response
   * on the backend.
   * @param frameIds - The unique identifier of each frame.
   * @param otherArgs - Other arguments to pass to the data receiver on the backend.
   * Defaults to an empty plain object.
   * @returns A promise that resolves to a response containing the
   * requested data.
   * @throws {Error} If a key in `otherArgs` conflicts with `labelParams` or `stParamsBulk`.
   */
  async bulkGetLabelData(
    key: string,
    frameIds: readonly number[],
    otherArgs: object = {},
    signal?: AbortSignal,
  ): Promise<Response> {
    return this.#bulkGetLabelDataQueue.run(key, () =>
      this.#bulkGetLabelData(key, frameIds, otherArgs, signal),
    );
  }

  /**
   * Gets the label data for any number of frames.
   *
   * @param key - A key used to identify the data receiver that builds the response
   * on the backend.
   * @param frameIds - The unique identifier of each frame.
   * @param otherArgs - Other arguments to pass to the data receiver on the backend.
   * Defaults to an empty plain object.
   * @returns A promise that resolves to a response containing the
   * requested data.
   */
  async #bulkGetLabelData(
    key: string,
    frameIds: readonly number[],
    otherArgs: object = {},
    signal?: AbortSignal,
  ): Promise<Response> {
    const urlParams = new URLSearchParams([
      ["key", key],
      ...frameIds.map((frameId: number) => ["frame_ids", frameId.toString()]),
    ]);
    this.#withProjectId(urlParams);

    return fetch(`${this.baseUrl}/label/data/bulk?${urlParams}`, {
      // Fetch API does not allow JSON body in GET request
      method: "POST",
      headers: this.#fetchHeaders(),
      body: JSON.stringify(otherArgs),
      signal,
    });
  }

  /**
   * Gets the details of a branch.
   *
   * @param labelBranchId - The unique identifier of the label branch.
   * @returns A promise that resolves to the details of the branch.
   */
  async getLabelBranch(labelBranchId: number): Promise<LabelsetBranchState> {
    return readLabelsetBranchEditorLabelsetBranchGet(
      this.#apiOptions({
        query: { label_branch_id: labelBranchId },
      }),
    )
      .then((result) => this.#unwrap(result))
      .then((data) => LabelsetBranchState.fromJSON(data as Record<string, any>))
      .catch((reason) => {
        console.error(
          `Failed to get details of branch #${labelBranchId}:`,
          reason,
        );

        throw reason;
      });
  }

  /**
   * Gets the commit graph of a branch.
   *
   * @param labelBranchId - The unique identifier of the label branch.
   * @returns A promise that resolves to the commit graph
   * of the branch.
   */
  async getCommitGraph(labelBranchId: number): Promise<CommitGraphState> {
    return readLabelsetGraphEditorLabelsetGraphGet(
      this.#apiOptions({
        query: { label_branch_id: labelBranchId },
      }),
    )
      .then((result) => this.#unwrap(result))
      .then((d) => CommitGraphState.fromJSON(d as Record<string, any>))
      .catch((reason) => {
        console.error(
          `Failed to get commit graph of branch #${labelBranchId}:`,
          reason,
        );

        throw reason;
      });
  }

  /**
   * Ensures that `this.#pushCommits` is run sequentially.
   */
  #updateLabelsetQueue = new Queue<symbol>(1, 0);

  /**
   * Applies a batch of commits to the backend.
   *
   * @param taskId - The unique identifier of the active task. The branch should
   * be accessible under the given task.
   * @param labelBranchId - The unique identifier of the label branch which HEAD to push
   * the commits to.
   * @param data - The data of each commit.
   * @returns A promise that resolves to the result of the commits.
   */
  async #pushCommits(
    taskId: number,
    labelBranchId: number,
    data: PushCommitsData,
  ): Promise<PushCommitsResult> {
    const result = await pushLabelsetCommitsEditorLabelsetPushPost(
      this.#apiOptions({
        query: {
          label_branch_id: labelBranchId,
          last_fetched_head_hash: data.last_fetched_head_hash,
        },
        body: {
          commit_instrs: data.commits,
          placeholder_keys: data.placeholder_keys,
        },
      }),
    )
      .then((response) => this.#unwrap(response))
      .catch((reason) => {
        console.error(
          "Failed to push commits to labelset at:",
          { taskId, labelBranchId },
          "Reason:",
          reason,
        );
        alert(`Failed to save changes.\n\n${reason}`);
        // Direct callers such as the ctrl+s menu rely on the alert above, so it
        // stays; marking the rejection keeps an outer handler from raising the
        // same message a second time.
        markErrorSurfaced(reason);

        throw reason;
      });

    // The response carries the branch as the push itself committed it, read from
    // the transaction that applied the commits. Re-reading the branch here would
    // be a second, unlocked transaction: an interleaving writer could move the
    // head in between, and the editor would adopt that head without its changes.
    return PushCommitsResult.fromJSON(result);
  }

  /**
   * Applies a batch of commits to the backend.
   *
   * @param taskId - The unique identifier of the active task. The branch should
   * be accessible under the given task.
   * @param branchId - The unique identifier of the label branch which HEAD to push
   * the commits to.
   * @param data - The data of each commit.
   * @returns A promise that resolves to the result of the commits.
   */
  async pushCommits(
    taskId: number,
    branchId: number,
    data: PushCommitsData,
  ): Promise<PushCommitsResult> {
    return this.#updateLabelsetQueue.run(() =>
      this.#pushCommits(taskId, branchId, data),
    );
  }

  /**
   * Logs to the backend that a frame has been viewed in the application.
   *
   * @param frameId - The unique identifier of the frame.
   * @returns A promise representing the task.
   */
  async updateFrameLastViewedAt(frameId: number): Promise<void> {
    await touchFrameLastViewedAtEditorFrameLastViewedAtPost(
      this.#apiOptions({
        query: { frame_id: frameId },
      }),
    )
      .then((result) => this.#unwrap(result))
      .then(() => this.#invalidateFrames())
      .catch((reason) => {
        console.error(
          `Failed to apply log for viewing frame #${frameId}:`,
          reason,
        );

        throw reason;
      });
  }

  /**
   * Sets whether the task is complete at a frame.
   *
   * @param frameId - The unique identifier of the frame.
   * @param isComplete - `true` if the task is complete at the given frame;
   * otherwise, `false`.
   * @returns A promise representing the task.
   */
  async updateFrameIsComplete(
    frameId: number,
    isComplete: boolean,
  ): Promise<void> {
    await updateFrameIsCompleteEditorFrameIsCompletePost(
      this.#apiOptions({
        query: { frame_id: frameId, is_complete: isComplete },
      }),
    )
      .then((result) => this.#unwrap(result))
      .then(() => this.#invalidateFrames())
      .catch((reason) => {
        const frameStr = `frame ${frameId}`;
        const msg = isComplete
          ? `Failed to mark ${frameStr} as complete:`
          : `Failed to mark ${frameStr} as not complete:`;
        console.error(msg, reason);

        throw reason;
      });
  }
}
