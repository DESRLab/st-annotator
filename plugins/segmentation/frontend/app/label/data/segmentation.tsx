import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Breadcrumb,
  Button,
  Col,
  Form,
  Modal,
  Nav,
  Row,
} from "react-bootstrap";
import { redirect, useLoaderData, useLocation } from "react-router";
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
  formatBoolean,
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
  listElementSummariesLabelDataSegmentationElementSummaryGet,
  listEntitiesLabelDataSegmentationEntityGet,
  listGroupsLabelGroupsGet,
  readElementLabelDataSegmentationElementIdGet,
  readEntityLabelDataSegmentationEntityIdGet,
  type LabelInstancePublic as SegmentationEntity,
  type LabelSelectionDataManagerPublic,
  type LabelSelectionSummary,
} from "sta/client";

import type { Route } from "./+types/segmentation";

type SegmentationElement = LabelSelectionSummary;
type SegmentationElementDetail =
  LabelSelectionSummary | LabelSelectionDataManagerPublic;

type LabelDataTab = "elements" | "entities";

type LabelDataDetail =
  | { type: "Selection"; data: SegmentationElementDetail }
  | { type: "Instance"; data: SegmentationEntity };

function parseActiveTab(value: string | null): LabelDataTab {
  return value === "entities" ? "entities" : "elements";
}

export async function loader({ request }: Route.LoaderArgs) {
  const authenticated = await loadAuthenticatedSession(request);
  if (authenticated instanceof Response) return authenticated;
  const { token } = authenticated;

  const url = new URL(request.url);
  const activeTab = parseActiveTab(url.searchParams.get("tab"));
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
  canonicalSearchParams.set("tab", activeTab);
  if (
    canonicalSearchParams.get("group_id") !==
      url.searchParams.get("group_id") ||
    canonicalSearchParams.get("commit_hash") !==
      url.searchParams.get("commit_hash") ||
    canonicalSearchParams.get("tab") !== url.searchParams.get("tab")
  ) {
    canonicalSearchParams.delete("page");
    canonicalSearchParams.delete("pageSize");
    return redirect(`${url.pathname}?${canonicalSearchParams.toString()}`);
  }

  const shouldLoadData = selectedGroupId != null && selectedCommitHash !== "";
  const emptyPageRequest = getGridPaginationRequest(request);
  const emptyPage = {
    data: [],
    error: undefined,
    pagination: {
      pageNumber: emptyPageRequest.pageNumber,
      pageSize: emptyPageRequest.pageSize,
      pageSizes: [...GRID_PAGE_SIZES],
      totalItems: 0,
    } satisfies GridPagination,
  };

  const elementsRes =
    shouldLoadData && activeTab === "elements"
      ? await listGridPage(request, (pagination) =>
          listElementSummariesLabelDataSegmentationElementSummaryGet({
            auth: token.access_token,
            query: {
              group_id: selectedGroupId,
              commit_hash: selectedCommitHash,
              ...pagination,
            },
          }),
        )
      : emptyPage;
  const entitiesRes =
    shouldLoadData && activeTab === "entities"
      ? await listGridPage(request, (pagination) =>
          listEntitiesLabelDataSegmentationEntityGet({
            auth: token.access_token,
            query: {
              group_id: selectedGroupId,
              commit_hash: selectedCommitHash,
              ...pagination,
            },
          }),
        )
      : emptyPage;
  const loaderError =
    groupsRes.error ??
    branchesRes.error ??
    elementsRes.error ??
    entitiesRes.error;

  return {
    activeTab,
    groups,
    branches,
    elements: elementsRes.data ?? [],
    entities: entitiesRes.data ?? [],
    elementsPagination: elementsRes.pagination,
    entitiesPagination: entitiesRes.pagination,
    selectedGroupId,
    selectedCommitHash,
    loaderError: loaderError ? normalizeError(loaderError) : undefined,
  };
}

export const clientLoader =
  createSlickgridClientLoader<Route.ClientLoaderArgs>();

