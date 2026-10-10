/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { SceneSelectionPaneView } from "../../../../../../app/routes/editor/app/widgets/SceneSelectionPane.react.tsx";
import type { SceneSelectionPaneParams } from "../../../../../../app/routes/editor/app/widgets/SceneSelectionPane.react.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const taskA = { id: 1, name: "Task A" };
const taskB = { id: 2, name: "Task B" };
const sourceGroup = { id: 10, name: "SemanticKITTI" };
const alternateSourceGroup = { id: 11, name: "Alternate source" };
const cleanBranch = { id: 20, name: "main" };
const dirtyBranch = { id: 21, name: "draft" };

function paneParams(
  overrides: Partial<{
    inputtedData: Partial<SceneSelectionPaneParams["inputtedData"]>;
    internalData: Partial<
      NonNullable<SceneSelectionPaneParams["internalData"]>
    >;
    settings: Partial<SceneSelectionPaneParams["settings"]>;
  }> = {},
) {
  return {
    inputtedData: {
      taskId: taskA.id,
      sourceGroupId: sourceGroup.id,
      labelBranchId: cleanBranch.id,
      frameProgress: { completed: 1, total: 4 },
      ...overrides.inputtedData,
    },
    internalData: {
      tasks: [taskA, taskB],
      sourceGroups: [sourceGroup, alternateSourceGroup],
      labelBranches: [cleanBranch, dirtyBranch],
      unsavedBranchIds: new Set([dirtyBranch.id]),
      isSaving: false,
      ...overrides.internalData,
    },
    settings: {
      disabled: false,
      hidden: false,
      disableSave: false,
      ...overrides.settings,
    },
  };
}

async function renderView(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<SceneSelectionPaneView {...props} />);
  });

  return {
    container,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("SceneSelectionPaneView", () => {
  it("renders native Tweakpane rows and publishes selection and save events", async () => {
    const changes = [];
    const saves = [];
    const view = await renderView({
      historyChildren: <div>history item</div>,
      paneParams: paneParams(),
      onInputChange: (change) => changes.push(change),
      onSave: () => saves.push("save"),
    });

    const rows = view.container.querySelectorAll(".tp-lblv");
    expect(rows.length).toBeGreaterThanOrEqual(4);
    expect(rows[0].textContent).toContain("Task:");
    expect(view.container.textContent).toContain("history item");
    const progressInput = [...view.container.querySelectorAll("input")].find(
      (input) => input.value.includes("1/4"),
    );
    expect(progressInput?.value).toContain("1/4 (25.0%) completed");

    // Unsaved branches are decorated with a `*` in the option list.
    const selects =
      view.container.querySelectorAll<HTMLSelectElement>(".tp-lblv select");
    const branchOptions = [...selects[2].querySelectorAll("option")].map(
      (option) => option.textContent,
    );
    expect(branchOptions).toContain("[#20] main");
    expect(branchOptions).toContain("[#21] draft*");

    const taskSelect =
      view.container.querySelector<HTMLSelectElement>(".tp-lblv select");
    await act(async () => {
      taskSelect.selectedIndex = 1;
      taskSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(changes).toHaveLength(1);
    expect(changes[0].taskId).toBe(taskB.id);

    await act(async () => {
      selects[1].selectedIndex = 1;
      selects[1].dispatchEvent(new Event("change", { bubbles: true }));
      selects[2].selectedIndex = 1;
      selects[2].dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(changes).toEqual([
      expect.objectContaining({ taskId: taskB.id }),
      expect.objectContaining({ sourceGroupId: alternateSourceGroup.id }),
      expect.objectContaining({ labelBranchId: dirtyBranch.id }),
    ]);

    const saveButton = [...view.container.querySelectorAll("button")].find(
      (button) => button.textContent === "Save Changes",
    );
    await act(async () => saveButton.click());
    expect(saves).toEqual(["save"]);

    await view.unmount();
  });

  it("disables saving from React-owned pane params", async () => {
    const saves = [];
    const view = await renderView({
      paneParams: paneParams({ settings: { disableSave: true } }),
      onInputChange: () => {},
      onSave: () => saves.push("save"),
    });

    const saveButton = [...view.container.querySelectorAll("button")].find(
      (button) => button.textContent === "Save Changes",
    );
    expect(saveButton.disabled).toBe(true);

    await act(async () => saveButton.click());
    expect(saves).toEqual([]);

    await view.unmount();
  });

  it("uses null list values while scene navigation is uninitialized", async () => {
    const view = await renderView({
      paneParams: paneParams({
        inputtedData: {
          taskId: undefined as unknown as number | null,
          sourceGroupId: undefined as unknown as number | null,
          labelBranchId: undefined as unknown as number | null,
        },
      }),
      onInputChange: () => {},
    });

    expect(view.container.querySelectorAll(".tp-lblv select")).toHaveLength(3);
    await view.unmount();
  });
});
