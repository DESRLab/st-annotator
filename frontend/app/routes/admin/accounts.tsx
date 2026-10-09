import _ from 'lodash';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Modal, Form, Alert, ButtonGroup } from 'react-bootstrap';
import { Form as RouterForm } from "react-router";
import type { Column, GridOption, MenuCommandItem, SlickgridReactInstance } from 'slickgrid-react';

import { BatchSection } from '../../components/BatchSection';
import { selectableConfig } from '../../components/slickgrid/options';
import {
  type AccountPublic as Account,
  type UserPublic as User,
  bulkUpdateAccountsAccountsBulkPatch,
  listAccountsAccountsGet,
  updateAccountAccountsIdPatch,
  createUserUsersPost,
  deleteUserUsersIdDelete,
  listUsersUsersGet,
  updateUserUsersIdPatch,
  bulkUpdateUsersUsersBulkPatch,
} from '../../../client';
import { clearUser, getCurrentSession, getUser, redirectAndCommit } from "../../loaders";
import { ALL_ROLES, Password, Username } from "../../models/user";
import { createPageContent } from "../../templates";

import type { Route } from "./+types/accounts";

type UserAccount = User & Account;

const DEFAULT_PREFERENCES = {};
const DEFAULT_PREFERENCES_STR = "{}";

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getCurrentSession(request);
  const token = session.get("token");
  if (!token) {
    clearUser(session);
    session.flash("error", "Your session has expired. Please log in again.");
    return redirectAndCommit("/login", session);
  }

  const user = getUser(session);
  if (!user) {
    session.flash("error", "Your session has expired. Please log in again.");
    return redirectAndCommit("/login", session);
  }

  if (!user.roles.includes("admin")) {
    session.flash("error", "You lack the 'admin' role to view this page.");
    return redirectAndCommit("/", session);
  }

  const usersRes = await listUsersUsersGet({ auth: token.access_token });
  const accountsRes = await listAccountsAccountsGet({ auth: token.access_token });

  const usersById = new Map(usersRes.data?.map(u => [u.id, u]));
  const accountsById = new Map(accountsRes.data?.map(u => [u.id, u]));
  const dataset: UserAccount[] = Array.from(
    usersById,
    ([id, u]) => ({ ...u, ...accountsById.get(id) }),
  );

  const loaderError = usersRes.error ?? accountsRes.error;

  return { dataset, loaderError };
}

export async function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
  const loaderData = await serverLoader();

  // SlickGrid needs to access the document at import time,
  // so it cannot be imported during SSR
  const SG = await import('slickgrid-react');

  return { ...loaderData, SG };
}

clientLoader.hydrate = true as const;

