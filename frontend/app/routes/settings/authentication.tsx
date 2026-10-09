import { Button, Form } from 'react-bootstrap';
import { useFetcher } from "react-router";

import type { UserPublic as User } from '../../../client';
import { updateUserUsersIdPatch, checkPasswordAuthCheckPasswordPost } from "../../../client/sdk.gen";
import { Password } from '../../models/user';
import {
  clearUser,
  dataAndCommit,
  getCurrentSession,
  getUser,
  redirectAndCommit,
  redirectAndDestroy,
  refreshUser,
} from '../../loaders';
import { createSettingsPageContent } from './templates';

import type { Route } from "./+types/authentication";


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

export function PasswordForm({ user }: { user: User }) {
  const fetcher = useFetcher();
  const isBusy = fetcher.state !== "idle";
  const errors = fetcher.data?.errors ?? {};

  return (
    <fetcher.Form method="post">
      <Form.Control type="hidden" id="user-id" name="userId" value={user.id} />
      <Form.Group className="mb-3">
        <Form.Label htmlFor="old-password">Old password:</Form.Label>
        <Form.Control
          type="text"
          id="old-password"
          name="oldPassword"
          isInvalid={!!errors.oldPassword}
        />
        <Form.Control.Feedback type="invalid">{errors.oldPassword}</Form.Control.Feedback>
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label htmlFor="new-password">New password:</Form.Label>
        <Form.Control
          type="password"
          id="new-password"
          name="newPassword"
          isInvalid={!!errors.newPassword}
          aria-describedby="new-password-help"
        />
        <Form.Control.Feedback type="invalid">{errors.newPassword}</Form.Control.Feedback>
        {!errors.newPassword && <Form.Text id="new-password-help" muted>{Password.helperText}</Form.Text>}
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label htmlFor="confirm-password">Confirm new password:</Form.Label>
        <Form.Control
          type="password"
          id="confirm-password"
          name="confirmPassword"
          isInvalid={!!errors.confirmPassword}
        />
        <Form.Control.Feedback type="invalid">{errors.confirmPassword}</Form.Control.Feedback>
      </Form.Group>
      <Button variant="primary" type="submit" disabled={isBusy}>Update password</Button>
    </fetcher.Form>
  );
}

export default function Authentication({ loaderData, actionData }: Route.ComponentProps) {
  const { user, error, success } = loaderData;

  return createSettingsPageContent({
    main: (
      <>
      <h4>Change password</h4>
      <hr />
      <PasswordForm user={user} />
      </>
    ),
    alerts: { error, success },
  });
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const userId = formData.get("userId") as string;
  const oldPassword = formData.get("oldPassword") as string;
  const newPassword = formData.get("newPassword") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  const errors: Record<string, string> = {};
  if (!oldPassword) {
    errors.oldPassword = "Please input your old password";
  }
  if (!newPassword) {
    errors.newPassword = "Please input your new password";
  }
  if (!Password.regex.test(newPassword)) {
    errors.newPassword = Password.helperText;
  }
  if (!confirmPassword) {
    errors.confirmPassword = "Please confirm your new password";
  }
  if (confirmPassword != newPassword) {
    errors.confirmPassword = "Passwords do not match";
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

  const checkRes = await checkPasswordAuthCheckPasswordPost({
    auth: token.access_token,
    body: { password: oldPassword },
  });
  if (checkRes.error) {
    session.flash("error", "Incorrect old password.");
    return redirectAndCommit("/settings/authentication", session);
  }

  const res = await updateUserUsersIdPatch({
    auth: token.access_token,
    path: { id: Number.parseInt(userId, 10) },
    body: { password: newPassword },
  });
  if (res.error) {
    session.flash("error", JSON.stringify(res.error));
    return redirectAndCommit("/settings/authentication", session);
  }
  
  const user = await refreshUser(session);
  if (!user) {
    session.flash("error", "Unable to fetch user information. Please login again.");
    return redirectAndCommit("/login", session);
  }

  session.flash("success", "Update successful.");
  return redirectAndCommit("/settings/authentication", session);
}
