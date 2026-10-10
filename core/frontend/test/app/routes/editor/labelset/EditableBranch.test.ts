import { describe, expect, it, vi } from "vitest";

import { LabelsetBranchState } from "../../../../../app/routes/editor/models";

import {
  CommitID,
  EditableBranch,
  HistoryItemStatus,
} from "../../../../../app/routes/editor/labelset/EditableBranch";
import type { Operation } from "../../../../../app/routes/editor/labelset/Operation";
import { Placeholder } from "../../../../../app/routes/editor/labelset/Placeholder";
import type {
  EditorViews,
  PushCommitsData,
} from "../../../../../app/routes/editor/views";

/** An op whose only observable behavior is its local apply/undo calls. */
class RecordingOperation implements Operation<{ value: number }, null> {
  applyCalls = 0;
  undoCalls = 0;

  constructor(
    readonly displayName: string,
    readonly value = 1,
  ) {}

  get opName(): string {
    return "test-op";
  }

  get opParams(): { value: number } {
    return { value: this.value };
  }

  get opResult(): null {
    return null;
  }

  applyLocal(): void {
    this.applyCalls += 1;
  }

  undoLocal(): void {
    this.undoCalls += 1;
  }
}

/** Exposes the protected constructor without the async commit-graph load. */
class TestBranch extends EditableBranch {
  static create(views: EditorViews, state: LabelsetBranchState): TestBranch {
    return new TestBranch(views, state);
  }
}

function makeBranchStateJson() {
  return {
    id: 1,
    group: { id: 1, name: "Test Group" },
    name: "main",
    head: {
      group: { id: 1, name: "Test Group" },
      hash_: "head-hash",
      author_id: 0,
      timestamp: "2026-08-13T00:00:00+00:00",
      op_config: { op_name: "server-op", op_params: { source: "remote" } },
    },
  };
}

function makeBranch(pushCommits = vi.fn()): {
  branch: TestBranch;
  pushCommits: ReturnType<typeof vi.fn>;
  getLabelBranch: ReturnType<typeof vi.fn>;
} {
  const getLabelBranch = vi.fn();
  const views = {
    getCommitGraph: vi.fn().mockResolvedValue(null),
    getLabelBranch: getLabelBranch,
    pushCommits: pushCommits,
  } as unknown as EditorViews;

  const branch = TestBranch.create(
    views,
    LabelsetBranchState.fromJSON(makeBranchStateJson()),
  );
  return { branch, pushCommits, getLabelBranch };
}

