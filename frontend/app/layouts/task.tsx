import type React from "react";
import { Col, Container, Nav, Row } from "react-bootstrap";
import { Outlet, redirect } from "react-router";

import type { UserPublic as User } from "../../client";
import { LayoutNavLink } from "../components/LayoutNavLink";
import { dataAndCommit, getCurrentSession, redirectAndCommit, refreshUser } from "../loaders";

import type { Route } from "./+types/task";


export async function loader({ request, params }: Route.LoaderArgs) {
  const session = await getCurrentSession(request);

  const user = await refreshUser(session);
  if (!user) {
    session.flash("error", "Your session has expired. Please log in again.");
    return redirectAndCommit("/login", session);
  }

  const projectId = params.projectId;
  if (projectId == null) return redirect("/projects");

  const taskId = params.taskId;
  if (taskId == null) return redirect(`/projects/${projectId}/tasks`);

  return dataAndCommit({ user, projectId, taskId }, session);
}


export function TaskContainer({ user, projectId, taskId, children }: {
  user: User;
  projectId: string;
  taskId: string;
  children: React.ReactNode;
}) {
  const projectUrl =`/projects/${projectId}`;
  const taskUrl =`/projects/${projectId}/tasks/${taskId}`;

  return (
    <Container>
      <Row>
        <Col className="d-flex flex-column flex-shrink-0 p-3" style={{ maxWidth: "256px" }}>
          <a href={taskUrl} className="d-flex align-items-center mb-3 mb-md-0 me-md-auto text-decoration-none">
            <i className="fas fa-tasks fa-fw"></i>
            <span className="fs-4">&nbsp;Task</span>
          </a>
          <hr />
          <Nav variant="pills" className="flex-column mb-auto">
            <LayoutNavLink href={`${taskUrl}/recent`}><i className="fas fa-tasks fa-fw"></i>&nbsp;Recent Frames</LayoutNavLink>
            <LayoutNavLink href={`${taskUrl}/frames`}><i className="fas fa-tasks fa-fw"></i>&nbsp;All Frames</LayoutNavLink>
            {user.roles.includes("annotator") && <LayoutNavLink href={`${projectUrl}/annotate?task_id=${taskId}`}><i className="fas fa-edit fa-fw"></i>&nbsp;Annotate</LayoutNavLink>}
            {user.roles.includes("supervisor") && <LayoutNavLink href={`${projectUrl}/review?task_id=${taskId}`}><i className="fas fa-edit fa-fw"></i>&nbsp;Review</LayoutNavLink>}
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


export default function TaskLayout({ loaderData }: Route.ComponentProps) {
  const { user, projectId, taskId } = loaderData;

  return (
    <>
      <TaskContainer user={user} projectId={projectId} taskId={taskId} >
        <Outlet />
      </TaskContainer>
    </>
  );
}
