import { data, redirect, type Session } from "react-router";

import type { UserPublic as User } from '../client';
import { whoamiAuthWhoamiGet } from "../client/sdk.gen";
import { getSession, destroySession, commitSession } from "./sessions";


export async function getCurrentSession(request: Request) {
  return getSession(request.headers.get("Cookie"));
}


export async function dataAndCommit<T>(dat: T, session: Session) {
  return data(dat, {
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  });
}


export async function redirectAndCommit(url: string, session: Session) {
  return redirect(url, {
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  });
}


export async function redirectAndDestroy(url: string, session: Session) {
  return redirect(url, {
    headers: {
      "Set-Cookie": await destroySession(session),
    },
  });
}


export function getUser(session: Session): User | undefined {
  return session.get("user");
}

export function clearUser(session: Session) {
  session.unset("user");
}

export async function refreshUser(session: Session) {
  const token = session.get("token");
  if (!token) {
    clearUser(session);
    return null;
  }

  const res = await whoamiAuthWhoamiGet({ auth: token.access_token });
  if (!res.data) {
    clearUser(session);
    return null;
  }

  session.set("user", res.data);
  return res.data;
}
