import _ from "lodash";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Accordion,
  Alert,
  Breadcrumb,
  Button,
  ButtonGroup,
  Col,
  Form,
  Modal,
  Nav,
  Row,
  Spinner,
} from "react-bootstrap";
import {
  Form as RouterForm,
  redirect,
  useNavigate,
  useNavigation,
  useLocation,
  useRevalidator,
  useRouteLoaderData,
  useSubmit,
} from "react-router";
import type {
  Column,
  GridOption,
  MenuCommandItem,
  SlickgridReactInstance,
} from "slickgrid-react";
import { z } from "zod";

import type { PluginRoutes } from "sta/app/config";

import {
  // The task's assignment lists and each frame's owner arrive as
  // AccountPublicSummary; the grid column and the pickers render id + username.
  type AccountPublicSummary as Account,
  type BranchPermissionLevel,
  type FrameBulkUpdate,
  type FrameCreate,
  type FramePublicWithParents as Frame,
  type FrameUpdate,
  type LabelGroupPublic as LabelGroup,
  type LabelsetBranchPublic as LabelBranch,
  type ProjectPublic as Project,
  type SourceGroupPublic as SourceGroup,
  type TaskPublic as Task,
  type UserPublic as User,
  type WorkType,
  bulkCreateFramesFramesBulkPost,
  bulkDeleteFramesFramesBulkDelete,
  bulkUpdateFramesFramesBulkPatch,
  createFrameFramesPost,
  initBranchLabelRepoInitPost,
  listFrameIdsFramesIdsGet,
  listFramesFramesGet,
  listGroupsSourceGroupsGet,
  listGroupsLabelGroupsGet,
  listBranchesLabelRepoBranchesGet,
  listTaskSourceGroupsEditorTaskSourceGroupsGet,
  readProjectProjectsIdGet,
  readBranchLabelRepoBranchesIdGet,
  readTaskTasksIdGet,
  updateFrameFramesIdPatch,
} from "../../../../client";
import { PartialSTBounds } from "sta/common";
import { BatchSection } from "../../../components/BatchSection";
import { GridSelectionButtons } from "../../../components/GridSelectionButtons";
import { createSlickgridClientLoader } from "../../../components/slickgrid/client";
import { selectableConfig } from "../../../components/slickgrid/options";
import {
  syncRoutePaginationGrid,
  useRoutePaginationGridOptions,
} from "../../../components/slickgrid/pagination";
import { normalizeError } from "../../../errors";
import {
  formatFormError,
  identifierArraySchema,
  identifierSchema,
  submittedBooleanSchema,
} from "../../../forms";
import {
  getGridPaginationRequest,
  getGridStateRequest,
  GRID_PAGE_SIZES,
  loadAuthenticatedSession,
  listGridPage,
  type GridPagination,
  redirectAndCommit,
} from "../../../loaders";
import type { loader as rootLoader } from "../../../root";
import { createPageContent } from "../../../templates";

import type { Route } from "./+types/frames";
import type { SourceLookupData } from "./components";
import {
  buildFramesQuery,
  CLIENT_BULK_CREATE_CHUNK_SIZE,
  CLIENT_BULK_CREATE_THRESHOLD,
  formatCoords,
  formatDateTime,
  frameBatchFormSchema,
  frameCreateFromBounds,
  frameFormSchema,
  getFrameOptionsFromDataset,
  parseOptionalInteger,
  toDateTimeInputValue,
  toDisplayText,
} from "./frame-domain";
import {
  FrameBatchCreateFields,
  FrameFields,
  type FrameFormState,
} from "./frame-form-fields";
import { createSourceMetadataLoader } from "./frame-metadata";
import { Name } from "../../../models/types";

export { buildFramesQuery, mapInBatches } from "./frame-domain";

const TITLES = {
  annotate: "Annotator Frames",
  review: "Reviewer Frames",
} as const;

const REQUIRED_BRANCH_ACCESS = {
  annotate: 2,
  review: 3,
} as const;

const BRANCH_ACCESS_LABELS: Record<BranchPermissionLevel, string> = {
  0: "None",
  1: "Read",
  2: "Write",
  3: "Write Elevated",
  4: "Admin",
};

const frameCreateIdentitySchema = z.object({
  accountId: identifierSchema,
  sourceGroupId: identifierSchema,
  labelBranchId: identifierSchema,
  isComplete: submittedBooleanSchema,
});

type FrameActionData = Route.ComponentProps["actionData"];

