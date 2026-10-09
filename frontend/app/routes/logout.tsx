

import { useEffect } from 'react';
import { useFetcher, useNavigate } from "react-router";

import { logoutAuthLogoutPost } from '../../client';
import { clearUser, getCurrentSession, redirectAndCommit } from '../loaders';
import { createPageContent } from '../templates';

import type { Route } from "./+types/logout";


export default function Logout({ loaderData }: Route.ComponentProps) {
  const fetcher = useFetcher();
  const navigate = useNavigate();

  // Give the user some time to abort the logout
  useEffect(() => {
    const timer = setTimeout(() => {
      fetcher.submit({}, { method: "post" });
    }, 1000);

    return () => clearTimeout(timer);
  }, [fetcher]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      navigate("/login");
    }
  }, [fetcher.state, fetcher.data, navigate]);

  return createPageContent({
    title: "Logout",
    header: <h1 className="py-2">Logout</h1>,
    main: <p>Logging out...</p>,
  });
}

export async function action({ request }: Route.ActionArgs) {
  const session = await getCurrentSession(request);
  const token = session.get("token");
  if (!token) return redirectAndCommit("/login", session);

  await logoutAuthLogoutPost({ auth: token.access_token });
  clearUser(session);
  session.flash("success", "Successfully logged out.");
  return redirectAndCommit("/login", session);
}
