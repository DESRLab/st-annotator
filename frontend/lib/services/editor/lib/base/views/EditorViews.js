import { Queue } from 'async-await-queue';
import { Data } from 'dataclass';
import { z } from 'zod';

import { IOUtils } from '../../../../../common/lib/utils';

import { ProjectConfig, TaskState, FrameState } from '../../../../project/lib';
import { CommitGraphState, LabelsetBranchState } from '../../../../label/lib';
import { SourceGroupState } from '../../../../source/lib';

/**
 * Get the name of the active project.
 * 
 * @returns {string} The name of the active project.
 */
function requireProjectName() {
    return location.pathname.match("/projects/(.*)/")?.[1] ?? "";
}

/**
 * For more details, refer to the corresponding Pydantic model on the backend.
 */
export class PushCommitsResult extends Data {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = z.object({
        op_results: z.array(z.object({}).passthrough().or(z.unknown())),
        branch: LabelsetBranchState.SCHEMA,
    });

    /**
     * @readonly
     */
    static SCHEMA = this.PLAIN_SCHEMA
        .transform((data) => this.create(data));

    /**
     * @readonly
     * @type {ReadonlyArray<unknown>}
     */
    op_results;

    /**
     * @readonly
     * @type {LabelsetBranchState}
     */
    branch;

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {PushCommitsResult} The resulting new instance.
     */
    static fromJSON(obj) {
        return this.SCHEMA.parse(obj);
    }
}

/**
 * @typedef {{
 *     op_name: string;
 *     op_params: unknown;
 *     result_placeholder_key: ?string;
 *     timestamp: Date;
 *     overwrites: LabelsetCommitInstruction[];
 * }} LabelsetCommitInstruction
 */

/**
 * @typedef {{
 *     last_fetched_head_hash: string;
 *     commits: LabelsetCommitInstruction[];
 *     placeholder_keys: string[];
 * }} PushCommitsData
 */

/**
 * Represents an interface of the application with the backend.
 * 
 * Each public method sends a request to the corresponding view function on the backend.
 */
export class EditorViews {

    /**
     * The base URL of each corresponding view function on the backend.
     * 
     * @readonly
     * @type {string}
     */
    baseUrl;

    /**
     * Creates a new interface of the application with the backend.
     */
    constructor() {
        this.baseUrl = window.location.pathname;
    }

    /**
     * Extracts a header from a {@link JQuery.jqXHR} object.
     * 
     * @param {JQuery.jqXHR<unknown>} jqXHR The object to extract from.
     * @param {string} name The name of the header.
     * @returns {string} The content of the header.
     * @throws {Error} If the header is not found.
     */
    #getHeader(jqXHR, name) {
        const header = jqXHR.getResponseHeader(name);
        if (header == null) {
            throw new Error(`Missing header: ${name}`);
        }

