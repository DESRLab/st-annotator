import _ from "lodash";
import { useState, useEffect, useRef } from "react";
import {
  Button,
  ButtonGroup,
  Modal,
  Form,
  Alert,
  Breadcrumb,
} from "react-bootstrap";
import {
  Form as RouterForm,
  useNavigate,
  useFetcher,
  useRevalidator,
} from "react-router";
import type {
  Column,
  GridOption,
  MenuCommandItem,
  SlickgridReactInstance,
} from "slickgrid-react";
import { z } from "zod";

import {
  type ProjectPublic as Project,
  type TaskBulkUpdate,
  type TaskPublic as Task,
  type UserRoles as User,
  createTaskTasksPost,
  deleteTaskTasksIdDelete,
  listTasksTasksGet,
  updateTaskTasksIdPatch,
  readProjectProjectsIdGet,
  listUsersRolesUsersRolesGet,
  bulkUpdateTasksTasksBulkPatch,
} from "../../../client";
import { BatchSection } from "../../components/BatchSection";
import { GridSelectionButtons } from "../../components/GridSelectionButtons";
import { SelectMultiplePicker } from "../../components/SelectMultiplePicker";
import { createSlickgridClientLoader } from "../../components/slickgrid/client";
import { treeSelectableConfig } from "../../components/slickgrid/options";
import { normalizeError } from "../../errors";
import {
  formStringSchema,
  formatFormError,
  identifierArraySchema,
  identifierSchema,
  jsonFormValueSchema,
  nullableDateTimeSchema,
  submittedBooleanSchema,
} from "../../forms";
import {
  loadAccessTokenSession,
  loadAuthenticatedSession,
  parsePositiveInteger,
  redirectAndCommit,
} from "../../loaders";
import { Name } from "../../models/types";
import { createPageContent } from "../../templates";

import type { Route } from "./+types/tasks";

const taskFormSchema = z.object({
  name: formStringSchema,
  description: formStringSchema,
  supervisorIds: identifierArraySchema.optional(),
  annotatorIds: identifierArraySchema.optional(),
  deadline: nullableDateTimeSchema,
});
const taskBatchFormSchema = z.object({
  selectedIds: identifierArraySchema,
  updateSupervisors: submittedBooleanSchema,
  updateAnnotators: submittedBooleanSchema,
  supervisorIds: identifierArraySchema,
  annotatorIds: identifierArraySchema,
});
const taskMoveItemsSchema = jsonFormValueSchema(
  z.array(
    z
      .object({
        id: z.number().int().positive(),
        parent_id: z.number().int().positive().nullable(),
      })
      .strict(),
  ),
);

/**
 * Preview of a supervisors/annotators batch write against the current selection.
 *
 * A bulk write replaces each selected task's assignment outright, so the dialog names the
 * accounts it is about to add or take away instead of prefilling a list that would quietly
 * copy one task's roster onto the others. The roster of the selection is a union, because
 * that is the set a single shared list can add to or take away from, and an account the
 * picker does not list is still named from the rows it appears in.
 */
