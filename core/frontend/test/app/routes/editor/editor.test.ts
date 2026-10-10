import { describe, expect, it } from "vitest";

import {
  DEFAULT_EDITOR_PROJECT_CONFIG,
  parseOptionalNumber,
  parseOptionalPositiveInteger,
  parseProjectIdFromPathname,
  resolveEditorProjectId,
} from "../../../../app/routes/editor/editor";

describe("editor route id parsing", () => {
  it("parses optional numeric query params without treating blank values as zero", () => {
    expect(parseOptionalNumber("1")).toBe(1);
    expect(parseOptionalNumber("")).toBeUndefined();
    expect(parseOptionalNumber("   ")).toBeUndefined();
    expect(parseOptionalNumber("abc")).toBeUndefined();
  });

  it("accepts only positive safe integers for project ids", () => {
    expect(parseOptionalPositiveInteger("1")).toBe(1);
    expect(parseOptionalPositiveInteger("1.5")).toBeUndefined();
    expect(parseOptionalPositiveInteger("0")).toBeUndefined();
    expect(parseOptionalPositiveInteger("")).toBeUndefined();
  });

  it("derives the editor project id from annotate and review pathnames", () => {
    expect(parseProjectIdFromPathname("/projects/1/annotate")).toBe(1);
    expect(parseProjectIdFromPathname("/projects/42/review")).toBe(42);
    expect(
      parseProjectIdFromPathname(
        "http://localhost:5173/projects/99/annotate?task_id=1",
      ),
    ).toBe(99);
    expect(parseProjectIdFromPathname("/app/projects/77/annotate")).toBe(77);
    expect(parseProjectIdFromPathname("/projects//annotate")).toBeUndefined();
    expect(parseProjectIdFromPathname("/projects/1/tasks")).toBeUndefined();
  });

  it("falls back to the pathname when the route param is missing or blank", () => {
    expect(resolveEditorProjectId("2", "/projects/1/annotate")).toBe(2);
    expect(resolveEditorProjectId("", "/projects/1/annotate")).toBe(1);
    expect(resolveEditorProjectId(undefined, "/projects/1/annotate")).toBe(1);
    expect(
      resolveEditorProjectId(undefined, "/projects//annotate"),
    ).toBeUndefined();
  });

  it("keeps a backend-equivalent default project config for stalled config requests", () => {
    expect(DEFAULT_EDITOR_PROJECT_CONFIG).toEqual({
      frame_cache_size: 256,
      init_camera_position: { x: 0, y: 0, z: 100 },
      init_camera_target: { x: 0, y: 0, z: 0 },
    });
  });
});
