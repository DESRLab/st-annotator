/* @vitest-environment jsdom */

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, it, vi } from "vitest";

import Definitions from "../../../../../../app/routes/label/specs/objclass/definitions";
import Selections from "../../../../../../app/routes/label/specs/objclass/selections";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
vi.stubGlobal("React", React);
let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.replaceChildren();
});

it.each([
  ["Definition", Definitions],
  ["Selection", Selections],
] as const)(
  "aligns creation with current-page and all-page selection on the object class %s page",
  async (kind, Page) => {
    let selectedRows: number[] = [];
    const dataset = [{ id: 2, name: "Visible", groups: [], objclasses: [] }];
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
    let deleteRow: (() => void) | undefined;
    let deleteBatch: (() => void) | undefined;
    let commands: any[] = [];
    function SlickgridReact({ onReactGridCreated, options }: any) {
      commands = options.contextMenu.commandListBuilder();
      deleteBatch = () =>
        commands.find((item: any) => item.command === "batch_delete").action();
      deleteRow = () =>
        options.contextMenu
          .commandListBuilder()
          .find((item: any) => item.command === "delete")
          .action(null, { dataContext: dataset[0] });
      useEffect(() => {
        onReactGridCreated({ detail: instance });
      }, []);
      return null;
    }
    const loaderData = {
      SG: { SlickgridReact },
      user: { id: 1, roles: ["data-manager"] },
      dataset,
      allSelectableIds: [1, 2, 3],
      pagination: {
        pageNumber: 2,
        pageSize: 25,
        pageSizes: [25, 50, 100],
        totalItems: 51,
      },
      labelGroups: [],
      objectClasses: [],
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const router = createMemoryRouter([
      {
        path: "/",
        element: <Page loaderData={loaderData as any} params={{}} />,
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
      button(`Create Object Class ${kind}`).parentElement?.parentElement,
    ).toBe(button("Select Current Page").parentElement?.parentElement);
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
    expect(
      commands
        .find((item) => item.command === "batch_delete")
        .itemVisibilityOverride(),
    ).toBe(true);
    expect(
      commands
        .find((item) => item.command === "delete")
        .itemVisibilityOverride(),
    ).toBe(false);
    await act(async () => deleteBatch?.());
    const batchDialog = document.querySelector('[role="dialog"]');
    expect(batchDialog?.querySelector(".modal-title")?.textContent).toBe(
      "Confirm Delete (3 items)",
    );
    expect(
      batchDialog?.querySelector<HTMLInputElement>('input[name="selectedIds"]')
        ?.value,
    ).toBe("[1,2,3]");
    expect(
      batchDialog?.querySelector<HTMLInputElement>('input[name="_action"]')
        ?.value,
    ).toBe("batch_delete");
    const cancelBatch = Array.from(
      batchDialog?.querySelectorAll("button") ?? [],
    ).find((element) => element.textContent === "Cancel");
    await act(async () => cancelBatch?.click());
    await act(async () => button("Deselect All (3 selected)").click());
    await act(async () => button("Select Current Page").click());
    expect(
      commands
        .find((item) => item.command === "batch_delete")
        .itemVisibilityOverride(),
    ).toBe(false);
    expect(
      commands
        .find((item) => item.command === "delete")
        .itemVisibilityOverride(),
    ).toBe(true);
    await act(async () => deleteRow?.());
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.querySelector("strong")?.textContent).toBe("Visible");
    expect(dialog?.querySelector(".modal-title")?.textContent).toBe(
      "Confirm Delete",
    );
    expect(
      dialog?.querySelector<HTMLInputElement>('input[name="id"]')?.value,
    ).toBe("2");
    const cancel = Array.from(dialog?.querySelectorAll("button") ?? []).find(
      (element) => element.textContent === "Cancel",
    );
    await act(async () => cancel?.click());
    await act(async () => button("Deselect All (1 selected)").click());
    expect(button("Select Current Page")).toBeDefined();
    expect(instance.gridService.setSelectedRows).toHaveBeenLastCalledWith([]);
    router.dispose();
  },
);
