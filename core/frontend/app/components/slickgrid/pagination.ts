import type {
  BackendService,
  BackendServiceApi,
  ColumnFilters,
  CurrentFilter,
  CurrentPagination,
  CurrentSorter,
  GridOption,
} from "@slickgrid-universal/common";
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router";
import type { SlickgridReactInstance } from "slickgrid-react";

import type { GridPagination } from "../../loaders";

export type PaginationGridOptions = Pick<
  GridOption,
  "backendServiceApi" | "enablePagination" | "pagination" | "presets"
>;

const ROUTE_DATASET_NAME = "routePage";

export const GRID_FILTERS_PARAM = "filters";
export const GRID_SORT_PARAM = "sort";

/** Serializes the grid's current filters into a URL param value, or `undefined` when there are none. */
export function serializeGridFilters(
  columnFilters: ColumnFilters | CurrentFilter[] | null | undefined,
): string | undefined {
  const filters =
    columnFilters == null
      ? []
      : Array.isArray(columnFilters)
        ? columnFilters
        : Object.values(columnFilters);
  if (filters.length === 0) return undefined;

  return JSON.stringify(
    filters.map((filter) => ({
      columnId: filter.columnId,
      operator: filter.operator,
      searchTerms: filter.searchTerms,
    })),
  );
}

/** Parses the `filters` URL param; invalid values yield no filters. */
export function parseGridFilters(value: string | null): CurrentFilter[] {
  if (value == null || value === "") return [];

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (filter): filter is CurrentFilter =>
        filter != null &&
        typeof filter === "object" &&
        typeof (filter as CurrentFilter).columnId === "string",
    );
  } catch {
    return [];
  }
}

/** Serializes the grid's current sorter into a URL param value, or `undefined` when there is none. */
export function serializeGridSorter(
  sorter: CurrentSorter | null | undefined,
): string | undefined {
  if (sorter?.columnId == null || sorter.columnId === "") return undefined;

  const direction = String(sorter.direction ?? "").toLowerCase();
  if (direction !== "asc" && direction !== "desc") return undefined;

  return `${sorter.columnId}:${direction}`;
}

/** Parses the `sort` URL param; invalid values yield no sorters. */
export function parseGridSorters(value: string | null): CurrentSorter[] {
  if (value == null || value === "") return [];

  const separatorIndex = value.lastIndexOf(":");
  if (separatorIndex <= 0) return [];

  const columnId = value.slice(0, separatorIndex);
  const direction = value.slice(separatorIndex + 1).toLowerCase();
  if (direction !== "asc" && direction !== "desc") return [];

  return [{ columnId, direction: direction }];
}

/** Returns the search terms of `filter` as non-empty strings. */
export function getFilterSearchTerms(filter: CurrentFilter): string[] {
  return (filter.searchTerms ?? [])
    .map((term) => String(term ?? ""))
    .filter((term) => term !== "");
}

/**
 * Returns the `[ge, lt)` bounds of a range filter. An inclusive upper bound
 * is widened to the next day so that date-only pickers include the whole day.
 */
export function getFilterDateRange(filter: CurrentFilter): {
  ge?: string;
  lt?: string;
} {
  const terms = filter.searchTerms ?? [];
  const from =
    terms[0] != null && String(terms[0]) !== "" ? String(terms[0]) : undefined;
  const to =
    terms[1] != null && String(terms[1]) !== "" ? String(terms[1]) : undefined;

  const bounds: { ge?: string; lt?: string } = {};
  if (from != null) bounds.ge = from;
  if (to != null)
    bounds.lt = filter.operator === "RangeExclusive" ? to : nextIsoDay(to);

  return bounds;
}

function nextIsoDay(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match == null) return value;

  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  date.setUTCDate(date.getUTCDate() + 1);

  return date.toISOString().slice(0, 10);
}

