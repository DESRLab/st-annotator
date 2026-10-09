import _ from 'lodash';
import { useState, useEffect, useRef } from 'react';
import { Button, Modal, Form, Alert } from 'react-bootstrap';
import { Form as RouterForm } from "react-router";
import type { Column, GridOption, MenuCommandItem, SlickgridReactInstance } from 'slickgrid-react';

import { selectableConfig } from '../../components/slickgrid/options';
import {
  type UserRoles as User,
  type SourceGroupPublic as SourceGroup,
  createGroupSourceGroupsPost,
  deleteGroupSourceGroupsIdDelete,
  listGroupsSourceGroupsGet,
  updateGroupSourceGroupsIdPatch,
} from '../../../client';
import { clearUser, getCurrentSession, getUser, redirectAndCommit } from "../../loaders";
import { Name } from '../../models/types';
import { createPageContent } from "../../templates";

import type { Route } from "./+types/groups";

export type SourceSpecLike = {
  id: number;
  name: string;
  group: SourceGroup;
}

export type SourceSpecUpdateLike = {
  group_id?: number | null;
}

export type SourceSpecAPI = {
  list: (token: string) => Promise<{ data: SourceSpecLike[]; error: unknown }>;
  update: (token: string, id: number, data: SourceSpecUpdateLike) => Promise<{ data: undefined; error: unknown }>;
}

// Populated by plugins at runtime
export const SPEC_APIS: Record<string, SourceSpecAPI> = {};

export const DEFAULT_SPEC_IDS = Object.fromEntries(
  Object.keys(SPEC_APIS).map(k => [`${k}_id`, null] as const)
);

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

  const sourceGroupsRes = await listGroupsSourceGroupsGet({ auth: token.access_token });
  const dataset = sourceGroupsRes.data ?? [];

  const specsRes = Object.fromEntries(
    await Promise.all(
      Object.entries(SPEC_APIS)
        .map(async ([k, specApi]) => {
          const res = await specApi.list(token.access_token);
          return [k, res] as const;
        })
    )
  );
  const specsById = Object.fromEntries(
    Object.entries(specsRes)
      .map(([k, res]) => [k, new Map(res.data?.map(s => [s.id, s]))] as const)
  );

  const loaderError = sourceGroupsRes.error ?? Object.values(specsRes).find(res => res.error);

  return { user, dataset, specsById, loaderError };
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
  if (!token) return redirectAndCommit("/login", session);

  const formData = await request.formData();
  const actionType = formData.get('_action');

  if (actionType === 'create' || actionType === 'update') {
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;
    const specsIdStr = Object.fromEntries(
      Object.keys(SPEC_APIS).map(k => [k, formData.get(`${k}_id`) as string] as const)
    );
    const specsId = Object.fromEntries(
      Object.entries(specsIdStr).map(([k, idStr]) => [k, (idStr ? Number.parseInt(idStr) : null)] as const)
    );

    // Validation
    if (!name) {
      return { error: 'Group name is required' };
    }
    if (!Name.regex.test(name)) {
      return { error: `Group name: ${Name.helperText}` };
    }

    // Submit
    if (actionType === 'update') {
      const sourceGroupId = Number.parseInt(formData.get('id') as string);
  
      const res = await updateGroupSourceGroupsIdPatch({
        auth: token.access_token,
        path: { id: sourceGroupId },
        body: { name, description },
      });
      if (res.error) {
        return { error: res.error };
      }

      await Promise.all(
        Object.entries(specsId).map(
          async ([k, newSpecId]) => {
            const specApi = SPEC_APIS[k];
            const specRes = await specApi.list(token.access_token);
            if (specRes.error) throw specRes.error;

            const prevSpecId = specRes.data?.filter(s => s.group.id == sourceGroupId)[0]?.id;
            if (prevSpecId === newSpecId) return;
    
            if (prevSpecId != null) {
              const prevRes = await specApi.update(
                token.access_token,
                prevSpecId,
                { group_id: null },
              );
              if (prevRes.error) throw prevRes.error;
            }

            if (newSpecId != null) {
              const newRes = await specApi.update(
                token.access_token,
                newSpecId,
                { group_id: sourceGroupId },
              );
              if (newRes.error) throw newRes.error;
            }
          }
        )
      )

      return { success: 'Group updated successfully.' };
    } else {  // actionType == 'create'
      const res = await createGroupSourceGroupsPost({
        auth: token.access_token,
        body: { name, description },
      });
      if (!res.data || res.error) {
        return { error: res.error };
      }

      await Promise.all(
        Object.entries(specsId).map(
          async ([k, newSpecId]) => {
            if (newSpecId != null) {
              const specApi = SPEC_APIS[k];
              const newRes = await specApi.update(
                token.access_token,
                newSpecId,
                { group_id: res.data.id },
              );
              if (newRes.error) throw newRes.error;
            }
          }
        )
      )

      return { success: 'Group created successfully.' };
    }
  } else if (actionType === 'delete') {
    const sourceGroupId = Number.parseInt(formData.get('id') as string, 10);

    // Submit
    const res = await deleteGroupSourceGroupsIdDelete({
      auth: token.access_token,
      path: { id: sourceGroupId },
    });
    if (res.error) {
      return { error: res.error };
    }

    return { success: 'Group deleted successfully.' };
  }

  return { error: 'Unknown action' };
}

