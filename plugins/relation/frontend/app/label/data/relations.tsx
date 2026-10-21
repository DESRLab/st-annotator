import { Breadcrumb, Table } from "react-bootstrap";
import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { loadAuthenticatedSession } from "sta/app/loaders";
import {
  LabelDataFilterForm,
  getCommitOptions,
  sortLabelGroups,
  parseOptionalInteger,
  normalizeError,
  formatClassName,
} from "sta/app/plugins";
import { createPageContent } from "sta/app/templates";
import {
  listGroupsLabelGroupsGet,
  listBranchesLabelRepoBranchesGet,
  listRelationsLabelDataRelationGet,
  listRelclassesLabelSpecRelationClassDefinitionsGet,
} from "sta/client";

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await loadAuthenticatedSession(request);
  if (session instanceof Response) return session;
  const { token } = session;
  const url = new URL(request.url);
  const groupId = parseOptionalInteger(url.searchParams.get("group_id"));
  const commitHash = url.searchParams.get("commit_hash") ?? "";
  const groupsResponse = await listGroupsLabelGroupsGet({
    auth: token.access_token,
  });
  const groups = sortLabelGroups(groupsResponse.data ?? []);
  const branchesResponse =
    groupId == null
      ? null
      : await listBranchesLabelRepoBranchesGet({
          auth: token.access_token,
          query: { group_id: groupId },
        });
  const commitOptions = getCommitOptions(branchesResponse?.data ?? []);
  const response =
    groupId == null || commitHash === ""
      ? null
      : await listRelationsLabelDataRelationGet({
          auth: token.access_token,
          query: { group_id: groupId, commit_hash: commitHash },
        });
  const classesResponse =
    groupId == null || commitHash === ""
      ? null
      : await listRelclassesLabelSpecRelationClassDefinitionsGet({
          auth: token.access_token,
        });
  const classNames: Record<number, string> = Object.fromEntries(
    (classesResponse?.data ?? []).map((item) => [item.id, item.name]),
  );
  const error = response?.error ?? classesResponse?.error;
  return {
    classNames,
    groups,
    branches: branchesResponse?.data ?? [],
    commitOptions,
    groupId,
    commitHash,
    rows: response?.data ?? [],
    error: error == null ? null : normalizeError(error),
  };
}

export default function Relations() {
  const data =
    useLoaderData<Exclude<Awaited<ReturnType<typeof loader>>, Response>>();
  return createPageContent({
    main: (
      <>
        <Breadcrumb>
          <Breadcrumb.Item href="/label/data">Label Data</Breadcrumb.Item>
          <Breadcrumb.Item active>Relations</Breadcrumb.Item>
        </Breadcrumb>
        <h2>Relations</h2>
        <LabelDataFilterForm
          groups={data.groups}
          controlIdPrefix="relation-data"
          branches={data.branches}
          selectedGroupId={data.groupId}
          selectedCommitHash={data.commitHash}
        />
        {data.error && <p role="alert">{data.error}</p>}
        <Table striped responsive>
          <thead>
            <tr>
              <th>ID</th>
              <th>Source</th>
              <th>Target</th>
              <th>Relation class</th>
              <th>Deleted</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((relation) => (
              <tr key={relation.id}>
                <td>{relation.id}</td>
                <td>
                  {relation.source_type}: {relation.source_id}
                </td>
                <td>
                  {relation.target_type}: {relation.target_id}
                </td>
                <td>
                  {formatClassName(relation.relation_class_id, data.classNames)}
                </td>
                <td>{relation.is_deleted ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </>
    ),
  });
}
