import type { MenuCommandItem } from "@slickgrid-universal/common";
import { useEffect, useRef, useState } from "react";
import { Alert, Breadcrumb, Button, Form, Modal } from "react-bootstrap";
import { Form as RouterForm, redirect, useFetcher } from "react-router";
import type {
  Column,
  GridOption,
  SlickgridReactInstance,
} from "slickgrid-react";

import {
  // The permissions picker renders an account as its username and id, which is
  // all the summary carries; the collection's wider `AccountPublic` assigns
  // into it unchanged.
  type AccountPublicSummary as Account,
  type CommitGraphPublic,
  type BranchPermissionLevel,
  type LabelGroupPublic as LabelGroup,
  type LabelsetBranchPublic as LabelBranch,
  type UserRoles as User,
  deleteBranchLabelRepoBranchesIdDelete,
  initBranchLabelRepoInitPost,
  listAccountsAccountsGet,
  listBranchesLabelRepoBranchesGet,
  readAccountAccountsIdGet,
  readGroupLabelGroupsIdGet,
  readBranchLabelRepoBranchesIdGet,
  readLabelsetGraphEditorLabelsetGraphGet,
  updateBranchLabelRepoBranchesIdPatch,
} from "../../../../client";
import { createSlickgridClientLoader } from "../../../components/slickgrid/client";
import { selectableConfig } from "../../../components/slickgrid/options";
import {
  syncRoutePaginationGrid,
  useRoutePaginationGridOptions,
} from "../../../components/slickgrid/pagination";
import { normalizeError } from "../../../errors";
import {
  applyDateFilterToQuery,
  applyNumericFilterToQuery,
  applySortersToQuery,
  applyTextFilterToQuery,
  getGridStateRequest,
  listGridPage,
  loadAuthenticatedSession,
  parsePositiveInteger,
  type GridPagination,
  type GridQuery,
  type GridStateRequest,
  redirectAndCommit,
} from "../../../loaders";
import { Name } from "../../../models/types";
import { createPageContent } from "../../../templates";

import type { Route } from "./+types/branches";

const BRANCH_PERMISSION_LABELS: Record<BranchPermissionLevel, string> = {
  0: "None",
  1: "Read",
  2: "Write",
  3: "Write Elevated",
  4: "Admin",
};

const BRANCH_PERMISSION_LEVELS: BranchPermissionLevel[] = [0, 1, 2, 3, 4];

type BranchPermissionMap = Record<string, BranchPermissionLevel>;

interface BranchFormData {
  name: string;
  headHash: string;
  checkpointHash: string;
  permissionsByUserId: BranchPermissionMap;
}

function isDataManager(user: User): boolean {
  return user.roles.includes("data-manager");
}

// Only an administrator may read the account collection; the loader uses this
// to decide whether the permissions editor can be offered every account or has
// to derive its list from accounts this caller is already allowed to see.
function isAdministrator(user: User): boolean {
  return user.roles.includes("admin");
}

export function getBranchPermissionLevel(
  branch: LabelBranch,
  user: User,
): BranchPermissionLevel {
  return branch.perm_lv_by_user_id[user.id] ?? 0;
}

// Mirrors the backend can_access_branch: data managers pass via their role;
// other users need the per-branch Admin grant (update and delete share this).
export function canWriteBranch(branch: LabelBranch, user: User): boolean {
  return isDataManager(user) || getBranchPermissionLevel(branch, user) >= 4;
}

// Data managers hold no entry in perm_lv_by_user_id, the backend lets them
// through by role (can_access_branch), so display their effective access
// (Admin) rather than the empty per-branch grant.
export function getEffectiveAccessLevel(
  branch: LabelBranch,
  user: User,
): BranchPermissionLevel {
  return isDataManager(user) ? 4 : getBranchPermissionLevel(branch, user);
}

const BRANCH_SORTABLE_COLUMNS = new Set([
  "id",
  "name",
  "head_hash",
  "checkpoint_hash",
  "last_edit_at",
]);

export function buildBranchesQuery({
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
      case "head_hash":
        applyTextFilterToQuery(query, filter, "head_hash");
        break;
      case "checkpoint_hash":
        applyTextFilterToQuery(query, filter, "checkpoint_hash");
        break;
      case "last_edit_at":
        applyDateFilterToQuery(query, filter, "last_edit_at");
        break;
    }
  }

  applySortersToQuery(query, sorters, BRANCH_SORTABLE_COLUMNS);

  return query;
}

