/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { useBlocker } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useBlocker: vi.fn(() => ({ state: "unblocked" })),
}));

import {
  EditorRuntimeProvider,
  useEditorRuntime,
} from "../../../../app/routes/editor/EditorRuntimeProvider";
import { EditorRuntime } from "../../../../app/routes/editor/runtime";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../../../client", () => ({
  readFrameFramesIdGet: vi.fn().mockResolvedValue({ data: null, error: {} }),
}));

vi.mock("../../../../app/config", () => ({
  getPlugins: () => ({
    labels: {
      editor: {
        loader: vi.fn(),
        overlayDoms: [
          {
            key: "canvas",
            kind: "canvas",
            id: "labels-canvas",
            testId: "editor-layer-overlay-labels",
          },
        ],
      },
      routes: {},
    },
    masks: {
      editor: {
        loader: vi.fn(),
        overlayDoms: [
          {
            key: "canvas",
            kind: "canvas",
            id: "masks-canvas",
            testId: "editor-layer-overlay-masks",
          },
          { key: "brushCursor", kind: "div" },
        ],
      },
      routes: {},
    },
  }),
}));

vi.mock("../../../../app/routes/editor/app/App.react.tsx", () => ({
  AppViewComponent: ({
    app,
  }: {
    app: { getHintText: () => string };
  }): React.JSX.Element => (
    <div data-test="editor-app-view">{app.getHintText()}</div>
  ),
}));

function RuntimeStatus(): React.JSX.Element {
  const { error, runtime, status } = useEditorRuntime();
  return (
    <output>
      {error?.message ?? `${status}:${runtime == null ? "none" : "available"}`}
    </output>
  );
}

/**
 * Minimal event-source mocks for the parts of the runtime the editor state
 * store subscribes to, so lifecycle runtimes can exercise the store wiring.
 */
