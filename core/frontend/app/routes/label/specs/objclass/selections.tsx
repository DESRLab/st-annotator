import { useEffect, useRef, useState } from "react";
import { Alert, Breadcrumb, Button, Form, Modal, Nav } from "react-bootstrap";
import { Form as RouterForm, useLocation, useNavigation } from "react-router";
import type {
  Column,
  GridOption,
  MenuCommandItem,
  SlickgridReactInstance,
} from "slickgrid-react";

import {
  createSelectionLabelSpecObjclassSelectionsPost,
  deleteSelectionLabelSpecObjclassSelectionsIdDelete,
  listGroupsLabelGroupsGet,
  listObjclassesLabelSpecObjclassDefinitionsGet,
  listSelectionsLabelSpecObjclassSelectionsGet,
  type LabelGroupPublic as LabelGroup,
  type ObjectClassPublic as ObjectClass,
  type ObjectClassSelectionCreate,
  type ObjectClassSelectionPublic as ObjectClassSelection,
  type ObjectClassSelectionUpdate,
  type UserRoles as User,
  updateSelectionLabelSpecObjclassSelectionsIdPatch,
} from "../../../../../client";
import { SelectMultiplePicker } from "../../../../components/SelectMultiplePicker";
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

import type { Route } from "./+types/selections";

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

interface ObjectClassSelectionFormState {
  name: string;
  description: string;
  group_ids: number[];
  objclass_ids: number[];
}

