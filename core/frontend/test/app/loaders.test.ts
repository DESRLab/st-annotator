import { describe, expect, it } from "vitest";

import {
  ALL_JOB_STATES,
  applyDateFilterToQuery,
  applyInFilterToQuery,
  applyNumericFilterToQuery,
  applySortersToQuery,
  applyTextFilterToQuery,
  DEFAULT_GRID_PAGE_SIZE,
  getGridPaginationRequest,
  getGridStateRequest,
  GRID_PAGE_SIZES,
  jobsQueueHref,
  listGridPage,
  loadAccessTokenSession,
  loadAuthenticatedSession,
  loadAuthorizedSession,
} from "../../app/loaders";
import { commitSession, getSession } from "../../app/sessions";

function requestWithParams(params: string) {
  return new Request(`http://localhost/grid${params ? `?${params}` : ""}`);
}

async function requestWithSession(values: Record<string, unknown>) {
  const session = await getSession();
  for (const [key, value] of Object.entries(values)) session.set(key, value);
  return new Request("http://localhost/protected", {
    headers: { Cookie: await commitSession(session) },
  });
}

describe("session authentication helpers", () => {
  it("returns the session token and cached user for authenticated requests", async () => {
    const user = { id: 7, username: "alex", roles: ["admin"] };
    const request = await requestWithSession({
      token: { access_token: "access", token_type: "bearer" },
      user,
    });

    const tokenSession = await loadAccessTokenSession(request);
    expect(tokenSession).not.toBeInstanceOf(Response);
    expect(
      (tokenSession as { token: { access_token: string } }).token.access_token,
    ).toBe("access");

    const authenticated = await loadAuthenticatedSession(request);
    expect(authenticated).not.toBeInstanceOf(Response);
    expect((authenticated as { user: typeof user }).user).toEqual(user);
  });

  it("uses the standard login redirect when authentication is incomplete", async () => {
    const response = await loadAuthenticatedSession(
      await requestWithSession({
        token: { access_token: "access", token_type: "bearer" },
      }),
    );

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).headers.get("Location")).toBe("/login");
  });

  it("enforces required roles with the standard authorization redirect", async () => {
    const response = await loadAuthorizedSession(
      await requestWithSession({
        token: { access_token: "access", token_type: "bearer" },
        user: { id: 7, username: "alex", roles: ["annotator"] },
      }),
      "admin",
    );

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).headers.get("Location")).toBe("/");
  });
});

describe("getGridPaginationRequest", () => {
  it("defaults to the first page of 100 items", () => {
    const pagination = getGridPaginationRequest(requestWithParams(""));

    expect(pagination).toEqual({
      offset: 0,
      limit: DEFAULT_GRID_PAGE_SIZE,
      pageNumber: 1,
      pageSize: DEFAULT_GRID_PAGE_SIZE,
    });
  });

  it("computes offset and limit from page and pageSize", () => {
    const pagination = getGridPaginationRequest(
      requestWithParams("page=3&pageSize=50"),
    );

    expect(pagination).toEqual({
      offset: 100,
      limit: 50,
      pageNumber: 3,
      pageSize: 50,
    });
  });

  it("only accepts page sizes from the whitelist", () => {
    for (const pageSize of GRID_PAGE_SIZES) {
      const pagination = getGridPaginationRequest(
        requestWithParams(`pageSize=${pageSize}`),
      );
      expect(pagination.pageSize).toBe(pageSize);
    }

    expect(
      getGridPaginationRequest(requestWithParams("pageSize=7")).pageSize,
    ).toBe(DEFAULT_GRID_PAGE_SIZE);
    expect(
      getGridPaginationRequest(requestWithParams("pageSize=0")).pageSize,
    ).toBe(DEFAULT_GRID_PAGE_SIZE);
    expect(
      getGridPaginationRequest(requestWithParams("pageSize=huge")).pageSize,
    ).toBe(DEFAULT_GRID_PAGE_SIZE);
  });

  it("falls back to page 1 for invalid page values", () => {
    for (const params of ["page=0", "page=-2", "page=abc"]) {
      const pagination = getGridPaginationRequest(requestWithParams(params));
      expect(pagination.pageNumber).toBe(1);
      expect(pagination.offset).toBe(0);
    }
  });
});

