import Container from "react-bootstrap/Container";
import Nav from "react-bootstrap/Nav";
import NavDropdown from "react-bootstrap/NavDropdown";
import Navbar from "react-bootstrap/Navbar";
import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";

import type { UserPublic as User } from "../../client";
import { LayoutNavLink } from "../components/LayoutNavLink";
import { dataAndCommit, loadRefreshedAuthenticatedSession } from "../loaders";

import type { Route } from "./+types/protected";

/**
 * Makes the server-rendered navbar interactive while the application hydrates.
 *
 * React Bootstrap cannot attach its dropdown and collapse handlers until the
 * current route's browser-only modules finish loading. This inline script runs
 * as soon as the navbar markup is parsed and provides those two interactions
 * during that gap. `ProtectedNavBar` removes the temporary listener in its
 * first effect, after which React Bootstrap owns the navbar normally.
 */
const PRE_HYDRATION_NAVBAR_SCRIPT = `(() => {
  const script = document.currentScript;
  const navbar = script?.previousElementSibling;
  if (!(navbar instanceof HTMLElement)) return;
  const handleClick = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const collapseToggle = target.closest(".navbar-toggler");
    if (collapseToggle instanceof HTMLElement && navbar.contains(collapseToggle)) {
      const collapse = navbar.querySelector(".navbar-collapse");
      if (!(collapse instanceof HTMLElement)) return;
      const show = !collapse.classList.contains("show");
      collapse.classList.toggle("show", show);
      collapseToggle.setAttribute("aria-expanded", String(show));
      return;
    }
    const toggle = target.closest(".dropdown-toggle");
    if (!(toggle instanceof HTMLElement) || !navbar.contains(toggle)) return;
    const dropdown = toggle.closest(".dropdown");
    const menu = dropdown?.querySelector(":scope > .dropdown-menu");
    if (!(menu instanceof HTMLElement)) return;
    event.preventDefault();
    const show = !menu.classList.contains("show");
    for (const openMenu of navbar.querySelectorAll(".dropdown-menu.show")) {
      openMenu.classList.remove("show");
      openMenu.previousElementSibling?.setAttribute("aria-expanded", "false");
    }
    menu.classList.toggle("show", show);
    toggle.setAttribute("aria-expanded", String(show));
  };
  navbar.__staPreHydrationClick = handleClick;
  navbar.addEventListener("click", handleClick);
})();`;

type PreHydrationNavbar = HTMLElement & {
  __staPreHydrationClick?: EventListener;
};

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const returnTo =
    url.pathname === "/logout" ? "/" : `${url.pathname}${url.search}`;
  const authenticated = await loadRefreshedAuthenticatedSession(request, {
    redirectTo: `/login?returnTo=${encodeURIComponent(returnTo)}`,
  });
  if (authenticated instanceof Response) return authenticated;
  const { session, user } = authenticated;

  return dataAndCommit({ user }, session);
}

export function UserNavLinks({ user }: { user: User }) {
  return (
    <Nav className="me-auto">
      <LayoutNavLink href="/projects" match="prefix">
        Projects
      </LayoutNavLink>
      <DataManagerNavLinks user={user} />
      <AdminNavLinks user={user} />
    </Nav>
  );
}

export function DataManagerNavLinks({ user }: { user: User }) {
  if (
    !user.roles.includes("data-manager") &&
    !user.roles.includes("project-manager")
  )
    return null;

  return (
    <>
      <LayoutNavLink href="/source" match="prefix">
        Source Data
      </LayoutNavLink>
      <LayoutNavLink href="/label" match="prefix">
        Label Data
      </LayoutNavLink>
      {user.roles.includes("data-manager") && (
        <LayoutNavLink href="/jobs">Background Jobs</LayoutNavLink>
      )}
    </>
  );
}

export function AdminNavLinks({ user }: { user: User }) {
  const location = useLocation();

  if (!user.roles.includes("admin")) return null;

  return (
    <NavDropdown
      title="Administration"
      id="navbar-admin"
      active={location.pathname.startsWith("/admin/")}
      renderMenuOnMount
    >
      <NavDropdown.Item href="/admin/accounts">
        Manage accounts
      </NavDropdown.Item>
    </NavDropdown>
  );
}

export function MenuNavLinks({ user }: { user: User }) {
  return (
    <NavDropdown
      id="navbar-account"
      align="end"
      title="Account"
      renderMenuOnMount
    >
      <NavDropdown.Item href="/profile">
        Signed in as
        <br />
        <b>{String(user.username)}</b>
      </NavDropdown.Item>
      <NavDropdown.Divider />
      <NavDropdown.Item href="/profile">Profile</NavDropdown.Item>
      <NavDropdown.Item href="/settings">Settings</NavDropdown.Item>
      <NavDropdown.Divider />
      <NavDropdown.Item href="/logout">Sign out</NavDropdown.Item>
    </NavDropdown>
  );
}

export function ProtectedNavBar({ user }: { user: User }) {
  useEffect(() => {
    const navbar = document.querySelector<PreHydrationNavbar>(
      "#main-navbar-container",
    );
    const handleClick = navbar?.__staPreHydrationClick;
    if (navbar != null && handleClick != null) {
      navbar.removeEventListener("click", handleClick);
      delete navbar.__staPreHydrationClick;
    }
  }, []);

  return (
    <>
      <Navbar
        id="main-navbar-container"
        bg="light"
        data-bs-theme="light"
        expand="lg"
      >
        <Container fluid>
          <Navbar.Brand href="/">
            <img
              src="/assets/logo.png"
              alt="ST Annotator Platform"
              height="32"
            />
          </Navbar.Brand>
          <Navbar.Toggle aria-controls="basic-navbar-nav" />
          <Navbar.Collapse id="main-navbar">
            <UserNavLinks user={user} />
            <MenuNavLinks user={user} />
          </Navbar.Collapse>
        </Container>
      </Navbar>
      <script
        data-sta-pre-hydration-navbar
        dangerouslySetInnerHTML={{ __html: PRE_HYDRATION_NAVBAR_SCRIPT }}
      />
    </>
  );
}

export default function ProtectedLayout({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;

  return (
    <>
      <ProtectedNavBar user={user} />
      <Outlet />
    </>
  );
}