function isCommitGraphPublic(value: unknown): value is CommitGraphPublic {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { nodes?: unknown }).nodes) &&
    Array.isArray((value as { edges?: unknown }).edges)
  );
}

function normalizeCommitGraphs(data: unknown): CommitGraphPublic[] {
  if (Array.isArray(data)) {
    return data.filter(isCommitGraphPublic);
  }
  if (isCommitGraphPublic(data)) {
    return [data];
  }
  return [];
}

function collectCommitHashes(
  branches: LabelBranch[],
  graphs: CommitGraphPublic[],
): string[] {
  const hashes = new Set<string>();

  for (const branch of branches) {
    hashes.add(branch.head_hash);
    if (branch.checkpoint_hash) {
      hashes.add(branch.checkpoint_hash);
    }
  }

  for (const graph of graphs) {
    for (const node of graph.nodes) {
      hashes.add(node.hash);
    }
  }

  return Array.from(hashes).sort((left, right) => left.localeCompare(right));
}

function normalizePermissionsByUserId(
  permLvByUserId:
    | Record<string, BranchPermissionLevel>
    | Record<number, BranchPermissionLevel>
    | null
    | undefined,
  currentUserId: number,
): BranchPermissionMap {
  const permissionsByUserId: BranchPermissionMap = {};

  for (const [userId, permissionLevel] of Object.entries(
    permLvByUserId ?? {},
  )) {
    if (!BRANCH_PERMISSION_LEVELS.includes(permissionLevel)) continue;
    if (permissionLevel === 0) continue;
    permissionsByUserId[String(userId)] = permissionLevel;
  }

  permissionsByUserId[String(currentUserId)] = 4;

  return permissionsByUserId;
}

function parsePermissionsFromFormData(
  value: FormDataEntryValue | null,
  currentUserId: number,
): { permissionsByUserId: BranchPermissionMap; error?: string } {
  const rawValue = (typeof value === "string" ? value : "").trim();
  if (!rawValue) {
    return {
      permissionsByUserId: normalizePermissionsByUserId(
        undefined,
        currentUserId,
      ),
    };
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (typeof parsed !== "object" || parsed == null || Array.isArray(parsed)) {
      return {
        permissionsByUserId: normalizePermissionsByUserId(
          undefined,
          currentUserId,
        ),
        error: "Invalid branch permissions payload",
      };
    }

    const normalized: BranchPermissionMap = {};
    for (const [userId, permissionLevel] of Object.entries(parsed)) {
      const numericPermissionLevel = Number(permissionLevel);
      if (
        !Number.isInteger(numericPermissionLevel) ||
        !BRANCH_PERMISSION_LEVELS.includes(
          numericPermissionLevel as BranchPermissionLevel,
        )
      ) {
        return {
          permissionsByUserId: normalizePermissionsByUserId(
            undefined,
            currentUserId,
          ),
          error: "Invalid branch permission level",
        };
      }
      if (numericPermissionLevel === 0) continue;
      normalized[userId] = numericPermissionLevel as BranchPermissionLevel;
    }

    return {
      permissionsByUserId: normalizePermissionsByUserId(
        normalized,
        currentUserId,
      ),
    };
  } catch {
    return {
      permissionsByUserId: normalizePermissionsByUserId(
        undefined,
        currentUserId,
      ),
      error: "Invalid branch permissions payload",
    };
  }
}

function createEmptyBranchFormData(currentUserId: number): BranchFormData {
  return {
    name: "",
    headHash: "",
    checkpointHash: "",
    permissionsByUserId: normalizePermissionsByUserId(undefined, currentUserId),
  };
}

