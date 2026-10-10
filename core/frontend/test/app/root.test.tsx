import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({
  initialize: vi.fn(),
  plugins: { example: { routes: {} } },
}));

vi.mock("../../app/config", () => ({
  getPlugins: () => config.plugins,
  initializePluginEntrypoints: config.initialize,
}));

import App, { ErrorBoundary, links, loader } from "../../app/root";

describe("root server/client contract", () => {
  it("does not depend on runtime CDN stylesheets", () => {
    expect(links()).toEqual([
      { rel: "shortcut icon", href: "/assets/favicon.ico" },
      { rel: "stylesheet", href: "/styles/base.css" },
    ]);
  });

  it("returns serializable runtime configuration and safely injects URLs", () => {
    expect(loader()).toEqual({
      plugins: config.plugins,
    });
    const markup = renderToStaticMarkup(
      (<App loaderData={loader()} params={{}} matches={[]} />) as any,
    );
    expect(config.initialize).toHaveBeenCalledOnce();
    expect(markup).toContain("window.STA_API_BASE_URL");
    expect(markup).toContain("/api/backend");
  });

  it("renders a stable 404 response without leaking stack details", () => {
    const error = {
      status: 404,
      statusText: "Not Found",
      internal: false,
      data: null,
    };
    const markup = renderToStaticMarkup(
      (<ErrorBoundary error={error as any} params={{}} />) as any,
    );
    expect(markup).toContain("<h1>404</h1>");
    expect(markup).toContain("The requested page could not be found.");
    expect(markup).not.toContain("<pre>");
  });

  it("renders upstream response text for non-404 route errors", () => {
    const error = {
      status: 503,
      statusText: "Backend unavailable",
      internal: false,
      data: null,
    };
    const markup = renderToStaticMarkup(
      (<ErrorBoundary error={error as any} params={{}} />) as any,
    );
    expect(markup).toContain("<h1>Error</h1>");
    expect(markup).toContain("Backend unavailable");
  });

  it("renders structured upstream errors as readable text", () => {
    const error = {
      status: 403,
      statusText: "Forbidden",
      internal: false,
      data: { detail: "Cannot remove admin role from own account." },
    };
    const markup = renderToStaticMarkup(
      (<ErrorBoundary error={error as any} params={{}} />) as any,
    );
    expect(markup).toContain("Cannot remove admin role from own account.");
  });
});