export function useRoutePaginationGridOptions<T>(
  pagination: GridPagination | undefined,
  dataset: T[],
): PaginationGridOptions {
  const location = useLocation();
  const navigate = useNavigate();

  const presets = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    return {
      filters: parseGridFilters(searchParams.get(GRID_FILTERS_PARAM)),
      sorters: parseGridSorters(searchParams.get(GRID_SORT_PARAM)),
    };
  }, [location.search]);

  return useMemo(() => {
    if (pagination == null) {
      return {};
    }

    const currentPagination = pagination;

    function navigateToGridState(
      update: (searchParams: URLSearchParams) => void,
    ) {
      const searchParams = new URLSearchParams(location.search);
      update(searchParams);

      const nextSearch = searchParams.toString();
      if (nextSearch === new URLSearchParams(location.search).toString()) {
        return;
      }

      void navigate(`${location.pathname}?${nextSearch}`);
    }

    function updateRoute(pageNumber: number, pageSize: number) {
      const routePageNumber = Math.max(1, pageNumber);
      if (
        routePageNumber === currentPagination.pageNumber &&
        pageSize === currentPagination.pageSize
      ) {
        return;
      }

      navigateToGridState((searchParams) => {
        searchParams.set("page", String(routePageNumber));
        searchParams.set("pageSize", String(pageSize));
      });
    }

    const getCurrentPagination = (): CurrentPagination => ({
      pageNumber: currentPagination.pageNumber,
      pageSize: currentPagination.pageSize,
    });

    const processRoutePage = async () => ({
      data: {
        [ROUTE_DATASET_NAME]: {
          nodes: dataset,
          totalCount: currentPagination.totalItems,
        },
      },
    });

    const service: BackendService = {
      options: { executeProcessCommandOnInit: true },
      buildQuery: () => ROUTE_DATASET_NAME,
      getCurrentPagination,
      getDatasetName: () => ROUTE_DATASET_NAME,
      processOnPaginationChanged: (_event, args) => {
        updateRoute(args.newPage, args.pageSize);
        return ROUTE_DATASET_NAME;
      },
      processOnFilterChanged: (_event, args) => {
        navigateToGridState((searchParams) => {
          const filtersParam = serializeGridFilters(args.columnFilters);
          if (filtersParam == null) searchParams.delete(GRID_FILTERS_PARAM);
          else searchParams.set(GRID_FILTERS_PARAM, filtersParam);
          searchParams.set("page", "1");
        });
        return ROUTE_DATASET_NAME;
      },
      processOnSortChanged: (_event, args) => {
        let sorter: CurrentSorter | undefined;
        if (args != null) {
          const columnSort =
            args.multiColumnSort === true ? args.sortCols?.[0] : args;
          if (columnSort?.columnId != null) {
            sorter = {
              columnId: String(columnSort.columnId),
              direction: (columnSort.sortAsc
                ? "asc"
                : "desc") as CurrentSorter["direction"],
            };
          }
        }

        navigateToGridState((searchParams) => {
          const sortParam = serializeGridSorter(sorter);
          if (sortParam == null) searchParams.delete(GRID_SORT_PARAM);
          else searchParams.set(GRID_SORT_PARAM, sortParam);
          searchParams.set("page", "1");
        });
        return ROUTE_DATASET_NAME;
      },
      resetPaginationOptions: () => {},
      updateOptions: () => {},
      updatePagination: (pageNumber, pageSize) =>
        updateRoute(pageNumber, pageSize),
    };

    const backendServiceApi: BackendServiceApi = {
      service,
      process: processRoutePage,
    };

    return {
      backendServiceApi,
      enablePagination: true,
      pagination,
      presets,
    };
  }, [
    dataset,
    location.pathname,
    location.search,
    navigate,
    pagination,
    presets,
  ]);
}

export function syncRoutePaginationGrid(
  reactGrid: SlickgridReactInstance | null | undefined,
  pagination: GridPagination | undefined,
) {
  reactGrid?.slickGrid?.invalidate();
  if (pagination == null) return;

  const paginationService = reactGrid?.paginationService;
  if (!paginationService) return;

  paginationService.paginationOptions = pagination;
  paginationService.updateTotalItems(pagination.totalItems);
  void paginationService
    .changeItemPerPage(pagination.pageSize, undefined, false)
    .then(() =>
      paginationService.goToPageNumber(pagination.pageNumber, undefined, false),
    )
    .then(() => paginationService.refreshPagination(false, false));
}
