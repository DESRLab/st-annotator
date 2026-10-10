import { describe, expect, it, vi } from "vitest";

import { readResponseArrayBuffer } from "../../../../../app/routes/editor/data/readResponseWithProgress";

describe("readResponseArrayBuffer", () => {
  it("reports streamed bytes against Content-Length and reconstructs the payload", async () => {
    const chunks = [new Uint8Array([1, 2]), new Uint8Array([3, 4, 5])];
    const response = new Response(
      new ReadableStream({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(chunk);
          controller.close();
        },
      }),
      { headers: { "Content-Length": "5" } },
    );
    const onProgress = vi.fn();

    const result = await readResponseArrayBuffer(response, onProgress);

    expect([...new Uint8Array(result)]).toEqual([1, 2, 3, 4, 5]);
    expect(onProgress.mock.calls).toEqual([
      [{ loadedBytes: 2, totalBytes: 5 }],
      [{ loadedBytes: 5, totalBytes: 5 }],
      [{ loadedBytes: 5, totalBytes: 5 }],
    ]);
  });

  it("remains indeterminate until a response without Content-Length completes", async () => {
    const response = new Response(new Uint8Array([1, 2, 3]));
    response.headers.delete("Content-Length");
    const onProgress = vi.fn();

    await readResponseArrayBuffer(response, onProgress);

    expect(onProgress).toHaveBeenLastCalledWith({
      loadedBytes: 3,
      totalBytes: 3,
    });
  });
});
