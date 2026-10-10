import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Breadcrumb,
  Button,
  Col,
  Form,
  Modal,
  Row,
} from "react-bootstrap";
import { redirect, useLoaderData } from "react-router";
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
import {
  getGridPaginationRequest,
  GRID_PAGE_SIZES,
  listGridPage,
  loadAuthenticatedSession,
  type GridPagination,
} from "sta/app/loaders";
import {
  createLabelDataGridOptions,
  asSlickgridModule,
  formatUnknown,
  getCommitOptions,
  LabelDataFilterForm,
  normalizeError,
  parseOptionalInteger,
  sortLabelGroups,
  type SlickgridModule,
} from "sta/app/plugins";
import { createPageContent } from "sta/app/templates";
import {
  listBranchesLabelRepoBranchesGet,
  listElementSummariesLabelDataVectorElementSummaryGet,
  listGroupsLabelGroupsGet,
  readElementLabelDataVectorElementIdGet,
  type LabelVectorDataManagerPublic,
  type LabelVectorSummary,
} from "sta/client";

import type { Route } from "./+types/vector";

type VectorElement = LabelVectorSummary;
type VectorElementDetail = LabelVectorSummary | LabelVectorDataManagerPublic;

export async function loader({ request }: Route.LoaderArgs) {
  const authenticated = await loadAuthenticatedSession(request);
  if (authenticated instanceof Response) return authenticated;
  const { token } = authenticated;

  const url = new URL(request.url);
  const requestedGroupId = parseOptionalInteger(
    url.searchParams.get("group_id"),
  );
  const requestedCommitHash = url.searchParams.get("commit_hash") ?? "";

  const groupsRes = await listGroupsLabelGroupsGet({
    auth: token.access_token,
  });
  const groups = sortLabelGroups(groupsRes.data ?? []);
  const selectedGroupId = groups.some((group) => group.id === requestedGroupId)
    ? requestedGroupId
    : null;

  const branchesRes =
    selectedGroupId == null
      ? { data: [], error: undefined }
      : await listBranchesLabelRepoBranchesGet({
          auth: token.access_token,
          query: { group_id: selectedGroupId },
        });
  const branches = branchesRes.data ?? [];
  const commitOptions = getCommitOptions(branches);
  const selectedCommitHash = commitOptions.some(
    (commit) => commit.hash === requestedCommitHash,
  )
    ? requestedCommitHash
    : "";

  const canonicalSearchParams = new URLSearchParams(url.searchParams);
  if (selectedGroupId != null) {
    canonicalSearchParams.set("group_id", String(selectedGroupId));
  } else {
    canonicalSearchParams.delete("group_id");
  }
  if (selectedCommitHash !== "") {
    canonicalSearchParams.set("commit_hash", selectedCommitHash);
  } else {
    canonicalSearchParams.delete("commit_hash");
  }
  if (
    canonicalSearchParams.get("group_id") !==
      url.searchParams.get("group_id") ||
    canonicalSearchParams.get("commit_hash") !==
      url.searchParams.get("commit_hash")
  ) {
    canonicalSearchParams.delete("page");
    canonicalSearchParams.delete("pageSize");
    return redirect(`${url.pathname}?${canonicalSearchParams.toString()}`);
  }

  const emptyPageRequest = getGridPaginationRequest(request);
  const elementsRes =
    selectedGroupId != null && selectedCommitHash !== ""
      ? await listGridPage(request, (pagination) =>
          listElementSummariesLabelDataVectorElementSummaryGet({
            auth: token.access_token,
            query: {
              group_id: selectedGroupId,
              commit_hash: selectedCommitHash,
              ...pagination,
            },
          }),
        )
      : {
          data: [],
          error: undefined,
          pagination: {
            pageNumber: emptyPageRequest.pageNumber,
            pageSize: emptyPageRequest.pageSize,
            pageSizes: [...GRID_PAGE_SIZES],
            totalItems: 0,
          } satisfies GridPagination,
        };
  const loaderError = groupsRes.error ?? branchesRes.error ?? elementsRes.error;

  return {
    groups,
    branches,
    elements: elementsRes.data ?? [],
    elementsPagination: elementsRes.pagination,
    selectedGroupId,
    selectedCommitHash,
    loaderError: loaderError ? normalizeError(loaderError) : undefined,
  };
}

export const clientLoader =
  createSlickgridClientLoader<Route.ClientLoaderArgs>();

