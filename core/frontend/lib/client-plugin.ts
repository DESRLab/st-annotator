// Plugin packages import this public entry point. Configure its generated
// client eagerly during SSR because plugin route modules can execute in a
// separate React Router module graph from the root route's server bootstrap.
import { client } from "../client/client.gen.ts";
import { STA_BACKEND_URL, VITE_STA_API_BASE_URL } from "../app/envs";

const runtimeEnv = (
  import.meta as ImportMeta & {
    env?: { [VITE_STA_API_BASE_URL]?: string };
  }
).env;
const processBackendUrl =
  typeof process === "undefined" ? undefined : process.env[STA_BACKEND_URL];
const configuredBackendUrl =
  processBackendUrl ?? runtimeEnv?.[VITE_STA_API_BASE_URL];
if (configuredBackendUrl?.trim()) {
  client.setConfig({
    baseUrl: configuredBackendUrl.trim().replace(/\/$/, ""),
  });
}

export * from "../client/index.ts";