export function describeBatchAssignees({
  tasks,
  accounts,
  role,
  ids,
  enabled,
}: {
  tasks: readonly Task[];
  accounts: ReadonlyMap<number, Pick<User, "username">>;
  role: "supervisors" | "annotators";
  ids: readonly number[];
  enabled: boolean;
}): {
  currentIds: number[];
  droppedIds: number[];
  addedIds: number[];
  format: (idsToFormat: readonly number[]) => string;
} {
  const namesById = new Map<number, string>();
  for (const [id, account] of accounts) {
    namesById.set(id, account.username);
  }
  for (const task of tasks) {
    for (const person of task[role]) {
      namesById.set(person.id, person.username);
    }
  }

  const currentIds = [
    ...new Set(tasks.flatMap((task) => task[role].map((person) => person.id))),
  ];
  const droppedIds = enabled
    ? currentIds.filter((id) => !ids.includes(id))
    : [];
  const addedIds = enabled ? ids.filter((id) => !currentIds.includes(id)) : [];

  return {
    currentIds,
    droppedIds,
    addedIds,
    format: (idsToFormat) =>
      idsToFormat.map((id) => namesById.get(id) ?? `user #${id}`).join(", "),
  };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const authenticated = await loadAuthenticatedSession(request);
  if (authenticated instanceof Response) return authenticated;
  const { session, token, user } = authenticated;

  let project: Project | undefined;
  try {
    const projectId = parsePositiveInteger(params.projectId);
    if (projectId == null) throw new Error("Invalid project id");

    const projectRes = await readProjectProjectsIdGet({
      auth: token.access_token,
      path: { id: projectId },
    });
    if (projectRes.error)
      throw projectRes.error instanceof Error
        ? projectRes.error
        : new Error(normalizeError(projectRes.error));

    project = projectRes.data;
  } catch (e) {
    session.flash(
      "error",
      `Failed to open project (id=${params.projectId}): ${e}`,
    );
  }
  if (!project) return redirectAndCommit("/", session);

  const tasksRes = await listTasksTasksGet({
    auth: token.access_token,
    query: { project_id: project.id },
  });
  const dataset = tasksRes.data ?? [];

  const usersRes = await listUsersRolesUsersRolesGet({
    auth: token.access_token,
  });
  const memberIds = new Set(project.members.map((u) => u.id));
  const membersById = new Map(
    usersRes.data?.filter((u) => memberIds.has(u.id)).map((u) => [u.id, u]),
  );

  const loaderError = tasksRes.error ?? usersRes.error;

  return { user, project, dataset, membersById, loaderError };
}

export const clientLoader =
  createSlickgridClientLoader<Route.ClientLoaderArgs>();

