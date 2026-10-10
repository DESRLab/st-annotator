import { beforeEach, describe, expect, it, vi } from "vitest";

import { action } from "../../../app/routes/backend-proxy";
import {
  loadAccessTokenSession,
  refreshAccessToken,
} from "../../../app/loaders";
import { commitSession } from "../../../app/sessions";

vi.mock("../../../app/backend.server", () => ({
  backendUrl: "https://backend.test",
}));
vi.mock("../../../app/loaders", () => ({
  loadAccessTokenSession: vi.fn(),
  refreshAccessToken: vi.fn(),
}));
vi.mock("../../../app/sessions", () => ({
  commitSession: vi.fn(),
}));

/** Upstream `fetch` call arguments, in the order the proxy issued them. */
function upstreamCalls(fetchMock: vi.SpyInstance) {
  return fetchMock.mock.calls.map(([, init]) => init as RequestInit);
}

function upstreamHeaders(fetchMock: vi.SpyInstance, call = 0) {
  return upstreamCalls(fetchMock)[call]?.headers as Headers;
}

function upstreamBody(fetchMock: vi.SpyInstance, call = 0) {
  const body = upstreamCalls(fetchMock)[call]?.body;
  return body == null ? null : new Uint8Array(body as ArrayBuffer);
}

describe("authenticated backend proxy", () => {
  const session = { get: vi.fn(), set: vi.fn() };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(loadAccessTokenSession).mockResolvedValue({
      session,
      token: { access_token: "server-secret-token" },
    } as never);
    vi.mocked(commitSession).mockResolvedValue("signed-session-cookie");
    // Default: the refresh endpoint rejects, so a test only observes a retry
    // when it opts into a successful refresh.
    vi.mocked(refreshAccessToken).mockResolvedValue(undefined);
  });

  it("adds the bearer token only to the upstream request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('{"ok":true}', {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const browserRequest = new Request(
      "https://frontend.test/api/backend/frames?limit=10",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );

    const response = await action({
      request: browserRequest,
      params: { "*": "frames" },
    } as never);

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://backend.test/frames?limit=10"),
      expect.objectContaining({
        headers: expect.any(Headers),
        method: "POST",
      }),
    );
    expect(upstreamHeaders(fetchMock).get("Authorization")).toBe(
      "Bearer server-secret-token",
    );
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("Set-Cookie")).toBe("signed-session-cookie");
  });

  it("returns JSON 401 without following a login redirect", async () => {
    vi.mocked(loadAccessTokenSession).mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "/login", "Set-Cookie": "expired=; Max-Age=0" },
      }) as never,
    );
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const response = await action({
      request: new Request("https://frontend.test/api/backend/frames", {
        method: "POST",
        body: "{}",
      }),
      params: { "*": "frames" },
    } as never);

    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("Set-Cookie")).toBe("expired=; Max-Age=0");
    expect(await response.json()).toEqual({
      detail: "Authentication required",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves an upstream content length for download progress", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3, 4]), {
        headers: { "Content-Length": "4" },
      }),
    );

    const response = await action({
      request: new Request("https://frontend.test/api/backend/files/data"),
      params: { "*": "files/data" },
    } as never);

    expect(response.headers.get("Content-Length")).toBe("4");
  });

  it("forwards the assisted-segmentation headers on a binary POST", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));
    const points = new Uint8Array([1, 2, 3, 250]);

    await action({
      request: new Request(
        "https://frontend.test/api/backend/editor/segmentation/encode_pcd",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "X-Num-Points": "4",
            "X-Pcd-Id": "42",
            "X-Labels": "[1,2]",
          },
          body: points,
        },
      ),
      params: { "*": "editor/segmentation/encode_pcd" },
    } as never);

    const headers = upstreamHeaders(fetchMock);
    expect(headers.get("Content-Type")).toBe("application/octet-stream");
    expect(headers.get("X-Num-Points")).toBe("4");
    expect(headers.get("X-Pcd-Id")).toBe("42");
    expect(headers.get("X-Labels")).toBe("[1,2]");
    expect(upstreamBody(fetchMock)).toEqual(points);
  });

  it("never forwards a browser-supplied identity header", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    await action({
      request: new Request("https://frontend.test/api/backend/frames", {
        method: "POST",
        headers: {
          "X-User-Id": "1337",
          Authorization: "Bearer attacker-token",
          Cookie: "session=attacker",
        },
        body: "{}",
      }),
      params: { "*": "frames" },
    } as never);

    const headers = upstreamHeaders(fetchMock);
    expect(headers.has("X-User-Id")).toBe(false);
    expect(headers.has("Cookie")).toBe(false);
    expect(headers.get("Authorization")).toBe("Bearer server-secret-token");
  });

  it("refreshes once and replays the request on a 401", async () => {
    vi.mocked(loadAccessTokenSession).mockResolvedValue({
      session,
      token: {
        access_token: "expired-token",
        refresh_token: "refresh-secret",
      },
    } as never);
    vi.mocked(refreshAccessToken).mockResolvedValue({
      access_token: "rotated-token",
      refresh_token: "rotated-refresh",
    } as never);
    const payload = new Uint8Array([9, 8, 7]);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response('{"ok":true}', {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const response = await action({
      request: new Request("https://frontend.test/api/backend/frames", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: payload,
      }),
      params: { "*": "frames" },
    } as never);

    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(refreshAccessToken).toHaveBeenCalledWith(session, {
      access_token: "expired-token",
      refresh_token: "refresh-secret",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(upstreamHeaders(fetchMock, 1).get("Authorization")).toBe(
      "Bearer rotated-token",
    );
    expect(upstreamBody(fetchMock, 1)).toEqual(payload);
    expect(upstreamBody(fetchMock, 0)).toEqual(upstreamBody(fetchMock, 1));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    // The rotated token must persist on the retried response too.
    expect(response.headers.get("Set-Cookie")).toBe("signed-session-cookie");
    expect(commitSession).toHaveBeenCalledWith(session);
  });

  it("passes a 401 through without refreshing when there is no refresh token", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 401 }));

    const response = await action({
      request: new Request("https://frontend.test/api/backend/frames", {
        method: "POST",
        body: "{}",
      }),
      params: { "*": "frames" },
    } as never);

    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(401);
  });

  it("does not retry when the refresh endpoint rejects the 401", async () => {
    vi.mocked(loadAccessTokenSession).mockResolvedValue({
      session,
      token: { access_token: "expired-token", refresh_token: "stale-refresh" },
    } as never);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 401 }));

    const response = await action({
      request: new Request("https://frontend.test/api/backend/frames", {
        method: "POST",
        body: "{}",
      }),
      params: { "*": "frames" },
    } as never);

    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(401);
  });

  it("does not refresh or retry on a non-401 upstream error", async () => {
    vi.mocked(loadAccessTokenSession).mockResolvedValue({
      session,
      token: { access_token: "token", refresh_token: "refresh-secret" },
    } as never);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("boom", { status: 500 }));

    const response = await action({
      request: new Request("https://frontend.test/api/backend/frames", {
        method: "POST",
        body: "{}",
      }),
      params: { "*": "frames" },
    } as never);

    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(500);
  });
});
