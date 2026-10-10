import { Queue } from "async-await-queue";
import _ from "lodash";

import {
  CommitGraphState,
  LabelGroupState,
  LabelsetBranchState,
  LabelsetCommitState,
} from "../models";
import { type Hashable } from "sta/common";

import { VanillaEventDispatcher } from "../utils";
import type { EditorViews, LabelsetCommitInstruction } from "../views";

import type { Operation } from "./Operation";
import { Placeholder } from "./Placeholder";

/**
 * Defines each event that can be dispatched by {@link EditableBranch}.
 */
export interface EditableBranchEventMap {
  beforechange: {};
  afterchange: {};
}

/**
 * Proxy class to uniquely identify each `LabelsetCommit`.
 */
export class CommitID {}

/**
 * Represents the status of an operation in the history of a {@link EditableBranch}.
 */
export const HistoryItemStatus = Object.freeze({
  /**
   * This operation was previously applied to the local data but has since been undone.
   *
   * This operation can be redone.
   */
  INACTIVE: "inactive" as const,

  /**
   * This operation is applied to the local data but not that remote data.
   *
   * This operation can be undone.
   */
  ACTIVE: "active" as const,

  /**
   * This operation is applied to both the local and remote data.
   *
   * This operation can neither be redone or undone.
   */
  SAVED: "saved" as const,
});

export type HistoryItemStatusType =
  (typeof HistoryItemStatus)[keyof typeof HistoryItemStatus];

/**
 * The values a {@link HistoryItem} is built from.
 */
export interface HistoryItemValues {
  id: CommitID;
  name: string;
  details: string;
  status: HistoryItemStatusType;
  isSavepoint: boolean;
  isCurrent: boolean;
}

/**
 * Contains user-facing information for an operation in the history of a {@link EditableBranch}.
 *
 * Each read of the history rebuilds these, so an instance identifies its
 * operation through {@link HistoryItem.id} rather than through its own
 * identity.
 */
export class HistoryItem {
  /** The unique identifier of the operation. */
  readonly id: CommitID;

  /** The name of the operation. */
  readonly name: string;

  /** The detailed information of the operation. */
  readonly details: string;

  /** The status of this operation. */
  readonly status: HistoryItemStatusType;

  /** `true` if the operation is the latest one that is saved; otherwise, `false`. */
  readonly isSavepoint: boolean;

  /** `true` if the operation is the latest one that is active; otherwise, `false`. */
  readonly isCurrent: boolean;

  constructor(values: HistoryItemValues) {
    this.id = values.id;
    this.name = values.name;
    this.details = values.details;
    this.status = values.status;
    this.isSavepoint = values.isSavepoint;
    this.isCurrent = values.isCurrent;
  }

  /**
   * Creates an immutable instance from fully resolved values.
   */
  static create(values: HistoryItemValues): HistoryItem {
    return Object.freeze(new HistoryItem(values));
  }
}

/**
 * Contains internal information of a commit to apply to a {@link EditableBranch}.
 */
class LabelsetCommit<P, R extends {} | null> {
  /** The operation performed by this commit. */
  readonly op: Operation<P, R>;

  /**
   * The commits that are overwritten by this commit (e.g. if this commit is
   * called after undoing some commits).
   */
  readonly overwrites: readonly LabelsetCommit<any, any>[];

  /** The timestamp when this commit was last applied. */
  readonly timestamp: Date;

