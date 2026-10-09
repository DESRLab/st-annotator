import _ from 'lodash';
import { useState, useEffect, useRef } from 'react';
import { Button, ButtonGroup, Modal, Form, Alert, Breadcrumb } from 'react-bootstrap';
import { Form as RouterForm, useNavigate, useFetcher } from "react-router";
import type { Column, GridOption, MenuCommandItem, SlickgridReactInstance } from 'slickgrid-react';

import { BatchSection } from '../../components/BatchSection';
import { treeSelectableConfig } from '../../components/slickgrid/options';
import {
  type LabelGroupPublic as LabelGroup,
  type SourceGroupPublic as SourceGroup,
  type ProjectPublic as Project,
  type TaskBulkUpdate,
  type TaskPublic as Task,
  type UserRoles as User,
  listGroupsLabelGroupsGet,
  listGroupsSourceGroupsGet,
  createTaskTasksPost,
  deleteTaskTasksIdDelete,
  listTasksTasksGet,
  updateTaskTasksIdPatch,
  readProjectProjectsIdGet,
  listUsersRolesUsersRolesGet,
  bulkUpdateTasksTasksBulkPatch,
} from '../../../client';
import { clearUser, getCurrentSession, getUser, redirectAndCommit } from "../../loaders";
import { Name } from '../../models/types';
import { createPageContent } from "../../templates";

import type { Route } from "./+types/tasks";
import { SelectMultiplePicker } from '../../components/SelectMultiplePicker';


export async function loader({ request, params }: Route.LoaderArgs) {
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

  let project: Project | undefined;
  try {
    const projectId = Number.parseInt(params.projectId, 10);
  
    const projectRes = await readProjectProjectsIdGet({
      auth: token.access_token,
      path: { id: projectId },
    });
    if (projectRes.error) throw projectRes.error;

    project = projectRes.data;
  } catch (e) {
    session.flash("error", `Failed to open project (id=${params.projectId}): ${e}`)
  }
  if (!project) return redirectAndCommit("/", session);

  const tasksRes = await listTasksTasksGet({ auth: token.access_token });
  const dataset = tasksRes.data ?? [];

  const sourceGroupsByIdRes = await listGroupsSourceGroupsGet({ auth: token.access_token });
  const sourceGroupsById = new Map(sourceGroupsByIdRes.data?.map((g) => [g.id, g]));

  const labelGroupsByIdRes = await listGroupsLabelGroupsGet({ auth: token.access_token });
  const labelGroupsById = new Map(labelGroupsByIdRes.data?.map((g) => [g.id, g]));
    
  const usersRes = await listUsersRolesUsersRolesGet({ auth: token.access_token });
  const memberIds = new Set(project.members.map(u => u.id));
  const membersById = new Map(
    usersRes.data?.filter(u => memberIds.has(u.id)).map(u => [u.id, u])
  );

  const loaderError = tasksRes.error ?? sourceGroupsByIdRes.error ?? labelGroupsByIdRes.error ?? usersRes.error;

  return { user, project, dataset, sourceGroupsById, labelGroupsById, membersById, loaderError };
}

export async function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
  const loaderData = await serverLoader();

  // SlickGrid needs to access the document at import time,
  // so it cannot be imported during SSR
  const SG = await import('slickgrid-react');

  return { ...loaderData, SG };
}

clientLoader.hydrate = true as const;

