import { Breadcrumb, Nav } from "react-bootstrap";
import { redirect } from "react-router";

import {
  type ProjectPublic as Project,
  type TaskPublic as Task,
  type WorkType,
  listRecentFramesFramesRecentGet,
  listTaskLabelBranchesEditorTaskLabelBranchesGet,
  listTaskSourceGroupsEditorTaskSourceGroupsGet,
  readProjectProjectsIdGet,
  readTaskTasksIdGet,
} from "../../../../client";
import { normalizeError } from "../../../errors";
import {
  getGridStateRequest,
  listGridPage,
  loadAccessTokenSession,
  parsePositiveInteger,
  redirectAndCommit,
} from "../../../loaders";
import { createSlickgridClientLoader } from "../../../components/slickgrid/client";
import { createPageContent } from "../../../templates";

import type { Route } from "./+types/recent";
import { buildFramesQuery, FrameTable } from "./frames";

const TITLES = {
  annotate: "Annotator Frames",
  review: "Reviewer Frames",
} as const;

export async function loader({ request, params }: Route.LoaderArgs) {
  const authenticated = await loadAccessTokenSession(request);
  if (authenticated instanceof Response) return authenticated;
  const { session, token } = authenticated;

  const projectId = params.projectId;
  if (projectId == null) return redirect("/projects");
  const projectIdNum = parsePositiveInteger(projectId);
  if (projectIdNum == null) return redirect("/projects");

  const taskId = params.taskId;
  if (taskId == null) return redirect(`/projects/${projectId}/tasks`);
  const taskIdNum = parsePositiveInteger(taskId);
  if (taskIdNum == null) return redirect(`/projects/${projectId}/tasks`);

  const workType: WorkType =
    params.workType === "review" ? "review" : "annotate";

  let project: Project | undefined;
  try {
    const projectRes = await readProjectProjectsIdGet({
      auth: token.access_token,
      path: { id: projectIdNum },
    });
    if (projectRes.error)
      throw projectRes.error instanceof Error
        ? projectRes.error
        : new Error(normalizeError(projectRes.error));

    project = projectRes.data;
  } catch (e) {
    session.flash("error", `Failed to open project (id=${projectId}): ${e}`);
  }
  if (!project) return redirectAndCommit("/", session);

  let task: Task | undefined;
  try {
    const taskRes = await readTaskTasksIdGet({
      auth: token.access_token,
      path: { id: taskIdNum },
    });
    if (taskRes.error)
      throw taskRes.error instanceof Error
        ? taskRes.error
        : new Error(normalizeError(taskRes.error));

    task = taskRes.data;
  } catch (e) {
    session.flash("error", `Failed to open task (id=${taskId}): ${e}`);
  }
  if (!task) return redirectAndCommit(`/projects/${project.id}/tasks`, session);

  // As on `main`, the list shows only the current user's own frames that they
  // have viewed, most recently viewed first; the server applies the account
  // scoping, viewed filter and ordering.
  const recentQuery = buildFramesQuery(getGridStateRequest(request));
  delete recentQuery.account_id;

  const [framesRes, sourceGroupsRes, labelBranchesRes] = await Promise.all([
    listGridPage(request, (pagination) =>
      listRecentFramesFramesRecentGet({
        auth: token.access_token,
        query: {
          ...recentQuery,
          ...pagination,
          task_id: taskIdNum,
          work_type: workType,
        },
      }),
    ),
    listTaskSourceGroupsEditorTaskSourceGroupsGet({
      auth: token.access_token,
      query: { task_id: taskIdNum, work_type: workType },
    }),
    listTaskLabelBranchesEditorTaskLabelBranchesGet({
      auth: token.access_token,
      query: { task_id: taskIdNum, work_type: workType },
    }),
  ]);
  const dataset = framesRes.data ?? [];
  const sourceGroups = sourceGroupsRes.data ?? [];
  const labelBranches = labelBranchesRes.data ?? [];
  const loaderError =
    framesRes.error ?? sourceGroupsRes.error ?? labelBranchesRes.error;

  return {
    project,
    task,
    taskId,
    workType,
    dataset,
    pagination: framesRes.pagination,
    sourceGroups,
    labelBranches,
    loaderError,
  };
}

export const clientLoader =
  createSlickgridClientLoader<Route.ClientLoaderArgs>();

export function HydrateFallback() {
  return <div>Loading recent frames...</div>;
}

export default function Recent({ loaderData }: Route.ComponentProps) {
  const {
    SG,
    project,
    task,
    workType,
    dataset,
    pagination,
    sourceGroups,
    labelBranches,
    loaderError,
  } = loaderData;

  return createPageContent({
    title: `Recent ${TITLES[workType]} - ${task.name} - ${project.name}`,
    header: (
      <Breadcrumb className="fs-5">
        <Breadcrumb.Item href="/projects">Projects</Breadcrumb.Item>
        <Breadcrumb.Item href={`/projects/${project.id}`}>
          {project.name}
        </Breadcrumb.Item>
        <Breadcrumb.Item active>{task.name}</Breadcrumb.Item>
      </Breadcrumb>
    ),
    main: (
      <>
        <Nav variant="tabs" className="mb-3">
          <Nav.Item>
            <Nav.Link
              href={`/projects/${project.id}/tasks/${task.id}/recent/annotate`}
              active={workType === "annotate"}
            >
              Annotator Frames
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link
              href={`/projects/${project.id}/tasks/${task.id}/recent/review`}
              active={workType === "review"}
            >
              Reviewer Frames
            </Nav.Link>
          </Nav.Item>
        </Nav>
        <FrameTable
          SG={SG}
          project={project}
          task={task}
          dataset={dataset}
          pagination={pagination}
          sourceGroups={sourceGroups}
          labelBranches={labelBranches}
          viewOnly={true}
          multiSelect={false}
          containerId="recent-frames-grid-container"
          loadingText="Loading recent frames..."
        />
      </>
    ),
    alerts: loaderError ? { error: loaderError } : {},
  });
}
