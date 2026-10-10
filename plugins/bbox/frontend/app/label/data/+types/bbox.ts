/**
 * Hand-written stand-in for the react-router typegen output.
 *
 * The typegen only emits `+types` for route modules inside the frontend
 * app directory; plugin route modules live outside it, so their `Route`
 * types are provided here instead. Keep in sync with the route module's
 * exported loader/clientLoader/action.
 *
 * As in the generated types, `Response` returns (redirects) are excluded
 * from the data types: a redirect short-circuits before the data reaches
 * the client loader or component.
 */

import type { LoaderFunctionArgs } from "react-router";

type Module = typeof import("../bbox.tsx");

type LoaderData = Exclude<Awaited<ReturnType<Module["loader"]>>, Response>;

// eslint-disable-next-line @typescript-eslint/no-namespace -- mirrors the react-router typegen `Route` namespace
export namespace Route {
  export type LoaderArgs = LoaderFunctionArgs;
  export type ClientLoaderArgs = LoaderFunctionArgs & {
    serverLoader: () => Promise<LoaderData>;
  };
}
