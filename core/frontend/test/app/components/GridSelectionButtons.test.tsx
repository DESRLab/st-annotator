/* @vitest-environment jsdom */

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GridSelectionButtons } from "../../../app/components/GridSelectionButtons";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

async function render(element: ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(element));
  return container;
}

function buttonByName(container: HTMLElement, name: string) {
  return Array.from(container.querySelectorAll("button")).find((button) =>
    (button.textContent ?? "").includes(name),
  );
}

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

describe("GridSelectionButtons", () => {
  it("offers page and whole-list selection while nothing is selected", async () => {
    const container = await render(
      <GridSelectionButtons
        selectedCount={0}
        currentPageCount={25}
        allSelectableCount={140}
        onSelectCurrentPage={vi.fn()}
        onSelectAll={vi.fn()}
        onDeselectAll={vi.fn()}
      />,
    );

    expect(buttonByName(container, "Select Current Page")).toBeDefined();
    expect(buttonByName(container, "Select All (140)")).toBeDefined();
    expect(buttonByName(container, "Deselect All")).toBeUndefined();
  });

  it("replaces both buttons with the selection count once anything is selected", async () => {
    const onDeselectAll = vi.fn();
    const container = await render(
      <GridSelectionButtons
        selectedCount={3}
        currentPageCount={25}
        allSelectableCount={140}
        onSelectCurrentPage={vi.fn()}
        onSelectAll={vi.fn()}
        onDeselectAll={onDeselectAll}
      />,
    );

    expect(buttonByName(container, "Select All")).toBeUndefined();
    const deselect = buttonByName(container, "Deselect All (3 selected)");
    expect(deselect).toBeDefined();
    await act(async () => deselect?.click());
    expect(onDeselectAll).toHaveBeenCalledTimes(1);
  });

  it("disables each selection button when there is nothing for it to select", async () => {
    const container = await render(
      <GridSelectionButtons
        selectedCount={0}
        currentPageCount={0}
        allSelectableCount={0}
        onSelectCurrentPage={vi.fn()}
        onSelectAll={vi.fn()}
        onDeselectAll={vi.fn()}
      />,
    );

    expect(buttonByName(container, "Select Current Page")?.disabled).toBe(true);
    expect(buttonByName(container, "Select All (0)")?.disabled).toBe(true);
  });

  it("offers only whole-list selection when the grid has no other page", async () => {
    const container = await render(
      <GridSelectionButtons
        selectedCount={0}
        allSelectableCount={7}
        onSelectAll={vi.fn()}
        onDeselectAll={vi.fn()}
      />,
    );

    expect(buttonByName(container, "Select Current Page")).toBeUndefined();
    expect(buttonByName(container, "Select All (7)")).toBeDefined();
  });

  it("holds the whole group still while the grid revalidates", async () => {
    const container = await render(
      <GridSelectionButtons
        selectedCount={0}
        currentPageCount={25}
        allSelectableCount={140}
        onSelectCurrentPage={vi.fn()}
        onSelectAll={vi.fn()}
        onDeselectAll={vi.fn()}
        disabled
      />,
    );

    expect(buttonByName(container, "Select Current Page")?.disabled).toBe(true);
    expect(buttonByName(container, "Select All (140)")?.disabled).toBe(true);
  });
});
