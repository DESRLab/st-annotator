import { Queue } from 'async-await-queue';
import { Data } from 'dataclass';
import _ from 'lodash';
import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';

import { CollectionUtils, Timestamp } from '../../../../../common/lib/utils';

import { LabelsetBranchState, LabelsetCommitState } from '../../../../label/lib';

import { Placeholder } from './Placeholder';

/**
 * @typedef {import('../../../../../common/lib/utils').Hashable} Hashable
 */

/**
 * @typedef {import('../../../../label/lib').LabelGroupState} LabelGroupState
 */

/**
 * @typedef {import('../../../../label/lib').CommitGraphState} CommitGraphState
 */

/**
 * @typedef {import('../views').EditorViews} EditorViews
 */

/**
 * @typedef {import('../views').LabelsetCommitInstruction} LabelsetCommitInstruction
 */

/**
 * @template P
 * @template {{} | null} R
 * @typedef {import('./Operation').Operation<P, R>} Operation
 */

/**
 * Defines each event that can be dispatched by {@link EditableBranch}.
 * 
 * @typedef {object} EditableBranchEventMap
 * @property {{}} beforechange The event right before the state of the branch is updated.
 * @property {{}} afterchange The event right after the state of the branch is updated.
 */

/**
 * Proxy class to uniquely identify each {@link LabelsetCommit}.
 */
export class CommitID {}

/**
 * Represents the status of an operation in the history of a {@link EditableBranch}.
 * 
 * @readonly
 * @enum {'inactive' | 'active' | 'saved'}
 */
export const HistoryItemStatus = Object.freeze({
    /**
     * This operation was previously applied to the local data but has since been undone.
     * 
     * This operation can be redone.
     */
    INACTIVE: 'inactive',

    /**
     * This operation is applied to the local data but not that remote data.
     * 
     * This operation can be undone.
     */
    ACTIVE: 'active',

    /**
     * This operation is applied to both the local and remote data.
     * 
     * This operation can neither be redone or undone.
     */
    SAVED: 'saved',
});

/**
 * Contains user-facing information for an operation in the history of a {@link EditableBranch}.
 * 
 * This is a value-based class.
 */
export class HistoryItem extends Data {

    /**
     * The unique identifier of the operation.
     * 
     * @readonly
     * @type {CommitID}
     */
    id;

    /**
     * The name of the operation.
     * 
     * @readonly
     * @type {string}
     */
    name;

    /**
     * The detailed information of the operation.
     * 
     * @readonly
     * @type {string}
     */
    details;

    /**
     * The status of this operation.
     * 
     * @readonly
     * @type {HistoryItemStatus}
     */
    status;

    /**
     * `true` if the operation is the latest one that is saved;
     * otherwise, `false`.
     * 
     * @readonly
     * @type {boolean}
     */
    isSavepoint;

    /**
     * `true` if the operation is the latest one that is active;
     * otherwise, `false`.
     * 
     * @readonly
     * @type {boolean}
     */
    isCurrent;
}

/**
 * Contains internal information of a commit to apply to a {@link EditableBranch}.
 * 
 * @template P The parameter type of the commit.
 * @template {{} | null} R The return type of the commit.
 */
class LabelsetCommit {

    /**
     * The operation performed by this commit.
     * 
     * @readonly
     * @type {Operation<P, R>}
     */
    op;

    /**
     * The commits that are overwritten by this commit (e.g. if this commit is
     * called after undoing some commits).
     * 
     * @readonly
     * @type {ReadonlyArray<LabelsetCommit<any, any>>}
     */
    overwrites;

    /**
     * The timestamp when this commit was last applied.
     * 
     * @readonly
     * @type {Date}
     */
    timestamp;

    /**
     * Creates a new commit representing a operation.
     * 
     * @param {Operation<P, R>} op The operation performed by the commit.
     * @param {ReadonlyArray<LabelsetCommit<any, any>>} overwrites The commits that
     * are overwritten by the operation.
     */
    constructor(op, overwrites) {
        this.op = op;
        this.overwrites = overwrites;

        this.timestamp = new Date();
    }
}

/**
 * The initial operation that acts as a dummy.
 * 
 * Since the state of a branch is the state represented *after* applying the selected
 * operation, without this, the user would not be able to undo their first operation.
 * 
 * @implements {Operation<null, null>}
 */
export class OpenEditor {

    /**
     * The display name of this operation.
     * 
     * @type {string}
     */
    get displayName() { return 'Open Editor'; }

    /**
     * The name of this operation, which is sent to the backend.
     * 
     * @type {string}
     */
    get opName() { return 'open-editor'; }

    /**
     * The parameters of this operation, which is sent to the backend.
     * May contain {@link Placeholder} instances.
     * 
     * @type {null}
     */
    get opParams() { return null; }

