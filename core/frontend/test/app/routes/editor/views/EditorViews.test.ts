/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FrameState } from "../../../../../app/routes/editor/models";
import {
  EditorViews,
  normalizeEditorProjectId,
  parseEditorProjectIdFromPathname,
} from "../../../../../app/routes/editor/views/EditorViews";

const sdk = vi.hoisted(() => ({
  listTaskFrames: vi.fn(),
  pushLabelsetCommits: vi.fn(),
  readLabelsetBranch: vi.fn(),
  listSelections: vi.fn(),
  updateFrameIsComplete: vi.fn(),
  touchFrameLastViewedAt: vi.fn(),
}));

// `EditorViews` reaches the generated client through the `sta/client` alias, so
// the mock has to use the same specifier to intercept it.
vi.mock("sta/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../../client")>()),
  listTaskFramesEditorTaskFramesGet: sdk.listTaskFrames,
  pushLabelsetCommitsEditorLabelsetPushPost: sdk.pushLabelsetCommits,
  readLabelsetBranchEditorLabelsetBranchGet: sdk.readLabelsetBranch,
  listSelectionsLabelSpecObjclassSelectionsGet: sdk.listSelections,
  updateFrameIsCompleteEditorFrameIsCompletePost: sdk.updateFrameIsComplete,
  touchFrameLastViewedAtEditorFrameLastViewedAtPost: sdk.touchFrameLastViewedAt,
}));

function createFrame(
  id: number,
  taskId: number,
): Pick<FrameState, "id" | "task"> {
  return { id, task: { id: taskId } as unknown as FrameState["task"] };
}

describe("EditorViews project id handling", () => {
  it("normalizes only positive safe integer project ids", () => {
    expect(normalizeEditorProjectId(1)).toBe(1);
    expect(normalizeEditorProjectId("1")).toBe(1);
    expect(normalizeEditorProjectId("")).toBeNull();
    expect(normalizeEditorProjectId(undefined)).toBeNull();
    expect(normalizeEditorProjectId(1.5)).toBeNull();
    expect(normalizeEditorProjectId(0)).toBeNull();
  });

  it("parses project ids from editor pathnames", () => {
    expect(parseEditorProjectIdFromPathname("/projects/1/annotate")).toBe(1);
    expect(parseEditorProjectIdFromPathname("/projects/7/review")).toBe(7);
    expect(
      parseEditorProjectIdFromPathname(
        "http://localhost:5173/projects/9/annotate?task_id=1",
      ),
    ).toBe(9);
    expect(parseEditorProjectIdFromPathname("/app/projects/11/annotate")).toBe(
      11,
    );
    expect(parseEditorProjectIdFromPathname("/projects/7/tasks")).toBeNull();
  });

  it("falls back to the editor URL when options projectId is blank", () => {
    const views = new EditorViews({
      apiBaseUrl: "/editor",
      editorUrl: "/projects/1/annotate",
      // @ts-expect-error intentionally passing string to test fallback
      projectId: "",
    });

    expect(views.projectId).toBe(1);
  });
});

