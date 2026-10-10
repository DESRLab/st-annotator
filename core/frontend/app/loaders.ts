import type { CurrentFilter, CurrentSorter } from "@slickgrid-universal/common";
import { data, redirect, type Session } from "react-router";

import type {
  JobState,
  OAuth2Token,
  Role,
  UserPublic as User,
} from "../client";
import { refreshAuthRefreshPost, whoamiAuthWhoamiGet } from "../client/sdk.gen";

import {
  GRID_FILTERS_PARAM,
  GRID_SORT_PARAM,
  getFilterDateRange,
  getFilterSearchTerms,
  parseGridFilters,
  parseGridSorters,
  serializeGridFilters,
} from "./components/slickgrid/pagination";
import { totalItemsFromContentRange } from "./content-range";
import { getSession, destroySession, commitSession } from "./sessions";

export async function getCurrentSession(request: Request) {
  return getSession(request.headers.get("Cookie"));
}

export async function dataAndCommit<T>(dat: T, session: Session) {
  return data(dat, {
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  });
}

export async function redirectAndCommit(url: string, session: Session) {
  return redirect(url, {
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  });
}

export async function redirectAndDestroy(url: string, session: Session) {
  return redirect(url, {
    headers: {
      "Set-Cookie": await destroySession(session),
    },
  });
}

export function getUser(session: Session): User | undefined {
  return session.get("user");
}

export function clearUser(session: Session) {
  session.unset("user");
}

export interface AccessTokenSession {
  session: Session;
  token: OAuth2Token;
}

export interface AuthenticatedSession extends AccessTokenSession {
  user: User;
}

export interface AuthenticationOptions {
  redirectTo?: string;
}

const SESSION_EXPIRED_MESSAGE =
  "Your session has expired. Please log in again.";

/**
 * Loads the current session and token, returning the standard login redirect
 * when the token is missing. Route loaders/actions should return the Response
 * unchanged when this helper does not return a session context.
 */
export async function loadAccessTokenSession(
  request: Request,
  { redirectTo = "/login" }: AuthenticationOptions = {},
): Promise<AccessTokenSession | Response> {
  const session = await getCurrentSession(request);
  const token = session.get("token");
  if (!token) {
    clearUser(session);
    session.flash("error", SESSION_EXPIRED_MESSAGE);
    return redirectAndCommit(redirectTo, session);
  }

  return { session, token };
}

/** Loads the current token and cached user using the standard failure path. */
export async function loadAuthenticatedSession(
  request: Request,
  options?: AuthenticationOptions,
): Promise<AuthenticatedSession | Response> {
  const tokenSession = await loadAccessTokenSession(request, options);
  if (tokenSession instanceof Response) return tokenSession;

  const user = getUser(tokenSession.session);
  if (!user) {
    tokenSession.session.flash("error", SESSION_EXPIRED_MESSAGE);
    return redirectAndCommit(
      options?.redirectTo ?? "/login",
      tokenSession.session,
    );
  }

  return { ...tokenSession, user };
}

/** Loads the current token and refreshes the user from the authentication API. */
export async function loadRefreshedAuthenticatedSession(
  request: Request,
  options?: AuthenticationOptions,
): Promise<AuthenticatedSession | Response> {
  const tokenSession = await loadAccessTokenSession(request, options);
  if (tokenSession instanceof Response) return tokenSession;

  const previousAccessToken = tokenSession.token.access_token;
  const user = await refreshUser(tokenSession.session);
  if (!user) {
    tokenSession.session.flash("error", SESSION_EXPIRED_MESSAGE);
    return redirectAndCommit(
      options?.redirectTo ?? "/login",
      tokenSession.session,
    );
  }

  const refreshedToken = tokenSession.session.get("token");
  if (refreshedToken && refreshedToken.access_token !== previousAccessToken) {
    // A parent and its child loaders run in parallel from the same incoming
    // cookie. Redirect after rotation so a child cannot overwrite the new
    // token with a Set-Cookie built from the stale session.
    const url = new URL(request.url);
    return redirectAndCommit(
      `${url.pathname}${url.search}`,
      tokenSession.session,
    );
  }

  return {
    session: tokenSession.session,
    token: refreshedToken ?? tokenSession.token,
    user,
  };
}

