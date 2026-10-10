import { describe, expect, it, vi } from "vitest";

import { getPlugins } from "../../../../app/config";
import { loadEditorRuntimeModules } from "../../../../app/routes/editor/runtime";

vi.mock("../../../../app/config", () => ({ getPlugins: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("loadEditorRuntimeModules", () => {
  it("starts all imports concurrently and preserves registration order", async () => {
    const first = deferred<{ name: string }>();
    const second = deferred<{ name: string }>();
    const firstLoader = vi.fn(() => first.promise);
    const secondLoader = vi.fn(() => second.promise);
    vi.mocked(getPlugins).mockReturnValue({
      first: { editor: { loader: firstLoader } },
      second: { editor: { loader: secondLoader } },
    } as never);

    const loading = loadEditorRuntimeModules();
    expect(firstLoader).toHaveBeenCalledOnce();
    expect(secondLoader).toHaveBeenCalledOnce();

    second.resolve({ name: "second" });
    first.resolve({ name: "first" });
    await expect(loading).resolves.toEqual({
      first: { name: "first" },
      second: { name: "second" },
    });
  });
});
