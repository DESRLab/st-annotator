import type { MenuCommandItem } from "@slickgrid-universal/common";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type {
  Column,
  GridOption,
  SlickgridReactInstance,
} from "slickgrid-react";

import { listGroupsLabelGroupsGet } from "../../../client";
import { createSlickgridClientLoader } from "../../components/slickgrid/client";
import { selectableConfig } from "../../components/slickgrid/options";
import {
  syncRoutePaginationGrid,
  useRoutePaginationGridOptions,
} from "../../components/slickgrid/pagination";
import {
  applyNumericFilterToQuery,
  applySortersToQuery,
  applyTextFilterToQuery,
  getGridStateRequest,
  loadAuthenticatedSession,
  listGridPage,
  type GridPagination,
  type GridQuery,
  type GridStateRequest,
} from "../../loaders";
import { createPageContent } from "../../templates";

import type { Route } from "./+types/repos";

interface RepositoryRow {
  id: number;
  name: string;
  description: string;
  last_edit_at?: string | null;
}

const REPO_SORTABLE_COLUMNS = new Set(["id", "name", "description"]);

export function buildReposQuery({
  filters,
  sorters,
}: GridStateRequest): GridQuery {
  const query: GridQuery = {};

  for (const filter of filters) {
    switch (filter.columnId) {
      case "id":
        applyNumericFilterToQuery(query, filter, "id");
        break;
      case "name":
        applyTextFilterToQuery(query, filter, "name");
        break;
      case "description":
        applyTextFilterToQuery(query, filter, "description");
        break;
    }
  }

  applySortersToQuery(query, sorters, REPO_SORTABLE_COLUMNS);

  return query;
}

export async function loader({ request }: Route.LoaderArgs) {
  const authenticated = await loadAuthenticatedSession(request);
  if (authenticated instanceof Response) return authenticated;
  const { token, user } = authenticated;

  const groupsRes = await listGridPage(request, (pagination) =>
    listGroupsLabelGroupsGet({
      auth: token.access_token,
      query: {
        ...buildReposQuery(getGridStateRequest(request)),
        ...pagination,
      },
    }),
  );
  const dataset: RepositoryRow[] = (groupsRes.data ?? []).map((group) => ({
    id: group.id,
    name: String(group.name),
    description: group.description ?? "",
    last_edit_at: group.last_edit_at ?? null,
  }));
  const loaderError = groupsRes.error;

  return { user, dataset, pagination: groupsRes.pagination, loaderError };
}

export const clientLoader =
  createSlickgridClientLoader<Route.ClientLoaderArgs>();

function RepositoryTable({
  SG,
  dataset,
  pagination,
}: {
  SG: typeof import("slickgrid-react");
  dataset: RepositoryRow[];
  pagination: GridPagination;
}) {
  const navigate = useNavigate();
  const [columns, setColumns] = useState<Column[]>([]);
  const [gridOptions, setGridOptions] = useState<GridOption | undefined>(
    undefined,
  );
  const reactGridRef = useRef<SlickgridReactInstance | null>(null);
  const paginationGridOptions = useRoutePaginationGridOptions(
    pagination,
    dataset,
  );

  useEffect(() => {
    syncRoutePaginationGrid(reactGridRef.current, pagination);
  }, [dataset, pagination]);

  useEffect(() => {
    defineGrid();
  }, [navigate, paginationGridOptions]);

  function defineGrid() {
    const cols: Column<RepositoryRow>[] = [
      {
        id: "id",
        name: "Group ID",
        field: "id",
        type: "integer",
        filterable: true,
        sortable: true,
      },
      {
        id: "name",
        name: "Repository",
        field: "name",
        type: "string",
        filterable: true,
        sortable: true,
        formatter: (_row, _cell, value) => String(value),
      },
      {
        id: "description",
        name: "Description",
        field: "description",
        type: "string",
        filterable: true,
        sortable: true,
      },
    ];

    const commandItems: MenuCommandItem[] = [
      {
        command: "open",
        title: "Open Repository",
        iconCssClass: "fas fa-paperclip fa-fw",
        action: (_e, args) => {
          void navigate(`/label/repos/${args.dataContext.id}`);
        },
      },
    ];

    setColumns(cols);
    setGridOptions({
      ...(selectableConfig({
        commandItems,
        multiSelect: false,
      }) as unknown as GridOption),
      ...paginationGridOptions,
      autoResize: { container: "#grid-container" },
      enableAutoResize: true,
    });
  }

  function reactGridReady(reactGrid: SlickgridReactInstance) {
    reactGridRef.current = reactGrid;
  }

  function openRepository(repository?: RepositoryRow) {
    if (!repository) {
      return;
    }

    void navigate(`/label/repos/${repository.id}`);
  }

  function handleGridDoubleClick(
    event: CustomEvent<{
      args?: { dataContext?: RepositoryRow; row?: number };
    }>,
  ) {
    const row = event.detail?.args?.row;
    const repository =
      event.detail?.args?.dataContext ??
      (typeof row === "number"
        ? reactGridRef.current?.dataView.getItem(row)
        : undefined);

    openRepository(repository);
  }

  const { SlickgridReact } = SG;

  return (
    <>
      <div className="mb-3 text-muted">
        Each label group owns one repository. Open a repository to manage its
        branches.
      </div>

      <div className="slickgrid-container" id="grid-container">
        {gridOptions && (
          <SlickgridReact
            gridId="labelRepositories-grid"
            columns={columns}
            options={gridOptions}
            dataset={dataset}
            onReactGridCreated={(e) => reactGridReady(e.detail)}
            onDblClick={handleGridDoubleClick}
          />
        )}
      </div>
    </>
  );
}

export function HydrateFallback() {
  return <div>Loading repositories...</div>;
}

export default function LabelRepositories({
  loaderData,
}: Route.ComponentProps) {
  const { SG, dataset, pagination, loaderError } = loaderData;

  return createPageContent({
    title: "Repositories",
    main: <RepositoryTable SG={SG} dataset={dataset} pagination={pagination} />,
    alerts: loaderError ? { error: loaderError } : undefined,
  });
}
