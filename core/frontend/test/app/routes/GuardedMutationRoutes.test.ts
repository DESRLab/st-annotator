import { afterEach, describe, expect, it, vi } from "vitest";

import { action as accountsAction } from "../../../app/routes/admin/accounts";
import {
  action as jobsAction,
  loader as jobsLoader,
} from "../../../app/routes/jobs";
import {
  action as filesAction,
  loader as filesLoader,
} from "../../../app/routes/source/files";
import { commitSession, getSession } from "../../../app/sessions";
import {
  buildPrincipal,
  type PrincipalProfile,
} from "../../fixtures/authorization";

const sdk = vi.hoisted(() => ({
  cancelJob: vi.fn(),
  createUser: vi.fn(),
  downloadFile: vi.fn(),
  listFiles: vi.fn(),
  listJobs: vi.fn(),
}));

vi.mock("../../../client/sdk.gen", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../client/sdk.gen")>()),
  cancelJobJobsIdCancelPost: sdk.cancelJob,
  createUserUsersPost: sdk.createUser,
  downloadFileFilesDownloadGet: sdk.downloadFile,
  listFilesFilesGet: sdk.listFiles,
  listJobsJobsGet: sdk.listJobs,
}));
vi.mock("../../../client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../client")>()),
  cancelJobJobsIdCancelPost: sdk.cancelJob,
  createUserUsersPost: sdk.createUser,
  downloadFileFilesDownloadGet: sdk.downloadFile,
  listFilesFilesGet: sdk.listFiles,
  listJobsJobsGet: sdk.listJobs,
}));

async function request(
  profile: PrincipalProfile,
  path: string,
  fields?: Record<string, string>,
) {
  const session = await getSession();
  session.set("token", { access_token: "access", token_type: "bearer" });
  session.set("user", buildPrincipal(profile));
  return new Request(`http://localhost${path}`, {
    method: fields ? "POST" : "GET",
    headers: {
      Cookie: await commitSession(session),
      ...(fields
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
    },
    body: fields ? new URLSearchParams(fields) : undefined,
  });
}

afterEach(() => vi.clearAllMocks());

describe("guarded mutation routes", () => {
  it.each([
    "noRoles",
    "annotator",
    "supervisor",
    "projectManager",
    "dataManager",
    "dualRole",
  ] as const)(
    "refuses account writes by %s before the client call",
    async (profile) => {
      const result = await accountsAction({
        request: await request(profile, "/admin/accounts", {
          _action: "create",
          username: "new_user",
          password: "ValidPassword1!",
          roles: "[]",
        }),
      } as never);

      expect(result).toBeInstanceOf(Response);
      expect((result as Response).headers.get("Location")).toBe("/");
      expect(sdk.createUser).not.toHaveBeenCalled();
    },
  );

  it.each([
    "noRoles",
    "annotator",
    "supervisor",
    "projectManager",
    "administrator",
  ] as const)(
    "refuses job cancellation by %s before the client call",
    async (profile) => {
      const result = await jobsAction({
        request: await request(profile, "/jobs", { id: "9" }),
      } as never);

      expect(result).toBeInstanceOf(Response);
      expect((result as Response).headers.get("Location")).toBe("/");
      expect(sdk.cancelJob).not.toHaveBeenCalled();
    },
  );

  it.each([
    "noRoles",
    "annotator",
    "supervisor",
    "projectManager",
    "administrator",
  ] as const)(
    "refuses file access by %s before any file client call",
    async (profile) => {
      const loadResult = await filesLoader({
        request: await request(profile, "/source/files"),
      } as never);
      const actionResult = await filesAction({
        request: await request(profile, "/source/files", {
          _action: "download",
          path: "protected.bin",
        }),
      } as never);

      expect(loadResult).toBeInstanceOf(Response);
      expect(actionResult).toBeInstanceOf(Response);
      expect((loadResult as Response).headers.get("Location")).toBe("/");
      expect((actionResult as Response).headers.get("Location")).toBe("/");
      expect(sdk.listFiles).not.toHaveBeenCalled();
      expect(sdk.downloadFile).not.toHaveBeenCalled();
    },
  );

  it("lets a data manager load read-only route data and perform its guarded writes", async () => {
    sdk.listJobs.mockResolvedValue({ data: [] });
    sdk.cancelJob.mockResolvedValue({ data: { id: 9 } });
    sdk.listFiles.mockResolvedValue({ data: { entries: [] } });
    sdk.downloadFile.mockResolvedValue({
      data: new Uint8Array(),
      response: new Response(null, {
        headers: { "Content-Type": "application/octet-stream" },
      }),
    });

    const jobs = await jobsLoader({
      request: await request("dataManager", "/jobs"),
    } as never);
    await jobsAction({
      request: await request("dataManager", "/jobs", { id: "9" }),
    } as never);
    const files = await filesLoader({
      request: await request("dataManager", "/source/files"),
    } as never);
    await filesAction({
      request: await request("dataManager", "/source/files", {
        _action: "download",
        path: "allowed.bin",
      }),
    } as never);

    expect(jobs).not.toBeInstanceOf(Response);
    expect(files).not.toBeInstanceOf(Response);
    expect(sdk.listJobs).toHaveBeenCalledOnce();
    expect(sdk.cancelJob).toHaveBeenCalledOnce();
    expect(sdk.listFiles).toHaveBeenCalledOnce();
    expect(sdk.downloadFile).toHaveBeenCalledOnce();
  });
});

describe("authorization response handling", () => {
  it.each([
    [401, "Authentication expired"],
    [403, "Forbidden"],
    [404, "Not Found"],
  ] as const)(
    "preserves a %i job-list failure as an error",
    async (status, detail) => {
      sdk.listJobs.mockResolvedValue({
        error: { detail },
        response: new Response(null, { status }),
      });

      const result = (await jobsLoader({
        request: await request("dataManager", "/jobs"),
      } as never)) as { dataset: unknown[]; loaderError: unknown };

      expect(result.dataset).toEqual([]);
      expect(result.loaderError).toEqual({ detail });
      expect(result.loaderError).not.toBeNull();
    },
  );
});
