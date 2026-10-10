import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  login: vi.fn(),
  whoami: vi.fn(),
  logout: vi.fn(),
  refresh: vi.fn(),
  listAccounts: vi.fn(),
  readAccount: vi.fn(),
}));

vi.mock("../../../client/sdk.gen", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../client/sdk.gen")>()),
  loginAuthLoginPost: sdk.login,
  whoamiAuthWhoamiGet: sdk.whoami,
  logoutAuthLogoutPost: sdk.logout,
  refreshAuthRefreshPost: sdk.refresh,
  listAccountsAccountsGet: sdk.listAccounts,
  readAccountAccountsIdGet: sdk.readAccount,
}));
vi.mock("../../../client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../client")>()),
  logoutAuthLogoutPost: sdk.logout,
  listAccountsAccountsGet: sdk.listAccounts,
  readAccountAccountsIdGet: sdk.readAccount,
}));

import { loader as protectedLoader } from "../../../app/layouts/protected";
import { loader as accountsLoader } from "../../../app/routes/admin/accounts";
import {
  action as loginAction,
  getSafeReturnTo,
} from "../../../app/routes/login";
import { action as logoutAction } from "../../../app/routes/logout";
import {
  default as Profile,
  loader as profileLoader,
} from "../../../app/routes/profile";
import { commitSession, getSession } from "../../../app/sessions";

function formRequest(url: string, fields: Record<string, string>) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });
}

async function requestWithSession(
  url: string,
  values: Record<string, unknown>,
) {
  const session = await getSession();
  for (const [key, value] of Object.entries(values)) session.set(key, value);
  return new Request(url, {
    headers: { Cookie: await commitSession(session) },
  });
}

async function responseSession(response: Response) {
  return getSession(response.headers.get("Set-Cookie"));
}

afterEach(() => vi.clearAllMocks());

describe("protected authentication boundary", () => {
  it("redirects an unauthenticated request to login with its path and query intact", async () => {
    const response = (await protectedLoader({
      request: new Request("http://localhost/projects/7/tasks?page=3"),
    } as any)) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "/login?returnTo=%2Fprojects%2F7%2Ftasks%3Fpage%3D3",
    );
    expect((await responseSession(response)).get("error")).toBe(
      "Your session has expired. Please log in again.",
    );

    const logoutResponse = (await protectedLoader({
      request: new Request("http://localhost/logout"),
    } as any)) as Response;
    expect(logoutResponse.headers.get("Location")).toBe("/login?returnTo=%2F");
  });

  it("refreshes an authenticated user and propagates bearer authentication", async () => {
    sdk.whoami.mockResolvedValue({
      data: { id: 5, username: "alex", roles: ["annotator"] },
    });
    const request = await requestWithSession("http://localhost/projects", {
      token: { access_token: "access", token_type: "bearer" },
    });
    const response = (await protectedLoader({ request } as any)) as Response;

    expect(sdk.whoami).toHaveBeenCalledWith({ auth: "access" });
    expect(response.data.user.username).toBe("alex");
    expect(response.init.headers["Set-Cookie"]).toContain("__session=");
  });

  it("rotates an expired access token through the server-side refresh token", async () => {
    sdk.whoami
      .mockResolvedValueOnce({
        error: { detail: "expired" },
        response: new Response(null, { status: 401 }),
      })
      .mockResolvedValueOnce({
        data: { id: 5, username: "alex", roles: ["annotator"] },
      });
    sdk.refresh.mockResolvedValue({
      data: {
        access_token: "new-access",
        refresh_token: "new-refresh",
        token_type: "bearer",
        expires_in: 36000,
      },
    });
    const request = await requestWithSession("http://localhost/projects", {
      token: {
        access_token: "expired-access",
        refresh_token: "refresh",
        token_type: "bearer",
      },
    });
    const response = (await protectedLoader({ request } as any)) as any;

    expect(sdk.refresh).toHaveBeenCalledWith({
      headers: { Cookie: "refresh_token=refresh" },
    });
    expect(sdk.whoami).toHaveBeenLastCalledWith({ auth: "new-access" });
    expect(response.headers.get("Location")).toBe("/projects");
    expect((await responseSession(response)).get("token").access_token).toBe(
      "new-access",
    );
  });
});

