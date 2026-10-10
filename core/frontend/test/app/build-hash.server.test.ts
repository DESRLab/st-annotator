import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { assertCurrentBuild } from "../../app/build-hash.server";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function markerPath(contents?: string) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sta-build-hash-"));
  tempDirs.push(tempDir);
  const marker = path.join(tempDir, "build-hash.txt");
  if (contents !== undefined) fs.writeFileSync(marker, contents);
  return marker;
}

describe("assertCurrentBuild", () => {
  it("accepts the matching deployed client", () => {
    expect(() =>
      assertCurrentBuild("current", markerPath("current\n")),
    ).not.toThrow();
  });

  it.each([
    ["a mismatched client", "newer\n"],
    ["a missing client marker", undefined],
  ])("rejects %s with a non-cacheable 503", (_name, contents) => {
    const marker = markerPath(contents);
    try {
      assertCurrentBuild("running", marker);
      expect.unreachable("expected the build guard to reject serving");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      const response = error as Response;
      expect(response.status).toBe(503);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.get("Retry-After")).toBe("5");
    }
  });
});
