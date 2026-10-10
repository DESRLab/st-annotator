/** Names of environment variables consumed by the frontend. */

/**
 * Set to `"production"` to select the deployment behavior of
 * `STA_SESSION_SECRET` and `STA_BACKEND_URL`; any other value keeps the local
 * development fallbacks.
 */
export const NODE_ENV = "NODE_ENV";

/**
 * Backend origin used by server-side loaders and as the target of the
 * `/api/backend/*` proxy.
 *
 * Must be an absolute HTTP(S) URL and is required in production; otherwise
 * `DEFAULT_BACKEND_URL` applies. The browser never receives this value: it gets
 * the same-origin proxy path. This server-only value is never embedded in
 * client assets.
 */
export const STA_BACKEND_URL = "STA_BACKEND_URL";

/**
 * Path to the `sta.config.ts` application composition used by Vite and React
 * Router.
 *
 * A relative value is resolved against the command's working directory. When
 * unset, Vite searches upward for the nearest `sta.config.*`, which is normally
 * the core-only composition when commands run from `core/frontend`.
 */
export const STA_CONFIG_PATH = "STA_CONFIG_PATH";

/**
 * Signing key for the session cookie that holds the backend token pair.
 *
 * Required in production: the session storage is created at module load and
 * throws without it. Outside production a stable local-only fallback is used so
 * development works without configuration.
 *
 * This secret guards the cookie only. The backend signs access and refresh
 * tokens with its own asymmetric key (`STA_JWT_PRIVATE_KEY_PATH`), which this
 * process never sees, so no value here can mint API tokens.
 */
export const STA_SESSION_SECRET = "STA_SESSION_SECRET";

/**
 * Optional build-time browser API base URL, consulted only when the
 * server-injected global is absent. It is deliberately independent of the
 * server-only `STA_BACKEND_URL`.
 */
export const VITE_STA_API_BASE_URL = "VITE_STA_API_BASE_URL";

/**
 * Presence-only switch (the value is irrelevant) that registers the editor
 * end-to-end probe. Only the Playwright suites define it; a production build
 * must not, since the probe exposes live editor internals to the page.
 */
export const VITE_STA_E2E_PROBE = "VITE_STA_E2E_PROBE";