export async function loader({ request, params }: Route.LoaderArgs) {
  const authenticated = await loadAuthenticatedSession(request);
  if (authenticated instanceof Response) return authenticated;
  const { session, token, user } = authenticated;

  const projectId = params.projectId;
  if (projectId == null) return redirect("/projects");

  const taskId = params.taskId;
  if (taskId == null) return redirect(`/projects/${projectId}/tasks`);

  const workType: WorkType =
    params.workType === "review" ? "review" : "annotate";

  let project: Project | undefined;
  try {
    const projectRes = await readProjectProjectsIdGet({
      auth: token.access_token,
      path: { id: Number.parseInt(projectId, 10) },
    });
    if (projectRes.error)
      throw projectRes.error instanceof Error
        ? projectRes.error
        : new Error(normalizeError(projectRes.error));

    project = projectRes.data;
  } catch (e) {
    session.flash("error", `Failed to open project (id=${projectId}): ${e}`);
  }
  if (!project) return redirectAndCommit("/", session);

  let task: Task | undefined;
  try {
    const taskRes = await readTaskTasksIdGet({
      auth: token.access_token,
      path: { id: Number.parseInt(taskId, 10) },
    });
    if (taskRes.error)
      throw taskRes.error instanceof Error
        ? taskRes.error
        : new Error(normalizeError(taskRes.error));

    task = taskRes.data;
  } catch (e) {
    session.flash("error", `Failed to open task (id=${taskId}): ${e}`);
  }
  if (!task) return redirectAndCommit(`/projects/${project.id}/tasks`, session);

  const taskIdNum = Number.parseInt(taskId, 10);
  const canFilterFrameAccount = user.roles.includes("project-manager");
  const frameAccountOptions =
    workType === "review" ? task.supervisors : task.annotators;
  const requestedAccountId = parseOptionalInteger(
    new URL(request.url).searchParams.get("account_id"),
  );
  const selectedFrameAccountId = canFilterFrameAccount
    ? frameAccountOptions.some((account) => account.id === requestedAccountId)
      ? requestedAccountId
      : null
    : user.id;

  const url = new URL(request.url);
  const canonicalSearchParams = new URLSearchParams(url.searchParams);
  if (canFilterFrameAccount && selectedFrameAccountId != null) {
    canonicalSearchParams.set("account_id", String(selectedFrameAccountId));
  } else {
    canonicalSearchParams.delete("account_id");
  }
  if (
    canonicalSearchParams.get("account_id") !==
    url.searchParams.get("account_id")
  ) {
    canonicalSearchParams.delete("page");
    canonicalSearchParams.delete("pageSize");
    return redirect(`${url.pathname}?${canonicalSearchParams.toString()}`);
  }

  const emptyPageRequest = getGridPaginationRequest(request);
  const emptyFramesPage = {
    data: [],
    error: undefined,
    pagination: {
      pageNumber: emptyPageRequest.pageNumber,
      pageSize: emptyPageRequest.pageSize,
      pageSizes: [...GRID_PAGE_SIZES],
      totalItems: 0,
    } satisfies GridPagination,
  };
  const framesQuery = buildFramesQuery(getGridStateRequest(request));
  const accountFilterTerms = framesQuery.account_id as string[] | undefined;
  delete framesQuery.account_id;
  // The listing is scoped to the selected account; the grid's account filter
  // can only narrow it, so a filter excluding that account yields no rows.
  const accountFilterMatches =
    selectedFrameAccountId == null ||
    accountFilterTerms == null ||
    accountFilterTerms.includes(String(selectedFrameAccountId));
  const shouldLoadFrames =
    selectedFrameAccountId != null && accountFilterMatches;
  const frameListQuery = {
    task_id: taskIdNum,
    work_type: workType,
    account_id: [selectedFrameAccountId ?? -1],
    ...framesQuery,
  };
  const framesRes = shouldLoadFrames
    ? await listGridPage(request, (pagination) =>
        listFramesFramesGet({
          auth: token.access_token,
          query: { ...frameListQuery, ...pagination },
        }),
      )
    : emptyFramesPage;
  const dataset = framesRes.data ?? [];
  const allFrameIdsRes = shouldLoadFrames
    ? await listFrameIdsFramesIdsGet({
        auth: token.access_token,
        query: frameListQuery,
      })
    : { data: [], error: undefined };
  const allSelectableIds = allFrameIdsRes.data ?? [];

  // The account picker and account column only ever need the accounts assigned
  // to this task, and they are already loaded with the task. Reading the
  // account collection instead broke this page for project managers, who do
  // not hold the administrator role that collection reads now require.
  const accounts = frameAccountOptions;

  const sourceGroupsRes = await listTaskSourceGroupsEditorTaskSourceGroupsGet({
    auth: token.access_token,
    query: { task_id: taskIdNum, work_type: workType },
  });
  const taskSourceGroups = sourceGroupsRes.data ?? [];
  const fallbackSourceGroupsRes =
    taskSourceGroups.length === 0
      ? await listGroupsSourceGroupsGet({ auth: token.access_token })
      : { data: undefined, error: undefined };
  const sourceGroups =
    taskSourceGroups.length > 0
      ? taskSourceGroups
      : (fallbackSourceGroupsRes.data ?? []);

  // Frame creation is not restricted to branches already referenced by this
  // task. Always reload the accessible repository branches so branches added
  // after the task was created are immediately available.
  const labelBranchesRes = await listBranchesLabelRepoBranchesGet({
    auth: token.access_token,
  });
  const labelBranches = labelBranchesRes.data ?? [];

  const labelGroupsRes = canFilterFrameAccount
    ? await listGroupsLabelGroupsGet({ auth: token.access_token })
    : { data: undefined, error: undefined };
  const labelGroups = labelGroupsRes.data ?? [];

  const loaderError =
    framesRes.error ??
    allFrameIdsRes.error ??
    sourceGroupsRes.error ??
    labelBranchesRes.error ??
    fallbackSourceGroupsRes.error ??
    labelGroupsRes.error;

  return {
    project,
    task,
    taskId,
    workType,
    user,
    canFilterFrameAccount,
    selectedFrameAccountId,
    frameAccountOptions,
    dataset,
    pagination: framesRes.pagination,
    allSelectableIds,
    accounts,
    sourceGroups,
    labelBranches,
    labelGroups,
    loaderError,
  };
}

export const clientLoader =
  createSlickgridClientLoader<Route.ClientLoaderArgs>();

