import type React from "react";
import { Col, Container, Nav, Row } from "react-bootstrap";
import { Outlet } from "react-router";

import { LayoutNavLink } from "../components/LayoutNavLink";
import {
  dataAndCommit,
  loadRefreshedAuthenticatedSession,
  redirectAndCommit,
} from "../loaders";

import type { Route } from "./+types/source";

export async function loader({ request }: Route.LoaderArgs) {
  const authenticated = await loadRefreshedAuthenticatedSession(request);
  if (authenticated instanceof Response) return authenticated;
  const { session, user } = authenticated;

  if (
    !user.roles.includes("data-manager") &&
    !user.roles.includes("project-manager")
  ) {
    session.flash("error", "You lack permission to view source data.");
    return redirectAndCommit("/", session);
  }

  return dataAndCommit({ user }, session);
}

export function SourceContainer({
  user,
  children,
}: {
  user: Route.ComponentProps["loaderData"]["user"];
  children: React.ReactNode;
}) {
  return (
    <Container>
      <Row>
        <Col
          className="d-flex flex-column flex-shrink-0 p-3"
          style={{ maxWidth: "256px" }}
        >
          <a
            href="/source"
            className="d-flex align-items-center mb-3 mb-md-0 me-md-auto text-decoration-none"
          >
            <i className="fas fa-database fa-fw"></i>
            <span className="fs-4">&nbsp;Source Data</span>
          </a>
          <hr />
          <Nav variant="pills" className="flex-column mb-auto">
            <LayoutNavLink href="/source/groups">
              <i className="fas fa-object-group fa-fw"></i>
              &nbsp;Groups
            </LayoutNavLink>
            {user.roles.includes("data-manager") && (
              <LayoutNavLink href="/source/files">
                <i className="fas fa-file fa-fw"></i>&nbsp;File Explorer
              </LayoutNavLink>
            )}
            <LayoutNavLink href="/source/data" match="prefix">
              <i className="fas fa-database fa-fw"></i>&nbsp;Data Storage
            </LayoutNavLink>
            <LayoutNavLink href="/source/specs" match="prefix">
              <i className="fas fa-cogs fa-fw"></i>
              &nbsp;Specifications
            </LayoutNavLink>
          </Nav>
        </Col>
        <Col
          className="d-flex flex-column flex-shrink-0 p-3"
          id="main-content-right"
        >
          {children}
        </Col>
      </Row>
    </Container>
  );
}

export default function SourceLayout({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;

  return (
    <>
      <SourceContainer user={user}>
        <Outlet />
      </SourceContainer>
    </>
  );
}
