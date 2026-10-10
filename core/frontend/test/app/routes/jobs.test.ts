import { describe, expect, it } from "vitest";

import type { JobPublic } from "../../../client";
import {
  DEFAULT_VISIBLE_JOB_STATES,
  buildJobsQuery,
  canCancelJob,
  hasActiveJobs,
  mapJobRows,
  requestedJobStates,
  stateFilterPreset,
} from "../../../app/routes/jobs";

function job(overrides: Partial<JobPublic>): JobPublic {
  return {
    id: 1,
    kind: "pcd.reconcile_bounds",
    dedupe_key: "pcd.reconcile_bounds:7",
    payload: { group_id: 7 },
    label: "Derive spatial bounds for point clouds in source group #7",
    state: "pending",
    progress_done: 0,
    progress_total: null,
    error: null,
    created_by_id: 3,
    created_at: "2026-01-01T00:00:00+00:00",
    started_at: null,
    finished_at: null,
    ...overrides,
  };
}

describe("jobs route job grid state", () => {
  it("maps the server-supported filters and sorters only", () => {
    expect(
      buildJobsQuery({
        filters: [
          { columnId: "id", operator: "=", searchTerms: ["12"] },
          { columnId: "kind", operator: "Contains", searchTerms: ["bounds"] },
          { columnId: "state", operator: "=", searchTerms: ["failed"] },
          { columnId: "label", operator: "Contains", searchTerms: ["ignored"] },
        ],
        sorters: [{ columnId: "created_at", direction: "desc" }],
      }),
    ).toEqual({
      id: 12,
      // `kind` has no containment parameter, so the term is sent as equality.
      kind: "bounds",
      state: ["failed"],
      sort_by: "created_at",
      sort_dir: "desc",
    });
  });

  it("drops an unsupported state term instead of sending a rejected query", () => {
    // `queued` is no JobState, so a request naming it would be rejected outright; with
    // nothing valid left to ask for, the page lists what it lists by default.
    expect(
      buildJobsQuery({
        filters: [
          { columnId: "state", operator: "=", searchTerms: ["queued"] },
        ],
        sorters: [{ columnId: "payload", direction: "asc" }],
      }),
    ).toEqual({ state: [...DEFAULT_VISIBLE_JOB_STATES] });
  });

  it("carries the display fields and omits the opaque payload", () => {
    const [row] = mapJobRows([job({ state: "succeeded", progress_total: 4 })]);

    expect(row).toEqual({
      id: 1,
      kind: "pcd.reconcile_bounds",
      state: "succeeded",
      label: "Derive spatial bounds for point clouds in source group #7",
      progress_done: 0,
      progress_total: 4,
      created_at: "2026-01-01T00:00:00+00:00",
      started_at: null,
      finished_at: null,
      error: "",
    });
  });

  it("keeps a failure message for display", () => {
    const [row] = mapJobRows([job({ state: "failed", error: "unreadable" })]);

    expect(row?.state).toBe("failed");
    expect(row?.error).toBe("unreadable");
  });
});

describe("jobs route shows every job by default", () => {
  it("asks for every state when the route names none", () => {
    expect(buildJobsQuery({ filters: [], sorters: [] })).toEqual({
      state: ["pending", "running", "succeeded", "failed", "cancelled"],
    });
    expect(DEFAULT_VISIBLE_JOB_STATES).toEqual([
      "pending",
      "running",
      "succeeded",
      "failed",
      "cancelled",
    ]);
  });

  it("honours an explicit selection instead of the default", () => {
    expect(
      buildJobsQuery({
        filters: [
          { columnId: "state", operator: "IN", searchTerms: ["succeeded"] },
        ],
        sorters: [],
      }),
    ).toEqual({ state: ["succeeded"] });
  });

  it("keeps every state a multi-select filter picked, once and in catalog order", () => {
    expect(
      requestedJobStates([
        {
          columnId: "state",
          operator: "IN",
          searchTerms: ["failed", "pending", "failed", "cancelled"],
        },
      ]),
    ).toEqual(["pending", "failed", "cancelled"]);
  });

  it("treats a cleared state filter as no selection at all", () => {
    expect(
      requestedJobStates([
        { columnId: "state", operator: "IN", searchTerms: [] },
        {
          columnId: "kind",
          operator: "=",
          searchTerms: ["pcd.reconcile_bounds"],
        },
      ]),
    ).toBeUndefined();

    expect(
      buildJobsQuery({
        filters: [
          {
            columnId: "kind",
            operator: "=",
            searchTerms: ["pcd.reconcile_bounds"],
          },
        ],
        sorters: [],
      }),
    ).toEqual({
      kind: "pcd.reconcile_bounds",
      state: [...DEFAULT_VISIBLE_JOB_STATES],
    });
  });
});

describe("jobs route state filter preset", () => {
  it("carries the default, because a column's own terms do not survive presets", () => {
    expect(stateFilterPreset(DEFAULT_VISIBLE_JOB_STATES)).toEqual([
      {
        columnId: "state",
        operator: "IN",
        searchTerms: ["pending", "running", "succeeded", "failed", "cancelled"],
      },
    ]);
  });

  it("stays out of the way of a selection the route's own preset brings", () => {
    expect(stateFilterPreset(null)).toEqual([]);
  });

  it("shows in the filter box exactly the states the request will carry", () => {
    const [preset] = stateFilterPreset(DEFAULT_VISIBLE_JOB_STATES);

    // The two halves of the default are one rule read twice: a box that disagreed with
    // the query would be the silent-stale-UI failure the page exists to avoid.
    expect(preset?.searchTerms).toEqual(
      buildJobsQuery({ filters: [], sorters: [] }).state,
    );
  });
});

describe("jobs route auto-refresh condition", () => {
  it("polls only while a job may still change", () => {
    expect(hasActiveJobs([])).toBe(false);
    expect(
      hasActiveJobs([
        { state: "succeeded" },
        { state: "failed" },
        { state: "cancelled" },
      ]),
    ).toBe(false);
    expect(hasActiveJobs([{ state: "succeeded" }, { state: "running" }])).toBe(
      true,
    );
    expect(hasActiveJobs([{ state: "pending" }])).toBe(true);
  });
});

describe("jobs route cancellation eligibility", () => {
  it("offers cancellation only while a job is running", () => {
    expect(canCancelJob({ state: "pending" })).toBe(false);
    expect(canCancelJob({ state: "running" })).toBe(true);
    expect(canCancelJob({ state: "succeeded" })).toBe(false);
    expect(canCancelJob({ state: "failed" })).toBe(false);
    expect(canCancelJob({ state: "cancelled" })).toBe(false);
  });
});