export async function action({ request, params }: Route.ActionArgs) {
  const authenticated = await loadAuthenticatedSession(request);
  if (authenticated instanceof Response) return authenticated;
  const { session, token, user } = authenticated;

  const projectId = params.projectId;
  const taskId = params.taskId;
  const requestedWorkType = params.workType;

  if (projectId == null) return redirectAndCommit("/projects", session);
  if (taskId == null)
    return redirectAndCommit(`/projects/${projectId}/tasks`, session);
  if (
    requestedWorkType != null &&
    !["annotate", "review"].includes(requestedWorkType)
  ) {
    return redirectAndCommit(`/projects/${projectId}/tasks/${taskId}`, session);
  }
  const workType: WorkType =
    requestedWorkType === "review" ? "review" : "annotate";

  let project: Project | undefined;
  try {
    const projectRes = await readProjectProjectsIdGet({
      auth: token.access_token,
      path: { id: Number.parseInt(projectId, 10) },
    });
    if (projectRes.error)
      throw projectRes.error instanceof Error
        ? projectRes.error
        : new Error(normalizeError(projectRes.error));

    project = projectRes.data;
  } catch (e) {
    session.flash("error", `Failed to open project (id=${projectId}): ${e}`);
  }
  if (!project) return redirectAndCommit("/", session);

  let task: Task | undefined;
  try {
    const taskRes = await readTaskTasksIdGet({
      auth: token.access_token,
      path: { id: Number.parseInt(taskId, 10) },
    });
    if (taskRes.error)
      throw taskRes.error instanceof Error
        ? taskRes.error
        : new Error(normalizeError(taskRes.error));

    task = taskRes.data;
  } catch (e) {
    session.flash("error", `Failed to open task (id=${taskId}): ${e}`);
  }
  if (!task) return redirectAndCommit(`/projects/${project.id}/tasks`, session);

  const formData = await request.formData();
  const actionType = formData.get("_action");

  if (actionType === "init_label_branch") {
    const parsedGroupId = identifierSchema.safeParse(formData.get("group_id"));
    if (!parsedGroupId.success) return { error: "Repository is required" };

    const accountId = identifierSchema.safeParse(formData.get("account_id"));
    if (!accountId.success) return { error: "Account is required" };
    const eligibleAccounts =
      workType === "review" ? task.supervisors : task.annotators;
    if (!eligibleAccounts.some((account) => account.id === accountId.data)) {
      return { error: "The selected account is not assigned to this task" };
    }

    const nameEntry = formData.get("name");
    const name = (typeof nameEntry === "string" ? nameEntry : "").trim();
    if (!name) return { error: "Branch name is required" };
    if (!Name.regex.test(name)) {
      return { error: `Branch name: ${Name.helperText}` };
    }

    let commitHash: string | null = null;
    const referenceBranchEntry = formData.get("reference_branch_id");
    if (workType === "review" && referenceBranchEntry) {
      const referenceBranchId =
        identifierSchema.safeParse(referenceBranchEntry);
      if (!referenceBranchId.success) {
        return { error: "Reference label branch is invalid" };
      }
      const referenceBranchRes = await readBranchLabelRepoBranchesIdGet({
        auth: token.access_token,
        path: { id: referenceBranchId.data },
      });
      if (!referenceBranchRes.data || referenceBranchRes.error) {
        return { error: "Reference label branch could not be loaded" };
      }
      if (referenceBranchRes.data.group_id !== parsedGroupId.data) {
        return {
          error: "Reference label branch must belong to the task's repository",
        };
      }
      commitHash = referenceBranchRes.data.head_hash;
    }

    const permissions = getInitialBranchPermissions(
      user.id,
      accountId.data,
      workType,
    );
    const res = await initBranchLabelRepoInitPost({
      auth: token.access_token,
      body: {
        group_id: parsedGroupId.data,
        name,
        commit_hash: commitHash,
        perm_lv_by_user_id: permissions,
      },
    });
    if (res.error) return { error: normalizeError(res.error) };
    return { success: "Label branch initialized successfully." };
  }

  if (actionType === "create" || actionType === "update") {
    const hasSTBoundsMulti = formData.has("st_bounds_multi");
    const parsedForm = frameFormSchema.safeParse({
      sourceGroupId: formData.get("source_group_id"),
      labelBranchId: formData.get("label_branch_id"),
      completionOnly: formData.getAll("completion_only"),
      stBoundsMulti: hasSTBoundsMulti
        ? formData.get("st_bounds_multi")
        : undefined,
      minX: formData.get("min_x"),
      minY: formData.get("min_y"),
      minZ: formData.get("min_z"),
      maxX: formData.get("max_x"),
      maxY: formData.get("max_y"),
      maxZ: formData.get("max_z"),
      minTimestamp: formData.get("min_timestamp"),
      maxTimestamp: formData.get("max_timestamp"),
      isComplete: formData.getAll("is_complete"),
    });
    if (!parsedForm.success)
      return {
        error: formatFormError(parsedForm.error, "frame form data"),
      };
    const {
      sourceGroupId: source_group_id,
      labelBranchId: label_branch_id,
      completionOnly,
      stBoundsMulti = [],
    } = parsedForm.data;
    const payload: FrameUpdate = {
      min_x: parsedForm.data.minX,
      min_y: parsedForm.data.minY,
      min_z: parsedForm.data.minZ,
      max_x: parsedForm.data.maxX,
      max_y: parsedForm.data.maxY,
      max_z: parsedForm.data.maxZ,
      min_timestamp: parsedForm.data.minTimestamp,
      max_timestamp: parsedForm.data.maxTimestamp,
      source_group_id,
      label_branch_id,
      is_complete: parsedForm.data.isComplete,
    };

    if (actionType === "update") {
      const parsedFrameId = identifierSchema.safeParse(formData.get("id"));
      if (!parsedFrameId.success)
        return {
          error: formatFormError(parsedFrameId.error, "frame id"),
        };

      const res = await updateFrameFramesIdPatch({
        auth: token.access_token,
        path: { id: parsedFrameId.data },
        body: {
          ...(completionOnly ? { is_complete: payload.is_complete } : payload),
          issued_at: formData.get("issued_at") as string,
        },
      });
      if (res.error) return { error: normalizeError(res.error) };

      return { success: "Frame updated successfully." };
    }

    const parsedAccountId = identifierSchema.safeParse(
      formData.get("account_id"),
    );
    if (!parsedAccountId.success) return { error: "Account is required" };
    const account_id = parsedAccountId.data;
    if (source_group_id == null) return { error: "Source group is required" };
    if (label_branch_id == null) return { error: "Label branch is required" };

    const baseCreate: Omit<
      FrameCreate,
      | "min_x"
      | "min_y"
      | "min_z"
      | "max_x"
      | "max_y"
      | "max_z"
      | "min_timestamp"
      | "max_timestamp"
    > = {
      work_type: workType,
      task_id: task.id,
      account_id,
      source_group_id,
      label_branch_id,
      is_complete: parsedForm.data.isComplete,
      last_viewed_at: null,
    };

    const createBodies =
      stBoundsMulti.length > 0
        ? stBoundsMulti.map((stBounds) =>
            frameCreateFromBounds(stBounds, baseCreate),
          )
        : [
            {
              ...(payload as FrameCreate),
              ...baseCreate,
            },
          ];

    if (hasSTBoundsMulti && stBoundsMulti.length === 0) {
      return { error: "Generate at least one spatiotemporal boundary." };
    }

    const createRes =
      createBodies.length === 1
        ? await createFrameFramesPost({
            auth: token.access_token,
            body: createBodies[0],
          })
        : await bulkCreateFramesFramesBulkPost({
            auth: token.access_token,
            body: createBodies,
          });

    if (createRes.error) {
      return { error: normalizeError(createRes.error) };
    }

    return {
      success:
        createBodies.length === 1
          ? "Frame created successfully."
          : `${createBodies.length} frames created successfully.`,
    };
  }

  if (actionType === "delete") {
    const parsedSelectedIds = identifierArraySchema.safeParse(
      formData.get("selectedIds") ?? "[]",
    );
    if (!parsedSelectedIds.success)
      return {
        error: formatFormError(parsedSelectedIds.error, "selected frame ids"),
      };
    const selectedIds = parsedSelectedIds.data;
    if (selectedIds.length === 0)
      return { error: "Select at least one frame to delete" };

    const res = await bulkDeleteFramesFramesBulkDelete({
      auth: token.access_token,
      body: selectedIds,
    });
    if (res.error) return { error: normalizeError(res.error) };

    return {
      success:
        selectedIds.length === 1
          ? "Frame deleted successfully."
          : `${selectedIds.length} frames deleted successfully.`,
    };
  }

  if (actionType === "batch_update") {
    const parsedForm = frameBatchFormSchema.safeParse({
      selectedIds: formData.get("selectedIds"),
      updateCompletion: formData.getAll("updateCompletion"),
      completion: formData.getAll("completion"),
    });
    if (!parsedForm.success)
      return {
        error: formatFormError(parsedForm.error, "batch frame form data"),
      };
    const { selectedIds, updateCompletion, completion } = parsedForm.data;
    if (!updateCompletion)
      return { error: "Select at least one attribute to update" };

    // One payload for the whole selection, so the dialog's value has to be sent
    // explicitly even when it is `false`: omitting `is_complete` would leave
    // every selected frame as it was instead of clearing it.
    const data: FrameBulkUpdate = { is_complete: completion };
    const res = await bulkUpdateFramesFramesBulkPatch({
      auth: token.access_token,
      body: { ids: selectedIds, data },
    });
    if (res.error) return { error: normalizeError(res.error) };

    return { success: `Updated ${selectedIds.length} frames.` };
  }

  return { error: "Unknown action" };
}

