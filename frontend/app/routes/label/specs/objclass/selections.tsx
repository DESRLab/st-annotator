import { useEffect, useRef, useState } from 'react';
import { Alert, Breadcrumb, Button, Form, Modal, Nav } from 'react-bootstrap';
import { Form as RouterForm, useLocation } from 'react-router';
import type { Column, GridOption, MenuCommandItem, SlickgridReactInstance } from 'slickgrid-react';

import { SelectMultiplePicker } from '../../../../components/SelectMultiplePicker';
import { selectableConfig } from '../../../../components/slickgrid/options';
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
} from '../../../../../client';
import { clearUser, getCurrentSession, getUser, redirectAndCommit } from '../../../../loaders';
import { Name } from '../../../../models/types';
import { createPageContent } from '../../../../templates';

import type { Route } from './+types/selections';

function ObjectClassSpecsNav() {
  const location = useLocation();

  return (
    <Nav variant="tabs" className="mb-3">
      <Nav.Item>
        <Nav.Link href="/label/specs/objclass/selections" active={location.pathname === '/label/specs/objclass/selections'}>
          Selections
        </Nav.Link>
      </Nav.Item>
      <Nav.Item>
        <Nav.Link href="/label/specs/objclass/definitions" active={location.pathname === '/label/specs/objclass/definitions'}>
          Definitions
        </Nav.Link>
      </Nav.Item>
    </Nav>
  );
}

type ObjectClassSelectionFormState = {
  name: string;
  description: string;
  group_ids: number[];
  objclass_ids: number[];
};

const EMPTY_FORM: ObjectClassSelectionFormState = {
  name: '',
  description: '',
  group_ids: [],
  objclass_ids: [],
};

function normalizeError(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function formatUnknown(value: unknown): string {
  return value == null ? '' : String(value);
}

function trimFormValue(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '').trim();
}

function toOptionalUpdateValue(value: string): string | null {
  return value.trim() === '' ? null : value.trim();
}

function parseIds(value: string): number[] | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'number')) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function formatGroups(groups: LabelGroup[]): string {
  if (groups.length === 0) {
    return '-';
  }

  return groups.map((group) => formatUnknown(group.name)).join(', ');
}

function formatObjectClasses(objclasses: ObjectClass[]): string {
  if (objclasses.length === 0) {
    return '-';
  }

  return objclasses.map((objclass) => formatUnknown(objclass.name)).join(', ');
}

function objectClassSelectionToFormState(selection: ObjectClassSelection): ObjectClassSelectionFormState {
  return {
    name: formatUnknown(selection.name),
    description: selection.description ?? '',
    group_ids: selection.groups.map((group) => group.id),
    objclass_ids: selection.objclasses.map((objclass) => objclass.id),
  };
}

function createPayloadFromFormData(formData: FormData): { data?: ObjectClassSelectionCreate; error?: string } {
  const name = trimFormValue(formData, 'name');
  if (!Name.regex.test(name)) {
    return { error: `Name: ${Name.helperText}` };
  }

  const groupIds = parseIds(trimFormValue(formData, 'group_ids'));
  if (!groupIds) {
    return { error: 'Label groups are invalid.' };
  }

  const objclassIds = parseIds(trimFormValue(formData, 'objclass_ids'));
  if (!objclassIds) {
    return { error: 'Object class definitions are invalid.' };
  }

  return {
    data: {
      name,
      description: trimFormValue(formData, 'description'),
      group_ids: groupIds,
      objclass_ids: objclassIds,
    },
  };
}

function updatePayloadFromFormData(formData: FormData): { data?: ObjectClassSelectionUpdate; error?: string } {
  const name = trimFormValue(formData, 'name');
  if (!Name.regex.test(name)) {
    return { error: `Name: ${Name.helperText}` };
  }

  const groupIds = parseIds(trimFormValue(formData, 'group_ids'));
  if (!groupIds) {
    return { error: 'Label groups are invalid.' };
  }

  const objclassIds = parseIds(trimFormValue(formData, 'objclass_ids'));
  if (!objclassIds) {
    return { error: 'Object class definitions are invalid.' };
  }

  return {
    data: {
      name,
      description: toOptionalUpdateValue(trimFormValue(formData, 'description')),
      group_ids: groupIds,
      objclass_ids: objclassIds,
    },
  };
}

