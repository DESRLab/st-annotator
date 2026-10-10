import { client } from "../client/client.gen";
import { NODE_ENV, STA_BACKEND_URL } from "./envs";

export const DEFAULT_BACKEND_URL = "http://localhost:8000";

function withoutTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function validateBackendUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("STA_BACKEND_URL must be an absolute HTTP(S) URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("STA_BACKEND_URL must be an absolute HTTP(S) URL");
  }
  return value;
}

function resolveConfiguredBackendUrl() {
  const configured = process.env[STA_BACKEND_URL];
  if (typeof configured !== "string" || configured.trim() === "") {
    if (process.env[NODE_ENV] === "production") {
      throw new Error("STA_BACKEND_URL must be configured in production");
    }
    return undefined;
  }
  return validateBackendUrl(withoutTrailingSlash(configured.trim()));
}

export const backendUrl = resolveConfiguredBackendUrl() ?? DEFAULT_BACKEND_URL;

// The generated client ships without a base URL; configure the singleton
// before any loader issues requests.
client.setConfig({ baseUrl: backendUrl });
