/* @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, it, vi } from "vitest";
import type { Column, GridOption, MenuCommandItem } from "slickgrid-react";
import Relations, {
  HydrateFallback,
} from "../../../../app/label/data/relations";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

it("renders filterable relation columns and routes filter changes back to page one", async () => {
  let columns: Column[] = [];
  let options: GridOption = {};
  function Grid(props: { columns: Column[]; options: GridOption }) {
    columns = props.columns;
    options = props.options;
    return <div data-testid="relation-grid" />;
  }
  const data = {
    SG: { SlickgridReact: Grid, Filters: { singleSelect: vi.fn() } },
    groups: [],
    branches: [],
    groupId: null,
    commitHash: "head",
    classNames: { 42: "Supports" },
    rows: [],
    error: null,
    pagination: {
      pageNumber: 2,
      pageSize: 25,
      pageSizes: [25, 100],
      hasNextPage: true,
    },
  };
  const router = createMemoryRouter(
    [
      {
        path: "/label/data/relation",
        loader: () => data,
        Component: Relations,
        HydrateFallback,
      },
    ],
    {
      initialEntries: [
        "/label/data/relation?group_id=7&commit_hash=head&page=2&pageSize=25",
      ],
    },
  );
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(<RouterProvider router={router} />));
    expect(host.querySelector('[data-testid="relation-grid"]')).not.toBeNull();
    expect(
      columns.filter((column) => column.filterable).map((column) => column.id),
    ).toEqual([
      "id",
      "source_type",
      "source_id",
      "target_type",
      "target_id",
      "relation_class_id",
      "is_deleted",
    ]);
    expect(
      columns.find((column) => column.id === "relation_class_id")?.filter
        ?.collection,
    ).toContainEqual({ value: 42, label: "Supports" });
    expect(options.enableContextMenu).toBe(true);
    const commands = options.contextMenu!.commandListBuilder!(
      {} as never,
    ) as MenuCommandItem[];
    const view = commands.find((item) => item.command === "view")!;
    expect(view.title).toBe("View Details");
    await act(async () => {
      view.action!(new Event("click"), {
        dataContext: {
          id: "relation-a",
          group_id: 7,
          commit_hash: "revision-a",
          last_edit_at: "2026-10-21T12:00:00Z",
          relation_class_id: 42,
          source_type: "box",
          source_id: "source-a",
          target_type: "vector",
          target_id: "target-a",
          is_deleted: false,
        },
      } as never);
    });
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Relation Details");
    const values = [...dialog.querySelectorAll("input")];
    expect(values.map((input) => input.value)).toEqual([
      "relation-a",
      "Supports",
      "7",
      "revision-a",
      "2026-10-21T12:00:00Z",
      "No",
      "box",
      "source-a",
      "vector",
      "target-a",
    ]);
    expect(values.every((input) => input.readOnly && input.disabled)).toBe(
      true,
    );
    await act(async () => {
      [...dialog.querySelectorAll("button")]
        .find((button) => button.textContent === "Close")!
        .click();
    });
    await act(async () => {
      options.backendServiceApi!.service.processOnFilterChanged(
        new Event("change"),
        {
          columnFilters: [
            {
              columnId: "source_id",
              operator: "Contains",
              searchTerms: ["abc"],
            },
          ],
        } as never,
      );
    });
    const url = new URL(router.state.location.search, "http://localhost");
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("group_id")).toBe("7");
    expect(url.searchParams.get("commit_hash")).toBe("head");
    expect(JSON.parse(url.searchParams.get("filters")!)).toEqual([
      { columnId: "source_id", operator: "Contains", searchTerms: ["abc"] },
    ]);
  } finally {
    await act(async () => root.unmount());
    router.dispose();
  }
});
