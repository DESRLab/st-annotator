import YAML from 'js-yaml';
import _ from 'lodash';
import { useState, useEffect, useRef } from 'react';
import { Button, Modal, Form, Alert } from 'react-bootstrap';
import { Form as RouterForm, useNavigate } from "react-router";
import type { Column, GridOption, MenuCommandItem, SlickgridReactInstance } from 'slickgrid-react';

import { selectableConfig } from '../components/slickgrid/options';
import { SelectMultiplePicker } from '../components/SelectMultiplePicker';
import {
  type UserRoles as User,
  type ProjectPublic as Project,
  type ProjectConfig,
  createProjectProjectsPost,
  deleteProjectProjectsIdDelete,
  listProjectsProjectsGet,
  updateProjectProjectsIdPatch,
  listUsersRolesUsersRolesGet,
} from '../../client';
import { clearUser, getCurrentSession, getUser, redirectAndCommit, redirectAndDestroy } from "../loaders";
import { expandOpenApiSchema, getOpenApiJson, type OpenAPIJSONSchema } from '../models/openapi';
import { DEFAULT_PROJECT_CONFIG } from '../models/project';
import { Name } from '../models/types';
import { createPageContent } from "../templates";

import type { Route } from "./+types/projects";

const DEFAULT_PROJECT_CONFIG_STR = YAML.dump(DEFAULT_PROJECT_CONFIG);


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

  const projectsRes = await listProjectsProjectsGet({ auth: token.access_token });
  const dataset = projectsRes.data ?? [];

  const usersRes = await listUsersRolesUsersRolesGet({ auth: token.access_token });
  const usersById = new Map(usersRes.data?.map(u => [u.id, u]))

  const loaderError = projectsRes.error ?? usersRes.error;

  const openApiJson = await getOpenApiJson();
  const projectConfigSchema = expandOpenApiSchema(
    openApiJson,
    openApiJson.components.schemas.ProjectConfig ?? {},
  );

  return { user, dataset, usersById, projectConfigSchema, loaderError };
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

  const formData = await request.formData();
  const actionType = formData.get('_action');

  if (actionType === 'create' || actionType === 'update') {
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;
    const configYaml = formData.get('config') as string;
    const memberIdsStr = formData.get('member_ids') as string;
    const member_ids = JSON.parse(memberIdsStr) as number[];

    // Validation
    if (!name) {
      return { error: 'Project name is required' };
    }
    if (!Name.regex.test(name)) {
      return { error: `Invalid project name: ${Name.helperText}` };
    }

    let config: ProjectConfig = DEFAULT_PROJECT_CONFIG;
    try {
      config = YAML.load(configYaml || DEFAULT_PROJECT_CONFIG_STR) as ProjectConfig;
    } catch (yamlError) {
      return {
        error: `Invalid config: ${yamlError instanceof Error ? yamlError.message : String(yamlError)}`,
      };
    }

    // Submit
    if (actionType === 'update') {
      const projectId = Number.parseInt(formData.get('id') as string);
  
      const res = await updateProjectProjectsIdPatch({
        auth: token.access_token,
        path: { id: projectId },
        body: { name, description, config, member_ids },
      });
      if (res.error) {
        return { error: res.error };
      }

      return { success: 'Project updated successfully.' };
    } else {  // actionType == 'create'
      const res = await createProjectProjectsPost({
        auth: token.access_token,
        body: { name, description, config, member_ids },
      });
      if (res.error) {
        return { error: res.error };
      }

      return { success: 'Project created successfully.' };
    }
  } else if (actionType === 'delete') {
    const projectId = Number.parseInt(formData.get('id') as string, 10);

    // Submit
    const res = await deleteProjectProjectsIdDelete({
      auth: token.access_token,
      path: { id: projectId },
    });
    if (res.error) {
      return { error: res.error };
    }

    return { success: 'Project deleted successfully.' };
  }

  return { error: 'Unknown action' };
}

