/* @vitest-environment jsdom */

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, it, vi } from "vitest";

import PointCloudSpecs from "../../../../app/source/specs/specs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
vi.stubGlobal("React", React);
let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.replaceChildren();
});

it("distinguishes selecting the current page from all matching specifications", async () => {
  let selectedRows: number[] = [];
  const dataset = [{ id: 2, name: "Visible", groups: [] }];
  const instance = {
    gridService: {
      setSelectedRows: vi.fn((rows: number[]) => {
        selectedRows = rows;
      }),
    },
    slickGrid: { invalidate: vi.fn() },
    dataView: {
      getAllSelectedItems: () => selectedRows.map((index) => dataset[index]),
    },
  };
  let deleteSelection: (() => void) | undefined;
  function SlickgridReact({ onReactGridCreated, options }: any) {
    deleteSelection = () =>
      options.contextMenu
        .commandListBuilder()
        .find((item: any) => item.command === "batch_delete")
        .action();
    useEffect(() => {
      onReactGridCreated({ detail: instance });
    }, []);
    return null;
  }
  const loaderData = {
    SG: { SlickgridReact },
    user: { id: 1, roles: ["data-manager"] },
    dataset,
    allSpecifications: dataset,
    allSelectableIds: [1, 2, 3],
    pagination: {
      pageNumber: 2,
      pageSize: 25,
      pageSizes: [25, 50, 100],
      totalItems: 51,
    },
    sourceGroups: [],
    preprocessorSchema: {},
  };
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const router = createMemoryRouter([
    {
      path: "/",
      element: <PointCloudSpecs loaderData={loaderData as any} params={{}} />,
    },
  ]);
  await act(async () => root?.render(<RouterProvider router={router} />));
  function button(text: string): HTMLButtonElement {
    const result = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent === text,
    );
    expect(result, text).toBeDefined();
    return result!;
  }
  expect(
    button("Select Current Page").classList.contains("btn-outline-secondary"),
  ).toBe(true);
  expect(button("Select All (3)").parentElement).toBe(
    button("Select Current Page").parentElement,
  );
  await act(async () => button("Select Current Page").click());
  expect(button("Deselect All (1 selected)")).toBeDefined();
  await act(async () => button("Deselect All (1 selected)").click());
  await act(async () => button("Select All (3)").click());
  expect(button("Deselect All (3 selected)")).toBeDefined();
  expect(instance.gridService.setSelectedRows).toHaveBeenLastCalledWith([0]);
  await act(async () => deleteSelection?.());
  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog?.querySelector(".modal-title")?.textContent).toBe(
    "Confirm Delete (3 items)",
  );
  expect(
    dialog?.querySelector<HTMLInputElement>('input[name="selectedIds"]')?.value,
  ).toBe("[1,2,3]");
  const cancel = Array.from(dialog?.querySelectorAll("button") ?? []).find(
    (element) => element.textContent === "Cancel",
  );
  await act(async () => cancel?.click());

  await act(async () => button("Deselect All (3 selected)").click());
  expect(button("Select Current Page")).toBeDefined();
  expect(instance.gridService.setSelectedRows).toHaveBeenLastCalledWith([]);
  router.dispose();
});
