import type { RouteConfig, RouteConfigEntry } from "@react-router/dev/routes";
import { index, prefix, route, layout } from "@react-router/dev/routes";

import type { PluginRoutes, RoutePlugin } from "./config";
import routesConfig from "./sta-routes-config.shim";

// Prefixes group URLs without requiring a parent page to render an Outlet.
function pluginRoutes(entries: RoutePlugin[]): RouteConfigEntry[] {
  return entries.flatMap((entry) =>
    entry.children?.length
      ? prefix(entry.path, [
          index(entry.module),
          ...pluginRoutes(entry.children),
        ])
      : [route(entry.path, entry.module)],
  );
}

const pluginsArr: PluginRoutes[] = Array.from(
  Object.values(routesConfig.plugins),
);

export default [
  route("api/backend/*", "./routes/backend-proxy.ts"),
  route("source/files/download", "./routes/source/files-download.ts"),
  layout("./layouts/public.tsx", [route("login", "./routes/login.tsx")]),
  layout("./layouts/protected.tsx", [
    index("./routes/dashboard.tsx"),
    route("logout", "./routes/logout.tsx"),
    route("profile", "./routes/profile.tsx", { id: "routes/profile-self" }),
    route("profile/:username", "./routes/profile.tsx", {
      id: "routes/profile-user",
    }),
    ...prefix("settings", [
      index("./routes/settings/index.ts"),
      route("account", "./routes/settings/account.tsx"),
      route("authentication", "./routes/settings/authentication.tsx"),
      route("preferences", "./routes/settings/preferences.tsx"),
      route("profile", "./routes/settings/profile.tsx"),
    ]),
    ...prefix("admin", [route("accounts", "./routes/admin/accounts.tsx")]),
    route("jobs", "./routes/jobs.tsx"),
    layout("./layouts/source.tsx", [
      ...prefix("source", [
        index("./routes/source/index.ts"),
        route("groups", "./routes/source/groups.tsx"),
        route("files", "./routes/source/files.tsx"),
        ...prefix("data", [
          index("./routes/source/data/dashboard.tsx"),
          ...pluginsArr.flatMap((p) =>
            pluginRoutes(p.routes.source?.data ?? []),
          ),
        ]),
        ...prefix("specs", [
          index("./routes/source/specs/dashboard.tsx"),
          ...pluginsArr.flatMap((p) =>
            pluginRoutes(p.routes.source?.specs ?? []),
          ),
        ]),
      ]),
    ]),
    layout("./layouts/label.tsx", [
      ...prefix("label", [
        index("./routes/label/index.ts"),
        route("groups", "./routes/label/groups.tsx"),
        route("repos", "./routes/label/repos.tsx"),
        ...prefix("data", [
          index("./routes/label/data/dashboard.tsx"),
          ...pluginsArr.flatMap((p) =>
            pluginRoutes(p.routes.label?.data ?? []),
          ),
        ]),
        ...prefix("specs", [
          index("./routes/label/specs/dashboard.tsx"),
          ...prefix("objclass", [
            index("./routes/label/specs/objclass/index.ts"),
            route("selections", "./routes/label/specs/objclass/selections.tsx"),
            route(
              "definitions",
              "./routes/label/specs/objclass/definitions.tsx",
            ),
          ]),
          ...pluginsArr.flatMap((p) =>
            pluginRoutes(p.routes.label?.specs ?? []),
          ),
        ]),
      ]),
    ]),
    layout("./layouts/repo.tsx", [
      ...prefix("label/repos/:groupId", [
        index("./routes/label/repo/index.ts"),
        route("branches", "./routes/label/repo/branches.tsx"),
        route("commits", "./routes/label/repo/commits.tsx"),
      ]),
    ]),
    route("projects", "./routes/projects.tsx"),
    route("projects/:projectId/:workType", "./routes/editor/editor.tsx"),
    layout("./layouts/project.tsx", [
      ...prefix("projects/:projectId", [
        index("./routes/project/index.ts"),
        route("tasks", "./routes/project/tasks.tsx"),
      ]),
    ]),
    layout("./layouts/task.tsx", [
      ...prefix("projects/:projectId/tasks/:taskId", [
        index("./routes/project/task/index.ts"),
        route("recent/:workType?", "./routes/project/task/recent.tsx"),
        route("frames/:workType?", "./routes/project/task/frames.tsx"),
      ]),
    ]),
  ]),
] satisfies RouteConfig;