export async function action({ request, params }: Route.ActionArgs) {
  const session = await getCurrentSession(request);
  const token = session.get("token");
  if (!token) {
    clearUser(session);
    session.flash("error", "Your session has expired. Please log in again.");
    return redirectAndCommit("/login", session);
  }

  let project: Project | undefined;
  try {
    const projectId = Number.parseInt(params.projectId, 10);
  
    const projectRes = await readProjectProjectsIdGet({
      auth: token.access_token,
      path: { id: projectId },
    });
    if (projectRes.error) throw projectRes.error;

    project = projectRes.data;
  } catch (e) {
    session.flash("error", `Failed to open project (id=${params.projectId}): ${e}`)
  }
  if (!project) return redirectAndCommit("/", session);

  const formData = await request.formData();
  const actionType = formData.get('_action');

  if (actionType === 'create' || actionType === 'update') {
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;
    const sourceGroupIdStr = formData.get('source_group_id') as string;
    const source_group_id = sourceGroupIdStr ? Number.parseInt(sourceGroupIdStr, 10) : null;
    const labelGroupIdStr = formData.get('label_group_id') as string;
    const label_group_id = labelGroupIdStr ? Number.parseInt(labelGroupIdStr, 10) : null;
    const supervisorIdsStr = formData.get('supervisor_ids') as string;
    const supervisor_ids = JSON.parse(supervisorIdsStr) as number[];
    const annotatorIdsStr = formData.get('annotator_ids') as string;
    const annotator_ids = JSON.parse(annotatorIdsStr) as number[];
    const deadlineStr = formData.get('deadline') as string;
    const deadline = deadlineStr || null;

    // Validation
    if (!name) {
      return { error: 'Task name is required' };
    }
    if (!Name.regex.test(name)) {
      return { error: `Invalid task name: ${Name.helperText}` };
    }

    // Submit
    if (actionType === 'update') {
      const taskId = Number.parseInt(formData.get('id') as string);
  
      const res = await updateTaskTasksIdPatch({
        auth: token.access_token,
        path: { id: taskId },
        body: { name, description, supervisor_ids, annotator_ids, deadline },
      });
      if (res.error) {
        return { error: res.error };
      }

      return { success: 'Task updated successfully.' };
    } else {  // actionType == 'create'
      const res = await createTaskTasksPost({
        auth: token.access_token,
        body: {
          project_id: project.id,
          name,
          description,
          source_group_id,
          label_group_id,
          supervisor_ids,
          annotator_ids,
          deadline,
          parent_id: null,
        },
      });
      if (res.error) {
        return { error: res.error };
      }

      return { success: 'Task created successfully.' };
    }
  } else if (actionType === 'delete') {
    const taskId = Number.parseInt(formData.get('id') as string, 10);

    // Submit
    const res = await deleteTaskTasksIdDelete({
      auth: token.access_token,
      path: { id: taskId },
    });
    if (res.error) {
      return { error: res.error };
    }

    return { success: 'Task deleted successfully.' };
  } else if (actionType === 'batch_update') {
    const selectedIds = JSON.parse(formData.get('selectedIds') as string) as number[];
    const doUpdateSupervisors = formData.get('updateSupervisors') === 'true';
    const doUpdateAnnotators = formData.get('updateAnnotators') === 'true';

    if (!doUpdateSupervisors && !doUpdateAnnotators) {
      return { error: 'Select at least one attribute to update' };
    }

    const data: TaskBulkUpdate = {};
    if (doUpdateSupervisors) {
      data.supervisor_ids = JSON.parse(formData.get('supervisor_ids') as string) as number[];
    }
    if (doUpdateAnnotators) {
      data.annotator_ids = JSON.parse(formData.get('annotator_ids') as string) as number[];
    }

    const res = await bulkUpdateTasksTasksBulkPatch({
        auth: token.access_token,
        body: { ids: selectedIds, data: data },
    });
    if (res.error) {
      return { error: res.error };
    }

    return { success: `Updated ${selectedIds.length} users.` };
  } else if (actionType === 'move') {
    const itemsStr = formData.get('items') as string;
    const items = JSON.parse(itemsStr) as { id: number; parent_id: number | null }[];

    const tasksByParentId = new Map<number | null, number[]>();
    for (const item of items) {
      if (!tasksByParentId.has(item.parent_id)) {
        tasksByParentId.set(item.parent_id, []);
      }
      tasksByParentId.get(item.parent_id)!.push(item.id);
    }

    const results = await Promise.all(
      Array.from(tasksByParentId).map(([parent_id, ids]) =>
        bulkUpdateTasksTasksBulkPatch({
          auth: token.access_token,
          body: { ids, data: { parent_id } },
        })
      )
    );
    const failed = results.find(r => r.error);
    if (failed) {
      return { error: failed.error };
    }

    return { success: 'Tasks moved successfully.' };
  }

  return { error: 'Unknown action' };
}

