export type { STAConfig, STAPlugin } from "./config.js";

/** Resolve a plugin route beside its source module or emitted package module. */
export function pluginRouteModule(pluginModuleUrl: string, routePath: string) {
  const extension = pluginModuleUrl.endsWith(".ts") ? ".tsx" : ".js";
  return decodeURIComponent(
    new URL(`${routePath}${extension}`, pluginModuleUrl).pathname,
  );
}
