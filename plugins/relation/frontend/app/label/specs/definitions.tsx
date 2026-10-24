import { BatchDialog } from "./BatchDialog";
import {
  GridSelectionButtons,
  createSlickgridClientLoader,
  selectableConfig,
  syncRoutePaginationGrid,
  useRoutePaginationGridOptions,
} from "sta/app/components";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Breadcrumb,
  Button,
  ButtonGroup,
  Form,
  Modal,
  Nav,
} from "react-bootstrap";
import { Form as RouterForm, useLocation } from "react-router";
import type {
  Column,
  GridOption,
  MenuCommandItem,
  SlickgridReactInstance,
} from "slickgrid-react";

import {
  listDefinitionsIdsLabelSpecRelationClassDefinitionsIdsGet,
  bulkUpdateRelclassesLabelSpecRelationClassDefinitionsBulkPatch,
  bulkDeleteDefinitionsLabelSpecRelationClassDefinitionsBulkDelete,
  createRelclassLabelSpecRelationClassDefinitionsPost,
  deleteRelclassLabelSpecRelationClassDefinitionsIdDelete,
  listRelclassesLabelSpecRelationClassDefinitionsGet,
  type RelationClassCreate,
  type RelationClassPublic as RelationClass,
  type RelationClassUpdate,
  type UserRoles as User,
  updateRelclassLabelSpecRelationClassDefinitionsIdPatch,
} from "sta/client";
import { normalizeError } from "sta/app/plugins";
import { trimFormValue, parseBatchIds } from "./forms";
import {
  applyNumericFilterToQuery,
  applySortersToQuery,
  applyTextFilterToQuery,
  getGridStateRequest,
  listGridPage,
  loadAccessTokenSession,
  loadAuthenticatedSession,
  type GridPagination,
  type GridQuery,
  type GridStateRequest,
} from "sta/app/loaders";
import { Name } from "sta/app/models";
import { createPageContent } from "sta/app/templates";

import type { Route } from "./+types/definitions";

function RelationClassSpecsNav() {
  const location = useLocation();

  return (
    <Nav variant="tabs" className="mb-3">
      <Nav.Item>
        <Nav.Link
          href="/label/specs/relation-class/selections"
          active={
            location.pathname === "/label/specs/relation-class/selections"
          }
        >
          Selections
        </Nav.Link>
      </Nav.Item>
      <Nav.Item>
        <Nav.Link
          href="/label/specs/relation-class/definitions"
          active={
            location.pathname === "/label/specs/relation-class/definitions"
          }
        >
          Definitions
        </Nav.Link>
      </Nav.Item>
    </Nav>
  );
}

interface RelationClassFormState {
  name: string;
  description: string;
  color: string;
}

const DEFAULT_COLOR = "#ffffff";

const EMPTY_FORM: RelationClassFormState = {
  name: "",
  description: "",
  color: DEFAULT_COLOR,
};

function formatUnknown(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  if (typeof value === "symbol" || typeof value === "function") {
    return value.toString();
  }
  return "";
}

function toOptionalUpdateValue(value: string): string | null {
  return value.trim() === "" ? null : value.trim();
}

function parseColorValue(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") {
    return undefined;
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return undefined;
  }

  return Number.parseInt(trimmed.slice(1), 16);
}

function formatColorValue(value: number | undefined): string {
  if (value == null) {
    return "";
  }
  return `#${value.toString(16).padStart(6, "0")}`;
}

function formatColorCell(value: number | undefined): string {
  const color = formatColorValue(value);
  if (color === "") {
    return "-";
  }

  return [
    '<span style="display:inline-flex;align-items:center;gap:0.5rem;">',
    `<span title="${color}" style="display:inline-block;width:0.875rem;height:0.875rem;border-radius:999px;border:1px solid rgba(0, 0, 0, 0.2);background:${color};flex:0 0 auto;"></span>`,
    `<span>${color}</span>`,
    "</span>",
  ].join("");
}

function validateFormData(formData: FormData): string | undefined {
  const name = trimFormValue(formData, "name");
  if (!Name.regex.test(name)) {
    return `Name: ${Name.helperText}`;
  }

  const color = trimFormValue(formData, "color");
  if (color !== "" && parseColorValue(color) == null) {
    return "Color must be a valid hex color.";
  }

  return undefined;
}

