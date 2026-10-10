import {
  Links,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
} from "react-router";

import "bootstrap/dist/css/bootstrap.min.css";
import "@slickgrid-universal/common/dist/styles/css/slickgrid-theme-bootstrap.css";
import "@fortawesome/fontawesome-free/css/all.min.css";

import type { Route } from "./+types/root";
import { assertCurrentBuild } from "./build-hash.server";
import { getPlugins, initializePluginEntrypoints } from "./config";
import { normalizeError } from "./errors";

const BUILD_HASH = import.meta.env.VITE_STA_BUILD_HASH;

export function loader() {
  if (import.meta.env.PROD) assertCurrentBuild(BUILD_HASH);
  return { plugins: getPlugins() };
}

export default function App({ loaderData }: Route.ComponentProps) {
  initializePluginEntrypoints();
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          // Browser API traffic stays same-origin. The resource route adds the
          // server-held bearer token, so credentials never enter loader data
          // or rendered HTML.
          __html: `window.STA_API_BASE_URL = "/api/backend";`,
        }}
      />
      <Outlet />
    </>
  );
}

export function links() {
  return [
    {
      rel: "shortcut icon",
      href: "/assets/favicon.ico",
    },
    {
      rel: "stylesheet",
      href: "/styles/base.css",
    },
  ];
}

// The Layout component is a special export for the root route.
// It acts as your document's "app shell" for all route components, HydrateFallback, and ErrorBoundary
// For more information, see https://reactrouter.com/explanation/special-files#layout-export
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Links />
      </head>
      <body suppressHydrationWarning>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

// The top most error boundary for the app, rendered when your app throws an error
// For more information, see https://reactrouter.com/start/framework/route-module#errorboundary
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : normalizeError(error.data ?? error.statusText);
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main id="error-page">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre>
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
