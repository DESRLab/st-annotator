import type { RouteConfig } from "@react-router/dev/routes";
import { index, prefix, route, layout } from "@react-router/dev/routes";

import { getPlugins, initializePluginEntrypoints } from "./config";

const plugins = getPlugins();
initializePluginEntrypoints();

const pluginsArr = Array.from(Object.values(plugins));

export default [
  layout("./layouts/public.tsx", [
    route("login", "./routes/login.tsx"),
  ]),
  layout("./layouts/protected.tsx", [
    index("./routes/dashboard.tsx"),
    route("logout", "./routes/logout.tsx"),
    route("profile", "./routes/profile.tsx", { id: "routes/profile-self" }),
    route("profile/:username", "./routes/profile.tsx", { id: "routes/profile-user" }),
    ...prefix("settings", [
      index("./routes/settings/index.tsx"),
      route("account", "./routes/settings/account.tsx"),
      route("authentication", "./routes/settings/authentication.tsx"),
      route("preferences", "./routes/settings/preferences.tsx"),
      route("profile", "./routes/settings/profile.tsx"),
    ]),
    ...prefix("admin", [
      route("accounts", "./routes/admin/accounts.tsx"),
    ]),
    layout("./layouts/source.tsx", [
      ...prefix("source", [
        index("./routes/source/index.tsx"),
        route("groups", "./routes/source/groups.tsx"),
        route("files", "./routes/source/files.tsx"),
        ...prefix("data", [
          index("./routes/source/data/dashboard.tsx"),
          ...pluginsArr.flatMap(p => p.routes.source?.data ?? []).map(d => route(d.path, d.module)),
        ]),
        ...prefix("specs", [
          index("./routes/source/specs/dashboard.tsx"),
          ...pluginsArr.flatMap(p => p.routes.source?.specs ?? []).map(d => route(d.path, d.module)),
        ]),
      ]),
    ]),
    layout("./layouts/label.tsx", [
      ...prefix("label", [
        index("./routes/label/index.tsx"),
        route("groups", "./routes/label/groups.tsx"),
        route("repos", "./routes/label/repos.tsx"),
        ...prefix("data", [
          index("./routes/label/data/dashboard.tsx"),
          ...pluginsArr.flatMap(p => p.routes.label?.data ?? []).map(d => route(d.path, d.module)),
        ]),
        ...prefix("specs", [
          index("./routes/label/specs/dashboard.tsx"),
          ...prefix("objclass", [
            index("./routes/label/specs/objclass/index.tsx"),
            route("selections", "./routes/label/specs/objclass/selections.tsx"),
            route("definitions", "./routes/label/specs/objclass/definitions.tsx"),
          ]),
          ...pluginsArr.flatMap(p => p.routes.label?.specs ?? []).map(d => route(d.path, d.module)),
        ]),
      ]),
    ]),
    layout("./layouts/repo.tsx", [
      ...prefix("label/repos/:groupId", [
        index("./routes/label/repo/index.tsx"),
        route("branches", "./routes/label/repo/branches.tsx"),
        route("commits", "./routes/label/repo/commits.tsx"),
      ]),
    ]),
    route("projects", "./routes/projects.tsx"),
    layout("./layouts/project.tsx", [
      ...prefix("projects/:projectId", [
        index("./routes/project/index.tsx"),
        route("tasks", "./routes/project/tasks.tsx"),
      ]),
    ]),
    layout("./layouts/task.tsx", [
      ...prefix("projects/:projectId/tasks/:taskId", [
        index("./routes/project/task/index.tsx"),
        route("recent/:workType?", "./routes/project/task/recent.tsx"),
        route("frames/:workType?", "./routes/project/task/frames.tsx"),
      ]),
    ]),
  ]),
] satisfies RouteConfig;