/** Loads an authenticated session and enforces one required application role. */
export async function loadAuthorizedSession(
  request: Request,
  role: Role,
  options?: AuthenticationOptions,
): Promise<AuthenticatedSession | Response> {
  const authenticated = await loadAuthenticatedSession(request, options);
  if (authenticated instanceof Response) return authenticated;

  if (!authenticated.user.roles.includes(role)) {
    authenticated.session.flash(
      "error",
      `You lack the '${role}' role to view this page.`,
    );
    return redirectAndCommit("/", authenticated.session);
  }

  return authenticated;
}

/**
 * Exchanges the current refresh token for a new access token pair and stores it
 * in the session. Returns undefined when no refresh token exists or the refresh
 * endpoint rejected the request, so callers can fall back to their own failure
 * path. Shared by the layout loaders (via `refreshUser`) and the browser API
 * proxy, which is the only place editor traffic can be refreshed.
 */
export async function refreshAccessToken(
  session: Session,
  token: OAuth2Token,
): Promise<OAuth2Token | undefined> {
  if (!token.refresh_token) return undefined;

  const refreshed = await refreshAuthRefreshPost({
    headers: { Cookie: `refresh_token=${token.refresh_token}` },
  });
  if (!refreshed.data) return undefined;

  session.set("token", refreshed.data);
  return refreshed.data;
}

export async function refreshUser(session: Session) {
  let token = session.get("token");
  if (!token) {
    clearUser(session);
    return null;
  }

  let res = await whoamiAuthWhoamiGet({ auth: token.access_token });
  if (!res.data && res.response?.status === 401) {
    const refreshed = await refreshAccessToken(session, token);
    if (refreshed) {
      token = refreshed;
      res = await whoamiAuthWhoamiGet({ auth: token.access_token });
    }
  }

  if (!res.data) {
    clearUser(session);
    session.unset("token");
    return null;
  }

  session.set("user", res.data);
  return res.data;
}

export const GRID_PAGE_SIZES = [25, 50, 100, 250, 500] as const;
export const DEFAULT_GRID_PAGE_SIZE = 100;