function relationClassToFormState(
  relationClass: RelationClass,
): RelationClassFormState {
  return {
    name: formatUnknown(relationClass.name),
    description: relationClass.description ?? "",
    color: formatColorValue(relationClass.color_rgb) || DEFAULT_COLOR,
  };
}

function createPayloadFromFormData(formData: FormData): {
  data?: RelationClassCreate;
  error?: string;
} {
  const error = validateFormData(formData);
  if (error) {
    return { error };
  }

  return {
    data: {
      name: trimFormValue(formData, "name"),
      description: trimFormValue(formData, "description"),
      color_rgb:
        parseColorValue(trimFormValue(formData, "color")) ??
        parseColorValue(DEFAULT_COLOR),
    },
  };
}

function updatePayloadFromFormData(formData: FormData): {
  data?: RelationClassUpdate;
  error?: string;
} {
  const error = validateFormData(formData);
  if (error) {
    return { error };
  }

  return {
    data: {
      name: trimFormValue(formData, "name"),
      description: toOptionalUpdateValue(
        trimFormValue(formData, "description"),
      ),
      color_rgb:
        parseColorValue(trimFormValue(formData, "color")) ??
        parseColorValue(DEFAULT_COLOR),
    },
  };
}

const RELCLASS_SORTABLE_COLUMNS = new Set(["id", "name"]);

export function buildRelclassesQuery({
  filters,
  sorters,
}: GridStateRequest): GridQuery {
  const query: GridQuery = {};

  for (const filter of filters) {
    switch (filter.columnId) {
      case "id":
        applyNumericFilterToQuery(query, filter, "id");
        break;
      case "name":
        applyTextFilterToQuery(query, filter, "name");
        break;
    }
  }

  applySortersToQuery(query, sorters, RELCLASS_SORTABLE_COLUMNS);
  query.sort_by ??= "name";
  query.sort_dir ??= "asc";

  return query;
}

export async function loader({ request }: Route.LoaderArgs) {
  const authenticated = await loadAuthenticatedSession(request);
  if (authenticated instanceof Response) return authenticated;
  const { token, user } = authenticated;

  const relationClassesRes = await listGridPage(request, (pagination) =>
    listRelclassesLabelSpecRelationClassDefinitionsGet({
      auth: token.access_token,
      query: {
        ...buildRelclassesQuery(getGridStateRequest(request)),
        ...pagination,
      },
    }),
  );
  const idsResponse =
    await listDefinitionsIdsLabelSpecRelationClassDefinitionsIdsGet({
      auth: token.access_token,
      query: buildRelclassesQuery(getGridStateRequest(request)),
    });
  const allSelectableIds = idsResponse.data ?? [];
  const dataset = relationClassesRes.data ?? [];

  return {
    user,
    dataset,
    allSelectableIds,
    pagination: relationClassesRes.pagination,
    loaderError:
      (relationClassesRes.error ?? idsResponse.error)
        ? normalizeError(relationClassesRes.error ?? idsResponse.error)
        : undefined,
  };
}

export const clientLoader =
  createSlickgridClientLoader<Route.ClientLoaderArgs>();