export async function action({ request }: Route.ActionArgs) {
  const session = await getCurrentSession(request);
  const token = session.get("token");
  if (!token) {
    clearUser(session);
    session.flash("error", "Your session has expired. Please log in again.");
    return redirectAndCommit("/login", session);
  }

  if (request.method !== 'POST') {
    return { error: 'Invalid request method' };
  }

  const formData = await request.formData();
  const actionType = formData.get('_action');

  if (actionType === 'create' || actionType === 'update') {
    const username = formData.get('username') as string;
    const password = formData.get('password') as string;
    const rolesStr = formData.get('roles') as string;
    const roles = JSON.parse(rolesStr) as string[];
    const preferencesStr = formData.get('preferences') as string;

    // Validation
    if (!username) {
      return { error: 'Username is required' };
    }
    if (!Username.regex.test(username)) {
      return { error: `Invalid username: ${Username.helperText}` };
    }

    if (actionType === 'create' && !password) {
      return { error: 'Password is required for new users' };
    }
    if (password && !Password.regex.test(password)) {
      return { error: `Invalid password: ${Password.helperText}` };
    }

    let preferences = DEFAULT_PREFERENCES;
    try {
      preferences = JSON.parse(preferencesStr || DEFAULT_PREFERENCES_STR);
    } catch (err) {
      return { error: `Invalid preferences: ${err}` };
    }

    // Submit
    if (actionType === 'update') {
      const userId = Number.parseInt(formData.get('id') as string, 10);

      const updateData: any = {
        username,
        roles,
      };
      if (password) {
        updateData.password = password;
      }

      const res = await updateUserUsersIdPatch({
        auth: token.access_token,
        path: { id: userId },
        body: updateData,
      })
      if (res.error) {
        return { error: res.error };
      }

      const accountRes = await updateAccountAccountsIdPatch({
        auth: token.access_token,
        path: { id: userId },
        body: { preferences },
      })
      if (accountRes.error) {
        return { error: accountRes.error };
      }

      return { success: 'User updated successfully.' };
    } else {  // actionType == 'create'
      const res = await createUserUsersPost({
        auth: token.access_token,
        body: { username, password, roles },
      });
      if (res.error || !res.data) {
        return { error: res.error };
      }
  
      const userId = res.data.id;

      const accountRes = await updateAccountAccountsIdPatch({
        auth: token.access_token,
        path: { id: userId },
        body: { preferences },
      })
      if (accountRes.error) {
        return { error: accountRes.error };
      }

      return { success: 'User created successfully.' };
    }
  } else if (actionType === 'delete') {
    const userId = formData.get('id') as string;

    const res = await deleteUserUsersIdDelete({
      auth: token.access_token,
      path: { id: Number.parseInt(userId, 10) },
    });
    if (res.error) {
      return { error: res.error };
    }

    return { success: 'User deleted successfully.' };
  } else if (actionType === 'batch') {
    const selectedIds = JSON.parse(formData.get('selectedIds') as string) as number[];
    const doUpdateRoles = formData.get('updateRoles') === 'true';
    const doUpdatePreferences = formData.get('updatePreferences') === 'true';
    const rolesStr = formData.get('roles') as string;
    const roles = JSON.parse(rolesStr) as string[];
    const preferencesStr = formData.get('preferences') as string;

    if (!doUpdateRoles && !doUpdatePreferences) {
      return { error: 'Select at least one attribute to update' };
    }

    let preferences = DEFAULT_PREFERENCES;
    if (doUpdatePreferences) {
      try {
        preferences = JSON.parse(preferencesStr || DEFAULT_PREFERENCES_STR);
      } catch (err) {
        return { error: `Invalid preferences: ${err}` };
      }
    }

    if (doUpdateRoles) {
      const res = await bulkUpdateUsersUsersBulkPatch({
        auth: token.access_token,
        body: { ids: selectedIds, data: { roles } },
      });
      if (res.error) {
        return { error: res.error };
      }
    }

    if (doUpdatePreferences) {
      const res = await bulkUpdateAccountsAccountsBulkPatch({
        auth: token.access_token,
        body: { ids: selectedIds, data: { preferences } },
      });
      if (res.error) {
        return { error: res.error };
      }
    }

    return { success: `Updated ${selectedIds.length} users.` };
  }

  return { error: 'Unknown action' };
}