    /**
     * The result of this operation, expressed as a {@link Placeholder}.
     * 
     * It is resolved with the value returned from the backend after it is pushed there.
     * 
     * @type {?Placeholder<null>}
     */
    get opResult() { return null; }

    /**
     * Applies this operation to the local data.
     */
    applyLocal() {
        throw new Error('Not allowed');
    }

    /**
     * Reverts the changes applied by this operation to the local data.
     */
    undoLocal() {
        throw new Error('Not allowed');
    }
}

/**
 * A {@link LabelsetBranchState} which attributes can be modified.
 * 
 * @augments THREE.EventDispatcher<EditableBranchEventMap>
 * @implements {Hashable}
 */
export class EditableBranch extends THREE.EventDispatcher {

    /**
     * The interface of the application with the backend, so that any modifications
     * through this view are also reflected in the backend.
     * 
     * @readonly
     * @type {EditorViews}
     */
    views;

    /**
     * The original state fetched from the server, which may be out of sync with this object.
     * 
     * @type {LabelsetBranchState}
     */
    #state;

    /**
     * The unique identifier of this branch.
     * 
     * @readonly
     * @type {number}
     */
    get id() { return this.#state.id; }

    /**
     * The label group which this branch belongs to.
     * 
     * @readonly
     * @type {LabelGroupState}
     */
    get group() { return this.#state.group; }

    /**
     * The name of this branch.
     * 
     * @readonly
     * @type {string}
     */
    get name() { return this.#state.name; }

    /**
     * The head commit of this branch. (In terms of the remote state)
     * 
     * @readonly
     * @type {LabelsetCommitState}
     */
    get head() {
        const headEntry = this.#commitEntries.find(([id]) => id === this.#remoteHead);
        if (headEntry == null) {
            throw new Error('Cannot find head commit');
        }

        const [, headCommit] = headEntry;

        return LabelsetCommitState.create({
            group: this.group,
            hash_: this.#state.head.hash_,
            author_id: this.#state.head.author_id,
            timestamp: new Timestamp(headCommit.timestamp),
            op_config: { op_name: headCommit.op.opName, op_params: headCommit.op.opParams },
        });
    }

    /**
     * The checkpoint commit of this branch.
     * 
     * @readonly
     * @type {LabelsetCommitState}
     */
    get checkpoint() { return this.#state.checkpoint; }

    /**
     * @type {?CommitGraphState}
     */
    #graph;

    /**
     * The commit graph of this branch.
     * 
     * @readonly
     * @type {CommitGraphState}
     */
    get graph() {
        if (this.#graph == null) {
            throw new Error('The commit graph of this branch has not been loaded');
        }

        return this.#graph;
    }

    /**
     * The commits that were made since this application was opened, sorted
     * in chronological order.
     * 
     * @type {[CommitID, LabelsetCommit<any, any>][]}
     */
    #commitEntries;

    /**
     * The latest commit that is applied locally, or `null` if there is none.
     * 
     * @type {?CommitID}
     */
    #localHead;

    /**
     * The latest commit that is applied remotely, or `null` if there is none.
     * 
     * @type {?CommitID}
     */
    #remoteHead;

    /**
     * `true` if the local data has unsaved changes; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get hasUnsavedChanges() {
        return this.#localHead !== this.#remoteHead;
    }

    /**
     * Creates a new editor of branches, with its commit graph already loaded.
     * 
     * @param {EditorViews} views The interface of the application with the backend,
     * so that any modifications through this view are also reflected in the backend.
     * @param {LabelsetBranchState} state The state of the branch to initialize from.
     */
    static async create(views, state) {
        const branch = new EditableBranch(views, state);

        await branch.load();

        return branch;
    }

    /**
     * Creates a new editor of branches.
     * 
     * @protected
     * @param {EditorViews} views The interface of the application with the backend,
     * so that any modifications through this view are also reflected in the backend.
     * @param {LabelsetBranchState} state The state of the branch to initialize from.
     */
    constructor(views, state) {
        super();

        this.views = views;
        this.#state = state;

        this.#graph = null;

        const dummyOp = new OpenEditor();
        const dummyCommit = new LabelsetCommit(dummyOp, []);
        const dummyId = new CommitID();

        this.#commitEntries = [[dummyId, dummyCommit]];
        this.#localHead = dummyId;
        this.#remoteHead = dummyId;
    }

    /**
     * Loads the commit graph of this branch.
     */
    async load() {
        this.#graph = await this.views.getCommitGraph(this.id);
    }

    /**
     * Creates a copy of this object as an immutable state.
     * 
     * @returns {LabelsetBranchState} The resulting state.
     */
    toState() {
        return LabelsetBranchState.create({
            id: this.id,
            group: this.group,
            name: this.name,
            head: this.head,
            checkpoint: this.checkpoint,
        });
    }

    /**
     * Hashes this object to a string so that it can be used as a key in a mapping.
     * 
     * @returns {string} The resulting hash.
     */
    hash() {
        return JSON.stringify({ id: this.id });
    }

    /**
     * Tests whether two objects are equal to each other;
     * that is, whether they have the same unique identifier.
     *
     * @param {object} other The object to compare against.
     * @returns {boolean} `true` if the two objects are equal; otherwise, `false`.
     */
    equals(other) {
        return other instanceof EditableBranch
            && this.id === other.id;
    }

    /**
     * Returns a value corresponding to `this.#localHead`, such that it can be passed to the
     * `end` parameter of `this.#commitEntries.slice()`. The slice result thus corresponds to the
     * commits that are applied locally.
     * 
     * @returns {number} The requested index.
     */
    #getActiveEndIdx() {
        return this.#commitEntries.findIndex(([id]) => id === this.#localHead) + 1;
    }

    /**
     * Returns a value corresponding to `this.#remoteHead`, such that it can be passed to the
     * `end` parameter of `this.#commitEntries.slice()`. The slice result thus corresponds to the
     * commits that are saved remotely.
     * 
     * @returns {number} The requested index.
     */
    #getSavedEndIdx() {
        return this.#commitEntries.findIndex(([id]) => id === this.#remoteHead) + 1;
    }

    /**
     * Gets the history of this collection of labels, sorted in chronological order.
     * 
     * @returns {ReadonlyArray<HistoryItem>} The requested history.
     */
    getHistory() {
        const activeEndIdx = this.#getActiveEndIdx();
        const savedEndIdx = this.#getSavedEndIdx();

        /**
         * @type {(i: number) => HistoryItemStatus}
         */
        const getStatus = (i) => {
            if (_.inRange(i, 0, savedEndIdx)) return HistoryItemStatus.SAVED;
            if (_.inRange(i, savedEndIdx, activeEndIdx)) return HistoryItemStatus.ACTIVE;

            return HistoryItemStatus.INACTIVE;
        };

        return this.#commitEntries.map(([id, commit], i) => {
            const status = getStatus(i);
            const isSavepoint = i === savedEndIdx - 1;
            const isCurrent = i === activeEndIdx - 1;
            const { displayName, opParams } = commit.op;
            const paramsStr = JSON.stringify(opParams, undefined, 2);

            return HistoryItem.create({
                id: id,
                name: displayName,
                details: `Parameters:\n${paramsStr}`,
                status: status,
                isSavepoint: isSavepoint,
                isCurrent: isCurrent,
            });
        });
    }

