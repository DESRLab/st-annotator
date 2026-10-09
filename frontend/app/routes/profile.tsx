import { whoamiAuthWhoamiGet, listAccountsAccountsGet } from '../../client';
import { clearUser, getCurrentSession, redirectAndCommit, redirectAndDestroy } from '../loaders';
import { createPageContent } from '../templates';

import type { Route } from "./+types/profile";


export async function loader({ request, params }: Route.LoaderArgs) {
  const session = await getCurrentSession(request);
  const token = session.get("token");
  if (!token) {
    clearUser(session);
    session.flash("error", "Your session has expired. Please log in again.");
    return redirectAndCommit("/login", session);
  }

  const { data: currentUser } = await whoamiAuthWhoamiGet({ auth: token.access_token });
  if (!currentUser) {
    session.flash("error", "Your session has expired. Please log in again.");
    return redirectAndCommit("/login", session);
  }

  const queryUsername = params.username || currentUser.username;
  const res = await listAccountsAccountsGet({
    auth: token.access_token,
    query: { username: queryUsername },
  });

  const loaderError = res.error;

  return { user: res.data?.[0] ?? null, username: queryUsername, loaderError };
}

export default function Profile({ loaderData }: Route.ComponentProps) {
  const { user, username, loaderError } = loaderData;

  if (!user) {
    return createPageContent({
      title: "Profile",
      header: <h1 className="py-2">Profile of {username}</h1>,
      alerts: { error: "This user does not exist!" },
    });
  }

  return createPageContent({
    title: "Profile",
    header: <h1 className="py-2">Profile of {username}</h1>,
    alerts: { error: loaderError },
  });
}
