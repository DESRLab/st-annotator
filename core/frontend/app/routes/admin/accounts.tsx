import _ from "lodash";
import { useId, useState, useEffect, useCallback, useRef } from "react";
import { Button, Modal, Form, Alert, ButtonGroup } from "react-bootstrap";
import { Form as RouterForm, useRevalidator } from "react-router";
import type {
  Column,
  GridOption,
  MenuCommandItem,
  SlickgridReactInstance,
} from "slickgrid-react";
import { z } from "zod";

import {
  type AccountPublic as Account,
  type UserPublic as User,
  type UserUpdate,
  bulkUpdateAccountsAccountsBulkPatch,
  listAccountsAccountsGet,
  updateAccountAccountsIdPatch,
  createUserUsersPost,
  deleteUserUsersIdDelete,
  listUserIdsUsersIdsGet,
  listUsersUsersGet,
  updateUserUsersIdPatch,
  bulkUpdateUsersUsersBulkPatch,
} from "../../../client";
import { BatchSection } from "../../components/BatchSection";
import {
  ConfigFieldPlaceholder,
  ConfigFieldTabs,
  type ConfigParse,
} from "../../components/ConfigFieldTabs";
import { GridSelectionButtons } from "../../components/GridSelectionButtons";
import { createSlickgridClientLoader } from "../../components/slickgrid/client";
import { selectableConfig } from "../../components/slickgrid/options";
import {
  syncRoutePaginationGrid,
  useRoutePaginationGridOptions,
} from "../../components/slickgrid/pagination";
import {
  formStringSchema,
  formatFormError,
  identifierArraySchema,
  identifierSchema,
  jsonFormValueSchema,
  jsonObjectSchema,
  submittedBooleanSchema,
} from "../../forms";
import { normalizeError } from "../../errors";
import {
  applyDateFilterToQuery,
  applyInFilterToQuery,
  applyNumericFilterToQuery,
  applySortersToQuery,
  applyTextFilterToQuery,
  getGridStateRequest,
  loadAuthorizedSession,
  listGridPage,
  type GridPagination,
  type GridQuery,
  type GridStateRequest,
} from "../../loaders";
import { ALL_ROLES, Password, Username } from "../../models/user";
import { createPageContent } from "../../templates";

import type { Route } from "./+types/accounts";

type UserAccount = User &
  Account & {
    user_last_edit_at: User["last_edit_at"];
    account_last_edit_at: Account["last_edit_at"];
  };

const DEFAULT_PREFERENCES = {};
const DEFAULT_PREFERENCES_STR = "{}";

type Preferences = Record<string, unknown>;

/**
 * The raw pane's reading of the preferences text, mirroring how the action
 * validates it: empty text means "no preferences", and only an object is one.
 */
export function parsePreferencesPane(text: string): ConfigParse<Preferences> {
  const trimmed = text.trim();
  if (trimmed === "") {
    return { ok: true, value: DEFAULT_PREFERENCES };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "Preferences must be valid JSON." };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "Preferences must be a JSON object." };
  }

  return { ok: true, value: parsed as Preferences };
}

export function formatPreferencesText(value: Preferences): string {
  return JSON.stringify(value, null, 2);
}

const rolesFormSchema = jsonFormValueSchema(z.array(z.enum(ALL_ROLES)));
const accountFormSchema = z.object({
  username: formStringSchema,
  password: formStringSchema,
  roles: rolesFormSchema,
});
const accountBatchFormSchema = z.object({
  selectedIds: identifierArraySchema,
  updateRoles: submittedBooleanSchema,
  updatePreferences: submittedBooleanSchema,
  roles: rolesFormSchema,
});

const ACCOUNT_SORTABLE_COLUMNS = new Set([
  "id",
  "username",
  "created_at",
  "current_login_at",
]);

