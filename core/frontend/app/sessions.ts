import { createCookieSessionStorage } from "react-router";

import type { OAuth2Token } from "../client";
import { NODE_ENV, STA_SESSION_SECRET } from "./envs";

export interface SessionData {
  token: OAuth2Token;
}

export interface SessionFlashData {
  error?: string;
  success?: string;
}

function resolveSessionSecret() {
  const env = typeof process === "undefined" ? undefined : process.env;
  const configured = env?.[STA_SESSION_SECRET]?.trim();
  if (configured) return configured;

  if (env?.[NODE_ENV] === "production") {
    throw new Error("STA_SESSION_SECRET must be configured in production");
  }

  // Stable local-only fallback. Production must provide a private value so
  // session cookies cannot be forged and remain valid across instances.
  return "sta-development-session-secret";
}

const {
  getSession: parseSession,
  commitSession,
  destroySession,
} = createCookieSessionStorage<SessionData, SessionFlashData>({
  cookie: {
    name: "__session",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure:
      typeof process !== "undefined" && process.env[NODE_ENV] === "production",
    secrets: [resolveSessionSecret()],
  },
});

async function getSession(cookieHeader?: string | null) {
  try {
    return await parseSession(cookieHeader);
  } catch {
    // Cookie input is fully client-controlled. Invalid encodings/signatures are
    // unauthenticated sessions, not application errors.
    return parseSession();
  }
}

export { getSession, commitSession, destroySession };