function TaskTable({ SG, user, project, dataset, membersById, sourceGroupsById, labelGroupsById, actionData }: {
  SG: typeof import('slickgrid-react');
  user: User;
  project: Project;
  dataset: Task[];
  membersById: Map<number, User>;
  sourceGroupsById: Map<number, SourceGroup>;
  labelGroupsById: Map<number, LabelGroup>;
  actionData?: Route.ComponentProps["actionData"],
}) {
  const navigate = useNavigate();
  
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    sourceGroupId: null as number | null,
    labelGroupId: null as number | null,
    supervisorIds: [] as number[],
    annotatorIds: [] as number[],
    deadline: null as string | null,
  });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [showBatchEditModal, setShowBatchEditModal] = useState(false);
  const [batchFormData, setBatchFormData] = useState({
    supervisorIds: [] as number[],
    annotatorIds: [] as number[],
    updateSupervisors: false,
    updateAnnotators: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [gridOptions, setGridOptions] = useState<GridOption | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const reactGridRef = useRef<SlickgridReactInstance | null>(null);
  const moveFetcher = useFetcher();

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
        setShowBatchEditModal(false);
      }
    }
  }, [actionData]);

  const handleCreate = () => {
    setEditingTask(null);
    setFormData({
      name: '',
      description: '',
      sourceGroupId: null,
      labelGroupId: null,
      supervisorIds: [],
      annotatorIds: [],
      deadline: null,
    });
    setError(null);
    setShowModal(true);
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setFormData({
      name: task.name,
      description: task.description,
      sourceGroupId: task.source_group_id,
      labelGroupId: task.label_group_id,
      supervisorIds: task.supervisors.map(m => m.id),
      annotatorIds: task.annotators.map(m => m.id),
      deadline: task.deadline,
    });
    setError(null);
    setShowModal(true);
  };

  const handleDelete = (task: Task) => {
    setTaskToDelete(task);
    setShowDeleteModal(true);
  };

  const handleBatchEdit = () => {
    setBatchFormData({ supervisorIds: [], annotatorIds: [], updateSupervisors: false, updateAnnotators: false });
    setError(null);
    setShowBatchEditModal(true);
  };

  const { Filters, Formatters, SlickgridReact } = SG;
  const isReadonly = !user.roles.includes("project-manager");

  function defineGrid() {
      const sourceGroupColumn: Column<Task> = {
          id: 'source_group_id',
          name: 'Source Group',
          field: 'source_group_id',
          formatter: (row, cell, v, columnDef, dataContext, grid) => {
            const sourceGroup = sourceGroupsById.get(v);
            return sourceGroup?.name ?? '';
          },
          filterable: true,
          filter: {
              collection: [],
              model: Filters.multipleSelect,
              operator: 'IN',
          },
          sortable: true,
      };
    
      const labelGroupColumn: Column<Task> = {
          id: 'label_group_id',
          name: 'Label Group',
          field: 'label_group_id',
          formatter: (row, cell, v, columnDef, dataContext, grid) => {
            const labelGroup = labelGroupsById.get(v);
            return labelGroup?.name ?? '';
          },
          filterable: true,
          filter: {
              collection: [],
              model: Filters.multipleSelect,
              operator: 'IN',
          },
          sortable: true,
      };
    
      const supervisorsColumn: Column<Task> = {
        id: 'supervisors',
        name: 'Supervisors',
        field: 'supervisors',
        formatter: (row, cell, v, columnDef, dataContext, grid) => {
          let displayText = '';

          if (v.length > 0) {
              const names = v.map((e) => e.username);
              const [firstName] = names;
              displayText = (names.length === 1) ? firstName : `${firstName} (+${names.length - 1})`;
          }

          return displayText;
        },
        filterable: true,
        filter: {
            collection: [],
            model: Filters.multipleSelect,
            operator: 'IN_COLLECTION',
        },
        sortable: true,
    };
    
      const annotatorsColumn: Column<Task> = {
        id: 'annotators',
        name: 'Annotators',
        field: 'annotators',
        formatter: (row, cell, v, columnDef, dataContext, grid) => {
          let displayText = '';

          if (v.length > 0) {
              const names = v.map((e) => e.username);
              const [firstName] = names;
              displayText = (names.length === 1) ? firstName : `${firstName} (+${names.length - 1})`;
          }

          return displayText;
        },
        filterable: true,
        filter: {
            collection: [],
            model: Filters.multipleSelect,
            operator: 'IN_COLLECTION',
        },
        sortable: true,
    };
  
    const cols: Column<Task>[] = [
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
        formatter: (row, cell, value, columnDef, dataContext, grid) => {
            const gridOptions = grid.getOptions();

            const treeLevelPropName = gridOptions?.treeDataOptions?.levelPropName || '__treeLevel';
            if (value == null || dataContext == null) return '';

            if (!(treeLevelPropName in dataContext && typeof dataContext[treeLevelPropName] === 'number')) {
                throw new Error('Invalid data context');
            }

            const treeLevel = dataContext[treeLevelPropName] as number;

            const dataView = grid.getData();
            const identifierPropName = dataView.getIdPropertyName() || 'id';
            const idx = dataView.getIdxById(dataContext[identifierPropName]);
            const nextItem = (idx == null) ? null : dataView.getItemByIdx(idx + 1);

            const icon = '<i class="fas fa-tasks fa-fw" title="Task"></i>';
            const cleanedValue = value.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const spacer = `<span style="display: inline-block; width: ${15 * treeLevel}px;"></span>`;

            if (nextItem && nextItem[treeLevelPropName] > treeLevel) {
                if (dataContext.__collapsed) {  // This is undefined if the item is at bottom level
                    return `${spacer} <span class="slick-group-toggle collapsed" aria-expanded="false" level="${treeLevel}"></span>&nbsp;<span style="vertical-align: top;">${icon}&nbsp;${cleanedValue}</span>`;
                }
                return `${spacer} <span class="slick-group-toggle expanded" aria-expanded="true" level="${treeLevel}"></span>&nbsp;<span style="vertical-align: top;">${icon}&nbsp;${cleanedValue}</span>`;
            }
            return `${spacer} <span class="slick-group-toggle" aria-expanded="false" level="${treeLevel}"></span>&nbsp;<span style="vertical-align: top;">${icon}&nbsp;${cleanedValue}</span>`;
        },
        filterable: true,
        sortable: true,
      },
      sourceGroupColumn,
      labelGroupColumn,
      supervisorsColumn,
      annotatorsColumn,
      {
          id: 'deadline',
          name: 'Deadline',
          field: 'deadline',
          type: "date",
          formatter: Formatters.dateIso,
          filterable: true,
          filter: {
              model: Filters.dateRange,
          },
          sortable: true,
      },
    ];
  
    if (sourceGroupColumn.filter) {
      sourceGroupColumn.filter.collection = Array.from(sourceGroupsById.values())
        .map((g) => ({ value: g.id, label: g.name }));
    }
    if (labelGroupColumn.filter) {
      labelGroupColumn.filter.collection = Array.from(labelGroupsById.values())
        .map((g) => ({ value: g.id, label: g.name }));
    }
    if (supervisorsColumn.filter) {
      const allSupervisors = _.uniqBy(dataset.flatMap((e) => e.supervisors), (m) => m.id);
      supervisorsColumn.filter.collection = allSupervisors
        .map((m) => ({ value: m.id, label: m.username }));
    }
    if (annotatorsColumn.filter) {
      const allAnnotators = _.uniqBy(dataset.flatMap((e) => e.annotators), (m) => m.id);
      annotatorsColumn.filter.collection = allAnnotators
        .map((m) => ({ value: m.id, label: m.username }));
    }

    const commandItems: MenuCommandItem[] = [
      {
        command: 'open',
        title: 'Open',
        iconCssClass: 'fas fa-paperclip fa-fw',
        action: (_e, args) => navigate(`/projects/${project.id}/tasks/${args.dataContext.id}`),
        itemVisibilityOverride: () => getAllSelectedItems().length === 1,
      },
      {
        command: 'edit',
        title: isReadonly ? 'View Details' : 'Edit Details',
        iconCssClass: isReadonly ? 'fas fa-info-circle fa-fw' : 'fas fa-edit fa-fw',
        action: (_e, args) => handleEdit(args.dataContext),
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
        action: (_e, args) => handleDelete(args.dataContext),
        itemVisibilityOverride: () => getAllSelectedItems().length === 1,
      },
    ];

    setColumns(cols);
    setGridOptions({
      ...treeSelectableConfig({
        commandItems,
        multiSelect: true,
        treeColumnId: 'name',
        treeParentPropName: 'parent_id',
        canHaveChildren: () => true,
        onUpdate: (items: Task[]) => {
          const moveItems = items.map(t => ({ id: t.id, parent_id: t.parent_id }));

          moveFetcher.submit(
            { _action: 'move', items: JSON.stringify(moveItems) },
            { method: 'post' },
          );
        },
      }),
      autoResize: { container: "#grid-container" },
      enableAutoResize: true,
    });
  }
  
  function getAllSelectedItems() {
    const slickGrid = reactGridRef.current;
    return slickGrid?.dataView.getAllSelectedItems() ?? [];
  }

  function openTask(task?: Task) {
    if (!task) {
      return;
    }

    navigate(`/projects/${project.id}/tasks/${task.id}`);
  }

  function handleGridDoubleClick(event: CustomEvent<{ args?: { dataContext?: Task; row?: number } }>) {
    const row = event.detail?.args?.row;
    const task = event.detail?.args?.dataContext
      ?? (typeof row === 'number'
        ? reactGridRef.current?.dataView.getItem(row) as Task | undefined
        : undefined);

    openTask(task);
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

  const sourceGroups = Array.from(sourceGroupsById.values());
  const labelGroups = Array.from(labelGroupsById.values());
  const members = Array.from(membersById.values());
  const supervisors = members.filter(a => a.roles.includes("supervisor"));
  const annotators = members.filter(a => a.roles.includes("annotator"));

  return (
    <>
      <div className="mb-3 d-flex gap-2">
        <ButtonGroup className='justify-content-start me-auto'>
          <Button variant="primary" onClick={handleCreate}>Create Task</Button>
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
          gridId="tasks-grid"
          columns={columns}
          options={gridOptions}
          dataset={dataset}
          onDblClick={handleGridDoubleClick}
          onReactGridCreated={(e) => reactGridReady(e.detail)}
          onGridStateChanged={() => onGridStateChanged()}
        />}
      </div>

      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{editingTask ? (isReadonly ? 'View Task' : 'Edit Task') : 'Create Task'}</Modal.Title>
        </Modal.Header>
        <RouterForm method="post">
          <Modal.Body>
            {error && <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>}
            
            <input type="hidden" name="_action" value={editingTask ? 'update' : 'create'} />
            {editingTask && <input type="hidden" name="id" value={editingTask.id} />}
            <input type="hidden" name="source_group_id" value={formData.sourceGroupId ?? ''} />
            <input type="hidden" name="label_group_id" value={formData.labelGroupId ?? ''} />
            <input type="hidden" name="supervisor_ids" value={JSON.stringify(formData.supervisorIds)} />
            <input type="hidden" name="annotator_ids" value={JSON.stringify(formData.annotatorIds)} />

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

            <Form.Group className="mb-3">
              <Form.Label>Source Group</Form.Label>
              <Form.Select
                value={formData.sourceGroupId ?? ''}
                disabled={!!editingTask}
                onChange={(e) => setFormData({ ...formData, sourceGroupId: e.target.value ? Number.parseInt(e.target.value, 10) : null })}
              >
                <option value="">(None)</option>
                {sourceGroups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Label Group</Form.Label>
              <Form.Select
                value={formData.labelGroupId ?? ''}
                disabled={!!editingTask}
                onChange={(e) => setFormData({ ...formData, labelGroupId: e.target.value ? Number.parseInt(e.target.value, 10) : null })}
              >
                <option value="">(None)</option>
                {labelGroups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </Form.Select>
            </Form.Group>
            
            <Form.Group className="mb-3">
              <Form.Label>Supervisors</Form.Label>
              <SelectMultiplePicker
                items={supervisors.map(a => ({ id: a.id, label: a.username }))}
                value={formData.supervisorIds}
                onChange={(newIds) => setFormData(prev => ({ ...prev, supervisorIds: newIds }))}
              />
            </Form.Group>
    
            <Form.Group className="mb-3">
              <Form.Label>Annotators</Form.Label>
              <SelectMultiplePicker
                items={annotators.map(a => ({ id: a.id, label: a.username }))}
                value={formData.annotatorIds}
                onChange={(newIds) => setFormData(prev => ({ ...prev, annotatorIds: newIds }))}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Deadline</Form.Label>
              <Form.Control
                type="date"
                name="deadline"
                value={formData.deadline ?? ''}
                onChange={(e) => setFormData({ ...formData, deadline: e.target.value || null })}
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
            <input type="hidden" name="id" value={taskToDelete?.id || ''} />
            
            <p>Are you sure you want to delete the task <strong>{taskToDelete?.name}</strong>?</p>
            <p className="text-muted small">This action cannot be undone.</p>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
            <Button variant="danger" type="submit">Delete Task</Button>
          </Modal.Footer>
        </RouterForm>
      </Modal>

      <Modal show={showBatchEditModal} onHide={() => setShowBatchEditModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Batch Edit Tasks ({selectedIds.length} selected)</Modal.Title>
        </Modal.Header>
        <RouterForm method="post">
          <Modal.Body>
            {error && <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>}

            <input type="hidden" name="_action" value="batch_update" />
            <input type="hidden" name="selectedIds" value={JSON.stringify(selectedIds)} />
            <input type="hidden" name="updateSupervisors" value={String(batchFormData.updateSupervisors)} />
            <input type="hidden" name="updateAnnotators" value={String(batchFormData.updateAnnotators)} />
            <input type="hidden" name="supervisor_ids" value={JSON.stringify(batchFormData.supervisorIds)} />
            <input type="hidden" name="annotator_ids" value={JSON.stringify(batchFormData.annotatorIds)} />

            <BatchSection
              label="Update Supervisors"
              checked={batchFormData.updateSupervisors}
              onToggle={(checked) => setBatchFormData(prev => ({ ...prev, updateSupervisors: checked }))}
            >
              <Form.Group className="mb-0">
                <Form.Label>Supervisors</Form.Label>
                <SelectMultiplePicker
                  items={supervisors.map(a => ({ id: a.id, label: a.username }))}
                  value={batchFormData.supervisorIds}
                  onChange={(newIds) => setBatchFormData(prev => ({ ...prev, supervisorIds: newIds }))}
                />
              </Form.Group>
            </BatchSection>

            <BatchSection
              label="Update Annotators"
              checked={batchFormData.updateAnnotators}
              onToggle={(checked) => setBatchFormData(prev => ({ ...prev, updateAnnotators: checked }))}
            >
              <Form.Group className="mb-0">
                <Form.Label>Annotators</Form.Label>
                <SelectMultiplePicker
                  items={annotators.map(a => ({ id: a.id, label: a.username }))}
                  value={batchFormData.annotatorIds}
                  onChange={(newIds) => setBatchFormData(prev => ({ ...prev, annotatorIds: newIds }))}
                />
              </Form.Group>
            </BatchSection>

            {!batchFormData.updateSupervisors && !batchFormData.updateAnnotators && (
              <Alert variant="info">Select what you want to update by checking the boxes above.</Alert>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowBatchEditModal(false)}>Cancel</Button>
            <Button
              variant="primary"
              type="submit"
              disabled={!batchFormData.updateSupervisors && !batchFormData.updateAnnotators}
            >
              Apply to {selectedIds.length} Tasks
            </Button>
          </Modal.Footer>
        </RouterForm>
      </Modal>
    </>
  );
}

export function HydrateFallback() {
  return <div>Loading tasks...</div>;
}

export default function Tasks({ loaderData, actionData }: Route.ComponentProps) {
  const { SG, user, project, dataset, sourceGroupsById, labelGroupsById, membersById, loaderError } = loaderData;

  return createPageContent({
    title: `Tasks - ${project.name}`,
    header: <Breadcrumb className="fs-5">
      <Breadcrumb.Item href="/projects">Projects</Breadcrumb.Item>
      <Breadcrumb.Item active>{project.name}</Breadcrumb.Item>
    </Breadcrumb>,
    main: <TaskTable
      SG={SG}
      user={user}
      project={project}
      dataset={dataset}
      sourceGroupsById={sourceGroupsById}
      labelGroupsById={labelGroupsById}
      membersById={membersById}
      actionData={actionData}
    />,
    alerts: loaderError ? { error: loaderError } : actionData,
  });
}