export function buildAccountsQuery({
  filters,
  sorters,
}: GridStateRequest): GridQuery {
  const query: GridQuery = {};

  for (const filter of filters) {
    switch (filter.columnId) {
      case "id":
        applyNumericFilterToQuery(query, filter, "id");
        break;
      case "username":
        applyTextFilterToQuery(query, filter, "username");
        break;
      case "roles":
        applyInFilterToQuery(query, filter, "role");
        break;
      case "created_at":
        applyDateFilterToQuery(query, filter, "created_at");
        break;
      case "current_login_at":
        applyDateFilterToQuery(query, filter, "current_login_at");
        break;
    }
  }

  applySortersToQuery(query, sorters, ACCOUNT_SORTABLE_COLUMNS);

  return query;
}

export async function loader({ request }: Route.LoaderArgs) {
  const authorized = await loadAuthorizedSession(request, "admin");
  if (authorized instanceof Response) return authorized;
  const { token } = authorized;

  const accountsQuery = buildAccountsQuery(getGridStateRequest(request));
  const usersRes = await listGridPage(request, (pagination) =>
    listUsersUsersGet({
      auth: token.access_token,
      query: { ...accountsQuery, ...pagination },
    }),
  );
  const accountsRes = await listAccountsAccountsGet({
    auth: token.access_token,
  });
  const allUserIdsRes = await listUserIdsUsersIdsGet({
    auth: token.access_token,
    query: accountsQuery,
  });
  const allSelectableIds = allUserIdsRes.data ?? [];

  const usersById = new Map(usersRes.data?.map((u) => [u.id, u]));
  const accountsById = new Map(accountsRes.data?.map((u) => [u.id, u]));
  const dataset: UserAccount[] = Array.from(usersById, ([id, u]) => ({
    ...u,
    ...accountsById.get(id),
    user_last_edit_at: u.last_edit_at,
    account_last_edit_at: accountsById.get(id)?.last_edit_at,
  }));

  const loaderError =
    usersRes.error ?? accountsRes.error ?? allUserIdsRes.error;

  return {
    dataset,
    pagination: usersRes.pagination,
    allSelectableIds,
    loaderError,
  };
}

export const clientLoader =
  createSlickgridClientLoader<Route.ClientLoaderArgs>();

