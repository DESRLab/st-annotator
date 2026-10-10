import { Fragment, useId, useState, useEffect, useRef } from "react";
import {
  Button,
  ButtonGroup,
  Modal,
  Form,
  InputGroup,
  Alert,
} from "react-bootstrap";
import { Form as RouterForm, useNavigate, useNavigation } from "react-router";
import type {
  Column,
  GridOption,
  MenuCommandItem,
  SlickgridReactInstance,
} from "slickgrid-react";
import { z } from "zod";

import {
  type UserRoles as User,
  type ProjectPublic as Project,
  type ProjectConfig,
  type Vector3,
  bulkUpdateProjectsProjectsBulkPatch,
  createProjectProjectsPost,
  deleteProjectProjectsIdDelete,
  listProjectIdsProjectsIdsGet,
  listProjectsProjectsGet,
  updateProjectProjectsIdPatch,
  listUsersRolesUsersRolesGet,
} from "../../client";
import { BatchSection } from "../components/BatchSection";
import { CommitOnBlurText } from "../components/CommitOnBlurText";
import {
  ConfigFieldTabs,
  type ConfigEditorState,
  type ConfigParse,
} from "../components/ConfigFieldTabs";
import { GridSelectionButtons } from "../components/GridSelectionButtons";
import { SelectMultiplePicker } from "../components/SelectMultiplePicker";
import { createSlickgridClientLoader } from "../components/slickgrid/client";
import { selectableConfig } from "../components/slickgrid/options";
import {
  syncRoutePaginationGrid,
  useRoutePaginationGridOptions,
} from "../components/slickgrid/pagination";
import {
  formStringSchema,
  formatFormError,
  identifierArraySchema,
  identifierSchema,
  submittedBooleanSchema,
} from "../forms";
import {
  applyInFilterToQuery,
  applyNumericFilterToQuery,
  applySortersToQuery,
  applyTextFilterToQuery,
  getGridStateRequest,
  loadAccessTokenSession,
  loadAuthenticatedSession,
  listGridPage,
  type GridPagination,
  type GridQuery,
  type GridStateRequest,
} from "../loaders";
import {
  expandOpenApiSchema,
  getOpenApiJson,
  type OpenAPIJSONSchema,
} from "../models/openapi";
import { DEFAULT_PROJECT_CONFIG } from "../models/project";
import { Name } from "../models/types";
import { createPageContent } from "../templates";

import type { Route } from "./+types/projects";

const DEFAULT_PROJECT_CONFIG_STR = JSON.stringify(
  DEFAULT_PROJECT_CONFIG,
  null,
  2,
);

/**
 * Reads the configuration textarea, where empty means "use the defaults".
 *
 * Throws on malformed JSON or a non-object document; both callers turn the
 * failure into an `Invalid config:` message.
 */
export function parseProjectConfigText(text: string): ProjectConfig {
  const trimmed = text.trim();
  const parsed: unknown = JSON.parse(
    trimmed === "" ? DEFAULT_PROJECT_CONFIG_STR : trimmed,
  );
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Configuration must be a JSON object.");
  }
  return parsed as ProjectConfig;
}

export function formatProjectConfigText(
  value: ProjectConfig | undefined,
): string {
  return JSON.stringify(value ?? {}, null, 2);
}