describe("getGridStateRequest", () => {
  it("parses filter and sort URL params", () => {
    const filters = encodeURIComponent(
      JSON.stringify([
        {
          columnId: "name",
          operator: "Contains",
          searchTerms: ["kit"],
        },
      ]),
    );
    const state = getGridStateRequest(
      requestWithParams(`filters=${filters}&sort=name:desc`),
    );

    expect(state.filters).toEqual([
      { columnId: "name", operator: "Contains", searchTerms: ["kit"] },
    ]);
    expect(state.sorters).toEqual([{ columnId: "name", direction: "desc" }]);
  });

  it("returns empty state when params are missing or invalid", () => {
    expect(getGridStateRequest(requestWithParams(""))).toEqual({
      filters: [],
      sorters: [],
    });
    expect(
      getGridStateRequest(requestWithParams("filters=oops&sort=oops")),
    ).toEqual({ filters: [], sorters: [] });
  });
});

describe("applyNumericFilterToQuery", () => {
  it("maps empty and exact operators to equality", () => {
    const query = {};
    applyNumericFilterToQuery(
      query,
      { columnId: "id", operator: "", searchTerms: ["5"] },
      "id",
    );
    expect(query).toEqual({ id: 5 });

    applyNumericFilterToQuery(
      query,
      { columnId: "id", operator: "EQ", searchTerms: ["7"] },
      "frame_id",
    );
    expect(query).toEqual({ id: 5, frame_id: 7 });
  });

  it("maps range operators to ge/le params", () => {
    const query = {};
    applyNumericFilterToQuery(
      query,
      { columnId: "id", operator: "GE", searchTerms: ["3"] },
      "id",
    );
    applyNumericFilterToQuery(
      query,
      { columnId: "id", operator: "<=", searchTerms: ["9"] },
      "id",
    );
    expect(query).toEqual({ id_ge: 3, id_le: 9 });
  });

  it("ignores unsupported operators and non-numeric terms", () => {
    const query = {};
    applyNumericFilterToQuery(
      query,
      { columnId: "id", operator: "Contains", searchTerms: ["5"] },
      "id",
    );
    applyNumericFilterToQuery(
      query,
      { columnId: "id", operator: "", searchTerms: ["abc"] },
      "id",
    );
    applyNumericFilterToQuery(
      query,
      { columnId: "id", operator: "", searchTerms: [] },
      "id",
    );
    expect(query).toEqual({});
  });

  it("keeps a lone exact value a scalar and names several as a list", () => {
    const query = {};
    applyNumericFilterToQuery(
      query,
      { columnId: "id", operator: "IN", searchTerms: ["12"] },
      "id",
    );
    expect(query).toEqual({ id: 12 });

    // Several values are what lets one request name the exact jobs a write reported.
    applyNumericFilterToQuery(
      query,
      { columnId: "id", operator: "IN", searchTerms: ["12", "13", "12"] },
      "id",
    );
    expect(query).toEqual({ id: [12, 13] });
  });

  it("drops a non-numeric term but keeps the values beside it", () => {
    const query = {};
    applyNumericFilterToQuery(
      query,
      { columnId: "id", operator: "IN", searchTerms: ["12", "draft"] },
      "id",
    );
    expect(query).toEqual({ id: 12 });
  });
});

describe("jobsQueueHref", () => {
  it("survives the round trip from the link to the request it writes", () => {
    // The notice builds this URL and the queue page parses it back; if the two disagreed,
    // the link would silently name jobs its own page then hides.
    const href = jobsQueueHref([12, 13]);

    expect(getGridStateRequest(new Request(`http://localhost${href}`))).toEqual(
      {
        filters: [
          { columnId: "id", operator: "IN", searchTerms: ["12", "13"] },
          {
            columnId: "state",
            operator: "IN",
            searchTerms: [...ALL_JOB_STATES],
          },
        ],
        sorters: [],
      },
    );
  });

  it("asks for every state, so a job that already finished is still shown", () => {
    const { filters } = getGridStateRequest(
      new Request(`http://localhost${jobsQueueHref([7])}`),
    );
    const states = filters.find((filter) => filter.columnId === "state");

    expect(states?.searchTerms).toEqual([...ALL_JOB_STATES]);
    expect(ALL_JOB_STATES).toContain("succeeded");
  });

  it("falls back to the whole queue when the write reported nothing", () => {
    expect(jobsQueueHref([])).toBe("/jobs");
  });
});

