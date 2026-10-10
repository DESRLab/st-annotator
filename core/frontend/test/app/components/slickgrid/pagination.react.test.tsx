/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router";
import { describe, expect, it } from "vitest";

import { useRoutePaginationGridOptions } from "../../../../app/components/slickgrid/pagination";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("route pagination grid lifecycle", () => {
  it("preserves a newly-applied filter when paging", async () => {
    let latestOptions: ReturnType<typeof useRoutePaginationGridOptions> = {};
    let latestSearch = "";

    function Harness(): null {
      latestOptions = useRoutePaginationGridOptions(
        { pageNumber: 2, pageSize: 25, totalItems: 100 },
        [],
      );
      latestSearch = useLocation().search;
      return null;
    }

    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/label/groups?page=2&pageSize=25"]}>
          <Harness />
        </MemoryRouter>,
      );
    });

    await act(async () => {
      latestOptions.backendServiceApi?.service.processOnFilterChanged?.(
        undefined as never,
        {
          columnFilters: {
            name: {
              columnId: "name",
              operator: "Contains",
              searchTerms: ["vehicles"],
            },
          },
        } as never,
      );
    });
    expect(new URLSearchParams(latestSearch).get("page")).toBe("1");
    expect(new URLSearchParams(latestSearch).get("filters")).toContain(
      "vehicles",
    );

    await act(async () => {
      latestOptions.backendServiceApi?.service.processOnPaginationChanged?.(
        undefined as never,
        { newPage: 3, pageSize: 25 } as never,
      );
    });
    const finalSearch = new URLSearchParams(latestSearch);
    expect(finalSearch.get("page")).toBe("3");
    expect(finalSearch.get("filters")).toContain("vehicles");

    await act(async () => root.unmount());
  });
});
