import type {
  CurrentFilter,
  MenuCommandItem,
} from "@slickgrid-universal/common";
import { useEffect, useRef, useState } from "react";
import { Alert } from "react-bootstrap";
import { useFetcher, useRevalidator } from "react-router";
import type {
  Column,
  GridOption,
  SlickgridReactInstance,
} from "slickgrid-react";

import {
  type JobPublic,
  type JobState,
  cancelJobJobsIdCancelPost,
  listJobsJobsGet,
} from "../../client";
import { createSlickgridClientLoader } from "../components/slickgrid/client";
import { selectableConfig } from "../components/slickgrid/options";
import { normalizeError } from "../errors";
import {
  getFilterSearchTerms,
  syncRoutePaginationGrid,
  useRoutePaginationGridOptions,
} from "../components/slickgrid/pagination";
import {
  ALL_JOB_STATES,
  applyNumericFilterToQuery,
  applySortersToQuery,
  getGridStateRequest,
  listGridPage,
  loadAuthorizedSession,
  type GridPagination,
  type GridQuery,
  type GridStateRequest,
} from "../loaders";
import { createPageContent } from "../templates";

import type { Route } from "./+types/jobs";

/** Poll cadence for a queue that still holds work, in milliseconds. */
const JOBS_POLL_INTERVAL_MS = 5000;

/** States that mean the queue is busy, and therefore worth re-fetching. */
const ACTIVE_JOB_STATES: readonly JobState[] = ["pending", "running"];

/** Every state the page lists when the route selects none. */
export const DEFAULT_VISIBLE_JOB_STATES: readonly JobState[] = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
];

/**
 * Whether the loaded queue holds work that may change without user action. An
 * idle queue must produce no polling requests at all.
 */
export function hasActiveJobs(jobs: readonly { state: JobState }[]): boolean {
  return jobs.some((job) => ACTIVE_JOB_STATES.includes(job.state));
}

/** Whether the row menu should offer user cancellation for this job. */
export function canCancelJob(job: Pick<JobRow, "state">): boolean {
  return job.state === "running";
}

const STATE_BADGE_CLASS: Record<JobState, string> = {
  pending: "text-bg-secondary",
  running: "text-bg-info",
  succeeded: "text-bg-success",
  failed: "text-bg-danger",
  cancelled: "text-bg-warning",
};

/**
 * A job row as displayed. `payload` is deliberately absent: it is an opaque
 * recursive JSON document, and `label` already states the work in words.
 */
export interface JobRow {
  id: number;
  kind: string;
  state: JobState;
  label: string;
  progress_done: number;
  progress_total: number | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error: string;
}

export function mapJobRows(jobs: readonly JobPublic[]): JobRow[] {
  return jobs.map((job) => ({
    id: job.id,
    kind: job.kind,
    state: job.state,
    label: job.label ?? "",
    progress_done: job.progress_done,
    progress_total: job.progress_total,
    created_at: job.created_at,
    started_at: job.started_at,
    finished_at: job.finished_at,
    error: job.error ?? "",
  }));
}

/** The job columns the API accepts in `sort_by`; anything else is ignored. */
const JOB_SORTABLE_COLUMNS = new Set([
  "id",
  "kind",
  "state",
  "progress_done",
  "progress_total",
  "created_at",
  "started_at",
  "finished_at",
]);

/**
 * The preset that makes the page default *visible* in the State filter box.
 *
 * Slickgrid clears every column's own `filter.searchTerms` before it reads
 * `presets.filters`, so a filter value that has to show up in the UI can only arrive
 * through the presets -- which is why the default is injected here rather than set on the
 * column. It is added only when the route named no state; when it did, the preset parsed
 * from the URL already carries the selection, and a second one would fight it.
 */
export function stateFilterPreset(
  defaultStates: readonly JobState[] | null,
): CurrentFilter[] {
  return defaultStates
    ? [
        {
          columnId: "state",
          operator: "IN",
          searchTerms: [...defaultStates],
        },
      ]
    : [];
}

/**
 * The states the route's `state` filter selects, in `ALL_JOB_STATES` order and deduplicated,
 * or `undefined` when it selects none.
 *
 * A term outside `JobState` is dropped rather than sent, because the endpoint rejects an
 * unknown value outright; a filter left with nothing valid behind it is no filter at all,
 * which is the one case the page default covers.
 */
export function requestedJobStates(
  filters: readonly CurrentFilter[],
): JobState[] | undefined {
  const terms = filters
    .filter((filter) => filter.columnId === "state")
    .flatMap(getFilterSearchTerms);

  const states = ALL_JOB_STATES.filter((state) => terms.includes(state));

  return states.length > 0 ? [...states] : undefined;
}