    /**
     * Ensures that all update operations are run sequentially.
     * 
     * @type {Queue<symbol>}
     */
    #updateQueue = new Queue(1, 0);

    /**
     * `true` if any update operations are waiting; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get isUpdating() {
        const { waiting, running } = this.#updateQueue.stat();
        return waiting > 0 || running > 0;
    }

    /**
     * Schedules a task that updates the labelset.
     * 
     * @template T
     * @param {() => T} task The task to schedule.
     * @returns {Promise<T>} A promise that resolves to the result of the task.
     */
    async #scheduleUpdate(task) {
        return this.#updateQueue.run(async () => {
            this.dispatchEvent({ type: 'beforechange' });

            return task();
        }).finally(() => {
            this.dispatchEvent({ type: 'afterchange' });
        });
    }

    /**
     * Applies an operation to the local data.
     * 
     * Note that this will overwrite any operations that are undone.
     * 
     * (Use `this.pushAll()` to apply operations to the remote data.)
     * 
     * @param {Operation<any, any>} op The operation to apply.
     */
    #apply(op) {
        const commitsToOverwrite = this.#commitEntries.splice(this.#getActiveEndIdx())
            .map(([, commit]) => commit);

        const id = new CommitID();
        const opCommit = new LabelsetCommit(op, commitsToOverwrite);

        this.#commitEntries.push([id, opCommit]);
        this.#localHead = id;

        op.applyLocal();
    }

    /**
     * Applies an operation to the local data.
     * 
     * Note that this will overwrite any operations that are undone.
     * 
     * (Use `this.pushAll()` to apply operations to the remote data.)
     * 
     * @param {Operation<any, any>} op The operation to apply.
     */
    async apply(op) {
        await this.#scheduleUpdate(() => this.#apply(op));
    }

    /**
     * Sets the latest applied operation, undoing any operations that come after that.
     * 
     * @param {CommitID} commitId The unique identifier of the operation to set as latest.
     * @throws {Error} If the operation does not exist in the history, or if it would result
     * in undoing an operation that has already been applied to the remote data.
     */
    #rebase(commitId) {
        const history = this.getHistory();
        const commitEntries = this.#commitEntries;

        const commitIdx = history.findIndex((item) => item.id === commitId);
        if (commitIdx === -1) {
            throw new Error(`Cannot find commit with ID: ${commitId}`);
        }

        const activeIdx = this.#getActiveEndIdx();

        // Redo operations
        for (let idx = activeIdx; idx < commitIdx + 1; idx++) {
            const historyItem = history[idx];
            if (historyItem.status === HistoryItemStatus.SAVED) {
                throw new Error(`Cannot redo saved commit with ID: ${commitId}`);
            }
            if (historyItem.status === HistoryItemStatus.ACTIVE) {
                throw new Error(`Cannot redo active commit with ID: ${commitId}`);
            }

            const [id, commit] = commitEntries[idx];
            commit.op.applyLocal();

            // In case an error occurs, localHead is still set correctly
            this.#localHead = id;
        }

        // Undo operations
        for (let idx = activeIdx - 1; idx > commitIdx; idx--) {
            const historyItem = history[idx];
            if (historyItem.status === HistoryItemStatus.SAVED) {
                throw new Error(`Cannot undo saved commit with ID: ${commitId}`);
            }
            if (historyItem.status === HistoryItemStatus.INACTIVE) {
                throw new Error(`Cannot undo inactive commit with ID: ${commitId}`);
            }

            const [, commit] = commitEntries[idx];
            commit.op.undoLocal();

            // In case an error occurs, localHead is still set correctly
            const [id] = commitEntries[idx - 1];
            this.#localHead = id;
        }
    }

    /**
     * Sets the latest applied operation, undoing any operations that come after that.
     * 
     * @param {CommitID} commitId The unique identifier of the operation to set as latest.
     * @throws {Error} If the operation does not exist in the history, or if it would result
     * in undoing an operation that has already been applied to the remote data.
     */
    async rebase(commitId) {
        await this.#scheduleUpdate(() => this.#rebase(commitId));
    }

    /**
     * Applies each operation that has been applied to the local data, to the remote data.
     * 
     * Note that operations that have been undone will not be applied to the remote data either.
     * 
     * @param {number} taskId The unique identifier of the active task. This branch should
     * be accessible under the given task.
     */
    async #pushActive(taskId) {
        const entriesToPush = this.#commitEntries.slice(
            this.#getSavedEndIdx(),     // The commit after the last saved one
            this.#getActiveEndIdx(),    // The last active commit (inclusive)
        );
        const commitsToPush = entriesToPush.map(([, commit]) => commit);

        /**
         * @type {CollectionUtils.DefaultMap<Placeholder<any>, string>}
         */
        const keyedPlaceholders = new CollectionUtils.DefaultMap(() => {
            let id = `{${uuidv4()}}`;

            const existingIds = new Set(keyedPlaceholders.values());
            while (existingIds.has(id)) {
                id = `{${uuidv4()}}`;
            }

            return id;
        });

        /**
         * @type {(v: unknown) => unknown}
         */
        const deepPlaceholderToKey = (v) => {
            if (Placeholder.isPlaceholder(v)) return v.orElseGet(() => keyedPlaceholders.get(v));

            if (_.isArray(v)) return v.map(deepPlaceholderToKey);

            // @ts-expect-error
            if (_.isPlainObject(v)) return _.mapValues(v, deepPlaceholderToKey);

            return v;
        };

        /**
         * @type {(commit: LabelsetCommit<any, any>) => LabelsetCommitInstruction}
         */
        const commitToInstruction = (commit) => {
            const { opName, opParams, opResult } = commit.op;
            const { timestamp, overwrites } = commit;

            return {
                op_name: opName,
                op_params: deepPlaceholderToKey(opParams),
                result_placeholder_key: (opResult == null) ? null : keyedPlaceholders.get(opResult),
                timestamp: timestamp,
                overwrites: overwrites.map(commitToInstruction),
            };
        };

        const commitInstructions = commitsToPush.map(commitToInstruction);
        const placeholderKeys = [...keyedPlaceholders.values()];

        const result = await this.views.pushCommits(
            taskId, this.id,
            {
                last_fetched_head_hash: this.#state.head.hash_,
                commits: commitInstructions,
                placeholder_keys: placeholderKeys,
            },
        );

        commitsToPush.forEach((commit, i) => {
            commit.op.opResult?.put(result.op_results[i]);
        });

        this.#remoteHead = this.#localHead;
        this.#state = result.branch;
        this.#graph = await this.views.getCommitGraph(this.id);
    }

    /**
     * Applies each operation that has been applied to the local data, to the remote data.
     * 
     * Note that operations that have been undone will not be applied to the remote data either.
     * 
     * @param {number} taskId The unique identifier of the active task. This branch should
     * be accessible under the given task.
     */
    async pushActive(taskId) {
        await this.#scheduleUpdate(() => this.#pushActive(taskId));
    }
}
