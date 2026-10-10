/**
 * The `Content-Range` convention shared by every paginated list endpoint.
 *
 * The backend pages its list responses with a `Content-Range: <unit> <from>-<to>/<total>`
 * header rather than a wrapper body, so a caller that only needs the total -- a summary
 * count, a pager -- reads it straight off the response. It lives here, between the app's
 * own grid loader and the plugin-facing facade, because both parse the same header and a
 * second dialect would let a total quietly disagree with a page.
 */
export function totalItemsFromContentRange(
  response: Response | undefined,
  fallback = 0,
): number {
  const contentRange = response?.headers.get("Content-Range") ?? "";
  const match = /\/(\d+)$/.exec(contentRange);

  return match ? Number.parseInt(match[1], 10) : fallback;
}
