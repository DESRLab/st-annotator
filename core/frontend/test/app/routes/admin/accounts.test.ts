import { afterEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  bulkAccounts: vi.fn(),
  bulkUsers: vi.fn(),
  createUser: vi.fn(),
  listAccounts: vi.fn(),
  listUsers: vi.fn(),
  listUserIds: vi.fn(),
}));

vi.mock("../../../../client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../client")>()),
  bulkUpdateAccountsAccountsBulkPatch: sdk.bulkAccounts,
  bulkUpdateUsersUsersBulkPatch: sdk.bulkUsers,
  createUserUsersPost: sdk.createUser,
  listAccountsAccountsGet: sdk.listAccounts,
  listUserIdsUsersIdsGet: sdk.listUserIds,
  listUsersUsersGet: sdk.listUsers,
}));

import {
  action,
  buildAccountsQuery,
  formatPreferencesText,
  loader,
  parsePreferencesPane,
} from "../../../../app/routes/admin/accounts";
import { commitSession, getSession } from "../../../../app/sessions";

afterEach(() => vi.clearAllMocks());

async function adminRequest(url: string, formData?: FormData) {
  const session = await getSession();
  session.set("token", { access_token: "access", token_type: "bearer" });
  session.set("user", { id: 1, username: "admin", roles: ["admin"] });
  return new Request(url, {
    method: formData == null ? "GET" : "POST",
    body: formData,
    headers: { Cookie: await commitSession(session) },
  });
}

it("normalizes structured account mutation errors", async () => {
  sdk.createUser.mockResolvedValue({ error: { detail: "duplicate account" } });
  const formData = new FormData();
  formData.set("_action", "create");
  formData.set("username", "duplicate");
  formData.set("password", "Password123!");
  formData.set("roles", "[]");
  formData.set("preferences", "{}");

  const result = await action({
    request: await adminRequest("http://localhost/admin/accounts", formData),
  } as never);

  expect(result).toEqual({ error: "duplicate account" });
});

describe("buildAccountsQuery", () => {
  it("maps the roles column to the repeated role param", () => {
    expect(
      buildAccountsQuery({
        filters: [
          {
            columnId: "roles",
            operator: "IN",
            searchTerms: ["admin", "annotator"],
          },
        ],
        sorters: [],
      }),
    ).toEqual({ role: ["admin", "annotator"] });
  });

  it("maps username to a text filter and id to a numeric filter", () => {
    expect(
      buildAccountsQuery({
        filters: [
          {
            columnId: "username",
            operator: "Contains",
            searchTerms: ["grid"],
          },
          { columnId: "id", operator: "", searchTerms: [3] },
        ],
        sorters: [],
      }),
    ).toEqual({ username_contains: "grid", id: 3 });
  });

  it("maps created_at and current_login_at to date range params", () => {
    expect(
      buildAccountsQuery({
        filters: [
          {
            columnId: "created_at",
            operator: "RangeInclusive",
            searchTerms: ["2026-08-01", "2026-08-04"],
          },
          {
            columnId: "current_login_at",
            operator: "RangeInclusive",
            searchTerms: ["2026-08-05", null],
          },
        ],
        sorters: [],
      }),
    ).toEqual({
      created_at_ge: "2026-08-01",
      created_at_lt: "2026-08-05",
      current_login_at_ge: "2026-08-05",
    });
  });

  it("applies whitelisted sorters and drops the rest", () => {
    expect(
      buildAccountsQuery({
        filters: [],
        sorters: [{ columnId: "username", direction: "asc" }],
      }),
    ).toEqual({ sort_by: "username", sort_dir: "asc" });

    expect(
      buildAccountsQuery({
        filters: [],
        sorters: [{ columnId: "roles", direction: "asc" }],
      }),
    ).toEqual({});
  });
});