function createElementColumns(): Column<VectorElement>[] {
  return [
    {
      id: "id",
      name: "ID",
      field: "id",
      type: "string",
      filterable: true,
      sortable: true,
    },
    {
      id: "entity_id",
      name: "Entity",
      field: "entity_id",
      type: "string",
      filterable: true,
      sortable: true,
      formatter: (_row, _cell, value) => formatUnknown(value),
    },
    {
      id: "type",
      name: "Type",
      field: "type",
      type: "string",
      filterable: true,
      sortable: true,
    },
    {
      id: "gt_class_id",
      name: "Class",
      field: "gt_class_id",
      type: "integer",
      filterable: true,
      sortable: true,
      formatter: (_row, _cell, value) => formatUnknown(value),
    },
    {
      id: "last_edit_at",
      name: "Last Edited",
      field: "last_edit_at",
      type: "string",
      filterable: true,
      sortable: true,
      formatter: (_row, _cell, value) => formatUnknown(value),
    },
  ];
}

function formatDetailValue(value: unknown): string {
  return formatUnknown(value);
}

function formatJsonField(value: unknown): string {
  if (value == null || value === "") return "";

  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return formatUnknown(value);
  }
}

function DetailField({
  label,
  value,
  md = 4,
  xs,
}: {
  label: string;
  value: unknown;
  md?: number;
  xs?: number;
}) {
  return (
    <Col xs={xs} md={md}>
      <Form.Group className="mb-3">
        <Form.Label>{label}</Form.Label>
        <Form.Control value={formatDetailValue(value)} disabled readOnly />
      </Form.Group>
    </Col>
  );
}

function DetailTextArea({ label, value }: { label: string; value: unknown }) {
  return (
    <Form.Group className="mb-3">
      <Form.Label>{label}</Form.Label>
      <Form.Control
        as="textarea"
        rows={8}
        value={formatJsonField(value)}
        disabled
        readOnly
      />
    </Form.Group>
  );
}

function VectorElementDetails({ data }: { data: VectorElementDetail }) {
  return (
    <>
      <Row>
        <DetailField label="ID" value={data.id} md={6} />
        <DetailField label="Entity" value={data.entity_id} md={6} />
      </Row>
      <Row>
        <DetailField label="Group ID" value={data.group_id} xs={4} md={3} />
        <DetailField
          label="Commit Hash"
          value={data.commit_hash}
          xs={8}
          md={9}
        />
      </Row>
      <Row>
        <DetailField label="Last Edited" value={data.last_edit_at} md={3} />
        <DetailField label="Timestamp" value={data.timestamp} md={6} />
        <DetailField label="Type" value={data.type} md={3} />
        <DetailField label="Class" value={data.gt_class_id} md={3} />
      </Row>

      <Row>
        <DetailField
          label="Min X"
          value={"min_x" in data ? data.min_x : undefined}
        />
        <DetailField
          label="Min Y"
          value={"min_y" in data ? data.min_y : undefined}
        />
        <DetailField
          label="Min Z"
          value={"min_z" in data ? data.min_z : undefined}
        />
        <DetailField
          label="Max X"
          value={"max_x" in data ? data.max_x : undefined}
        />
        <DetailField
          label="Max Y"
          value={"max_y" in data ? data.max_y : undefined}
        />
        <DetailField
          label="Max Z"
          value={"max_z" in data ? data.max_z : undefined}
        />
        <DetailField
          label="Min Timestamp"
          value={"min_timestamp" in data ? data.min_timestamp : undefined}
          md={6}
        />
        <DetailField
          label="Max Timestamp"
          value={"max_timestamp" in data ? data.max_timestamp : undefined}
          md={6}
        />
      </Row>

      <DetailTextArea
        label="Vertices"
        value={"vertices" in data ? data.vertices : undefined}
      />
    </>
  );
}