const EMPTY_FORM: ObjectClassSelectionFormState = {
  name: "",
  description: "",
  group_ids: [],
  objclass_ids: [],
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

function parseIds(value: string): number[] | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      !Array.isArray(parsed) ||
      !parsed.every((item) => typeof item === "number")
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Names the selected groups that a *different* selection already owns.
 *
 * A label group holds at most one object class selection (the generated link
 * table declares `group_id` unique), so the backend rejects the whole write with
 * a 409 and rolls the assignment back. Naming the owner here lets the form say
 * so at the picker instead of flashing a message at the top of a scrolled modal.
 */
export function describeGroupOwnerConflicts(
  groupIds: number[],
  selections: readonly ObjectClassSelection[],
  currentSelectionId: number | null,
): string | null {
  const selected = new Set(groupIds);
  const conflicts = selections
    .filter((selection) => selection.id !== currentSelectionId)
    .flatMap((selection) =>
      selection.groups
        .filter((group) => selected.has(group.id))
        .map((group) => ({
          group: formatUnknown(group.name),
          owner: formatUnknown(selection.name),
        })),
    );

  if (conflicts.length === 0) {
    return null;
  }

  return `Each label group can hold only one object class selection. Unassign ${conflicts
    .map((conflict) => `${conflict.group} from ${conflict.owner}`)
    .join("; ")} first.`;
}

function formatGroups(groups: LabelGroup[]): string {
  if (groups.length === 0) {
    return "-";
  }

  return groups.map((group) => formatUnknown(group.name)).join(", ");
}

function formatObjectClasses(objclasses: ObjectClass[]): string {
  if (objclasses.length === 0) {
    return "-";
  }

  return objclasses.map((objclass) => formatUnknown(objclass.name)).join(", ");
}

function objectClassSelectionToFormState(
  selection: ObjectClassSelection,
): ObjectClassSelectionFormState {
  return {
    name: formatUnknown(selection.name),
    description: selection.description ?? "",
    group_ids: selection.groups.map((group) => group.id),
    objclass_ids: selection.objclasses.map((objclass) => objclass.id),
  };
}

function createPayloadFromFormData(formData: FormData): {
  data?: ObjectClassSelectionCreate;
  error?: string;
} {
  const name = trimFormValue(formData, "name");
  if (!Name.regex.test(name)) {
    return { error: `Name: ${Name.helperText}` };
  }

  const groupIds = parseIds(trimFormValue(formData, "group_ids"));
  if (!groupIds) {
    return { error: "Label groups are invalid." };
  }

  const objclassIds = parseIds(trimFormValue(formData, "objclass_ids"));
  if (!objclassIds) {
    return { error: "Object class definitions are invalid." };
  }

  return {
    data: {
      name,
      description: trimFormValue(formData, "description"),
      group_ids: groupIds,
      objclass_ids: objclassIds,
    },
  };
}

function updatePayloadFromFormData(formData: FormData): {
  data?: ObjectClassSelectionUpdate;
  error?: string;
} {
  const name = trimFormValue(formData, "name");
  if (!Name.regex.test(name)) {
    return { error: `Name: ${Name.helperText}` };
  }

  const groupIds = parseIds(trimFormValue(formData, "group_ids"));
  if (!groupIds) {
    return { error: "Label groups are invalid." };
  }

  const objclassIds = parseIds(trimFormValue(formData, "objclass_ids"));
  if (!objclassIds) {
    return { error: "Object class definitions are invalid." };
  }

  return {
    data: {
      name,
      description: toOptionalUpdateValue(
        trimFormValue(formData, "description"),
      ),
      group_ids: groupIds,
      objclass_ids: objclassIds,
    },
  };
}

interface ObjectClassSelectionFieldsProps {
  formData: ObjectClassSelectionFormState;
  labelGroups: LabelGroup[];
  objectClasses: ObjectClass[];
  readOnly: boolean;
  groupConflict: string | null;
  onChange: <
    K extends Exclude<
      keyof ObjectClassSelectionFormState,
      "group_ids" | "objclass_ids"
    >,
  >(
    field: K,
    value: string,
  ) => void;
  onGroupsChange: (groupIds: number[]) => void;
  onObjectClassesChange: (objclassIds: number[]) => void;
}

function ObjectClassSelectionFields({
  formData,
  labelGroups,
  objectClasses,
  readOnly,
  groupConflict,
  onChange,
  onGroupsChange,
  onObjectClassesChange,
}: ObjectClassSelectionFieldsProps) {
  return (
    <>
      <Form.Group className="mb-3">
        <Form.Label>
          Name
          <span className="text-danger ms-1">*</span>
        </Form.Label>
        <Form.Control
          type="text"
          name="name"
          value={formData.name}
          readOnly={readOnly}
          required={true}
          title={Name.helperText}
          onChange={(event) => onChange("name", event.target.value)}
        />
        {!readOnly && (
          <Form.Text className="text-muted">{Name.helperText}</Form.Text>
        )}
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Label>Description</Form.Label>
        <Form.Control
          as="textarea"
          rows={3}
          name="description"
          value={formData.description}
          readOnly={readOnly}
          onChange={(event) => onChange("description", event.target.value)}
        />
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Label>Label Groups</Form.Label>
        <input
          type="hidden"
          name="group_ids"
          value={JSON.stringify(formData.group_ids)}
        />
        <SelectMultiplePicker
          items={labelGroups.map((group) => ({
            id: group.id,
            label: formatUnknown(group.name),
          }))}
          value={formData.group_ids}
          onChange={onGroupsChange}
          disabled={readOnly}
        />
        {!readOnly && groupConflict && (
          <div className="text-danger small">{groupConflict}</div>
        )}
        {!readOnly && (
          <Form.Text className="text-muted">
            A selection applies to every group it lists, and a group can only be
            listed by one selection at a time. Leave this empty to keep the
            selection unassigned.
          </Form.Text>
        )}
      </Form.Group>

      <Form.Group className="mb-0">
        <Form.Label>Object Class Definitions</Form.Label>
        <input
          type="hidden"
          name="objclass_ids"
          value={JSON.stringify(formData.objclass_ids)}
        />
        <SelectMultiplePicker
          items={objectClasses.map((objclass) => ({
            id: objclass.id,
            label: formatUnknown(objclass.name),
          }))}
          value={formData.objclass_ids}
          onChange={onObjectClassesChange}
          disabled={readOnly}
        />
      </Form.Group>
    </>
  );
}

const SELECTION_SORTABLE_COLUMNS = new Set(["id", "name", "description"]);

export function buildSelectionsQuery({
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
      case "description":
        applyTextFilterToQuery(query, filter, "description");
        break;
    }
  }

  applySortersToQuery(query, sorters, SELECTION_SORTABLE_COLUMNS);
  query.sort_by ??= "name";
  query.sort_dir ??= "asc";

  return query;
}

