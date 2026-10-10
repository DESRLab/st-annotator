import { afterEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  bulkUpdateTasks: vi.fn(),
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  listAccounts: vi.fn(),
  listBranches: vi.fn(),
  listCommits: vi.fn(),
  listFrameIds: vi.fn(),
  listFrames: vi.fn(),
  listLabelGroups: vi.fn(),
  listRecentFrames: vi.fn(),
  listTaskLabelBranches: vi.fn(),
  listTasks: vi.fn(),
  listTaskSourceGroups: vi.fn(),
  listSourceGroups: vi.fn(),
  listUsers: vi.fn(),
  readAccount: vi.fn(),
  readCommit: vi.fn(),
  readGroup: vi.fn(),
  readGraph: vi.fn(),
  readProject: vi.fn(),
  readTask: vi.fn(),
  updateTask: vi.fn(),
}));

vi.mock("../../../client/sdk.gen", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../client/sdk.gen")>()),
  bulkUpdateTasksTasksBulkPatch: sdk.bulkUpdateTasks,
  createTaskTasksPost: sdk.createTask,
  deleteTaskTasksIdDelete: sdk.deleteTask,
  listAccountsAccountsGet: sdk.listAccounts,
  listBranchesLabelRepoBranchesGet: sdk.listBranches,
  listCommitsLabelRepoCommitsGet: sdk.listCommits,
  listFrameIdsFramesIdsGet: sdk.listFrameIds,
  listFramesFramesGet: sdk.listFrames,
  listGroupsLabelGroupsGet: sdk.listLabelGroups,
  listRecentFramesFramesRecentGet: sdk.listRecentFrames,
  listTaskLabelBranchesEditorTaskLabelBranchesGet: sdk.listTaskLabelBranches,
  listTasksTasksGet: sdk.listTasks,
  listTaskSourceGroupsEditorTaskSourceGroupsGet: sdk.listTaskSourceGroups,
  listGroupsSourceGroupsGet: sdk.listSourceGroups,
  listUsersRolesUsersRolesGet: sdk.listUsers,
  readAccountAccountsIdGet: sdk.readAccount,
  readCommitLabelRepoCommitsGroupIdCommitHashGet: sdk.readCommit,
  readGroupLabelGroupsIdGet: sdk.readGroup,
  readLabelsetGraphEditorLabelsetGraphGet: sdk.readGraph,
  readProjectProjectsIdGet: sdk.readProject,
  readTaskTasksIdGet: sdk.readTask,
  updateTaskTasksIdPatch: sdk.updateTask,
}));
vi.mock("../../../client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../client")>()),
  listAccountsAccountsGet: sdk.listAccounts,
  listFrameIdsFramesIdsGet: sdk.listFrameIds,
  listFramesFramesGet: sdk.listFrames,
  readAccountAccountsIdGet: sdk.readAccount,
}));

import { loader as branchesLoader } from "../../../app/routes/label/repo/branches";
import { loader as commitsLoader } from "../../../app/routes/label/repo/commits";
import { loader as framesLoader } from "../../../app/routes/project/task/frames";
import { loader as recentLoader } from "../../../app/routes/project/task/recent";
import {
  action as tasksAction,
  loader as tasksLoader,
} from "../../../app/routes/project/tasks";
import { commitSession, getSession } from "../../../app/sessions";

async function authCookie(includeUser = true) {
  const session = await getSession();
  session.set("token", { access_token: "access", token_type: "bearer" });
  if (includeUser)
    session.set("user", { id: 4, username: "alex", roles: ["annotator"] });
  return commitSession(session);
}