function PermissionsEditor({
  accounts,
  currentUserId,
  permissionsByUserId,
  viewOnly,
  onChange,
}: {
  accounts: Account[];
  currentUserId: number;
  permissionsByUserId: BranchPermissionMap;
  viewOnly: boolean;
  onChange: (permissionsByUserId: BranchPermissionMap) => void;
}) {
  function setPermissionLevel(
    accountId: number,
    permissionLevel: BranchPermissionLevel,
  ) {
    const userId = String(accountId);
    const nextPermissions = { ...permissionsByUserId };

    if (accountId === currentUserId) {
      nextPermissions[userId] = 4;
      onChange(nextPermissions);
      return;
    }

    if (permissionLevel === 0) {
      delete nextPermissions[userId];
    } else {
      nextPermissions[userId] = permissionLevel;
    }

    nextPermissions[String(currentUserId)] = 4;
    onChange(nextPermissions);
  }

  return (
    <Form.Group className="mb-0">
      <Form.Label>Permissions</Form.Label>
      <div
        className="border rounded p-3"
        style={{ maxHeight: "280px", overflowY: "auto" }}
      >
        <div className="small text-muted mb-3">
          Set branch access per user. Your account stays `Admin` while editing
          this branch.
        </div>

        {accounts.map((account) => {
          const isCurrentUser = account.id === currentUserId;
          const permissionLevel = isCurrentUser
            ? 4
            : (permissionsByUserId[String(account.id)] ?? 0);

          return (
            <div
              key={account.id}
              className="d-flex align-items-center gap-3 mb-2"
            >
              <div className="flex-grow-1">
                <div>{String(account.username)}</div>
                <div className="small text-muted">User ID: {account.id}</div>
              </div>
              <Form.Select
                value={String(permissionLevel)}
                disabled={viewOnly || isCurrentUser}
                onChange={(event) =>
                  setPermissionLevel(
                    account.id,
                    Number.parseInt(
                      event.target.value,
                      10,
                    ) as BranchPermissionLevel,
                  )
                }
                style={{ maxWidth: "180px" }}
              >
                {BRANCH_PERMISSION_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {BRANCH_PERMISSION_LABELS[level]}
                  </option>
                ))}
              </Form.Select>
            </div>
          );
        })}
      </div>
    </Form.Group>
  );
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const authenticated = await loadAuthenticatedSession(request);
  if (authenticated instanceof Response) return authenticated;
  const { session, token, user } = authenticated;

  const groupId = parsePositiveInteger(params.groupId);
  if (groupId == null) {
    return redirect("/label/repos");
  }

  const isAdmin = isAdministrator(user);
  const [groupRes, branchesRes, collectionRes] = await Promise.all([
    readGroupLabelGroupsIdGet({
      auth: token.access_token,
      path: { id: groupId },
    }),
    listGridPage(request, (pagination) =>
      listBranchesLabelRepoBranchesGet({
        auth: token.access_token,
        query: {
          group_id: groupId,
          ...buildBranchesQuery(getGridStateRequest(request)),
          ...pagination,
        },
      }),
    ),
    // Reading the account collection is an administrator-only operation, so
    // the request is issued only for a caller that holds ADMIN. It never 403s,
    // and it stays off the critical path for every other role.
    isAdmin
      ? listAccountsAccountsGet({ auth: token.access_token })
      : Promise.resolve(undefined),
  ]);
  if (!groupRes.data || groupRes.error) {
    session.flash(
      "error",
      `Failed to open repository (group id=${params.groupId}).`,
    );
    return redirectAndCommit("/label/repos", session);
  }

  const dataset = branchesRes.data ?? [];

  // The permissions editor has to offer a user who holds no grant anywhere yet
  // -- a first grant is precisely that case -- so an administrator keeps the
  // whole account collection as the picker's universe. Every other role that
  // manages branches (data managers, and holders of a per-branch Admin grant)
  // is served from the accounts it may already see: this repository's existing
  // grantees plus the caller, whom the editor pins to Admin. Those ids are
  // resolved through individual account reads, which any authenticated user may
  // perform; for an administrator the collection already covers them, so the
  // extra reads narrow to whatever ids it did not return.
  const granteeIds = [
    ...new Set([
      user.id,
      ...dataset.flatMap((branch) =>
        Object.keys(branch.perm_lv_by_user_id).map(Number),
      ),
    ]),
  ].filter((id) => Number.isInteger(id) && id > 0);

  const accountsById = new Map<number, Account>(
    (collectionRes?.data ?? []).map((account) => [account.id, account]),
  );
  const unresolvedGranteeIds = isAdmin
    ? granteeIds.filter((id) => !accountsById.has(id))
    : granteeIds;
  const granteeRes = await Promise.all(
    unresolvedGranteeIds.map((id) =>
      readAccountAccountsIdGet({
        auth: token.access_token,
        path: { id },
      }),
    ),
  );
  for (const res of granteeRes) {
    if (res.data) accountsById.set(res.data.id, res.data);
  }

  const accounts = [...accountsById.values()].sort((left, right) =>
    String(left.username).localeCompare(String(right.username)),
  );
  // A grant held by an account that no longer exists stays invisible rather
  // than failing the page, but any other refusal is reported.
  const unreadableAccountErrors = granteeRes
    .filter((res) => !res.data && res.response?.status !== 404)
    .map((res) => res.error);

  const loaderError =
    [branchesRes.error, collectionRes?.error, ...unreadableAccountErrors]
      .filter(Boolean)
      .map(normalizeError)
      .join("\n") || undefined;

  return {
    user,
    group: groupRes.data,
    dataset,
    pagination: branchesRes.pagination,
    accounts,
    loaderError,
  };
}

