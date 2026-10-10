/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FrameState } from "../../../../../app/routes/editor/models";
import { ProjectConfig } from "../../../../../app/routes/editor/models";

import { EditorConfig } from "../../../../../app/routes/editor/config";
import { SceneContext } from "../../../../../app/routes/editor/scene/SceneContext";
import { EditorViews } from "../../../../../app/routes/editor/views";

function createFrame(
  id: number,
  taskId: number,
): Pick<FrameState, "id" | "task"> {
  return { id, task: { id: taskId } as unknown as FrameState["task"] };
}

/** A minimal stand-in for `FrameNavigator` that only tracks frame selection. */
function createFakeNav() {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const nav = {
    frame: null as Pick<FrameState, "id" | "task"> | null,
    sourceGroup: null,
    labelBranch: null,
    async loadFrame(
      frame: Pick<FrameState, "id" | "task"> | null,
    ): Promise<void> {
      nav.frame = frame;
    },
    addEventListener(type: string, listener: (event: unknown) => void): void {
      const set = listeners.get(type) ?? new Set<(event: unknown) => void>();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(
      type: string,
      listener: (event: unknown) => void,
    ): void {
      listeners.get(type)?.delete(listener);
    },
    dispose: vi.fn(),
  };

  return nav;
}

function createContext(nav: ReturnType<typeof createFakeNav>) {
  const views = new EditorViews({
    apiBaseUrl: "/editor",
    editorUrl: "/projects/1/annotate",
    projectId: 1,
  });
  const config = new EditorConfig(
    ProjectConfig.fromJSON({ frame_cache_size: 4 }),
  );

  return { views, context: new SceneContext(config, views, nav as never) };
}

describe("SceneContext frame URL synchronization", () => {
  beforeEach(() => {
    window.history.replaceState(
      null,
      "",
      "/projects/1/annotate?task_id=2&frame_id=3",
    );
  });

  it("deep-links the newly displayed frame without navigating the page", async () => {
    const nav = createFakeNav();
    const { context } = createContext(nav);
    const frame = createFrame(7, 4);
    const historyLength = window.history.length;

    await context.displayFrame(frame as never);

    expect(window.location.pathname).toBe("/projects/1/annotate");
    expect(new URL(window.location.href).searchParams.get("task_id")).toBe("4");
    expect(new URL(window.location.href).searchParams.get("frame_id")).toBe(
      "7",
    );
    expect(window.history.length).toBe(historyLength);
  });

  it("does not sync again when the same frame is displayed", async () => {
    const nav = createFakeNav();
    const { views, context } = createContext(nav);
    const frame = createFrame(7, 4);
    await context.displayFrame(frame as never);

    const syncEditorUrl = vi.spyOn(views, "syncEditorUrl");
    await context.displayFrame(frame as never);

    expect(syncEditorUrl).not.toHaveBeenCalled();
    syncEditorUrl.mockRestore();
  });

  it("drops the frame id when navigation clears the frame", async () => {
    const nav = createFakeNav();
    const { context } = createContext(nav);
    await context.displayFrame(createFrame(7, 4) as never);

    await context.displayFrame(null);

    const searchParams = new URL(window.location.href).searchParams;
    expect(searchParams.get("frame_id")).toBeNull();
    expect(searchParams.get("task_id")).toBe("4");
  });

  it("owns and idempotently disposes its bound display", async () => {
    const nav = createFakeNav();
    const { context } = createContext(nav);
    const display = { dispose: vi.fn() };
    await context.bindDisplay(display as never);

    context.dispose();
    context.dispose();

    expect(display.dispose).toHaveBeenCalledOnce();
    expect(nav.dispose).toHaveBeenCalledOnce();
  });
});
