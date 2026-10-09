import { Breadcrumb } from 'react-bootstrap';
import { redirect } from "react-router";

import {
  type ProjectPublic as Project,
  type TaskPublic as Task,
  type WorkType,
  listFramesFramesGet,
  readProjectProjectsIdGet,
  readTaskTasksIdGet,
} from '../../../../client';
import { clearUser, getCurrentSession, redirectAndCommit } from "../../../loaders";
import { createPageContent } from "../../../templates";

import { FrameTable } from './frames';
import type { Route } from "./+types/recent";


const TITLES = {
  annotate: 'Annotator Frames',
  review: 'Reviewer Frames',
} as const;


export async function loader({ request, params }: Route.LoaderArgs) {
  const session = await getCurrentSession(request);
  const token = session.get("token");
  if (!token) {
    clearUser(session);
    session.flash("error", "Your session has expired. Please log in again.");
    return redirectAndCommit("/login", session);
  }

  const projectId = params.projectId;
  if (projectId == null) return redirect("/projects");

  const taskId = params.taskId;
  if (taskId == null) return redirect(`/projects/${projectId}/tasks`);

  const workType: WorkType = params.workType === 'review' ? 'review' : 'annotate';

  let project: Project | undefined;
  try {
    const projectRes = await readProjectProjectsIdGet({
      auth: token.access_token,
      path: { id: Number.parseInt(projectId, 10) },
    });
    if (projectRes.error) throw projectRes.error;

    project = projectRes.data;
  } catch (e) {
    session.flash("error", `Failed to open project (id=${projectId}): ${e}`);
  }
  if (!project) return redirectAndCommit("/", session);

  let task: Task | undefined;
  try {
    const taskRes = await readTaskTasksIdGet({
      auth: token.access_token,
      path: { id: Number.parseInt(taskId, 10) },
    });
    if (taskRes.error) throw taskRes.error;

    task = taskRes.data;
  } catch (e) {
    session.flash("error", `Failed to open task (id=${taskId}): ${e}`);
  }
  if (!task) return redirectAndCommit(`/projects/${project.id}/tasks`, session);

  const taskIdNum = Number.parseInt(taskId, 10);
  
  const framesRes = await listFramesFramesGet({
    auth: token.access_token,
    query: { task_id: taskIdNum, work_type: workType },
  });
  const dataset = (framesRes.data ?? []).sort((a, b) => {
    const aTime = a.last_viewed_at == null ? 0 : Date.parse(a.last_viewed_at);
    const bTime = b.last_viewed_at == null ? 0 : Date.parse(b.last_viewed_at);
    return bTime - aTime;
  });

  const loaderError = framesRes.error;

  return { project, task, taskId, workType, dataset, loaderError };
}

export async function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
  const loaderData = await serverLoader();
  const SG = await import('slickgrid-react');
  return { ...loaderData, SG };
}

clientLoader.hydrate = true as const;

export function HydrateFallback() {
  return <div>Loading recent frames...</div>;
}

export default function Recent({ loaderData }: Route.ComponentProps) {
  const { SG, project, task, workType, dataset, loaderError } = loaderData;

  return createPageContent({
    title: `Recent ${TITLES[workType]} - ${task.name} - ${project.name}`,
    header: <Breadcrumb className="fs-5">
      <Breadcrumb.Item href="/projects">Projects</Breadcrumb.Item>
      <Breadcrumb.Item href={`/projects/${project.id}`}>{project.name}</Breadcrumb.Item>
      <Breadcrumb.Item active>{task.name}</Breadcrumb.Item>
    </Breadcrumb>,
    main: <FrameTable
      SG={SG}
      dataset={dataset}
      viewOnly={true}
      containerId="recent-frames-grid-container"
      loadingText="Loading recent frames..."
    />,
    alerts: loaderError ? { error: loaderError } : {},
  });
}
