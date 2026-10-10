/* @vitest-environment jsdom */

import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderTestView as renderView } from "../../../../../../lib/common/lib/testing/react";

import { ProjectMenuView } from "../../../../../../app/routes/editor/app/widgets/ProjectMenu.react.tsx";
import { ProjectMenu } from "../../../../../../app/routes/editor/app/widgets/ProjectMenu.tsx";
import { HistoryItemStatus } from "../../../../../../app/routes/editor/labelset";
import { EditorIntentsProvider } from "../../../../../../app/routes/editor/store/EditorIntents.react.tsx";
import { EditorStoreProvider } from "../../../../../../app/routes/editor/store/EditorStore.react.tsx";
import { createEditorIntents } from "../../../../../../app/routes/editor/store/createEditorIntents";
import { createEditorStore } from "../../../../../../app/routes/editor/store/createEditorStore";
import { createEditorMapper } from "../../../../../../app/routes/editor/store/mapEditorState";
import {
  createEditableFrame,
  heldFrameStatusUpdates,
} from "./frameStatusFixtures";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView = vi.fn();

class EventSource {
  #listeners = new Map<string, Set<(event: any) => void>>();
  [key: string]: any;

  addEventListener(type: string, listener: (event: any) => void) {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: any) => void) {
    this.#listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: { type: string }) {
    for (const listener of this.#listeners.get(event.type) ?? []) {
      listener(event);
    }
  }
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("ProjectMenu", () => {
  function createFrame(id: any, isComplete: any = false) {
    return {
      id,
      is_complete: isComplete,
      hash: () => String(id),
      getSpatialCenter: () => ({ x: id, y: id + 1, z: id + 2 }),
      getTimestampCenter: () => id + 3,
      async updateIsComplete(nextIsComplete: any) {
        this.is_complete = nextIsComplete;
      },
    };
  }

  function createBranch(
    id: any,
    name: any,
    { hasUnsavedChanges = true, isUpdating = false } = {},
  ) {
    const branch = new EventSource();
    branch.id = id;
    branch.name = name;
    branch.hasUnsavedChanges = hasUnsavedChanges;
    branch.isUpdating = isUpdating;
    branch.pushedTaskIds = [];
    branch.rebasedIds = [];
    branch.history = [
      {
        id: id * 10,
        name: name + " base",
        details: name + " base details",
        status: HistoryItemStatus.INACTIVE,
        isCurrent: false,
        isSavepoint: true,
        equals(other: any) {
          return other?.id === this.id;
        },
      },
      {
        id: id * 10 + 1,
        name: name + " edit",
        details: name + " edit details",
        status: HistoryItemStatus.ACTIVE,
        isCurrent: true,
        isSavepoint: false,
        equals(other: any) {
          return other?.id === this.id;
        },
      },
    ];
    branch.getHistory = () => branch.history;
    branch.pushActive = (taskId: any) => {
      branch.pushedTaskIds.push(taskId);
      return Promise.resolve();
    };
    branch.rebase = async (historyId: any) => {
      branch.rebasedIds.push(historyId);
    };
    return branch;
  }

  class TestSceneContext extends EventSource {
    constructor({ tasks, sourceGroups, labelBranches, frames }: any) {
      super();
      this.tasks = { elements: tasks };
      this.sourceGroups = { elements: sourceGroups };
      this.labelBranches = { elements: labelBranches };
      this.frames = {
        elements: frames,
        axes: {
          xb: { getValue: (frame: any) => ({ center: frame.id }) },
          yb: {
            getValue: (frame: any) => ({ center: frame.id + 1 }),
          },
          zb: {
            getValue: (frame: any) => ({ center: frame.id + 2 }),
          },
          tb: {
            getValue: (frame: any) => ({ center: frame.id + 3 }),
          },
        },
      };
      this.currentTask = tasks[0] ?? null;
      this.currentTaskId = this.currentTask?.id ?? null;
      this.currentSourceGroup = sourceGroups[0] ?? null;
      this.currentSourceGroupId = this.currentSourceGroup?.id ?? null;
      this.currentLabelBranch = labelBranches[0] ?? null;
      this.currentLabelBranchId = this.currentLabelBranch?.id ?? null;
      this.currentFrame = frames[0] ?? null;
      this.currentFrameId = this.currentFrame?.id ?? null;
      this.currentXBounds = { min: 0, max: 1 };
      this.currentYBounds = { min: 2, max: 3 };
      this.currentZBounds = { min: 4, max: 5 };
      this.currentTBounds = { min: 6, max: 7 };
      this.isNavigating = false;
      this.config = { frameCacheSize: 4 };
      this.displayedFrames = [];
      this.views = { projectId: 1 };
    }

    async displayTaskById(taskId: any) {
      const task =
        this.tasks.elements.find((candidate: any) => candidate.id === taskId) ??
        null;
      this.currentTask = task;
      this.currentTaskId = task?.id ?? null;
      this.dispatchEvent({ type: "nav-source-group" });
    }

    async displaySourceGroup(sourceGroup: any) {
      this.currentSourceGroup = sourceGroup;
      this.currentSourceGroupId = sourceGroup?.id ?? null;
      this.dispatchEvent({ type: "nav-source-group" });
    }

    async displayLabelBranch(labelBranch: any) {
      this.currentLabelBranch = labelBranch;
      this.currentLabelBranchId = labelBranch?.id ?? null;
      this.dispatchEvent({ type: "nav-label-branch" });
    }

    async displayFrame(frame: any) {
      this.currentFrame = frame;
      this.displayedFrames.push(frame);
      this.dispatchEvent({ type: "nav-frame" });
    }

    async requireFrame() {}
  }

  function getProjectTab(host: Element, title: string) {
    return [...host.querySelectorAll(".tp-tbiv")]
      .find((tab) => tab.querySelector(".tp-tbiv_t")?.textContent === title)
      ?.querySelector("button");
  }

  function createProjectContext() {
    const tasks = [
      { id: 1, name: "Task One" },
      { id: 2, name: "Task Two" },
    ];
    const sourceGroups = [
      { id: 10, name: "Group One" },
      { id: 11, name: "Group Two" },
    ];
    const labelBranches = [
      createBranch(20, "Branch One"),
      createBranch(21, "Branch Two"),
    ];
    const frames = [createFrame(100), createFrame(101, true)];

    return new TestSceneContext({
      tasks,
      sourceGroups,
      labelBranches,
      frames,
    });
  }

  it("keeps frame navigation keybinds owned by ProjectMenu", async () => {
    const context = createProjectContext();
    let menu: ProjectMenu | undefined;

    await act(async () => {
      menu = new ProjectMenu(context as any);
    });
    await act(async () => {
      menu!.playback.stride = 1;
      menu!.keydownHandler.handle({ keyCombo: "c" } as any);
    });
    expect(context.currentFrame).toBe(context.frames.elements[1]);

    await act(async () => {
      menu!.keydownHandler.handle({ keyCombo: "z" } as any);
    });
    expect(context.currentFrame).toBe(context.frames.elements[0]);

    await act(async () => {
      menu!.keydownHandler.handle({ keyCombo: "space" } as any);
    });
    expect(menu!.playback.isPlaying).toBe(true);

    await act(async () => menu!.dispose());
  });

  /** Builds the store/intents pair mapping and writing the test context. */
  function createProjectStore(context: TestSceneContext) {
    const runtime = {
      context,
      layers: {
        layerEntries: [],
        labelDataLayers: [],
        activeLayer: null,
      },
      layersByKey: {},
      app: { hintText: null },
    };
    const counters = {
      navigation: 0,
      labelset: 0,
      layers: 0,
      hint: 0,
      plugins: {},
    };
    return {
      store: createEditorStore(createEditorMapper(runtime as never, counters)),
      intents: createEditorIntents(runtime as never),
    };
  }

  it("composes the migrated React project menu panes and preserves menu behavior", async () => {
    const context = createProjectContext();
    let menu: ProjectMenu | undefined;

    await act(async () => {
      menu = new ProjectMenu(context as any);
    });

    // The view reads the state mapped from the same context and writes
    // back through the intents.
    const { store, intents } = createProjectStore(context);
    await act(async () => {
      intents.setSourceGroup(11);
      await Promise.resolve();
    });
    expect(context.currentSourceGroup).toBe(context.sourceGroups.elements[1]);
    await act(async () => {
      intents.setSourceGroup(10);
      intents.setLabelBranch(21);
      await Promise.resolve();
    });
    expect(context.currentLabelBranch).toBe(context.labelBranches.elements[1]);
    await act(async () => {
      intents.setLabelBranch(20);
      await Promise.resolve();
    });
    const view = await renderView(
      <EditorStoreProvider store={store}>
        <EditorIntentsProvider intents={intents}>
          <ProjectMenuView playback={menu!.playback} />
        </EditorIntentsProvider>
      </EditorStoreProvider>,
    );

    expect(menu!.context).toBe(context);
    expect(view.container.textContent).toContain("Task One");
    expect(
      [...view.container.querySelectorAll("input")].some((input) =>
        input.value.includes("1/2"),
      ),
    ).toBe(true);

    const taskSelect = view.container.querySelector("select");
    await act(async () => {
      taskSelect!.selectedIndex = 1;
      taskSelect!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(context.currentTask).toBe(context.tasks.elements[1]);

    const saveButton = [...view.container.querySelectorAll("button")].find(
      (button) => button.textContent!.includes("Save Changes"),
    );
    await act(async () => {
      saveButton!.click();
    });
    // Saving pushes under the task selected at save time (task 2 above).
    expect(context.currentLabelBranch.pushedTaskIds).toEqual([2]);

    const historyRows = view.container.querySelectorAll(
      ".labelset-history .scrolllist-item",
    );
    expect(historyRows).toHaveLength(2);
    expect(historyRows[0].textContent).toContain("Branch One edit");
    expect(historyRows[0].classList.contains("selected")).toBe(true);
    expect(historyRows[1].textContent).toContain("Branch One base");
    expect(historyRows[1].classList.contains("inactive")).toBe(true);

    await act(async () => {
      historyRows[1]!.dispatchEvent(
        new Event("pointerdown", { bubbles: true }),
      );
    });
    expect(context.currentLabelBranch.rebasedIds).toEqual([200]);

    await act(async () => {
      (getProjectTab(view.container, "Scene") as HTMLElement).click();
    });
    const frameRows = view.container.querySelectorAll<HTMLElement>(
      '[data-test="editor-frame-row"]',
    );
    expect(frameRows).toHaveLength(2);

    await act(async () => {
      frameRows[0].click();
    });
    expect(context.displayedFrames.at(-1)).toBe(context.frames.elements[0]);

    await act(async () => {
      (getProjectTab(view.container, "Frame") as HTMLElement).click();
    });
    const completeButton = view.container.querySelectorAll<HTMLInputElement>(
      'input[type="radio"]',
    )[1];
    await act(async () => {
      completeButton!.checked = true;
      completeButton!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(context.currentFrame.is_complete).toBe(true);

    context.currentFrame.is_complete = false;
    await act(async () => {
      menu!.cycleStatus();
    });
    expect(context.currentFrame.is_complete).toBe(true);

    context.currentFrame.is_complete = false;
    context.isNavigating = true;
    await act(async () => {
      menu!.cycleStatus();
    });
    expect(context.currentFrame.is_complete).toBe(false);

    await view.unmount();
    await act(async () => {
      menu!.dispose();
    });
  });

  it("enables frame status input exactly when a frame is open and not navigating", async () => {
    const context = createProjectContext();
    let menu: ProjectMenu | undefined;

    await act(async () => {
      menu = new ProjectMenu(context as any);
    });

    // Regression for the inverted Frame-tab `disabled` condition. The pane's
    // `disabled` setting is `!menu.isFrameStatusInputEnabled`, so the getter must
    // be true only while a frame is open and no navigation is in progress.
    expect(menu!.isFrameStatusInputEnabled).toBe(true);

    // Navigating disables the input.
    context.isNavigating = true;
    expect(menu!.isFrameStatusInputEnabled).toBe(false);
    context.isNavigating = false;
    expect(menu!.isFrameStatusInputEnabled).toBe(true);

    // No open frame disables the input.
    const openFrame = context.currentFrame;
    context.currentFrame = null;
    expect(menu!.isFrameStatusInputEnabled).toBe(false);
    context.currentFrame = openFrame;
    expect(menu!.isFrameStatusInputEnabled).toBe(true);

    // cycleStatus respects the same predicate: enabled toggles, navigating is a no-op.
    context.currentFrame.is_complete = false;
    await act(async () => {
      menu!.cycleStatus();
    });
    expect(context.currentFrame.is_complete).toBe(true);

    context.currentFrame.is_complete = false;
    context.isNavigating = true;
    await act(async () => {
      menu!.cycleStatus();
    });
    expect(context.currentFrame.is_complete).toBe(false);

    await act(async () => {
      menu!.dispose();
    });
  });

  it("reports frame-status failures from the keybind routes instead of leaking rejections", async () => {
    const context = createProjectContext();
    const failure = new Error("status conflict");
    const frame = context.currentFrame;
    frame.updateIsComplete = vi.fn().mockRejectedValue(failure);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    let menu: ProjectMenu | undefined;
    await act(async () => {
      menu = new ProjectMenu(context as any);
    });

    // The awaited keybind route reports the failure and keeps the local
    // frame state (the retry source of truth).
    await act(async () => {
      await menu!.cycleStatusAsync();
    });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]).toContain(failure);
    expect(frame.is_complete).toBe(false);

    // The fire-and-forget route reports it too.
    await act(async () => {
      menu!.cycleStatus();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(errorSpy).toHaveBeenCalledTimes(2);
    expect(frame.is_complete).toBe(false);

    await act(async () => {
      menu!.dispose();
    });
    errorSpy.mockRestore();
  });

  it("keeps the Frame status radios coherent with serialized toggles through the store", async () => {
    const context = createProjectContext();
    const { updateFrameIsComplete, pending } = heldFrameStatusUpdates();
    const statusFrame = createEditableFrame(
      { updateFrameIsComplete },
      100,
      false,
    );
    context.frames.elements[0] = statusFrame;
    context.currentFrame = statusFrame;

    let menu: ProjectMenu | undefined;
    await act(async () => {
      menu = new ProjectMenu(context as any);
    });

    // The same wiring the store runtime installs: `edit-frame` breaks the
    // navigation fingerprint and invalidates the store.
    const runtime = {
      context,
      layers: {
        layerEntries: [],
        labelDataLayers: [],
        activeLayer: null,
      },
      layersByKey: {},
      app: { hintText: null },
    };
    const counters = {
      navigation: 0,
      labelset: 0,
      layers: 0,
      hint: 0,
      plugins: {},
    };
    const store = createEditorStore(
      createEditorMapper(runtime as never, counters),
    );
    const intents = createEditorIntents(runtime as never);
    context.addEventListener("edit-frame", () => {
      counters.navigation += 1;
      store.invalidate();
    });

    const view = await renderView(
      <EditorStoreProvider store={store}>
        <EditorIntentsProvider intents={intents}>
          <ProjectMenuView playback={menu!.playback} />
        </EditorIntentsProvider>
      </EditorStoreProvider>,
    );

    await act(async () => {
      (getProjectTab(view.container, "Frame") as HTMLElement).click();
    });
    const radios = (): HTMLInputElement[] => [
      ...view.container.querySelectorAll<HTMLInputElement>(
        'input[type="radio"]',
      ),
    ];
    expect(radios()[0].checked).toBe(true);
    expect(radios()[1].checked).toBe(false);

    // Complete, then immediately incomplete, in the same tick.
    await act(async () => {
      intents.setFrameStatus(true);
      intents.setFrameStatus(false);
    });
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    // The radios still show the last settled value.
    expect(radios()[0].checked).toBe(true);

    // The first toggle settles; the queued second toggle starts.
    await act(async () => {
      pending[0].resolve();
    });
    await act(async () => {
      context.dispatchEvent({ type: "edit-frame" });
    });
    expect(radios()[1].checked).toBe(true);
    expect(radios()[0].checked).toBe(false);
    await vi.waitFor(() => expect(pending).toHaveLength(2));

    // The second toggle settles: the last input wins.
    await act(async () => {
      pending[1].resolve();
    });
    await act(async () => {
      context.dispatchEvent({ type: "edit-frame" });
    });
    expect(radios()[0].checked).toBe(true);
    expect(radios()[1].checked).toBe(false);
    expect(statusFrame.is_complete).toBe(false);
    expect(updateFrameIsComplete.mock.calls.map(([, value]) => value)).toEqual([
      true,
      false,
    ]);

    await view.unmount();
    await act(async () => {
      menu!.dispose();
    });
  });
});