export async function loader({ request }: Route.LoaderArgs) {
  const authenticated = await loadAuthenticatedSession(request);
  if (authenticated instanceof Response) return authenticated;
  const { token, user } = authenticated;

  const [selectionsRes, labelGroupsRes, objectClassesRes] = await Promise.all([
    listGridPage(request, (pagination) =>
      listSelectionsLabelSpecObjclassSelectionsGet({
        auth: token.access_token,
        query: {
          ...buildSelectionsQuery(getGridStateRequest(request)),
          ...pagination,
        },
      }),
    ),
    listGroupsLabelGroupsGet({ auth: token.access_token }),
    listObjclassesLabelSpecObjclassDefinitionsGet({
      auth: token.access_token,
    }),
  ]);

  const dataset = selectionsRes.data ?? [];
  const labelGroups = (labelGroupsRes.data ?? [])
    .slice()
    .sort((left, right) =>
      formatUnknown(left.name).localeCompare(formatUnknown(right.name)),
    );
  const objectClasses = (objectClassesRes.data ?? [])
    .slice()
    .sort((left, right) =>
      formatUnknown(left.name).localeCompare(formatUnknown(right.name)),
    );
  const loaderError =
    selectionsRes.error ?? labelGroupsRes.error ?? objectClassesRes.error;

  return {
    user,
    dataset,
    pagination: selectionsRes.pagination,
    labelGroups,
    objectClasses,
    loaderError: loaderError ? normalizeError(loaderError) : undefined,
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
        error: payload.error ?? "Unable to create object class selection.",
      };
    }

    const res = await createSelectionLabelSpecObjclassSelectionsPost({
      auth: token.access_token,
      body: payload.data,
    });
    if (res.error) {
      return { error: normalizeError(res.error), resyncGroups: true };
    }

    return { success: "Object class selection created successfully." };
  }

  if (actionType === "update") {
    const id = Number.parseInt(trimFormValue(formData, "id"), 10);
    if (Number.isNaN(id)) {
      return { error: "A valid object class selection ID is required." };
    }

    const payload = updatePayloadFromFormData(formData);
    if (payload.error || !payload.data) {
      return {
        error: payload.error ?? "Unable to update object class selection.",
      };
    }

    const res = await updateSelectionLabelSpecObjclassSelectionsIdPatch({
      auth: token.access_token,
      path: { id },
      body: {
        ...payload.data,
        issued_at: trimFormValue(formData, "issued_at"),
      },
    });
    if (res.error) {
      return { error: normalizeError(res.error), resyncGroups: true };
    }

    return { success: "Object class selection updated successfully." };
  }

  if (actionType === "delete") {
    const id = Number.parseInt(trimFormValue(formData, "id"), 10);
    if (Number.isNaN(id)) {
      return { error: "A valid object class selection ID is required." };
    }

    const res = await deleteSelectionLabelSpecObjclassSelectionsIdDelete({
      auth: token.access_token,
      path: { id },
    });
    if (res.error) {
      return { error: normalizeError(res.error) };
    }

    return { success: "Object class selection deleted successfully." };
  }

  return { error: "Unknown action." };
}

