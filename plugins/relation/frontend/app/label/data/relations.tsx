import { default as React, useEffect, useRef, useState } from "react";
import type {
  Column,
  GridOption,
  MenuCommandItem,
  SlickgridReactInstance,
} from "slickgrid-react";
import {
  createSlickgridClientLoader,
  selectableConfig,
  syncRoutePaginationGrid,
  useRoutePaginationGridOptions,
} from "sta/app/components";
import { Breadcrumb, Button, Col, Form, Modal, Row } from "react-bootstrap";
import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { listLabelDataPage, loadAuthenticatedSession } from "sta/app/loaders";
import {
  LabelDataFilterForm,
  asSlickgridModule,
  createLabelClassFilter,
  createLabelDataGridOptions,
  LabelDataPaginationControls,
  getCommitOptions,
  sortLabelGroups,
  parseOptionalInteger,
  normalizeError,
  formatClassName,
  formatUnknown,
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
      : await listLabelDataPage(request, (pagination) =>
          listRelationsLabelDataRelationGet({
            auth: token.access_token,
            query: {
              group_id: groupId,
              commit_hash: commitHash,
              ...pagination,
            },
          }),
        );
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
    pagination: response?.pagination,
    error: error == null ? null : normalizeError(error),
  };
}

export const clientLoader = createSlickgridClientLoader<{
  serverLoader: () => Promise<
    Exclude<Awaited<ReturnType<typeof loader>>, Response>
  >;
}>();

export function HydrateFallback() {
  return <div>Loading relations...</div>;
}

type Relation = Exclude<
  Awaited<ReturnType<typeof loader>>,
  Response
>["rows"][number];

function DetailField({
  label,
  value,
  md = 6,
  xs,
}: {
  label: string;
  value: unknown;
  md?: number;
  xs?: number;
}) {
  return (
    <Col xs={xs} md={md}>
      <Form.Group
        className="mb-3"
        controlId={`relation-detail-${label.replaceAll(" ", "-").toLowerCase()}`}
      >
        <Form.Label>{label}</Form.Label>
        <Form.Control value={formatUnknown(value)} disabled readOnly />
      </Form.Group>
    </Col>
  );
}

export default function Relations() {
  const data = useLoaderData<Awaited<ReturnType<typeof clientLoader>>>();
  const pagination = data.pagination;
  const SG = asSlickgridModule(data.SG);
  const gridRef = useRef<SlickgridReactInstance | null>(null);
  const [detail, setDetail] = useState<Relation | null>(null);
  const commandItems: MenuCommandItem[] = [
    {
      command: "view",
      title: "View Details",
      iconCssClass: "fas fa-info-circle fa-fw",
      action: (_event, args) => setDetail(args.dataContext as Relation),
    },
  ];
  const paginationOptions = useRoutePaginationGridOptions(
    pagination,
    data.rows,
  );
  useEffect(() => {
    if (pagination != null)
      syncRoutePaginationGrid(gridRef.current, pagination);
  }, [data.rows, pagination]);
  const { SlickgridReact } = SG;
  const columns: Column<
    Exclude<Awaited<ReturnType<typeof loader>>, Response>["rows"][number]
  >[] = [
    { id: "id", field: "id", name: "ID", type: "string", filterable: true },
    {
      id: "source_type",
      field: "source_type",
      name: "Source Type",
      type: "string",
      filterable: true,
    },
    {
      id: "source_id",
      field: "source_id",
      name: "Source ID",
      type: "string",
      filterable: true,
    },
    {
      id: "target_type",
      field: "target_type",
      name: "Target Type",
      type: "string",
      filterable: true,
    },
    {
      id: "target_id",
      field: "target_id",
      name: "Target ID",
      type: "string",
      filterable: true,
    },
    {
      id: "relation_class_id",
      field: "relation_class_id",
      name: "Relation Class",
      type: "integer",
      filterable: true,
      filter: createLabelClassFilter(SG, data.classNames),
      formatter: (_row, _cell, value) =>
        formatClassName(value as number | null, data.classNames),
    },
    {
      id: "is_deleted",
      field: "is_deleted",
      name: "Deleted",
      type: "boolean",
      filterable: true,
      filter: {
        model: SG.Filters.singleSelect,
        collection: [
          { value: "", label: "" },
          { value: true, label: "Yes" },
          { value: false, label: "No" },
        ],
      },
      formatter: (_row, _cell, value) => (value === true ? "Yes" : "No"),
    },
  ];
  return createPageContent({
    main: (
      <React.Fragment>
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
        {pagination != null && (
          <div className="slickgrid-container" id="relations-grid-container">
            <SlickgridReact
              gridId="relations-grid"
              columns={columns}
              options={{
                ...createLabelDataGridOptions("relations-grid-container"),
                ...(selectableConfig({
                  commandItems: commandItems as never,
                  multiSelect: false,
                }) as unknown as GridOption),
                showCustomFooter: false,
                ...paginationOptions,
              }}
              dataset={data.rows}
              onReactGridCreated={(event) => {
                gridRef.current = event.detail;
              }}
            />
          </div>
        )}
        {pagination != null && (
          <LabelDataPaginationControls pagination={pagination} />
        )}
        <Modal show={detail != null} onHide={() => setDetail(null)} size="xl">
          <Modal.Header closeButton>
            <Modal.Title>Relation Details</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {detail != null && (
              <React.Fragment>
                <Row>
                  <DetailField label="ID" value={detail.id} />
                  <DetailField
                    label="Relation Class"
                    value={formatClassName(
                      detail.relation_class_id,
                      data.classNames,
                    )}
                  />
                </Row>
                <Row>
                  <DetailField
                    label="Group ID"
                    value={detail.group_id}
                    xs={4}
                    md={3}
                  />
                  <DetailField
                    label="Commit Hash"
                    value={detail.commit_hash}
                    xs={8}
                    md={9}
                  />
                </Row>
                <Row>
                  <DetailField
                    label="Last Edited"
                    value={detail.last_edit_at}
                  />
                  <DetailField
                    label="Deleted"
                    value={detail.is_deleted ? "Yes" : "No"}
                  />
                </Row>
                <Row>
                  <DetailField
                    label="Source Type"
                    value={detail.source_type}
                    md={3}
                  />
                  <DetailField
                    label="Source ID"
                    value={detail.source_id}
                    md={9}
                  />
                </Row>
                <Row>
                  <DetailField
                    label="Target Type"
                    value={detail.target_type}
                    md={3}
                  />
                  <DetailField
                    label="Target ID"
                    value={detail.target_id}
                    md={9}
                  />
                </Row>
              </React.Fragment>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setDetail(null)}>
              Close
            </Button>
          </Modal.Footer>
        </Modal>
      </React.Fragment>
    ),
  });
}