/**
 * Applies a filter as exact equality. The job endpoints match `kind` literally and have
 * no containment parameter, so a partial term must not be rewritten into a parameter the
 * backend would silently ignore.
 */
function applyExactFilterToQuery(
  query: GridQuery,
  filter: CurrentFilter,
  paramName: string,
): void {
  const [term] = getFilterSearchTerms(filter);
  if (term == null) return;

  query[paramName] = term;
}

export function buildJobsQuery({
  filters,
  sorters,
}: GridStateRequest): GridQuery {
  const query: GridQuery = {};

  // Repeated `state` is a union, so one request carries the default view; the grid's
  // filter box is preset with the same terms so what it shows is what was asked for.
  query.state = requestedJobStates(filters) ?? [...DEFAULT_VISIBLE_JOB_STATES];

  for (const filter of filters) {
    switch (filter.columnId) {
      case "id":
        applyNumericFilterToQuery(query, filter, "id");
        break;
      case "kind":
        applyExactFilterToQuery(query, filter, "kind");
        break;
    }
  }

  applySortersToQuery(query, sorters, JOB_SORTABLE_COLUMNS);

  return query;
}

export async function loader({ request }: Route.LoaderArgs) {
  // The job inventory is an operations surface: it requires the data-manager
  // role the enclosing layout does not, so an unauthorised visit redirects with
  // a flash instead of rendering a grid that can never load.
  const authenticated = await loadAuthorizedSession(request, "data-manager");
  if (authenticated instanceof Response) return authenticated;
  const { token } = authenticated;

  const gridState = getGridStateRequest(request);
  // The states the request carries because the route named none, or `null` when the route
  // chose its own -- in which case its presets already fill the filter box, and painting a
  // default over them would put the chips out of step with the rows.
  const defaultStates =
    requestedJobStates(gridState.filters) == null
      ? [...DEFAULT_VISIBLE_JOB_STATES]
      : null;

  const jobsRes = await listGridPage(request, (pagination) =>
    listJobsJobsGet({
      auth: token.access_token,
      query: {
        ...buildJobsQuery(gridState),
        ...pagination,
      },
    }),
  );
  const dataset = mapJobRows(jobsRes.data ?? []);

  const loaderError = jobsRes.error;

  return {
    dataset,
    pagination: jobsRes.pagination,
    defaultStates,
    loaderError,
  };
}

export const clientLoader =
  createSlickgridClientLoader<Route.ClientLoaderArgs>();