describe("accounts loader pagination", () => {
  it("loads only the requested page when more filtered users exist", async () => {
    sdk.listUsers.mockResolvedValue({
      data: [
        {
          id: 51,
          username: "page-user",
          roles: [],
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
      response: new Response(null, {
        headers: { "Content-Range": "users 50-50/1000" },
      }),
    });
    sdk.listAccounts.mockResolvedValue({
      data: [{ id: 51, preferences: {} }],
    });
    sdk.listUserIds.mockResolvedValue({ data: [1, 2, 51, 999] });

    const result = (await loader({
      request: await adminRequest(
        "http://localhost/admin/accounts?page=3&pageSize=25",
      ),
    } as any)) as any;

    expect(sdk.listUsers).toHaveBeenCalledTimes(1);
    expect(sdk.listUsers).toHaveBeenCalledWith({
      auth: "access",
      query: { offset: 50, limit: 25 },
    });
    expect(result.pagination.totalItems).toBe(1000);
    expect(sdk.listUserIds).toHaveBeenCalledOnce();
    expect(sdk.listUserIds).toHaveBeenCalledWith({
      auth: "access",
      query: {},
    });
    expect(result.allSelectableIds).toEqual([1, 2, 51, 999]);
  });
});

/**
 * The shape the batch dialog posts: both toggles are `SubmittedCheckbox`es, so an
 * unchecked attribute submits ["false"] and a checked one ["false", "true"], while the
 * roles and preferences fields ride along as hidden inputs on every submission.
 */
function batchForm(
  overrides: Partial<Record<string, string | string[]>> = {},
): FormData {
  const values: Record<string, string | string[]> = {
    _action: "batch",
    selectedIds: "[2,3]",
    updateRoles: "false",
    updatePreferences: "false",
    roles: "[]",
    preferences: "{}",
    ...overrides,
  };

  const form = new FormData();
  for (const [name, value] of Object.entries(values)) {
    for (const entry of Array.isArray(value) ? value : [value]) {
      form.append(name, entry);
    }
  }
  return form;
}

async function submitBatch(formData: FormData) {
  return await action({
    request: await adminRequest("http://localhost/admin/accounts", formData),
  } as never);
}

describe("accounts batch update", () => {
  it("refuses a batch that opted into no attribute", async () => {
    expect(await submitBatch(batchForm())).toEqual({
      error: "Select at least one attribute to update",
    });
    expect(sdk.bulkUsers).not.toHaveBeenCalled();
    expect(sdk.bulkAccounts).not.toHaveBeenCalled();
  });

  it("writes roles through the users endpoint alone", async () => {
    sdk.bulkUsers.mockResolvedValue({ data: {} });

    expect(
      await submitBatch(
        batchForm({
          updateRoles: ["false", "true"],
          roles: '["annotator","data-manager"]',
        }),
      ),
    ).toEqual({ success: "Updated 2 users." });

    // The roles write replaces each account's whole set, so an omission here would
    // silently keep a role the batch did not send.
    expect(sdk.bulkUsers).toHaveBeenCalledWith({
      auth: "access",
      body: {
        ids: [2, 3],
        data: { roles: ["annotator", "data-manager"] },
      },
    });
    expect(sdk.bulkAccounts).not.toHaveBeenCalled();
  });

  it("writes preferences through the accounts endpoint alone", async () => {
    sdk.bulkAccounts.mockResolvedValue({ data: {} });

    expect(
      await submitBatch(
        batchForm({
          updatePreferences: ["false", "true"],
          preferences: '{"theme":"dark"}',
        }),
      ),
    ).toEqual({ success: "Updated 2 users." });

    expect(sdk.bulkAccounts).toHaveBeenCalledWith({
      auth: "access",
      body: { ids: [2, 3], data: { preferences: { theme: "dark" } } },
    });
    expect(sdk.bulkUsers).not.toHaveBeenCalled();
  });

  it("resets preferences to the default object when the box is left empty", async () => {
    sdk.bulkAccounts.mockResolvedValue({ data: {} });

    await submitBatch(
      batchForm({ updatePreferences: ["false", "true"], preferences: "" }),
    );

    expect(sdk.bulkAccounts.mock.calls[0][0].body.data).toEqual({
      preferences: {},
    });
  });

  it("sends both attributes to the whole selection in one submit", async () => {
    sdk.bulkUsers.mockResolvedValue({ data: {} });
    sdk.bulkAccounts.mockResolvedValue({ data: {} });

    expect(
      await submitBatch(
        batchForm({
          updateRoles: ["false", "true"],
          roles: '["supervisor"]',
          updatePreferences: ["false", "true"],
          preferences: '{"a":1}',
        }),
      ),
    ).toEqual({ success: "Updated 2 users." });

    expect(sdk.bulkUsers.mock.calls[0][0].body.ids).toEqual([2, 3]);
    expect(sdk.bulkAccounts.mock.calls[0][0].body.ids).toEqual([2, 3]);
  });

  it("stops before the preferences write when the roles write is refused", async () => {
    sdk.bulkUsers.mockResolvedValue({
      error: {
        detail: "You cannot remove the admin role from your own account!",
      },
    });

    expect(
      await submitBatch(
        batchForm({
          updateRoles: ["false", "true"],
          roles: "[]",
          updatePreferences: ["false", "true"],
        }),
      ),
    ).toEqual({
      error: "You cannot remove the admin role from your own account!",
    });
    // Half-applying the batch would leave the selection in a state the dialog never
    // offered, so the refused attribute ends the submit.
    expect(sdk.bulkAccounts).not.toHaveBeenCalled();
  });

  it("rejects a role the platform does not define", async () => {
    expect(await submitBatch(batchForm({ roles: '["owner"]' }))).toEqual({
      error: expect.stringContaining("batch account form data"),
    });
    expect(sdk.bulkUsers).not.toHaveBeenCalled();
  });

  it("rejects preferences that are not a JSON object", async () => {
    expect(
      await submitBatch(
        batchForm({
          updatePreferences: ["false", "true"],
          preferences: "[1,2]",
        }),
      ),
    ).toEqual({ error: expect.stringContaining("preferences") });
    expect(sdk.bulkAccounts).not.toHaveBeenCalled();
  });
});

describe("preferences raw pane", () => {
  it("reads empty text as no preferences, the way the action does", () => {
    expect(parsePreferencesPane("")).toEqual({ ok: true, value: {} });
    expect(parsePreferencesPane("  ")).toEqual({ ok: true, value: {} });
  });

  it("names the problem for text the pane cannot hold", () => {
    expect(parsePreferencesPane("{oops")).toEqual({
      ok: false,
      error: "Preferences must be valid JSON.",
    });
    expect(parsePreferencesPane("[1,2]")).toEqual({
      ok: false,
      error: "Preferences must be a JSON object.",
    });
    expect(parsePreferencesPane('"a string"').ok).toBe(false);
  });

  it("formats a stored account's preferences for the raw tab", () => {
    expect(formatPreferencesText({ keybinds: { rotate: "r" } })).toBe(
      JSON.stringify({ keybinds: { rotate: "r" } }, null, 2),
    );
    expect(parsePreferencesPane(formatPreferencesText({ a: 1 }))).toEqual({
      ok: true,
      value: { a: 1 },
    });
  });
});
