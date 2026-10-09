import type React from "react";
import { Col, Container, Nav, Row } from "react-bootstrap";
import { Outlet, redirect } from "react-router";

import type { UserPublic as User } from "../../client";
import { LayoutNavLink } from "../components/LayoutNavLink";
import { dataAndCommit, getCurrentSession, redirectAndCommit, refreshUser } from "../loaders";

import type { Route } from "./+types/project";


export async function loader({ request, params }: Route.LoaderArgs) {
  const session = await getCurrentSession(request);

  const user = await refreshUser(session);
  if (!user) {
    session.flash("error", "Your session has expired. Please log in again.");
    return redirectAndCommit("/login", session);
  }

  const projectId = params.projectId;
  if (projectId == null) return redirect("/projects");

  return dataAndCommit({ user, projectId }, session);
}


export function ProjectContainer({ user, projectId, children }: {
  user: User;
  projectId: string;
  children: React.ReactNode;
}) {
  const projectUrl =`/projects/${projectId}`;

  return (
    <Container>
      <Row>
        <Col className="d-flex flex-column flex-shrink-0 p-3" style={{ maxWidth: "256px" }}>
          <a href={projectUrl} className="d-flex align-items-center mb-3 mb-md-0 me-md-auto text-decoration-none">
            <i className="fas fa-project-diagram fa-fw"></i>
            <span className="fs-4">&nbsp;Project</span>
          </a>
          <hr />
          <Nav variant="pills" className="flex-column mb-auto">
            <LayoutNavLink href={`${projectUrl}/tasks`}><i className="fas fa-tasks fa-fw"></i>&nbsp;Tasks</LayoutNavLink>
            {user.roles.includes("annotator") && <LayoutNavLink href={`${projectUrl}/annotate`}><i className="fas fa-edit fa-fw"></i>&nbsp;Annotate</LayoutNavLink>}
            {user.roles.includes("supervisor") && <LayoutNavLink href={`${projectUrl}/review`}><i className="fas fa-edit fa-fw"></i>&nbsp;Review</LayoutNavLink>}
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
  )
}


export default function ProjectLayout({ loaderData }: Route.ComponentProps) {
  const { user, projectId } = loaderData;

  return (
    <>
      <ProjectContainer user={user} projectId={projectId} >
        <Outlet />
      </ProjectContainer>
    </>
  );
}