/** The structured pane's view of the text: a bad document disables it, never erases it. */
function parseProjectConfigPane(text: string): ConfigParse<ProjectConfig> {
  try {
    return { ok: true, value: parseProjectConfigText(text) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** A null or missing number reads as unfilled, never as the text "null". */
function textOfNumber(value: number | null | undefined): string {
  return typeof value === "number" ? String(value) : "";
}

function configNumberError(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === "") {
    return "A value is required.";
  }
  return Number.isNaN(Number(trimmed)) ? "Enter a number." : null;
}

function positiveIntegerError(text: string): string | null {
  const problem = configNumberError(text);
  if (problem) {
    return problem;
  }
  const value = Number(text.trim());
  if (!Number.isInteger(value) || value < 1) {
    return "Enter a whole number of at least 1.";
  }
  return null;
}

const CAMERA_AXES = ["x", "y", "z"] as const;

/** Structured editor for a project's `ProjectConfig`. */
export function ProjectConfigFields({
  value,
  disabled,
  onChange,
}: ConfigEditorState<ProjectConfig>) {
  const autoTracksId = useId();

  return (
    <>
      <CommitOnBlurText
        label="Frame cache size"
        value={textOfNumber(value.frame_cache_size)}
        disabled={disabled}
        validate={positiveIntegerError}
        helperText="Maximum number of frames kept loaded once read from the server."
        onCommit={(text) =>
          onChange({ ...value, frame_cache_size: Number(text.trim()) })
        }
      />
      <Form.Group className="mb-2">
        <Form.Check
          id={autoTracksId}
          type="checkbox"
          label="Auto tracks"
          className="small"
          checked={value.auto_tracks === true}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...value, auto_tracks: event.target.checked })
          }
        />
        <Form.Text className="text-muted d-block">
          Force each object track to hold a single bounding box. Enable if your
          project doesn't require explicit object tracking.
        </Form.Text>
      </Form.Group>
      <CameraVectorFields
        label="Initial camera position"
        helper="Where the editor starts, relative to the frame origin. Leave unset to keep the server default."
        vector={value.init_camera_position}
        disabled={disabled}
        onChange={(vector) =>
          onChange({ ...value, init_camera_position: vector })
        }
      />
      <CameraVectorFields
        label="Initial camera target"
        helper="The point the editor looks at on open. Leave unset to keep the server default."
        vector={value.init_camera_target}
        disabled={disabled}
        onChange={(vector) =>
          onChange({ ...value, init_camera_target: vector })
        }
      />
    </>
  );
}

interface CameraVectorFieldsProps {
  label: string;
  helper: string;
  vector: Vector3 | null | undefined;
  disabled: boolean;
  onChange: (vector: Vector3 | undefined) => void;
}

/**
 * A `Vector3` is all-or-nothing, so the checkbox decides whether the key is
 * present at all and the axes only ever commit a number. An explicit null in
 * the raw JSON reads as "not set", the same as an absent key.
 */
function CameraVectorFields({
  label,
  helper,
  vector,
  disabled,
  onChange,
}: CameraVectorFieldsProps) {
  const axes = vector ?? undefined;
  const toggleId = useId();
  return (
    <Form.Group className="mb-2">
      <Form.Check
        id={toggleId}
        type="checkbox"
        label={label}
        className="small"
        checked={axes !== undefined}
        disabled={disabled}
        onChange={(event) =>
          onChange(event.target.checked ? { x: 0, y: 0, z: 0 } : undefined)
        }
      />
      {axes && (
        <InputGroup size="sm" className="mt-1">
          {CAMERA_AXES.map((axis) => (
            <Fragment key={axis}>
              <InputGroup.Text>{axis}</InputGroup.Text>
              <CommitOnBlurText
                ariaLabel={`${label} ${axis}`}
                value={textOfNumber(axes[axis])}
                disabled={disabled}
                validate={configNumberError}
                onCommit={(text) =>
                  onChange({ ...axes, [axis]: Number(text.trim()) })
                }
              />
            </Fragment>
          ))}
        </InputGroup>
      )}
      <Form.Text className="text-muted d-block">{helper}</Form.Text>
    </Form.Group>
  );
}

const projectFormSchema = z.object({
  name: formStringSchema,
  description: formStringSchema,
  configJson: formStringSchema,
  memberIds: identifierArraySchema.optional(),
});

const PROJECT_SORTABLE_COLUMNS = new Set(["id", "name", "description"]);

export function buildProjectsQuery({
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
      case "members":
        applyInFilterToQuery(query, filter, "member_id");
        break;
    }
  }

  applySortersToQuery(query, sorters, PROJECT_SORTABLE_COLUMNS);

  return query;
}

export async function loader({ request }: Route.LoaderArgs) {
  const authenticated = await loadAuthenticatedSession(request);
  if (authenticated instanceof Response) return authenticated;
  const { token, user } = authenticated;

  const projectsRes = await listGridPage(request, (pagination) =>
    listProjectsProjectsGet({
      auth: token.access_token,
      query: {
        ...buildProjectsQuery(getGridStateRequest(request)),
        ...pagination,
      },
    }),
  );
  const dataset = projectsRes.data ?? [];

  const allProjectIdsRes = await listProjectIdsProjectsIdsGet({
    auth: token.access_token,
    query: buildProjectsQuery(getGridStateRequest(request)),
  });
  const allSelectableIds = allProjectIdsRes.data ?? [];

  const usersRes = await listUsersRolesUsersRolesGet({
    auth: token.access_token,
  });
  const usersById = new Map(usersRes.data?.map((u) => [u.id, u]));

  const loaderError =
    projectsRes.error ?? allProjectIdsRes.error ?? usersRes.error;

  const openApiJson = await getOpenApiJson();
  const projectConfigSchema = expandOpenApiSchema(
    openApiJson,
    openApiJson.components.schemas.ProjectConfig ?? {},
  );

  return {
    user,
    dataset,
    allSelectableIds,
    pagination: projectsRes.pagination,
    usersById,
    projectConfigSchema,
    loaderError,
  };
}

