import type { RouteConfig } from "@react-router/dev/routes";
import { prefix, route } from "@react-router/dev/routes";

// Dummy setup for `react-router typegen`
export default [
  ...prefix("source", [
    ...prefix("data", [
      route("pcd", "./source/data/metadata.tsx"),
    ]),
    ...prefix("specs", [
      route("pcd", "./source/specs/specs.tsx"),
    ]),
  ])
] satisfies RouteConfig;
