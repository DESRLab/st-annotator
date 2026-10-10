import type React from "react";
import { Col, Container, Nav, Row } from "react-bootstrap";
import { Outlet } from "react-router";

import { LayoutNavLink } from "../components/LayoutNavLink";
import {
  dataAndCommit,
  loadRefreshedAuthenticatedSession,
  redirectAndCommit,
} from "../loaders";

import type { Route } from "./+types/label";

export async function loader({ request }: Route.LoaderArgs) {
  const authenticated = await loadRefreshedAuthenticatedSession(request);
  if (authenticated instanceof Response) return authenticated;
  const { session, user } = authenticated;

  if (
    !user.roles.includes("data-manager") &&
    !user.roles.includes("project-manager")
  ) {
    session.flash("error", "You lack permission to view label data.");
    return redirectAndCommit("/", session);
  }

  return dataAndCommit({ user }, session);
}

export function LabelContainer({
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
            href="/label"
            className="d-flex align-items-center mb-3 mb-md-0 me-md-auto text-decoration-none"
          >
            <i className="fas fa-database fa-fw"></i>
            <span className="fs-4">&nbsp;Label Data</span>
          </a>
          <hr />
          <Nav variant="pills" className="flex-column mb-auto">
            <LayoutNavLink href="/label/groups">
              <i className="fas fa-object-group fa-fw"></i>
              &nbsp;Groups
            </LayoutNavLink>
            <LayoutNavLink href="/label/repos">
              <i className="fas fa-code-branch fa-fw"></i>
              &nbsp;Repositories
            </LayoutNavLink>
            <LayoutNavLink href="/label/data" match="prefix">
              <i className="fas fa-database fa-fw"></i>&nbsp;Data Storage
            </LayoutNavLink>
            <LayoutNavLink href="/label/specs" match="prefix">
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

export default function LabelLayout({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;

  return (
    <>
      <LabelContainer user={user}>
        <Outlet />
      </LabelContainer>
    </>
  );
}
