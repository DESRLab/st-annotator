import { describe, expect, it } from "vitest";

import { resolveBrowserApiBaseUrl } from "../../app/backend";

describe("browser API base URL resolution", () => {
  it("prefers the server-injected value", () => {
    const windowLike = {
      STA_API_BASE_URL: "http://10.0.0.5:9000/",
    } as Window & { STA_API_BASE_URL?: string };

    expect(
      resolveBrowserApiBaseUrl(windowLike, {
        protocol: "http:",
        hostname: "localhost",
      }),
    ).toBe("http://10.0.0.5:9000");
  });

  it("accepts the legacy window global and strips trailing slashes", () => {
    const windowLike = {
      __STA_API_BASE_URL__: "http://10.0.0.5:9000/",
    } as Window & { __STA_API_BASE_URL__?: string };

    expect(
      resolveBrowserApiBaseUrl(windowLike, {
        protocol: "http:",
        hostname: "localhost",
      }),
    ).toBe("http://10.0.0.5:9000");
  });

  it("falls back to the backend port on the same host", () => {
    const windowLike = {} as Window;

    expect(
      resolveBrowserApiBaseUrl(windowLike, {
        protocol: "http:",
        hostname: "127.0.0.1",
      }),
    ).toBe("http://127.0.0.1:8000");
    expect(
      resolveBrowserApiBaseUrl(windowLike, {
        protocol: "http:",
        hostname: "localhost",
      }),
    ).toBe("http://localhost:8000");
    expect(
      resolveBrowserApiBaseUrl(windowLike, {
        protocol: "https:",
        hostname: "annotator.example.com",
      }),
    ).toBe("https://annotator.example.com:8000");
  });
});