async function request(url: string, fields?: Record<string, string>) {
  return new Request(url, {
    method: fields ? "POST" : "GET",
    headers: {
      Cookie: await authCookie(),
      ...(fields
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
    },
    body: fields ? new URLSearchParams(fields) : undefined,
  });
}

const project = { id: 3, name: "demo", members: [{ id: 4 }] };
const task = { id: 8, project_id: 3, name: "annotate" };

afterEach(() => vi.clearAllMocks());

describe("project tasks route", () => {
  it("rejects malformed project IDs without making an upstream request", async () => {
    for (const projectId of ["3junk", "0", "9007199254740992"]) {
      const response = (await tasksLoader({
        request: await request(`http://localhost/projects/${projectId}/tasks`),
        params: { projectId },
      } as any)) as Response;
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/");
    }
    expect(sdk.readProject).not.toHaveBeenCalled();
  });

  it("rejects a malformed project ID in task actions before mutation", async () => {
    const response = (await tasksAction({
      request: await request("http://localhost/projects/3junk/tasks", {
        _action: "create",
      }),
      params: { projectId: "3junk" },
    } as any)) as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/");
    expect(sdk.readProject).not.toHaveBeenCalled();
    expect(sdk.createTask).not.toHaveBeenCalled();
  });

  it("returns an empty task page and preserves bearer authentication", async () => {
    sdk.readProject.mockResolvedValue({ data: project });
    sdk.listTasks.mockResolvedValue({ data: [] });
    sdk.listUsers.mockResolvedValue({
      data: [{ id: 4, username: "alex" }],
    });

    const result = (await tasksLoader({
      request: await request("http://localhost/projects/3/tasks"),
      params: { projectId: "3" },
    } as any)) as any;

    expect(result.dataset).toEqual([]);
    expect(result.membersById.get(4)).toMatchObject({ username: "alex" });
    expect(sdk.listTasks).toHaveBeenCalledWith({
      auth: "access",
      query: { project_id: 3 },
    });
    expect(result.loaderError).toBeUndefined();
  });

  it("validates and performs task mutations while surfacing upstream errors", async () => {
    sdk.readProject.mockResolvedValue({ data: project });
    const baseFields = {
      description: "",
      supervisor_ids: "[]",
      annotator_ids: "[]",
      deadline: "",
    };

    const invalid = await tasksAction({
      request: await request("http://localhost/projects/3/tasks", {
        _action: "create",
        name: "",
        ...baseFields,
      }),
      params: { projectId: "3" },
    } as any);
    expect(invalid).toEqual({ error: "Task name is required" });
    expect(sdk.createTask).not.toHaveBeenCalled();

    sdk.createTask.mockResolvedValue({ error: { detail: "duplicate task" } });
    const failed = await tasksAction({
      request: await request("http://localhost/projects/3/tasks", {
        _action: "create",
        name: "task_one",
        ...baseFields,
      }),
      params: { projectId: "3" },
    } as any);
    expect(failed).toEqual({ error: "duplicate task" });
    expect(sdk.createTask).toHaveBeenCalledWith({
      auth: "access",
      body: {
        project_id: 3,
        name: "task_one",
        description: "",
        supervisor_ids: [],
        annotator_ids: [],
        deadline: null,
        parent_id: null,
      },
    });
  });
});

describe("recent task frames route", () => {
  it("redirects missing or malformed route IDs before loading project data", async () => {
    for (const [params, location] of [
      [{ projectId: undefined, taskId: undefined }, "/projects"],
      [{ projectId: "3junk", taskId: "8" }, "/projects"],
      [{ projectId: "0", taskId: "8" }, "/projects"],
      [{ projectId: "9007199254740992", taskId: "8" }, "/projects"],
      [{ projectId: "3", taskId: "8junk" }, "/projects/3/tasks"],
      [{ projectId: "3", taskId: "0" }, "/projects/3/tasks"],
      [{ projectId: "3", taskId: "9007199254740992" }, "/projects/3/tasks"],
    ]) {
      const response = (await recentLoader({
        request: await request("http://localhost/projects/recent"),
        params,
      } as any)) as Response;
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe(location);
    }
    expect(sdk.readProject).not.toHaveBeenCalled();
  });

  it("preserves pagination and supported filters while enforcing current-user recent semantics", async () => {
    sdk.readProject.mockResolvedValue({ data: project });
    sdk.readTask.mockResolvedValue({ data: task });
    sdk.listRecentFrames.mockResolvedValue({
      data: [],
      response: new Response(null, {
        headers: { "Content-Range": "items 25-25/42" },
      }),
    });
    sdk.listTaskSourceGroups.mockResolvedValue({ data: [] });
    sdk.listTaskLabelBranches.mockResolvedValue({
      error: "branches unavailable",
    });
    const filters = JSON.stringify([
      { columnId: "id", operator: "GE", searchTerms: [5] },
      { columnId: "account_id", operator: "IN", searchTerms: [99] },
    ]);

    const result = (await recentLoader({
      request: await request(
        `http://localhost/projects/3/tasks/8/recent?page=2&pageSize=25&filters=${encodeURIComponent(filters)}&sort=last_viewed_at:desc`,
      ),
      params: { projectId: "3", taskId: "8", workType: "review" },
    } as any)) as any;

    expect(result).toMatchObject({
      dataset: [],
      sourceGroups: [],
      labelBranches: [],
      loaderError: "branches unavailable",
      workType: "review",
      pagination: { pageNumber: 2, pageSize: 25, totalItems: 42 },
    });
    expect(sdk.listRecentFrames).toHaveBeenCalledWith({
      auth: "access",
      query: {
        id_ge: 5,
        sort_by: "last_viewed_at",
        sort_dir: "desc",
        offset: 25,
        limit: 25,
        task_id: 8,
        work_type: "review",
      },
    });
  });
});

describe("repository commits route", () => {
  it("rejects malformed group IDs without loading a repository", async () => {
    for (const groupId of ["7junk", "0", "9007199254740992"]) {
      const response = (await commitsLoader({
        request: await request(
          `http://localhost/label/repos/${groupId}/commits`,
        ),
        params: { groupId },
      } as any)) as Response;
      expect(response.headers.get("Location")).toBe("/label/repos");
    }
    expect(sdk.readGroup).not.toHaveBeenCalled();
  });

  it("supports an empty repository and reports branch-list failures", async () => {
    sdk.readGroup.mockResolvedValue({ data: { id: 7, name: "labels" } });
    sdk.listBranches.mockResolvedValue({ error: "branches unavailable" });

    const result = (await commitsLoader({
      request: await request("http://localhost/label/repos/7/commits"),
      params: { groupId: "7" },
    } as any)) as any;

    expect(result.branches).toEqual([]);
    expect(result.commits).toEqual([]);
    expect(result.mergedGraph.nodes).toEqual([]);
    expect(result.loaderError).toBe("branches unavailable");
    expect(sdk.readGraph).not.toHaveBeenCalled();
  });

  it("merges branch graphs and aggregates graph and commit errors", async () => {
    sdk.readGroup.mockResolvedValue({ data: { id: 7, name: "labels" } });
    sdk.listBranches.mockResolvedValue({
      data: [
        {
          id: 11,
          name: "main",
          head_hash: "aaa",
          head: { hash: "aaa", message: "first" },
          checkpoint: null,
        },
        {
          id: 12,
          name: "review",
          head_hash: "bbb",
          head: { hash: "bbb", message: "second" },
          checkpoint: null,
        },
      ],
    });
    sdk.readGraph
      .mockResolvedValueOnce({
        data: { nodes: [{ hash: "aaa" }], edges: [] },
      })
      .mockResolvedValueOnce({
        data: { nodes: [{ hash: "bbb" }], edges: [] },
        error: "graph failed",
      });
    sdk.listCommits.mockResolvedValue({
      data: [{ hash: "aaa", message: "first" }],
      error: "commit list failed",
    });

    const result = (await commitsLoader({
      request: await request("http://localhost/label/repos/7/commits"),
      params: { groupId: "7" },
    } as any)) as any;

    expect(result.mergedGraph.nodes.map((node: any) => node.hash)).toEqual([
      "aaa",
      "bbb",
    ]);
    expect(result.commits).toEqual(
      expect.arrayContaining([expect.objectContaining({ hash: "aaa" })]),
    );
    expect(result.loaderError).toContain(
      "Failed to load graph for branch review",
    );
    expect(result.loaderError).toContain("commit list failed");
    expect(sdk.listCommits).toHaveBeenCalledWith({
      auth: "access",
      query: { group_id: 7, offset: 0, limit: 500 },
    });
  });
});

async function requestWithUser(
  url: string,
  user: { id: number; username: string; roles: string[] },
) {
  const session = await getSession();
  session.set("token", { access_token: "access", token_type: "bearer" });
  session.set("user", user);

  return new Request(url, {
    headers: { Cookie: await commitSession(session) },
  });
}

// Reading the account collection is an administrator-only operation, so the
// contract is role-conditional: a non-administrator route must never issue that
// request and must source its account picker from data that role may already
// load, while an administrator keeps the full collection so a user holding no
// grant anywhere yet can still be granted one.
describe("account-collection access boundaries", () => {
  it("sources the frames account picker from the task's own accounts", async () => {
    // The shape `TaskPublic.annotators` actually arrives in: the non-owner
    // projection, which carries no `preferences` field to render or to leak.
    const annotators = [
      { id: 4, username: "alex" },
      { id: 9, username: "bruce" },
    ];
    sdk.readProject.mockResolvedValue({
      data: { id: 3, name: "demo", members: [{ id: 4 }] },
    });
    sdk.readTask.mockResolvedValue({
      data: {
        id: 8,
        project_id: 3,
        name: "annotate",
        annotators,
        supervisors: [{ id: 10, username: "carol" }],
      },
    });
    sdk.listFrames.mockResolvedValue({ data: [] });
    sdk.listFrameIds.mockResolvedValue({ data: [] });
    sdk.listTaskSourceGroups.mockResolvedValue({ data: [] });
    sdk.listTaskLabelBranches.mockResolvedValue({ data: [] });
    sdk.listSourceGroups.mockResolvedValue({ data: [] });
    sdk.listLabelGroups.mockResolvedValue({ data: [] });
    sdk.listBranches.mockResolvedValue({ data: [] });

    const result = (await framesLoader({
      request: await requestWithUser(
        "http://localhost/projects/3/tasks/8/frames/annotate",
        { id: 4, username: "alex", roles: ["project-manager"] },
      ),
      params: { projectId: "3", taskId: "8", workType: "annotate" },
    } as any)) as any;

    expect(result.accounts).toEqual(annotators);
    expect(result.loaderError).toBeUndefined();
    expect(sdk.listAccounts).not.toHaveBeenCalled();
  });

  it("resolves a non-administrator's branch grantees through individual account reads", async () => {
    sdk.readGroup.mockResolvedValue({ data: { id: 7, name: "labels" } });
    sdk.listBranches.mockResolvedValue({
      data: [
        {
          id: 11,
          name: "main",
          head_hash: "aaa",
          checkpoint_hash: null,
          perm_lv_by_user_id: { "9": 2 },
        },
      ],
    });
    // Individual account reads return the non-owner projection, so a grantee
    // resolved this way arrives with nothing but the id and the username the
    // permissions list renders.
    sdk.readAccount.mockImplementation(({ path }: { path: { id: number } }) =>
      Promise.resolve({
        data: { id: path.id, username: `user-${path.id}` },
      }),
    );

    const result = (await branchesLoader({
      request: await requestWithUser(
        "http://localhost/label/repos/7/branches",
        { id: 4, username: "alex", roles: ["data-manager"] },
      ),
      params: { groupId: "7" },
    } as any)) as any;

    expect(result.accounts.map((account: any) => account.id).sort()).toEqual([
      4, 9,
    ]);
    for (const account of result.accounts) {
      expect(Object.keys(account).sort()).toEqual(["id", "username"]);
    }
    expect(sdk.readAccount).toHaveBeenCalledWith({
      auth: "access",
      path: { id: 4 },
    });
    expect(sdk.listAccounts).not.toHaveBeenCalled();
  });

  it("keeps the full account collection available to an administrator", async () => {
    sdk.readGroup.mockResolvedValue({ data: { id: 7, name: "labels" } });
    sdk.listBranches.mockResolvedValue({
      data: [
        {
          id: 11,
          name: "main",
          head_hash: "aaa",
          checkpoint_hash: null,
          perm_lv_by_user_id: { "9": 2 },
        },
      ],
    });
    sdk.listAccounts.mockResolvedValue({
      data: [
        { id: 4, username: "alex", preferences: null },
        { id: 9, username: "bruce", preferences: null },
        { id: 12, username: "dana", preferences: null },
      ],
    });

    const result = (await branchesLoader({
      request: await requestWithUser(
        "http://localhost/label/repos/7/branches",
        { id: 4, username: "alex", roles: ["admin"] },
      ),
      params: { groupId: "7" },
    } as any)) as any;

    expect(sdk.listAccounts).toHaveBeenCalledWith({ auth: "access" });
    // dana holds no grant on any branch yet, which is exactly what a first
    // grant looks like, and remains the only way to grant them.
    expect(result.accounts.map((account: any) => account.id)).toEqual([
      4, 9, 12,
    ]);
    expect(sdk.readAccount).not.toHaveBeenCalled();
  });
});
