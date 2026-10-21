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
  GRID_FILTERS_PARAM,
  GRID_SORT_PARAM,
  syncRoutePaginationGrid,
  useRoutePaginationGridOptions,
} from "sta/app/components";
import {
  getGridPaginationRequest,
  GRID_PAGE_SIZES,
  listLabelDataPage,
  loadAuthenticatedSession,
  type LabelDataPagination,
} from "sta/app/loaders";
import {
  createLabelDataGridOptions,
  asSlickgridModule,
  formatBoolean,
  formatUnknown,
  formatClassName,
  getCommitOptions,
  LabelDataFilterForm,
  createLabelClassFilter,
  LabelDataPaginationControls,
  normalizeError,
  parseOptionalInteger,
  sortLabelGroups,
  type SlickgridModule,
} from "sta/app/plugins";
import { createPageContent } from "sta/app/templates";
import {
  listBranchesLabelRepoBranchesGet,
  listElementSummariesLabelDataBboxElementSummaryGet,
  listEntitiesLabelDataBboxEntityGet,
  listGroupsLabelGroupsGet,
  listObjclassesLabelSpecObjclassDefinitionsGet,
  readElementLabelDataBboxElementIdGet,
  readEntityLabelDataBboxEntityIdGet,
  type LabelBoxSummary,
  type LabelTrackPublic as BoundingBoxEntity,
  type ReadElementLabelDataBboxElementIdGetResponse,
} from "sta/client";

import type { Route } from "./+types/bbox";

type BoundingBoxElement = LabelBoxSummary;
type BoundingBoxElementDetail =
  LabelBoxSummary | ReadElementLabelDataBboxElementIdGetResponse;

type LabelDataTab = "elements" | "entities";