type ObjectClassSelectionFieldsProps = {
  formData: ObjectClassSelectionFormState;
  labelGroups: LabelGroup[];
  objectClasses: ObjectClass[];
  readOnly: boolean;
  onChange: <K extends Exclude<keyof ObjectClassSelectionFormState, 'group_ids' | 'objclass_ids'>>(field: K, value: string) => void;
  onGroupsChange: (groupIds: number[]) => void;
  onObjectClassesChange: (objclassIds: number[]) => void;
};

function ObjectClassSelectionFields({
  formData,
  labelGroups,
  objectClasses,
  readOnly,
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
          onChange={(event) => onChange('name', event.target.value)}
        />
        {!readOnly && <Form.Text className="text-muted">{Name.helperText}</Form.Text>}
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Label>Description</Form.Label>
        <Form.Control
          as="textarea"
          rows={3}
          name="description"
          value={formData.description}
          readOnly={readOnly}
          onChange={(event) => onChange('description', event.target.value)}
        />
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Label>Label Groups</Form.Label>
        <input type="hidden" name="group_ids" value={JSON.stringify(formData.group_ids)} />
        <SelectMultiplePicker
          items={labelGroups.map((group) => ({ id: group.id, label: formatUnknown(group.name) }))}
          value={formData.group_ids}
          onChange={onGroupsChange}
          disabled={readOnly}
        />
      </Form.Group>

      <Form.Group className="mb-0">
        <Form.Label>
          Object Class Definitions
        </Form.Label>
        <input type="hidden" name="objclass_ids" value={JSON.stringify(formData.objclass_ids)} />
        <SelectMultiplePicker
          items={objectClasses.map((objclass) => ({ id: objclass.id, label: formatUnknown(objclass.name) }))}
          value={formData.objclass_ids}
          onChange={onObjectClassesChange}
          disabled={readOnly}
        />
      </Form.Group>
    </>
  );
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getCurrentSession(request);
  const token = session.get('token');
  if (!token) {
    clearUser(session);
    session.flash('error', 'Your session has expired. Please log in again.');
    return redirectAndCommit('/login', session);
  }

  const user = getUser(session);
  if (!user) {
    session.flash('error', 'Your session has expired. Please log in again.');
    return redirectAndCommit('/login', session);
  }

  const [selectionsRes, labelGroupsRes, objectClassesRes] = await Promise.all([
    listSelectionsLabelSpecObjclassSelectionsGet({ auth: token.access_token }),
    listGroupsLabelGroupsGet({ auth: token.access_token }),
    listObjclassesLabelSpecObjclassDefinitionsGet({ auth: token.access_token }),
  ]);

  const dataset = (selectionsRes.data ?? []).slice().sort((left, right) =>
    formatUnknown(left.name).localeCompare(formatUnknown(right.name))
  );
  const labelGroups = (labelGroupsRes.data ?? []).slice().sort((left, right) =>
    formatUnknown(left.name).localeCompare(formatUnknown(right.name))
  );
  const objectClasses = (objectClassesRes.data ?? []).slice().sort((left, right) =>
    formatUnknown(left.name).localeCompare(formatUnknown(right.name))
  );
  const loaderError = selectionsRes.error ?? labelGroupsRes.error ?? objectClassesRes.error;

  return {
    user,
    dataset,
    labelGroups,
    objectClasses,
    loaderError: loaderError ? normalizeError(loaderError) : undefined,
  };
}

export async function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
  const loaderData = await serverLoader();
  const SG = await import('slickgrid-react');
  return { ...loaderData, SG };
}

clientLoader.hydrate = true as const;