describe("EditorViews.syncEditorUrl", () => {
  const views = new EditorViews({
    apiBaseUrl: "/editor",
    editorUrl: "/projects/1/annotate",
    projectId: 1,
  });

  beforeEach(() => {
    window.history.replaceState(
      null,
      "",
      "/projects/1/annotate?task_id=2&frame_id=3",
    );
  });

  it("deep-links the given frame without navigating or adding history entries", () => {
    const historyLength = window.history.length;
    const routerState = { key: "router-entry" };
    window.history.replaceState(routerState, "", window.location.href);

    views.syncEditorUrl(createFrame(7, 4));

    expect(window.location.pathname).toBe("/projects/1/annotate");
    expect(new URL(window.location.href).searchParams.get("task_id")).toBe("4");
    expect(new URL(window.location.href).searchParams.get("frame_id")).toBe(
      "7",
    );
    expect(window.history.length).toBe(historyLength);
    expect(window.history.state).toEqual(routerState);
  });

  it("preserves unrelated query parameters and the review pathname", () => {
    window.history.replaceState(
      null,
      "",
      "/projects/1/review?task_id=2&frame_id=3&group_id=5",
    );

    views.syncEditorUrl(createFrame(8, 6));

    const url = new URL(window.location.href);
    expect(url.pathname).toBe("/projects/1/review");
    expect(url.searchParams.get("group_id")).toBe("5");
    expect(url.searchParams.get("task_id")).toBe("6");
    expect(url.searchParams.get("frame_id")).toBe("8");
  });

  it("drops the frame id when no frame is displayed", () => {
    views.syncEditorUrl(null);

    const searchParams = new URL(window.location.href).searchParams;
    expect(searchParams.get("frame_id")).toBeNull();
    expect(searchParams.get("task_id")).toBe("2");
  });

  it("leaves the URL untouched when it already deep-links the frame", () => {
    const spy = vi.spyOn(window.history, "replaceState");

    views.syncEditorUrl(createFrame(3, 2));

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("EditorViews label-data loading", () => {
  beforeEach(() => {
    sdk.listTaskFrames.mockReset();
    sdk.updateFrameIsComplete.mockReset();
    sdk.touchFrameLastViewedAt.mockReset();
  });

  it("shares concurrent frame-list requests for the same scene selection", async () => {
    let release!: (value: { data: unknown[] }) => void;
    sdk.listTaskFrames.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const views = new EditorViews({ projectId: 1 });

    const first = views.getFrames(1, 2, 3);
    const second = views.getFrames(1, 2, 3);

    expect(sdk.listTaskFrames).toHaveBeenCalledOnce();
    release({ data: [] });
    await expect(Promise.all([first, second])).resolves.toEqual([[], []]);
  });

  it("keeps optimized frame models immutable", async () => {
    sdk.listTaskFrames.mockResolvedValue({
      data: [
        {
          id: 4,
          account_id: 5,
          source_group_id: 2,
          label_branch_id: 3,
          min_x: 0,
          min_y: 0,
          min_z: 0,
          max_x: 1,
          max_y: 1,
          max_z: 1,
          min_timestamp: null,
          max_timestamp: null,
          work_type: "annotate",
          last_viewed_at: null,
          is_complete: false,
        },
      ],
    });
    const views = new EditorViews({ projectId: 1 });

    const [frame] = await views.getFrames(1, 2, 3);

    expect(Object.isFrozen(frame)).toBe(true);
    expect(Object.isFrozen(frame.st_bounds)).toBe(true);
    expect(Object.isFrozen(frame.st_bounds.min_coords)).toBe(true);
  });

  it("does not share frame lists between scene selections", async () => {
    sdk.listTaskFrames.mockResolvedValue({ data: [] });
    const views = new EditorViews({ projectId: 1 });

    await Promise.all([views.getFrames(1, 2, 3), views.getFrames(1, 2, 4)]);

    expect(sdk.listTaskFrames).toHaveBeenCalledTimes(2);
  });

  it("reloads a cached frame list after either persisted frame mutation", async () => {
    sdk.listTaskFrames.mockResolvedValue({ data: [] });
    sdk.updateFrameIsComplete.mockResolvedValue({ data: null });
    sdk.touchFrameLastViewedAt.mockResolvedValue({ data: null });
    const views = new EditorViews({ projectId: 1 });

    await views.getFrames(1, 2, 3);
    await views.updateFrameIsComplete(4, true);
    await views.getFrames(1, 2, 3);
    await views.updateFrameLastViewedAt(4);
    await views.getFrames(1, 2, 3);

    expect(sdk.listTaskFrames).toHaveBeenCalledTimes(3);
  });

  it("retains cached frames when a mutation fails", async () => {
    sdk.listTaskFrames.mockResolvedValue({ data: [] });
    sdk.updateFrameIsComplete.mockRejectedValue(new Error("failed"));
    const views = new EditorViews({ projectId: 1 });
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await views.getFrames(1, 2, 3);
    await expect(views.updateFrameIsComplete(4, true)).rejects.toThrow(
      "failed",
    );
    await views.getFrames(1, 2, 3);

    expect(sdk.listTaskFrames).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });

  it("evicts a failed frame-list request so the next attempt retries", async () => {
    sdk.listTaskFrames
      .mockRejectedValueOnce(new Error("failed"))
      .mockResolvedValue({ data: [] });
    const views = new EditorViews({ projectId: 1 });
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await views.getFrames(1, 2, 3);
    await views.getFrames(1, 2, 3);

    expect(sdk.listTaskFrames).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });

  it("does not evict a newer request when an old request fails", async () => {
    let rejectOld!: (reason: Error) => void;
    sdk.listTaskFrames
      .mockReturnValueOnce(
        new Promise((_resolve, reject) => {
          rejectOld = reject;
        }),
      )
      .mockResolvedValue({ data: [] });
    sdk.updateFrameIsComplete.mockResolvedValue({ data: null });
    const views = new EditorViews({ projectId: 1 });
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const old = views.getFrames(1, 2, 3);
    await views.updateFrameIsComplete(4, true);
    const newer = views.getFrames(1, 2, 3);
    rejectOld(new Error("old request failed"));
    await Promise.all([old, newer]);
    await views.getFrames(1, 2, 3);

    expect(sdk.listTaskFrames).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });

  it("starts another waiting layer before filling every worker from one layer", async () => {
    const started: string[] = [];
    const releases: (() => void)[] = [];
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (request) => {
        started.push(
          new URL(String(request), window.location.origin).searchParams.get(
            "key",
          )!,
        );
        await new Promise<void>((resolve) => releases.push(resolve));
        return new Response();
      });
    const views = new EditorViews({ projectId: 1 });
    const requests = [
      ...Array.from({ length: 5 }, (_, id) =>
        views.bulkGetLabelData("primary", [id]),
      ),
      views.bulkGetLabelData("secondary", [9]),
    ];

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(started).toContain("secondary");
    releases.splice(0).forEach((release) => release());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    releases.splice(0).forEach((release) => release());
    await Promise.all(requests);
    fetchMock.mockRestore();
  });

  it("allows a bounded number of label requests to run concurrently", async () => {
    let active = 0;
    let peak = 0;
    const releases: (() => void)[] = [];
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise<void>((resolve) => releases.push(resolve));
        active -= 1;
        return new Response();
      });
    const views = new EditorViews({ projectId: 1 });

    const requests = Array.from({ length: 5 }, (_, id) =>
      views.bulkGetLabelData("labels", [id]),
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(peak).toBe(4);

    releases.splice(0).forEach((release) => release());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    releases.splice(0).forEach((release) => release());
    await Promise.all(requests);
    fetchMock.mockRestore();
  });
});

describe("EditorViews object-class selection", () => {
  beforeEach(() => sdk.listSelections.mockReset());

  it("shares one request for a label group", async () => {
    const selection = { id: 7, objclasses: [{ id: 9, color_rgb: 0xff0000 }] };
    sdk.listSelections.mockResolvedValue({ data: [selection] });
    const views = new EditorViews({ projectId: 1 });

    await expect(
      Promise.all([views.getClassSelection(3), views.getClassSelection(3)]),
    ).resolves.toEqual([
      {
        ...selection,
        objclasses: [{ ...selection.objclasses[0], color: "#ff0000" }],
      },
      {
        ...selection,
        objclasses: [{ ...selection.objclasses[0], color: "#ff0000" }],
      },
    ]);
    expect(sdk.listSelections).toHaveBeenCalledOnce();
    expect(sdk.listSelections).toHaveBeenCalledWith({
      query: { group_id: 3, limit: 1 },
    });
    await views.getClassSelection(4);
    expect(sdk.listSelections).toHaveBeenCalledTimes(2);
  });

  it("retries after a failed request", async () => {
    sdk.listSelections
      .mockResolvedValueOnce({ error: { detail: "missing" } })
      .mockResolvedValueOnce({ data: [{ id: 7, objclasses: [] }] });
    const views = new EditorViews({ projectId: 1 });

    await expect(views.getClassSelection(3)).rejects.toThrow("missing");
    await expect(views.getClassSelection(3)).resolves.toMatchObject({ id: 7 });
    expect(sdk.listSelections).toHaveBeenCalledTimes(2);
  });

  it("reports a group with no selection", async () => {
    sdk.listSelections.mockResolvedValue({ data: [] });
    const views = new EditorViews({ projectId: 1 });

    await expect(views.getClassSelection(3)).rejects.toThrow(
      "No object-class selection is configured for label group 3",
    );
  });
});

const COMMITTED_HASH = "a".repeat(40);

/**
 * The `LabelsetPushResult` body of the push endpoints: the results of the
 * pushed operations plus the branch as committed by that very push.
 */
function makePushResponseBody() {
  const group = { id: 1, name: "repo" };
  return {
    branch: {
      id: 3,
      group_id: 1,
      head_hash: COMMITTED_HASH,
      checkpoint_hash: null,
      last_edit_at: "2026-08-13T00:00:00+00:00",
      name: "main",
      group: group,
      head: {
        group_id: 1,
        hash: COMMITTED_HASH,
        operations: [],
        group: group,
      },
      checkpoint: null,
      perm_lv_by_user_id: {},
    },
    op_results: ["11111111-1111-4111-8111-111111111111", null],
  };
}

function makePushData(lastFetchedHeadHash: string) {
  return {
    last_fetched_head_hash: lastFetchedHeadHash,
    commits: [],
    placeholder_keys: [],
  };
}

describe("EditorViews.pushCommits", () => {
  beforeEach(() => vi.clearAllMocks());

  it("builds the result from the push response without reading the branch back", async () => {
    sdk.pushLabelsetCommits.mockResolvedValue({
      data: makePushResponseBody(),
    });
    const views = new EditorViews({ projectId: 1 });

    const result = await views.pushCommits(4, 3, makePushData("initial-hash"));

    expect(sdk.pushLabelsetCommits).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          label_branch_id: 3,
          last_fetched_head_hash: "initial-hash",
        }),
      }),
    );
    // A follow-up read of the branch would be a second transaction whose head
    // may belong to an interleaving writer, so the committed state must come
    // from the push response itself.
    expect(sdk.readLabelsetBranch).not.toHaveBeenCalled();
    expect(result.branch.head.hash_).toBe(COMMITTED_HASH);
    expect(result.branch.id).toBe(3);
    expect(result.op_results).toEqual([
      "11111111-1111-4111-8111-111111111111",
      null,
    ]);
  });

  it("reports a rejected push and never reads a branch state to adopt", async () => {
    const alert = vi.fn();
    vi.stubGlobal("alert", alert);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    sdk.pushLabelsetCommits.mockResolvedValue({
      error: { detail: "The branch changed after it was fetched." },
      response: new Response(null, { status: 409 }),
    });
    const views = new EditorViews({ projectId: 1 });

    await expect(
      views.pushCommits(4, 3, makePushData("stale-hash")),
    ).rejects.toThrow("The branch changed after it was fetched.");

    expect(sdk.readLabelsetBranch).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][0]).toContain("Failed to save changes.");
    error.mockRestore();
    vi.unstubAllGlobals();
  });
});
