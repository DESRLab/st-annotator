import { useState } from 'react';
import { Button, Form } from 'react-bootstrap';
import { useFetcher } from "react-router";

import type { UserPublic as User } from '../../../client';
import { updateUserUsersIdPatch } from "../../../client/sdk.gen";
import {
  clearUser,
  dataAndCommit,
  getCurrentSession,
  getUser,
  redirectAndCommit,
  refreshUser,
} from '../../loaders';
import { Username } from "../../models/user";
import { createSettingsPageContent } from './templates';

import type { Route } from "./+types/account";

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

export function UsernameForm({ user }: { user: User }) {
  const fetcher = useFetcher();
  const isBusy = fetcher.state !== "idle";
  const errors = fetcher.data?.errors ?? {};
  const [username, setUsername] = useState(user.username);

  return (
    <fetcher.Form method="post">
      <Form.Control type="hidden" id="user-id" name="userId" value={user.id} />
      <Form.Group className="mb-3">
        <Form.Label htmlFor="username">Username:</Form.Label>
        <Form.Control
          type="text"
          id="username"
          name="username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          isInvalid={!!errors.username}
          aria-describedby="username-help"
        />
        <Form.Control.Feedback type="invalid">{errors.username}</Form.Control.Feedback>
        {!errors.username && <Form.Text id="username-help" muted>{Username.helperText}</Form.Text>}
      </Form.Group>
      <Button variant="primary" type="submit" disabled={isBusy}>Update username</Button>
    </fetcher.Form>
  );
}

export default function Account({ loaderData, actionData }: Route.ComponentProps) {
  const { user, error, success } = loaderData;

  return createSettingsPageContent({
    main: (
      <>
      <h4>Change username</h4>
      <hr />
      <UsernameForm user={user}/>
      </>
    ),
    alerts: { error, success },
  });
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const userId = formData.get("userId") as string;
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

  const session = await getCurrentSession(request);
  const token = session.get("token");
  if (!token) {
    clearUser(session);
    session.flash("error", "Your session has expired. Please log in again.");
    return redirectAndCommit("/login", session);
  }

  const res = await updateUserUsersIdPatch({
    auth: token.access_token,
    path: { id: Number.parseInt(userId, 10) },
    body: { username },
  });
  if (res.error) {
    session.flash("error", JSON.stringify(res.error));
    return redirectAndCommit("/settings/account", session);
  }
  
  const user = await refreshUser(session);
  if (!user) {
    session.flash("error", "Unable to fetch user information. Please login again.");
    return redirectAndCommit("/login", session);
  }

  session.flash("success", "Update successful.");
  return redirectAndCommit("/settings/account", session);
}