export async function action({ request }: Route.ActionArgs) {
  const authenticated = await loadAuthorizedSession(request, "data-manager");
  if (authenticated instanceof Response) return authenticated;

  const formData = await request.formData();
  const id = Number(formData.get("id"));
  if (!Number.isSafeInteger(id) || id <= 0) return { error: "Invalid job ID" };

  const response = await cancelJobJobsIdCancelPost({
    auth: authenticated.token.access_token,
    path: { id },
  });
  if (response.error) return { error: normalizeError(response.error) };
  return { error: null, success: `Job #${id} was cancelled.` };
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatTimestamp(value: string | null): string {
  if (!value) return "";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatProgress(job: JobRow): string {
  if (job.progress_total == null) return String(job.progress_done);
  return `${job.progress_done} of ${job.progress_total}`;
}

function JobTable({
  SG,
  dataset,
  pagination,
  defaultStates,
}: {
  SG: typeof import("slickgrid-react");
  dataset: JobRow[];
  pagination: GridPagination;
  defaultStates: readonly JobState[] | null;
}) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [gridOptions, setGridOptions] = useState<GridOption | undefined>(
    undefined,
  );
  const reactGridRef = useRef<SlickgridReactInstance | null>(null);
  const paginationGridOptions = useRoutePaginationGridOptions(
    pagination,
    dataset,
  );
  const cancelFetcher = useFetcher<typeof action>();

  const { Filters, SlickgridReact } = SG;

  useEffect(() => {
    syncRoutePaginationGrid(reactGridRef.current, pagination);
  }, [dataset, pagination]);

  useEffect(() => {
    defineGrid();
  }, [paginationGridOptions, defaultStates]);

  function defineGrid() {
    const cols: Column<JobRow>[] = [
      {
        id: "id",
        name: "ID",
        field: "id",
        type: "integer",
        filterable: true,
        sortable: true,
      },
      {
        id: "label",
        name: "Label",
        field: "label",
        type: "string",
        filterable: false,
        sortable: false,
        formatter: (_row, _cell, value) => escapeText(String(value ?? "")),
      },
      {
        id: "kind",
        name: "Kind",
        field: "kind",
        type: "string",
        filterable: true,
        sortable: true,
        formatter: (_row, _cell, value) => escapeText(String(value ?? "")),
      },
      {
        id: "state",
        name: "State",
        field: "state",
        type: "string",
        filterable: true,
        filter: {
          collection: ALL_JOB_STATES.map((state) => ({
            value: state,
            label: state,
          })),
          model: Filters.multipleSelect,
          // No `searchTerms` here: a column's own terms are discarded when the grid
          // applies presets, so the default arrives through `stateFilterPreset`.
        },
        sortable: true,
        formatter: (_row, _cell, _value, _columnDef, dataContext) =>
          `<span class="badge ${STATE_BADGE_CLASS[dataContext.state]}">${
            dataContext.state
          }</span>`,
      },
      {
        id: "progress_done",
        name: "Progress",
        field: "progress_done",
        type: "integer",
        filterable: false,
        sortable: true,
        formatter: (_row, _cell, _value, _columnDef, dataContext) =>
          escapeText(formatProgress(dataContext)),
      },
      {
        id: "created_at",
        name: "Created",
        field: "created_at",
        type: "date",
        filterable: false,
        sortable: true,
        formatter: (_row, _cell, value) =>
          formatTimestamp(value as string | null),
      },
      {
        id: "started_at",
        name: "Started",
        field: "started_at",
        type: "date",
        filterable: false,
        sortable: true,
        formatter: (_row, _cell, value) =>
          formatTimestamp(value as string | null),
      },
      {
        id: "finished_at",
        name: "Finished",
        field: "finished_at",
        type: "date",
        filterable: false,
        sortable: true,
        formatter: (_row, _cell, value) =>
          formatTimestamp(value as string | null),
      },
      {
        id: "error",
        name: "Error",
        field: "error",
        type: "string",
        filterable: false,
        sortable: false,
        formatter: (_row, _cell, value) => escapeText(String(value ?? "")),
      },
    ];

    const commandItems: MenuCommandItem[] = [
      {
        command: "cancel",
        title: "Cancel job",
        iconCssClass: "fas fa-ban fa-fw",
        itemVisibilityOverride: (args) =>
          canCancelJob(args.dataContext as JobRow),
        action: (_event, args) => {
          const job = args.dataContext as JobRow;
          if (!canCancelJob(job)) return;
          void cancelFetcher.submit({ id: String(job.id) }, { method: "post" });
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
      // The route's own filters, which the preset it parsed from the URL already
      // carries, then the page default when the route named no state. The box has to
      // show what the request asked for, and a column's own terms do not survive the
      // presets, so this is the only channel that works.
      presets: {
        ...paginationGridOptions.presets,
        filters: [
          ...(paginationGridOptions.presets?.filters ?? []),
          ...stateFilterPreset(defaultStates),
        ],
      },
      autoResize: { container: "#job-grid-container" },
      enableAutoResize: true,
    });
  }

  function reactGridReady(reactGrid: SlickgridReactInstance) {
    reactGridRef.current = reactGrid;
  }

  return (
    <>
      {cancelFetcher.data?.error && (
        <Alert variant="danger">{cancelFetcher.data.error}</Alert>
      )}
      {cancelFetcher.data?.success && (
        <Alert variant="success">{cancelFetcher.data.success}</Alert>
      )}
      <div className="slickgrid-container" id="job-grid-container">
        {gridOptions && (
          <SlickgridReact
            gridId="sourceJobs-grid"
            columns={columns}
            options={gridOptions}
            dataset={dataset}
            onReactGridCreated={(e) => reactGridReady(e.detail)}
          />
        )}
      </div>
    </>
  );
}

export function HydrateFallback() {
  return <div>Loading background jobs...</div>;
}

export default function BackgroundJobs({ loaderData }: Route.ComponentProps) {
  const { SG, dataset, pagination, defaultStates, loaderError } = loaderData;
  const revalidator = useRevalidator();
  const queueActive = hasActiveJobs(dataset);

  useEffect(() => {
    if (!queueActive) return;

    const timer = setInterval(() => {
      // A revalidation still in flight would otherwise stack on the next tick.
      if (revalidator.state !== "idle") return;
      void revalidator.revalidate();
    }, JOBS_POLL_INTERVAL_MS);

    return () => {
      clearInterval(timer);
    };
  }, [queueActive, revalidator]);

  return createPageContent({
    title: "Background Jobs",
    header: (
      <>
        <h2 className="py-2">Background Jobs</h2>
      </>
    ),
    main: (
      <>
        <div className="mb-3 text-muted">
          Deferred work performed by the backend job queue.
          {queueActive
            ? " This page refreshes every few seconds while work is pending or running."
            : ""}
        </div>

        <JobTable
          SG={SG}
          dataset={dataset}
          pagination={pagination}
          defaultStates={defaultStates}
        />
      </>
    ),
    alerts: loaderError ? { error: loaderError } : undefined,
  });
}
