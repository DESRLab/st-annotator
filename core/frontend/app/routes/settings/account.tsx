import { useState } from "react";
import { Button, Form } from "react-bootstrap";
import { Form as RouterForm, useNavigation } from "react-router";

import type { UserPublic as User } from "../../../client";
import { updateAccountAuthAccountPatch } from "../../../client/sdk.gen";
import { normalizeError } from "../../errors";
import {
  dataAndCommit,
  loadAccessTokenSession,
  loadAuthenticatedSession,
  redirectAndCommit,
} from "../../loaders";
import { Username } from "../../models/user";

import type { Route } from "./+types/account";
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

export function UsernameForm({
  user,
  errors = {},
}: {
  user: User;
  errors?: Record<string, string>;
}) {
  const navigation = useNavigation();
  const isBusy = navigation.state !== "idle";
  const [username, setUsername] = useState(user.username);

  return (
    <RouterForm method="post">
      <Form.Control type="hidden" id="user-id" name="userId" value={user.id} />
      <Form.Control
        type="hidden"
        name="issued_at"
        value={user.last_edit_at ?? ""}
      />
      <Form.Group className="mb-3">
        <Form.Label htmlFor="username">Username:</Form.Label>
        <Form.Control
          type="text"
          id="username"
          name="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          isInvalid={!!errors.username}
          aria-describedby="username-help"
        />
        <Form.Control.Feedback type="invalid">
          {errors.username}
        </Form.Control.Feedback>
        {!errors.username && (
          <Form.Text id="username-help" muted>
            <Username.HelperText />
          </Form.Text>
        )}
      </Form.Group>
      <Button variant="primary" type="submit" disabled={isBusy}>
        Update username
      </Button>
    </RouterForm>
  );
}

export default function Account({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { user, error, success } = loaderData;

  return createSettingsPageContent({
    main: (
      <>
        <h4>Change username</h4>
        <hr />
        <UsernameForm user={user} errors={actionData?.errors} />
      </>
    ),
    alerts: { error, success },
  });
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const username = formData.get("username") as string;

  const errors: Record<string, string> = {};
  if (!username) {
    errors.username = "Please input your new username";
  }
  if (!Username.regex.test(username)) {
    errors.username = Username.helperText;
  }
  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  const authenticated = await loadAccessTokenSession(request);
  if (authenticated instanceof Response) return authenticated;
  const { session, token } = authenticated;

  const res = await updateAccountAuthAccountPatch({
    auth: token.access_token,
    body: {
      issued_at: formData.get("issued_at") as string,
      username,
    },
  });
  if (res.error || !res.data) {
    session.flash("error", normalizeError(res.error));
    return redirectAndCommit("/settings/account", session);
  }

  session.set("token", res.data.token);
  session.set("user", res.data.user);

  session.flash("success", "Update successful.");
  return redirectAndCommit("/settings/account", session);
}
