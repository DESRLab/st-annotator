import { describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ downloadFile: vi.fn() }));

vi.mock("../../../../client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../client")>()),
  downloadFileFilesDownloadGet: sdk.downloadFile,
}));

import {
  directoryLoadingText,
  formatRegistrationLabels,
  getRegistrationFilterOptions,
} from "../../../../app/routes/source/files";
import { loader as downloadLoader } from "../../../../app/routes/source/files-download";
import { commitSession, getSession } from "../../../../app/sessions";

async function dataManagerRequest(url: string) {
  const session = await getSession();
  session.set("token", { access_token: "access", token_type: "bearer" });
  session.set("user", {
    id: 1,
    username: "manager",
    roles: ["data-manager"],
  });
  return new Request(url, {
    headers: { Cookie: await commitSession(session) },
  });
}

describe("getRegistrationFilterOptions", () => {
  it("collects the unique registration labels of the dataset", () => {
    const options = getRegistrationFilterOptions([
      { registrationLabels: [] },
      { registrationLabels: ["group-a"] },
      { registrationLabels: ["group-a", "group-b"] },
    ]);

    expect(options).toEqual([
      { label: "group-a", value: "group-a" },
      { label: "group-b", value: "group-b" },
    ]);
  });

  it("returns no options for an empty dataset", () => {
    expect(getRegistrationFilterOptions([])).toEqual([]);
  });
});

describe("formatRegistrationLabels", () => {
  it("shows a single label as-is", () => {
    expect(formatRegistrationLabels(["group-a"])).toBe("group-a");
  });

  it("summarizes extra labels as a count", () => {
    expect(formatRegistrationLabels(["first", "second", "third"])).toBe(
      "first (+2)",
    );
  });

  it("shows nothing without labels", () => {
    expect(formatRegistrationLabels([])).toBe("");
  });
});

describe("directoryLoadingText", () => {
  const pathname = "/source/files";

  it("shows nothing while the explorer is idle", () => {
    expect(
      directoryLoadingText({ state: "idle", location: undefined }, pathname),
    ).toBeNull();
  });

  it("shows nothing for a form action awaiting its response", () => {
    expect(
      directoryLoadingText(
        {
          state: "submitting",
          location: { pathname, search: "?path=.%2Fe2e" },
        },
        pathname,
      ),
    ).toBeNull();
  });

  it("shows nothing for a navigation to another page", () => {
    expect(
      directoryLoadingText(
        { state: "loading", location: { pathname: "/project", search: "" } },
        pathname,
      ),
    ).toBeNull();
  });

  it("names the directory of a pending navigation on the same page", () => {
    expect(
      directoryLoadingText(
        {
          state: "loading",
          location: { pathname, search: "?path=.%2Fe2e%2Fsequences" },
        },
        pathname,
      ),
    ).toBe("Opening sequences");
  });

  it("falls back to a generic label when opening the filesystem root", () => {
    expect(
      directoryLoadingText(
        { state: "loading", location: { pathname, search: "?path=." } },
        pathname,
      ),
    ).toBe("Loading files");
  });
});

describe("file downloads", () => {
  it("streams the upstream body with an attachment filename", async () => {
    sdk.downloadFile.mockResolvedValue({
      data: new Response("streamed bytes").body,
      response: new Response(null, {
        headers: { "Content-Type": "application/octet-stream" },
      }),
    });

    const response = (await downloadLoader({
      request: await dataManagerRequest(
        "http://localhost/source/files/download?download_path=data%2Fscan.pcd",
      ),
    } as never)) as Response;

    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get("Content-Disposition")).toContain("scan.pcd");
    expect(await response.text()).toBe("streamed bytes");
  });
});