export async function action({ request }: Route.ActionArgs) {
  const session = await getCurrentSession(request);
  const token = session.get('token');
  if (!token) {
    clearUser(session);
    session.flash('error', 'Your session has expired. Please log in again.');
    return redirectAndCommit('/login', session);
  }

  const formData = await request.formData();
  const actionType = formData.get('_action');

  if (actionType === 'create') {
    const payload = createPayloadFromFormData(formData);
    if (payload.error || !payload.data) {
      return { error: payload.error ?? 'Unable to create object class selection.' };
    }

    const res = await createSelectionLabelSpecObjclassSelectionsPost({
      auth: token.access_token,
      body: payload.data,
    });
    if (res.error) {
      return { error: normalizeError(res.error) };
    }

    return { success: 'Object class selection created successfully.' };
  }

  if (actionType === 'update') {
    const id = Number.parseInt(trimFormValue(formData, 'id'), 10);
    if (Number.isNaN(id)) {
      return { error: 'A valid object class selection ID is required.' };
    }

    const payload = updatePayloadFromFormData(formData);
    if (payload.error || !payload.data) {
      return { error: payload.error ?? 'Unable to update object class selection.' };
    }

    const res = await updateSelectionLabelSpecObjclassSelectionsIdPatch({
      auth: token.access_token,
      path: { id },
      body: payload.data,
    });
    if (res.error) {
      return { error: normalizeError(res.error) };
    }

    return { success: 'Object class selection updated successfully.' };
  }

  if (actionType === 'delete') {
    const id = Number.parseInt(trimFormValue(formData, 'id'), 10);
    if (Number.isNaN(id)) {
      return { error: 'A valid object class selection ID is required.' };
    }

    const res = await deleteSelectionLabelSpecObjclassSelectionsIdDelete({
      auth: token.access_token,
      path: { id },
    });
    if (res.error) {
      return { error: normalizeError(res.error) };
    }

    return { success: 'Object class selection deleted successfully.' };
  }

  return { error: 'Unknown action.' };
}