function FrameAccountFilterForm({
  controlId,
  accounts,
  selectedAccountId,
  onAccountValueChange,
}: {
  controlId: string;
  accounts: Account[];
  selectedAccountId: number | null;
  onAccountValueChange?: (value: string) => void;
}) {
  const [accountValue, setAccountValue] = useState(
    selectedAccountId == null ? "" : String(selectedAccountId),
  );
  const navigation = useNavigation();
  const submit = useSubmit();
  const pendingAccountEntry = navigation.formData?.get("account_id");
  const pendingAccountValue =
    (typeof pendingAccountEntry === "string" ? pendingAccountEntry : null) ??
    (navigation.location == null
      ? null
      : new URLSearchParams(navigation.location.search).get("account_id"));
  const isLoadingAccountFrames =
    navigation.state !== "idle" &&
    accountValue !== "" &&
    pendingAccountValue === accountValue;

  return (
    <RouterForm method="get" className="mb-4">
      <Row className="g-3 align-items-end">
        <Col md={12}>
          <Form.Group controlId={controlId}>
            <Form.Label>Account</Form.Label>
            <Form.Select
              name="account_id"
              value={accountValue}
              onChange={(event) => {
                const nextValue = event.currentTarget.value;
                setAccountValue(nextValue);
                onAccountValueChange?.(nextValue);
                const form = event.currentTarget.form;
                if (form != null) {
                  void submit(new FormData(form), {
                    method: "get",
                  });
                }
              }}
            >
              {accounts.length === 0 && (
                <option value="">(No accounts available)</option>
              )}
              {accounts.length > 0 && (
                <option value="">(Select an account...)</option>
              )}
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {String(account.username)}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        </Col>
      </Row>
      {isLoadingAccountFrames && (
        <div
          className="mt-2 d-flex align-items-center text-muted small"
          role="status"
        >
          <Spinner animation="border" size="sm" className="me-2" />
          Loading frames...
        </div>
      )}
    </RouterForm>
  );
}

