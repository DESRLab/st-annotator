import { BatchDialog } from "./BatchDialog";
import {
  GridSelectionButtons,
  SelectMultiplePicker,
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
import { Form as RouterForm, useLocation, useNavigation } from "react-router";
import type {
  Column,
  GridOption,
  MenuCommandItem,
  SlickgridReactInstance,
} from "slickgrid-react";

import {
  listSelectionsIdsLabelSpecRelationClassSelectionsIdsGet,
  bulkUpdateSelectionsLabelSpecRelationClassSelectionsBulkPatch,
  bulkDeleteSelectionsLabelSpecRelationClassSelectionsBulkDelete,
  createSelectionLabelSpecRelationClassSelectionsPost,
  deleteSelectionLabelSpecRelationClassSelectionsIdDelete,
  listGroupsLabelGroupsGet,
  listRelclassesLabelSpecRelationClassDefinitionsGet,
  listSelectionsLabelSpecRelationClassSelectionsGet,
  type LabelGroupPublic as LabelGroup,
  type RelationClassPublic as RelationClass,
  type RelationClassSelectionCreate,
  type RelationClassSelectionPublic as RelationClassSelection,
  type RelationClassSelectionUpdate,
  type UserRoles as User,
  updateSelectionLabelSpecRelationClassSelectionsIdPatch,
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

import type { Route } from "./+types/selections";

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

interface RelationClassSelectionFormState {
  name: string;
  description: string;
  group_ids: number[];
  relclass_ids: number[];
}

const EMPTY_FORM: RelationClassSelectionFormState = {
  name: "",
  description: "",
  group_ids: [],
  relclass_ids: [],
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
 * A label group holds at most one relation class selection (the generated link
 * table declares `group_id` unique), so the backend rejects the whole write with
 * a 409 and rolls the assignment back. Naming the owner here lets the form say
 * so at the picker instead of flashing a message at the top of a scrolled modal.
 */
export function describeGroupOwnerConflicts(
  groupIds: number[],
  selections: readonly RelationClassSelection[],
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

  return `Each label group can hold only one relation class selection. Unassign ${conflicts
    .map((conflict) => `${conflict.group} from ${conflict.owner}`)
    .join("; ")} first.`;
}

function formatGroups(groups: LabelGroup[]): string {
  if (groups.length === 0) {
    return "-";
  }

  return groups.map((group) => formatUnknown(group.name)).join(", ");
}

function formatRelationClasses(relclasses: RelationClass[]): string {
  if (relclasses.length === 0) {
    return "-";
  }

  return relclasses.map((relclass) => formatUnknown(relclass.name)).join(", ");
}

function relationClassSelectionToFormState(
  selection: RelationClassSelection,
): RelationClassSelectionFormState {
  return {
    name: formatUnknown(selection.name),
    description: selection.description ?? "",
    group_ids: selection.groups.map((group) => group.id),
    relclass_ids: selection.relclasses.map((relclass) => relclass.id),
  };
}

function createPayloadFromFormData(formData: FormData): {
  data?: RelationClassSelectionCreate;
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

  const relclassIds = parseIds(trimFormValue(formData, "relclass_ids"));
  if (!relclassIds) {
    return { error: "Relation class definitions are invalid." };
  }

  return {
    data: {
      name,
      description: trimFormValue(formData, "description"),
      group_ids: groupIds,
      relclass_ids: relclassIds,
    },
  };
}

function updatePayloadFromFormData(formData: FormData): {
  data?: RelationClassSelectionUpdate;
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

  const relclassIds = parseIds(trimFormValue(formData, "relclass_ids"));
  if (!relclassIds) {
    return { error: "Relation class definitions are invalid." };
  }

  return {
    data: {
      name,
      description: toOptionalUpdateValue(
        trimFormValue(formData, "description"),
      ),
      group_ids: groupIds,
      relclass_ids: relclassIds,
    },
  };
}

interface RelationClassSelectionFieldsProps {
  formData: RelationClassSelectionFormState;
  labelGroups: LabelGroup[];
  relationClasses: RelationClass[];
  readOnly: boolean;
  groupConflict: string | null;
  onChange: <
    K extends Exclude<
      keyof RelationClassSelectionFormState,
      "group_ids" | "relclass_ids"
    >,
  >(
    field: K,
    value: string,
  ) => void;
  onGroupsChange: (groupIds: number[]) => void;
  onRelationClassesChange: (relclassIds: number[]) => void;
}

function RelationClassSelectionFields({
  formData,
  labelGroups,
  relationClasses,
  readOnly,
  groupConflict,
  onChange,
  onGroupsChange,
  onRelationClassesChange,
}: RelationClassSelectionFieldsProps) {
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
        <Form.Label>Relation Class Definitions</Form.Label>
        <input
          type="hidden"
          name="relclass_ids"
          value={JSON.stringify(formData.relclass_ids)}
        />
        <SelectMultiplePicker
          items={relationClasses.map((relclass) => ({
            id: relclass.id,
            label: formatUnknown(relclass.name),
          }))}
          value={formData.relclass_ids}
          onChange={onRelationClassesChange}
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

  const [selectionsRes, labelGroupsRes, relationClassesRes] = await Promise.all(
    [
      listGridPage(request, (pagination) =>
        listSelectionsLabelSpecRelationClassSelectionsGet({
          auth: token.access_token,
          query: {
            ...buildSelectionsQuery(getGridStateRequest(request)),
            ...pagination,
          },
        }),
      ),
      listGroupsLabelGroupsGet({ auth: token.access_token }),
      listRelclassesLabelSpecRelationClassDefinitionsGet({
        auth: token.access_token,
      }),
    ],
  );

  const idsResponse =
    await listSelectionsIdsLabelSpecRelationClassSelectionsIdsGet({
      auth: token.access_token,
      query: buildSelectionsQuery(getGridStateRequest(request)),
    });
  const allSelectableIds = idsResponse.data ?? [];
  const dataset = selectionsRes.data ?? [];
  const labelGroups = (labelGroupsRes.data ?? [])
    .slice()
    .sort((left, right) =>
      formatUnknown(left.name).localeCompare(formatUnknown(right.name)),
    );
  const relationClasses = (relationClassesRes.data ?? [])
    .slice()
    .sort((left, right) =>
      formatUnknown(left.name).localeCompare(formatUnknown(right.name)),
    );
  const loaderError =
    idsResponse.error ??
    selectionsRes.error ??
    labelGroupsRes.error ??
    relationClassesRes.error;

  return {
    user,
    dataset,
    allSelectableIds,
    pagination: selectionsRes.pagination,
    labelGroups,
    relationClasses,
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
  if (actionType === "batch_delete" || actionType === "batch_update") {
    const ids = parseBatchIds(trimFormValue(formData, "ids"));
    if (ids == null) return { error: "Select at least two valid records." };
    const color = trimFormValue(formData, "color");
    if (color !== "" && !/^#[0-9a-fA-F]{6}$/.test(color))
      return { error: "Color must be a valid hex color." };
    const response =
      actionType === "batch_delete"
        ? await bulkDeleteSelectionsLabelSpecRelationClassSelectionsBulkDelete({
            auth: token.access_token,
            body: ids,
          })
        : await bulkUpdateSelectionsLabelSpecRelationClassSelectionsBulkPatch({
            auth: token.access_token,
            body: {
              ids,
              data: { description: trimFormValue(formData, "description") },
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
        error: payload.error ?? "Unable to create relation class selection.",
      };
    }

    const res = await createSelectionLabelSpecRelationClassSelectionsPost({
      auth: token.access_token,
      body: payload.data,
    });
    if (res.error) {
      return { error: normalizeError(res.error), resyncGroups: true };
    }

    return { success: "Relation class selection created successfully." };
  }

  if (actionType === "update") {
    const id = Number.parseInt(trimFormValue(formData, "id"), 10);
    if (Number.isNaN(id)) {
      return { error: "A valid relation class selection ID is required." };
    }

    const payload = updatePayloadFromFormData(formData);
    if (payload.error || !payload.data) {
      return {
        error: payload.error ?? "Unable to update relation class selection.",
      };
    }

    const res = await updateSelectionLabelSpecRelationClassSelectionsIdPatch({
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

    return { success: "Relation class selection updated successfully." };
  }

  if (actionType === "delete") {
    const id = Number.parseInt(trimFormValue(formData, "id"), 10);
    if (Number.isNaN(id)) {
      return { error: "A valid relation class selection ID is required." };
    }

    const res = await deleteSelectionLabelSpecRelationClassSelectionsIdDelete({
      auth: token.access_token,
      path: { id },
    });
    if (res.error) {
      return { error: normalizeError(res.error) };
    }

    return { success: "Relation class selection deleted successfully." };
  }

  return { error: "Unknown action." };
}

function RelationClassSelectionsTable({
  SG,
  user,
  dataset,
  allSelectableIds,
  pagination,
  labelGroups,
  relationClasses,
  actionData,
}: {
  SG: typeof import("slickgrid-react");
  user: User;
  dataset: RelationClassSelection[];
  allSelectableIds: number[];
  pagination: GridPagination;
  labelGroups: LabelGroup[];
  relationClasses: RelationClass[];
  actionData?: Route.ComponentProps["actionData"];
}) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [gridOptions, setGridOptions] = useState<GridOption | undefined>(
    undefined,
  );
  const [showModal, setShowModal] = useState(false);
  const [editingSelection, setEditingSelection] =
    useState<RelationClassSelection | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectionToDelete, setSelectionToDelete] =
    useState<RelationClassSelection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] =
    useState<RelationClassSelectionFormState>(EMPTY_FORM);
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
      setBatchIds(null);
      selectedAllIdsRef.current = null;
      setSelectedIds([]);
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

  function handleEdit(selection: RelationClassSelection) {
    setEditingSelection(selection);
    setFormData(relationClassSelectionToFormState(selection));
    setError(null);
    setShowModal(true);
  }

  function handleDelete(selection: RelationClassSelection) {
    setSelectionToDelete(selection);
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
        id: "relclasses",
        name: "Relation Classes",
        field: "relclasses",
        type: "string",
        filterable: false,
        sortable: false,
        formatter: (_row, _cell, _value, _columnDef, dataContext) =>
          formatRelationClasses(dataContext.relclasses),
      },
    ]);

    setGridOptions({
      ...(selectableConfig({
        commandItems: commandItems as never,
        multiSelect: true,
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
      keyof RelationClassSelectionFormState,
      "group_ids" | "relclass_ids"
    >,
  >(field: K, value: string) {
    setFormData((previous) => ({ ...previous, [field]: value }));
  }

  function updateGroups(groupIds: number[]) {
    setFormData((previous) => ({ ...previous, group_ids: groupIds }));
  }

  function updateRelationClasses(relclassIds: number[]) {
    setFormData((previous) => ({ ...previous, relclass_ids: relclassIds }));
  }

  useEffect(() => {
    defineGrid();
  }, [canManage, paginationGridOptions]);

  return (
    <>
      <div className="mb-3 text-muted">
        Select which relation classes you want to include for each label group.
      </div>

      <div className="mb-3 d-flex gap-2">
        <ButtonGroup className="justify-content-start me-auto">
          {canManage && (
            <Button variant="primary" onClick={handleCreate}>
              Create Relation Class Selection
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
        definitions={false}
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
            gridId="relation-class-selections-grid"
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
                ? "Edit Relation Class Selection"
                : "View Relation Class Selection"
              : "Create Relation Class Selection"}
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

            <RelationClassSelectionFields
              formData={formData}
              labelGroups={labelGroups}
              relationClasses={relationClasses}
              readOnly={!canManage}
              groupConflict={groupConflict}
              onChange={updateFormField}
              onGroupsChange={updateGroups}
              onRelationClassesChange={updateRelationClasses}
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
              Are you sure you want to delete relation class selection{" "}
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
  return <div>Loading relation class selections...</div>;
}

export default function RelationClassSelections({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const {
    SG,
    user,
    dataset,
    allSelectableIds,
    pagination,
    labelGroups,
    relationClasses,
    loaderError,
  } = loaderData;

  return createPageContent({
    title: "Relation Class Selections",
    header: (
      <>
        <Breadcrumb className="mb-1">
          <Breadcrumb.Item href="/label/specs">
            Label Specifications
          </Breadcrumb.Item>
          <Breadcrumb.Item active>Relation Class Selections</Breadcrumb.Item>
        </Breadcrumb>
        <h2 className="py-2">Relation Class Selections</h2>
      </>
    ),
    main: (
      <>
        <RelationClassSpecsNav />
        <RelationClassSelectionsTable
          SG={SG}
          user={user}
          dataset={dataset}
          allSelectableIds={allSelectableIds}
          pagination={pagination}
          labelGroups={labelGroups}
          relationClasses={relationClasses}
          actionData={actionData}
        />
      </>
    ),
    alerts: loaderError
      ? { error: loaderError }
      : { success: actionData?.success },
  });
}
