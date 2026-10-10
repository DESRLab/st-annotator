import { backendUrl } from "../backend.server";
import { loadAccessTokenSession, refreshAccessToken } from "../loaders";
import { commitSession } from "../sessions";

import type { Route } from "./+types/backend-proxy";

/**
 * Headers the browser is allowed to hand to the backend. The assisted
 * segmentation endpoints declare `X-Num-Points`, `X-Pcd-Id` and `X-Labels` as
 * required header params, so they must survive the proxy or every encode and
 * predict request 422s before reaching the assistant. Identity headers are
 * deliberately excluded and re-derived server-side: `Authorization` is replaced
 * below with the bearer from the signed session, and `X-User-Id` is injected by
 * the backend from the authenticated principal (it warns against accepting it
 * from the browser), so forwarding either would be a spoofing hole.
 */
const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "content-type",
  "if-match",
  "range",
  "x-num-points",
  "x-pcd-id",
  "x-labels",
] as const;

async function proxy(request: Request, params: Route.LoaderArgs["params"]) {
  const authenticated = await loadAccessTokenSession(request);
  if (authenticated instanceof Response) {
    return new Response(JSON.stringify({ detail: "Authentication required" }), {
      status: 401,
      headers: {
        "content-type": "application/json",
        "Set-Cookie": authenticated.headers.get("Set-Cookie") ?? "",
      },
    });
  }

  const incomingUrl = new URL(request.url);
  const path = params["*"] ?? "";
  const upstreamUrl = new URL(`${backendUrl}/${path}`);
  upstreamUrl.search = incomingUrl.search;

  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value != null) headers.set(name, value);
  }
  headers.set("Authorization", `Bearer ${authenticated.token.access_token}`);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  // The body is buffered rather than streamed so a 401 can be replayed after a
  // token refresh; a ReadableStream could only be consumed once.
  const body = hasBody ? await request.arrayBuffer() : null;
  const send = () =>
    fetch(upstreamUrl, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
    });

  let upstream = await send();
  if (upstream.status === 401 && authenticated.token.refresh_token) {
    const refreshed = await refreshAccessToken(
      authenticated.session,
      authenticated.token,
    );
    if (refreshed) {
      // Retry exactly once with the new bearer. The discarded 401 body is
      // cancelled so the upstream connection is released.
      await upstream.body?.cancel().catch(() => undefined);
      headers.set("Authorization", `Bearer ${refreshed.access_token}`);
      upstream = await send();
    }
  }

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("set-cookie");
  // Committing after a possible refresh persists the rotated token pair.
  responseHeaders.set("Set-Cookie", await commitSession(authenticated.session));
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export function loader({ request, params }: Route.LoaderArgs) {
  return proxy(request, params);
}

export function action({ request, params }: Route.ActionArgs) {
  return proxy(request, params);
}