function ObjectClassSelectionsTable({
  SG,
  user,
  dataset,
  pagination,
  labelGroups,
  objectClasses,
  actionData,
}: {
  SG: typeof import("slickgrid-react");
  user: User;
  dataset: ObjectClassSelection[];
  pagination: GridPagination;
  labelGroups: LabelGroup[];
  objectClasses: ObjectClass[];
  actionData?: Route.ComponentProps["actionData"];
}) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [gridOptions, setGridOptions] = useState<GridOption | undefined>(
    undefined,
  );
  const [showModal, setShowModal] = useState(false);
  const [editingSelection, setEditingSelection] =
    useState<ObjectClassSelection | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectionToDelete, setSelectionToDelete] =
    useState<ObjectClassSelection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] =
    useState<ObjectClassSelectionFormState>(EMPTY_FORM);
  const reactGridRef = useRef<SlickgridReactInstance | null>(null);
  const paginationGridOptions = useRoutePaginationGridOptions(
    pagination,
    dataset,
  );

  const { SlickgridReact } = SG;
  const canManage = user.roles.includes("data-manager");
  const navigation = useNavigation();
  const isBusy = navigation.state !== "idle";

  const groupConflict = describeGroupOwnerConflicts(
    formData.group_ids,
    dataset,
    editingSelection?.id ?? null,
  );

  useEffect(() => {
    syncRoutePaginationGrid(reactGridRef.current, pagination);
  }, [dataset, pagination]);

  useEffect(() => {
    if (!actionData) {
      return;
    }

    if (actionData.error) {
      setError(actionData.error);
      // A rejected write changed nothing, so the picker must stop showing the
      // groups that were just refused. Client-side validation failures never
      // reach the backend and keep the draft as typed.
      if (actionData.resyncGroups) {
        setFormData((previous) => ({
          ...previous,
          group_ids: editingSelection
            ? editingSelection.groups.map((group) => group.id)
            : [],
        }));
      }
      return;
    }

    if (actionData.success) {
      setError(null);
      setShowModal(false);
      setShowDeleteModal(false);
      setEditingSelection(null);
      setSelectionToDelete(null);
      setFormData(EMPTY_FORM);
    }
    // Only the arrival of a new action result may drive this state: re-running
    // on an open form would replay the previous submission.
  }, [actionData]);

  function handleCreate() {
    setEditingSelection(null);
    setFormData(EMPTY_FORM);
    setError(null);
    setShowModal(true);
  }

  function handleEdit(selection: ObjectClassSelection) {
    setEditingSelection(selection);
    setFormData(objectClassSelectionToFormState(selection));
    setError(null);
    setShowModal(true);
  }

  function handleDelete(selection: ObjectClassSelection) {
    setSelectionToDelete(selection);
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
        id: "description",
        name: "Description",
        field: "description",
        type: "string",
        filterable: true,
        sortable: true,
        formatter: (_row, _cell, value) => formatUnknown(value) || "-",
      },
      {
        id: "groups",
        name: "Label Groups",
        field: "groups",
        type: "string",
        filterable: false,
        sortable: false,
        formatter: (_row, _cell, _value, _columnDef, dataContext) =>
          formatGroups(dataContext.groups),
      },
      {
        id: "objclasses",
        name: "Object Classes",
        field: "objclasses",
        type: "string",
        filterable: false,
        sortable: false,
        formatter: (_row, _cell, _value, _columnDef, dataContext) =>
          formatObjectClasses(dataContext.objclasses),
      },
    ]);

    setGridOptions({
      ...(selectableConfig({
        commandItems: commandItems as never,
        multiSelect: false,
      }) as unknown as GridOption),
      ...paginationGridOptions,
      autoResize: { container: "#grid-container" },
      enableAutoResize: true,
    });
  }

  function reactGridReady(reactGrid: SlickgridReactInstance) {
    reactGridRef.current = reactGrid;
  }

  function updateFormField<
    K extends Exclude<
      keyof ObjectClassSelectionFormState,
      "group_ids" | "objclass_ids"
    >,
  >(field: K, value: string) {
    setFormData((previous) => ({ ...previous, [field]: value }));
  }

  function updateGroups(groupIds: number[]) {
    setFormData((previous) => ({ ...previous, group_ids: groupIds }));
  }

  function updateObjectClasses(objclassIds: number[]) {
    setFormData((previous) => ({ ...previous, objclass_ids: objclassIds }));
  }

  useEffect(() => {
    defineGrid();
  }, [canManage, paginationGridOptions]);

  return (
    <>
      <div className="mb-3 text-muted">
        Select which object classes you want to include for each label group.
      </div>

      <div className="mb-3">
        {canManage && (
          <Button variant="primary" onClick={handleCreate}>
            Create Object Class Selection
          </Button>
        )}
      </div>

      <div className="slickgrid-container" id="grid-container">
        {gridOptions && (
          <SlickgridReact
            gridId="object-class-selections-grid"
            columns={columns}
            options={gridOptions}
            dataset={dataset}
            onReactGridCreated={(event) => reactGridReady(event.detail)}
          />
        )}
      </div>

      <Modal show={showModal} onHide={() => setShowModal(false)} size="xl">
        <Modal.Header closeButton>
          <Modal.Title>
            {editingSelection
              ? canManage
                ? "Edit Object Class Selection"
                : "View Object Class Selection"
              : "Create Object Class Selection"}
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
              value={editingSelection ? "update" : "create"}
            />
            {editingSelection && (
              <>
                <input type="hidden" name="id" value={editingSelection.id} />
                <input
                  type="hidden"
                  name="issued_at"
                  value={editingSelection.last_edit_at ?? ""}
                />
              </>
            )}

            <ObjectClassSelectionFields
              formData={formData}
              labelGroups={labelGroups}
              objectClasses={objectClasses}
              readOnly={!canManage}
              groupConflict={groupConflict}
              onChange={updateFormField}
              onGroupsChange={updateGroups}
              onObjectClassesChange={updateObjectClasses}
            />
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              {canManage ? "Cancel" : "Close"}
            </Button>
            {canManage && (
              <Button
                variant="primary"
                type="submit"
                disabled={isBusy || groupConflict !== null}
              >
                {isBusy ? "Saving…" : "Save"}
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
              value={selectionToDelete?.id ?? ""}
            />
            <p>
              Are you sure you want to delete object class selection{" "}
              <strong>
                {selectionToDelete ? formatUnknown(selectionToDelete.name) : ""}
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
  return <div>Loading object class selections...</div>;
}

export default function ObjectClassSelections({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const {
    SG,
    user,
    dataset,
    pagination,
    labelGroups,
    objectClasses,
    loaderError,
  } = loaderData;

  return createPageContent({
    title: "Object Class Selections",
    header: (
      <>
        <Breadcrumb className="mb-1">
          <Breadcrumb.Item href="/label/specs">
            Label Specifications
          </Breadcrumb.Item>
          <Breadcrumb.Item active>Object Class Selections</Breadcrumb.Item>
        </Breadcrumb>
        <h2 className="py-2">Object Class Selections</h2>
      </>
    ),
    main: (
      <>
        <ObjectClassSpecsNav />
        <ObjectClassSelectionsTable
          SG={SG}
          user={user}
          dataset={dataset}
          pagination={pagination}
          labelGroups={labelGroups}
          objectClasses={objectClasses}
          actionData={actionData}
        />
      </>
    ),
    alerts: loaderError
      ? { error: loaderError }
      : { success: actionData?.success },
  });
}
