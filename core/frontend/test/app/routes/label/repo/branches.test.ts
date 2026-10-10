import { afterEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  listBranches: vi.fn(),
  readAccount: vi.fn(),
  readGraph: vi.fn(),
  readGroup: vi.fn(),
}));

vi.mock("../../../../../client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../../client")>()),
  listAccountsAccountsGet: sdk.listAccounts,
  listBranchesLabelRepoBranchesGet: sdk.listBranches,
  readAccountAccountsIdGet: sdk.readAccount,
  readGroupLabelGroupsIdGet: sdk.readGroup,
  readLabelsetGraphEditorLabelsetGraphGet: sdk.readGraph,
}));

import {
  buildBranchesQuery,
  canWriteBranch,
  getBranchPermissionLevel,
  getEffectiveAccessLevel,
  action,
  loader,
} from "../../../../../app/routes/label/repo/branches";
import { commitSession, getSession } from "../../../../../app/sessions";
import type {
  BranchPermissionLevel,
  LabelsetBranchPublic as LabelBranch,
  Role,
  UserRoles as User,
} from "../../../../../client";

afterEach(() => vi.clearAllMocks());

async function authenticatedRequest(
  url: string,
  formData?: FormData,
  roles: Role[] = ["data-manager"],
) {
  const session = await getSession();
  session.set("token", { access_token: "access", token_type: "bearer" });
  session.set("user", { id: 1, username: "admin", roles });
  return new Request(url, {
    method: formData == null ? "GET" : "POST",
    body: formData,
    headers: { Cookie: await commitSession(session) },
  });
}

function makeAccount(id: number) {
  return { id, username: `user-${id}`, preferences: null };
}

// `GET /accounts/{id}` answers with the non-owner projection: an id and a
// username, and no `preferences` field for the picker to render. The
// administrator-only collection above still returns the full account, which is
// why the two shapes are built separately.
function makeAccountSummary(id: number) {
  return { id, username: `user-${id}` };
}

function makeUser(id: number, roles: Role[]): User {
  return { id, username: `user-${id}`, roles };
}

function makeBranch(
  permLvByUserId: Record<string, BranchPermissionLevel> = {},
): LabelBranch {
  return {
    id: 1,
    name: "branch",
    perm_lv_by_user_id: permLvByUserId,
  } as LabelBranch;
}

describe("branch permission gating", () => {
  const dataManager = makeUser(1, ["data-manager"]);
  const plainUser = makeUser(2, ["annotator"]);

  it("reads levels from the per-branch permission map without role overrides", () => {
    expect(getBranchPermissionLevel(makeBranch(), plainUser)).toBe(0);
    expect(getBranchPermissionLevel(makeBranch({ 2: 3 }), plainUser)).toBe(3);
    expect(getBranchPermissionLevel(makeBranch({ 2: 4 }), plainUser)).toBe(4);
    expect(getBranchPermissionLevel(makeBranch(), dataManager)).toBe(0);
    expect(getBranchPermissionLevel(makeBranch({ 1: 2 }), dataManager)).toBe(2);
  });

  it("lets data managers write any branch regardless of per-branch grants", () => {
    expect(canWriteBranch(makeBranch(), dataManager)).toBe(true);
    expect(canWriteBranch(makeBranch({ 1: 1 }), dataManager)).toBe(true);
  });

  it("lets non-managers write only branches where they hold Admin", () => {
    expect(canWriteBranch(makeBranch({ 2: 4 }), plainUser)).toBe(true);
    expect(canWriteBranch(makeBranch({ 2: 3 }), plainUser)).toBe(false);
    expect(canWriteBranch(makeBranch(), plainUser)).toBe(false);
  });

  it("displays Admin as the effective access of data managers", () => {
    expect(getEffectiveAccessLevel(makeBranch(), dataManager)).toBe(4);
    expect(getEffectiveAccessLevel(makeBranch({ 1: 2 }), dataManager)).toBe(4);
  });

  it("displays the per-branch grant as the effective access of non-managers", () => {
    expect(getEffectiveAccessLevel(makeBranch({ 2: 3 }), plainUser)).toBe(3);
    expect(getEffectiveAccessLevel(makeBranch(), plainUser)).toBe(0);
  });
});