describe("applyTextFilterToQuery", () => {
  it("uses containment for non-exact operators", () => {
    const query = {};
    applyTextFilterToQuery(
      query,
      { columnId: "name", operator: "Contains", searchTerms: ["sem"] },
      "name",
    );
    expect(query).toEqual({ name_contains: "sem" });
  });

  it("uses exact equality for exact-match operators", () => {
    const query = {};
    applyTextFilterToQuery(
      query,
      {
        columnId: "name",
        operator: "Equals",
        searchTerms: ["SemanticKITTI"],
      },
      "name",
    );
    expect(query).toEqual({ name: "SemanticKITTI" });
  });

  it("ignores empty terms", () => {
    const query = {};
    applyTextFilterToQuery(
      query,
      { columnId: "name", operator: "Contains", searchTerms: [""] },
      "name",
    );
    expect(query).toEqual({});
  });
});

describe("applyInFilterToQuery", () => {
  it("maps all terms to a list param", () => {
    const query = {};
    applyInFilterToQuery(
      query,
      {
        columnId: "roles",
        operator: "IN",
        searchTerms: ["admin", "annotator"],
      },
      "roles",
    );
    expect(query).toEqual({ roles: ["admin", "annotator"] });
  });

  it("ignores filters without terms", () => {
    const query = {};
    applyInFilterToQuery(
      query,
      { columnId: "roles", operator: "IN", searchTerms: [] },
      "roles",
    );
    expect(query).toEqual({});
  });
});

describe("applyDateFilterToQuery", () => {
  it("maps inclusive ranges to ge/lt bounds widened by a day", () => {
    const query = {};
    applyDateFilterToQuery(
      query,
      {
        columnId: "created",
        operator: "RangeInclusive",
        searchTerms: ["2026-08-01", "2026-08-04"],
      },
      "created",
    );
    expect(query).toEqual({
      created_ge: "2026-08-01",
      created_lt: "2026-08-05",
    });
  });

  it("maps one-sided ranges to a single bound", () => {
    const query = {};
    applyDateFilterToQuery(
      query,
      {
        columnId: "created",
        operator: "RangeInclusive",
        searchTerms: [null, "2026-08-31"],
      },
      "created",
    );
    expect(query).toEqual({ created_lt: "2026-09-01" });
  });
});

describe("applySortersToQuery", () => {
  const sortable = new Set(["name", "id"]);

  it("applies the first sorter when the column is sortable", () => {
    const query = {};
    applySortersToQuery(
      query,
      [{ columnId: "name", direction: "desc" }],
      sortable,
    );
    expect(query).toEqual({ sort_by: "name", sort_dir: "desc" });
  });

  it("ignores sorters on non-sortable columns", () => {
    const query = {};
    applySortersToQuery(
      query,
      [{ columnId: "members", direction: "asc" }],
      sortable,
    );
    expect(query).toEqual({});
  });

  it("ignores empty sorter lists", () => {
    const query = {};
    applySortersToQuery(query, [], sortable);
    expect(query).toEqual({});
  });
});

describe("listGridPage", () => {
  it("reads totalItems from the Content-Range header", async () => {
    const response = new Response(null, {
      headers: { "Content-Range": "items 0-24/137" },
    });
    const page = await listGridPage(
      requestWithParams("page=1&pageSize=25"),
      async () => ({
        data: Array.from({ length: 25 }, (_, i) => i),
        response,
      }),
    );

    expect(page.data).toHaveLength(25);
    expect(page.pagination.totalItems).toBe(137);
    expect(page.pagination.pageNumber).toBe(1);
    expect(page.pagination.pageSize).toBe(25);
    expect(page.pagination.pageSizes).toEqual([...GRID_PAGE_SIZES]);
  });

  it("falls back to offset + page length without a Content-Range header", async () => {
    const page = await listGridPage(
      requestWithParams("page=2&pageSize=100"),
      async ({ offset, limit }) => ({
        data: Array.from({ length: limit }, (_, i) => offset + i),
      }),
    );

    expect(page.pagination.totalItems).toBe(200);
  });

  it("passes the requested window to the loader", async () => {
    let requested: { offset: number; limit: number } | undefined;
    await listGridPage(
      requestWithParams("page=4&pageSize=50"),
      async (pagination) => {
        requested = pagination;
        return { data: [] };
      },
    );

    expect(requested).toEqual({ offset: 150, limit: 50 });
  });
});