function UserTable({ SG, dataset, actionData }: {
  SG: typeof import('slickgrid-react');
  dataset: UserAccount[];
  actionData?: Route.ComponentProps["actionData"],
}) {
  
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [formData, setFormData] = useState<{
    username: string;
    password: string;
    roles: string[];
    preferences: Record<string, unknown>;
  }>({
    username: '',
    password: '',
    roles: [],
    preferences: {},
  });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchFormData, setBatchFormData] = useState({
    roles: '[]',
    preferences: '',
    updateRoles: false,
    updatePreferences: false,
  });
  const [preferencesJson, setPreferencesJson] = useState(DEFAULT_PREFERENCES_STR);
  const [batchPreferencesJson, setBatchPreferencesJson] = useState(DEFAULT_PREFERENCES_STR);

  const [columns, setColumns] = useState<Column[]>([]);
  const [gridOptions, setGridOptions] = useState<GridOption | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const reactGridRef = useRef<SlickgridReactInstance | null>(null);

  // Sync grid when dataset prop changes (after revalidation returns fresh data).
  // SlickgridReact's componentDidUpdate updates the DataView, but we force an
  // explicit invalidate+render to guarantee the rows are visually redrawn.
  useEffect(() => {
    reactGridRef.current?.slickGrid.invalidate();
  }, [dataset]);

  // Handle action results
  useEffect(() => {
    if (actionData) {
      if (actionData.error) {
        setError(actionData.error);
      } else if (actionData.success) {
        setShowModal(false);
        setShowDeleteModal(false);
        setShowBatchModal(false);
      }
    }
  }, [actionData]);

  const handleCreate = () => {
    setEditingUser(null);
    setFormData({
      username: '',
      password: '',
      roles: [],
      preferences: DEFAULT_PREFERENCES,
    });
    setPreferencesJson(DEFAULT_PREFERENCES_STR);
    setError(null);
    setShowModal(true);
  };

  const handleEdit = (user: UserAccount) => {
    setEditingUser(user);
    setFormData({
      username: user.username as string,
      password: '',
      roles: user.roles,
      preferences: (user.preferences ?? {}) as Record<string, unknown>,
    });
    setPreferencesJson(JSON.stringify(user.preferences ?? {}));
    setError(null);
    setShowModal(true);
  };

  const handleDelete = (user: UserAccount) => {
    setUserToDelete(user);
    setShowDeleteModal(true);
  };

  const handleRoleToggle = useCallback((role: string) => {
    setFormData(prev => {
      const newRoles = prev.roles.includes(role)
        ? prev.roles.filter(r => r !== role)
        : [...prev.roles, role];

      return { ...prev, roles: newRoles };
    });
  }, []);

  const handleBatchEdit = () => {
    setBatchFormData({
      roles: '[]',
      preferences: DEFAULT_PREFERENCES_STR,
      updateRoles: false,
      updatePreferences: false,
    });
    setError(null);
    setShowBatchModal(true);
  };

  const handleBatchRoleToggle = useCallback((role: string) => {
    setBatchFormData(prev => {
      const prevRoles: string[] = JSON.parse(prev.roles);
      const newRoles = JSON.stringify(
        prevRoles.includes(role)
          ? prevRoles.filter(r => r !== role)
          : [...prevRoles, role]
      );

      return { ...prev, roles: newRoles };
    });
  }, []);

  const { SlickgridReact, Formatters, Filters } = SG;

  function defineGrid() {
    const columns: Column<User>[] = [
      {
        id: 'id',
        name: 'ID',
        field: 'id',
        type: "integer",
        filterable: true,
        sortable: true,
      },
      {
        id: 'username',
        name: 'Username',
        field: 'username',
        type: "string",
        filterable: true,
        sortable: true,
      },
      {
        id: 'roles',
        name: 'Roles',
        field: 'roles',
        type: "string",
        formatter: Formatters.arrayToCsv,
        filterable: true,
        filter: {
            collection: [...ALL_ROLES],
            model: Filters.multipleSelect,
            operator: 'IN_COLLECTION',
        },
        sortable: true,
      },
      {
        id: 'created_at',
        name: 'Created At',
        field: 'created_at',
        type: "dateTimeIso",
        filterable: true,
        filter: {
            model: Filters.dateRange,
            options: { maxDate: 'today' },
        },
        sortable: true,
      },
      {
        id: 'current_login_at',
        name: 'Last Login At',
        field: 'current_login_at',
        type: "dateTimeIso",
        filterable: true,
        filter: {
            model: Filters.dateRange,
            options: { maxDate: 'today' },
        },
        sortable: true,
      },
    ];

    const commandItems: MenuCommandItem[] = [
      {
        command: 'edit',
        title: 'Edit Details',
        iconCssClass: 'fas fa-edit fa-fw',
        action: (e, args) => handleEdit(args.dataContext),
        itemVisibilityOverride: () => getAllSelectedItems().length === 1,
      },
      {
        command: 'batch_edit',
        title: 'Batch Edit Details',
        iconCssClass: 'fas fa-edit fa-fw',
        action: (e, args) => handleBatchEdit(),
        itemVisibilityOverride: () => getAllSelectedItems().length > 1,
      },
      {
        command: 'delete',
        title: 'Delete',
        iconCssClass: 'fas fa-trash fa-fw',
        action: (e, args) => handleDelete(args.dataContext),
        itemVisibilityOverride: () => getAllSelectedItems().length === 1,
      },
    ];

    setColumns(columns);
    setGridOptions({
      ...selectableConfig({ commandItems, multiSelect: true }),
      autoResize: { container: "#grid-container" },
      enableAutoResize: true,
    });
  }

  function getAllSelectedItems() {
    const slickGrid = reactGridRef.current;
    return slickGrid?.dataView.getAllSelectedItems() ?? [];
  }

  function onSelectAll(e: React.MouseEvent) {
    const slickGrid = reactGridRef.current;
    const numFiltered = slickGrid?.dataView.getFilteredItemCount() ?? 0;
    slickGrid?.gridService.setSelectedRows(_.range(numFiltered));
  }

  function onDeselectAll(e: React.MouseEvent) {
    const slickGrid = reactGridRef.current;
    slickGrid?.gridService.setSelectedRows([]);
  }

  function reactGridReady(reactGrid: SlickgridReactInstance) {
    reactGridRef.current = reactGrid;
  }

  function onGridStateChanged() {
    const selectedIds = getAllSelectedItems().map(item => item.id);
    setSelectedIds(selectedIds);
  }

  useEffect(() => {
    defineGrid();
  }, []);

  return (
    <>
      <div className="mb-3 d-flex gap-2">
        <ButtonGroup className='justify-content-start me-auto'>
          <Button variant="primary" onClick={handleCreate}>Create User</Button>
        </ButtonGroup>
        <ButtonGroup className='justify-content-end'>
          {selectedIds.length === 0 && (
            <Button variant="outline-secondary" onClick={onSelectAll}>Select All</Button>
          )}
          {selectedIds.length > 0 && (
            <Button variant="secondary" onClick={onDeselectAll}>Deselect All</Button>
          )}
        </ButtonGroup>
      </div>

      <div className="slickgrid-container" id="grid-container">
        {gridOptions && <SlickgridReact
          gridId="accounts-grid"
          columns={columns}
          options={gridOptions}
          dataset={dataset}
          onReactGridCreated={(e) => reactGridReady(e.detail)}
          onGridStateChanged={() => onGridStateChanged()}
        />}
      </div>

      <Modal show={showModal} onHide={() => setShowModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>{editingUser ? 'Edit User' : 'Create User'}</Modal.Title>
        </Modal.Header>
        <RouterForm method="post">
          <Modal.Body>
            {error && <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>}
            
            <input type="hidden" name="_action" value={editingUser ? 'update' : 'create'} />
            {editingUser && (
              <>
                <input type="hidden" name="id" value={editingUser.id} />
                <input type="hidden" name="previousData" value={JSON.stringify(editingUser)} />
              </>
            )}
            <input type="hidden" name="roles" value={JSON.stringify(formData.roles)} />
            <input type="hidden" name="preferences" value={preferencesJson} />

            <Form.Group className="mb-3">
              <Form.Label>
                Username
                <span className="text-danger ms-1">*</span>
              </Form.Label>
              <Form.Control
                type="text"
                name="username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                required={true}
                title={Username.helperText}
              />
              <Form.Text className="text-muted" dangerouslySetInnerHTML={{ __html: Username.helperText }} />
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
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required={!editingUser}
                placeholder={editingUser ? 'Leave blank to keep current password' : 'Enter password'}
                title={Password.helperText}
              />
              <Form.Text className="text-muted" dangerouslySetInnerHTML={{ __html: Password.helperText }} />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Roles</Form.Label>
              {ALL_ROLES.map(role => (
                <Form.Check
                  key={role}
                  type="checkbox"
                  label={role}
                  checked={formData.roles.includes(role)}
                  onChange={() => handleRoleToggle(role)}
                />
              ))}
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Preferences (JSON)</Form.Label>
              <Form.Control
                as="textarea"
                rows={10}
                value={preferencesJson}
                onChange={(e) => setPreferencesJson(e.target.value)}
                placeholder='{"key": "value"}'
                className="font-monospace"
                style={{ fontSize: '12px' }}
              />
              <Form.Text className="text-muted">Enter preferences as valid JSON. Leave empty for no preferences.</Form.Text>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button variant="primary" type="submit">Save</Button>
          </Modal.Footer>
        </RouterForm>
      </Modal>

      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Confirm Delete</Modal.Title>
        </Modal.Header>
        <RouterForm method="post">
          <Modal.Body>
            <input type="hidden" name="_action" value="delete" />
            <input type="hidden" name="id" value={userToDelete?.id || ''} />
            
            <p>
              Are you sure you want to delete the user{' '}
              <strong>
                {typeof userToDelete?.username === 'string' 
                  ? userToDelete.username 
                  : String(userToDelete?.username)}
              </strong>
              ?
            </p>
            <p className="text-muted small">This action cannot be undone.</p>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
            <Button variant="danger" type="submit">Delete User</Button>
          </Modal.Footer>
        </RouterForm>
      </Modal>

      <Modal show={showBatchModal} onHide={() => setShowBatchModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Batch Edit ({selectedIds.length} users)</Modal.Title>
        </Modal.Header>
        <RouterForm method="post">
          <Modal.Body>
            {error && <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>}
            
            <input type="hidden" name="_action" value="batch" />
            <input type="hidden" name="selectedIds" value={JSON.stringify(Array.from(selectedIds))} />
            <input type="hidden" name="updateRoles" value={String(batchFormData.updateRoles)} />
            <input type="hidden" name="updatePreferences" value={String(batchFormData.updatePreferences)} />
            <input type="hidden" name="roles" value={batchFormData.roles} />
            <input type="hidden" name="preferences" value={batchPreferencesJson} />
            
            <BatchSection
              label="Update Roles"
              checked={batchFormData.updateRoles}
              onToggle={(checked) => setBatchFormData(prev => ({ ...prev, updateRoles: checked }))}
            >
              <Form.Group className="mb-0">
                <Form.Label>Roles</Form.Label>
                {ALL_ROLES.map(role => (
                  <Form.Check
                    key={role}
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
              checked={batchFormData.updatePreferences}
              onToggle={(checked) => setBatchFormData(prev => ({ ...prev, updatePreferences: checked }))}
            >
              <Form.Group className="mb-0">
                <Form.Label>Preferences (JSON)</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={4}
                  value={batchPreferencesJson}
                  onChange={(e) => setBatchPreferencesJson(e.target.value)}
                  placeholder='{"key": "value"}'
                  className="font-monospace"
                  style={{ fontSize: '12px' }}
                />
                <Form.Text className="text-muted">Enter preferences as valid JSON. This will be applied to all selected users.</Form.Text>
              </Form.Group>
            </BatchSection>

            {!batchFormData.updateRoles && !batchFormData.updatePreferences && (
              <Alert variant="info">Select what you want to update by checking the boxes above.</Alert>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowBatchModal(false)}>Cancel</Button>
            <Button 
              variant="primary" 
              type="submit"
              disabled={!batchFormData.updateRoles && !batchFormData.updatePreferences}
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

export default function Accounts({ loaderData, actionData }: Route.ComponentProps) {
  const { SG, dataset, loaderError } = loaderData;

  return createPageContent({
    title: "Accounts",
    header: <h1 className="py-2">Accounts</h1>,
    main: <UserTable SG={SG} dataset={dataset} actionData={actionData} />,
    alerts: loaderError ? { error: loaderError } : actionData,
  });
}