type LabelDataDetail =
  | { type: "Box"; data: BoundingBoxElementDetail }
  | { type: "Entity"; data: BoundingBoxEntity };

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
      hasNextPage: false,
    } satisfies LabelDataPagination,
  };

  const elementsRes =
    shouldLoadData && activeTab === "elements"
      ? await listLabelDataPage(request, (pagination) =>
          listElementSummariesLabelDataBboxElementSummaryGet({
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
      ? await listLabelDataPage(request, (pagination) =>
          listEntitiesLabelDataBboxEntityGet({
            auth: token.access_token,
            query: {
              group_id: selectedGroupId,
              commit_hash: selectedCommitHash,
              ...pagination,
            },
          }),
        )
      : emptyPage;
  const classesRes =
    selectedGroupId != null && selectedCommitHash !== ""
      ? await listObjclassesLabelSpecObjclassDefinitionsGet({
          auth: token.access_token,
        })
      : { data: [], error: undefined };
  const classNames: Record<number, string> = Object.fromEntries(
    (classesRes.data ?? []).map((item) => [item.id, item.name]),
  );
  const loaderError =
    groupsRes.error ??
    branchesRes.error ??
    elementsRes.error ??
    entitiesRes.error ??
    classesRes.error;

  return {
    activeTab,
    groups,
    branches,
    classNames,
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

function createElementColumns(
  SG: SlickgridModule,
  classNames: Record<number, string>,
): Column<BoundingBoxElement>[] {
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
      id: "perceived_class_id",
      name: "Class",
      field: "perceived_class_id",
      type: "integer",
      filterable: true,
      filter: createLabelClassFilter(SG, classNames),
      sortable: true,
      formatter: (_row, _cell, value) =>
        formatClassName(value as number | null, classNames),
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

function createEntityColumns(
  SG: SlickgridModule,
  classNames: Record<number, string>,
): Column<BoundingBoxEntity>[] {
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
      filter: createLabelClassFilter(SG, classNames),
      sortable: true,
      formatter: (_row, _cell, value) =>
        formatClassName(value as number | null, classNames),
    },
    {
      id: "is_black",
      name: "Low Reflectivity",
      field: "is_black",
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
        rows={6}
        value={formatJsonField(value)}
        disabled
        readOnly
      />
    </Form.Group>
  );
}

function BoundingBoxDetails({
  data,
  classNames,
}: {
  data: BoundingBoxElementDetail;
  classNames: Record<number, string>;
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
        <DetailField
          label="Timestamp"
          value={"timestamp" in data ? data.timestamp : undefined}
          md={6}
        />
      </Row>

      <Row>
        <DetailField label="Type" value={data.type} md={3} />
        <DetailField
          label="Center X"
          value={"center_x" in data ? data.center_x : undefined}
          md={3}
        />
        <DetailField
          label="Center Y"
          value={"center_y" in data ? data.center_y : undefined}
          md={3}
        />
        <DetailField
          label="Center Z"
          value={"center_z" in data ? data.center_z : undefined}
          md={3}
        />
        <DetailField
          label="Angle"
          value={"angle" in data ? data.angle : undefined}
          md={3}
        />
        <DetailField
          label="Size X"
          value={"size_x" in data ? data.size_x : undefined}
          md={3}
        />
        <DetailField
          label="Size Y"
          value={"size_y" in data ? data.size_y : undefined}
          md={3}
        />
        <DetailField
          label="Size Z"
          value={"size_z" in data ? data.size_z : undefined}
          md={3}
        />
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

      <Row>
        <DetailField
          label="Perceived Class"
          value={formatClassName(data.perceived_class_id, classNames)}
        />
        <DetailField label="Quality" value={data.quality_rank} />
        <DetailField label="Distinctive" value={data.distinctive_lv} />
        <DetailField label="Occlusion" value={data.occlusion_lv} />
      </Row>

      {"model_data" in data && data.model_data != null && (
        <DetailTextArea label="Model Data" value={data.model_data} />
      )}
    </>
  );
}

function BoundingBoxEntityDetails({
  data,
  classNames,
}: {
  data: BoundingBoxEntity;
  classNames: Record<number, string>;
}) {
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
        <DetailField
          label="Class"
          value={formatClassName(data.gt_class_id, classNames)}
          md={6}
        />
        <DetailField label="Low Reflectivity" value={data.is_black} md={6} />
      </Row>
    </>
  );
}

function ElementsGrid({
  SG,
  classNames,
  elements,
  pagination,
  onViewDetails,
}: {
  SG: SlickgridModule;
  classNames: Record<number, string>;
  elements: BoundingBoxElement[];
  pagination: LabelDataPagination;
  onViewDetails: (element: BoundingBoxElement) => void;
}) {
  const { SlickgridReact } = SG;
  const containerId = "bbox-elements-grid-container";
  const reactGridRef = useRef<SlickgridReactInstance | null>(null);
  const paginationGridOptions = useRoutePaginationGridOptions(
    pagination,
    elements,
  );

  useEffect(() => {
    syncRoutePaginationGrid(reactGridRef.current, pagination);
  }, [elements, pagination]);

  function defineGrid(): {
    columns: Column<BoundingBoxElement>[];
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
      columns: createElementColumns(SG, classNames),
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
        gridId="bbox-elements-grid"
        columns={grid.columns}
        options={grid.options}
        dataset={elements}
        onReactGridCreated={(event) => {
          reactGridRef.current = event.detail;
        }}
      />
      <LabelDataPaginationControls pagination={pagination} />
    </div>
  );
}

function EntitiesGrid({
  SG,
  classNames,
  entities,
  pagination,
  onViewDetails,
}: {
  SG: SlickgridModule;
  classNames: Record<number, string>;
  entities: BoundingBoxEntity[];
  pagination: LabelDataPagination;
  onViewDetails: (entity: BoundingBoxEntity) => void;
}) {
  const { SlickgridReact } = SG;
  const containerId = "bbox-entities-grid-container";
  const reactGridRef = useRef<SlickgridReactInstance | null>(null);
  const paginationGridOptions = useRoutePaginationGridOptions(
    pagination,
    entities,
  );

  useEffect(() => {
    syncRoutePaginationGrid(reactGridRef.current, pagination);
  }, [entities, pagination]);

  function defineGrid(): {
    columns: Column<BoundingBoxEntity>[];
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
      columns: createEntityColumns(SG, classNames),
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
        gridId="bbox-entities-grid"
        columns={grid.columns}
        options={grid.options}
        dataset={entities}
        onReactGridCreated={(event) => {
          reactGridRef.current = event.detail;
        }}
      />
      <LabelDataPaginationControls pagination={pagination} />
    </div>
  );
}

export function HydrateFallback() {
  return <div>Loading bounding box data...</div>;
}

export default function BoundingBoxData() {
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
    classNames,
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
    searchParams.delete(GRID_FILTERS_PARAM);
    searchParams.delete(GRID_SORT_PARAM);
    searchParams.delete("page");
    searchParams.delete("pageSize");
    return `${location.pathname}?${searchParams.toString()}`;
  }

  async function viewElementDetails(element: BoundingBoxElement) {
    if (selectedGroupId == null || selectedCommitHash === "") return;

    setDetail({ type: "Box", data: element });
    setDetailError(null);
    setDetailLoading(true);
    const request = ++detailRequest.current;
    const result = await readElementLabelDataBboxElementIdGet({
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
    setDetail({ type: "Box", data: result.data ?? element });
  }

  async function viewEntityDetails(entity: BoundingBoxEntity) {
    if (selectedGroupId == null || selectedCommitHash === "") return;

    setDetail({ type: "Entity", data: entity });
    setDetailError(null);
    setDetailLoading(true);
    const request = ++detailRequest.current;
    const result = await readEntityLabelDataBboxEntityIdGet({
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
    setDetail({ type: "Entity", data: result.data ?? entity });
  }

  function closeDetail() {
    detailRequest.current += 1;
    setDetailLoading(false);
    setDetail(null);
  }

  return createPageContent({
    title: "Bounding Box Data",
    header: (
      <>
        <Breadcrumb className="mb-1">
          <Breadcrumb.Item href="/label/data">Data Storage</Breadcrumb.Item>
          <Breadcrumb.Item active>Bounding Box Data</Breadcrumb.Item>
        </Breadcrumb>
        <h2 className="py-2">Bounding Box Data</h2>
      </>
    ),
    main: (
      <>
        <LabelDataFilterForm
          controlIdPrefix="bbox"
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
                  Boxes
                </Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="entities" href={getTabHref("entities")}>
                  Entities
                </Nav.Link>
              </Nav.Item>
            </Nav>
            {activeTab === "elements" ? (
              <ElementsGrid
                SG={SG}
                classNames={classNames}
                elements={elements}
                pagination={elementsPagination}
                onViewDetails={(element) => {
                  void viewElementDetails(element);
                }}
              />
            ) : (
              <EntitiesGrid
                SG={SG}
                classNames={classNames}
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
            {detail?.type === "Box" && (
              <BoundingBoxDetails data={detail.data} classNames={classNames} />
            )}
            {detail?.type === "Entity" && (
              <BoundingBoxEntityDetails
                data={detail.data}
                classNames={classNames}
              />
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