export async function action({ request }: Route.ActionArgs) {
  const authorized = await loadAuthorizedSession(request, "admin");
  if (authorized instanceof Response) return authorized;
  const { token } = authorized;

  if (request.method !== "POST") {
    return { error: "Invalid request method" };
  }

  const formData = await request.formData();
  const actionType = formData.get("_action");

  if (actionType === "create" || actionType === "update") {
    const parsedForm = accountFormSchema.safeParse({
      username: formData.get("username"),
      password: formData.get("password"),
      roles: formData.get("roles"),
    });
    if (!parsedForm.success)
      return {
        error: formatFormError(parsedForm.error, "account form data"),
      };
    const { username, password, roles } = parsedForm.data;

    // Validation
    if (!username) {
      return { error: "Username is required" };
    }
    if (!Username.regex.test(username)) {
      return { error: `Invalid username: ${Username.helperText}` };
    }

    if (actionType === "create" && !password) {
      return { error: "Password is required for new users" };
    }
    if (password && !Password.regex.test(password)) {
      return { error: `Invalid password: ${Password.helperText}` };
    }

    const preferencesValue = formData.get("preferences");
    const parsedPreferences = jsonObjectSchema.safeParse(
      preferencesValue === ""
        ? DEFAULT_PREFERENCES_STR
        : (preferencesValue ?? DEFAULT_PREFERENCES_STR),
    );
    if (!parsedPreferences.success)
      return {
        error: formatFormError(parsedPreferences.error, "preferences"),
      };
    const preferences = parsedPreferences.data;

    // Submit
    if (actionType === "update") {
      const parsedUserId = identifierSchema.safeParse(formData.get("id"));
      if (!parsedUserId.success)
        return {
          error: formatFormError(parsedUserId.error, "user id"),
        };
      const userId = parsedUserId.data;

      const updateData: UserUpdate = {
        issued_at: formData.get("user_issued_at") as string,
        username,
        roles,
      };
      if (password) {
        updateData.password = password;
      }

      // Update Account first: updating User mirrors the username into Account
      // and advances Account.last_edit_at as part of that same logical edit.
      // Reversing this order would make the account token stale immediately.
      const accountRes = await updateAccountAccountsIdPatch({
        auth: token.access_token,
        path: { id: userId },
        body: {
          issued_at: formData.get("account_issued_at") as string,
          preferences,
        },
      });
      if (accountRes.error) {
        return { error: normalizeError(accountRes.error) };
      }

      const res = await updateUserUsersIdPatch({
        auth: token.access_token,
        path: { id: userId },
        body: updateData,
      });
      if (res.error) {
        return {
          error: `Preferences were saved, but the user update failed: ${normalizeError(res.error)}`,
        };
      }

      return { success: "User updated successfully." };
    } else {
      // actionType == 'create'
      const res = await createUserUsersPost({
        auth: token.access_token,
        body: { username, password, roles },
      });
      if (res.error || !res.data) {
        return { error: normalizeError(res.error) };
      }

      const userId = res.data.id;

      const accountRes = await updateAccountAccountsIdPatch({
        auth: token.access_token,
        path: { id: userId },
        body: { preferences },
      });
      if (accountRes.error) {
        return {
          error: `The user was created, but preferences could not be saved: ${normalizeError(accountRes.error)}`,
        };
      }

      return { success: "User created successfully." };
    }
  } else if (actionType === "delete") {
    const parsedUserId = identifierSchema.safeParse(formData.get("id"));
    if (!parsedUserId.success)
      return { error: formatFormError(parsedUserId.error, "user id") };

    const res = await deleteUserUsersIdDelete({
      auth: token.access_token,
      path: { id: parsedUserId.data },
    });
    if (res.error) {
      return { error: normalizeError(res.error) };
    }

    return { success: "User deleted successfully." };
  } else if (actionType === "batch") {
    const parsedForm = accountBatchFormSchema.safeParse({
      selectedIds: formData.get("selectedIds"),
      updateRoles: formData.getAll("updateRoles"),
      updatePreferences: formData.getAll("updatePreferences"),
      roles: formData.get("roles"),
    });
    if (!parsedForm.success)
      return {
        error: formatFormError(parsedForm.error, "batch account form data"),
      };
    const {
      selectedIds,
      updateRoles: doUpdateRoles,
      updatePreferences: doUpdatePreferences,
      roles,
    } = parsedForm.data;

    if (!doUpdateRoles && !doUpdatePreferences) {
      return { error: "Select at least one attribute to update" };
    }

    let preferences = DEFAULT_PREFERENCES;
    if (doUpdatePreferences) {
      const preferencesValue = formData.get("preferences");
      const parsedPreferences = jsonObjectSchema.safeParse(
        preferencesValue === ""
          ? DEFAULT_PREFERENCES_STR
          : (preferencesValue ?? DEFAULT_PREFERENCES_STR),
      );
      if (!parsedPreferences.success)
        return {
          error: formatFormError(parsedPreferences.error, "preferences"),
        };
      preferences = parsedPreferences.data;
    }

    if (doUpdateRoles) {
      const res = await bulkUpdateUsersUsersBulkPatch({
        auth: token.access_token,
        body: { ids: selectedIds, data: { roles } },
      });
      if (res.error) {
        return { error: normalizeError(res.error) };
      }
    }

    if (doUpdatePreferences) {
      const res = await bulkUpdateAccountsAccountsBulkPatch({
        auth: token.access_token,
        body: { ids: selectedIds, data: { preferences } },
      });
      if (res.error) {
        return { error: normalizeError(res.error) };
      }
    }

    return { success: `Updated ${selectedIds.length} users.` };
  }

  return { error: "Unknown action" };
}

