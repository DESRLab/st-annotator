import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Breadcrumb,
  Button,
  Form,
  InputGroup,
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
  createObjclassLabelSpecObjclassDefinitionsPost,
  deleteObjclassLabelSpecObjclassDefinitionsIdDelete,
  listObjclassesLabelSpecObjclassDefinitionsGet,
  type ObjectClassCreate,
  type ObjectClassPublic as ObjectClass,
  type ObjectClassUpdate,
  type UserRoles as User,
  updateObjclassLabelSpecObjclassDefinitionsIdPatch,
} from "../../../../../client";
import { createSlickgridClientLoader } from "../../../../components/slickgrid/client";
import { selectableConfig } from "../../../../components/slickgrid/options";
import {
  syncRoutePaginationGrid,
  useRoutePaginationGridOptions,
} from "../../../../components/slickgrid/pagination";
import { normalizeError } from "../../../../errors";
import { trimFormValue } from "../../../../forms";
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
} from "../../../../loaders";
import { Name } from "../../../../models/types";
import { createPageContent } from "../../../../templates";

import type { Route } from "./+types/definitions";

function ObjectClassSpecsNav() {
  const location = useLocation();

  return (
    <Nav variant="tabs" className="mb-3">
      <Nav.Item>
        <Nav.Link
          href="/label/specs/objclass/selections"
          active={location.pathname === "/label/specs/objclass/selections"}
        >
          Selections
        </Nav.Link>
      </Nav.Item>
      <Nav.Item>
        <Nav.Link
          href="/label/specs/objclass/definitions"
          active={location.pathname === "/label/specs/objclass/definitions"}
        >
          Definitions
        </Nav.Link>
      </Nav.Item>
    </Nav>
  );
}

interface ObjectClassFormState {
  name: string;
  description: string;
  color: string;
  default_size_x: string;
  default_size_y: string;
  default_size_z: string;
}

const DEFAULT_COLOR = "#ffffff";

const EMPTY_FORM: ObjectClassFormState = {
  name: "",
  description: "",
  color: DEFAULT_COLOR,
  default_size_x: "",
  default_size_y: "",
  default_size_z: "",
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

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toOptionalCreateNumber(value: string): number | undefined {
  return parseOptionalNumber(value);
}

function toOptionalUpdateNumber(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  return parseOptionalNumber(trimmed);
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

  for (const field of [
    "default_size_x",
    "default_size_y",
    "default_size_z",
  ] as const) {
    const rawValue = trimFormValue(formData, field);
    if (rawValue !== "" && parseOptionalNumber(rawValue) == null) {
      return `${field.replaceAll("_", " ")} must be a number.`;
    }
  }

  return undefined;
}

function objectClassToFormState(
  objectClass: ObjectClass,
): ObjectClassFormState {
  return {
    name: formatUnknown(objectClass.name),
    description: objectClass.description ?? "",
    color: formatColorValue(objectClass.color_rgb) || DEFAULT_COLOR,
    default_size_x:
      objectClass.default_size_x == null
        ? ""
        : String(objectClass.default_size_x),
    default_size_y:
      objectClass.default_size_y == null
        ? ""
        : String(objectClass.default_size_y),
    default_size_z:
      objectClass.default_size_z == null
        ? ""
        : String(objectClass.default_size_z),
  };
}

function createPayloadFromFormData(formData: FormData): {
  data?: ObjectClassCreate;
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
      default_size_x: toOptionalCreateNumber(
        trimFormValue(formData, "default_size_x"),
      ),
      default_size_y: toOptionalCreateNumber(
        trimFormValue(formData, "default_size_y"),
      ),
      default_size_z: toOptionalCreateNumber(
        trimFormValue(formData, "default_size_z"),
      ),
    },
  };
}

function updatePayloadFromFormData(formData: FormData): {
  data?: ObjectClassUpdate;
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
      default_size_x: toOptionalUpdateNumber(
        trimFormValue(formData, "default_size_x"),
      ),
      default_size_y: toOptionalUpdateNumber(
        trimFormValue(formData, "default_size_y"),
      ),
      default_size_z: toOptionalUpdateNumber(
        trimFormValue(formData, "default_size_z"),
      ),
    },
  };
}

