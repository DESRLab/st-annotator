import { createCookieSessionStorage } from "react-router";


// TODO: Use client
export interface SessionData {
  token: { access_token: string, token_type: string };
}

export interface SessionFlashData {
  error?: string;
  success?: string,
}


const { getSession, commitSession, destroySession } =
  createCookieSessionStorage<SessionData, SessionFlashData>(
    {
      cookie: {
        name: "__session",
        httpOnly: true,
        path: "/",
        sameSite: "lax",
      },
    }
  );

export { getSession, commitSession, destroySession };
