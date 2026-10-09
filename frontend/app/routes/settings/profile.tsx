import { dataAndCommit, getCurrentSession, getUser, redirectAndCommit } from '../../loaders';
import { createSettingsPageContent } from './templates';

import type { Route } from "./+types/profile";


export async function loader({ request }: Route.LoaderArgs) {
  const session = await getCurrentSession(request);

  const user = getUser(session);
  if (!user) {
    session.flash("error", "Your session has expired. Please log in again.");
    return redirectAndCommit("/login", session);
  }

  return dataAndCommit(
    {
      error: session.get("error"),
      success: session.get("success"),
      user: user,
    },
    session,
  );
}

export default function Profile({ loaderData }: Route.ComponentProps) {
  const { error, success } = loaderData;

  return createSettingsPageContent({
    main: (
      <>
      <h4>Profile</h4>
      <hr />
      </>
    ),
    alerts: { error, success },
  });
}