function ObjectClassSelectionsTable({
  SG,
  user,
  dataset,
  labelGroups,
  objectClasses,
  actionData,
}: {
  SG: typeof import('slickgrid-react');
  user: User;
  dataset: ObjectClassSelection[];
  labelGroups: LabelGroup[];
  objectClasses: ObjectClass[];
  actionData?: Route.ComponentProps['actionData'];
}) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [gridOptions, setGridOptions] = useState<GridOption | undefined>(undefined);
  const [showModal, setShowModal] = useState(false);
  const [editingSelection, setEditingSelection] = useState<ObjectClassSelection | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectionToDelete, setSelectionToDelete] = useState<ObjectClassSelection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<ObjectClassSelectionFormState>(EMPTY_FORM);
  const reactGridRef = useRef<SlickgridReactInstance | null>(null);

  const { SlickgridReact } = SG;
  const canManage = user.roles.includes('data-manager');

  useEffect(() => {
    reactGridRef.current?.slickGrid.invalidate();
  }, [dataset]);

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
      setEditingSelection(null);
      setSelectionToDelete(null);
      setFormData(EMPTY_FORM);
    }
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
        command: 'edit',
        title: canManage ? 'Edit Details' : 'View Details',
        iconCssClass: canManage ? 'fas fa-edit fa-fw' : 'fas fa-info-circle fa-fw',
        action: (_event, args) => handleEdit(args.dataContext),
      },
    ];

    if (canManage) {
      commandItems.push({
        command: 'delete',
        title: 'Delete',
        iconCssClass: 'fas fa-trash fa-fw',
        action: (_event, args) => handleDelete(args.dataContext),
      });
    }

    setColumns([
      { id: 'id', name: 'ID', field: 'id', type: 'integer', filterable: true, sortable: true },
      {
        id: 'name',
        name: 'Name',
        field: 'name',
        type: 'string',
        filterable: true,
        sortable: true,
        formatter: (_row, _cell, value) => formatUnknown(value),
      },
      {
        id: 'description',
        name: 'Description',
        field: 'description',
        type: 'string',
        filterable: true,
        sortable: true,
        formatter: (_row, _cell, value) => formatUnknown(value) || '-',
      },
      {
        id: 'groups',
        name: 'Label Groups',
        field: 'groups',
        type: 'string',
        filterable: false,
        sortable: false,
        formatter: (_row, _cell, _value, _columnDef, dataContext) => formatGroups(dataContext.groups),
      },
      {
        id: 'objclasses',
        name: 'Object Classes',
        field: 'objclasses',
        type: 'string',
        filterable: false,
        sortable: false,
        formatter: (_row, _cell, _value, _columnDef, dataContext) => formatObjectClasses(dataContext.objclasses),
      },
    ]);

    setGridOptions({
      ...(selectableConfig({ commandItems: commandItems as never, multiSelect: false }) as unknown as GridOption),
      autoResize: { container: '#grid-container' },
      enableAutoResize: true,
    });
  }

  function reactGridReady(reactGrid: SlickgridReactInstance) {
    reactGridRef.current = reactGrid;
  }

  function updateFormField<K extends Exclude<keyof ObjectClassSelectionFormState, 'group_ids' | 'objclass_ids'>>(field: K, value: string) {
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
  }, [canManage]);

  return (
    <>
      <div className="mb-3 text-muted">
        Select which object classes you want to include for each label group.
      </div>

      <div className="mb-3">
        {canManage && <Button variant="primary" onClick={handleCreate}>Create Object Class Selection</Button>}
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
              ? canManage ? 'Edit Object Class Selection' : 'View Object Class Selection'
              : 'Create Object Class Selection'}
          </Modal.Title>
        </Modal.Header>
        <RouterForm method="post">
          <Modal.Body>
            {error && <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>}

            <input type="hidden" name="_action" value={editingSelection ? 'update' : 'create'} />
            {editingSelection && <input type="hidden" name="id" value={editingSelection.id} />}

            <ObjectClassSelectionFields
              formData={formData}
              labelGroups={labelGroups}
              objectClasses={objectClasses}
              readOnly={!canManage}
              onChange={updateFormField}
              onGroupsChange={updateGroups}
              onObjectClassesChange={updateObjectClasses}
            />
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>{canManage ? 'Cancel' : 'Close'}</Button>
            {canManage && <Button variant="primary" type="submit">Save</Button>}
          </Modal.Footer>
        </RouterForm>
      </Modal>

      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Confirm Delete</Modal.Title>
        </Modal.Header>
        <RouterForm method="post">
          <Modal.Body>
            {error && <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>}
            <input type="hidden" name="_action" value="delete" />
            <input type="hidden" name="id" value={selectionToDelete?.id ?? ''} />
            <p>
              Are you sure you want to delete object class selection <strong>{selectionToDelete ? formatUnknown(selectionToDelete.name) : ''}</strong>?
            </p>
            <p className="text-muted small">This action cannot be undone.</p>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
            <Button variant="danger" type="submit">Delete</Button>
          </Modal.Footer>
        </RouterForm>
      </Modal>
    </>
  );
}

export function HydrateFallback() {
  return <div>Loading object class selections...</div>;
}

export default function ObjectClassSelections({ loaderData, actionData }: Route.ComponentProps) {
  const { SG, user, dataset, labelGroups, objectClasses, loaderError } = loaderData;

  return createPageContent({
    title: 'Object Class Selections',
    header: <>
      <Breadcrumb className="mb-1">
        <Breadcrumb.Item href="/label/specs">Label Specifications</Breadcrumb.Item>
        <Breadcrumb.Item active>Object Class Selections</Breadcrumb.Item>
      </Breadcrumb>
      <h2 className="py-2">Object Class Selections</h2>
    </>,
    main: (
      <>
        <ObjectClassSpecsNav />
        <ObjectClassSelectionsTable
          SG={SG}
          user={user}
          dataset={dataset}
          labelGroups={labelGroups}
          objectClasses={objectClasses}
          actionData={actionData}
        />
      </>
    ),
    alerts: loaderError ? { error: loaderError } : actionData,
  });
}