describe("buildBranchesQuery", () => {
  it("maps the last_edit_at date range to ge/lt params, widening the inclusive upper bound", () => {
    expect(
      buildBranchesQuery({
        filters: [
          {
            columnId: "last_edit_at",
            operator: "RangeInclusive",
            searchTerms: ["2026-08-01", "2026-08-04"],
          },
        ],
        sorters: [],
      }),
    ).toEqual({
      last_edit_at_ge: "2026-08-01",
      last_edit_at_lt: "2026-08-05",
    });
  });

  it("maps a one-sided date range to a single bound", () => {
    expect(
      buildBranchesQuery({
        filters: [
          {
            columnId: "last_edit_at",
            operator: "RangeInclusive",
            searchTerms: ["2026-08-02", null],
          },
        ],
        sorters: [],
      }),
    ).toEqual({ last_edit_at_ge: "2026-08-02" });
  });

  it("maps text and id column filters and ignores unknown columns", () => {
    expect(
      buildBranchesQuery({
        filters: [
          { columnId: "id", operator: "", searchTerms: [7] },
          {
            columnId: "name",
            operator: "Contains",
            searchTerms: ["main"],
          },
          {
            columnId: "head_hash",
            operator: "Contains",
            searchTerms: ["abc"],
          },
          {
            columnId: "not_a_column",
            operator: "Contains",
            searchTerms: ["x"],
          },
        ],
        sorters: [],
      }),
    ).toEqual({ id: 7, name_contains: "main", head_hash_contains: "abc" });
  });

  it("applies whitelisted sorters and drops the rest", () => {
    expect(
      buildBranchesQuery({
        filters: [],
        sorters: [{ columnId: "last_edit_at", direction: "desc" }],
      }),
    ).toEqual({ sort_by: "last_edit_at", sort_dir: "desc" });

    expect(
      buildBranchesQuery({
        filters: [],
        sorters: [{ columnId: "perm_lv_by_user_id", direction: "asc" }],
      }),
    ).toEqual({});
  });
});

describe("branch commit hash loading", () => {
  it("does not load branch graphs during the page loader", async () => {
    sdk.readGroup.mockResolvedValue({ data: { id: 7, name: "repo" } });
    sdk.listBranches.mockResolvedValue({ data: [makeBranch()] });
    sdk.readAccount.mockImplementation(({ path }: { path: { id: number } }) =>
      Promise.resolve({
        data: makeAccountSummary(path.id),
      }),
    );

    await loader({
      request: await authenticatedRequest(
        "http://localhost/label/repos/7/branches",
      ),
      params: { groupId: "7" },
    } as never);

    expect(sdk.readGraph).not.toHaveBeenCalled();
  });

  it("loads commit hashes only when the modal requests them", async () => {
    const branch = { ...makeBranch(), head_hash: "head" };
    sdk.listBranches.mockResolvedValue({ data: [branch] });
    sdk.readGraph.mockResolvedValue({
      data: { nodes: [{ hash: "parent" }], edges: [] },
    });
    const formData = new FormData();
    formData.set("_action", "commit_hashes");

    const result = await action({
      request: await authenticatedRequest(
        "http://localhost/label/repos/7/branches",
        formData,
      ),
      params: { groupId: "7" },
    } as never);

    expect(sdk.readGraph).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ commitHashOptions: ["head", "parent"] });
  });
});