export const clientLoader =
  createSlickgridClientLoader<Route.ClientLoaderArgs>();

export async function action({ request, params }: Route.ActionArgs) {
  const authenticated = await loadAuthenticatedSession(request);
  if (authenticated instanceof Response) return authenticated;
  const { token, user } = authenticated;

  const groupId = parsePositiveInteger(params.groupId);
  if (groupId == null) {
    return { error: "Repository is required" };
  }

  const formData = await request.formData();
  const actionType = formData.get("_action");

  if (actionType === "commit_hashes") {
    const branchesRes = await listBranchesLabelRepoBranchesGet({
      auth: token.access_token,
      query: { group_id: groupId },
    });
    if (branchesRes.error) return { error: normalizeError(branchesRes.error) };
    const branches = branchesRes.data ?? [];
    const graphs: CommitGraphPublic[] = [];
    const concurrency = 8;
    for (let start = 0; start < branches.length; start += concurrency) {
      const results = await Promise.all(
        branches.slice(start, start + concurrency).map((branch) =>
          readLabelsetGraphEditorLabelsetGraphGet({
            auth: token.access_token,
            query: { label_branch_id: branch.id },
          }),
        ),
      );
      for (const result of results) {
        if (result.error) return { error: normalizeError(result.error) };
        graphs.push(...normalizeCommitGraphs(result.data));
      }
    }
    return { commitHashOptions: collectCommitHashes(branches, graphs) };
  }

  if (actionType === "create" || actionType === "update") {
    const nameEntry = formData.get("name");
    const name = (typeof nameEntry === "string" ? nameEntry : "").trim();
    const headHashEntry = formData.get("head_hash");
    const headHash = (
      typeof headHashEntry === "string" ? headHashEntry : ""
    ).trim();
    const checkpointHashEntry = formData.get("checkpoint_hash");
    const checkpointHash = (
      typeof checkpointHashEntry === "string" ? checkpointHashEntry : ""
    ).trim();
    const permissionsResult = parsePermissionsFromFormData(
      formData.get("perm_lv_by_user_id"),
      user.id,
    );

    if (!name) {
      return { error: "Branch name is required" };
    }
    if (!Name.regex.test(name)) {
      return { error: `Branch name: ${Name.helperText}` };
    }
    if (permissionsResult.error) {
      return { error: permissionsResult.error };
    }

    if (actionType === "create") {
      const res = await initBranchLabelRepoInitPost({
        auth: token.access_token,
        body: {
          group_id: groupId,
          name,
          commit_hash: headHash || null,
          perm_lv_by_user_id: permissionsResult.permissionsByUserId,
        },
      });
      if (res.error) {
        return { error: normalizeError(res.error) };
      }

      return { success: "Branch created successfully." };
    }

    const branchIdEntry = formData.get("id");
    const branchId = Number.parseInt(
      typeof branchIdEntry === "string" ? branchIdEntry : "",
      10,
    );
    if (!Number.isInteger(branchId)) {
      return { error: "Branch id is required" };
    }

    const currentBranch = await readBranchLabelRepoBranchesIdGet({
      auth: token.access_token,
      path: { id: branchId },
    });
    if (!currentBranch.data || currentBranch.error) {
      return {
        error:
          currentBranch.error != null
            ? normalizeError(currentBranch.error)
            : "Failed to load existing branch state",
      };
    }

    const res = await updateBranchLabelRepoBranchesIdPatch({
      auth: token.access_token,
      path: { id: branchId },
      body: {
        issued_at: formData.get("issued_at") as string,
        name,
        head_hash: currentBranch.data.head_hash,
        checkpoint_hash: checkpointHash || null,
        perm_lv_by_user_id: permissionsResult.permissionsByUserId,
      },
    });
    if (res.error) {
      return { error: normalizeError(res.error) };
    }

    return { success: "Branch updated successfully." };
  }

  if (actionType === "delete") {
    const branchIdEntry = formData.get("id");
    const branchId = Number.parseInt(
      typeof branchIdEntry === "string" ? branchIdEntry : "",
      10,
    );
    if (!Number.isInteger(branchId)) {
      return { error: "Branch id is required" };
    }

    const res = await deleteBranchLabelRepoBranchesIdDelete({
      auth: token.access_token,
      path: { id: branchId },
    });
    if (res.error) {
      return { error: normalizeError(res.error) };
    }

    return { success: "Branch deleted successfully." };
  }

  return { error: "Unknown action" };
}

