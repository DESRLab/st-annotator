import { client } from "../client/client.gen";
import { VITE_STA_API_BASE_URL } from "./envs";

type StaApiWindow = Window & {
  STA_API_BASE_URL?: string;
  __STA_API_BASE_URL__?: string;
};

function withoutTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

/**
 * The API base URL for the browser: the same-origin `/api/backend` proxy path
 * injected by the server (which forwards to `STA_BACKEND_URL` server-side), a
 * build-time override, else the backend on the same host.
 */
export function resolveBrowserApiBaseUrl(
  windowLike: StaApiWindow = window,
  locationLike: Pick<Location, "protocol" | "hostname"> = window.location,
) {
  const configuredBaseUrl =
    windowLike.STA_API_BASE_URL ??
    windowLike.__STA_API_BASE_URL__ ??
    import.meta.env[VITE_STA_API_BASE_URL];

  if (
    typeof configuredBaseUrl === "string" &&
    configuredBaseUrl.trim() !== ""
  ) {
    return withoutTrailingSlash(configuredBaseUrl.trim());
  }

  return withoutTrailingSlash(
    `${locationLike.protocol}//${locationLike.hostname}:8000`,
  );
}

// The generated client ships without a base URL; configure the singleton
// before any loader or view issues requests.
export function configureApiClient(baseUrl = resolveBrowserApiBaseUrl()) {
  client.setConfig({ baseUrl });
  return baseUrl;
}