const OBJCLASS_SORTABLE_COLUMNS = new Set(["id", "name"]);

export function buildObjclassesQuery({
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

  applySortersToQuery(query, sorters, OBJCLASS_SORTABLE_COLUMNS);
  query.sort_by ??= "name";
  query.sort_dir ??= "asc";

  return query;
}

export async function loader({ request }: Route.LoaderArgs) {
  const authenticated = await loadAuthenticatedSession(request);
  if (authenticated instanceof Response) return authenticated;
  const { token, user } = authenticated;

  const objectClassesRes = await listGridPage(request, (pagination) =>
    listObjclassesLabelSpecObjclassDefinitionsGet({
      auth: token.access_token,
      query: {
        ...buildObjclassesQuery(getGridStateRequest(request)),
        ...pagination,
      },
    }),
  );
  const dataset = objectClassesRes.data ?? [];

  return {
    user,
    dataset,
    pagination: objectClassesRes.pagination,
    loaderError: objectClassesRes.error
      ? normalizeError(objectClassesRes.error)
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

  if (actionType === "create") {
    const payload = createPayloadFromFormData(formData);
    if (payload.error || !payload.data) {
      return {
        error: payload.error ?? "Unable to create object class definition.",
      };
    }

    const res = await createObjclassLabelSpecObjclassDefinitionsPost({
      auth: token.access_token,
      body: payload.data,
    });
    if (res.error) {
      return { error: normalizeError(res.error) };
    }

    return { success: "Object class definition created successfully." };
  }

  if (actionType === "update") {
    const id = Number.parseInt(trimFormValue(formData, "id"), 10);
    if (Number.isNaN(id)) {
      return { error: "A valid object class definition ID is required." };
    }

    const payload = updatePayloadFromFormData(formData);
    if (payload.error || !payload.data) {
      return {
        error: payload.error ?? "Unable to update object class definition.",
      };
    }

    const res = await updateObjclassLabelSpecObjclassDefinitionsIdPatch({
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

    return { success: "Object class definition updated successfully." };
  }

  if (actionType === "delete") {
    const id = Number.parseInt(trimFormValue(formData, "id"), 10);
    if (Number.isNaN(id)) {
      return { error: "A valid object class definition ID is required." };
    }

    const res = await deleteObjclassLabelSpecObjclassDefinitionsIdDelete({
      auth: token.access_token,
      path: { id },
    });
    if (res.error) {
      return { error: normalizeError(res.error) };
    }

    return { success: "Object class definition deleted successfully." };
  }

  return { error: "Unknown action." };
}

function ObjectClassDefinitionsTable({
  SG,
  user,
  dataset,
  pagination,
  actionData,
}: {
  SG: typeof import("slickgrid-react");
  user: User;
  dataset: ObjectClass[];
  pagination: GridPagination;
  actionData?: Route.ComponentProps["actionData"];
}) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [gridOptions, setGridOptions] = useState<GridOption | undefined>(
    undefined,
  );
  const [showModal, setShowModal] = useState(false);
  const [editingObjectClass, setEditingObjectClass] =
    useState<ObjectClass | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [objectClassToDelete, setObjectClassToDelete] =
    useState<ObjectClass | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<ObjectClassFormState>(EMPTY_FORM);
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
      setShowModal(false);
      setShowDeleteModal(false);
      setEditingObjectClass(null);
      setObjectClassToDelete(null);
      setFormData(EMPTY_FORM);
    }
  }, [actionData]);

  function handleCreate() {
    setEditingObjectClass(null);
    setFormData(EMPTY_FORM);
    setError(null);
    setShowModal(true);
  }

  function handleEdit(objectClass: ObjectClass) {
    setEditingObjectClass(objectClass);
    setFormData(objectClassToFormState(objectClass));
    setError(null);
    setShowModal(true);
  }

  function handleDelete(objectClass: ObjectClass) {
    setObjectClassToDelete(objectClass);
    setError(null);
    setShowDeleteModal(true);
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
      },
    ];

    if (canManage) {
      commandItems.push({
        command: "delete",
        title: "Delete",
        iconCssClass: "fas fa-trash fa-fw",
        action: (_event, args) => handleDelete(args.dataContext),
      });
    }

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
      {
        id: "default_size_x",
        name: "X",
        field: "default_size_x",
        type: "string",
        filterable: false,
        sortable: false,
        columnGroup: "Default Size",
        formatter: (_row, _cell, value) => formatUnknown(value) || "-",
      },
      {
        id: "default_size_y",
        name: "Y",
        field: "default_size_y",
        type: "string",
        filterable: false,
        sortable: false,
        columnGroup: "Default Size",
        formatter: (_row, _cell, value) => formatUnknown(value) || "-",
      },
      {
        id: "default_size_z",
        name: "Z",
        field: "default_size_z",
        type: "string",
        filterable: false,
        sortable: false,
        columnGroup: "Default Size",
        formatter: (_row, _cell, value) => formatUnknown(value) || "-",
      },
    ]);

    setGridOptions({
      ...(selectableConfig({
        commandItems: commandItems as never,
        multiSelect: false,
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

  function updateFormField<K extends keyof ObjectClassFormState>(
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
        Set the details of each object class.
      </div>

      <div className="mb-3">
        {canManage && (
          <Button variant="primary" onClick={handleCreate}>
            Create Object Class Definition
          </Button>
        )}
      </div>

      <div className="slickgrid-container" id="grid-container">
        {gridOptions && (
          <SlickgridReact
            gridId="object-class-definitions-grid"
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
            {editingObjectClass
              ? canManage
                ? "Edit Object Class Definition"
                : "View Object Class Definition"
              : "Create Object Class Definition"}
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
              value={editingObjectClass ? "update" : "create"}
            />
            {editingObjectClass && (
              <>
                <input type="hidden" name="id" value={editingObjectClass.id} />
                <input
                  type="hidden"
                  name="issued_at"
                  value={editingObjectClass.last_edit_at ?? ""}
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

              <Form.Group className="mb-0">
                <Form.Label>Default Dimensions</Form.Label>
                <InputGroup>
                  <InputGroup.Text>X</InputGroup.Text>
                  <Form.Control
                    type="number"
                    step="any"
                    name="default_size_x"
                    value={formData.default_size_x}
                    onChange={(event) =>
                      updateFormField("default_size_x", event.target.value)
                    }
                  />
                  <InputGroup.Text>Y</InputGroup.Text>
                  <Form.Control
                    type="number"
                    step="any"
                    name="default_size_y"
                    value={formData.default_size_y}
                    onChange={(event) =>
                      updateFormField("default_size_y", event.target.value)
                    }
                  />
                  <InputGroup.Text>Z</InputGroup.Text>
                  <Form.Control
                    type="number"
                    step="any"
                    name="default_size_z"
                    value={formData.default_size_z}
                    onChange={(event) =>
                      updateFormField("default_size_z", event.target.value)
                    }
                  />
                </InputGroup>
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
              value={objectClassToDelete?.id ?? ""}
            />
            <p>
              Are you sure you want to delete object class definition{" "}
              <strong>
                {objectClassToDelete
                  ? formatUnknown(objectClassToDelete.name)
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
  return <div>Loading object class definitions...</div>;
}

export default function ObjectClassDefinitions({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { SG, user, dataset, pagination, loaderError } = loaderData;

  return createPageContent({
    title: "Object Class Definitions",
    header: (
      <>
        <Breadcrumb className="mb-1">
          <Breadcrumb.Item href="/label/specs">
            Label Specifications
          </Breadcrumb.Item>
          <Breadcrumb.Item active>Object Class Definitions</Breadcrumb.Item>
        </Breadcrumb>
        <h2 className="py-2">Object Class Definitions</h2>
      </>
    ),
    main: (
      <>
        <ObjectClassSpecsNav />
        <ObjectClassDefinitionsTable
          SG={SG}
          user={user}
          dataset={dataset}
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