function mockEditorRuntimeSources() {
  const eventTarget = () => ({
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  const onSizeChange = (): void => {};
  return {
    context: { ...eventTarget(), currentLabelBranch: null },
    layersByKey: {},
    layers: {
      ...eventTarget(),
      allLayers: [],
      layerEntries: [],
      overlayModels: [
        { key: "labels", zIndex: 0, overlayView: null, onSizeChange },
        {
          key: "masks",
          zIndex: 0,
          overlayView: null,
          onSizeChange,
        },
      ],
    },
    app: { ...eventTarget(), hintText: null, getHintText: () => "" },
  };
}

afterEach((): void => {
  document.body.replaceChildren();
});

describe("EditorRuntimeProvider", () => {
  it("blocks client-side navigation exactly while the current branch is dirty", async () => {
    const sources = mockEditorRuntimeSources();
    const currentLabelBranch = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      hasUnsavedChanges: false,
      id: 1,
    };
    const runtime = {
      ...sources,
      context: { ...sources.context, currentLabelBranch },
      dispose: vi.fn(),
      mount: vi.fn().mockResolvedValue(undefined),
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async (): Promise<void> => {
      root.render(
        <EditorRuntimeProvider
          createRuntime={vi.fn().mockResolvedValue(runtime)}
          getLoadOptions={() => ({ mode: "annotate", projectId: 1 })}
          projectId={1}
        />,
      );
    });
    await act(async (): Promise<void> => {});

    const shouldBlock = vi.mocked(useBlocker).mock.calls.at(-1)?.[0];
    expect(shouldBlock).toBeTypeOf("function");
    expect((shouldBlock as () => boolean)()).toBe(false);

    currentLabelBranch.hasUnsavedChanges = true;
    expect((shouldBlock as () => boolean)()).toBe(true);

    await act(async (): Promise<void> => root.unmount());
  });

  it("covers the editor while the project runtime is loading", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const neverReady = new Promise<EditorRuntime>(() => {});

    await act(async (): Promise<void> => {
      root.render(
        <EditorRuntimeProvider
          createRuntime={vi.fn().mockReturnValue(neverReady)}
          getLoadOptions={() => ({ mode: "annotate", projectId: 1 })}
          projectId={1}
        />,
      );
    });

    const overlay = container.querySelector(
      '[data-test="project-loading-overlay"]',
    );
    expect(overlay?.textContent).toContain("Loading project");
    expect(overlay?.querySelector("progress")?.hasAttribute("value")).toBe(
      false,
    );

    await act(async (): Promise<void> => root.unmount());
  });

  it("shows frame-data loading only when the initial frame data actually starts loading", async () => {
    let resolveMount: (() => void) | undefined;
    let startFrameDataLoad: (() => void) | undefined;
    const dataViewListeners = new Map<string, Set<() => void>>();
    let downloadProgress = { loadedBytes: 0, totalBytes: 200 };
    const dataView = {
      isLoading: true,
      get downloadProgress() {
        return downloadProgress;
      },
      addEventListener: vi.fn((type: string, listener: () => void) => {
        const listeners = dataViewListeners.get(type) ?? new Set<() => void>();
        listeners.add(listener);
        dataViewListeners.set(type, listeners);
      }),
      removeEventListener: vi.fn((type: string, listener: () => void) => {
        dataViewListeners.get(type)?.delete(listener);
      }),
    };
    const sources = mockEditorRuntimeSources();
    const runtime = {
      ...sources,
      layers: {
        ...sources.layers,
        layerEntries: [
          { key: "data", layer: { name: "Source Data", dataView } },
        ],
      },
      dispose: vi.fn(),
      mount: vi.fn(
        (_options: unknown, hooks: { onFrameDataLoadStart: () => void }) =>
          new Promise<void>((resolve) => {
            resolveMount = resolve;
            startFrameDataLoad = hooks.onFrameDataLoadStart;
          }),
      ),
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async (): Promise<void> => {
      root.render(
        <EditorRuntimeProvider
          createRuntime={vi.fn().mockResolvedValue(runtime)}
          getLoadOptions={() => ({
            mode: "annotate",
            projectId: 1,
            frameId: 1,
          })}
          projectId={1}
        />,
      );
    });

    expect(runtime.mount).toHaveBeenCalledWith(
      { mode: "annotate", projectId: 1, frameId: 1 },
      expect.objectContaining({
        onFrameDataLoadStart: expect.any(Function),
      }),
    );
    expect(
      container.querySelector('[data-test="project-loading-overlay"]')
        ?.textContent,
    ).toContain("Preparing frame");
    expect(container.querySelector('[data-test="editor-app-view"]')).toBeNull();

    await act(async (): Promise<void> => startFrameDataLoad?.());
    const overlay = container.querySelector(
      '[data-test="project-loading-overlay"]',
    );
    expect(overlay?.textContent).toContain("Loading frame data");
    expect(overlay?.textContent).not.toContain("Loading project");
    expect(
      overlay?.querySelector("progress")?.getAttribute("aria-label"),
    ).toContain("Source Data:");
    expect(container.querySelector('[data-test="editor-app-view"]')).toBeNull();
    expect(overlay?.textContent).toContain("Source Data");
    expect(overlay?.textContent).toContain("0%");

    await act(async (): Promise<void> => {
      downloadProgress = { loadedBytes: 100, totalBytes: 200 };
      for (const listener of dataViewListeners.get("progress") ?? [])
        listener();
    });
    expect(
      container.querySelector('[data-test="project-loading-overlay"]')
        ?.textContent,
    ).toContain("50%");

    await act(async (): Promise<void> => resolveMount?.());
    expect(
      container.querySelector('[data-test="project-loading-overlay"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-test="editor-app-view"]'),
    ).not.toBeNull();

    await act(async (): Promise<void> => root.unmount());
  });

  it("binds layers before loading the frame selected by the initial URL", async () => {
    const beforeLoadListeners = new Set<() => void>();
    const context = {
      bindLayers: vi.fn().mockResolvedValue(undefined),
      views: {},
      tasks: { elements: [{ id: 1 }] },
      currentTaskId: 1,
      sourceGroups: { elements: [] },
      labelBranches: { elements: [] },
      frames: [],
      displayTaskSelectors: vi.fn().mockResolvedValue(undefined),
      displayTaskById: vi.fn().mockResolvedValue(undefined),
      displaySourceGroup: vi.fn().mockResolvedValue(undefined),
      displayLabelBranch: vi.fn().mockResolvedValue(undefined),
      displayFrame: vi.fn().mockResolvedValue(undefined),
      displaySceneSelection: vi.fn(async (): Promise<void> => {
        for (const listener of beforeLoadListeners) listener();
      }),
    };
    const app = {
      dispose: vi.fn(),
      context,
      menus: {
        project: {
          playback: {
            sortFunc: {
              sortedFrames: (frames: unknown[]) => frames,
            },
          },
        },
      },
    };
    const layers = {
      dataLayers: [
        {
          dataView: {
            addEventListener: vi.fn(
              (_type: "beforeload", listener: () => void) =>
                beforeLoadListeners.add(listener),
            ),
            removeEventListener: vi.fn(
              (_type: "beforeload", listener: () => void) =>
                beforeLoadListeners.delete(listener),
            ),
          },
        },
      ],
    };
    const onFrameDataLoadStart = vi.fn();
    const runtime = new EditorRuntime({
      app,
      context,
      layers,
      layersByKey: {},
    } as never);

    const notice = await runtime.mount(
      { mode: "annotate", projectId: 1, taskId: 1, frameId: 1 },
      { onFrameDataLoadStart },
    );

    expect(context.bindLayers).toHaveBeenCalledWith(layers);
    // The initial-data load starts through the context's display path; it
    // must only run after the layers are bound. The task step loads the scene
    // without displaying a frame, so the frame itself arrives with the scene
    // selection that follows it.
    expect(context.displayTaskSelectors).toHaveBeenCalledWith({ id: 1 });
    expect(onFrameDataLoadStart).toHaveBeenCalledOnce();
    expect(beforeLoadListeners.size).toBe(0);
    expect(context.bindLayers.mock.invocationCallOrder[0]).toBeLessThan(
      context.displayTaskSelectors.mock.invocationCallOrder[0],
    );
    // The frame the URL asked for could not be read. The runtime does not
    // present that itself: it hands the message to its caller, which owns the
    // notification UI.
    expect(notice).toBe("Frame 1 could not be loaded. No frame is open.");
  });

  it("renders the runtime App directly through the route-owned React tree", async () => {
    const sources = mockEditorRuntimeSources();
    const app = {
      ...sources.app,
      getHintText: () => "App mounted",
    };
    const runtime = {
      app,
      context: sources.context,
      layers: sources.layers,
      layersByKey: {},
      dispose: vi.fn(),
      mount: vi.fn().mockResolvedValue(undefined),
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    document.body.append(container);

    await act(async (): Promise<void> => {
      root.render(
        <EditorRuntimeProvider
          createRuntime={vi.fn().mockResolvedValue(runtime)}
          getLoadOptions={() => ({ mode: "annotate", projectId: 1 })}
          projectId={1}
        />,
      );
    });
    await act(async (): Promise<void> => {});

    expect(
      container.querySelector('[data-test="editor-app-view"]')?.textContent,
    ).toBe("App mounted");

    await act(async (): Promise<void> => root.unmount());
    expect(runtime.dispose).toHaveBeenCalledOnce();
  });

  it("passes React-mounted display and label-layer elements into runtime creation before mounting", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const runtime = {
      ...mockEditorRuntimeSources(),
      dispose: vi.fn(),
      mount: vi.fn().mockResolvedValue(undefined),
    };
    const createRuntime = vi.fn().mockResolvedValue(runtime);

    await act(async (): Promise<void> => {
      root.render(
        <EditorRuntimeProvider
          createRuntime={createRuntime}
          getLoadOptions={() => ({ mode: "annotate", projectId: 1 })}
          projectId={1}
        />,
      );
    });

    expect(container.querySelector("#labels-canvas")).toBeInstanceOf(
      HTMLCanvasElement,
    );
    expect(container.querySelector("#masks-canvas")).toBeInstanceOf(
      HTMLCanvasElement,
    );
    expect(container.querySelector("#masks-canvas + div")).toBeInstanceOf(
      HTMLDivElement,
    );
    expect(createRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        elements: expect.objectContaining({
          canvas: container.querySelector("#display-container canvas"),
          displayDom: container.querySelector("#display-container"),
          mainWindowDom: container.querySelector("#main-window"),
          minimapWindowDom: container.querySelector("#minimap-window"),
          overlayDoms: {
            labels: {
              canvas: container.querySelector("#labels-canvas"),
            },
            masks: {
              canvas: container.querySelector("#masks-canvas"),
              brushCursor: container.querySelector("#masks-canvas + div"),
            },
          },
        }),
      }),
    );
    expect(runtime.mount.mock.invocationCallOrder[0]).toBeGreaterThan(
      createRuntime.mock.invocationCallOrder[0],
    );

    await act(async (): Promise<void> => root.unmount());
    expect(runtime.dispose).toHaveBeenCalledOnce();
  });

  it("renders overlay slot views contributed by plugin layers and refreshes them on overlay-change", async () => {
    const overlayListeners = new Set<() => void>();
    let cursorLabel = "cursor-v1";
    const maskLayer = {
      addEventListener: vi.fn(
        (eventType: string, listener: () => void): void => {
          if (eventType === "overlay-change") overlayListeners.add(listener);
        },
      ),
      removeEventListener: vi.fn(
        (eventType: string, listener: () => void): void => {
          overlayListeners.delete(listener);
        },
      ),
      get editorOverlayViews(): Record<string, React.ReactNode> {
        return {
          brushCursor: <span data-test="brush-cursor-view">{cursorLabel}</span>,
        };
      },
    };
    const runtime = {
      ...mockEditorRuntimeSources(),
      layersByKey: { masks: maskLayer },
      dispose: vi.fn(),
      mount: vi.fn().mockResolvedValue(undefined),
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async (): Promise<void> => {
      root.render(
        <EditorRuntimeProvider
          createRuntime={vi.fn().mockResolvedValue(runtime)}
          getLoadOptions={() => ({ mode: "annotate", projectId: 1 })}
          projectId={1}
        />,
      );
    });

    // The contributed view renders inside the plugin's declared slot DOM.
    const brushCursorHost = container.querySelector("#masks-canvas + div");
    expect(maskLayer.addEventListener).toHaveBeenCalledWith(
      "overlay-change",
      expect.any(Function),
    );
    expect(
      brushCursorHost?.querySelector('[data-test="brush-cursor-view"]')
        ?.textContent,
    ).toBe("cursor-v1");

    await act(async (): Promise<void> => {
      cursorLabel = "cursor-v2";
      for (const listener of [...overlayListeners]) listener();
    });
    expect(
      brushCursorHost?.querySelector('[data-test="brush-cursor-view"]')
        ?.textContent,
    ).toBe("cursor-v2");

    await act(async (): Promise<void> => root.unmount());
    expect(maskLayer.removeEventListener).toHaveBeenCalledWith(
      "overlay-change",
      expect.any(Function),
    );
    expect(overlayListeners.size).toBe(0);
    expect(runtime.dispose).toHaveBeenCalledOnce();
  });

  it("creates, mounts, exposes, and disposes the route-owned runtime", async () => {
    const runtime = {
      ...mockEditorRuntimeSources(),
      dispose: vi.fn(),
      mount: vi.fn().mockResolvedValue(undefined),
    };
    const createRuntime = vi.fn().mockResolvedValue(runtime);
    const getLoadOptions = vi.fn(() => ({
      mode: "annotate" as const,
      projectId: 7,
      taskId: 3,
    }));
    const container = document.createElement("div");
    const root = createRoot(container);
    document.body.appendChild(container);

    await act(async (): Promise<void> => {
      root.render(
        <EditorRuntimeProvider
          createRuntime={createRuntime}
          getLoadOptions={getLoadOptions}
          projectId={7}
        >
          <RuntimeStatus />
        </EditorRuntimeProvider>,
      );
    });

    expect(createRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        elements: expect.objectContaining({
          canvas: expect.any(HTMLCanvasElement),
          displayDom: expect.any(HTMLDivElement),
          mainWindowDom: expect.any(HTMLDivElement),
          minimapWindowDom: expect.any(HTMLDivElement),
        }),
        initialProjectConfig: undefined,
        projectId: 7,
      }),
    );
    expect(container.querySelector("#display-container canvas")).not.toBeNull();
    expect(container.querySelector("#overlays-container")).not.toBeNull();
    expect(
      container.querySelectorAll('[data-test^="editor-layer-overlay-"]'),
    ).toHaveLength(2);
    expect(runtime.mount).toHaveBeenCalledWith(
      { mode: "annotate", projectId: 7, taskId: 3 },
      expect.objectContaining({
        onFrameDataLoadStart: expect.any(Function),
      }),
    );
    expect(container.querySelector("output")?.textContent).toBe(
      "ready:available",
    );

    await act(async (): Promise<void> => {
      root.unmount();
    });
    expect(runtime.dispose).toHaveBeenCalledOnce();
  });

  it("exposes runtime initialization failures to route-level React UI", async () => {
    const createRuntime = vi
      .fn()
      .mockRejectedValue(new Error("Unable to initialize"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const container = document.createElement("div");
    const root = createRoot(container);
    document.body.appendChild(container);

    await act(async (): Promise<void> => {
      root.render(
        <EditorRuntimeProvider
          createRuntime={createRuntime}
          getLoadOptions={() => ({ mode: "annotate", projectId: 7 })}
          projectId={7}
        >
          <RuntimeStatus />
        </EditorRuntimeProvider>,
      );
    });

    expect(container.querySelector("output")?.textContent).toBe(
      "Unable to initialize",
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Unable to initialize",
    );
    expect(consoleError).toHaveBeenCalledWith(
      "Unable to initialize annotation editor",
      expect.any(Error),
    );

    await act(async (): Promise<void> => {
      root.unmount();
    });
    consoleError.mockRestore();
  });

  it("toasts a frame the initial load could not open", async () => {
    const runtime = {
      ...mockEditorRuntimeSources(),
      dispose: vi.fn(),
      mount: vi
        .fn()
        .mockResolvedValue(
          "Frame 24508 could not be loaded. Showing frame 130 instead.",
        ),
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    document.body.appendChild(container);

    await act(async (): Promise<void> => {
      root.render(
        <EditorRuntimeProvider
          createRuntime={vi.fn().mockResolvedValue(runtime)}
          getLoadOptions={() => ({
            mode: "annotate",
            projectId: 7,
            frameId: 24508,
          })}
          projectId={7}
        >
          <RuntimeStatus />
        </EditorRuntimeProvider>,
      );
    });

    const toast = container.querySelector(".toast");
    expect(toast?.textContent).toContain(
      "Frame 24508 could not be loaded. Showing frame 130 instead.",
    );
    // A notice about the initial load never replaces the application's own
    // hint: the runtime is reported ready and its hint stays untouched.
    expect(container.querySelector("output")?.textContent).toBe(
      "ready:available",
    );

    await act(async (): Promise<void> => {
      root.unmount();
    });
  });

  it("shows no toast when the initial load opened the requested frame", async () => {
    const runtime = {
      ...mockEditorRuntimeSources(),
      dispose: vi.fn(),
      mount: vi.fn().mockResolvedValue(null),
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    document.body.appendChild(container);

    await act(async (): Promise<void> => {
      root.render(
        <EditorRuntimeProvider
          createRuntime={vi.fn().mockResolvedValue(runtime)}
          getLoadOptions={() => ({
            mode: "annotate",
            projectId: 7,
            frameId: 42,
          })}
          projectId={7}
        >
          <RuntimeStatus />
        </EditorRuntimeProvider>,
      );
    });

    expect(container.querySelector(".toast")).toBeNull();

    await act(async (): Promise<void> => {
      root.unmount();
    });
  });

  it("disposes a runtime when mounting it fails", async () => {
    const runtime = {
      ...mockEditorRuntimeSources(),
      dispose: vi.fn(),
      mount: vi.fn().mockRejectedValue(new Error("Unable to mount")),
    };
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const container = document.createElement("div");
    const root = createRoot(container);
    document.body.appendChild(container);

    await act(async (): Promise<void> => {
      root.render(
        <EditorRuntimeProvider
          createRuntime={vi.fn().mockResolvedValue(runtime)}
          getLoadOptions={() => ({ mode: "annotate", projectId: 7 })}
          projectId={7}
        >
          <RuntimeStatus />
        </EditorRuntimeProvider>,
      );
    });

    expect(runtime.dispose).toHaveBeenCalledOnce();
    expect(container.querySelector("output")?.textContent).toBe(
      "Unable to mount",
    );

    await act(async (): Promise<void> => {
      root.unmount();
    });
    consoleError.mockRestore();
  });

  it("replaces the runtime when the route project changes", async () => {
    const firstRuntime = {
      ...mockEditorRuntimeSources(),
      dispose: vi.fn(),
      mount: vi.fn().mockResolvedValue(undefined),
    };
    const secondRuntime = {
      ...mockEditorRuntimeSources(),
      dispose: vi.fn(),
      mount: vi.fn().mockResolvedValue(undefined),
    };
    const createRuntime = vi
      .fn()
      .mockResolvedValueOnce(firstRuntime)
      .mockResolvedValueOnce(secondRuntime);
    let currentProjectId = 7;
    const getLoadOptions = vi.fn(() => ({
      mode: "annotate" as const,
      projectId: currentProjectId,
    }));
    const container = document.createElement("div");
    const root = createRoot(container);
    document.body.appendChild(container);

    await act(async (): Promise<void> => {
      root.render(
        <EditorRuntimeProvider
          createRuntime={createRuntime}
          getLoadOptions={getLoadOptions}
          projectId={7}
        >
          <RuntimeStatus />
        </EditorRuntimeProvider>,
      );
    });

    await act(async (): Promise<void> => {
      currentProjectId = 8;
      root.render(
        <EditorRuntimeProvider
          createRuntime={createRuntime}
          getLoadOptions={getLoadOptions}
          projectId={8}
        >
          <RuntimeStatus />
        </EditorRuntimeProvider>,
      );
    });

    expect(firstRuntime.dispose).toHaveBeenCalledOnce();
    expect(secondRuntime.mount).toHaveBeenCalledWith(
      { mode: "annotate", projectId: 8 },
      expect.objectContaining({
        onFrameDataLoadStart: expect.any(Function),
      }),
    );
    expect(container.querySelector("output")?.textContent).toBe(
      "ready:available",
    );

    await act(async (): Promise<void> => {
      root.unmount();
    });
    expect(secondRuntime.dispose).toHaveBeenCalledOnce();
  });

  it("disposes a runtime exactly once when unmounting while its mount is pending", async () => {
    let resolveMount: (() => void) | undefined;
    const runtime = {
      ...mockEditorRuntimeSources(),
      dispose: vi.fn(),
      mount: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveMount = resolve;
          }),
      ),
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    document.body.appendChild(container);

    await act(async (): Promise<void> => {
      root.render(
        <EditorRuntimeProvider
          createRuntime={vi.fn().mockResolvedValue(runtime)}
          getLoadOptions={() => ({ mode: "annotate", projectId: 7 })}
          projectId={7}
        />,
      );
    });
    expect(runtime.mount).toHaveBeenCalledOnce();

    await act(async (): Promise<void> => root.unmount());
    expect(runtime.dispose).toHaveBeenCalledTimes(1);

    // The pending mount settles after disposal; it must not dispose again.
    await act(async (): Promise<void> => {
      resolveMount?.();
    });
    expect(runtime.dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes a runtime exactly once when unmounting while its mount is failing", async () => {
    let rejectMount: ((error: Error) => void) | undefined;
    const runtime = {
      ...mockEditorRuntimeSources(),
      dispose: vi.fn(),
      mount: vi.fn(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectMount = reject;
          }),
      ),
    };
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const container = document.createElement("div");
    const root = createRoot(container);
    document.body.appendChild(container);

    await act(async (): Promise<void> => {
      root.render(
        <EditorRuntimeProvider
          createRuntime={vi.fn().mockResolvedValue(runtime)}
          getLoadOptions={() => ({ mode: "annotate", projectId: 7 })}
          projectId={7}
        />,
      );
    });

    await act(async (): Promise<void> => root.unmount());
    expect(runtime.dispose).toHaveBeenCalledTimes(1);

    // The stale failure must not dispose again nor surface as an error.
    await act(async (): Promise<void> => {
      rejectMount?.(new Error("stale mount failure"));
    });
    expect(runtime.dispose).toHaveBeenCalledTimes(1);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("disposes a runtime created after unmount without mounting it", async () => {
    let resolveRuntime: ((runtime: unknown) => void) | undefined;
    const runtime = {
      ...mockEditorRuntimeSources(),
      dispose: vi.fn(),
      mount: vi.fn().mockResolvedValue(undefined),
    };
    const createRuntime = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveRuntime = resolve;
        }),
    );
    const container = document.createElement("div");
    const root = createRoot(container);
    document.body.appendChild(container);

    await act(async (): Promise<void> => {
      root.render(
        <EditorRuntimeProvider
          createRuntime={createRuntime}
          getLoadOptions={() => ({ mode: "annotate", projectId: 7 })}
          projectId={7}
        />,
      );
    });
    expect(createRuntime).toHaveBeenCalledOnce();

    await act(async (): Promise<void> => root.unmount());

    // The runtime finishes initializing after the route is gone.
    await act(async (): Promise<void> => {
      resolveRuntime?.(runtime);
    });
    expect(runtime.mount).not.toHaveBeenCalled();
    expect(runtime.dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes a superseded runtime exactly once when the project changes mid-mount", async () => {
    let resolveFirstMount: (() => void) | undefined;
    const firstRuntime = {
      ...mockEditorRuntimeSources(),
      dispose: vi.fn(),
      mount: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveFirstMount = resolve;
          }),
      ),
    };
    const secondRuntime = {
      ...mockEditorRuntimeSources(),
      dispose: vi.fn(),
      mount: vi.fn().mockResolvedValue(undefined),
    };
    const createRuntime = vi
      .fn()
      .mockResolvedValueOnce(firstRuntime)
      .mockResolvedValueOnce(secondRuntime);
    let currentProjectId = 7;
    const getLoadOptions = vi.fn(() => ({
      mode: "annotate" as const,
      projectId: currentProjectId,
    }));
    const container = document.createElement("div");
    const root = createRoot(container);
    document.body.appendChild(container);

    await act(async (): Promise<void> => {
      root.render(
        <EditorRuntimeProvider
          createRuntime={createRuntime}
          getLoadOptions={getLoadOptions}
          projectId={7}
        >
          <RuntimeStatus />
        </EditorRuntimeProvider>,
      );
    });
    expect(firstRuntime.mount).toHaveBeenCalledOnce();

    // The project changes while the first runtime is still mounting.
    await act(async (): Promise<void> => {
      currentProjectId = 8;
      root.render(
        <EditorRuntimeProvider
          createRuntime={createRuntime}
          getLoadOptions={getLoadOptions}
          projectId={8}
        >
          <RuntimeStatus />
        </EditorRuntimeProvider>,
      );
    });
    expect(firstRuntime.dispose).toHaveBeenCalledTimes(1);
    expect(secondRuntime.mount).toHaveBeenCalledWith(
      { mode: "annotate", projectId: 8 },
      expect.objectContaining({
        onFrameDataLoadStart: expect.any(Function),
      }),
    );
    expect(container.querySelector("output")?.textContent).toBe(
      "ready:available",
    );

    // The stale first mount settles late: no second dispose, no state leak
    // into the replacement runtime's snapshot.
    await act(async (): Promise<void> => {
      resolveFirstMount?.();
    });
    expect(firstRuntime.dispose).toHaveBeenCalledTimes(1);
    expect(secondRuntime.dispose).not.toHaveBeenCalled();
    expect(container.querySelector("output")?.textContent).toBe(
      "ready:available",
    );

    await act(async (): Promise<void> => root.unmount());
    expect(firstRuntime.dispose).toHaveBeenCalledTimes(1);
    expect(secondRuntime.dispose).toHaveBeenCalledTimes(1);
  });

  it("does not surface a superseded runtime mount failure as the replacement error", async () => {
    let rejectFirstMount: ((error: Error) => void) | undefined;
    const firstRuntime = {
      ...mockEditorRuntimeSources(),
      dispose: vi.fn(),
      mount: vi.fn(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectFirstMount = reject;
          }),
      ),
    };
    const secondRuntime = {
      ...mockEditorRuntimeSources(),
      dispose: vi.fn(),
      mount: vi.fn().mockResolvedValue(undefined),
    };
    const createRuntime = vi
      .fn()
      .mockResolvedValueOnce(firstRuntime)
      .mockResolvedValueOnce(secondRuntime);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    let currentProjectId = 7;
    const getLoadOptions = vi.fn(() => ({
      mode: "annotate" as const,
      projectId: currentProjectId,
    }));
    const container = document.createElement("div");
    const root = createRoot(container);
    document.body.appendChild(container);

    await act(async (): Promise<void> => {
      root.render(
        <EditorRuntimeProvider
          createRuntime={createRuntime}
          getLoadOptions={getLoadOptions}
          projectId={7}
        >
          <RuntimeStatus />
        </EditorRuntimeProvider>,
      );
    });

    await act(async (): Promise<void> => {
      currentProjectId = 8;
      root.render(
        <EditorRuntimeProvider
          createRuntime={createRuntime}
          getLoadOptions={getLoadOptions}
          projectId={8}
        >
          <RuntimeStatus />
        </EditorRuntimeProvider>,
      );
    });
    expect(container.querySelector("output")?.textContent).toBe(
      "ready:available",
    );

    // The stale failure of the replaced runtime must not become the
    // replacement's error state.
    await act(async (): Promise<void> => {
      rejectFirstMount?.(new Error("superseded mount failure"));
    });
    expect(firstRuntime.dispose).toHaveBeenCalledTimes(1);
    expect(container.querySelector("output")?.textContent).toBe(
      "ready:available",
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();

    await act(async (): Promise<void> => root.unmount());
    consoleError.mockRestore();
  });

  it("does not expose the runtime until initial data has loaded", async () => {
    let resolveMount: (() => void) | undefined;
    const runtime = {
      ...mockEditorRuntimeSources(),
      dispose: vi.fn(),
      mount: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveMount = resolve;
          }),
      ),
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    document.body.appendChild(container);

    await act(async (): Promise<void> => {
      root.render(
        <EditorRuntimeProvider
          createRuntime={vi.fn().mockResolvedValue(runtime)}
          getLoadOptions={() => ({ mode: "annotate", projectId: 7 })}
          projectId={7}
        >
          <RuntimeStatus />
        </EditorRuntimeProvider>,
      );
    });

    expect(runtime.mount).toHaveBeenCalledOnce();
    expect(container.querySelector("output")?.textContent).toBe("loading:none");

    await act(async (): Promise<void> => {
      resolveMount?.();
    });
    expect(container.querySelector("output")?.textContent).toBe(
      "ready:available",
    );

    await act(async (): Promise<void> => {
      root.unmount();
    });
    expect(runtime.dispose).toHaveBeenCalledOnce();
  });
});