function ElementsGrid({
  SG,
  elements,
  pagination,
  onViewDetails,
}: {
  SG: SlickgridModule;
  elements: VectorElement[];
  pagination: GridPagination;
  onViewDetails: (element: VectorElement) => void;
}) {
  const { SlickgridReact } = SG;
  const containerId = "vector-elements-grid-container";
  const reactGridRef = useRef<SlickgridReactInstance | null>(null);
  const paginationGridOptions = useRoutePaginationGridOptions(
    pagination,
    elements,
  );

  useEffect(() => {
    syncRoutePaginationGrid(reactGridRef.current, pagination);
  }, [elements, pagination]);

  function defineGrid(): {
    columns: Column<VectorElement>[];
    options: GridOption;
  } {
    const commandItems: MenuCommandItem[] = [
      {
        command: "view",
        title: "View Details",
        iconCssClass: "fas fa-info-circle fa-fw",
        action: (_event, args) => onViewDetails(args.dataContext),
      },
    ];

    return {
      columns: createElementColumns(),
      options: {
        ...createLabelDataGridOptions(containerId),
        ...(selectableConfig({
          commandItems: commandItems as never,
          multiSelect: false,
        }) as unknown as GridOption),
        showCustomFooter: false,
        ...paginationGridOptions,
      },
    };
  }

  const grid = defineGrid();

  return (
    <div className="slickgrid-container" id={containerId}>
      <SlickgridReact
        gridId="vector-elements-grid"
        columns={grid.columns}
        options={grid.options}
        dataset={elements}
        onReactGridCreated={(event) => {
          reactGridRef.current = event.detail;
        }}
      />
    </div>
  );
}

export function HydrateFallback() {
  return <div>Loading vector data...</div>;
}

export default function VectorData() {
  const {
    SG: rawSG,
    groups,
    branches,
    elements,
    elementsPagination,
    selectedGroupId,
    selectedCommitHash,
    loaderError,
  } = useLoaderData<typeof clientLoader>();
  const SG = asSlickgridModule(rawSG);
  const [filterValue, setFilterValue] = useState({
    groupValue: selectedGroupId == null ? "" : String(selectedGroupId),
    commitValue: selectedCommitHash,
  });
  const [detail, setDetail] = useState<VectorElementDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const detailRequest = useRef(0);
  const committedLabelDataLoaded =
    selectedGroupId != null && selectedCommitHash !== "";
  const labelDataLoaded =
    committedLabelDataLoaded &&
    filterValue.groupValue !== "" &&
    filterValue.commitValue !== "";

  useEffect(() => {
    setFilterValue({
      groupValue: selectedGroupId == null ? "" : String(selectedGroupId),
      commitValue: selectedCommitHash,
    });
  }, [selectedGroupId, selectedCommitHash]);

  async function viewElementDetails(element: VectorElement) {
    if (selectedGroupId == null || selectedCommitHash === "") return;

    setDetail(element);
    setDetailError(null);
    setDetailLoading(true);
    const request = ++detailRequest.current;
    const result = await readElementLabelDataVectorElementIdGet({
      path: { id: element.id },
      query: {
        group_id: selectedGroupId,
        commit_hash: selectedCommitHash,
      },
    });
    if (request !== detailRequest.current) return;
    setDetailLoading(false);
    if (result.error) {
      setDetailError(normalizeError(result.error));
      return;
    }
    setDetail(result.data ?? element);
  }

  function closeDetail() {
    detailRequest.current += 1;
    setDetailLoading(false);
    setDetail(null);
  }

  return createPageContent({
    title: "Vector Data",
    header: (
      <>
        <Breadcrumb className="mb-1">
          <Breadcrumb.Item href="/label/data">Data Storage</Breadcrumb.Item>
          <Breadcrumb.Item active>Vector Data</Breadcrumb.Item>
        </Breadcrumb>
        <h2 className="py-2">Vector Data</h2>
      </>
    ),
    main: (
      <>
        <LabelDataFilterForm
          controlIdPrefix="vector"
          groups={groups}
          branches={branches}
          selectedGroupId={selectedGroupId}
          selectedCommitHash={selectedCommitHash}
          onFilterValueChange={setFilterValue}
        />
        {labelDataLoaded && (
          <ElementsGrid
            SG={SG}
            elements={elements}
            pagination={elementsPagination}
            onViewDetails={(element) => {
              void viewElementDetails(element);
            }}
          />
        )}

        <Modal show={detail != null} onHide={closeDetail} size="xl">
          <Modal.Header closeButton>
            <Modal.Title>Vector Details</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {detailError && <Alert variant="danger">{detailError}</Alert>}
            {detailLoading && <div className="mb-3">Loading details...</div>}
            {detail && <VectorElementDetails data={detail} />}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={closeDetail}>
              Close
            </Button>
          </Modal.Footer>
        </Modal>
      </>
    ),
    alerts: { error: loaderError },
  });
}
