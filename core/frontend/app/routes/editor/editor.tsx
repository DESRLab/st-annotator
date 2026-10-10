import { useCallback } from "react";
import type { LinksFunction } from "react-router";

import type { ProjectConfig as ProjectConfigPublic } from "../../../client";
import {
  readProjectProjectsIdGet,
  readProjectConfigEditorConfigGet,
} from "../../../client/sdk.gen";
import {
  loadAccessTokenSession,
  parsePositiveInteger,
  redirectAndCommit,
} from "../../loaders";

import type { Route } from "./+types/editor";
import { EditorRuntimeProvider } from "./EditorRuntimeProvider";
import type { EditorLoadOptions } from "./runtime";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: "/styles/editor.css" },
];

export async function loader({ params, request }: Route.LoaderArgs) {
  const authenticated = await loadAccessTokenSession(request);
  if (authenticated instanceof Response) return authenticated;
  const { session, token } = authenticated;

  const projectId = parseOptionalPositiveInteger(params.projectId);
  if (projectId == null) return redirectAndCommit("/projects", session);

  const [projectResponse, configResponse] = await Promise.all([
    readProjectProjectsIdGet({
      auth: token.access_token,
      path: { id: projectId },
    }),
    readProjectConfigEditorConfigGet({
      auth: token.access_token,
      query: { project_id: projectId },
    }),
  ]);
  if (projectResponse.data == null)
    return redirectAndCommit("/projects", session);

  return { projectConfig: configResponse.data ?? null };
}

export async function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
  return serverLoader();
}

clientLoader.hydrate = true as const;

export function HydrateFallback() {
  return <main />;
}

export function parseOptionalNumber(value: string | null | undefined) {
  if (value == null || value.trim() === "") return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseOptionalPositiveInteger(value: string | null | undefined) {
  return parsePositiveInteger(value) ?? undefined;
}

export function parseProjectIdFromPathname(pathnameOrUrl: string) {
  let pathname = pathnameOrUrl;

  try {
    pathname = new URL(pathnameOrUrl, window.location.origin).pathname;
  } catch {
    // Treat the input as an already-parsed pathname.
  }

  const match = /(?:^|\/)projects\/([^/]+)\/(?:annotate|review)(?:\/|$)/.exec(
    pathname,
  );
  return parseOptionalPositiveInteger(match?.[1]);
}

export function resolveEditorProjectId(
  paramProjectId: string | null | undefined,
  pathnameOrUrl: string,
) {
  return (
    parseOptionalPositiveInteger(paramProjectId) ??
    parseProjectIdFromPathname(pathnameOrUrl)
  );
}

export const DEFAULT_EDITOR_PROJECT_CONFIG: ProjectConfigPublic = {
  frame_cache_size: 256,
  init_camera_position: { x: 0, y: 0, z: 100 },
  init_camera_target: { x: 0, y: 0, z: 0 },
};

export default function EditorRoute({
  params,
  loaderData,
}: Route.ComponentProps) {
  const getLoadOptions = useCallback((): EditorLoadOptions => {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = params.workType === "review" ? "review" : "annotate";
    const projectId = resolveEditorProjectId(
      params.projectId,
      window.location.href,
    );

    if (projectId == null) {
      throw new Error("Missing project id");
    }

    return {
      mode,
      projectId,
      taskId: parseOptionalNumber(urlParams.get("task_id")),
      frameId: parseOptionalNumber(urlParams.get("frame_id")),
    };
  }, [params.projectId, params.workType]);

  const projectId = resolveEditorProjectId(
    params.projectId,
    typeof window === "undefined" ? "" : window.location.href,
  );
  if (projectId == null) {
    throw new Error("Missing project id");
  }

  return (
    <EditorRuntimeProvider
      getLoadOptions={getLoadOptions}
      initialProjectConfig={loaderData.projectConfig ?? undefined}
      projectId={projectId}
    />
  );
}