/** Parses a strict, decimal, positive route identifier. */
export function parsePositiveInteger(
  value: string | null | undefined,
): number | null {
  if (value == null || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export interface GridPagination {
  pageNumber: number;
  pageSize: number;
  pageSizes: number[];
  totalItems: number;
}

export interface GridPaginationRequest {
  offset: number;
  limit: number;
  pageNumber: number;
  pageSize: number;
}

function parsePositivePaginationInteger(
  value: string | null,
  fallback: number,
) {
  if (value == null) return fallback;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getGridPaginationRequest(
  request: Request,
): GridPaginationRequest {
  const searchParams = new URL(request.url).searchParams;
  const pageNumber = parsePositivePaginationInteger(
    searchParams.get("page"),
    1,
  );
  const requestedPageSize = parsePositivePaginationInteger(
    searchParams.get("pageSize"),
    DEFAULT_GRID_PAGE_SIZE,
  );
  const pageSize = GRID_PAGE_SIZES.includes(
    requestedPageSize as (typeof GRID_PAGE_SIZES)[number],
  )
    ? requestedPageSize
    : DEFAULT_GRID_PAGE_SIZE;

  return {
    offset: (pageNumber - 1) * pageSize,
    limit: pageSize,
    pageNumber,
    pageSize,
  };
}

export async function listGridPage<T, E = unknown>(
  request: Request,
  loadPage: (pagination: {
    offset: number;
    limit: number;
  }) => Promise<ListPage<T, E> & { response?: Response }>,
) {
  const { offset, limit, pageNumber, pageSize } =
    getGridPaginationRequest(request);
  const page = await loadPage({ offset, limit });
  const data = page.data ?? [];
  const fallbackTotalItems = offset + data.length;

  return {
    data,
    error: page.error,
    pagination: {
      pageNumber,
      pageSize,
      pageSizes: [...GRID_PAGE_SIZES],
      totalItems: totalItemsFromContentRange(page.response, fallbackTotalItems),
    } satisfies GridPagination,
  };
}

export interface ListPage<T, E = unknown> {
  data?: T[];
  error?: E;
}

export interface GridStateRequest {
  filters: CurrentFilter[];
  sorters: CurrentSorter[];
}

export function getGridStateRequest(request: Request): GridStateRequest {
  const searchParams = new URL(request.url).searchParams;
  return {
    filters: parseGridFilters(searchParams.get(GRID_FILTERS_PARAM)),
    sorters: parseGridSorters(searchParams.get(GRID_SORT_PARAM)),
  };
}

export type GridQuery = Record<string, unknown>;

/** Every state a queue row can hold, in the order the queue page lists them. */
export const ALL_JOB_STATES: readonly JobState[] = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
];

/**
 * A link to the queue page showing exactly the jobs `jobIds` names.
 *
 * The states are pinned to the whole set alongside them, because the queue page hides the
 * jobs that finished: a link written by a save whose sweep has already run would otherwise
 * land on an empty list, which reads as the job having vanished rather than completed. The
 * page reads this back through `getGridStateRequest`, so a shared builder keeps the two
 * directions of the `filters` contract from drifting apart.
 */
export function jobsQueueHref(jobIds: readonly number[]): string {
  if (jobIds.length === 0) return "/jobs";

  const filters = serializeGridFilters([
    {
      columnId: "id",
      operator: "IN",
      searchTerms: jobIds.map((id) => String(id)),
    },
    {
      columnId: "state",
      operator: "IN",
      searchTerms: [...ALL_JOB_STATES],
    },
  ]);

  return `/jobs?${GRID_FILTERS_PARAM}=${encodeURIComponent(filters ?? "")}`;
}

/**
 * The queue rows a write reported, from the generated client's response.
 *
 * An empty list is a real answer, not a missing one: a save that changed nothing a derived
 * value depends on, or whose work is already waiting, started no job at all. Pairing this
 * with `jobsQueueHref` lets a caller say what began and link to exactly those rows.
 */
export function reportedJobIds(res: {
  data?: { job_ids?: number[] | null } | null;
}): number[] {
  return (res.data?.job_ids ?? []).filter((id): id is number => id != null);
}

const EXACT_MATCH_OPERATORS = new Set(["=", "EQ", "Equals", "IN"]);
const GREATER_EQUAL_OPERATORS = new Set([">=", "GE"]);
const LESS_EQUAL_OPERATORS = new Set(["<=", "LE"]);

/**
 * Applies a numeric (id) column filter with eq/ge/le semantics; unsupported operators are
 * ignored. An exact match may name several values, a range only its bound.
 */
export function applyNumericFilterToQuery(
  query: GridQuery,
  filter: CurrentFilter,
  paramName: string,
): void {
  const values = [
    ...new Set(
      getFilterSearchTerms(filter)
        .map((term) => Number(term))
        .filter((value) => Number.isFinite(value)),
    ),
  ];
  const [first] = values;
  if (first == null) return;

  const operator = String(filter.operator ?? "");
  if (GREATER_EQUAL_OPERATORS.has(operator)) query[`${paramName}_ge`] = first;
  else if (LESS_EQUAL_OPERATORS.has(operator)) query[`${paramName}_le`] = first;
  // An exact match names every value it carries, so one request can ask for the exact
  // rows a write reported. A lone value stays a scalar, which is both what every other
  // grid route already sends and the same thing on the wire.
  else if (operator === "" || EXACT_MATCH_OPERATORS.has(operator))
    query[paramName] = values.length === 1 ? first : values;
}

/** Applies a text column filter: exact equality for Equals, containment otherwise. */
export function applyTextFilterToQuery(
  query: GridQuery,
  filter: CurrentFilter,
  paramName: string,
): void {
  const [term] = getFilterSearchTerms(filter);
  if (term == null) return;

  if (EXACT_MATCH_OPERATORS.has(String(filter.operator ?? "")))
    query[paramName] = term;
  else query[`${paramName}_contains`] = term;
}

/** Applies a multi-select filter as a repeated (list) param. */
export function applyInFilterToQuery(
  query: GridQuery,
  filter: CurrentFilter,
  paramName: string,
): void {
  const terms = getFilterSearchTerms(filter);
  if (terms.length === 0) return;

  query[paramName] = terms;
}

/** Applies a date-range filter as ge/lt params. */
export function applyDateFilterToQuery(
  query: GridQuery,
  filter: CurrentFilter,
  paramName: string,
): void {
  const bounds = getFilterDateRange(filter);
  if (bounds.ge != null) query[`${paramName}_ge`] = bounds.ge;
  if (bounds.lt != null) query[`${paramName}_lt`] = bounds.lt;
}

/** Applies the first sorter when its column is server-side sortable. */
export function applySortersToQuery(
  query: GridQuery,
  sorters: CurrentSorter[],
  sortableColumns: ReadonlySet<string>,
): void {
  const [sorter] = sorters;
  if (sorter == null) return;

  const columnId = String(sorter.columnId);
  if (!sortableColumns.has(columnId)) return;

  query.sort_by = columnId;
  query.sort_dir = sorter.direction;
}