function SourceGroupTable({ SG, user, dataset, specsById, actionData }: {
  SG: typeof import('slickgrid-react');
  user: User;
  dataset: SourceGroup[];
  specsById: Record<string, Map<number, SourceSpecLike>>;
  actionData?: Route.ComponentProps["actionData"],
}) {
  const [showModal, setShowModal] = useState(false);
  const [editingSourceGroup, setEditingSourceGroup] = useState<SourceGroup | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
  } & Record<string, number | null>>({
    name: '',
    description: '',
    ...DEFAULT_SPEC_IDS,
  });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [sourceGroupToDelete, setSourceGroupToDelete] = useState<SourceGroup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [gridOptions, setGridOptions] = useState<GridOption | undefined>(undefined);
  const reactGridRef = useRef<SlickgridReactInstance | null>(null);

  // Sync grid when dataset prop changes (after revalidation returns fresh data).
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
      }
    }
  }, [actionData]);

  const handleCreate = () => {
    setEditingSourceGroup(null);
    setFormData({
      name: '',
      description: '',
      ...DEFAULT_SPEC_IDS,
    });
    setError(null);
    setShowModal(true);
  };

  const handleEdit = (sourceGroup: SourceGroup) => {
    setEditingSourceGroup(sourceGroup);
    setFormData({
      name: sourceGroup.name,
      description: sourceGroup.description,
      ...Object.entries(specsById).map(
          ([k, specById]) => [
            k,
            Array.from(specById.values()).find(s => s.group.id === sourceGroup.id) ?? null,
          ] as const
      ),
    });
    setError(null);
    setShowModal(true);
  };

  const handleDelete = (sourceGroup: SourceGroup) => {
    setSourceGroupToDelete(sourceGroup);
    setShowDeleteModal(true);
  };

  const { SlickgridReact } = SG;
  const isReadonly = !user.roles.includes("data-manager");

  function defineGrid() {
  
    const cols: Column<SourceGroup>[] = [
      {
        id: 'id',
        name: 'ID',
        field: 'id',
        type: "integer",
        filterable: true,
        sortable: true,
      },
      {
        id: 'name',
        name: 'Name',
        field: 'name',
        type: "string",
        filterable: true,
        sortable: true,
      },
      {
        id: 'description',
        name: 'Description',
        field: 'description',
        type: "string",
        filterable: true,
        sortable: true,
      },
    ];

    const commandItems: MenuCommandItem[] = [
      {
        command: 'edit',
        title: isReadonly ? 'View Details' : 'Edit Details',
        iconCssClass: isReadonly ? 'fas fa-info-circle fa-fw' : 'fas fa-edit fa-fw',
        action: (_e, args) => handleEdit(args.dataContext),
      },
      {
          command: 'delete',
          title: 'Delete',
          iconCssClass: 'fas fa-trash fa-fw',
          action: (_e, args) => handleDelete(args.dataContext),
      }
    ];


    setColumns(cols);
    setGridOptions({
      ...selectableConfig({ commandItems, multiSelect: false }),
      autoResize: { container: "#grid-container" },
      enableAutoResize: true,
    });
  }

  function reactGridReady(reactGrid: SlickgridReactInstance) {
    reactGridRef.current = reactGrid;
  }

  useEffect(() => {
    defineGrid();
  }, []);

  return (
    <>
      <div className="mb-3">
        <Button variant="primary" onClick={handleCreate}>Create Group</Button>
      </div>

      <div className="slickgrid-container" id="grid-container">
        {gridOptions && <SlickgridReact
          gridId="sourceGroups-grid"
          columns={columns}
          options={gridOptions}
          dataset={dataset}
          onReactGridCreated={(e) => reactGridReady(e.detail)}
        />}
      </div>

      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{editingSourceGroup ? (isReadonly ? 'View Group' : 'Edit Group') : 'Create Group'}</Modal.Title>
        </Modal.Header>
        <RouterForm method="post">
          <Modal.Body>
            {error && <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>}
            
            <input type="hidden" name="_action" value={editingSourceGroup ? 'update' : 'create'} />
            {editingSourceGroup && <input type="hidden" name="id" value={editingSourceGroup.id} />}
            {Object.keys(DEFAULT_SPEC_IDS).map(k => <input type="hidden" name={k} value={JSON.stringify(formData[k])} />)}

            <fieldset disabled={isReadonly}>

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
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                title={Name.helperText}
              />
              {!isReadonly && <Form.Text className="text-muted">{Name.helperText}</Form.Text>}
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Description</Form.Label>
              <Form.Control
                as="textarea"
                name="description"
                rows={5}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </Form.Group>

            </fieldset>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>{isReadonly ? 'Close' : 'Cancel'}</Button>
            {!isReadonly && <Button variant="primary" type="submit">Save</Button>}
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
            <input type="hidden" name="id" value={sourceGroupToDelete?.id || ''} />
            
            <p>Are you sure you want to delete the group <strong>{sourceGroupToDelete?.name}</strong>?</p>
            <p className="text-muted small">This action cannot be undone.</p>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
            <Button variant="danger" type="submit">Delete Group</Button>
          </Modal.Footer>
        </RouterForm>
      </Modal>
    </>
  );
}

export function HydrateFallback() {
  return <div>Loading groups...</div>;
}

export default function SourceGroups({ loaderData, actionData }: Route.ComponentProps) {
  const { SG, user, dataset, specsById, loaderError } = loaderData;

  return createPageContent({
    title: "Source Groups",
    header: <>
      <h2 className="py-2">Source Groups</h2>
    </>,
    main: <SourceGroupTable
      SG={SG}
      user={user}
      dataset={dataset}
      specsById={specsById}
      actionData={actionData}
    />,
    alerts: loaderError ? { error: loaderError } : actionData,
  });
}