export async function action({ request }: Route.ActionArgs) {
  const authenticated = await loadAccessTokenSession(request);
  if (authenticated instanceof Response) return authenticated;
  const { token } = authenticated;

  const formData = await request.formData();
  const actionType = formData.get("_action");
  if (actionType === "batch_delete" || actionType === "batch_update") {
    const ids = parseBatchIds(trimFormValue(formData, "ids"));
    if (ids == null) return { error: "Select at least two valid records." };
    const color = trimFormValue(formData, "color");
    if (color !== "" && !/^#[0-9a-fA-F]{6}$/.test(color))
      return { error: "Color must be a valid hex color." };
    const response =
      actionType === "batch_delete"
        ? await bulkDeleteDefinitionsLabelSpecRelationClassDefinitionsBulkDelete(
            { auth: token.access_token, body: ids },
          )
        : await bulkUpdateRelclassesLabelSpecRelationClassDefinitionsBulkPatch({
            auth: token.access_token,
            body: {
              ids,
              data: {
                description: trimFormValue(formData, "description"),
                ...(color === ""
                  ? {}
                  : { color_rgb: Number.parseInt(color.slice(1), 16) }),
              },
            },
          });
    return response.error
      ? { error: normalizeError(response.error) }
      : {
          success:
            actionType === "batch_delete"
              ? "Selected records deleted."
              : "Selected records updated.",
        };
  }

  if (actionType === "create") {
    const payload = createPayloadFromFormData(formData);
    if (payload.error || !payload.data) {
      return {
        error: payload.error ?? "Unable to create relation class definition.",
      };
    }

    const res = await createRelclassLabelSpecRelationClassDefinitionsPost({
      auth: token.access_token,
      body: payload.data,
    });
    if (res.error) {
      return { error: normalizeError(res.error) };
    }

    return { success: "Relation class definition created successfully." };
  }

  if (actionType === "update") {
    const id = Number.parseInt(trimFormValue(formData, "id"), 10);
    if (Number.isNaN(id)) {
      return { error: "A valid relation class definition ID is required." };
    }

    const payload = updatePayloadFromFormData(formData);
    if (payload.error || !payload.data) {
      return {
        error: payload.error ?? "Unable to update relation class definition.",
      };
    }

    const res = await updateRelclassLabelSpecRelationClassDefinitionsIdPatch({
      auth: token.access_token,
      path: { id },
      body: {
        ...payload.data,
        issued_at: trimFormValue(formData, "issued_at"),
      },
    });
    if (res.error) {
      return { error: normalizeError(res.error) };
    }

    return { success: "Relation class definition updated successfully." };
  }

  if (actionType === "delete") {
    const id = Number.parseInt(trimFormValue(formData, "id"), 10);
    if (Number.isNaN(id)) {
      return { error: "A valid relation class definition ID is required." };
    }

    const res = await deleteRelclassLabelSpecRelationClassDefinitionsIdDelete({
      auth: token.access_token,
      path: { id },
    });
    if (res.error) {
      return { error: normalizeError(res.error) };
    }

    return { success: "Relation class definition deleted successfully." };
  }

  return { error: "Unknown action." };
}

function RelationClassDefinitionsTable({
  SG,
  user,
  dataset,
  allSelectableIds,
  pagination,
  actionData,
}: {
  SG: typeof import("slickgrid-react");
  user: User;
  dataset: RelationClass[];
  allSelectableIds: number[];
  pagination: GridPagination;
  actionData?: Route.ComponentProps["actionData"];
}) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [gridOptions, setGridOptions] = useState<GridOption | undefined>(
    undefined,
  );
  const [showModal, setShowModal] = useState(false);
  const [editingRelationClass, setEditingRelationClass] =
    useState<RelationClass | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [relationClassToDelete, setRelationClassToDelete] =
    useState<RelationClass | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<RelationClassFormState>(EMPTY_FORM);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const selectedAllIdsRef = useRef<number[] | null>(null);
  const [batchIds, setBatchIds] = useState<number[] | null>(null);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const reactGridRef = useRef<SlickgridReactInstance | null>(null);
  const paginationGridOptions = useRoutePaginationGridOptions(
    pagination,
    dataset,
  );

  const { SlickgridReact } = SG;
  const canManage = user.roles.includes("data-manager");

  useEffect(() => {
    syncRoutePaginationGrid(reactGridRef.current, pagination);
  }, [dataset, pagination]);

  useEffect(() => {
    if (!actionData) {
      return;
    }

    if (actionData.error) {
      setError(actionData.error);
      return;
    }

    if (actionData.success) {
      setError(null);
      setBatchIds(null);
      selectedAllIdsRef.current = null;
      setSelectedIds([]);
      setShowModal(false);
      setShowDeleteModal(false);
      setEditingRelationClass(null);
      setRelationClassToDelete(null);
      setFormData(EMPTY_FORM);
    }
  }, [actionData]);

  function handleCreate() {
    setEditingRelationClass(null);
    setFormData(EMPTY_FORM);
    setError(null);
    setShowModal(true);
  }

  function handleEdit(relationClass: RelationClass) {
    setEditingRelationClass(relationClass);
    setFormData(relationClassToFormState(relationClass));
    setError(null);
    setShowModal(true);
  }

  function handleDelete(relationClass: RelationClass) {
    setRelationClassToDelete(relationClass);
    setError(null);
    setShowDeleteModal(true);
  }

  function getSelectedIds(): number[] {
    return (
      selectedAllIdsRef.current ??
      reactGridRef.current?.dataView
        .getAllSelectedItems()
        ?.map((row) => row.id) ??
      []
    );
  }
  function selectIds(ids: number[], all: boolean): void {
    selectedAllIdsRef.current = all ? ids : null;
    setSelectedIds(ids);
    reactGridRef.current?.slickGrid.setSelectedRows(
      dataset.flatMap((row, index) => (ids.includes(row.id) ? [index] : [])),
    );
  }
  function openBatch(deleting: boolean): void {
    setBatchDeleting(deleting);
    setBatchIds(getSelectedIds());
    setError(null);
  }
  function defineGrid() {
    const commandItems: MenuCommandItem[] = [
      {
        command: "edit",
        title: canManage ? "Edit Details" : "View Details",
        iconCssClass: canManage
          ? "fas fa-edit fa-fw"
          : "fas fa-info-circle fa-fw",
        action: (_event, args) => handleEdit(args.dataContext),
        itemVisibilityOverride: () =>
          !canManage || getSelectedIds().length === 1,
      },
    ];

    if (canManage) {
      commandItems.push({
        command: "delete",
        title: "Delete",
        iconCssClass: "fas fa-trash fa-fw",
        action: (_event, args) => handleDelete(args.dataContext),
        itemVisibilityOverride: () => getSelectedIds().length === 1,
      });
    }

    if (canManage)
      commandItems.push(
        {
          command: "batch_edit",
          title: "Batch Edit Details",
          iconCssClass: "fas fa-layer-group fa-fw",
          action: () => openBatch(false),
          itemVisibilityOverride: () => getSelectedIds().length > 1,
        },
        {
          command: "batch_delete",
          title: "Batch Delete",
          iconCssClass: "fas fa-trash fa-fw",
          action: () => openBatch(true),
          itemVisibilityOverride: () => getSelectedIds().length > 1,
        },
      );
    setColumns([
      {
        id: "id",
        name: "ID",
        field: "id",
        type: "integer",
        filterable: true,
        sortable: true,
      },
      {
        id: "name",
        name: "Name",
        field: "name",
        type: "string",
        filterable: true,
        sortable: true,
        formatter: (_row, _cell, value) => formatUnknown(value),
      },
      {
        id: "color_rgb",
        name: "Color",
        field: "color_rgb",
        type: "string",
        filterable: false,
        sortable: false,
        formatter: (_row, _cell, value) =>
          formatColorCell(value as number | undefined),
      },
    ]);

    setGridOptions({
      ...(selectableConfig({
        commandItems: commandItems as never,
        multiSelect: true,
      }) as unknown as GridOption),
      ...paginationGridOptions,
      autoResize: { container: "#grid-container" },
      createPreHeaderPanel: true,
      enableAutoResize: true,
      showPreHeaderPanel: true,
    });
  }

  function reactGridReady(reactGrid: SlickgridReactInstance) {
    reactGridRef.current = reactGrid;
  }

  function updateFormField<K extends keyof RelationClassFormState>(
    field: K,
    value: string,
  ) {
    setFormData((previous) => ({ ...previous, [field]: value }));
  }

  useEffect(() => {
    defineGrid();
  }, [canManage, paginationGridOptions]);

  return (
    <>
      <div className="mb-3 text-muted">
        Set the details of each relation class.
      </div>

      <div className="mb-3 d-flex gap-2">
        <ButtonGroup className="justify-content-start me-auto">
          {canManage && (
            <Button variant="primary" onClick={handleCreate}>
              Create Relation Class Definition
            </Button>
          )}
        </ButtonGroup>
        <GridSelectionButtons
          selectedCount={selectedIds.length}
          currentPageCount={dataset.length}
          allSelectableCount={allSelectableIds.length}
          onSelectCurrentPage={() =>
            selectIds(
              dataset.map((row) => row.id),
              false,
            )
          }
          onSelectAll={() => selectIds(allSelectableIds, true)}
          onDeselectAll={() => selectIds([], false)}
        />
      </div>
      <BatchDialog
        ids={batchIds}
        deleting={batchDeleting}
        definitions={true}
        error={error ?? undefined}
        onClose={() => setBatchIds(null)}
      />
      <div className="slickgrid-container" id="grid-container">
        {gridOptions && (
          <SlickgridReact
            onSelectedRowsChanged={() => {
              const ids =
                reactGridRef.current?.dataView
                  .getAllSelectedItems()
                  ?.map((row) => row.id) ?? [];
              if (
                selectedAllIdsRef.current != null &&
                ids.length === dataset.length
              )
                setSelectedIds(selectedAllIdsRef.current);
              else {
                selectedAllIdsRef.current = null;
                setSelectedIds(ids);
              }
            }}
            gridId="relation-class-definitions-grid"
            columns={columns}
            options={gridOptions}
            dataset={dataset}
            onReactGridCreated={(event) => reactGridReady(event.detail)}
          />
        )}
      </div>

      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>
            {editingRelationClass
              ? canManage
                ? "Edit Relation Class Definition"
                : "View Relation Class Definition"
              : "Create Relation Class Definition"}
          </Modal.Title>
        </Modal.Header>
        <RouterForm method="post">
          <Modal.Body>
            {error && (
              <Alert
                variant="danger"
                onClose={() => setError(null)}
                dismissible
              >
                {error}
              </Alert>
            )}

            <input
              type="hidden"
              name="_action"
              value={editingRelationClass ? "update" : "create"}
            />
            {editingRelationClass && (
              <>
                <input
                  type="hidden"
                  name="id"
                  value={editingRelationClass.id}
                />
                <input
                  type="hidden"
                  name="issued_at"
                  value={editingRelationClass.last_edit_at ?? ""}
                />
              </>
            )}

            <fieldset disabled={!canManage}>
              <Form.Group className="mb-3">
                <Form.Label>
                  Name
                  <span className="text-danger ms-1">*</span>
                </Form.Label>
                <Form.Control
                  type="text"
                  name="name"
                  value={formData.name}
                  required={true}
                  title={Name.helperText}
                  onChange={(event) =>
                    updateFormField("name", event.target.value)
                  }
                />
                {canManage && (
                  <Form.Text className="text-muted">
                    {Name.helperText}
                  </Form.Text>
                )}
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Description</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={4}
                  name="description"
                  value={formData.description}
                  onChange={(event) =>
                    updateFormField("description", event.target.value)
                  }
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Color</Form.Label>
                <input type="hidden" name="color" value={formData.color} />
                <Form.Control
                  type="color"
                  value={formData.color}
                  onChange={(event) =>
                    updateFormField("color", event.target.value)
                  }
                />
                <Form.Text className="text-muted">
                  Current color: {formData.color}
                </Form.Text>
              </Form.Group>
            </fieldset>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              {canManage ? "Cancel" : "Close"}
            </Button>
            {canManage && (
              <Button variant="primary" type="submit">
                Save
              </Button>
            )}
          </Modal.Footer>
        </RouterForm>
      </Modal>

      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Confirm Delete</Modal.Title>
        </Modal.Header>
        <RouterForm method="post">
          <Modal.Body>
            {error && (
              <Alert
                variant="danger"
                onClose={() => setError(null)}
                dismissible
              >
                {error}
              </Alert>
            )}
            <input type="hidden" name="_action" value="delete" />
            <input
              type="hidden"
              name="id"
              value={relationClassToDelete?.id ?? ""}
            />
            <p>
              Are you sure you want to delete relation class definition{" "}
              <strong>
                {relationClassToDelete
                  ? formatUnknown(relationClassToDelete.name)
                  : ""}
              </strong>
              ?
            </p>
            <p className="text-muted small">This action cannot be undone.</p>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={() => setShowDeleteModal(false)}
            >
              Cancel
            </Button>
            <Button variant="danger" type="submit">
              Delete
            </Button>
          </Modal.Footer>
        </RouterForm>
      </Modal>
    </>
  );
}

export function HydrateFallback() {
  return <div>Loading relation class definitions...</div>;
}

export default function RelationClassDefinitions({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { SG, user, dataset, allSelectableIds, pagination, loaderError } =
    loaderData;

  return createPageContent({
    title: "Relation Class Definitions",
    header: (
      <>
        <Breadcrumb className="mb-1">
          <Breadcrumb.Item href="/label/specs">
            Label Specifications
          </Breadcrumb.Item>
          <Breadcrumb.Item active>Relation Class Definitions</Breadcrumb.Item>
        </Breadcrumb>
        <h2 className="py-2">Relation Class Definitions</h2>
      </>
    ),
    main: (
      <>
        <RelationClassSpecsNav />
        <RelationClassDefinitionsTable
          SG={SG}
          user={user}
          dataset={dataset}
          allSelectableIds={allSelectableIds}
          pagination={pagination}
          actionData={actionData}
        />
      </>
    ),
    alerts: loaderError
      ? { error: loaderError }
      : { success: actionData?.success },
  });
}
