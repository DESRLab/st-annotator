import type React from "react";
import { Col, Container, Nav, Row } from "react-bootstrap";
import { Outlet, redirect } from "react-router";

import { LayoutNavLink } from "../components/LayoutNavLink";
import { clearUser, dataAndCommit, getCurrentSession, redirectAndCommit, refreshUser } from "../loaders";

import type { Route } from "./+types/repo";


export async function loader({ request, params }: Route.LoaderArgs) {
  const session = await getCurrentSession(request);
  const token = session.get("token");
  if (!token) {
    clearUser(session);
    session.flash("error", "Your session has expired. Please log in again.");
    return redirectAndCommit("/login", session);
  }

  const user = await refreshUser(session);
  if (!user) {
    session.flash("error", "Your session has expired. Please log in again.");
    return redirectAndCommit("/login", session);
  }

  if (!user.roles.includes("data-manager")) {
    session.flash("error", "You lack the 'data-manager' role to view this page.");
    return redirectAndCommit("/", session);
  }

  const groupId = Number.parseInt(params.groupId, 10);
  if (!Number.isInteger(groupId)) {
    return redirect("/label/repos");
  }

  return dataAndCommit({ groupId: String(groupId) }, session);
}


export function RepositoryContainer({ groupId, children }: {
  groupId: string;
  children: React.ReactNode;
}) {
  const repositoryUrl = `/label/repos/${groupId}`;

  return (
    <Container>
      <Row>
        <Col className="d-flex flex-column flex-shrink-0 p-3" style={{ maxWidth: "256px" }}>
          <a href={repositoryUrl} className="d-flex align-items-center mb-3 mb-md-0 me-md-auto text-decoration-none">
            <i className="fas fa-code-branch fa-fw"></i>
            <span className="fs-4">&nbsp;Repository</span>
          </a>
          <hr />
          <Nav variant="pills" className="flex-column mb-auto">
            <LayoutNavLink href={`${repositoryUrl}/branches`}><i className="fas fa-code-branch fa-fw"></i>&nbsp;Branches</LayoutNavLink>
            <LayoutNavLink href={`${repositoryUrl}/commits`}><i className="fas fa-project-diagram fa-fw"></i>&nbsp;Commits</LayoutNavLink>
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


export default function RepositoryLayout({ loaderData }: Route.ComponentProps) {
  const { groupId } = loaderData;

  return (
    <RepositoryContainer groupId={groupId}>
      <Outlet />
    </RepositoryContainer>
  );
}