export const clientLoader =
  createSlickgridClientLoader<Route.ClientLoaderArgs>();

interface ProjectBulkFormState {
  description: string;
  configJson: string;
  memberIds: number[];
  updateDescription: boolean;
  updateConfig: boolean;
  updateMembers: boolean;
}

const EMPTY_BULK_FORM: ProjectBulkFormState = {
  description: "",
  configJson: DEFAULT_PROJECT_CONFIG_STR,
  memberIds: [],
  updateDescription: false,
  updateConfig: false,
  updateMembers: false,
};

export interface ProjectBulkUpdateBody {
  description?: string;
  config?: ProjectConfig;
  member_ids?: number[];
}

/**
 * Build a bulk-update payload from a batch form's state.
 *
 * A bulk write replaces each selected project's value outright, so only the attributes the
 * actor opted into are sent at all. An opted-in empty member list is therefore a real
 * request to remove everyone, which the batch dialog states instead of second-guessing.
 */
export function buildProjectBulkUpdate(state: ProjectBulkFormState): {
  data?: ProjectBulkUpdateBody;
  error?: string;
} {
  const {
    description,
    configJson,
    memberIds,
    updateDescription,
    updateConfig,
    updateMembers,
  } = state;

  if (!updateDescription && !updateConfig && !updateMembers) {
    return { error: "Select at least one attribute to update" };
  }

  const data: ProjectBulkUpdateBody = {};

  if (updateDescription) {
    data.description = description;
  }

  if (updateConfig) {
    try {
      data.config = parseProjectConfigText(configJson);
    } catch (configError) {
      return {
        error: `Invalid config: ${configError instanceof Error ? configError.message : String(configError)}`,
      };
    }
  }

  if (updateMembers) {
    data.member_ids = memberIds;
  }

  return { data };
}

/**
 * Preview of a members batch write against the current selection.
 *
 * A bulk write applies one payload to every selected project, so the dialog names the
 * membership it is about to overwrite instead of prefilling a list that would quietly
 * copy one project's roster onto the others. The roster of the selection is a union,
 * because that is the set a single shared list can add to or take away from, and an
 * account the picker does not list is still named from the rows it appears in.
 */
export function describeProjectBatchMembers({
  projects,
  accounts,
  memberIds,
  updateMembers,
  currentUserId,
}: {
  projects: readonly Pick<Project, "members">[];
  accounts: ReadonlyMap<number, Pick<User, "username">>;
  memberIds: readonly number[];
  updateMembers: boolean;
  currentUserId: number;
}): {
  currentMemberIds: number[];
  droppedMemberIds: number[];
  addedMemberIds: number[];
  wouldRemoveSelf: boolean;
  formatMembers: (ids: readonly number[]) => string;
} {
  const namesById = new Map<number, string>();
  for (const [id, account] of accounts) {
    namesById.set(id, account.username);
  }
  for (const project of projects) {
    for (const member of project.members) {
      namesById.set(member.id, member.username);
    }
  }

  const currentMemberIds = [
    ...new Set(
      projects.flatMap((project) => project.members.map((member) => member.id)),
    ),
  ];
  const droppedMemberIds = updateMembers
    ? currentMemberIds.filter((id) => !memberIds.includes(id))
    : [];
  const addedMemberIds = updateMembers
    ? memberIds.filter((id) => !currentMemberIds.includes(id))
    : [];

  return {
    currentMemberIds,
    droppedMemberIds,
    addedMemberIds,
    wouldRemoveSelf: droppedMemberIds.includes(currentUserId),
    formatMembers: (ids) =>
      ids.map((id) => namesById.get(id) ?? `user #${id}`).join(", "),
  };
}

const projectBulkFormSchema = z.object({
  selectedIds: identifierArraySchema,
  updateDescription: submittedBooleanSchema,
  updateConfig: submittedBooleanSchema,
  updateMembers: submittedBooleanSchema,
  description: formStringSchema,
  configJson: formStringSchema,
  memberIds: identifierArraySchema,
});