describe("EditableBranch", () => {
  it("starts with the Open Editor dummy as the sole savepoint", () => {
    const { branch } = makeBranch();

    const history = branch.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].name).toBe("Open Editor");
    expect(history[0].status).toBe(HistoryItemStatus.SAVED);
    expect(history[0].isSavepoint).toBe(true);
    expect(history[0].isCurrent).toBe(true);
    expect(branch.hasUnsavedChanges).toBe(false);
    expect(branch.head.op_config).toEqual({
      op_name: "server-op",
      op_params: { source: "remote" },
    });
  });

  it("does not mutate history when applying an operation fails", async () => {
    const { branch } = makeBranch();
    await branch.apply(new RecordingOperation("First"));
    await branch.apply(new RecordingOperation("Undone"));
    await branch.rebase(branch.getHistory()[1].id);
    const before = branch.getHistory();

    const failure = new Error("local apply failed");
    const op = new RecordingOperation("Failing replacement");
    op.applyLocal = vi.fn(() => {
      throw failure;
    });

    await expect(branch.apply(op)).rejects.toBe(failure);
    expect(branch.getHistory()).toEqual(before);
    expect(branch.hasUnsavedChanges).toBe(true);
  });

  it("applies operations locally, records history entries, and emits change events", async () => {
    const { branch } = makeBranch();
    const events: string[] = [];
    branch.addEventListener("beforechange", () => events.push("beforechange"));
    branch.addEventListener("afterchange", () => events.push("afterchange"));

    const op = new RecordingOperation("Set Test Value", 42);
    await branch.apply(op);

    expect(op.applyCalls).toBe(1);
    expect(events).toEqual(["beforechange", "afterchange"]);

    const history = branch.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0].isSavepoint).toBe(true);
    expect(history[1].name).toBe("Set Test Value");
    expect(history[1].status).toBe(HistoryItemStatus.ACTIVE);
    expect(history[1].isSavepoint).toBe(false);
    expect(history[1].isCurrent).toBe(true);
    expect(history[1].details).toContain('"value": 42');
    expect(branch.hasUnsavedChanges).toBe(true);
  });

  it("rebases backwards and forwards through the active history (undo/redo)", async () => {
    const { branch } = makeBranch();
    const first = new RecordingOperation("First Edit");
    const second = new RecordingOperation("Second Edit");

    await branch.apply(first);
    await branch.apply(second);
    const historyBefore = branch.getHistory();
    expect(historyBefore).toHaveLength(3);
    const firstId = historyBefore[1].id;
    const secondId = historyBefore[2].id;

    // Undo: rebase onto the first edit undoes the second.
    await branch.rebase(firstId);
    expect(second.undoCalls).toBe(1);
    expect(first.undoCalls).toBe(0);

    const historyUndone = branch.getHistory();
    expect(historyUndone[1].status).toBe(HistoryItemStatus.ACTIVE);
    expect(historyUndone[1].isCurrent).toBe(true);
    expect(historyUndone[2].status).toBe(HistoryItemStatus.INACTIVE);
    expect(historyUndone[2].isCurrent).toBe(false);
    expect(branch.hasUnsavedChanges).toBe(true);

    // Redo: rebase onto the second edit reapplies it.
    await branch.rebase(secondId);
    expect(second.applyCalls).toBe(2);

    const historyRedone = branch.getHistory();
    expect(historyRedone[2].status).toBe(HistoryItemStatus.ACTIVE);
    expect(historyRedone[2].isCurrent).toBe(true);
  });

  it("discards undone commits when a new operation is applied", async () => {
    const { branch } = makeBranch();
    const first = new RecordingOperation("First Edit");
    const undone = new RecordingOperation("Undone Edit");
    const third = new RecordingOperation("Third Edit");

    await branch.apply(first);
    await branch.apply(undone);
    await branch.rebase(branch.getHistory()[1].id);
    await branch.apply(third);

    const history = branch.getHistory();
    expect(history.map((item) => item.name)).toEqual([
      "Open Editor",
      "First Edit",
      "Third Edit",
    ]);

    // The discarded commit can no longer be rebased onto.
    await expect(branch.rebase(new CommitID())).rejects.toThrow();
  });

  it("marks active commits saved on push and forbids undoing them", async () => {
    const pushedState = makeBranchStateJson();
    pushedState.head.op_config = {
      op_name: "test-op",
      op_params: { value: 1 },
    };
    const pushCommits = vi.fn().mockResolvedValue({
      op_results: [],
      branch: LabelsetBranchState.fromJSON(pushedState),
    });
    const { branch } = makeBranch(pushCommits);
    const op = new RecordingOperation("Saved Edit");

    await branch.apply(op);
    await branch.pushActive(1);

    expect(pushCommits).toHaveBeenCalledOnce();
    const [taskId, branchId, data] = pushCommits.mock.calls[0] as [
      number,
      number,
      PushCommitsData,
    ];
    expect(taskId).toBe(1);
    expect(branchId).toBe(1);
    expect(data.last_fetched_head_hash).toBe("head-hash");
    expect(data.commits.map((commit) => commit.op_name)).toEqual(["test-op"]);

    const history = branch.getHistory();
    expect(history[1].status).toBe(HistoryItemStatus.SAVED);
    expect(history[1].isSavepoint).toBe(true);
    expect(branch.hasUnsavedChanges).toBe(false);
    expect(branch.head.op_config.op_name).toBe("test-op");
    expect(branch.head.op_config.op_params).toEqual({ value: 1 });

    // The dummy commit is now below the savepoint, so undoing to it fails.
    await expect(branch.rebase(history[0].id)).rejects.toThrow(/saved/i);
  });

  it("keeps rejected saves dirty and retries the same commits against the same head", async () => {
    const conflict = new Error("409: branch head changed");
    const pushCommits = vi
      .fn()
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({
        op_results: [],
        branch: LabelsetBranchState.fromJSON(makeBranchStateJson()),
      });
    const { branch } = makeBranch(pushCommits);
    const op = new RecordingOperation("Retryable Edit", 7);

    await branch.apply(op);
    const historyBefore = branch.getHistory();

    await expect(branch.pushActive(1)).rejects.toBe(conflict);

    expect(branch.hasUnsavedChanges).toBe(true);
    expect(branch.getHistory()).toEqual(historyBefore);
    expect(branch.getHistory()[1].status).toBe(HistoryItemStatus.ACTIVE);
    expect(op.applyCalls).toBe(1);

    await branch.pushActive(1);

    expect(pushCommits).toHaveBeenCalledTimes(2);
    const first = pushCommits.mock.calls[0][2] as PushCommitsData;
    const retry = pushCommits.mock.calls[1][2] as PushCommitsData;
    expect(retry.last_fetched_head_hash).toBe(first.last_fetched_head_hash);
    expect(retry.commits).toEqual(first.commits);
    expect(branch.hasUnsavedChanges).toBe(false);
    expect(branch.getHistory()[1].status).toBe(HistoryItemStatus.SAVED);
    expect(op.applyCalls).toBe(1);
  });

  it("adopts the head returned by the push instead of one read back afterwards", async () => {
    // The push response carries the branch the server committed. Reading the
    // branch again after the push would be a second, unlocked transaction:
    // another writer could move the head in between, and this branch would
    // adopt that head without adopting its changes - after which the staleness
    // check on every later save passes and the stale edits land.
    const committed = makeBranchStateJson();
    committed.head.hash_ = "committed-by-this-push";
    committed.head.op_config = { op_name: "test-op", op_params: { value: 1 } };
    const pushCommits = vi.fn().mockResolvedValue({
      op_results: [],
      branch: LabelsetBranchState.fromJSON(committed),
    });
    const { branch, getLabelBranch } = makeBranch(pushCommits);

    await branch.apply(new RecordingOperation("First Edit"));
    await branch.pushActive(1);

    expect(branch.head.hash_).toBe("committed-by-this-push");
    expect(getLabelBranch).not.toHaveBeenCalled();

    // The next save compares against the head this push committed, not the one
    // the branch was opened on.
    await branch.apply(new RecordingOperation("Second Edit", 2));
    await branch.pushActive(1);

    const retry = pushCommits.mock.calls[1][2] as PushCommitsData;
    expect(retry.last_fetched_head_hash).toBe("committed-by-this-push");
    expect(getLabelBranch).not.toHaveBeenCalled();
  });

  it("rejects and stays retryable when the response is lost after the commit", async () => {
    // The transport can fail after the server committed - the connection drops
    // or the payload no longer parses. Nothing is adopted in that case, so the
    // rejection must reach the caller (which is where the user is told the save
    // failed) instead of being papered over by a read of the branch.
    const lost = new Error("Failed to fetch");
    const pushCommits = vi.fn().mockRejectedValue(lost);
    const { branch, getLabelBranch } = makeBranch(pushCommits);

    const result = new Placeholder<string>();
    const op = new (class implements Operation<{ value: number }, string> {
      get displayName(): string {
        return "Create Thing";
      }
      get opName(): string {
        return "thing-create";
      }
      get opParams(): { value: number } {
        return { value: 1 };
      }
      get opResult(): Placeholder<string> {
        return result;
      }
      applyLocal(): void {}
      undoLocal(): void {}
    })();

    await branch.apply(op);
    const historyBefore = branch.getHistory();

    await expect(branch.pushActive(1)).rejects.toBe(lost);

    expect(getLabelBranch).not.toHaveBeenCalled();
    expect(branch.head.hash_).toBe("head-hash");
    expect(branch.getHistory()).toEqual(historyBefore);
    expect(branch.hasUnsavedChanges).toBe(true);
    // The op result the client never received is not filled in.
    expect(result.isResolved).toBe(false);
  });

  it("maps placeholder keys onto the wire and resolves op results on push", async () => {
    const pushCommits = vi.fn().mockResolvedValue({
      op_results: [{ new_id: "resolved-id" }],
      branch: LabelsetBranchState.fromJSON(makeBranchStateJson()),
    });
    const { branch } = makeBranch(pushCommits);

    // Creation ops resolve their backend-assigned result through a placeholder.
    const result = new Placeholder<{ new_id: string }>();
    const op = new (class implements Operation<
      { name: string },
      { new_id: string }
    > {
      get displayName(): string {
        return "Create Thing";
      }
      get opName(): string {
        return "thing-create";
      }
      get opParams(): { name: string } {
        return { name: "thing" };
      }
      get opResult(): Placeholder<{ new_id: string }> {
        return result;
      }
      applyLocal(): void {}
      undoLocal(): void {}
    })();

    await branch.apply(op);
    await branch.pushActive(1);

    await expect(result.getAsync()).resolves.toEqual({
      new_id: "resolved-id",
    });

    const data = pushCommits.mock.calls[0][2] as PushCommitsData;
    expect(data.placeholder_keys).toHaveLength(1);
    expect(data.commits[0].result_placeholder_key).toBe(
      data.placeholder_keys[0],
    );
    // The placeholder itself never travels over the wire.
    expect(JSON.stringify(data.commits[0].op_params)).not.toContain(
      "placeholder",
    );
  });

  describe("save races", () => {
    function deferred<T>() {
      let resolve!: (value: T) => void;
      let reject!: (error: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    }

    function pushResult() {
      return {
        op_results: [] as unknown[],
        branch: LabelsetBranchState.fromJSON(makeBranchStateJson()),
      };
    }

    it("treats a save with no unsaved commits as a no-op", async () => {
      const { branch, pushCommits } = makeBranch();

      await branch.pushActive(1);

      expect(pushCommits).not.toHaveBeenCalled();
      expect(branch.hasUnsavedChanges).toBe(false);
    });

    it("coalesces a second save queued during an in-flight save into one request", async () => {
      const pending = deferred<ReturnType<typeof pushResult>>();
      const pushCommits = vi.fn().mockReturnValue(pending.promise);
      const { branch } = makeBranch(pushCommits);
      await branch.apply(new RecordingOperation("Edit"));

      // Two saves dispatched before the first request settles.
      const firstSave = branch.pushActive(1);
      const secondSave = branch.pushActive(1);

      // The queue reports the in-flight work synchronously.
      expect(branch.isUpdating).toBe(true);

      await vi.waitFor(() => expect(pushCommits).toHaveBeenCalledTimes(1));
      pending.resolve(pushResult());
      await Promise.all([firstSave, secondSave]);

      // Exactly one request, one transition of the history to saved.
      expect(pushCommits).toHaveBeenCalledTimes(1);
      expect(branch.isUpdating).toBe(false);
      expect(branch.hasUnsavedChanges).toBe(false);

      const history = branch.getHistory();
      expect(history[1].status).toBe(HistoryItemStatus.SAVED);
      expect(history[1].isSavepoint).toBe(true);
      expect(
        history.filter((item) => item.status === HistoryItemStatus.SAVED),
      ).toHaveLength(2);
    });

    it("applies an edit queued during a save after the save settles, as new dirty history", async () => {
      const pending = deferred<ReturnType<typeof pushResult>>();
      const pushCommits = vi.fn().mockReturnValue(pending.promise);
      const { branch } = makeBranch(pushCommits);
      const savedEdit = new RecordingOperation("Saved Edit", 1);
      const lateEdit = new RecordingOperation("Late Edit", 2);

      await branch.apply(savedEdit);
      const saving = branch.pushActive(1);
      const applying = branch.apply(lateEdit);

      await vi.waitFor(() => expect(pushCommits).toHaveBeenCalledTimes(1));
      // The late edit is serialized behind the save: not applied locally,
      // and not part of the in-flight push.
      expect(lateEdit.applyCalls).toBe(0);
      const data = pushCommits.mock.calls[0][2] as PushCommitsData;
      expect(
        data.commits.map(
          (commit) => (commit.op_params as { value: number }).value,
        ),
      ).toEqual([1]);

      pending.resolve(pushResult());
      await Promise.all([saving, applying]);

      expect(lateEdit.applyCalls).toBe(1);
      expect(pushCommits).toHaveBeenCalledTimes(1);
      expect(
        branch.getHistory().map((item) => [item.name, item.status]),
      ).toEqual([
        ["Open Editor", HistoryItemStatus.SAVED],
        ["Saved Edit", HistoryItemStatus.SAVED],
        ["Late Edit", HistoryItemStatus.ACTIVE],
      ]);
      expect(branch.hasUnsavedChanges).toBe(true);
    });

    it("rejects a rebase queued during a save that would cross the new savepoint", async () => {
      const pending = deferred<ReturnType<typeof pushResult>>();
      const pushCommits = vi.fn().mockReturnValue(pending.promise);
      const { branch } = makeBranch(pushCommits);
      const first = new RecordingOperation("First Edit");
      const second = new RecordingOperation("Second Edit");

      await branch.apply(first);
      await branch.apply(second);
      const firstId = branch.getHistory()[1].id;

      const saving = branch.pushActive(1);
      // An undo of the second edit, queued while the save is in flight;
      // once the save settles, the target lies below the new savepoint.
      const undoing = branch.rebase(firstId);

      await vi.waitFor(() => expect(pushCommits).toHaveBeenCalledTimes(1));
      pending.resolve(pushResult());
      await saving;
      await expect(undoing).rejects.toThrow(/saved/i);

      // The rejection corrupted nothing.
      expect(second.undoCalls).toBe(0);
      const history = branch.getHistory();
      expect(
        history.every((item) => item.status === HistoryItemStatus.SAVED),
      ).toBe(true);
      expect(history[2].isCurrent).toBe(true);
      expect(branch.hasUnsavedChanges).toBe(false);
    });

    it("runs queued edits in order after a rejected save, and one retry pushes all of them", async () => {
      const conflict = new Error("409: branch head changed");
      const firstAttempt = deferred<ReturnType<typeof pushResult>>();
      const retryAttempt = deferred<ReturnType<typeof pushResult>>();
      const pushCommits = vi
        .fn()
        .mockReturnValueOnce(firstAttempt.promise)
        .mockReturnValueOnce(retryAttempt.promise);
      const { branch } = makeBranch(pushCommits);

      await branch.apply(new RecordingOperation("Edit", 1));
      const saving = branch.pushActive(1);
      const applying = branch.apply(new RecordingOperation("Edit", 2));

      await vi.waitFor(() => expect(pushCommits).toHaveBeenCalledTimes(1));
      firstAttempt.reject(conflict);
      await expect(saving).rejects.toBe(conflict);
      await applying;

      // The branch stayed dirty through the failure; the queued edit landed.
      expect(branch.hasUnsavedChanges).toBe(true);
      expect(
        branch
          .getHistory()
          .filter((item) => item.status === HistoryItemStatus.ACTIVE),
      ).toHaveLength(2);

      // Exactly one retry, carrying both commits against the same head.
      const retry = branch.pushActive(1);
      await vi.waitFor(() => expect(pushCommits).toHaveBeenCalledTimes(2));
      const firstData = pushCommits.mock.calls[0][2] as PushCommitsData;
      const retryData = pushCommits.mock.calls[1][2] as PushCommitsData;
      expect(retryData.last_fetched_head_hash).toBe(
        firstData.last_fetched_head_hash,
      );
      expect(
        retryData.commits.map(
          (commit) => (commit.op_params as { value: number }).value,
        ),
      ).toEqual([1, 2]);

      retryAttempt.resolve(pushResult());
      await retry;
      expect(branch.hasUnsavedChanges).toBe(false);
    });
  });

  it("keys nested placeholders inside op params onto the wire", async () => {
    const pushCommits = vi.fn().mockResolvedValue({
      op_results: [{}, { new_id: "child-id" }],
      branch: LabelsetBranchState.fromJSON(makeBranchStateJson()),
    });
    const { branch } = makeBranch(pushCommits);

    const parentResult = new Placeholder<{}>();
    const childId = new Placeholder<string>();
    const op = new (class implements Operation<Record<string, unknown>, {}> {
      get displayName(): string {
        return "Create Parent With Child";
      }
      get opName(): string {
        return "parent-create";
      }
      get opParams(): Record<string, unknown> {
        return {
          parent: parentResult,
          child: { id: childId },
          plain: "value",
        };
      }
      get opResult(): null {
        return null;
      }
      applyLocal(): void {}
      undoLocal(): void {}
    })();

    await branch.apply(op);
    expect(branch.getHistory()[1].details).toContain(parentResult.wireKey);
    expect(branch.getHistory()[1].details).toContain(childId.wireKey);
    await branch.pushActive(1);

    const data = pushCommits.mock.calls[0][2] as PushCommitsData;
    expect(data.placeholder_keys).toHaveLength(2);
    const serialized = JSON.parse(
      JSON.stringify(data.commits[0].op_params),
    ) as Record<string, any>;
    expect(serialized.plain).toBe("value");
    expect(data.placeholder_keys).toContain(serialized.parent);
    expect(data.placeholder_keys).toContain(serialized.child.id);
    expect(serialized.parent).toBe(parentResult.wireKey);
    expect(serialized.child.id).toBe(childId.wireKey);
  });
});
