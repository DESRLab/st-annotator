import moment from "moment";

import { dataAndCommit, loadAuthenticatedSession } from "../loaders";
import { createPageContent } from "../templates";

import type { Route } from "./+types/dashboard";

export async function loader({ request }: Route.LoaderArgs) {
  const authenticated = await loadAuthenticatedSession(request);
  if (authenticated instanceof Response) return authenticated;
  const { session, user } = authenticated;

  return dataAndCommit(
    {
      error: session.get("error"),
      success: session.get("success"),
      user: user,
    },
    session,
  );
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { user, error, success } = loaderData;

  const header = user.prev_login_at ? (
    <>
      <h1 className="py-2">Welcome back, {user.username}!</h1>
      {user.prev_login_at && (
        <span>You last logged in {moment(user.prev_login_at).fromNow()}.</span>
      )}
    </>
  ) : (
    <h1 className="py-2">Welcome, {user.username}!</h1>
  );

  return createPageContent({
    title: "Welcome",
    header: header,
    alerts: { error, success },
  });
}