export async function action({ request, params }: Route.ActionArgs) {
  const authenticated = await loadAccessTokenSession(request);
  if (authenticated instanceof Response) return authenticated;
  const { session, token } = authenticated;

  let project: Project | undefined;
  try {
    const projectId = parsePositiveInteger(params.projectId);
    if (projectId == null) throw new Error("Invalid project id");

    const projectRes = await readProjectProjectsIdGet({
      auth: token.access_token,
      path: { id: projectId },
    });
    if (projectRes.error)
      throw projectRes.error instanceof Error
        ? projectRes.error
        : new Error(normalizeError(projectRes.error));

    project = projectRes.data;
  } catch (e) {
    session.flash(
      "error",
      `Failed to open project (id=${params.projectId}): ${e}`,
    );
  }
  if (!project) return redirectAndCommit("/", session);

  const formData = await request.formData();
  const actionType = formData.get("_action");

  if (actionType === "create" || actionType === "update") {
    const parsedForm = taskFormSchema.safeParse({
      name: formData.get("name"),
      description: formData.get("description"),
      supervisorIds: formData.has("supervisor_ids")
        ? formData.get("supervisor_ids")
        : undefined,
      annotatorIds: formData.has("annotator_ids")
        ? formData.get("annotator_ids")
        : undefined,
      deadline: formData.get("deadline"),
    });
    if (!parsedForm.success)
      return {
        error: formatFormError(parsedForm.error, "task form data"),
      };
    const {
      name,
      description,
      supervisorIds: supervisor_ids,
      annotatorIds: annotator_ids,
      deadline,
    } = parsedForm.data;

    // Validation
    if (!name) {
      return { error: "Task name is required" };
    }
    if (!Name.regex.test(name)) {
      return { error: `Invalid task name: ${Name.helperText}` };
    }

    // Submit
    if (actionType === "update") {
      const parsedTaskId = identifierSchema.safeParse(formData.get("id"));
      if (!parsedTaskId.success)
        return {
          error: formatFormError(parsedTaskId.error, "task id"),
        };
      const taskId = parsedTaskId.data;
      const issuedAt = formData.get("issued_at");
      if (typeof issuedAt !== "string")
        return { error: "Task edit timestamp is required" };

      const res = await updateTaskTasksIdPatch({
        auth: token.access_token,
        path: { id: taskId },
        body: {
          issued_at: issuedAt,
          name,
          description,
          // An absent assignment list leaves the task's supervisors/annotators
          // alone, while `[]` replaces it and un-assigns everyone; a
          // permission-gated form renders no assignment input and omits the key.
          ...(supervisor_ids === undefined ? {} : { supervisor_ids }),
          ...(annotator_ids === undefined ? {} : { annotator_ids }),
          deadline,
        },
      });
      if (res.error) {
        return { error: normalizeError(res.error) };
      }

      return { success: "Task updated successfully." };
    } else {
      // actionType == 'create'
      const res = await createTaskTasksPost({
        auth: token.access_token,
        body: {
          project_id: project.id,
          name,
          description,
          ...(supervisor_ids === undefined ? {} : { supervisor_ids }),
          ...(annotator_ids === undefined ? {} : { annotator_ids }),
          deadline,
          parent_id: null,
        },
      });
      if (res.error) {
        return { error: normalizeError(res.error) };
      }

      return { success: "Task created successfully." };
    }
  } else if (actionType === "delete") {
    const parsedTaskId = identifierSchema.safeParse(formData.get("id"));
    if (!parsedTaskId.success)
      return { error: formatFormError(parsedTaskId.error, "task id") };

    // Submit
    const res = await deleteTaskTasksIdDelete({
      auth: token.access_token,
      path: { id: parsedTaskId.data },
    });
    if (res.error) {
      return { error: normalizeError(res.error) };
    }

    return { success: "Task deleted successfully." };
  } else if (actionType === "batch_update") {
    const parsedForm = taskBatchFormSchema.safeParse({
      selectedIds: formData.get("selectedIds"),
      updateSupervisors: formData.getAll("updateSupervisors"),
      updateAnnotators: formData.getAll("updateAnnotators"),
      supervisorIds: formData.get("supervisor_ids"),
      annotatorIds: formData.get("annotator_ids"),
    });
    if (!parsedForm.success)
      return {
        error: formatFormError(parsedForm.error, "batch task form data"),
      };
    const {
      selectedIds,
      updateSupervisors: doUpdateSupervisors,
      updateAnnotators: doUpdateAnnotators,
      supervisorIds,
      annotatorIds,
    } = parsedForm.data;

    if (!doUpdateSupervisors && !doUpdateAnnotators) {
      return { error: "Select at least one attribute to update" };
    }

    const data: TaskBulkUpdate = {};
    if (doUpdateSupervisors) {
      data.supervisor_ids = supervisorIds;
    }
    if (doUpdateAnnotators) {
      data.annotator_ids = annotatorIds;
    }

    const res = await bulkUpdateTasksTasksBulkPatch({
      auth: token.access_token,
      body: { ids: selectedIds, data: data },
    });
    if (res.error) {
      return { error: normalizeError(res.error) };
    }

    return { success: `Updated ${selectedIds.length} tasks.` };
  } else if (actionType === "move") {
    const parsedItems = taskMoveItemsSchema.safeParse(formData.get("items"));
    if (!parsedItems.success)
      return {
        error: formatFormError(parsedItems.error, "task move data"),
      };
    const items = parsedItems.data;

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
        }),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed) {
      return { error: normalizeError(failed.error) };
    }

    return { success: "Tasks moved successfully." };
  }

  return { error: "Unknown action" };
}