// The permissions editor must offer a user who holds no grant anywhere yet, so
// the account collection stays available to the one role allowed to read it,
// and is never requested for a role that would only be refused.
describe("permissions editor account universe", () => {
  const branchesUrl = "http://localhost/label/repos/7/branches";

  function stubRepositoryLoad(grants: Record<string, BranchPermissionLevel>) {
    sdk.readGroup.mockResolvedValue({ data: { id: 7, name: "repo" } });
    sdk.listBranches.mockResolvedValue({ data: [makeBranch(grants)] });
  }

  it("gives an administrator the whole account collection", async () => {
    stubRepositoryLoad({ "9": 2 });
    sdk.listAccounts.mockResolvedValue({
      data: [makeAccount(12), makeAccount(9), makeAccount(1)],
    });

    const result = (await loader({
      request: await authenticatedRequest(branchesUrl, undefined, ["admin"]),
      params: { groupId: "7" },
    } as never)) as any;

    expect(sdk.listAccounts).toHaveBeenCalledWith({ auth: "access" });
    // Every account is pickable, including the never-granted user-12, and the
    // collection already covers the grantees so no per-id read is needed.
    expect(result.accounts.map((account: any) => account.id)).toEqual([
      1, 12, 9,
    ]);
    expect(sdk.readAccount).not.toHaveBeenCalled();
    expect(result.loaderError).toBeUndefined();
  });

  it("resolves only the grantees an administrator's collection is missing", async () => {
    stubRepositoryLoad({ "9": 2, "99": 1 });
    sdk.listAccounts.mockResolvedValue({
      data: [makeAccount(1), makeAccount(9)],
    });
    sdk.readAccount.mockImplementation(({ path }: { path: { id: number } }) =>
      Promise.resolve({
        data: makeAccountSummary(path.id),
        response: new Response(null, { status: 200 }),
      }),
    );

    const result = (await loader({
      request: await authenticatedRequest(branchesUrl, undefined, ["admin"]),
      params: { groupId: "7" },
    } as never)) as any;

    expect(sdk.readAccount).toHaveBeenCalledTimes(1);
    expect(sdk.readAccount).toHaveBeenCalledWith({
      auth: "access",
      path: { id: 99 },
    });
    expect(result.accounts.map((account: any) => account.id)).toContain(99);
  });

  it("never requests the collection for a non-administrator", async () => {
    stubRepositoryLoad({ "9": 2, "99": 1 });
    // An account that no longer exists stays invisible instead of failing.
    sdk.readAccount.mockImplementation(({ path }: { path: { id: number } }) =>
      path.id === 99
        ? Promise.resolve({
            error: { detail: "Not Found" },
            response: new Response(null, { status: 404 }),
          })
        : Promise.resolve({
            data: makeAccountSummary(path.id),
            response: new Response(null, { status: 200 }),
          }),
    );

    const result = (await loader({
      request: await authenticatedRequest(branchesUrl),
      params: { groupId: "7" },
    } as never)) as any;

    expect(sdk.listAccounts).not.toHaveBeenCalled();
    expect(
      sdk.readAccount.mock.calls.map(([args]) => args.path.id).sort(),
    ).toEqual([1, 9, 99]);
    expect(result.accounts.map((account: any) => account.id)).toEqual([1, 9]);
    // What the permissions list renders is exactly what a non-administrator is
    // allowed to see of a coworker: identity, and no `preferences`.
    for (const account of result.accounts) {
      expect(Object.keys(account).sort()).toEqual(["id", "username"]);
    }
    expect(result.loaderError).toBeUndefined();
  });

  it("reports an account read refusal for a non-administrator", async () => {
    stubRepositoryLoad({ "9": 2 });
    sdk.readAccount.mockImplementation(({ path }: { path: { id: number } }) =>
      path.id === 9
        ? Promise.resolve({
            error: { detail: "Account unavailable" },
            response: new Response(null, { status: 500 }),
          })
        : Promise.resolve({
            data: makeAccountSummary(path.id),
            response: new Response(null, { status: 200 }),
          }),
    );

    const result = (await loader({
      request: await authenticatedRequest(branchesUrl),
      params: { groupId: "7" },
    } as never)) as any;

    expect(sdk.listAccounts).not.toHaveBeenCalled();
    expect(result.accounts.map((account: any) => account.id)).toEqual([1]);
    expect(result.loaderError).toContain("Account unavailable");
  });
});
