import { Button, Form } from "react-bootstrap";
import { useFetcher } from "react-router";

import type { UserPublic as User } from "../../../client";
import { updateUserUsersIdPatch } from "../../../client/sdk.gen";
import { normalizeError } from "../../errors";
import {
  dataAndCommit,
  clearUser,
  loadAuthenticatedSession,
  redirectAndCommit,
} from "../../loaders";
import { Password } from "../../models/user";

import type { Route } from "./+types/authentication";
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

export function PasswordForm({ user }: { user: User }) {
  const fetcher = useFetcher();
  const isBusy = fetcher.state !== "idle";
  const errors = fetcher.data?.errors ?? {};

  return (
    <fetcher.Form method="post">
      <Form.Control type="hidden" id="user-id" name="userId" value={user.id} />
      <Form.Control
        type="hidden"
        name="issued_at"
        value={user.last_edit_at ?? ""}
      />
      <Form.Group className="mb-3">
        <Form.Label htmlFor="current-password">Current password:</Form.Label>
        <Form.Control
          type="password"
          id="current-password"
          name="currentPassword"
          autoComplete="current-password"
          isInvalid={!!errors.currentPassword}
        />
        <Form.Control.Feedback type="invalid">
          {errors.currentPassword}
        </Form.Control.Feedback>
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label htmlFor="new-password">New password:</Form.Label>
        <Form.Control
          type="password"
          id="new-password"
          name="newPassword"
          autoComplete="new-password"
          isInvalid={!!errors.newPassword}
          aria-describedby="new-password-help"
        />
        <Form.Control.Feedback type="invalid">
          {errors.newPassword}
        </Form.Control.Feedback>
        {!errors.newPassword && (
          <Form.Text id="new-password-help" muted>
            <Password.HelperText />
          </Form.Text>
        )}
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label htmlFor="confirm-password">
          Confirm new password:
        </Form.Label>
        <Form.Control
          type="password"
          id="confirm-password"
          name="confirmPassword"
          autoComplete="new-password"
          isInvalid={!!errors.confirmPassword}
        />
        <Form.Control.Feedback type="invalid">
          {errors.confirmPassword}
        </Form.Control.Feedback>
      </Form.Group>
      <Button variant="primary" type="submit" disabled={isBusy}>
        Update password
      </Button>
    </fetcher.Form>
  );
}

export default function Authentication({
  loaderData,
  actionData,
}: Route.ComponentProps) {
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
  const currentPassword = formData.get("currentPassword") as string;
  const newPassword = formData.get("newPassword") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  const errors: Record<string, string> = {};
  if (!currentPassword) {
    errors.currentPassword = "Please input your current password";
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

  const authenticated = await loadAuthenticatedSession(request);
  if (authenticated instanceof Response) return authenticated;
  const { session, token, user: currentUser } = authenticated;

  const res = await updateUserUsersIdPatch({
    auth: token.access_token,
    path: { id: currentUser.id },
    body: {
      issued_at: formData.get("issued_at") as string,
      password: newPassword,
      current_password: currentPassword,
    },
  });
  if (res.error) {
    session.flash("error", normalizeError(res.error));
    return redirectAndCommit("/settings/authentication", session);
  }

  // The backend revokes all existing tokens after a password change.
  clearUser(session);
  session.unset("token");
  session.flash("success", "Password updated. Please log in again.");
  return redirectAndCommit("/login", session);
}