function TaskTable({
  SG,
  user,
  project,
  dataset,
  membersById,
  actionData,
}: {
  SG: typeof import("slickgrid-react");
  user: User;
  project: Project;
  dataset: Task[];
  membersById: Map<number, User>;
  actionData?: Route.ComponentProps["actionData"];
}) {
  const navigate = useNavigate();
  const branchPermissionWarnings = dataset.flatMap((task) =>
    (task.branch_permission_warnings ?? []).map(
      (warning) => `${task.name}: ${warning}`,
    ),
  );

  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
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
  const [gridOptions, setGridOptions] = useState<GridOption | undefined>(
    undefined,
  );
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const reactGridRef = useRef<SlickgridReactInstance | null>(null);
  const moveFetcher = useFetcher();
  const revalidator = useRevalidator();

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

  useEffect(() => {
    const result = moveFetcher.data as
      { error?: string; success?: boolean } | undefined;
    if (result?.error) {
      setError(result.error);
      void revalidator.revalidate();
    }
  }, [moveFetcher.data, revalidator]);

  const handleCreate = () => {
    setEditingTask(null);
    setFormData({
      name: "",
      description: "",
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
      description: task.description ?? "",
      supervisorIds: task.supervisors.map((m) => m.id),
      annotatorIds: task.annotators.map((m) => m.id),
      deadline: task.deadline ?? null,
    });
    setError(null);
    setShowModal(true);
  };

  const handleDelete = (task: Task) => {
    setTaskToDelete(task);
    setError(null);
    setShowDeleteModal(true);
  };

  const handleBatchEdit = () => {
    setBatchFormData({
      supervisorIds: [],
      annotatorIds: [],
      updateSupervisors: false,
      updateAnnotators: false,
    });
    setError(null);
    setShowBatchEditModal(true);
  };

  const { Filters, Formatters, SlickgridReact } = SG;
  const isReadonly = !user.roles.includes("project-manager");

  function defineGrid() {
    // `supervisors` is an array, which slickgrid's `Column.field` leaf-path
    // type does not accept, so this display-only column is left unparameterized.
    const supervisorsColumn: Column = {
      id: "supervisors",
      name: "Supervisors",
      field: "supervisors",
      formatter: (
        row,
        cell,
        v: Task["supervisors"],
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
      sortable: true,
    };

    const annotatorsColumn: Column = {
      id: "annotators",
      name: "Annotators",
      field: "annotators",
      formatter: (
        row,
        cell,
        v: Task["annotators"],
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
      sortable: true,
    };

    const cols: Column<Task>[] = [
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
        formatter: (row, cell, value, columnDef, dataContext, grid) => {
          const gridOptions = grid.getOptions();

          const treeLevelPropName =
            gridOptions?.treeDataOptions?.levelPropName ?? "__treeLevel";
          if (value == null || dataContext == null) return "";

          if (!(
            treeLevelPropName in dataContext &&
            typeof (dataContext as unknown as Record<string, unknown>)[
              treeLevelPropName
            ] === "number"
          )) {
            throw new Error("Invalid data context");
          }

          const treeLevel = (dataContext as unknown as Record<string, unknown>)[
            treeLevelPropName
          ] as number;

          const dataView = grid.getData();
          const identifierPropName = dataView.getIdPropertyName() || "id";
          const idx = dataView.getIdxById(
            (dataContext as unknown as Record<string, unknown>)[
              identifierPropName
            ] as number,
          );
          const nextItem = idx == null ? null : dataView.getItemByIdx(idx + 1);

          const icon = '<i class="fas fa-tasks fa-fw" title="Task"></i>';
          const cleanedValue = value
            .toString()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
          const spacer = `<span style="display: inline-block; width: ${15 * treeLevel}px;"></span>`;

          if (
            nextItem &&
            (nextItem as unknown as Record<string, number>)[treeLevelPropName] >
              treeLevel
          ) {
            if (
              (dataContext as unknown as Record<string, unknown>).__collapsed
            ) {
              // This is undefined if the item is at bottom level
              return `${spacer} <span class="slick-group-toggle collapsed" aria-expanded="false" level="${treeLevel}"></span>&nbsp;<span style="vertical-align: top;">${icon}&nbsp;${cleanedValue}</span>`;
            }
            return `${spacer} <span class="slick-group-toggle expanded" aria-expanded="true" level="${treeLevel}"></span>&nbsp;<span style="vertical-align: top;">${icon}&nbsp;${cleanedValue}</span>`;
          }
          return `${spacer} <span class="slick-group-toggle" aria-expanded="false" level="${treeLevel}"></span>&nbsp;<span style="vertical-align: top;">${icon}&nbsp;${cleanedValue}</span>`;
        },
        filterable: true,
        sortable: true,
      },
      supervisorsColumn,
      annotatorsColumn,
      {
        id: "deadline",
        name: "Deadline",
        field: "deadline",
        type: "date",
        formatter: Formatters.dateIso,
        filterable: true,
        filter: {
          model: Filters.dateRange,
        },
        sortable: true,
      },
    ];

    if (supervisorsColumn.filter) {
      const allSupervisors = _.uniqBy(
        dataset.flatMap((e) => e.supervisors),
        (m) => m.id,
      );
      supervisorsColumn.filter.collection = allSupervisors.map((m) => ({
        value: m.id,
        label: m.username,
      }));
    }
    if (annotatorsColumn.filter) {
      const allAnnotators = _.uniqBy(
        dataset.flatMap((e) => e.annotators),
        (m) => m.id,
      );
      annotatorsColumn.filter.collection = allAnnotators.map((m) => ({
        value: m.id,
        label: m.username,
      }));
    }

    const commandItems: MenuCommandItem[] = [
      {
        command: "open",
        title: "Open",
        iconCssClass: "fas fa-paperclip fa-fw",
        action: (_e, args) => {
          void navigate(`/projects/${project.id}/tasks/${args.dataContext.id}`);
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
      ...(!isReadonly
        ? ([
            {
              command: "batch_edit",
              title: "Batch Edit Details",
              iconCssClass: "fas fa-layer-group fa-fw",
              action: () => handleBatchEdit(),
              itemVisibilityOverride: () => getSelectedCount() > 1,
            },
            {
              command: "delete",
              title: "Delete",
              iconCssClass: "fas fa-trash fa-fw",
              action: (_e, args) => handleDelete(args.dataContext),
              itemVisibilityOverride: () => getSelectedCount() === 1,
            },
          ] satisfies MenuCommandItem[])
        : []),
    ];

    setColumns(cols);
    setGridOptions({
      ...treeSelectableConfig({
        commandItems,
        multiSelect: true,
        treeColumnId: "name",
        treeParentPropName: "parent_id",
        canHaveChildren: () => true,
        canMoveRows: () => !isReadonly,
        onUpdate: (items: Task[]) => {
          const moveItems = items.map((t) => ({
            id: t.id,
            parent_id: t.parent_id,
          }));

          void moveFetcher.submit(
            { _action: "move", items: JSON.stringify(moveItems) },
            { method: "post" },
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

  function getSelectedCount(): number {
    return getAllSelectedItems().length;
  }

  function openTask(task?: Task) {
    if (!task) {
      return;
    }

    void navigate(`/projects/${project.id}/tasks/${task.id}`);
  }

  function handleGridDoubleClick(
    event: CustomEvent<{ args?: { dataContext?: Task; row?: number } }>,
  ) {
    const row = event.detail?.args?.row;
    const task =
      event.detail?.args?.dataContext ??
      (typeof row === "number"
        ? reactGridRef.current?.dataView.getItem(row)
        : undefined);

    openTask(task);
  }

  function onSelectCurrentPage() {
    const slickGrid = reactGridRef.current;
    const numFiltered = slickGrid?.dataView.getFilteredItemCount() ?? 0;
    slickGrid?.gridService.setSelectedRows(_.range(numFiltered));
    setSelectedIds(dataset.map((item) => item.id));
  }

  function onSelectAll() {
    onSelectCurrentPage();
  }

  function onDeselectAll(e?: React.MouseEvent) {
    const slickGrid = reactGridRef.current;
    slickGrid?.gridService.setSelectedRows([]);
    setSelectedIds([]);
  }

  function reactGridReady(reactGrid: SlickgridReactInstance) {
    reactGridRef.current = reactGrid;
  }

  function onGridStateChanged() {
    const selectedIds = getAllSelectedItems().map((item) => item.id);
    setSelectedIds(selectedIds);
  }

  useEffect(() => {
    defineGrid();
  }, []);

  const members = Array.from(membersById.values());
  const supervisors = members.filter((a) => a.roles.includes("supervisor"));
  const annotators = members.filter((a) => a.roles.includes("annotator"));

  const selectedTasks = dataset.filter((task) => selectedIds.includes(task.id));
  const supervisorPreview = describeBatchAssignees({
    tasks: selectedTasks,
    accounts: membersById,
    role: "supervisors",
    ids: batchFormData.supervisorIds,
    enabled: batchFormData.updateSupervisors,
  });
  const annotatorPreview = describeBatchAssignees({
    tasks: selectedTasks,
    accounts: membersById,
    role: "annotators",
    ids: batchFormData.annotatorIds,
    enabled: batchFormData.updateAnnotators,
  });

  return (
    <>
      {branchPermissionWarnings.length > 0 && (
        <Alert variant="warning">
          <Alert.Heading>Invalid task branch permissions</Alert.Heading>
          <ul className="mb-0">
            {branchPermissionWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Alert>
      )}
      <div className="mb-3 d-flex gap-2">
        <ButtonGroup className="justify-content-start me-auto">
          <Button variant="primary" onClick={handleCreate}>
            Create Task
          </Button>
        </ButtonGroup>
        <GridSelectionButtons
          selectedCount={selectedIds.length}
          allSelectableCount={dataset.length}
          onSelectAll={onSelectAll}
          onDeselectAll={onDeselectAll}
        />
      </div>

      <div className="slickgrid-container" id="grid-container">
        {gridOptions && (
          <SlickgridReact
            gridId="tasks-grid"
            columns={columns}
            options={gridOptions}
            dataset={dataset}
            onDblClick={handleGridDoubleClick}
            onReactGridCreated={(e) => reactGridReady(e.detail)}
            onGridStateChanged={() => onGridStateChanged()}
          />
        )}
      </div>

      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>
            {editingTask
              ? isReadonly
                ? "View Task"
                : "Edit Task"
              : "Create Task"}
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
              value={editingTask ? "update" : "create"}
            />
            {editingTask && (
              <>
                <input type="hidden" name="id" value={editingTask.id} />
                <input
                  type="hidden"
                  name="issued_at"
                  value={editingTask.last_edit_at ?? ""}
                />
              </>
            )}
            <input
              type="hidden"
              name="supervisor_ids"
              value={JSON.stringify(formData.supervisorIds)}
            />
            <input
              type="hidden"
              name="annotator_ids"
              value={JSON.stringify(formData.annotatorIds)}
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
                <Form.Label>Supervisors</Form.Label>
                <SelectMultiplePicker
                  items={supervisors.map((a) => ({
                    id: a.id,
                    label: a.username,
                  }))}
                  value={formData.supervisorIds}
                  onChange={(newIds) =>
                    setFormData((prev) => ({
                      ...prev,
                      supervisorIds: newIds,
                    }))
                  }
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Annotators</Form.Label>
                <SelectMultiplePicker
                  items={annotators.map((a) => ({
                    id: a.id,
                    label: a.username,
                  }))}
                  value={formData.annotatorIds}
                  onChange={(newIds) =>
                    setFormData((prev) => ({
                      ...prev,
                      annotatorIds: newIds,
                    }))
                  }
                />
                <Form.Text className="text-muted">
                  Label priority is set from top (highest) to bottom (lowest).
                </Form.Text>
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Deadline</Form.Label>
                <Form.Control
                  type="date"
                  name="deadline"
                  value={formData.deadline ?? ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      deadline: e.target.value || null,
                    })
                  }
                />
              </Form.Group>
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
            <input type="hidden" name="id" value={taskToDelete?.id ?? ""} />

            <p>
              Are you sure you want to delete the task{" "}
              <strong>{taskToDelete?.name}</strong>?
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
              Delete Task
            </Button>
          </Modal.Footer>
        </RouterForm>
      </Modal>

      <Modal
        show={showBatchEditModal}
        onHide={() => setShowBatchEditModal(false)}
        size="lg"
      >
        <Modal.Header closeButton>
          <Modal.Title>
            Batch Edit Tasks ({selectedIds.length} selected)
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
              name="supervisor_ids"
              value={JSON.stringify(batchFormData.supervisorIds)}
            />
            <input
              type="hidden"
              name="annotator_ids"
              value={JSON.stringify(batchFormData.annotatorIds)}
            />

            <BatchSection
              label="Update Supervisors"
              name="updateSupervisors"
              checked={batchFormData.updateSupervisors}
              onToggle={(checked) =>
                setBatchFormData((prev) => ({
                  ...prev,
                  updateSupervisors: checked,
                }))
              }
            >
              <Form.Group className="mb-0">
                <Form.Label>Supervisors</Form.Label>
                <SelectMultiplePicker
                  items={supervisors.map((a) => ({
                    id: a.id,
                    label: a.username,
                  }))}
                  value={batchFormData.supervisorIds}
                  onChange={(newIds) =>
                    setBatchFormData((prev) => ({
                      ...prev,
                      supervisorIds: newIds,
                    }))
                  }
                />
                <Form.Text className="text-muted">
                  Every selected task ends up with exactly this list, and the
                  same list is applied to all of them.
                </Form.Text>
                {supervisorPreview.currentIds.length > 0 && (
                  <Form.Text className="text-muted d-block">
                    Currently assigned:{" "}
                    {supervisorPreview.format(supervisorPreview.currentIds)}
                  </Form.Text>
                )}
                {supervisorPreview.droppedIds.length > 0 && (
                  <div className="text-danger small">
                    Removes{" "}
                    {supervisorPreview.format(supervisorPreview.droppedIds)}{" "}
                    from every selected task.
                  </div>
                )}
                {supervisorPreview.addedIds.length > 0 && (
                  <div className="text-muted small">
                    Adds {supervisorPreview.format(supervisorPreview.addedIds)}{" "}
                    to every selected task.
                  </div>
                )}
              </Form.Group>
            </BatchSection>

            <BatchSection
              label="Update Annotators"
              name="updateAnnotators"
              checked={batchFormData.updateAnnotators}
              onToggle={(checked) =>
                setBatchFormData((prev) => ({
                  ...prev,
                  updateAnnotators: checked,
                }))
              }
            >
              <Form.Group className="mb-0">
                <Form.Label>Annotators</Form.Label>
                <SelectMultiplePicker
                  items={annotators.map((a) => ({
                    id: a.id,
                    label: a.username,
                  }))}
                  value={batchFormData.annotatorIds}
                  onChange={(newIds) =>
                    setBatchFormData((prev) => ({
                      ...prev,
                      annotatorIds: newIds,
                    }))
                  }
                />
                <Form.Text className="text-muted">
                  Every selected task ends up with exactly this list, and the
                  same list is applied to all of them.
                </Form.Text>
                {annotatorPreview.currentIds.length > 0 && (
                  <Form.Text className="text-muted d-block">
                    Currently assigned:{" "}
                    {annotatorPreview.format(annotatorPreview.currentIds)}
                  </Form.Text>
                )}
                {annotatorPreview.droppedIds.length > 0 && (
                  <div className="text-danger small">
                    Removes{" "}
                    {annotatorPreview.format(annotatorPreview.droppedIds)} from
                    every selected task.
                  </div>
                )}
                {annotatorPreview.addedIds.length > 0 && (
                  <div className="text-muted small">
                    Adds {annotatorPreview.format(annotatorPreview.addedIds)} to
                    every selected task.
                  </div>
                )}
              </Form.Group>
            </BatchSection>

            {!batchFormData.updateSupervisors &&
              !batchFormData.updateAnnotators && (
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
              disabled={
                !batchFormData.updateSupervisors &&
                !batchFormData.updateAnnotators
              }
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

export default function Tasks({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { SG, user, project, dataset, membersById, loaderError } = loaderData;

  return createPageContent({
    title: `Tasks - ${project.name}`,
    header: (
      <Breadcrumb className="fs-5">
        <Breadcrumb.Item href="/projects">Projects</Breadcrumb.Item>
        <Breadcrumb.Item active>{project.name}</Breadcrumb.Item>
      </Breadcrumb>
    ),
    main: (
      <TaskTable
        SG={SG}
        user={user}
        project={project}
        dataset={dataset}
        membersById={membersById}
        actionData={actionData}
      />
    ),
    alerts: loaderError
      ? { error: loaderError }
      : { success: actionData?.success },
  });
}