function ProjectTable({ SG, user, dataset, usersById, projectConfigSchema, actionData }: {
  SG: typeof import('slickgrid-react');
  user: User;
  dataset: Project[];
  usersById: Map<number, User>;
  projectConfigSchema: OpenAPIJSONSchema;
  actionData?: Route.ComponentProps["actionData"],
}) {
  const navigate = useNavigate();
  
  const [showModal, setShowModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    config: ProjectConfig;
    memberIds: number[];
  }>({
    name: '',
    description: '',
    config: DEFAULT_PROJECT_CONFIG,
    memberIds: [],
  });
  const [configYaml, setConfigYaml] = useState(DEFAULT_PROJECT_CONFIG_STR);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
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
    setEditingProject(null);
    setFormData({
      name: '',
      description: '',
      config: DEFAULT_PROJECT_CONFIG,
      memberIds: [],
    });
    setConfigYaml(DEFAULT_PROJECT_CONFIG_STR);
    setError(null);
    setShowModal(true);
  };

  const handleEdit = (project: Project) => {
    setEditingProject(project);
    setFormData({
      name: project.name,
      description: project.description,
      config: project.config,
      memberIds: project.members.map(m => m.id),
    });
    setConfigYaml(YAML.dump(project.config));
    setError(null);
    setShowModal(true);
  };

  const handleDelete = (project: Project) => {
    setProjectToDelete(project);
    setShowDeleteModal(true);
  };

  const { Filters, SlickgridReact } = SG;
  const isReadonly = !user.roles.includes("project-manager");
  const isDeletionAllowed = user.roles.includes("admin");

  function defineGrid() {
    const membersColumn: Column<Project> = {
        id: 'members',
        name: 'Members',
        field: 'members',
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
  
    const cols: Column<Project>[] = [
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
      membersColumn,
    ];
  
    if (membersColumn.filter) {
      const allMembers = _.uniqBy(dataset.flatMap((e) => e.members), (m) => m.id);
      membersColumn.filter.collection = allMembers
        .map((m) => ({ value: m.id, label: m.username }));
    }

    const commandItems: MenuCommandItem[] = [
      {
        command: 'open',
        title: 'Open',
        iconCssClass: 'fas fa-paperclip fa-fw',
        action: (_e, args) => navigate(`/projects/${args.dataContext.id}`),
      },
      {
        command: 'edit',
        title: isReadonly ? 'View Details' : 'Edit Details',
        iconCssClass: isReadonly ? 'fas fa-info-circle fa-fw' : 'fas fa-edit fa-fw',
        action: (_e, args) => handleEdit(args.dataContext),
      },
    ];

    if (isDeletionAllowed) {
      commandItems.push(
        {
          command: 'delete',
          title: 'Delete',
          iconCssClass: 'fas fa-trash fa-fw',
          action: (_e, args) => handleDelete(args.dataContext),
        }
      );
    }

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

  function openProject(project?: Project) {
    if (!project) {
      return;
    }

    navigate(`/projects/${project.id}`);
  }

  function handleGridDoubleClick(event: CustomEvent<{ args?: { dataContext?: Project; row?: number } }>) {
    const row = event.detail?.args?.row;
    const project = event.detail?.args?.dataContext
      ?? (typeof row === 'number'
        ? reactGridRef.current?.dataView.getItem(row) as Project | undefined
        : undefined);

    openProject(project);
  }

  useEffect(() => {
    defineGrid();
  }, []);

  const users = Array.from(usersById.values());

  return (
    <>
      <div className="mb-3">
        <Button variant="primary" onClick={handleCreate}>Create Project</Button>
      </div>

      <div className="slickgrid-container" id="grid-container">
        {gridOptions && <SlickgridReact
          gridId="projects-grid"
          columns={columns}
          options={gridOptions}
          dataset={dataset}
          onReactGridCreated={(e) => reactGridReady(e.detail)}
          onDblClick={handleGridDoubleClick}
        />}
      </div>

      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{editingProject ? (isReadonly ? 'View Project' : 'Edit Project') : 'Create Project'}</Modal.Title>
        </Modal.Header>
        <RouterForm method="post">
          <Modal.Body>
            {error && <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>}
            
            <input type="hidden" name="_action" value={editingProject ? 'update' : 'create'} />
            {editingProject && <input type="hidden" name="id" value={editingProject.id} />}
            <input type="hidden" name="member_ids" value={JSON.stringify(formData.memberIds)} />

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
              <Form.Label>Members</Form.Label>
              <SelectMultiplePicker
                items={users.map((u) => ({ id: u.id, label: u.username }))}
                value={formData.memberIds}
                onChange={(newIds) => setFormData(prev => ({ ...prev, memberIds: newIds }))}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Configuration (YAML)</Form.Label>
              <Form.Control
                as="textarea"
                name="config"
                rows={10}
                value={configYaml}
                onChange={(e) => setConfigYaml(e.target.value)}
                placeholder='- key: value'
                className="font-monospace"
              />
              <Form.Text 
                className="link-primary text-decoration-underline"
                style={{ cursor: 'pointer' }}
                onClick={() => navigator.clipboard.writeText(JSON.stringify(projectConfigSchema, null, 2))}
                title="Click to copy schema"
              >
                Click here to copy the YAML schema to your clipboard
              </Form.Text>
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
            <input type="hidden" name="id" value={projectToDelete?.id || ''} />
            
            <p>Are you sure you want to delete the project <strong>{projectToDelete?.name}</strong>?</p>
            <p className="text-muted small">This action cannot be undone.</p>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
            <Button variant="danger" type="submit">Delete Project</Button>
          </Modal.Footer>
        </RouterForm>
      </Modal>
    </>
  );
}

export function HydrateFallback() {
  return <div>Loading projects...</div>;
}

export default function Projects({ loaderData, actionData }: Route.ComponentProps) {
  const { SG, user, dataset, usersById, projectConfigSchema, loaderError } = loaderData;

  return createPageContent({
    title: "Projects",
    header: <h1 className="py-2">Projects</h1>,
    main: <ProjectTable
      SG={SG}
      user={user}
      dataset={dataset}
      usersById={usersById}
      projectConfigSchema={projectConfigSchema}
      actionData={actionData}
    />,
    alerts: loaderError ? { error: loaderError } : actionData,
  });
}
