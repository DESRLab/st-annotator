import { dataAndCommit, loadAuthenticatedSession } from "../../loaders";

import type { Route } from "./+types/profile";
import { createSettingsPageContent } from "./templates";

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