describe("login boundary", () => {
  it("validates both required fields without contacting the server", async () => {
    const result = await loginAction({
      request: formRequest("http://localhost/login", {}),
    } as any);
    expect(result).toEqual({
      errors: {
        username: "Please input your username",
        password: "Please input your password",
      },
    });
    expect(sdk.login).not.toHaveBeenCalled();
  });

  it("reports a server rejection and does not create an authenticated session", async () => {
    sdk.login.mockResolvedValue({
      error: { detail: "Invalid credentials" },
    });
    const response = (await loginAction({
      request: formRequest(
        "http://localhost/login?returnTo=%2Fprojects%2F7%2Ftasks",
        { username: "alex", password: "wrong" },
      ),
    } as any)) as Response;
    expect(response.headers.get("Location")).toBe(
      "/login?returnTo=%2Fprojects%2F7%2Ftasks",
    );
    expect((await responseSession(response)).get("token")).toBeUndefined();
  });

  it("returns to a safe requested route after successful authentication", async () => {
    sdk.login.mockResolvedValue({
      data: { access_token: "access", token_type: "bearer" },
    });
    sdk.whoami.mockResolvedValue({
      data: { id: 5, username: "alex", roles: ["annotator"] },
    });
    const response = (await loginAction({
      request: formRequest(
        "http://localhost/login?returnTo=%2Fprojects%2F7%2Ftasks%3Fpage%3D3",
        { username: "alex", password: "correct" },
      ),
    } as any)) as Response;
    expect(response.headers.get("Location")).toBe("/projects/7/tasks?page=3");
    expect((await responseSession(response)).get("token")).toMatchObject({
      access_token: "access",
    });
  });

  it("rejects external and protocol-relative return targets", () => {
    expect(
      getSafeReturnTo(
        new Request("http://localhost/login?returnTo=https://evil.test"),
      ),
    ).toBe("/");
    expect(
      getSafeReturnTo(
        new Request("http://localhost/login?returnTo=%2F%2Fevil.test"),
      ),
    ).toBe("/");
    expect(
      getSafeReturnTo(
        new Request("http://localhost/login?returnTo=%2F.%2F%2Fevil.test"),
      ),
    ).toBe("/");
    expect(
      getSafeReturnTo(
        new Request("http://localhost/login?returnTo=%2F.%2F%5Cevil.test"),
      ),
    ).toBe("/");
  });
});

describe("logout and admin authorization boundaries", () => {
  it("is idempotent without a token and clears local auth even if upstream logout fails", async () => {
    const noToken = (await logoutAction({
      request: new Request("http://localhost/logout", { method: "POST" }),
    } as any)) as Response;
    expect(noToken.headers.get("Location")).toBe("/login");
    expect(sdk.logout).not.toHaveBeenCalled();

    sdk.logout.mockRejectedValue(new Error("offline"));
    const request = await requestWithSession("http://localhost/logout", {
      token: { access_token: "access", token_type: "bearer" },
      user: { id: 5, username: "alex", roles: ["annotator"] },
    });
    const response = (await logoutAction({ request } as any)) as Response;
    expect(response.headers.get("Location")).toBe("/login");
    const cleared = await responseSession(response);
    expect(cleared.get("user")).toBeUndefined();
    expect(cleared.get("token")).toBeUndefined();
  });

  it("refreshes an expired access token before revoking the backend session", async () => {
    sdk.logout
      .mockResolvedValueOnce({ error: { detail: "expired" } })
      .mockResolvedValueOnce({ data: { success: true } });
    sdk.whoami.mockResolvedValue({
      error: { detail: "expired" },
      response: new Response(null, { status: 401 }),
    });
    sdk.refresh.mockResolvedValue({
      data: {
        access_token: "new-access",
        refresh_token: "new-refresh",
        token_type: "bearer",
        expires_in: 36000,
      },
    });
    sdk.whoami.mockResolvedValueOnce({
      error: { detail: "expired" },
      response: new Response(null, { status: 401 }),
    });
    sdk.whoami.mockResolvedValueOnce({
      data: { id: 5, username: "alex", roles: ["annotator"] },
    });
    const request = await requestWithSession("http://localhost/logout", {
      token: {
        access_token: "expired-access",
        refresh_token: "refresh",
        token_type: "bearer",
      },
      user: { id: 5, username: "alex", roles: ["annotator"] },
    });

    await logoutAction({ request } as any);

    expect(sdk.logout).toHaveBeenNthCalledWith(1, { auth: "expired-access" });
    expect(sdk.logout).toHaveBeenNthCalledWith(2, { auth: "new-access" });
  });

  it("rejects non-admin accounts before loading account data", async () => {
    const request = await requestWithSession(
      "http://localhost/admin/accounts",
      {
        token: { access_token: "access", token_type: "bearer" },
        user: { id: 5, username: "alex", roles: ["project-manager"] },
      },
    );
    const response = (await accountsLoader({ request } as any)) as Response;
    expect(response.headers.get("Location")).toBe("/");
    expect((await responseSession(response)).get("error")).toContain(
      "lack the 'admin' role",
    );
  });
});

