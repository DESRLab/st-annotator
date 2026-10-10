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

import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  Params,
} from "react-router";

type Module = typeof import("../metadata.tsx");

type LoaderData = Exclude<Awaited<ReturnType<Module["loader"]>>, Response>;

// Mirrors the react-router typegen `Route` namespace; do not restructure.
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Route {
  export type LoaderArgs = LoaderFunctionArgs;
  export type ActionArgs = ActionFunctionArgs;
  export type ClientLoaderArgs = LoaderFunctionArgs & {
    serverLoader: () => Promise<LoaderData>;
  };
  export interface ComponentProps {
    params: Params;
    loaderData: Awaited<ReturnType<Module["clientLoader"]>>;
  }
}