export async function action({ request }: Route.ActionArgs) {
  const authenticated = await loadAccessTokenSession(request);
  if (authenticated instanceof Response) return authenticated;
  const { token } = authenticated;

  const formData = await request.formData();
  const actionType = formData.get("_action");

  if (actionType === "create" || actionType === "update") {
    const parsedForm = projectFormSchema.safeParse({
      name: formData.get("name"),
      description: formData.get("description"),
      configJson: formData.get("config"),
      memberIds: formData.has("member_ids")
        ? formData.get("member_ids")
        : undefined,
    });
    if (!parsedForm.success)
      return {
        error: formatFormError(parsedForm.error, "project form data"),
      };
    const {
      name,
      description,
      configJson,
      memberIds: member_ids,
    } = parsedForm.data;

    // Validation
    if (!name) {
      return { error: "Project name is required" };
    }
    if (!Name.regex.test(name)) {
      return { error: `Invalid project name: ${Name.helperText}` };
    }

    let config: ProjectConfig = DEFAULT_PROJECT_CONFIG;
    try {
      config = parseProjectConfigText(configJson);
    } catch (configError) {
      return {
        error: `Invalid config: ${configError instanceof Error ? configError.message : String(configError)}`,
      };
    }

    // Submit
    if (actionType === "update") {
      const parsedProjectId = identifierSchema.safeParse(formData.get("id"));
      if (!parsedProjectId.success)
        return {
          error: formatFormError(parsedProjectId.error, "project id"),
        };
      const issuedAt = formData.get("issued_at");
      if (typeof issuedAt !== "string")
        return { error: "Project edit timestamp is required" };

      const res = await updateProjectProjectsIdPatch({
        auth: token.access_token,
        path: { id: parsedProjectId.data },
        body: {
          issued_at: issuedAt,
          name,
          description,
          config,
          // A permission-gated form renders no membership input and so sends no
          // `member_ids` key at all: an absent list leaves the stored roster alone,
          // while `[]` replaces it and un-assigns everyone.
          ...(member_ids === undefined ? {} : { member_ids }),
        },
      });
      if (res.error) {
        return { error: res.error };
      }

      return { success: "Project updated successfully." };
    } else {
      // actionType == 'create'
      const res = await createProjectProjectsPost({
        auth: token.access_token,
        body: {
          name,
          description,
          config,
          ...(member_ids === undefined ? {} : { member_ids }),
        },
      });
      if (res.error) {
        return { error: res.error };
      }

      return { success: "Project created successfully." };
    }
  } else if (actionType === "batch_update") {
    const parsedBatch = projectBulkFormSchema.safeParse({
      selectedIds: formData.get("selectedIds"),
      updateDescription: formData.getAll("updateDescription"),
      updateConfig: formData.getAll("updateConfig"),
      updateMembers: formData.getAll("updateMembers"),
      description: formData.get("description") ?? "",
      configJson: formData.get("config") ?? "",
      memberIds: formData.get("member_ids") ?? "[]",
    });
    if (!parsedBatch.success)
      return {
        error: formatFormError(parsedBatch.error, "batch project update"),
      };

    const {
      selectedIds,
      updateDescription,
      updateConfig,
      updateMembers,
      description,
      configJson,
      memberIds,
    } = parsedBatch.data;

    if (selectedIds.length === 0) {
      return { error: "Select at least one project to update" };
    }

    const built = buildProjectBulkUpdate({
      updateDescription,
      description,
      updateConfig,
      configJson,
      updateMembers,
      memberIds,
    });
    if (built.error || !built.data) {
      return { error: built.error ?? "Unable to batch update projects." };
    }

    // Submit
    const res = await bulkUpdateProjectsProjectsBulkPatch({
      auth: token.access_token,
      body: { ids: selectedIds, data: built.data },
    });
    if (res.error) {
      return { error: res.error };
    }

    return { success: `Updated ${selectedIds.length} projects.` };
  } else if (actionType === "delete") {
    const parsedProjectId = identifierSchema.safeParse(formData.get("id"));
    if (!parsedProjectId.success)
      return {
        error: formatFormError(parsedProjectId.error, "project id"),
      };

    // Submit
    const res = await deleteProjectProjectsIdDelete({
      auth: token.access_token,
      path: { id: parsedProjectId.data },
    });
    if (res.error) {
      return { error: res.error };
    }

    return { success: "Project deleted successfully." };
  }

  return { error: "Unknown action" };
}

