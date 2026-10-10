import { describe, expect, it, vi } from "vitest";

import {
  readProjectConfigEditorConfigGet,
  readProjectProjectsIdGet,
} from "../../../../client/sdk.gen";
import { loadAccessTokenSession } from "../../../../app/loaders";
import { loader } from "../../../../app/routes/editor/editor";

vi.mock("../../../../client/sdk.gen", () => ({
  readProjectProjectsIdGet: vi.fn(),
  readProjectConfigEditorConfigGet: vi.fn(),
}));
vi.mock("../../../../app/loaders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../app/loaders")>()),
  loadAccessTokenSession: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("editor loader", () => {
  it("loads project metadata and editor config concurrently", async () => {
    vi.mocked(loadAccessTokenSession).mockResolvedValue({
      session: {},
      token: { access_token: "token" },
    } as never);
    const project = deferred<{ data: { id: number } }>();
    const config = deferred<{ data: { frame_cache_size: number } }>();
    vi.mocked(readProjectProjectsIdGet).mockReturnValue(
      project.promise as never,
    );
    vi.mocked(readProjectConfigEditorConfigGet).mockReturnValue(
      config.promise as never,
    );

    const loading = loader({
      params: { projectId: "1" },
      request: new Request("http://localhost/projects/1/annotate"),
    } as never);

    await vi.waitFor(() => {
      expect(readProjectProjectsIdGet).toHaveBeenCalledOnce();
      expect(readProjectConfigEditorConfigGet).toHaveBeenCalledOnce();
    });
    project.resolve({ data: { id: 1 } });
    config.resolve({ data: { frame_cache_size: 8 } });
    await expect(loading).resolves.toEqual({
      projectConfig: { frame_cache_size: 8 },
    });
  });
});