describe("profile account lookup boundary", () => {
  async function loadProfile(username?: string) {
    const request = await requestWithSession("http://localhost/profile", {
      token: { access_token: "access", token_type: "bearer" },
    });

    return (await profileLoader({
      request,
      params: username == null ? {} : { username },
    } as any)) as any;
  }

  function profileMarkup(loaderData: unknown) {
    return renderToStaticMarkup(
      createElement(Profile, { loaderData } as never),
    ).replace(/\s+/g, " ");
  }

  it("resolves a non-admin's own profile without the admin-only collection", async () => {
    sdk.whoami.mockResolvedValue({
      data: { id: 5, username: "alex", roles: ["annotator"] },
    });
    // `GET /accounts/{id}` answers with the summary projection, so the payload
    // this page works off is an id and a username.
    sdk.readAccount.mockResolvedValue({
      data: { id: 5, username: "alex" },
    });

    const anonymous = await loadProfile();
    expect(anonymous.user).toEqual({ id: 5, username: "alex" });
    expect(Object.keys(anonymous.user).sort()).toEqual(["id", "username"]);
    expect(anonymous.loaderError).toBeUndefined();
    expect(profileMarkup(anonymous)).toContain("Profile of alex");

    // An explicit username that is the caller's own resolves the same way, so
    // the Profile nav item works for every role.
    const named = await loadProfile("alex");
    expect(named.user).toMatchObject({ id: 5, username: "alex" });

    expect(sdk.readAccount).toHaveBeenLastCalledWith({
      auth: "access",
      path: { id: 5 },
    });
    expect(sdk.listAccounts).not.toHaveBeenCalled();
  });

  it("never renders account preferences, whichever endpoint resolved the account", async () => {
    sdk.whoami.mockResolvedValue({
      data: { id: 5, username: "alex", roles: ["admin"] },
    });
    // Looking somebody else up by username still goes through the
    // administrator-only collection, which keeps the full account shape
    // including `preferences`. The page may not put any of it on screen.
    sdk.listAccounts.mockResolvedValue({
      data: [
        {
          id: 8,
          username: "bruce",
          preferences: { home_address: "Some Street 12" },
        },
      ],
    });

    const result = await loadProfile("bruce");

    expect(result.user).toMatchObject({ id: 8, username: "bruce" });
    const markup = profileMarkup(result);
    expect(markup).toContain("Profile of bruce");
    expect(markup).not.toContain("Some Street 12");
    expect(markup).not.toContain("preferences");
  });

  it("surfaces an authorization failure instead of a missing user", async () => {
    sdk.whoami.mockResolvedValue({
      data: { id: 5, username: "alex", roles: ["annotator"] },
    });
    sdk.listAccounts.mockResolvedValue({
      error: { detail: "Forbidden" },
      response: new Response(null, { status: 403 }),
    });

    const result = await loadProfile("someone-else");

    expect(result.user).toBeNull();
    expect(result.notFound).toBe(false);
    expect(result.loaderError).toEqual({ detail: "Forbidden" });
    const markup = profileMarkup(result);
    expect(markup).toContain("Forbidden");
    expect(markup).not.toContain("This user does not exist!");
  });

  it("still reports a genuinely absent profile as missing", async () => {
    sdk.whoami.mockResolvedValue({
      data: { id: 5, username: "alex", roles: ["annotator"] },
    });
    sdk.readAccount.mockResolvedValue({
      error: { detail: "Not Found" },
      response: new Response(null, { status: 404 }),
    });

    const refusedById = await loadProfile();
    expect(refusedById.user).toBeNull();
    expect(refusedById.notFound).toBe(true);
    expect(profileMarkup(refusedById)).toContain("This user does not exist!");

    sdk.listAccounts.mockResolvedValue({
      data: [],
      response: new Response(null, { status: 200 }),
    });
    const absentByUsername = await loadProfile("someone-else");
    expect(absentByUsername.user).toBeNull();
    expect(absentByUsername.notFound).toBe(true);
    expect(profileMarkup(absentByUsername)).toContain(
      "This user does not exist!",
    );
  });
});