function createElementColumns(): Column<SegmentationElement>[] {
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
      id: "quality_rank",
      name: "Quality",
      field: "quality_rank",
      type: "integer",
      filterable: true,
      sortable: true,
      formatter: (_row, _cell, value) => formatUnknown(value),
    },
    {
      id: "distinctive_lv",
      name: "Distinctive",
      field: "distinctive_lv",
      type: "string",
      filterable: true,
      sortable: true,
      formatter: (_row, _cell, value) => formatUnknown(value),
    },
    {
      id: "occlusion_lv",
      name: "Occlusion",
      field: "occlusion_lv",
      type: "string",
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

function createEntityColumns(): Column<SegmentationEntity>[] {
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
      id: "gt_class_id",
      name: "Class",
      field: "gt_class_id",
      type: "integer",
      filterable: true,
      sortable: true,
      formatter: (_row, _cell, value) => formatUnknown(value),
    },
    {
      id: "is_black",
      name: "Low Reflectivity",
      field: "is_black",
      type: "boolean",
      filterable: true,
      sortable: true,
      formatter: (_row, _cell, value) => formatBoolean(value),
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
  if (typeof value === "boolean") return formatBoolean(value);
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

function SegmentationSelectionDetails({
  data,
}: {
  data: SegmentationElementDetail;
}) {
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
        <DetailField label="Last Edited" value={data.last_edit_at} md={6} />
        <DetailField label="Timestamp" value={data.timestamp} md={6} />
      </Row>

      <Row>
        <DetailField label="Min X" value={data.min_x} />
        <DetailField label="Min Y" value={data.min_y} />
        <DetailField label="Min Z" value={data.min_z} />
        <DetailField label="Max X" value={data.max_x} />
        <DetailField label="Max Y" value={data.max_y} />
        <DetailField label="Max Z" value={data.max_z} />
        <DetailField label="Min Timestamp" value={data.min_timestamp} md={6} />
        <DetailField label="Max Timestamp" value={data.max_timestamp} md={6} />
      </Row>

      <Row>
        <DetailField label="Perceived Class" value={data.perceived_class_id} />
        <DetailField label="Quality" value={data.quality_rank} />
        <DetailField label="Distinctive" value={data.distinctive_lv} />
        <DetailField label="Occlusion" value={data.occlusion_lv} />
      </Row>

      <DetailTextArea
        label="Points"
        value={"points" in data ? data.points : undefined}
      />
    </>
  );
}

function SegmentationInstanceDetails({ data }: { data: SegmentationEntity }) {
  return (
    <>
      <Row>
        <DetailField label="ID" value={data.id} md={6} />
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
        <DetailField label="Last Edited" value={data.last_edit_at} md={6} />
        <DetailField label="Class" value={data.gt_class_id} md={6} />
        <DetailField label="Low Reflectivity" value={data.is_black} md={6} />
      </Row>
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
  elements: SegmentationElement[];
  pagination: GridPagination;
  onViewDetails: (element: SegmentationElement) => void;
}) {
  const { SlickgridReact } = SG;
  const containerId = "segmentation-elements-grid-container";
  const reactGridRef = useRef<SlickgridReactInstance | null>(null);
  const paginationGridOptions = useRoutePaginationGridOptions(
    pagination,
    elements,
  );

  useEffect(() => {
    syncRoutePaginationGrid(reactGridRef.current, pagination);
  }, [elements, pagination]);

  function defineGrid(): {
    columns: Column<SegmentationElement>[];
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
        gridId="segmentation-elements-grid"
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

function EntitiesGrid({
  SG,
  entities,
  pagination,
  onViewDetails,
}: {
  SG: SlickgridModule;
  entities: SegmentationEntity[];
  pagination: GridPagination;
  onViewDetails: (entity: SegmentationEntity) => void;
}) {
  const { SlickgridReact } = SG;
  const containerId = "segmentation-entities-grid-container";
  const reactGridRef = useRef<SlickgridReactInstance | null>(null);
  const paginationGridOptions = useRoutePaginationGridOptions(
    pagination,
    entities,
  );

  useEffect(() => {
    syncRoutePaginationGrid(reactGridRef.current, pagination);
  }, [entities, pagination]);

  function defineGrid(): {
    columns: Column<SegmentationEntity>[];
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
      columns: createEntityColumns(),
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
        gridId="segmentation-entities-grid"
        columns={grid.columns}
        options={grid.options}
        dataset={entities}
        onReactGridCreated={(event) => {
          reactGridRef.current = event.detail;
        }}
      />
    </div>
  );
}

export function HydrateFallback() {
  return <div>Loading segmentation data...</div>;
}

export default function SegmentationData() {
  const {
    SG: rawSG,
    activeTab,
    groups,
    branches,
    elements,
    entities,
    elementsPagination,
    entitiesPagination,
    selectedGroupId,
    selectedCommitHash,
    loaderError,
  } = useLoaderData<typeof clientLoader>();
  const SG = asSlickgridModule(rawSG);
  const [filterValue, setFilterValue] = useState({
    groupValue: selectedGroupId == null ? "" : String(selectedGroupId),
    commitValue: selectedCommitHash,
  });
  const [detail, setDetail] = useState<LabelDataDetail | null>(null);
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
  const location = useLocation();

  function getTabHref(tab: LabelDataTab) {
    const searchParams = new URLSearchParams(location.search);
    searchParams.set("tab", tab);
    searchParams.delete("page");
    searchParams.delete("pageSize");
    return `${location.pathname}?${searchParams.toString()}`;
  }

  async function viewElementDetails(element: SegmentationElement) {
    if (selectedGroupId == null || selectedCommitHash === "") return;

    setDetail({ type: "Selection", data: element });
    setDetailError(null);
    setDetailLoading(true);
    const request = ++detailRequest.current;
    const result = await readElementLabelDataSegmentationElementIdGet({
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
    setDetail({ type: "Selection", data: result.data ?? element });
  }

  async function viewEntityDetails(entity: SegmentationEntity) {
    if (selectedGroupId == null || selectedCommitHash === "") return;

    setDetail({ type: "Instance", data: entity });
    setDetailError(null);
    setDetailLoading(true);
    const request = ++detailRequest.current;
    const result = await readEntityLabelDataSegmentationEntityIdGet({
      path: { id: entity.id },
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
    setDetail({ type: "Instance", data: result.data ?? entity });
  }

  function closeDetail() {
    detailRequest.current += 1;
    setDetailLoading(false);
    setDetail(null);
  }

  return createPageContent({
    title: "Segmentation Data",
    header: (
      <>
        <Breadcrumb className="mb-1">
          <Breadcrumb.Item href="/label/data">Data Storage</Breadcrumb.Item>
          <Breadcrumb.Item active>Segmentation Data</Breadcrumb.Item>
        </Breadcrumb>
        <h2 className="py-2">Segmentation Data</h2>
      </>
    ),
    main: (
      <>
        <LabelDataFilterForm
          controlIdPrefix="segmentation"
          groups={groups}
          branches={branches}
          selectedGroupId={selectedGroupId}
          selectedCommitHash={selectedCommitHash}
          onFilterValueChange={setFilterValue}
          hiddenFields={{ tab: activeTab }}
        />
        {labelDataLoaded && (
          <>
            <Nav variant="tabs" activeKey={activeTab} className="mb-3">
              <Nav.Item>
                <Nav.Link eventKey="elements" href={getTabHref("elements")}>
                  Selections
                </Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="entities" href={getTabHref("entities")}>
                  Instances
                </Nav.Link>
              </Nav.Item>
            </Nav>
            {activeTab === "elements" ? (
              <ElementsGrid
                SG={SG}
                elements={elements}
                pagination={elementsPagination}
                onViewDetails={(element) => {
                  void viewElementDetails(element);
                }}
              />
            ) : (
              <EntitiesGrid
                SG={SG}
                entities={entities}
                pagination={entitiesPagination}
                onViewDetails={(entity) => {
                  void viewEntityDetails(entity);
                }}
              />
            )}
          </>
        )}

        <Modal show={detail != null} onHide={closeDetail} size="xl">
          <Modal.Header closeButton>
            <Modal.Title>
              {detail ? `${detail.type} Details` : "Details"}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {detailError && <Alert variant="danger">{detailError}</Alert>}
            {detailLoading && <div className="mb-3">Loading details...</div>}
            {detail?.type === "Selection" && (
              <SegmentationSelectionDetails data={detail.data} />
            )}
            {detail?.type === "Instance" && (
              <SegmentationInstanceDetails data={detail.data} />
            )}
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
