/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EditorStoreProvider,
  useEditorSelector,
} from "../../../../../app/routes/editor/store";
import { useEditorStoreRuntime } from "../../../../../app/routes/editor/store/useEditorStoreRuntime";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function eventTarget() {
  return {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

/** A layer contributing a plain `{ version }` slice under `layers.testbox`. */
function createContributorLayer() {
  let version = 0;
  let listener: (() => void) | null = null;
  return {
    layer: {
      name: "Test Box",
      state: { enabled: true },
      mapEditorSlice: (): { version: number } => ({ version }),
      subscribeEditorSlice(next: () => void): () => void {
        listener = next;
        return (): void => {
          listener = null;
        };
      },
    },
    bump(): void {
      version += 1;
      listener?.();
    },
    hasSubscriber(): boolean {
      return listener != null;
    },
  };
}

function createRuntimeStub(
  contributor: ReturnType<typeof createContributorLayer>,
) {
  return {
    context: {
      ...eventTarget(),
      tasks: { elements: [] },
      sourceGroups: { elements: [] },
      labelBranches: { elements: [] },
      frames: { elements: [] },
      currentTaskId: null,
      currentSourceGroupId: null,
      currentLabelBranchId: null,
      currentFrameId: null,
      currentFrame: null,
      currentLabelBranch: null,
      isNavigating: false,
      currentXBounds: null,
      currentYBounds: null,
      currentZBounds: null,
      currentTBounds: null,
      views: { projectId: 1 },
    },
    layers: {
      ...eventTarget(),
      allLayers: [],
      layerEntries: [{ key: "testbox", layer: contributor.layer }],
      labelDataLayers: [contributor.layer],
      activeLayer: null,
    },
    app: { ...eventTarget(), hintText: null },
  };
}

function SliceProbe(): React.JSX.Element {
  const version = useEditorSelector<{ testbox: { version: number } }, number>(
    (state) => state.layers.testbox.version,
  );
  return <output data-test="slice-version">{version}</output>;
}

function Harness({ runtime }: { runtime: unknown }): React.JSX.Element {
  const store = useEditorStoreRuntime(runtime as never);
  if (store == null) return <output data-test="no-store" />;
  return (
    <EditorStoreProvider store={store}>
      <SliceProbe />
    </EditorStoreProvider>
  );
}

/** An event target that records listeners per type so tests can dispatch. */
function eventfulEventTarget() {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  return {
    addEventListener(type: string, listener: (event: unknown) => void): void {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(
      type: string,
      listener: (event: unknown) => void,
    ): void {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent(event: { type: string }): void {
      for (const listener of listeners.get(event.type) ?? []) listener(event);
    },
  };
}

function mockLabelBranch(id: number, hasUnsavedChanges: boolean) {
  return {
    id,
    hasUnsavedChanges,
    isUpdating: false,
    getHistory: () => [],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

/** A runtime stub whose context can dispatch events, for wiring tests. */
function createLabelsetRuntimeStub() {
  const branchA = mockLabelBranch(100, false);
  const branchB = mockLabelBranch(200, true);
  const context = {
    ...eventfulEventTarget(),
    tasks: { elements: [] },
    sourceGroups: { elements: [] },
    labelBranches: { elements: [branchA, branchB] },
    frames: { elements: [] },
    currentTaskId: null,
    currentSourceGroupId: null,
    currentLabelBranchId: 100,
    currentFrameId: null,
    currentFrame: null,
    currentLabelBranch: branchA,
    isNavigating: false,
    currentXBounds: null,
    currentYBounds: null,
    currentZBounds: null,
    currentTBounds: null,
    views: { projectId: 1 },
  };
  const runtime = {
    context,
    layers: {
      ...eventTarget(),
      allLayers: [],
      layerEntries: [],
      labelDataLayers: [],
      activeLayer: null,
    },
    app: { ...eventTarget(), hintText: null },
  };
  return { context, branchA, branchB, runtime };
}

interface LabelsetProbeState {
  labelset: { unsavedBranchIds: Set<number> };
}

function LabelsetProbe(): React.JSX.Element {
  const unsaved = useEditorSelector<LabelsetProbeState, string>((state) =>
    [...state.labelset.unsavedBranchIds].sort((a, b) => a - b).join(","),
  );
  return <output data-test="unsaved-branches">{unsaved}</output>;
}

function LabelsetHarness({ runtime }: { runtime: unknown }): React.JSX.Element {
  const store = useEditorStoreRuntime(runtime as never);
  if (store == null) return <output data-test="no-store" />;
  return (
    <EditorStoreProvider store={store}>
      <LabelsetProbe />
    </EditorStoreProvider>
  );
}

afterEach((): void => {
  document.body.replaceChildren();
});

describe("useEditorStoreRuntime", () => {
  it("merges contributor slices and invalidates them through their subscription", async () => {
    const contributor = createContributorLayer();
    const runtime = createRuntimeStub(contributor);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async (): Promise<void> => {
      root.render(<Harness runtime={runtime} />);
    });

    expect(contributor.hasSubscriber()).toBe(true);
    expect(
      container.querySelector('[data-test="slice-version"]')?.textContent,
    ).toBe("0");

    await act(async (): Promise<void> => {
      contributor.bump();
    });
    expect(
      container.querySelector('[data-test="slice-version"]')?.textContent,
    ).toBe("1");

    await act(async (): Promise<void> => {
      root.unmount();
    });
    expect(contributor.hasSubscriber()).toBe(false);
  });

  it("refreshes the unsaved-branch indicators when another branch reports edit-branch", async () => {
    // The user is on branch 100; branch 200 is dirty and settles a
    // background save, which dispatches `edit-branch` on the context.
    const { context, branchB, runtime } = createLabelsetRuntimeStub();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async (): Promise<void> => {
      root.render(<LabelsetHarness runtime={runtime} />);
    });
    expect(
      container.querySelector('[data-test="unsaved-branches"]')?.textContent,
    ).toBe("200");

    await act(async (): Promise<void> => {
      branchB.hasUnsavedChanges = false;
      context.dispatchEvent({ type: "edit-branch" });
    });
    expect(
      container.querySelector('[data-test="unsaved-branches"]')?.textContent,
    ).toBe("");

    await act(async (): Promise<void> => {
      root.unmount();
    });
  });
});
