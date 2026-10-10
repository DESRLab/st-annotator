import {
  // This page resolves an account to prove it exists and to show its username,
  // which is all the summary carries; the collection's wider `AccountPublic`
  // assigns into it unchanged.
  type AccountPublicSummary as Account,
  whoamiAuthWhoamiGet,
  listAccountsAccountsGet,
  readAccountAccountsIdGet,
} from "../../client";
import { loadAccessTokenSession, redirectAndCommit } from "../loaders";
import { createPageContent } from "../templates";

import type { Route } from "./+types/profile";

export async function loader({ request, params }: Route.LoaderArgs) {
  const authenticated = await loadAccessTokenSession(request);
  if (authenticated instanceof Response) return authenticated;
  const { session, token } = authenticated;

  const { data: currentUser } = await whoamiAuthWhoamiGet({
    auth: token.access_token,
  });
  if (!currentUser) {
    session.flash("error", "Your session has expired. Please log in again.");
    return redirectAndCommit("/login", session);
  }

  const queryUsername = params.username ?? currentUser.username;

  let user: Account | null = null;
  let loaderError: unknown;
  let responseIs404 = false;

  if (queryUsername === currentUser.username) {
    // The account collection is an administrator-only read, so resolving even
    // the signed-in user through it made every non-admin's own profile fail.
    // Individual account reads are open to authenticated users, and whoami
    // already provided the id.
    const res = await readAccountAccountsIdGet({
      auth: token.access_token,
      path: { id: currentUser.id },
    });
    user = res.data ?? null;
    loaderError = res.error;
    responseIs404 = res.response?.status === 404;
  } else {
    // Looking somebody else up by username still needs the collection, so a
    // non-admin gets an authorization error here rather than a profile.
    const res = await listAccountsAccountsGet({
      auth: token.access_token,
      query: { username: queryUsername },
    });
    const account = res.data?.[0];
    user =
      account == null ? null : { id: account.id, username: account.username };
    loaderError = res.error;
    responseIs404 = res.response?.status === 404;
  }

  return {
    user,
    username: queryUsername,
    loaderError,
    // A refused request is not the same as an absent user: only a 404 or an
    // empty collection may be reported as "does not exist".
    notFound: user == null && (responseIs404 || loaderError == null),
  };
}

export default function Profile({ loaderData }: Route.ComponentProps) {
  const { user, username, loaderError, notFound } = loaderData;

  if (!user) {
    return createPageContent({
      title: "Profile",
      header: <h1 className="py-2">Profile of {username}</h1>,
      alerts: { error: notFound ? "This user does not exist!" : loaderError },
    });
  }

  return createPageContent({
    title: "Profile",
    header: <h1 className="py-2">Profile of {username}</h1>,
    alerts: { error: loaderError },
  });
}
