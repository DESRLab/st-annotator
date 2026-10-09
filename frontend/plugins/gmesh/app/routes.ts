import type { RouteConfig } from "@react-router/dev/routes";
import { prefix, route } from "@react-router/dev/routes";

// Dummy setup for `react-router typegen`
export default [
  ...prefix("source", [
    ...prefix("data", [
      route("gmesh", "./source/data/metadata.tsx"),
    ]),
  ]),
] satisfies RouteConfig;