function ProjectTable({
  SG,
  user,
  dataset,
  allSelectableIds,
  pagination,
  usersById,
  projectConfigSchema,
  actionData,
}: {
  SG: typeof import("slickgrid-react");
  user: User;
  dataset: Project[];
  allSelectableIds: number[];
  pagination: GridPagination;
  usersById: Map<number, User>;
  projectConfigSchema: OpenAPIJSONSchema;
  actionData?: Route.ComponentProps["actionData"];
}) {
  const navigate = useNavigate();

  const [showModal, setShowModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    memberIds: number[];
  }>({
    name: "",
    description: "",
    memberIds: [],
  });
  const [configJson, setConfigJson] = useState(DEFAULT_PROJECT_CONFIG_STR);
  const [showBatchEditModal, setShowBatchEditModal] = useState(false);
  const [batchFormData, setBatchFormData] =
    useState<ProjectBulkFormState>(EMPTY_BULK_FORM);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [gridOptions, setGridOptions] = useState<GridOption | undefined>(
    undefined,
  );
  const reactGridRef = useRef<SlickgridReactInstance | null>(null);
  const selectedAllIdsRef = useRef<number[] | null>(null);
  const paginationGridOptions = useRoutePaginationGridOptions(
    pagination,
    dataset,
  );
  const navigation = useNavigation();
  const isBusy = navigation.state !== "idle";

  // Sync grid when dataset prop changes (after revalidation returns fresh data).
  useEffect(() => {
    syncRoutePaginationGrid(reactGridRef.current, pagination);
    if (selectedAllIdsRef.current == null) {
      // The selection addresses rows of the page that was just replaced, so it
      // cannot survive a revalidation or a page change.
      reactGridRef.current?.gridService.setSelectedRows([]);
      setSelectedIds([]);
      return;
    }

    // A whole-list selection outlives the page it started on: the count is
    // re-read for the filter that is now applied and the new page's rows are
    // ticked so the visible state matches what a batch will write.
    selectedAllIdsRef.current = allSelectableIds;
    selectCurrentPageRows();
    setSelectedIds(allSelectableIds);
  }, [dataset, pagination, allSelectableIds]);

  // Handle action results
  useEffect(() => {
    if (actionData) {
      if (actionData.error) {
        setError(actionData.error as string);
      } else if (actionData.success) {
        setShowModal(false);
        setShowBatchEditModal(false);
        setShowDeleteModal(false);
      }
    }
  }, [actionData]);

  const handleCreate = () => {
    setEditingProject(null);
    setFormData({
      name: "",
      description: "",
      memberIds: [],
    });
    setConfigJson(DEFAULT_PROJECT_CONFIG_STR);
    setError(null);
    setShowModal(true);
  };

  const handleEdit = (project: Project) => {
    setEditingProject(project);
    setFormData({
      name: project.name,
      description: project.description ?? "",
      memberIds: project.members.map((m) => m.id),
    });
    setConfigJson(formatProjectConfigText(project.config));
    setError(null);
    setShowModal(true);
  };

  const handleDelete = (project: Project) => {
    setProjectToDelete(project);
    setError(null);
    setShowDeleteModal(true);
  };

  const handleBatchEdit = () => {
    setBatchFormData(EMPTY_BULK_FORM);
    setError(null);
    setShowBatchEditModal(true);
  };

  const selectedProjectsOnPage = dataset.filter((project) =>
    selectedIds.includes(project.id),
  );
  const {
    currentMemberIds,
    droppedMemberIds,
    addedMemberIds,
    wouldRemoveSelf,
    formatMembers,
  } = describeProjectBatchMembers({
    projects: selectedProjectsOnPage,
    accounts: usersById,
    memberIds: batchFormData.memberIds,
    updateMembers: batchFormData.updateMembers,
    currentUserId: user.id,
  });
  const selectionSpansPages =
    selectedIds.length > selectedProjectsOnPage.length;
  const batchFieldsSelected =
    batchFormData.updateDescription ||
    batchFormData.updateConfig ||
    batchFormData.updateMembers;

  const { Filters, SlickgridReact } = SG;
  const isReadonly = !user.roles.includes("project-manager");
  const isDeletionAllowed = user.roles.includes("admin");

  function defineGrid() {
    // `members` is an array, which slickgrid's `Column.field` leaf-path type
    // does not accept, so this display-only column is left unparameterized.
    const membersColumn: Column = {
      id: "members",
      name: "Members",
      field: "members",
      formatter: (
        row,
        cell,
        v: Project["members"],
        columnDef,
        dataContext,
        grid,
      ) => {
        let displayText = "";

        if (v.length > 0) {
          const names = v.map((e) => e.username);
          const [firstName] = names;
          displayText =
            names.length === 1
              ? firstName
              : `${firstName} (+${names.length - 1})`;
        }

        return displayText;
      },
      filterable: true,
      filter: {
        collection: [],
        model: Filters.multipleSelect,
        operator: "IN_COLLECTION",
      },
      sortable: false,
    };

    const cols: Column<Project>[] = [
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
      },
      {
        id: "description",
        name: "Description",
        field: "description",
        type: "string",
        filterable: true,
        sortable: true,
      },
      membersColumn,
    ];

    if (membersColumn.filter) {
      membersColumn.filter.collection = Array.from(usersById.values()).map(
        (m) => ({ value: m.id, label: m.username }),
      );
    }

    const commandItems: MenuCommandItem[] = [
      {
        command: "open",
        title: "Open",
        iconCssClass: "fas fa-paperclip fa-fw",
        action: (_e, args) => {
          void navigate(`/projects/${args.dataContext.id}`);
        },
        itemVisibilityOverride: () => getSelectedCount() === 1,
      },
      {
        command: "edit",
        title: isReadonly ? "View Details" : "Edit Details",
        iconCssClass: isReadonly
          ? "fas fa-info-circle fa-fw"
          : "fas fa-edit fa-fw",
        action: (_e, args) => handleEdit(args.dataContext),
        // A read-only user has no batch command to take its place, and viewing
        // the right-clicked row is not the narrowing the gate exists to stop.
        itemVisibilityOverride: () => isReadonly || getSelectedCount() === 1,
      },
    ];

    if (!isReadonly) {
      commandItems.push({
        command: "batch_edit",
        title: "Batch Edit Details",
        iconCssClass: "fas fa-layer-group fa-fw",
        itemVisibilityOverride: () => getSelectedCount() > 1,
        action: () => handleBatchEdit(),
      });
    }

    if (isDeletionAllowed) {
      commandItems.push({
        command: "delete",
        title: "Delete",
        iconCssClass: "fas fa-trash fa-fw",
        action: (_e, args) => handleDelete(args.dataContext),
        itemVisibilityOverride: () => getSelectedCount() === 1,
      });
    }

    setColumns(cols);
    setGridOptions({
      ...selectableConfig({ commandItems, multiSelect: true }),
      ...paginationGridOptions,
      autoResize: { container: "#grid-container" },
      enableAutoResize: true,
    });
  }

  function getAllSelectedItems(): Project[] {
    return reactGridRef.current?.dataView.getAllSelectedItems() ?? [];
  }

  function getSelectedCount(): number {
    return selectedAllIdsRef.current?.length ?? getAllSelectedItems().length;
  }

  function selectCurrentPageRows() {
    const slickGrid = reactGridRef.current;
    const numFiltered = slickGrid?.dataView.getFilteredItemCount() ?? 0;
    slickGrid?.gridService.setSelectedRows(
      Array.from({ length: numFiltered }, (_, index) => index),
    );
  }

  function onGridStateChanged() {
    const pageIds = getAllSelectedItems().map((project) => project.id);
    if (
      selectedAllIdsRef.current &&
      pageIds.length === dataset.length &&
      dataset.length > 0
    ) {
      setSelectedIds(selectedAllIdsRef.current);
      return;
    }

    selectedAllIdsRef.current = null;
    setSelectedIds(pageIds);
  }

  function onSelectCurrentPage() {
    selectedAllIdsRef.current = null;
    selectCurrentPageRows();
    setSelectedIds(dataset.map((project) => project.id));
  }

  function onSelectAll() {
    selectedAllIdsRef.current = allSelectableIds;
    selectCurrentPageRows();
    setSelectedIds(allSelectableIds);
  }

  function onDeselectAll() {
    selectedAllIdsRef.current = null;
    reactGridRef.current?.gridService.setSelectedRows([]);
    setSelectedIds([]);
  }

  function reactGridReady(reactGrid: SlickgridReactInstance) {
    reactGridRef.current = reactGrid;
  }

  function openProject(project?: Project) {
    if (!project) {
      return;
    }

    void navigate(`/projects/${project.id}`);
  }

  function handleGridDoubleClick(
    event: CustomEvent<{ args?: { dataContext?: Project; row?: number } }>,
  ) {
    const row = event.detail?.args?.row;
    const project =
      event.detail?.args?.dataContext ??
      (typeof row === "number"
        ? reactGridRef.current?.dataView.getItem(row)
        : undefined);

    openProject(project);
  }

  useEffect(() => {
    defineGrid();
  }, [paginationGridOptions]);

  const users = Array.from(usersById.values());

  return (
    <>
      <div className="mb-3 d-flex gap-2">
        <ButtonGroup className="justify-content-start me-auto">
          <Button variant="primary" onClick={handleCreate}>
            Create Project
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
            gridId="projects-grid"
            columns={columns}
            options={gridOptions}
            dataset={dataset}
            onReactGridCreated={(e) => reactGridReady(e.detail)}
            onGridStateChanged={() => onGridStateChanged()}
            onDblClick={handleGridDoubleClick}
          />
        )}
      </div>

      <Modal show={showModal} onHide={() => setShowModal(false)} size="xl">
        <Modal.Header closeButton>
          <Modal.Title>
            {editingProject
              ? isReadonly
                ? "View Project"
                : "Edit Project"
              : "Create Project"}
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
              value={editingProject ? "update" : "create"}
            />
            {editingProject && (
              <>
                <input type="hidden" name="id" value={editingProject.id} />
                <input
                  type="hidden"
                  name="issued_at"
                  value={editingProject.last_edit_at ?? ""}
                />
              </>
            )}
            <input
              type="hidden"
              name="member_ids"
              value={JSON.stringify(formData.memberIds)}
            />

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
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      name: e.target.value,
                    })
                  }
                  title={Name.helperText}
                />
                {!isReadonly && (
                  <Form.Text className="text-muted">
                    {Name.helperText}
                  </Form.Text>
                )}
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Description</Form.Label>
                <Form.Control
                  as="textarea"
                  name="description"
                  rows={5}
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      description: e.target.value,
                    })
                  }
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Members</Form.Label>
                <SelectMultiplePicker
                  items={users.map((u) => ({
                    id: u.id,
                    label: u.username,
                  }))}
                  value={formData.memberIds}
                  onChange={(newIds) =>
                    setFormData((prev) => ({
                      ...prev,
                      memberIds: newIds,
                    }))
                  }
                />
              </Form.Group>

              <ConfigFieldTabs
                label="Configuration"
                name="config"
                text={configJson}
                onTextChange={setConfigJson}
                parse={parseProjectConfigPane}
                format={(value) => JSON.stringify(value, null, 2)}
                emptyValue={DEFAULT_PROJECT_CONFIG}
                schema={projectConfigSchema}
                helperText="Project-wide editor settings. The server keeps only the fields it recognises."
                editor={ProjectConfigFields}
              />
            </fieldset>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              {isReadonly ? "Close" : "Cancel"}
            </Button>
            {!isReadonly && (
              <Button variant="primary" type="submit">
                Save
              </Button>
            )}
          </Modal.Footer>
        </RouterForm>
      </Modal>

      <Modal
        show={showBatchEditModal}
        onHide={() => setShowBatchEditModal(false)}
        size="xl"
      >
        <Modal.Header closeButton>
          <Modal.Title>
            Batch Edit Projects ({selectedIds.length} selected)
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

            <input type="hidden" name="_action" value="batch_update" />
            <input
              type="hidden"
              name="selectedIds"
              value={JSON.stringify(selectedIds)}
            />
            <input
              type="hidden"
              name="member_ids"
              value={JSON.stringify(batchFormData.memberIds)}
            />

            <BatchSection
              label="Update Description"
              name="updateDescription"
              checked={batchFormData.updateDescription}
              onToggle={(checked) =>
                setBatchFormData((prev) => ({
                  ...prev,
                  updateDescription: checked,
                }))
              }
            >
              <Form.Group className="mb-0">
                <Form.Label>Description</Form.Label>
                <Form.Control
                  as="textarea"
                  name="description"
                  rows={3}
                  value={batchFormData.description}
                  onChange={(e) =>
                    setBatchFormData((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                />
                <Form.Text className="text-muted">
                  Replaces the description of every selected project.
                </Form.Text>
              </Form.Group>
            </BatchSection>

            <BatchSection
              label="Update Members"
              name="updateMembers"
              checked={batchFormData.updateMembers}
              onToggle={(checked) =>
                setBatchFormData((prev) => ({
                  ...prev,
                  updateMembers: checked,
                }))
              }
            >
              <Form.Group className="mb-0">
                <Form.Label>Members</Form.Label>
                <SelectMultiplePicker
                  items={users.map((u) => ({
                    id: u.id,
                    label: u.username,
                  }))}
                  value={batchFormData.memberIds}
                  onChange={(newIds) =>
                    setBatchFormData((prev) => ({
                      ...prev,
                      memberIds: newIds,
                    }))
                  }
                />
                <Form.Text className="text-muted">
                  Every selected project ends up with exactly this list, and the
                  same list is applied to all of them.
                </Form.Text>
                {selectionSpansPages ? (
                  <Form.Text className="text-muted d-block">
                    This selection includes projects on other pages. Their
                    current members are not shown here. Any member left out of
                    the new list will be removed from those projects.
                    {!batchFormData.memberIds.includes(user.id) &&
                      " If you are currently a member of one of them, you will lose access to it."}
                  </Form.Text>
                ) : (
                  currentMemberIds.length > 0 && (
                    <Form.Text className="text-muted d-block">
                      Currently assigned: {formatMembers(currentMemberIds)}
                    </Form.Text>
                  )
                )}
                {!selectionSpansPages && droppedMemberIds.length > 0 && (
                  <div className="text-danger small">
                    Removes {formatMembers(droppedMemberIds)} wherever assigned
                    among the selected projects.
                  </div>
                )}
                {!selectionSpansPages && addedMemberIds.length > 0 && (
                  <div className="text-muted small">
                    Adds {formatMembers(addedMemberIds)} wherever absent among
                    the selected projects.
                  </div>
                )}
                {!selectionSpansPages && wouldRemoveSelf && (
                  <div className="text-danger small">
                    You are not in the new list, so this write also takes away
                    your own access to these projects.
                  </div>
                )}
              </Form.Group>
            </BatchSection>

            <BatchSection
              label="Update Configuration"
              name="updateConfig"
              checked={batchFormData.updateConfig}
              onToggle={(checked) =>
                setBatchFormData((prev) => ({
                  ...prev,
                  updateConfig: checked,
                }))
              }
            >
              <ConfigFieldTabs
                label="Configuration"
                name="config"
                rows={8}
                text={batchFormData.configJson}
                onTextChange={(text) =>
                  setBatchFormData((prev) => ({ ...prev, configJson: text }))
                }
                parse={parseProjectConfigPane}
                format={(value) => JSON.stringify(value, null, 2)}
                emptyValue={DEFAULT_PROJECT_CONFIG}
                schema={projectConfigSchema}
                helperText="Replaces the configuration of every selected project. Leave the field as the default to reset them all to it."
                editor={ProjectConfigFields}
              />
            </BatchSection>

            {!batchFieldsSelected && (
              <Alert variant="info">
                Select what you want to update by checking the boxes above.
              </Alert>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={() => setShowBatchEditModal(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={isBusy || !batchFieldsSelected}
            >
              {isBusy ? "Applying…" : `Apply to ${selectedIds.length} Projects`}
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
            <input type="hidden" name="id" value={projectToDelete?.id ?? ""} />

            <p>
              Are you sure you want to delete the project{" "}
              <strong>{projectToDelete?.name}</strong>?
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
              Delete Project
            </Button>
          </Modal.Footer>
        </RouterForm>
      </Modal>
    </>
  );
}

export function HydrateFallback() {
  return <div>Loading projects...</div>;
}

export default function Projects({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const {
    SG,
    user,
    dataset,
    allSelectableIds,
    pagination,
    usersById,
    projectConfigSchema,
    loaderError,
  } = loaderData;

  return createPageContent({
    title: "Projects",
    header: <h1 className="py-2">Projects</h1>,
    main: (
      <ProjectTable
        SG={SG}
        user={user}
        dataset={dataset}
        allSelectableIds={allSelectableIds}
        pagination={pagination}
        usersById={usersById}
        projectConfigSchema={projectConfigSchema}
        actionData={actionData}
      />
    ),
    alerts: loaderError
      ? { error: loaderError }
      : { success: actionData?.success },
  });
}