function BranchTable({
  SG,
  user,
  group,
  dataset,
  pagination,
  accounts,
  actionData,
}: {
  SG: typeof import("slickgrid-react");
  user: User;
  group: LabelGroup;
  dataset: LabelBranch[];
  pagination: GridPagination;
  accounts: Account[];
  actionData?: Route.ComponentProps["actionData"];
}) {
  const [showModal, setShowModal] = useState(false);
  const hashFetcher = useFetcher<{
    commitHashOptions?: string[];
    error?: string;
  }>();
  const commitHashOptions = hashFetcher.data?.commitHashOptions ?? [];
  const [editingBranch, setEditingBranch] = useState<LabelBranch | null>(null);
  const [formData, setFormData] = useState<BranchFormData>(
    createEmptyBranchFormData(user.id),
  );
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [branchToDelete, setBranchToDelete] = useState<LabelBranch | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [gridOptions, setGridOptions] = useState<GridOption | undefined>(
    undefined,
  );
  const reactGridRef = useRef<SlickgridReactInstance | null>(null);
  const paginationGridOptions = useRoutePaginationGridOptions(
    pagination,
    dataset,
  );
  const userIsDataManager = isDataManager(user);

  useEffect(() => {
    syncRoutePaginationGrid(reactGridRef.current, pagination);
  }, [dataset, pagination]);

  useEffect(() => {
    if (!actionData) return;
    if (actionData.error) {
      setError(actionData.error);
      return;
    }
    if (actionData.success) {
      setShowModal(false);
      setShowDeleteModal(false);
      setEditingBranch(null);
      setBranchToDelete(null);
      setError(null);
    }
  }, [actionData]);

  const { Filters, SlickgridReact } = SG;

  function openCreateModal() {
    setEditingBranch(null);
    setFormData(createEmptyBranchFormData(user.id));
    setError(null);
    setShowModal(true);
    if (hashFetcher.state === "idle" && hashFetcher.data == null) {
      void hashFetcher.submit({ _action: "commit_hashes" }, { method: "post" });
    }
  }

  function openBranchModal(branch: LabelBranch) {
    setEditingBranch(branch);
    setFormData({
      name: branch.name,
      headHash: branch.head_hash,
      checkpointHash: branch.checkpoint_hash ?? "",
      permissionsByUserId: normalizePermissionsByUserId(
        branch.perm_lv_by_user_id,
        user.id,
      ),
    });
    setError(null);
    setShowModal(true);
  }

  function closeBranchModal() {
    setShowModal(false);
    setEditingBranch(null);
    setError(null);
  }

  function openDeleteModal(branch: LabelBranch) {
    setBranchToDelete(branch);
    setError(null);
    setShowDeleteModal(true);
  }

  function closeDeleteModal() {
    setShowDeleteModal(false);
    setBranchToDelete(null);
    setError(null);
  }

  useEffect(() => {
    defineGrid();
  }, [user, paginationGridOptions]);

  function defineGrid() {
    const cols: Column<LabelBranch>[] = [
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
        id: "head_hash",
        name: "Head Hash",
        field: "head_hash",
        type: "string",
        filterable: true,
        sortable: true,
      },
      {
        id: "checkpoint_hash",
        name: "Checkpoint Hash",
        field: "checkpoint_hash",
        type: "string",
        filterable: true,
        sortable: true,
      },
      {
        id: "permission",
        name: "Your Access",
        field: "id",
        type: "string",
        filterable: false,
        sortable: false,
        formatter: (_row, _cell, _value, _columnDef, dataContext) =>
          BRANCH_PERMISSION_LABELS[getEffectiveAccessLevel(dataContext, user)],
      },
      {
        id: "last_edit_at",
        name: "Last Edited",
        field: "last_edit_at",
        type: "string",
        filterable: true,
        filter: { model: Filters.dateRange },
        sortable: true,
      },
    ];

    const commandItems: MenuCommandItem[] = [
      {
        command: "edit",
        title: "Edit Details",
        iconCssClass: "fas fa-edit fa-fw",
        itemVisibilityOverride: (args) =>
          canWriteBranch(args.dataContext, user),
        action: (_e, args) => openBranchModal(args.dataContext),
      },
      {
        command: "view",
        title: "View Details",
        iconCssClass: "fas fa-info-circle fa-fw",
        itemVisibilityOverride: (args) =>
          !canWriteBranch(args.dataContext, user),
        action: (_e, args) => openBranchModal(args.dataContext),
      },
    ];

    commandItems.push({
      command: "delete",
      title: "Delete",
      iconCssClass: "fas fa-trash fa-fw",
      itemVisibilityOverride: (args) => canWriteBranch(args.dataContext, user),
      action: (_e, args) => openDeleteModal(args.dataContext),
    });

    setColumns(cols);
    setGridOptions({
      ...(selectableConfig({
        commandItems,
        multiSelect: false,
      }) as unknown as GridOption),
      ...paginationGridOptions,
      autoResize: { container: "#grid-container" },
      enableAutoResize: true,
    });
  }

  function reactGridReady(reactGrid: SlickgridReactInstance) {
    reactGridRef.current = reactGrid;
  }

  const isReadonly = editingBranch
    ? !canWriteBranch(editingBranch, user)
    : false;
  const currentPermission = editingBranch
    ? BRANCH_PERMISSION_LABELS[getEffectiveAccessLevel(editingBranch, user)]
    : null;

  return (
    <>
      {userIsDataManager && (
        <div className="mb-3">
          <Button variant="primary" onClick={openCreateModal}>
            Create Branch
          </Button>
        </div>
      )}

      <div className="slickgrid-container" id="grid-container">
        {gridOptions && (
          <SlickgridReact
            gridId="repositoryBranches-grid"
            columns={columns}
            options={gridOptions}
            dataset={dataset}
            onReactGridCreated={(e) => reactGridReady(e.detail)}
          />
        )}
      </div>

      <Modal show={showModal} onHide={closeBranchModal} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>
            {editingBranch == null
              ? "Create Branch"
              : isReadonly
                ? "View Branch"
                : "Edit Branch"}
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
              name="perm_lv_by_user_id"
              value={JSON.stringify(formData.permissionsByUserId)}
            />

            {editingBranch == null ? (
              <>
                <input type="hidden" name="_action" value="create" />

                <Form.Group className="mb-3">
                  <Form.Label>Repository</Form.Label>
                  <Form.Control
                    type="text"
                    value={String(group.name)}
                    disabled
                  />
                </Form.Group>

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
                    onChange={(event) =>
                      setFormData((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                    title={Name.helperText}
                  />
                  <Form.Text className="text-muted">
                    {Name.helperText}
                  </Form.Text>
                </Form.Group>

                <Form.Group className="mb-0">
                  <Form.Label>Starting Commit Hash</Form.Label>
                  <Form.Control
                    type="text"
                    name="head_hash"
                    value={formData.headHash}
                    list="repository-commit-hashes"
                    autoComplete="off"
                    placeholder={
                      commitHashOptions.length > 0
                        ? "Search or paste a commit hash"
                        : undefined
                    }
                    onChange={(event) =>
                      setFormData((prev) => ({
                        ...prev,
                        headHash: event.target.value,
                      }))
                    }
                  />
                  <Form.Text className="text-muted">
                    {commitHashOptions.length > 0
                      ? `Search among ${commitHashOptions.length} known commit hashes in this repository, or leave blank to initialize a new branch from an empty root commit.`
                      : "Leave blank to initialize a new branch from an empty root commit for this repository."}
                  </Form.Text>
                </Form.Group>

                {commitHashOptions.length > 0 && (
                  <datalist id="repository-commit-hashes">
                    {commitHashOptions.map((hash) => (
                      <option key={hash} value={hash} />
                    ))}
                  </datalist>
                )}

                <PermissionsEditor
                  accounts={accounts}
                  currentUserId={user.id}
                  permissionsByUserId={formData.permissionsByUserId}
                  viewOnly={false}
                  onChange={(permissionsByUserId) =>
                    setFormData((prev) => ({
                      ...prev,
                      permissionsByUserId,
                    }))
                  }
                />
              </>
            ) : (
              <>
                <input type="hidden" name="_action" value="update" />
                <input type="hidden" name="id" value={editingBranch.id} />
                <input
                  type="hidden"
                  name="issued_at"
                  value={editingBranch.last_edit_at ?? ""}
                />

                <fieldset disabled={isReadonly}>
                  <Form.Group className="mb-3">
                    <Form.Label>Branch ID</Form.Label>
                    <Form.Control
                      type="text"
                      value={editingBranch.id}
                      disabled
                    />
                  </Form.Group>

                  <Form.Group className="mb-3">
                    <Form.Label>Repository</Form.Label>
                    <Form.Control
                      type="text"
                      value={String(group.name)}
                      disabled
                    />
                  </Form.Group>

                  <Form.Group className="mb-3">
                    <Form.Label>Your Access</Form.Label>
                    <Form.Control
                      type="text"
                      value={currentPermission ?? ""}
                      disabled
                    />
                  </Form.Group>

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
                      onChange={(event) =>
                        setFormData((prev) => ({
                          ...prev,
                          name: event.target.value,
                        }))
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
                    <Form.Label>
                      Head Hash
                      <span className="text-danger ms-1">*</span>
                    </Form.Label>
                    <Form.Control
                      type="text"
                      value={formData.headHash}
                      disabled={true}
                    />
                  </Form.Group>

                  <Form.Group className="mb-3">
                    <Form.Label>Checkpoint Hash</Form.Label>
                    <Form.Control
                      type="text"
                      name="checkpoint_hash"
                      value={formData.checkpointHash}
                      onChange={(event) =>
                        setFormData((prev) => ({
                          ...prev,
                          checkpointHash: event.target.value,
                        }))
                      }
                    />
                    {!isReadonly && (
                      <Form.Text className="text-muted">
                        Leave blank to clear the checkpoint.
                      </Form.Text>
                    )}
                  </Form.Group>

                  <Form.Group className="mb-0">
                    <Form.Label>Last Edited</Form.Label>
                    <Form.Control
                      type="text"
                      value={editingBranch.last_edit_at ?? ""}
                      disabled
                    />
                  </Form.Group>

                  <div className="mt-3">
                    <PermissionsEditor
                      accounts={accounts}
                      currentUserId={user.id}
                      permissionsByUserId={formData.permissionsByUserId}
                      viewOnly={false}
                      onChange={(permissionsByUserId) =>
                        setFormData((prev) => ({
                          ...prev,
                          permissionsByUserId,
                        }))
                      }
                    />
                  </div>
                </fieldset>
              </>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={closeBranchModal}>
              {editingBranch == null
                ? "Cancel"
                : isReadonly
                  ? "Close"
                  : "Cancel"}
            </Button>
            {(editingBranch == null || !isReadonly) && (
              <Button variant="primary" type="submit">
                Save
              </Button>
            )}
          </Modal.Footer>
        </RouterForm>
      </Modal>

      <Modal show={showDeleteModal} onHide={closeDeleteModal}>
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
            <input type="hidden" name="id" value={branchToDelete?.id ?? ""} />

            <p>
              Are you sure you want to delete the branch{" "}
              <strong>{branchToDelete?.name}</strong>?
            </p>
            <p className="text-muted small">This action cannot be undone.</p>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={closeDeleteModal}>
              Cancel
            </Button>
            <Button variant="danger" type="submit">
              Delete Branch
            </Button>
          </Modal.Footer>
        </RouterForm>
      </Modal>
    </>
  );
}

export function HydrateFallback() {
  return <div>Loading repository branches...</div>;
}

export default function RepositoryBranches({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { SG, user, group, dataset, pagination, accounts, loaderError } =
    loaderData;

  return createPageContent({
    title: `Branches - ${String(group.name)}`,
    header: (
      <Breadcrumb className="fs-5">
        <Breadcrumb.Item href="/label/repos">Repositories</Breadcrumb.Item>
        <Breadcrumb.Item active>{String(group.name)}</Breadcrumb.Item>
      </Breadcrumb>
    ),
    main: (
      <BranchTable
        SG={SG}
        user={user}
        group={group}
        dataset={dataset}
        pagination={pagination}
        accounts={accounts}
        actionData={actionData}
      />
    ),
    alerts: loaderError
      ? { error: loaderError }
      : { success: actionData?.success },
  });
}
