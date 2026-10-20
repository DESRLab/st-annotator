import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
type Module = typeof import("../definitions");
type LoaderData = Exclude<Awaited<ReturnType<Module["loader"]>>, Response>;
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Route {
  export type LoaderArgs = LoaderFunctionArgs;
  export type ActionArgs = ActionFunctionArgs;
  export type ClientLoaderArgs = LoaderFunctionArgs & {
    serverLoader: () => Promise<LoaderData>;
  };
  export interface ComponentProps {
    loaderData: Awaited<ReturnType<Module["clientLoader"]>>;
    actionData?: Exclude<Awaited<ReturnType<Module["action"]>>, Response>;
  }
}