export function FrameTable({
  SG,
  project,
  task,
  dataset,
  pagination,
  allSelectableIds,
  accounts,
  sourceGroups,
  labelBranches,
  workType,
  actionData,
  user,
  viewOnly = false,
  multiSelect = true,
  containerId,
  loading = false,
  loadingText = "Loading frames...",
  errorMessage,
  sourceLookups = [],
  selectionEnabled = true,
  createAccountId,
}: {
  SG: typeof import("slickgrid-react");
  project: Project;
  task: Task;
  dataset: Frame[];
  pagination: GridPagination;
  allSelectableIds?: number[];
  accounts?: Account[];
  sourceGroups?: SourceGroup[];
  labelBranches?: LabelBranch[];
  workType?: WorkType;
  actionData?: FrameActionData;
  user?: User;
  viewOnly?: boolean;
  multiSelect?: boolean;
  containerId: string;
  loading?: boolean;
  selectionEnabled?: boolean;
  createAccountId?: number | null;
  loadingText?: string;
  errorMessage?: string | null;
  sourceLookups?: readonly SourceLookupData[];
}) {
  const projectUrl = `/projects/${project.id}`;
  const framesUrl = `${projectUrl}/tasks/${task.id}/frames/${workType ?? "annotate"}`;
  const location = useLocation();
  // Mutations on the manager view must retain its account scope. Otherwise a
  // POST to the path-only action URL drops `account_id`, and the page hides
  // the grid while it waits for the manager to select an account again.
  const framesActionUrl = `${framesUrl}${location.search}`;
  const navigate = useNavigate();
  const revalidator = useRevalidator();

  const [showModal, setShowModal] = useState(false);
  const [editingFrame, setEditingFrame] = useState<Frame | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showBatchEditModal, setShowBatchEditModal] = useState(false);
  const [batchFormData, setBatchFormData] = useState({
    updateCompletion: false,
    completion: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectedFrame, setSelectedFrame] = useState<Frame | null>(null);
  const [bulkCreateProgress, setBulkCreateProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [batchStBoundsMulti, setBatchStBoundsMulti] = useState<
    readonly PartialSTBounds[]
  >([]);
  const selectableIds = allSelectableIds ?? dataset.map((item) => item.id);
  const selectedAllIdsRef = useRef<number[] | null>(null);
  // The dialog's preview can only count rows this page holds: a whole-list
  // selection keeps every other page's frames out of `dataset`.
  const selectionSpansPages = selectedIds.length > dataset.length;
  const selectedIdSet = new Set(selectedIds);
  const completeSelectedCount = dataset.filter(
    (frame) => selectedIdSet.has(frame.id) && frame.is_complete,
  ).length;

  const [formData, setFormData] = useState<FrameFormState>({
    accountId: "",
    sourceGroupId: "",
    labelBranchId: "",
    minX: "",
    minY: "",
    minZ: "",
    maxX: "",
    maxY: "",
    maxZ: "",
    minTimestamp: "",
    maxTimestamp: "",
    isComplete: false,
  });
  const reactGridRef = useRef<SlickgridReactInstance | null>(null);
  const selectionEnabledRef = useRef(selectionEnabled);
  const paginationGridOptions = useRoutePaginationGridOptions(
    pagination,
    dataset,
  );

  const { Filters, SlickgridReact } = SG;

  const isProjectManager = user?.roles.includes("project-manager") ?? false;
  const completionOnly = !viewOnly && !isProjectManager;
  const canManageFrames = !viewOnly && isProjectManager;

  const datasetOptions = useMemo(
    () => getFrameOptionsFromDataset(dataset),
    [dataset],
  );
  const taskAccountOptions =
    workType === "review" ? task.supervisors : task.annotators;
  const accountOptions =
    accounts == null ? datasetOptions.accounts : taskAccountOptions;
  const sourceGroupOptions = sourceGroups ?? datasetOptions.sourceGroups;
  const labelBranchOptions = labelBranches ?? datasetOptions.labelBranches;
  const loadSourceMetadata = useMemo(() => createSourceMetadataLoader(), []);

  useEffect(() => {
    selectionEnabledRef.current = selectionEnabled;
  }, [selectionEnabled]);

  useEffect(() => {
    syncRoutePaginationGrid(reactGridRef.current, pagination);
    if (selectedAllIdsRef.current == null) {
      reactGridRef.current?.gridService.setSelectedRows([]);
      setSelectedIds([]);
      setSelectedFrame(null);
      return;
    }

    selectedAllIdsRef.current = selectableIds;
    selectCurrentPageRows();
    setSelectedIds(selectableIds);
    setSelectedFrame(
      selectableIds.length === 1
        ? (dataset.find((item) => item.id === selectableIds[0]) ?? null)
        : null,
    );
  }, [dataset, pagination, allSelectableIds]);

  useEffect(() => {
    if (!actionData) return;

    if (actionData.error) {
      setError(String(actionData.error));
      return;
    }

    if (actionData.success) {
      setShowModal(false);
      setShowDeleteModal(false);
      setShowBatchEditModal(false);
      setError(null);
      setBulkCreateProgress(null);
      reactGridRef.current?.gridService.setSelectedRows([]);
      setSelectedIds([]);
      setSelectedFrame(null);
    }
  }, [actionData]);

  useEffect(() => {
    if (!errorMessage) return;
    setError(errorMessage);
  }, [errorMessage]);

  function defineGrid() {
    const columns: Column<Frame>[] = [
      {
        id: "id",
        name: "ID",
        field: "id",
        type: "integer",
        filterable: true,
        sortable: true,
      },
      ...(isProjectManager
        ? [
            {
              id: "account_id",
              name: "Account",
              field: "account_id",
              formatter: (_row, _cell, _value, _columnDef, dataContext) =>
                toDisplayText(dataContext.account.username),
              filterable: true,
              filter: {
                collection: accountOptions.map((account) => ({
                  value: account.id,
                  label: toDisplayText(account.username),
                })),
                model: Filters.multipleSelect,
                operator: "IN",
              },
              sortable: true,
            } satisfies Column<Frame>,
          ]
        : []),
      {
        id: "source_group_id",
        name: "Source Group",
        field: "source_group_id",
        formatter: (_row, _cell, _value, _columnDef, dataContext) =>
          toDisplayText(dataContext.source_group?.name),
        filterable: true,
        filter: {
          collection: sourceGroupOptions.map((sourceGroup) => ({
            value: sourceGroup.id,
            label: toDisplayText(sourceGroup.name),
          })),
          model: Filters.multipleSelect,
          operator: "IN",
        },
        sortable: true,
      },
      {
        id: "label_branch_id",
        name: "Label Branch",
        field: "label_branch_id",
        formatter: (_row, _cell, _value, _columnDef, dataContext) =>
          dataContext.label_branch?.name ?? "",
        filterable: true,
        filter: {
          collection: labelBranchOptions.map((labelBranch) => ({
            value: labelBranch.id,
            label: labelBranch.name,
          })),
          model: Filters.multipleSelect,
          operator: "IN",
        },
        sortable: true,
      },
      {
        id: "min_coords",
        name: "Min. Coords",
        field: "min_x",
        formatter: (_row, _cell, _value, _columnDef, dataContext) =>
          formatCoords(dataContext, "min"),
      },
      {
        id: "max_coords",
        name: "Max. Coords",
        field: "max_x",
        formatter: (_row, _cell, _value, _columnDef, dataContext) =>
          formatCoords(dataContext, "max"),
      },
      {
        id: "min_timestamp",
        name: "Min. Timestamp",
        field: "min_timestamp",
        type: "date",
        formatter: (_row, _cell, value) =>
          formatDateTime(value as string | null | undefined),
        filterable: true,
        filter: { model: Filters.dateRange },
        sortable: true,
      },
      {
        id: "max_timestamp",
        name: "Max. Timestamp",
        field: "max_timestamp",
        type: "date",
        formatter: (_row, _cell, value) =>
          formatDateTime(value as string | null | undefined),
        filterable: true,
        filter: { model: Filters.dateRange },
        sortable: true,
      },
      {
        id: "last_viewed_at",
        name: "Last Viewed",
        field: "last_viewed_at",
        type: "date",
        formatter: (_row, _cell, value) =>
          formatDateTime(value as string | null | undefined),
        filterable: true,
        filter: { model: Filters.dateRange },
        sortable: true,
      },
      {
        id: "is_complete",
        name: "Complete",
        field: "is_complete",
        formatter: (_row, _cell, value) => (value ? "Yes" : "No"),
        filterable: true,
        filter: {
          collection: [
            { value: true, label: "Yes" },
            { value: false, label: "No" },
          ],
          model: Filters.multipleSelect,
          operator: "IN",
        },
        sortable: true,
      },
    ];

    // Read-only frame lists still need an entry point into the editor.  Keep
    // the Open command available, while reserving mutation commands for the
    // editable table.
    const commandItems: MenuCommandItem[] = [
      {
        command: "open",
        title: "Open",
        iconCssClass: "fas fa-paperclip fa-fw",
        action: (_event, args) => openFrame(args.dataContext),
        itemVisibilityOverride: () => getSelectedCount() === 1,
      },
    ];
    const editableCommandItems: MenuCommandItem[] = viewOnly
      ? []
      : [
          {
            command: "edit",
            title: completionOnly ? "Edit Completion" : "Edit Details",
            iconCssClass: "fas fa-edit fa-fw",
            action: (_event, args) => openFrameModal(args.dataContext),
            itemVisibilityOverride: () => getSelectedCount() === 1,
          },
          {
            command: "batch_edit",
            title: "Batch Edit Details",
            iconCssClass: "fas fa-layer-group fa-fw",
            action: () => handleBatchEdit(),
            // Not manager-only the way `batch_delete` is: completion is what a
            // frame's own account may write, and their listing holds only their
            // rows. Like the batch delete, this must not narrow the selection --
            // the dialog submits the `selectedIds` state.
            itemVisibilityOverride: () => getSelectedCount() > 1,
          },
          ...(canManageFrames
            ? [
                {
                  command: "batch_delete",
                  title: "Batch Delete",
                  iconCssClass: "fas fa-trash fa-fw",
                  // Unlike `delete`, this command must not narrow the selection:
                  // the modal submits the `selectedIds` state that
                  // `onGridStateChanged` keeps in step with the grid.
                  action: () => setShowDeleteModal(true),
                  itemVisibilityOverride: () => getSelectedCount() > 1,
                },
                {
                  command: "delete",
                  title: "Delete",
                  iconCssClass: "fas fa-trash fa-fw",
                  action: (_event: unknown, args: any) => {
                    if (!selectionEnabledRef.current) {
                      return;
                    }

                    if (
                      typeof args.row === "number" &&
                      !getAllSelectedItems().some(
                        (item) => item.id === args.dataContext.id,
                      )
                    ) {
                      reactGridRef.current?.gridService.setSelectedRows([
                        args.row,
                      ]);
                      setSelectedIds([args.dataContext.id]);
                      setSelectedFrame(args.dataContext);
                    }
                    setShowDeleteModal(true);
                  },
                  itemVisibilityOverride: () => getSelectedCount() === 1,
                },
              ]
            : []),
        ];
    commandItems.push(...editableCommandItems);

    const gridOptions: GridOption = {
      ...(selectableConfig({
        commandItems,
        multiSelect,
      }) as unknown as GridOption),
      ...paginationGridOptions,
      enableAutoResize: true,
      autoResize: { container: `#${containerId}` },
      enableContextMenu: commandItems.length > 0,
    };

    return { columns, gridOptions };
  }

  const { columns, gridOptions } = useMemo(
    () => defineGrid(),
    [
      Filters,
      accountOptions,
      sourceGroupOptions,
      labelBranchOptions,
      viewOnly,
      selectionEnabled,
      completionOnly,
      canManageFrames,
      isProjectManager,
      multiSelect,
      paginationGridOptions,
      containerId,
    ],
  );

  function getAllSelectedItems() {
    return reactGridRef.current?.dataView.getAllSelectedItems() ?? [];
  }

  function getSelectedCount(): number {
    return selectedAllIdsRef.current?.length ?? getAllSelectedItems().length;
  }

  function openFrame(frame?: Frame) {
    if (!frame) {
      return;
    }

    void navigate(
      `${projectUrl}/${frame.work_type}?task_id=${task.id}&frame_id=${frame.id}`,
    );
  }

  function handleGridDoubleClick(
    event: CustomEvent<{ args?: { dataContext?: Frame; row?: number } }>,
  ) {
    const row = event.detail?.args?.row;
    const frame =
      event.detail?.args?.dataContext ??
      (typeof row === "number"
        ? reactGridRef.current?.dataView.getItem(row)
        : undefined);

    openFrame(frame);
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
    setSelectedFrame(dataset.length === 1 ? dataset[0] : null);
  }

  function onSelectAll() {
    selectedAllIdsRef.current = selectableIds;
    selectCurrentPageRows();
    setSelectedIds(selectableIds);
    setSelectedFrame(
      selectableIds.length === 1
        ? (dataset.find((item) => item.id === selectableIds[0]) ?? null)
        : null,
    );
  }

  function onDeselectAll() {
    selectedAllIdsRef.current = null;
    reactGridRef.current?.gridService.setSelectedRows([]);
    setSelectedIds([]);
    setSelectedFrame(null);
  }

  function onGridStateChanged() {
    const selectedItems = getAllSelectedItems();
    if (selectedAllIdsRef.current && selectedItems.length === dataset.length) {
      setSelectedIds(selectedAllIdsRef.current);
      setSelectedFrame(
        selectedAllIdsRef.current.length === 1
          ? (selectedItems[0] ?? null)
          : null,
      );
      return;
    }

    selectedAllIdsRef.current = null;
    setSelectedIds(selectedItems.map((item) => item.id));
    setSelectedFrame(selectedItems.length === 1 ? selectedItems[0] : null);
  }

  async function handleFrameFormSubmit(event: FormEvent<HTMLFormElement>) {
    if (
      editingFrame != null ||
      batchStBoundsMulti.length <= CLIENT_BULK_CREATE_THRESHOLD
    ) {
      return;
    }

    event.preventDefault();

    if (workType == null) {
      setError("Cannot create frames because the work type is unavailable.");
      return;
    }

    const submittedFormData = new FormData(event.currentTarget);
    const parsedIdentity = frameCreateIdentitySchema.safeParse({
      accountId: submittedFormData.get("account_id"),
      sourceGroupId: submittedFormData.get("source_group_id"),
      labelBranchId: submittedFormData.get("label_branch_id"),
      isComplete: submittedFormData.getAll("is_complete"),
    });
    if (!parsedIdentity.success) {
      const field = parsedIdentity.error.issues[0]?.path[0];
      if (field === "accountId") {
        setError("Account is required");
      } else if (field === "sourceGroupId") {
        setError("Source group is required");
      } else if (field === "labelBranchId") {
        setError("Label branch is required");
      } else {
        setError(formatFormError(parsedIdentity.error, "frame form data"));
      }
      return;
    }
    const {
      accountId: account_id,
      sourceGroupId: source_group_id,
      labelBranchId: label_branch_id,
      isComplete: is_complete,
    } = parsedIdentity.data;

    const baseCreate: Omit<
      FrameCreate,
      | "min_x"
      | "min_y"
      | "min_z"
      | "max_x"
      | "max_y"
      | "max_z"
      | "min_timestamp"
      | "max_timestamp"
    > = {
      work_type: workType,
      task_id: task.id,
      account_id,
      source_group_id,
      label_branch_id,
      is_complete,
      last_viewed_at: null,
    };
    const createBodies = batchStBoundsMulti.map((stBounds) =>
      frameCreateFromBounds(stBounds, baseCreate),
    );

    setError(null);
    setBulkCreateProgress({ completed: 0, total: createBodies.length });
    let completed = 0;

    try {
      for (
        let start = 0;
        start < createBodies.length;
        start += CLIENT_BULK_CREATE_CHUNK_SIZE
      ) {
        const chunk = createBodies.slice(
          start,
          start + CLIENT_BULK_CREATE_CHUNK_SIZE,
        );
        const result = await bulkCreateFramesFramesBulkPost({
          body: chunk,
        });

        if (result.error) {
          throw new Error(normalizeError(result.error));
        }

        setBulkCreateProgress({
          completed: Math.min(start + chunk.length, createBodies.length),
          total: createBodies.length,
        });
        completed += chunk.length;
      }

      setShowModal(false);
      setBatchStBoundsMulti([]);
      setBulkCreateProgress(null);
      void revalidator.revalidate();
    } catch (error_) {
      const message =
        error_ instanceof Error ? error_.message : "Failed to create frames.";
      setError(
        completed > 0
          ? `${message} ${completed} of ${createBodies.length} frames were created; retry will continue with the remainder.`
          : message,
      );
      if (completed > 0) {
        setBatchStBoundsMulti((bounds) => bounds.slice(completed));
        void revalidator.revalidate();
      }
      setBulkCreateProgress(null);
    }
  }

  function handleBatchEdit() {
    if (!selectionEnabledRef.current) {
      return;
    }

    setBatchFormData({ updateCompletion: false, completion: true });
    setError(null);
    setShowBatchEditModal(true);
  }

  function openFrameModal(frame: Frame | null) {
    if (!selectionEnabledRef.current) {
      return;
    }

    setEditingFrame(frame);
    if (frame == null) {
      setBatchStBoundsMulti([]);
    }
    setFormData({
      accountId: frame
        ? String(frame.account_id)
        : createAccountId == null
          ? ""
          : String(createAccountId),
      sourceGroupId:
        frame?.source_group_id == null ? "" : String(frame.source_group_id),
      labelBranchId:
        frame?.label_branch_id == null ? "" : String(frame.label_branch_id),
      minX: frame?.min_x ?? "",
      minY: frame?.min_y ?? "",
      minZ: frame?.min_z ?? "",
      maxX: frame?.max_x ?? "",
      maxY: frame?.max_y ?? "",
      maxZ: frame?.max_z ?? "",
      minTimestamp: toDateTimeInputValue(frame?.min_timestamp),
      maxTimestamp: toDateTimeInputValue(frame?.max_timestamp),
      isComplete: frame?.is_complete ?? false,
    });
    setError(null);
    setShowModal(true);
  }

  return (
    <>
      {error && (
        <Alert variant="danger" onClose={() => setError(null)} dismissible>
          {error}
        </Alert>
      )}

      {selectionEnabled && multiSelect && (
        <div className="mb-3 d-flex gap-2">
          <ButtonGroup className="justify-content-start me-auto">
            {canManageFrames && (
              <Button
                variant="primary"
                onClick={() => openFrameModal(null)}
                disabled={!selectionEnabled}
              >
                Create Frames
              </Button>
            )}
            <Button
              variant="outline-primary"
              disabled={!selectionEnabled || selectedFrame == null}
              onClick={() => selectedFrame && openFrameModal(selectedFrame)}
            >
              {viewOnly
                ? "View Selected"
                : completionOnly
                  ? "Edit Completion"
                  : "Edit Selected"}
            </Button>
          </ButtonGroup>
          <GridSelectionButtons
            selectedCount={selectedIds.length}
            currentPageCount={dataset.length}
            allSelectableCount={selectableIds.length}
            onSelectCurrentPage={onSelectCurrentPage}
            onSelectAll={onSelectAll}
            onDeselectAll={onDeselectAll}
            disabled={loading}
          />
        </div>
      )}

      {selectionEnabled && (
        <div className="slickgrid-container" id={containerId}>
          {loading ? (
            <div>{loadingText}</div>
          ) : (
            <SlickgridReact
              gridId={`${containerId}-grid`}
              columns={columns}
              options={gridOptions}
              dataset={dataset}
              onDblClick={handleGridDoubleClick}
              onReactGridCreated={(e) => {
                reactGridRef.current = e.detail;
              }}
              onGridStateChanged={() => onGridStateChanged()}
            />
          )}
        </div>
      )}

      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>
            {viewOnly
              ? "View Frame"
              : completionOnly
                ? "Edit Frame Completion"
                : editingFrame
                  ? "Edit Frame"
                  : "Create Frame"}
          </Modal.Title>
        </Modal.Header>

        {viewOnly ? (
          <>
            <Modal.Body>
              <FrameFields
                formData={formData}
                setFormData={setFormData}
                accounts={accountOptions}
                sourceGroups={sourceGroupOptions}
                labelBranches={labelBranchOptions}
                workType={workType}
                editingFrame={editingFrame}
                viewOnly={true}
              />
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="secondary"
                type="button"
                onClick={() => setShowModal(false)}
              >
                Close
              </Button>
            </Modal.Footer>
          </>
        ) : (
          <RouterForm
            action={framesActionUrl}
            method="post"
            onSubmit={(event) => {
              void handleFrameFormSubmit(event);
            }}
          >
            <Modal.Body>
              <input
                type="hidden"
                name="_action"
                value={editingFrame ? "update" : "create"}
              />
              {editingFrame && (
                <>
                  <input type="hidden" name="id" value={editingFrame.id} />
                  <input
                    type="hidden"
                    name="issued_at"
                    value={editingFrame.last_edit_at ?? ""}
                  />
                </>
              )}
              {completionOnly && (
                <input type="hidden" name="completion_only" value="true" />
              )}

              {editingFrame ? (
                <FrameFields
                  formData={formData}
                  setFormData={setFormData}
                  accounts={accountOptions}
                  sourceGroups={sourceGroupOptions}
                  labelBranches={labelBranchOptions}
                  workType={workType}
                  editingFrame={editingFrame}
                  viewOnly={false}
                  completionOnly={completionOnly}
                />
              ) : (
                <FrameBatchCreateFields
                  formData={formData}
                  setFormData={setFormData}
                  createAccountId={createAccountId ?? null}
                  accounts={accountOptions}
                  sourceGroups={sourceGroupOptions}
                  labelBranches={labelBranchOptions}
                  workType={workType}
                  isOpen={showModal && editingFrame == null}
                  batchStBoundsMulti={batchStBoundsMulti}
                  setBatchStBoundsMulti={setBatchStBoundsMulti}
                  sourceLookups={sourceLookups}
                  loadSourceMetadata={loadSourceMetadata}
                />
              )}
            </Modal.Body>
            <Modal.Footer>
              {bulkCreateProgress != null && (
                <span className="text-body-secondary small me-auto">
                  Creating {bulkCreateProgress.completed} of{" "}
                  {bulkCreateProgress.total} frames...
                </span>
              )}
              <Button
                variant="secondary"
                type="button"
                onClick={() => setShowModal(false)}
                disabled={bulkCreateProgress != null}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={
                  (editingFrame == null && batchStBoundsMulti.length === 0) ||
                  bulkCreateProgress != null
                }
              >
                {bulkCreateProgress == null ? "Save" : "Creating..."}
              </Button>
            </Modal.Footer>
          </RouterForm>
        )}
      </Modal>

      {canManageFrames && (
        <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)}>
          <Modal.Header closeButton>
            <Modal.Title>Confirm Delete</Modal.Title>
          </Modal.Header>
          <RouterForm action={framesActionUrl} method="post">
            <Modal.Body>
              <input type="hidden" name="_action" value="delete" />
              <input
                type="hidden"
                name="selectedIds"
                value={JSON.stringify(selectedIds)}
              />
              <p>
                Are you sure you want to delete {selectedIds.length} selected{" "}
                {selectedIds.length === 1 ? "frame" : "frames"}?
              </p>
              <p className="text-muted small">This action cannot be undone.</p>
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="secondary"
                type="button"
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
      )}

      {!viewOnly && (
        <Modal
          show={showBatchEditModal}
          onHide={() => setShowBatchEditModal(false)}
          size="lg"
        >
          <Modal.Header closeButton>
            <Modal.Title>
              Batch Edit Frames ({selectedIds.length} selected)
            </Modal.Title>
          </Modal.Header>
          <RouterForm action={framesActionUrl} method="post">
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

              <BatchSection
                label="Update Completion"
                name="updateCompletion"
                checked={batchFormData.updateCompletion}
                onToggle={(checked) =>
                  setBatchFormData((prev) => ({
                    ...prev,
                    updateCompletion: checked,
                  }))
                }
              >
                <Form.Group className="mb-0">
                  <Form.Label>Complete</Form.Label>
                  <Form.Select
                    name="completion"
                    value={batchFormData.completion ? "true" : "false"}
                    onChange={(event) => {
                      // React clears `currentTarget` once the event is dispatched,
                      // and this updater runs during the next render.
                      const nextValue = event.target.value;
                      setBatchFormData((prev) => ({
                        ...prev,
                        completion: nextValue === "true",
                      }));
                    }}
                  >
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </Form.Select>
                  <Form.Text className="text-muted">
                    Every selected frame ends up in this state, and the same
                    value is applied to all of them.
                  </Form.Text>
                  {selectionSpansPages ? (
                    <Form.Text className="text-muted d-block">
                      This selection includes frames on other pages, so their
                      current state is not counted here.
                    </Form.Text>
                  ) : (
                    <Form.Text className="text-muted d-block">
                      Currently complete: {completeSelectedCount} of{" "}
                      {selectedIds.length}.
                    </Form.Text>
                  )}
                </Form.Group>
              </BatchSection>

              {!batchFormData.updateCompletion && (
                <Alert variant="info">
                  Select what you want to update by checking the box above.
                </Alert>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="secondary"
                type="button"
                onClick={() => setShowBatchEditModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={!batchFormData.updateCompletion}
              >
                Apply to {selectedIds.length}{" "}
                {selectedIds.length === 1 ? "frame" : "frames"}
              </Button>
            </Modal.Footer>
          </RouterForm>
        </Modal>
      )}
    </>
  );
}

export function hasRequiredBranchAccess(
  branches: LabelBranch[],
  accountId: number,
  workType: WorkType,
): boolean {
  const requiredAccess = REQUIRED_BRANCH_ACCESS[workType];
  return branches.some(
    (branch) => (branch.perm_lv_by_user_id[accountId] ?? 0) >= requiredAccess,
  );
}

export function canInitializeLabelBranch(user: User): boolean {
  return user.roles.includes("data-manager");
}

export function getInitialBranchPermissions(
  currentUserId: number,
  selectedAccountId: number,
  workType: WorkType,
): Record<string, BranchPermissionLevel> {
  if (currentUserId === selectedAccountId) {
    return { [currentUserId]: 4 };
  }
  return {
    [selectedAccountId]: REQUIRED_BRANCH_ACCESS[workType],
    [currentUserId]: 4,
  };
}

export function LabelBranchInitializer({
  account,
  currentUser,
  workType,
  labelGroups,
  labelBranches,
}: {
  account: Account;
  currentUser: User;
  workType: WorkType;
  labelGroups: LabelGroup[];
  labelBranches: LabelBranch[];
}) {
  const username = String(account.username);
  const defaultName = `${username}-${workType}`;
  const [selectedGroupId, setSelectedGroupId] = useState(
    String(labelGroups[0]?.id ?? ""),
  );
  const hasAvailableBranch = hasRequiredBranchAccess(
    labelBranches,
    account.id,
    workType,
  );
  const selectedAccessLevel =
    account.id === currentUser.id ? 4 : REQUIRED_BRANCH_ACCESS[workType];
  const referenceBranches = labelBranches.filter(
    (branch) => String(branch.group_id) === selectedGroupId,
  );

  return (
    <Accordion
      key={`${account.id}-${workType}-${hasAvailableBranch ? "available" : "missing"}`}
      defaultActiveKey={hasAvailableBranch ? undefined : "initialize"}
      className="mb-3"
    >
      <Accordion.Item eventKey="initialize">
        <Accordion.Header>Initialize a label branch</Accordion.Header>
        <Accordion.Body>
          <RouterForm method="post">
            <input type="hidden" name="_action" value="init_label_branch" />
            <input type="hidden" name="account_id" value={account.id} />
            <Row className="g-3 align-items-end">
              <Col md={workType === "review" ? 3 : 4}>
                <Form.Group controlId="label-branch-group-id">
                  <Form.Label>
                    Repository<span className="text-danger ms-1">*</span>
                  </Form.Label>
                  <Form.Select
                    name="group_id"
                    required
                    value={selectedGroupId}
                    onChange={(event) => setSelectedGroupId(event.target.value)}
                  >
                    {labelGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {String(group.name)}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={workType === "review" ? 3 : 4}>
                <Form.Group controlId="label-branch-name">
                  <Form.Label>
                    Branch name<span className="text-danger ms-1">*</span>
                  </Form.Label>
                  <Form.Control
                    type="text"
                    name="name"
                    required
                    defaultValue={defaultName}
                    title={Name.helperText}
                  />
                </Form.Group>
              </Col>
              {workType === "review" && (
                <Col md={2}>
                  <Form.Group controlId="label-branch-reference-id">
                    <Form.Label>Reference label branch</Form.Label>
                    <Form.Select name="reference_branch_id" defaultValue="">
                      <option value="">(Empty branch)</option>
                      {referenceBranches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
              )}
              <Col md={2}>
                <Form.Group controlId="label-branch-access-level">
                  <Form.Label>Access level</Form.Label>
                  <Form.Control
                    type="text"
                    value={BRANCH_ACCESS_LABELS[selectedAccessLevel]}
                    disabled
                  />
                </Form.Group>
              </Col>
              <Col md={2}>
                <Button type="submit" variant="primary" className="w-100">
                  Initialize
                </Button>
              </Col>
            </Row>
          </RouterForm>
        </Accordion.Body>
      </Accordion.Item>
    </Accordion>
  );
}

export function HydrateFallback() {
  return <div>Loading frames...</div>;
}

export default function Frames({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const {
    SG,
    project,
    task,
    user,
    canFilterFrameAccount,
    selectedFrameAccountId,
    frameAccountOptions,
    dataset,
    pagination,
    allSelectableIds,
    accounts,
    sourceGroups,
    labelBranches,
    labelGroups,
    workType,
    loaderError,
  } = loaderData;
  const { plugins } = useRouteLoaderData<typeof rootLoader>("root")!;
  const [frameAccountValue, setFrameAccountValue] = useState(
    selectedFrameAccountId == null ? "" : String(selectedFrameAccountId),
  );
  const frameTableLoaded =
    !canFilterFrameAccount ||
    (selectedFrameAccountId != null && frameAccountValue !== "");
  const sourceLookups = useMemo<SourceLookupData[]>(
    () =>
      Object.values(plugins).flatMap((plugin: PluginRoutes) =>
        (plugin.routes.source?.data ?? []).map((route) => ({
          name: route.path,
          title: route.title,
          module: route.module,
        })),
      ),
    [plugins],
  );

  useEffect(() => {
    setFrameAccountValue(
      selectedFrameAccountId == null ? "" : String(selectedFrameAccountId),
    );
  }, [selectedFrameAccountId]);

  const selectedFrameAccount = frameAccountOptions.find(
    (account) => account.id === selectedFrameAccountId,
  );

  return createPageContent({
    title: `${TITLES[workType]} - ${task.name} - ${project.name}`,
    header: (
      <Breadcrumb className="fs-5">
        <Breadcrumb.Item href="/projects">Projects</Breadcrumb.Item>
        <Breadcrumb.Item href={`/projects/${project.id}`}>
          {project.name}
        </Breadcrumb.Item>
        <Breadcrumb.Item active>{task.name}</Breadcrumb.Item>
      </Breadcrumb>
    ),
    main: (
      <>
        <Nav variant="tabs" className="mb-3">
          <Nav.Item>
            <Nav.Link
              href={`/projects/${project.id}/tasks/${task.id}/frames/annotate`}
              active={workType === "annotate"}
            >
              Annotator Frames
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link
              href={`/projects/${project.id}/tasks/${task.id}/frames/review`}
              active={workType === "review"}
            >
              Reviewer Frames
            </Nav.Link>
          </Nav.Item>
        </Nav>
        {canFilterFrameAccount && (
          <FrameAccountFilterForm
            controlId="frames-account-id"
            accounts={frameAccountOptions}
            selectedAccountId={selectedFrameAccountId}
            onAccountValueChange={setFrameAccountValue}
          />
        )}
        {canInitializeLabelBranch(user) &&
          canFilterFrameAccount &&
          selectedFrameAccount != null &&
          labelGroups.length > 0 &&
          frameTableLoaded && (
            <>
              <LabelBranchInitializer
                key={`${selectedFrameAccount.id}-${workType}`}
                account={selectedFrameAccount}
                currentUser={user}
                workType={workType}
                labelGroups={labelGroups}
                labelBranches={labelBranches}
              />
              <hr className="my-3" />
            </>
          )}
        <FrameTable
          SG={SG}
          project={project}
          task={task}
          dataset={dataset}
          pagination={pagination}
          allSelectableIds={allSelectableIds}
          user={user}
          accounts={accounts}
          sourceGroups={sourceGroups}
          labelBranches={labelBranches}
          workType={workType}
          actionData={actionData}
          containerId="frames-grid-container"
          sourceLookups={sourceLookups}
          selectionEnabled={frameTableLoaded}
          createAccountId={selectedFrameAccountId}
        />
      </>
    ),
    alerts: loaderError
      ? { error: loaderError }
      : { success: actionData?.success },
  });
}