type AccountsActionData = Exclude<Awaited<ReturnType<typeof action>>, Response>;

function UserTable({
  SG,
  dataset,
  pagination,
  allSelectableIds,
  actionData,
}: {
  SG: typeof import("slickgrid-react");
  dataset: UserAccount[];
  pagination: GridPagination;
  allSelectableIds: number[];
  actionData?: AccountsActionData;
}) {
  const revalidator = useRevalidator();
  const idBase = useId().replace(/:/g, "");
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [formData, setFormData] = useState<{
    username: string;
    password: string;
    roles: string[];
  }>({
    username: "",
    password: "",
    roles: [],
  });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchFormData, setBatchFormData] = useState({
    roles: [] as string[],
    updateRoles: false,
    updatePreferences: false,
  });
  const [preferencesJson, setPreferencesJson] = useState(
    DEFAULT_PREFERENCES_STR,
  );
  const [batchPreferencesJson, setBatchPreferencesJson] = useState(
    DEFAULT_PREFERENCES_STR,
  );

  const [columns, setColumns] = useState<Column[]>([]);
  const [gridOptions, setGridOptions] = useState<GridOption | undefined>(
    undefined,
  );
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const reactGridRef = useRef<SlickgridReactInstance | null>(null);
  const selectedAllIdsRef = useRef<number[] | null>(null);
  const processedActionDataRef = useRef<AccountsActionData | undefined>(
    undefined,
  );
  const paginationGridOptions = useRoutePaginationGridOptions(
    pagination,
    dataset,
  );

  // Sync grid when dataset prop changes (after revalidation returns fresh data).
  // SlickgridReact's componentDidUpdate updates the DataView, but we force an
  // explicit invalidate+render to guarantee the rows are visually redrawn.
  useEffect(() => {
    const reactGrid = reactGridRef.current;
    if (!reactGrid) return;

    reactGrid.dataView.setItems(dataset);
    reactGrid.slickGrid.invalidate();
    reactGrid.slickGrid.render();
    syncRoutePaginationGrid(reactGrid, pagination);
    if (selectedAllIdsRef.current == null) {
      reactGrid.gridService.setSelectedRows([]);
      setSelectedIds([]);
      return;
    }

    selectedAllIdsRef.current = allSelectableIds;
    selectCurrentPageRows();
    setSelectedIds(allSelectableIds);
  }, [dataset, pagination, allSelectableIds]);

  // Handle action results
  useEffect(() => {
    if (actionData == null || processedActionDataRef.current === actionData)
      return;

    processedActionDataRef.current = actionData;
    if (actionData.error) {
      setError(normalizeError(actionData.error));
    } else if (actionData.success) {
      setShowModal(false);
      setShowDeleteModal(false);
      setShowBatchModal(false);
      void revalidator.revalidate();
    }
  }, [actionData, revalidator]);

  const handleCreate = () => {
    setEditingUser(null);
    setFormData({
      username: "",
      password: "",
      roles: [],
    });
    setPreferencesJson(DEFAULT_PREFERENCES_STR);
    setError(null);
    setShowModal(true);
  };

  const handleEdit = (user: UserAccount) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: "",
      roles: user.roles,
    });
    setPreferencesJson(
      formatPreferencesText((user.preferences ?? {}) as Preferences),
    );
    setError(null);
    setShowModal(true);
  };

  const handleDelete = (user: UserAccount) => {
    setUserToDelete(user);
    setError(null);
    setShowDeleteModal(true);
  };

  const handleRoleToggle = useCallback((role: string) => {
    setFormData((prev) => {
      const newRoles = prev.roles.includes(role)
        ? prev.roles.filter((r) => r !== role)
        : [...prev.roles, role];

      return { ...prev, roles: newRoles };
    });
  }, []);

  const handleBatchEdit = () => {
    setBatchFormData({
      roles: [],
      updateRoles: false,
      updatePreferences: false,
    });
    setBatchPreferencesJson(DEFAULT_PREFERENCES_STR);
    setError(null);
    setShowBatchModal(true);
  };

  const handleBatchRoleToggle = useCallback((role: string) => {
    setBatchFormData((prev) => ({
      ...prev,
      roles: prev.roles.includes(role)
        ? prev.roles.filter((r) => r !== role)
        : [...prev.roles, role],
    }));
  }, []);

  const { SlickgridReact, Formatters, Filters } = SG;

  function defineGrid() {
    // `roles` is an array, which slickgrid's `Column.field` leaf-path type
    // does not accept, so this display-only column is left unparameterized.
    const rolesColumn: Column = {
      id: "roles",
      name: "Roles",
      field: "roles",
      type: "string",
      formatter: Formatters.arrayToCsv,
      filterable: true,
      filter: {
        collection: [...ALL_ROLES],
        model: Filters.multipleSelect,
        operator: "IN_COLLECTION",
      },
      sortable: false,
    };

    const columns: Column<User>[] = [
      {
        id: "id",
        name: "ID",
        field: "id",
        type: "integer",
        filterable: true,
        sortable: true,
      },
      {
        id: "username",
        name: "Username",
        field: "username",
        type: "string",
        filterable: true,
        filter: {
          emptySearchTermReturnAllValues: true,
        },
        sortable: true,
      },
      rolesColumn,
      {
        id: "created_at",
        name: "Created At",
        field: "created_at",
        type: "dateTimeIso",
        filterable: true,
        filter: {
          model: Filters.dateRange,
          options: { maxDate: "today" },
        },
        sortable: true,
      },
      {
        id: "current_login_at",
        name: "Last Login At",
        field: "current_login_at",
        type: "dateTimeIso",
        filterable: true,
        filter: {
          model: Filters.dateRange,
          options: { maxDate: "today" },
        },
        sortable: true,
      },
    ];

    const commandItems: MenuCommandItem[] = [
      {
        command: "edit",
        title: "Edit Details",
        iconCssClass: "fas fa-edit fa-fw",
        action: (e, args) => handleEdit(args.dataContext),
        itemVisibilityOverride: () => getSelectedCount() === 1,
      },
      {
        command: "batch_edit",
        title: "Batch Edit Details",
        iconCssClass: "fas fa-layer-group fa-fw",
        action: (e, args) => handleBatchEdit(),
        itemVisibilityOverride: () => getSelectedCount() > 1,
      },
      {
        command: "delete",
        title: "Delete",
        iconCssClass: "fas fa-trash fa-fw",
        action: (e, args) => handleDelete(args.dataContext),
        itemVisibilityOverride: () => getSelectedCount() === 1,
      },
    ];

    setColumns(columns);
    setGridOptions({
      ...selectableConfig({ commandItems, multiSelect: true }),
      ...paginationGridOptions,
      autoResize: { container: "#grid-container" },
      enableAutoResize: true,
    });
  }

  function getAllSelectedItems() {
    const slickGrid = reactGridRef.current;
    return slickGrid?.dataView.getAllSelectedItems() ?? [];
  }

  function getSelectedCount(): number {
    return selectedAllIdsRef.current?.length ?? getAllSelectedItems().length;
  }

  function selectCurrentPageRows() {
    const slickGrid = reactGridRef.current;
    const numFiltered = slickGrid?.dataView.getFilteredItemCount() ?? 0;
    slickGrid?.gridService.setSelectedRows(_.range(numFiltered));
  }

  function onSelectCurrentPage() {
    selectedAllIdsRef.current = null;
    selectCurrentPageRows();
    setSelectedIds(dataset.map((item) => item.id));
  }

  function onSelectAll() {
    selectedAllIdsRef.current = allSelectableIds;
    selectCurrentPageRows();
    setSelectedIds(allSelectableIds);
  }

  function onDeselectAll() {
    selectedAllIdsRef.current = null;
    const slickGrid = reactGridRef.current;
    slickGrid?.gridService.setSelectedRows([]);
    setSelectedIds([]);
  }

  function reactGridReady(reactGrid: SlickgridReactInstance) {
    reactGridRef.current = reactGrid;
    reactGrid.dataView.setItems(dataset);
    reactGrid.slickGrid.invalidate();
    reactGrid.slickGrid.render();
    syncRoutePaginationGrid(reactGrid, pagination);
  }

  function onGridStateChanged() {
    const currentPageSelectedIds = getAllSelectedItems().map((item) => item.id);
    if (
      selectedAllIdsRef.current &&
      currentPageSelectedIds.length === dataset.length
    ) {
      setSelectedIds(selectedAllIdsRef.current);
      return;
    }

    selectedAllIdsRef.current = null;
    setSelectedIds(currentPageSelectedIds);
  }

  useEffect(() => {
    defineGrid();
  }, [paginationGridOptions]);

  return (
    <>
      <div className="mb-3 d-flex gap-2">
        <ButtonGroup className="justify-content-start me-auto">
          <Button variant="primary" onClick={handleCreate}>
            Create User
          </Button>
        </ButtonGroup>
        <GridSelectionButtons
          selectedCount={selectedIds.length}
          currentPageCount={dataset.length}
          allSelectableCount={allSelectableIds.length}
          onSelectCurrentPage={onSelectCurrentPage}
          onSelectAll={onSelectAll}
          onDeselectAll={onDeselectAll}
        />
      </div>

      <div className="slickgrid-container" id="grid-container">
        {gridOptions && (
          <SlickgridReact
            gridId="accounts-grid"
            columns={columns}
            options={gridOptions}
            dataset={dataset}
            onReactGridCreated={(e) => reactGridReady(e.detail)}
            onGridStateChanged={() => onGridStateChanged()}
          />
        )}
      </div>

      <Modal show={showModal} onHide={() => setShowModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>{editingUser ? "Edit User" : "Create User"}</Modal.Title>
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
              value={editingUser ? "update" : "create"}
            />
            {editingUser && (
              <>
                <input type="hidden" name="id" value={editingUser.id} />
                <input
                  type="hidden"
                  name="user_issued_at"
                  value={editingUser.user_last_edit_at ?? ""}
                />
                <input
                  type="hidden"
                  name="account_issued_at"
                  value={editingUser.account_last_edit_at ?? ""}
                />
                <input
                  type="hidden"
                  name="previousData"
                  value={JSON.stringify(editingUser)}
                />
              </>
            )}
            <input
              type="hidden"
              name="roles"
              value={JSON.stringify(formData.roles)}
            />

            <Form.Group className="mb-3">
              <Form.Label>
                Username
                <span className="text-danger ms-1">*</span>
              </Form.Label>
              <Form.Control
                type="text"
                name="username"
                value={formData.username}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    username: e.target.value,
                  })
                }
                required={true}
                title={Username.helperText}
              />
              <Form.Text className="text-muted">
                <Username.HelperText />
              </Form.Text>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>
                Password
                {!editingUser && <span className="text-danger ms-1">*</span>}
              </Form.Label>
              <Form.Control
                type="password"
                name="password"
                value={formData.password}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    password: e.target.value,
                  })
                }
                required={!editingUser}
                placeholder={
                  editingUser
                    ? "Leave blank to keep current password"
                    : "Enter password"
                }
                title={Password.helperText}
              />
              <Form.Text className="text-muted">
                <Password.HelperText />
              </Form.Text>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Roles</Form.Label>
              {ALL_ROLES.map((role) => (
                <Form.Check
                  key={role}
                  id={`${idBase}-role-${role}`}
                  type="checkbox"
                  label={role}
                  checked={formData.roles.includes(role)}
                  onChange={() => handleRoleToggle(role)}
                />
              ))}
            </Form.Group>

            <ConfigFieldTabs
              label="Preferences"
              name="preferences"
              text={preferencesJson}
              onTextChange={setPreferencesJson}
              parse={parsePreferencesPane}
              format={formatPreferencesText}
              emptyValue={DEFAULT_PREFERENCES}
              editor={ConfigFieldPlaceholder}
              helperText="Enter preferences as valid JSON. Leave empty for no preferences."
            />
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Save
            </Button>
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
            <input type="hidden" name="id" value={userToDelete?.id ?? ""} />

            <p>
              Are you sure you want to delete the user{" "}
              <strong>
                {typeof userToDelete?.username === "string"
                  ? userToDelete.username
                  : String(userToDelete?.username)}
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
              Delete User
            </Button>
          </Modal.Footer>
        </RouterForm>
      </Modal>

      <Modal
        show={showBatchModal}
        onHide={() => setShowBatchModal(false)}
        size="lg"
      >
        <Modal.Header closeButton>
          <Modal.Title>Batch Edit ({selectedIds.length} users)</Modal.Title>
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

            <input type="hidden" name="_action" value="batch" />
            <input
              type="hidden"
              name="selectedIds"
              value={JSON.stringify(Array.from(selectedIds))}
            />
            <input
              type="hidden"
              name="roles"
              value={JSON.stringify(batchFormData.roles)}
            />

            <BatchSection
              label="Update Roles"
              name="updateRoles"
              checked={batchFormData.updateRoles}
              onToggle={(checked) =>
                setBatchFormData((prev) => ({
                  ...prev,
                  updateRoles: checked,
                }))
              }
            >
              <Form.Group className="mb-0">
                <Form.Label>Roles</Form.Label>
                {ALL_ROLES.map((role) => (
                  <Form.Check
                    key={role}
                    id={`${idBase}-batch-role-${role}`}
                    type="checkbox"
                    label={role}
                    checked={batchFormData.roles.includes(role)}
                    onChange={() => handleBatchRoleToggle(role)}
                  />
                ))}
              </Form.Group>
            </BatchSection>

            <BatchSection
              label="Update Preferences"
              name="updatePreferences"
              checked={batchFormData.updatePreferences}
              onToggle={(checked) =>
                setBatchFormData((prev) => ({
                  ...prev,
                  updatePreferences: checked,
                }))
              }
            >
              <ConfigFieldTabs
                label="Preferences"
                name="preferences"
                rows={4}
                text={batchPreferencesJson}
                onTextChange={setBatchPreferencesJson}
                parse={parsePreferencesPane}
                format={formatPreferencesText}
                emptyValue={DEFAULT_PREFERENCES}
                editor={ConfigFieldPlaceholder}
                helperText="Enter preferences as valid JSON. This will be applied to all selected users."
              />
            </BatchSection>

            {!batchFormData.updateRoles && !batchFormData.updatePreferences && (
              <Alert variant="info">
                Select what you want to update by checking the boxes above.
              </Alert>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={() => setShowBatchModal(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={
                !batchFormData.updateRoles && !batchFormData.updatePreferences
              }
            >
              Apply to {selectedIds.length} Users
            </Button>
          </Modal.Footer>
        </RouterForm>
      </Modal>
    </>
  );
}

export function HydrateFallback() {
  return <div>Loading accounts...</div>;
}

export default function Accounts({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { SG, dataset, pagination, allSelectableIds, loaderError } = loaderData;

  return createPageContent({
    title: "Accounts",
    header: <h1 className="py-2">Accounts</h1>,
    main: (
      <UserTable
        SG={SG}
        dataset={dataset}
        pagination={pagination}
        allSelectableIds={allSelectableIds}
        actionData={actionData}
      />
    ),
    alerts: loaderError
      ? { error: loaderError }
      : { success: actionData?.success },
  });
}
