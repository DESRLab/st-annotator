import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  delete process.env.STA_BACKEND_URL;
  delete process.env.STA_SESSION_SECRET;
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.resetModules();
});

describe("server URL configuration", () => {
  it("normalizes the configured backend URL and configures the generated client", async () => {
    process.env.STA_BACKEND_URL = "  https://api.example.test/  ";
    const setConfig = vi.fn();
    vi.doMock("../../client/client.gen", () => ({ client: { setConfig } }));

    const backend = await import("../../app/backend.server");

    expect(backend.backendUrl).toBe("https://api.example.test");
    expect(setConfig).toHaveBeenCalledOnce();
    expect(setConfig).toHaveBeenCalledWith({
      baseUrl: "https://api.example.test",
    });
  });

  it("uses the backend default", async () => {
    process.env.STA_BACKEND_URL = "  ";
    const setConfig = vi.fn();
    vi.doMock("../../client/client.gen", () => ({ client: { setConfig } }));

    const backend = await import("../../app/backend.server");

    expect(backend.backendUrl).toBe(backend.DEFAULT_BACKEND_URL);
    expect(setConfig).toHaveBeenCalledWith({
      baseUrl: backend.DEFAULT_BACKEND_URL,
    });
  });

  it("requires an explicit backend URL in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STA_BACKEND_URL", "");

    await expect(import("../../app/backend.server")).rejects.toThrow(
      "STA_BACKEND_URL must be configured in production",
    );
  });

  it("rejects a malformed backend URL", async () => {
    vi.stubEnv("STA_BACKEND_URL", "backend.internal:8000");

    await expect(import("../../app/backend.server")).rejects.toThrow(
      "STA_BACKEND_URL must be an absolute HTTP(S) URL",
    );
  });
});

describe("session cookie contract", () => {
  it("round-trips tokens in an HTTP-only, same-site cookie and destroys it", async () => {
    const { commitSession, destroySession, getSession } =
      await import("../../app/sessions");
    const session = await getSession();
    session.set("token", {
      access_token: "secret-token",
      token_type: "bearer",
    });

    const cookie = await commitSession(session);
    expect(cookie).toContain("__session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");

    const restored = await getSession(cookie);
    expect(restored.get("token")).toMatchObject({
      access_token: "secret-token",
      token_type: "bearer",
    });
    const destroyed = await destroySession(restored);
    expect(destroyed).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  });

  it("does not accept malformed cookie data as an authenticated session", async () => {
    const { getSession } = await import("../../app/sessions");
    const session = await getSession("__session=not-valid-cookie-data");

    expect(session.get("token")).toBeUndefined();
  });

  it("requires an explicit signing secret in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(import("../../app/sessions")).rejects.toThrow(
      "STA_SESSION_SECRET must be configured",
    );
    vi.unstubAllEnvs();
  });

  it("binds signatures to the configured secret", async () => {
    vi.stubEnv("STA_SESSION_SECRET", "first-private-secret");
    let sessions = await import("../../app/sessions");
    const session = await sessions.getSession();
    session.set("token", {
      access_token: "secret-token",
      token_type: "bearer",
    });
    const cookie = await sessions.commitSession(session);

    vi.resetModules();
    vi.stubEnv("STA_SESSION_SECRET", "different-private-secret");
    sessions = await import("../../app/sessions");
    expect((await sessions.getSession(cookie)).get("token")).toBeUndefined();
    vi.unstubAllEnvs();
  });

  it("marks production cookies Secure", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STA_SESSION_SECRET", "production-private-secret");
    const { commitSession, getSession } = await import("../../app/sessions");
    expect(await commitSession(await getSession())).toContain("Secure");
    vi.unstubAllEnvs();
  });
});
