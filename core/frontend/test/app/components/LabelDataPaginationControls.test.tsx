/* @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router";
import { expect, it } from "vitest";
import { LabelDataPaginationControls } from "../../../app/plugins/label-data";
import { useRoutePaginationGridOptions } from "../../../app/components/slickgrid/pagination";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

it.each([true, false])(
  "navigates without a total (next page: %s)",
  async (hasNextPage) => {
    const pagination = {
      pageNumber: 2,
      pageSize: 25,
      pageSizes: [25, 50, 100],
      hasNextPage,
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    let search = "";
    function Harness() {
      search = useLocation().search;
      const options = useRoutePaginationGridOptions(pagination, []);
      expect(options.enablePagination).toBe(false);
      expect(options.pagination).toBeUndefined();
      return <LabelDataPaginationControls pagination={pagination} />;
    }
    try {
      await act(async () =>
        root.render(
          <MemoryRouter
            initialEntries={[
              "/label/data/bbox?group_id=7&commit_hash=head&tab=entities&page=2&pageSize=25&filters=kept",
            ]}
          >
            <Harness />
          </MemoryRouter>,
        ),
      );
      const links = [...container.querySelectorAll("a")];
      expect(links.map((link) => link.textContent)).toEqual(
        hasNextPage ? ["Previous", "Next"] : ["Previous"],
      );
      const previous = new URL(links[0].href, "http://localhost").searchParams;
      expect(previous.get("page")).toBe("1");
      expect(previous.get("commit_hash")).toBe("head");
      expect(container.textContent).toContain("Page 2");
      const size = container.querySelector("select")!;
      await act(async () => {
        size.value = "50";
        size.dispatchEvent(new Event("change", { bubbles: true }));
      });
      const query = new URLSearchParams(search);
      expect(query.get("page")).toBe("1");
      expect(query.get("pageSize")).toBe("50");
      expect(query.get("group_id")).toBe("7");
      expect(query.get("commit_hash")).toBe("head");
      expect(query.get("tab")).toBe("entities");
      expect(query.get("filters")).toBe("kept");
    } finally {
      await act(async () => root.unmount());
    }
  },
);