  /**
   * Creates a new commit representing a operation.
   */
  constructor(
    op: Operation<P, R>,
    overwrites: readonly LabelsetCommit<any, any>[],
  ) {
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
 */
export class OpenEditor implements Operation<null, null> {
  /** The display name of this operation. */
  get displayName(): string {
    return "Open Editor";
  }

  /** The name of this operation, which is sent to the backend. */
  get opName(): string {
    return "open-editor";
  }

  /** The parameters of this operation, which is sent to the backend. */
  get opParams(): null {
    return null;
  }

  /**
   * The result of this operation, expressed as a {@link Placeholder}.
   *
   * It is resolved with the value returned from the backend after it is pushed there.
   */
  get opResult(): Placeholder<null> | null {
    return null;
  }

  applyLocal(): void {
    throw new Error("Not allowed");
  }

  undoLocal(): void {
    throw new Error("Not allowed");
  }
}

/**
 * A {@link LabelsetBranchState} which attributes can be modified.
 */
export class EditableBranch
  extends VanillaEventDispatcher<EditableBranchEventMap>
  implements Hashable
{
  /**
   * The interface of the application with the backend, so that any modifications
   * through this view are also reflected in the backend.
   */
  readonly views: EditorViews;

  /** The original state fetched from the server, which may be out of sync with this object. */
  #state: LabelsetBranchState;

  get id(): number {
    return this.#state.id;
  }

  /** The label group which this branch belongs to. */
  get group(): LabelGroupState {
    return this.#state.group;
  }

  /** The name of this branch. */
  get name(): string {
    return this.#state.name;
  }

  /** The head commit of this branch. (In terms of the remote state) */
  get head(): LabelsetCommitState {
    return this.#state.head;
  }

  /** The checkpoint commit of this branch. */
  get checkpoint(): LabelsetCommitState {
    return this.#state.checkpoint;
  }

  #graph: CommitGraphState | null;

  /** The commit graph of this branch. */
  get graph(): CommitGraphState {
    if (this.#graph == null) {
      throw new Error("The commit graph of this branch has not been loaded");
    }

    return this.#graph;
  }

  /**
   * The commits that were made since this application was opened, sorted
   * in chronological order.
   */
  #commitEntries: [CommitID, LabelsetCommit<any, any>][];

  /** The latest commit that is applied locally, or `null` if there is none. */
  #localHead: CommitID | null;

  /** The latest commit that is applied remotely, or `null` if there is none. */
  #remoteHead: CommitID | null;

  /**
   * The end boundary of the active commits in {@link #commitEntries}, that is,
   * the index one past the entry of {@link #localHead}.
   */
  #activeEndIdx: number;

  /**
   * The end boundary of the saved commits in {@link #commitEntries}, that is,
   * the index one past the entry of {@link #remoteHead}.
   */
  #savedEndIdx: number;

  /** `true` if the local data has unsaved changes; otherwise, `false`. */
  get hasUnsavedChanges(): boolean {
    return this.#localHead !== this.#remoteHead;
  }

  /**
   * Creates a new editor of branches, with its commit graph already loaded.
   */
  static async create(
    views: EditorViews,
    state: LabelsetBranchState,
  ): Promise<EditableBranch> {
    const branch = new EditableBranch(views, state);

    await branch.load();

    return branch;
  }

  /**
   * Creates a new editor of branches.
   */
  protected constructor(views: EditorViews, state: LabelsetBranchState) {
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
    this.#activeEndIdx = this.#commitEntries.length;
    this.#savedEndIdx = this.#commitEntries.length;
  }

  /** Loads the commit graph of this branch. */
  async load(): Promise<void> {
    this.#graph = await this.views.getCommitGraph(this.id);
  }

  /** Creates a copy of this object as an immutable state. */
  toState(): LabelsetBranchState {
    return LabelsetBranchState.create({
      id: this.id,
      group: this.group,
      name: this.name,
      head: this.head,
      checkpoint: this.checkpoint,
    });
  }

  /** Hashes this object to a string so that it can be used as a key in a mapping. */
  hash(): string {
    return JSON.stringify({ id: this.id });
  }

  /**
   * Tests whether two objects are equal to each other;
   * that is, whether they have the same unique identifier.
   */
  equals(other: object): boolean {
    return other instanceof EditableBranch && this.id === other.id;
  }

  /** Gets the history of this collection of labels, sorted in chronological order. */
  getHistory(): readonly HistoryItem[] {
    const activeEndIdx = this.#activeEndIdx;
    const savedEndIdx = this.#savedEndIdx;

    const getStatus = (i: number): HistoryItemStatusType => {
      if (_.inRange(i, 0, savedEndIdx)) return HistoryItemStatus.SAVED;
      if (_.inRange(i, savedEndIdx, activeEndIdx))
        return HistoryItemStatus.ACTIVE;

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

  /** Ensures that all update operations are run sequentially. */
  #updateQueue = new Queue<symbol>(1, 0);

  /** `true` if any update operations are waiting; otherwise, `false`. */
  get isUpdating(): boolean {
    const { waiting, running } = this.#updateQueue.stat();
    return waiting > 0 || running > 0;
  }

  /**
   * Schedules a task that updates the labelset.
   */
  async #scheduleUpdate<T>(task: () => T): Promise<T> {
    return this.#updateQueue
      .run(async () => {
        this.dispatchEvent({ type: "beforechange" });

        return task();
      })
      .finally(() => {
        this.dispatchEvent({ type: "afterchange" });
      });
  }

  /**
   * Applies an operation to the local data.
   *
   * Note that this will overwrite any operations that are undone.
   *
   * (Use `this.pushAll()` to apply operations to the remote data.)
   */
  #apply(op: Operation<any, any>): void {
    // Apply first: a failing operation must not destroy redo history or move heads.
    op.applyLocal();

    const commitsToOverwrite = this.#commitEntries
      .splice(this.#activeEndIdx)
      .map(([, commit]) => commit);

    const id = new CommitID();
    const opCommit = new LabelsetCommit(op, commitsToOverwrite);

    this.#commitEntries.push([id, opCommit]);
    this.#localHead = id;
    this.#activeEndIdx = this.#commitEntries.length;
  }

  /**
   * Applies an operation to the local data.
   *
   * Note that this will overwrite any operations that are undone.
   *
   * (Use `this.pushAll()` to apply operations to the remote data.)
   */
  async apply(op: Operation<any, any>): Promise<void> {
    await this.#scheduleUpdate(() => this.#apply(op));
  }

  /**
   * Sets the latest applied operation, undoing any operations that come after that.
   *
   * @throws {Error} If the operation does not exist in the history, or if it would result
   * in undoing an operation that has already been applied to the remote data.
   */
  #rebase(commitId: CommitID): void {
    const commitEntries = this.#commitEntries;

    const commitIdx = commitEntries.findIndex(([id]) => id === commitId);
    if (commitIdx === -1) {
      throw new Error(
        `Cannot find commit with ID: ${JSON.stringify(commitId)}`,
      );
    }

    const activeIdx = this.#activeEndIdx;

    // Redo operations
    for (let idx = activeIdx; idx < commitIdx + 1; idx++) {
      if (idx < this.#savedEndIdx) {
        throw new Error(
          `Cannot redo saved commit with ID: ${JSON.stringify(commitId)}`,
        );
      }
      if (idx < this.#activeEndIdx) {
        throw new Error(
          `Cannot redo active commit with ID: ${JSON.stringify(commitId)}`,
        );
      }

      const [id, commit] = commitEntries[idx];
      commit.op.applyLocal();

      // In case an error occurs, localHead is still set correctly
      this.#localHead = id;
      this.#activeEndIdx = idx + 1;
    }

    // Undo operations
    for (let idx = activeIdx - 1; idx > commitIdx; idx--) {
      if (idx < this.#savedEndIdx) {
        throw new Error(
          `Cannot undo saved commit with ID: ${JSON.stringify(commitId)}`,
        );
      }
      if (idx >= this.#activeEndIdx) {
        throw new Error(
          `Cannot undo inactive commit with ID: ${JSON.stringify(commitId)}`,
        );
      }

      const [, commit] = commitEntries[idx];
      commit.op.undoLocal();

      // In case an error occurs, localHead is still set correctly
      const [id] = commitEntries[idx - 1];
      this.#localHead = id;
      this.#activeEndIdx = idx;
    }
  }

  /**
   * Sets the latest applied operation, undoing any operations that come after that.
   *
   * @throws {Error} If the operation does not exist in the history, or if it would result
   * in undoing an operation that has already been applied to the remote data.
   */
  async rebase(commitId: CommitID): Promise<void> {
    await this.#scheduleUpdate(() => this.#rebase(commitId));
  }

  /**
   * Applies each operation that has been applied to the local data, to the remote data.
   *
   * Note that operations that have been undone will not be applied to the remote data either.
   */
  async #pushActive(taskId: number): Promise<void> {
    const entriesToPush = this.#commitEntries.slice(
      this.#savedEndIdx, // The commit after the last saved one
      this.#activeEndIdx, // The last active commit (inclusive)
    );
    // A save that finds nothing unsaved (e.g. a second save queued while
    // the first was still in flight) must not send an empty push.
    if (entriesToPush.length === 0) return;

    const commitsToPush = entriesToPush.map(([, commit]) => commit);

    const keyedPlaceholders = new Map<Placeholder<any>, string>();

    const placeholderToKey = (placeholder: Placeholder<any>): string => {
      const existing = keyedPlaceholders.get(placeholder);
      if (existing != null) return existing;
      keyedPlaceholders.set(placeholder, placeholder.wireKey);
      return placeholder.wireKey;
    };

    const isPlainObject = (v: unknown): v is Record<string, unknown> =>
      _.isPlainObject(v);

    const deepPlaceholderToKey = (v: unknown): unknown => {
      if (Placeholder.isPlaceholder(v))
        return v.orElseGet(() => placeholderToKey(v));

      if (_.isArray(v)) return v.map(deepPlaceholderToKey);

      if (isPlainObject(v)) return _.mapValues(v, deepPlaceholderToKey);

      return v;
    };

    const commitToInstruction = (
      commit: LabelsetCommit<any, any>,
    ): LabelsetCommitInstruction => {
      const { opName, opParams, opResult } = commit.op;
      const { timestamp, overwrites } = commit;

      return {
        op_name: opName,
        op_params: deepPlaceholderToKey(opParams),
        result_placeholder_key:
          opResult == null ? null : placeholderToKey(opResult),
        timestamp: timestamp,
        overwrites: overwrites.map(commitToInstruction),
      };
    };

    const commitInstructions = commitsToPush.map(commitToInstruction);
    const placeholderKeys = [...keyedPlaceholders.values()];

    const result = await this.views.pushCommits(taskId, this.id, {
      last_fetched_head_hash: this.#state.head.hash_,
      commits: commitInstructions,
      placeholder_keys: placeholderKeys,
    });

    commitsToPush.forEach((commit, i) => {
      commit.op.opResult?.put(result.op_results[i]);
    });

    this.#remoteHead = this.#localHead;
    this.#savedEndIdx = this.#activeEndIdx;
    // `result.branch` is the branch the push itself committed, from the same
    // response as the operation results. The head adopted here therefore is the
    // head the server moved, which is what the next save submits as
    // `last_fetched_head_hash` for the backend's staleness check to compare
    // against.
    this.#state = result.branch;
    this.#graph = await this.views.getCommitGraph(this.id);
  }

  /**
   * Applies each operation that has been applied to the local data, to the remote data.
   *
   * Note that operations that have been undone will not be applied to the remote data either.
   */
  async pushActive(taskId: number): Promise<void> {
    await this.#scheduleUpdate(() => this.#pushActive(taskId));
  }
}
