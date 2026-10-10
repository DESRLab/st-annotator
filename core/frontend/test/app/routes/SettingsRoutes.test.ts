import { afterEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  updateUser: vi.fn(),
  whoami: vi.fn(),
}));

vi.mock("../../../client/sdk.gen", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../client/sdk.gen")>()),
  updateUserUsersIdPatch: sdk.updateUser,
  whoamiAuthWhoamiGet: sdk.whoami,
}));

import { loader as dashboardLoader } from "../../../app/routes/dashboard";
import {
  action as accountAction,
  loader as accountLoader,
} from "../../../app/routes/settings/account";
import {
  action as authenticationAction,
  loader as authenticationLoader,
} from "../../../app/routes/settings/authentication";
import { loader as preferencesLoader } from "../../../app/routes/settings/preferences";
import { loader as profileLoader } from "../../../app/routes/settings/profile";
import { commitSession, getSession } from "../../../app/sessions";

function post(url: string, fields: Record<string, string>, cookie?: string) {
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: new URLSearchParams(fields),
  });
}

async function authCookie(includeUser = true) {
  const session = await getSession();
  session.set("token", { access_token: "access", token_type: "bearer" });
  if (includeUser)
    session.set("user", { id: 4, username: "alex", roles: ["annotator"] });
  return commitSession(session);
}

afterEach(() => vi.clearAllMocks());

describe("settings and dashboard loaders", () => {
  it("redirects every unauthenticated settings/dashboard loader", async () => {
    for (const loader of [
      dashboardLoader,
      accountLoader,
      authenticationLoader,
      profileLoader,
      preferencesLoader,
    ]) {
      const response = (await loader({
        request: new Request("http://localhost/settings"),
      } as any)) as any;
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/login");
    }
  });

  it("returns the session user at each authenticated route boundary", async () => {
    for (const loader of [
      dashboardLoader,
      accountLoader,
      authenticationLoader,
      profileLoader,
      preferencesLoader,
    ]) {
      const request = new Request("http://localhost/settings", {
        headers: { Cookie: await authCookie() },
      });
      const result = (await loader({ request } as any)) as any;
      expect(result.data.user).toMatchObject({ id: 4, username: "alex" });
    }
  });
});

describe("account settings action", () => {
  const issuedAt = "2026-09-05T02:00:00Z";

  it("validates missing and malformed usernames before authentication or mutation", async () => {
    const missing = await accountAction({
      request: post("http://localhost/settings/account", {
        userId: "4",
        username: "",
      }),
    } as any);
    expect((missing as any).errors.username).toBeTruthy();
    const malformed = await accountAction({
      request: post("http://localhost/settings/account", {
        userId: "4",
        username: "a b",
      }),
    } as any);
    expect((malformed as any).errors.username).toBeTruthy();
    expect(sdk.updateUser).not.toHaveBeenCalled();
  });

  it("handles expired sessions and upstream validation errors", async () => {
    const expired = (await accountAction({
      request: post("http://localhost/settings/account", {
        userId: "4",
        username: "alex2",
      }),
    } as any)) as Response;
    expect(expired.headers.get("Location")).toBe("/login");

    sdk.updateUser.mockResolvedValue({
      error: { detail: "Username already exists" },
    });
    const response = (await accountAction({
      request: post(
        "http://localhost/settings/account",
        { userId: "4", username: "alex2", issued_at: issuedAt },
        await authCookie(),
      ),
    } as any)) as Response;
    expect(response.headers.get("Location")).toBe("/settings/account");
    expect(
      (await getSession(response.headers.get("Set-Cookie"))).get("error"),
    ).toBe("Username already exists");
    expect(sdk.updateUser).toHaveBeenCalledWith({
      auth: "access",
      path: { id: 4 },
      body: { username: "alex2", issued_at: issuedAt },
    });
  });

  it("refreshes session identity after a successful mutation", async () => {
    sdk.updateUser.mockResolvedValue({ data: {} });
    sdk.whoami.mockResolvedValue({
      data: { id: 4, username: "alex2", roles: ["annotator"] },
    });
    const response = (await accountAction({
      request: post(
        "http://localhost/settings/account",
        { userId: "4", username: "alex2", issued_at: issuedAt },
        await authCookie(),
      ),
    } as any)) as Response;
    const session = await getSession(response.headers.get("Set-Cookie"));
    expect(response.headers.get("Location")).toBe("/settings/account");
    expect(session.get("user").username).toBe("alex2");
    expect(session.get("success")).toBe("Update successful.");
  });
});

describe("authentication settings action", () => {
  const valid = {
    userId: "4",
    issued_at: "2026-09-05T02:00:00Z",
    currentPassword: "Old-password1!",
    newPassword: "New-password2!",
    confirmPassword: "New-password2!",
  };

  it("validates required fields, password policy, and confirmation", async () => {
    const result = (await authenticationAction({
      request: post("http://localhost/settings/authentication", {
        userId: "4",
        currentPassword: "",
        newPassword: "",
        confirmPassword: "different",
      }),
    } as any)) as any;
    expect(result.errors.currentPassword).toBeTruthy();
    expect(result.errors.newPassword).toBeTruthy();
    expect(result.errors.confirmPassword).toBe("Passwords do not match");
    expect(sdk.updateUser).not.toHaveBeenCalled();
  });

  it("rejects an incorrect old password without updating the user", async () => {
    sdk.updateUser.mockResolvedValue({
      error: { detail: "Current password is incorrect." },
    });
    const response = (await authenticationAction({
      request: post(
        "http://localhost/settings/authentication",
        valid,
        await authCookie(),
      ),
    } as any)) as Response;
    expect(response.headers.get("Location")).toBe("/settings/authentication");
    expect(
      (await getSession(response.headers.get("Set-Cookie"))).get("error"),
    ).toBe("Current password is incorrect.");
    expect(sdk.updateUser).toHaveBeenCalledWith({
      auth: "access",
      path: { id: 4 },
      body: {
        password: valid.newPassword,
        current_password: valid.currentPassword,
        issued_at: valid.issued_at,
      },
    });
  });

  it("updates a valid password with bearer authentication", async () => {
    sdk.updateUser.mockResolvedValue({ data: {} });
    sdk.whoami.mockResolvedValue({
      data: { id: 4, username: "alex", roles: ["annotator"] },
    });
    const response = (await authenticationAction({
      request: post(
        "http://localhost/settings/authentication",
        valid,
        await authCookie(),
      ),
    } as any)) as Response;
    expect(sdk.updateUser).toHaveBeenCalledWith({
      auth: "access",
      path: { id: 4 },
      body: {
        password: valid.newPassword,
        current_password: valid.currentPassword,
        issued_at: valid.issued_at,
      },
    });
    expect(response.headers.get("Location")).toBe("/login");
    const session = await getSession(response.headers.get("Set-Cookie"));
    expect(session.get("token")).toBeUndefined();
    expect(session.get("user")).toBeUndefined();
    expect(session.get("success")).toBe(
      "Password updated. Please log in again.",
    );
  });
});