        return header;
    }

    /**
     * Navigates to the editor interface for a frame.
     * 
     * @param {FrameState} frame The target frame.
     */
    async navEditor(frame) {
        window.location.href = `${this.baseUrl}?task_id=${frame.task.id}&frame_id=${frame.id}`;
    }

    /**
     * Gets the configuration data for the currently opened project.
     * 
     * @returns {Promise<ProjectConfig>} A promise that resolves to the requested data.
     */
    async getConfigData() {
        return IOUtils.get(`${this.baseUrl}/config`, { dataType: 'json' })
            .then((d) => ProjectConfig.fromJSON(d))
            .catch((reason) => {
                console.error('Failed to get project configuration:', reason);
                alert(`Failed to get project configuration. Please reload the window.\n\n${reason}`);

                throw reason;
            });
    }

    /**
     * Gets the list of tasks in the currently opened project.
     * 
     * @returns {Promise<TaskState[]>} A promise that resolves to the requested data.
     */
    async listTasks() {
        return IOUtils.get(`${this.baseUrl}/task/list`, { dataType: 'json' })
            .then((data) => IOUtils.parseArray(data).map((d) => TaskState.fromJSON(d)))
            .catch((reason) => {
                console.error('Failed to get list of tasks:', reason);
                alert(`Failed to get list of tasks. Please reload the window.\n\n${reason}`);

                return [];
            });
    }

    /**
     * Loads the source groups for a task from the backend.
     * 
     * @abstract
     * @param {number} taskId The unique identifier of the task.
     * @returns {Promise<SourceGroupState[]>} A promise that resolves to
     * the labelset branches for the task.
     */
    async getSourceGroups(taskId) {
        const groups = await IOUtils.get(`${this.baseUrl}/task/source/groups?task_id=${taskId}`, { dataType: 'json' })
            .then((data) => IOUtils.parseArray(data).map((d) => SourceGroupState.fromJSON(d)))
            .catch((reason) => {
                console.error('Failed to get source groups at:', { taskId }, 'Reason:', reason);

                return [];
            });

        return groups;
    }

    /**
     * Loads the labelset branches for a task from the backend.
     * 
     * @param {number} taskId The unique identifier of the task.
     * @returns {Promise<LabelsetBranchState[]>} A promise that resolves to
     * the labelset branches for the task.
     */
    async getLabelBranches(taskId) {
        const branches = await IOUtils.get(`${this.baseUrl}/task/label/branches?task_id=${taskId}`, { dataType: 'json' })
            .then((data) => IOUtils.parseArray(data).map((d) => LabelsetBranchState.fromJSON(d)))
            .catch((reason) => {
                console.error('Failed to get label branches at:', { taskId }, 'Reason:', reason);

                return [];
            });

        return branches;
    }

    /**
     * Loads the frames for a task that are based on the given source group and label branch
     * from the backend.
     * 
     * @param {number} taskId The unique identifier of the task.
     * @param {?number} sourceGroupId The unique identifier of the source group. If not provided,
     * gets the frames for all available source groups.
     * @param {?number} labelBranchId The unique identifier of the label branch. If not provided,
     * gets the frames for all available label branches.
     * @returns {Promise<FrameState[]>} A promise that resolves to
     * the frames for the task.
     */
    async getFrames(taskId, sourceGroupId, labelBranchId) {
        return IOUtils.get(`${this.baseUrl}/task/frames?task_id=${taskId}&source_group_id=${sourceGroupId}&label_branch_id=${labelBranchId}`, { dataType: 'json' })
            .then((data) => IOUtils.parseArray(data).map((d) => FrameState.fromJSON(d)))
            .catch((reason) => {
                console.error(`Failed to get frames of task #${taskId}:`, reason);

                return [];
            });
    }

    /**
     * Gets the source data for any number of frames.
     * 
     * @param {string} key A key used to identify the data receiver that builds the response
     * on the backend.
     * @param {ReadonlyArray<number>} frameIds The unique identifier of each frame.
     * @param {object} otherArgs Other arguments to pass to the data receiver on the backend.
     * Defaults to an empty plain object.
     * @returns {Promise<Response>} A promise that resolves to a response containing the
     * requested data.
     */
    async bulkGetSourceData(key, frameIds, otherArgs = {}) {
        const urlParams = new URLSearchParams([
            ['key', key],
            ...frameIds.map((frameId) => ['frame_ids', frameId.toString()]),
        ]);

        return fetch(`${this.baseUrl}/source/data/bulk?${urlParams}`, {
            // Fetch API does not allow JSON body in GET request
            method: 'POST',
            mode: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(otherArgs),
        });
    }

    /**
     * Ensures that `this.#bulkGetLabelData` is run sequentially.
     * 
     * @type {Queue<symbol>}
     */
    #bulkGetLabelDataQueue = new Queue(1, 0);

    /**
     * Gets the label data for any number of frames.
     * 
     * @param {string} key A key used to identify the data receiver that builds the response
     * on the backend.
     * @param {ReadonlyArray<number>} frameIds The unique identifier of each frame.
     * @param {object} otherArgs Other arguments to pass to the data receiver on the backend.
     * Defaults to an empty plain object.
     * @returns {Promise<Response>} A promise that resolves to a response containing the
     * requested data.
     * @throws {Error} If a key in `otherArgs` conflicts with `labelParams` or `stParamsBulk`.
     */
    async bulkGetLabelData(key, frameIds, otherArgs = {}) {
        return this.#bulkGetLabelDataQueue.run(
            () => this.#bulkGetLabelData(key, frameIds, otherArgs),
        );
    }

    /**
     * Gets the label data for any number of frames.
     * 
     * @param {string} key A key used to identify the data receiver that builds the response
     * on the backend.
     * @param {ReadonlyArray<number>} frameIds The unique identifier of each frame.
     * @param {object} otherArgs Other arguments to pass to the data receiver on the backend.
     * Defaults to an empty plain object.
     * @returns {Promise<Response>} A promise that resolves to a response containing the
     * requested data.
     */
    async #bulkGetLabelData(key, frameIds, otherArgs = {}) {
        const urlParams = new URLSearchParams([
            ['key', key],
            ...frameIds.map((frameId) => ['frame_ids', frameId.toString()]),
        ]);

        return fetch(`${this.baseUrl}/label/data/bulk?${urlParams}`, {
            // Fetch API does not allow JSON body in GET request
            method: 'POST',
            mode: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(otherArgs),
        });
    }

    /**
     * Gets the details of a branch.
     * 
     * @param {number} labelBranchId The unique identifier of the label branch.
     * @returns {Promise<LabelsetBranchState>} A promise that resolves to the details of the branch.
     */
    async getLabelBranch(labelBranchId) {
        return IOUtils.get(`${this.baseUrl}/labelset/branch?label_branch_id=${labelBranchId}`, { dataType: 'json' })
            .then((d) => LabelsetBranchState.fromJSON(d))
            .catch((reason) => {
                console.error(`Failed to get details of branch #${labelBranchId}:`, reason);

                throw reason;
            });
    }

    /**
     * Gets the commit graph of a branch.
     * 
     * @param {number} labelBranchId The unique identifier of the label branch.
     * @returns {Promise<CommitGraphState>} A promise that resolves to the commit graph
     * of the branch.
     */
    async getCommitGraph(labelBranchId) {
        return IOUtils.get(`${this.baseUrl}/labelset/graph?label_branch_id=${labelBranchId}`, { dataType: 'json' })
            .then((d) => CommitGraphState.fromJSON(d))
            .catch((reason) => {
                console.error(`Failed to get commit graph of branch #${labelBranchId}:`, reason);

                throw reason;
            });
    }

    /**
     * Ensures that `this.#pushCommits` is run sequentially.
     * 
     * @type {Queue<symbol>}
     */
    #updateLabelsetQueue = new Queue(1, 0);

    /**
     * Applies a batch of commits to the backend.
     * 
     * @param {number} taskId The unique identifier of the active task. The branch should
     * be accessible under the given task.
     * @param {number} labelBranchId The unique identifier of the label branch which HEAD to push
     * the commits to.
     * @param {PushCommitsData} data The data of each commit.
     * @returns {Promise<PushCommitsResult>} A promise that resolves to the result of the commits.
     */
    async #pushCommits(taskId, labelBranchId, data) {
        const result = await IOUtils.post(
            `${this.baseUrl}/labelset/push?task_id=${taskId}&label_branch_id=${labelBranchId}`,
            {
                contentType: 'application/json',
                data: JSON.stringify(data),
            },
        ).catch((reason) => {
            console.error('Failed to push commits to labelset at:', { taskId, labelBranchId }, 'Reason:', reason);
            alert(`Failed to save changes.\n\n${reason}`);

            throw reason;
        });

        return PushCommitsResult.fromJSON(result);
    }

    /**
     * Applies a batch of commits to the backend.
     * 
     * @param {number} taskId The unique identifier of the active task. The branch should
     * be accessible under the given task.
     * @param {number} branchId The unique identifier of the label branch which HEAD to push
     * the commits to.
     * @param {PushCommitsData} data The data of each commit.
     * @returns {Promise<PushCommitsResult>} A promise that resolves to the result of the commits.
     */
    async pushCommits(taskId, branchId, data) {
        return this.#updateLabelsetQueue.run(
            () => this.#pushCommits(taskId, branchId, data),
        );
    }

    /**
     * Logs to the backend that a frame has been viewed in the application.
     * 
     * @param {number} frameId The unique identifier of the frame.
     * @returns {Promise<void>} A promise representing the task.
     */
    async updateFrameLastViewedAt(frameId) {
        await IOUtils.post(`${this.baseUrl}/frame/last_viewed_at?frame_id=${frameId}`, {})
            .catch((reason) => {
                console.error(`Failed to apply log for viewing frame #${frameId}:`, reason);

                throw reason;
            });
    }

    /**
     * Sets whether the task is complete at a frame.
     * 
     * @param {number} frameId The unique identifier of the frame.
     * @param {boolean} isComplete `true` if the task is complete at the given frame;
     * otherwise, `false`.
     * @returns {Promise<void>} A promise representing the task.
     */
    async updateFrameIsComplete(frameId, isComplete) {
        await IOUtils.post(`${this.baseUrl}/frame/is_complete?frame_id=${frameId}&is_complete=${isComplete}`, {})
            .catch((reason) => {
                const frameStr = `frame ${frameId}`;
                const msg = isComplete ? `Failed to mark ${frameStr} as complete:` : `Failed to mark ${frameStr} as not complete:`;
                console.error(msg, reason);

                throw reason;
            });
    }
}
