import { Button, Form } from "react-bootstrap";
import { useFetcher } from "react-router";

import { loginAuthLoginPost } from "../../client/sdk.gen";
import { normalizeError } from "../errors";
import {
  dataAndCommit,
  getCurrentSession,
  getUser,
  redirectAndCommit,
  refreshUser,
} from "../loaders";
import { getSession } from "../sessions";
import { createPageContent } from "../templates";

import type { Route } from "./+types/login";

export function getSafeReturnTo(request: Request): string {
  const requestUrl = new URL(request.url);
  const value = requestUrl.searchParams.get("returnTo");
  if (value == null || !value.startsWith("/") || value.startsWith("//"))
    return "/";

  try {
    const target = new URL(value, requestUrl.origin);
    if (target.origin !== requestUrl.origin) return "/";
    const path = `${target.pathname}${target.search}${target.hash}`;
    return path.startsWith("//") ? "/" : path;
  } catch {
    return "/";
  }
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getCurrentSession(request);

  const user = getUser(session);
  if (user) return redirectAndCommit(getSafeReturnTo(request), session);

  return dataAndCommit(
    {
      error: session.get("error"),
      success: session.get("success"),
    },
    session,
  );
}

export function LoginForm() {
  const fetcher = useFetcher();
  const isBusy = fetcher.state !== "idle";
  const errors = fetcher.data?.errors ?? {};

  return (
    <fetcher.Form method="post">
      <Form.Group className="mb-3">
        <Form.Label htmlFor="username">Username:</Form.Label>
        <Form.Control
          type="text"
          id="username"
          name="username"
          isInvalid={!!errors.username}
        />
        <Form.Control.Feedback type="invalid">
          {errors.username}
        </Form.Control.Feedback>
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label htmlFor="password">Password:</Form.Label>
        <Form.Control
          type="password"
          id="password"
          name="password"
          isInvalid={!!errors.password}
        />
        <Form.Control.Feedback type="invalid">
          {errors.password}
        </Form.Control.Feedback>
      </Form.Group>
      <Button variant="primary" type="submit" disabled={isBusy}>
        Login
      </Button>
    </fetcher.Form>
  );
}

export default function Login({ loaderData }: Route.ComponentProps) {
  return createPageContent({
    title: "Sign in",
    header: <h1 className="py-2">Sign in to your account</h1>,
    main: (
      <div>
        <LoginForm />
      </div>
    ),
    alerts: loaderData,
  });
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;

  const errors: Record<string, string> = {};
  if (!username) {
    errors.username = "Please input your username";
  }
  if (!password) {
    errors.password = "Please input your password";
  }
  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  const session = await getSession(request.headers.get("Cookie"));

  // Preserve the address supplied by the deployment's trusted edge proxy.
  // The backend accepts this header only when this SSR host is explicitly in
  // STA_TRUSTED_PROXY_IPS, preventing arbitrary direct clients from spoofing
  // rate-limit identities.
  const forwardedFor = request.headers.get("x-forwarded-for");
  const res = await loginAuthLoginPost({
    body: { username, password },
    headers: forwardedFor ? { "X-Forwarded-For": forwardedFor } : undefined,
  });
  if (!res.data) {
    session.flash("error", normalizeError(res.error));
    return redirectAndCommit(`/login${new URL(request.url).search}`, session);
  }

  session.set("token", res.data);

  const user = await refreshUser(session);
  if (!user) {
    session.flash(
      "error",
      "Unable to fetch user information. Please login again.",
    );
    return redirectAndCommit(`/login${new URL(request.url).search}`, session);
  }

  session.flash("success", "Successfully logged in.");
  return redirectAndCommit(getSafeReturnTo(request), session);
}
