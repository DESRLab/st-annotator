import { Outlet, useLocation } from "react-router";
import Container from 'react-bootstrap/Container';
import Dropdown from 'react-bootstrap/Dropdown';
import DropdownButton from 'react-bootstrap/DropdownButton';
import Nav from 'react-bootstrap/Nav';
import Navbar from 'react-bootstrap/Navbar';
import NavDropdown from 'react-bootstrap/NavDropdown';

import type { UserPublic as User } from '../../client';
import { LayoutNavLink } from "../components/LayoutNavLink";
import { dataAndCommit, getCurrentSession, redirectAndCommit, refreshUser } from "../loaders";

import type { Route } from "./+types/protected";


export async function loader({ request }: Route.LoaderArgs) {
  const session = await getCurrentSession(request);

  const user = await refreshUser(session);
  if (!user) {
    session.flash("error", "Your session has expired. Please log in again.");
    return redirectAndCommit("/login", session);
  }

  return dataAndCommit({ user }, session);
}

export function UserNavLinks({ user }: { user: User }) {
  return (
    <Nav className="me-auto">
      <LayoutNavLink href="/projects" match="prefix">Projects</LayoutNavLink>
      <DataManagerNavLinks user={user} />
      <AdminNavLinks user={user} />
    </Nav>
  )
}

export function DataManagerNavLinks({ user }: { user: User }) {
  if (!user.roles.includes("data-manager")) return null;

  return (
    <>
    <LayoutNavLink href="/source" match="prefix">Source Data</LayoutNavLink>
    <LayoutNavLink href="/label" match="prefix">Label Data</LayoutNavLink>
    </>
  )
}

export function AdminNavLinks({ user }: { user: User }) {
  const location = useLocation();

  if (!user.roles.includes("admin")) return null;

  return (
    <NavDropdown title="Administration" id="navbar-admin" active={location.pathname.startsWith('/admin/')}>
      <NavDropdown.Item href="/admin/accounts">Manage accounts</NavDropdown.Item>
    </NavDropdown>
  )
}

export function MenuNavLinks({ user }: { user: User }) {
  return (
    <DropdownButton id="navbar-account" variant="outline-primary" align="end" title="Account">
      <Dropdown.Item href="/profile">Signed in as<br /><b>{String(user.username)}</b></Dropdown.Item>
      <Dropdown.Divider />
      <Dropdown.Item href="/profile">Profile</Dropdown.Item>
      <Dropdown.Item href="/settings">Settings</Dropdown.Item>
      <Dropdown.Divider />
      <Dropdown.Item href="/logout">Sign out</Dropdown.Item>
    </DropdownButton>
  )
}

export function ProtectedNavBar({ user }: { user: User }) {
  return (
    <Navbar bg="light" data-bs-theme="light" expand="lg">
      <Container fluid>
        <Navbar.Brand href="/"><img src="/assets/logo.png" alt="ST Annotator Platform" height="32" /></Navbar.Brand>
        <Navbar.Toggle aria-controls="basic-navbar-nav" />
        <Navbar.Collapse id="main-navbar">
          <UserNavLinks user={user} />
          <MenuNavLinks user={user} />
        </Navbar.Collapse>
      </Container>
    </Navbar>
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
