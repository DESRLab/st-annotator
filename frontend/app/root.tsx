import {
  Links,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
} from "react-router";

import { getPlugins, initializePluginEntrypoints } from "./config";
import type { Route } from "./+types/root";

export function loader() {
  return { plugins: getPlugins() };
}

export default function App() {
  initializePluginEntrypoints();
  return <Outlet />;
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
    {
      rel: "stylesheet",
      href: "https://cdn.jsdelivr.net/npm/bootstrap@5.3.5/dist/css/bootstrap.min.css",
      integrity: "sha384-SgOJa3DmI69IUzQ2PVdRZhwQ+dy64/BUtbMJw1MZ8t5HZApcHrRKUc4W0kG879m7",
      crossOrigin: "anonymous",
    },
    {
      rel: "stylesheet",
      href: "https://cdn.jsdelivr.net/npm/@slickgrid-universal/common@10.4.0/dist/styles/css/slickgrid-theme-bootstrap.css",
      integrity: "sha384-cHcWMHmML5nLbdwN4g8BbSB7JOvJkgZxi8QW2Y+sMCgl/Kyz20l0BErXpTikAO4p",
      crossOrigin: "anonymous",
    },
    {
      rel: "stylesheet",
      href: "https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@5.15.4/css/all.min.css",
      integrity: "sha384-DyZ88mC6Up2uqS4h/KRgHuoeGwBcD4Ng9SiP4dIRy0EXTlnuz47vAwmeGwVChigm",
      crossOrigin: "anonymous",
    },
    {
      rel: "stylesheet",
      href: "https://cdn.jsdelivr.net/npm/font-awesome@4.7.0/css/font-awesome.min.css",
      integrity: "sha384-wvfXpqpZZVQGK6TAh5PVlGOfQNHSoD2xbE+QkPxCAFlNEevoEH3Sl0sibVcOQVnN",
      crossOrigin: "anonymous",
    }
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
      <body>
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
        : error.statusText || details;
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
