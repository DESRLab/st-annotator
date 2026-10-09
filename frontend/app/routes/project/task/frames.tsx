import _ from 'lodash';
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Alert, Breadcrumb, Button, ButtonGroup, Form, Modal } from 'react-bootstrap';
import { Form as RouterForm, redirect } from "react-router";
import type { Column, GridOption, SlickgridReactInstance } from 'slickgrid-react';
import { z } from 'zod';

import {
  type AccountPublic as Account,
  type FrameCreate,
  type FramePublicWithParents as Frame,
  type FrameUpdate,
  type LabelsetBranchPublic as LabelBranch,
  type ProjectPublic as Project,
  type SourceGroupPublic as SourceGroup,
  type TaskPublic as Task,
  type WorkType,
  createFrameFramesPost,
  deleteFrameFramesIdDelete,
  listAccountsAccountsGet,
  listFramesFramesGet,
  listTaskLabelBranchesEditorTaskLabelBranchesGet,
  listTaskSourceGroupsEditorTaskSourceGroupsGet,
  readProjectProjectsIdGet,
  readTaskTasksIdGet,
  updateFrameFramesIdPatch,
} from '../../../../client';
import { PartialSTBounds } from '../../../../lib/common/lib/spatial';
import { clearUser, getCurrentSession, redirectAndCommit } from "../../../loaders";
import { createPageContent } from "../../../templates";
import { FrameModalForm } from './components';
import type { Route } from "./+types/frames";


const TITLES = {
  annotate: 'Annotator Frames',
  review: 'Reviewer Frames',
} as const;

const BRANCH_HELPER_TEXTS = {
  annotate: 'Annotators should have at least WRITE access.',
  review: 'Reviewers should have at least WRITE_ELEVATED access.',
} as const;

type FrameActionData = Route.ComponentProps['actionData'];

type FrameFormState = {
  accountId: string;
  sourceGroupId: string;
  labelBranchId: string;
  minX: string;
  minY: string;
  minZ: string;
  maxX: string;
  maxY: string;
  maxZ: string;
  minTimestamp: string;
  maxTimestamp: string;
  isComplete: boolean;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return '';

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatCoords(frame: Frame, prefix: 'min' | 'max') {
  const x = frame[`${prefix}_x`];
  const y = frame[`${prefix}_y`];
  const z = frame[`${prefix}_z`];

  return `(${x ?? '—'}, ${y ?? '—'}, ${z ?? '—'})`;
}

function toDisplayText(value: unknown) {
  if (value == null) return '';
  return String(value);
}

function toDateTimeInputValue(value: string | null | undefined) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseNullableInt(value: FormDataEntryValue | null) {
  if (typeof value !== 'string' || value === '') return null;

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseNullableNumber(value: FormDataEntryValue | null) {
  if (typeof value !== 'string' || value === '') return null;

  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseNullableDateTime(value: FormDataEntryValue | null) {
  if (typeof value !== 'string' || value === '') return null;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function parseSTBoundsMulti(value: FormDataEntryValue | null) {
  if (typeof value !== 'string' || value === '') return [] as PartialSTBounds[];

  try {
    const parsed = JSON.parse(value);
    const result = z.array(PartialSTBounds.SCHEMA).safeParse(parsed);
    return result.success ? result.data : [];
  } catch {
    return [] as PartialSTBounds[];
  }
}

function frameCreateFromBounds(
  stBounds: PartialSTBounds,
  base: Omit<FrameCreate, 'min_x' | 'min_y' | 'min_z' | 'max_x' | 'max_y' | 'max_z' | 'min_timestamp' | 'max_timestamp'>,
): FrameCreate {
  return {
    ...base,
    min_x: stBounds.min_coords.x,
    min_y: stBounds.min_coords.y,
    min_z: stBounds.min_coords.z,
    max_x: stBounds.max_coords.x,
    max_y: stBounds.max_coords.y,
    max_z: stBounds.max_coords.z,
    min_timestamp: stBounds.min_timestamp?.toString() ?? null,
    max_timestamp: stBounds.max_timestamp?.toString() ?? null,
  };
}

function getFrameOptionsFromDataset(dataset: Frame[]) {
  return {
    accounts: _.uniqBy(dataset.map((frame) => frame.account), (account) => account.id),
    sourceGroups: _.uniqBy(
      dataset.flatMap((frame) => frame.source_group ? [frame.source_group] : []),
      (sourceGroup) => sourceGroup.id,
    ),
    labelBranches: _.uniqBy(
      dataset.flatMap((frame) => frame.label_branch ? [frame.label_branch] : []),
      (labelBranch) => labelBranch.id,
    ),
  };
}

function FrameFields({
  formData,
  setFormData,
  accounts,
  sourceGroups,
  labelBranches,
  workType,
  editingFrame,
  viewOnly,
}: {
  formData: FrameFormState;
  setFormData: Dispatch<SetStateAction<FrameFormState>>;
  accounts: Account[];
  sourceGroups: SourceGroup[];
  labelBranches: LabelBranch[];
  workType?: WorkType;
  editingFrame: Frame | null;
  viewOnly: boolean;
}) {
  return (
    <>
      <input type="hidden" name="is_complete" value={String(formData.isComplete)} />

      <fieldset disabled={viewOnly}>

      <Form.Group className="mb-3">
        <Form.Label>
          Account
          {!editingFrame && <span className="text-danger ms-1">*</span>}
        </Form.Label>
        <Form.Select
          name="account_id"
          value={formData.accountId}
          required={!editingFrame && !viewOnly}
          disabled={!!editingFrame}
          onChange={(e) => setFormData((prev) => ({ ...prev, accountId: e.target.value }))}
        >
          <option value="">(None)</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>{toDisplayText(account.username)}</option>
          ))}
        </Form.Select>
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Label>
          Source Group
          {!editingFrame && <span className="text-danger ms-1">*</span>}
        </Form.Label>
        <Form.Select
          name="source_group_id"
          value={formData.sourceGroupId}
          required={!editingFrame && !viewOnly}
          onChange={(e) => setFormData((prev) => ({ ...prev, sourceGroupId: e.target.value }))}
        >
          <option value="">(None)</option>
          {sourceGroups.map((sourceGroup) => (
            <option key={sourceGroup.id} value={sourceGroup.id}>{toDisplayText(sourceGroup.name)}</option>
          ))}
        </Form.Select>
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Label>
          Label Branch
          {!editingFrame && <span className="text-danger ms-1">*</span>}
        </Form.Label>
        <Form.Select
          name="label_branch_id"
          value={formData.labelBranchId}
          required={!editingFrame && !viewOnly}
          onChange={(e) => setFormData((prev) => ({ ...prev, labelBranchId: e.target.value }))}
        >
          <option value="">(None)</option>
          {labelBranches.map((labelBranch) => (
            <option key={labelBranch.id} value={labelBranch.id}>{labelBranch.name}</option>
          ))}
        </Form.Select>
        {workType && <Form.Text className="text-muted">{BRANCH_HELPER_TEXTS[workType]}</Form.Text>}
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Label>Min. Coords</Form.Label>
        <div className="row g-2">
          <div className="col-md-4">
            <Form.Control
              type="number"
              step="any"
              name="min_x"
              value={formData.minX}
              onChange={(e) => setFormData((prev) => ({ ...prev, minX: e.target.value }))}
            />
          </div>
          <div className="col-md-4">
            <Form.Control
              type="number"
              step="any"
              name="min_y"
              value={formData.minY}
              onChange={(e) => setFormData((prev) => ({ ...prev, minY: e.target.value }))}
            />
          </div>
          <div className="col-md-4">
            <Form.Control
              type="number"
              step="any"
              name="min_z"
              value={formData.minZ}
              onChange={(e) => setFormData((prev) => ({ ...prev, minZ: e.target.value }))}
            />
          </div>
        </div>
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Label>Max. Coords</Form.Label>
        <div className="row g-2">
          <div className="col-md-4">
            <Form.Control
              type="number"
              step="any"
              name="max_x"
              value={formData.maxX}
              onChange={(e) => setFormData((prev) => ({ ...prev, maxX: e.target.value }))}
            />
          </div>
          <div className="col-md-4">
            <Form.Control
              type="number"
              step="any"
              name="max_y"
              value={formData.maxY}
              onChange={(e) => setFormData((prev) => ({ ...prev, maxY: e.target.value }))}
            />
          </div>
          <div className="col-md-4">
            <Form.Control
              type="number"
              step="any"
              name="max_z"
              value={formData.maxZ}
              onChange={(e) => setFormData((prev) => ({ ...prev, maxZ: e.target.value }))}
            />
          </div>
        </div>
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Label>Min. Timestamp</Form.Label>
        <Form.Control
          type="datetime-local"
          name="min_timestamp"
          value={formData.minTimestamp}
          onChange={(e) => setFormData((prev) => ({ ...prev, minTimestamp: e.target.value }))}
        />
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Label>Max. Timestamp</Form.Label>
        <Form.Control
          type="datetime-local"
          name="max_timestamp"
          value={formData.maxTimestamp}
          onChange={(e) => setFormData((prev) => ({ ...prev, maxTimestamp: e.target.value }))}
        />
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Check
          type="checkbox"
          label="Complete"
          checked={formData.isComplete}
          onChange={(e) => setFormData((prev) => ({ ...prev, isComplete: e.target.checked }))}
        />
      </Form.Group>

      {editingFrame && (
        <Form.Group>
          <Form.Label>Last Viewed</Form.Label>
          <Form.Control value={formatDateTime(editingFrame.last_viewed_at)} disabled />
        </Form.Group>
      )}

      </fieldset>
    </>
  );
}

function FrameBatchCreateFields({
  formData,
  setFormData,
  accounts,
  sourceGroups,
  labelBranches,
  workType,
  isOpen,
  batchStBoundsMulti,
  setBatchStBoundsMulti,
}: {
  formData: FrameFormState;
  setFormData: Dispatch<SetStateAction<FrameFormState>>;
  accounts: Account[];
  sourceGroups: SourceGroup[];
  labelBranches: LabelBranch[];
  workType?: WorkType;
  isOpen: boolean;
  batchStBoundsMulti: ReadonlyArray<PartialSTBounds>;
  setBatchStBoundsMulti: Dispatch<SetStateAction<ReadonlyArray<PartialSTBounds>>>;
}) {
  return (
    <>
      <input type="hidden" name="is_complete" value={String(formData.isComplete)} />

      <Form.Group className="mb-3">
        <Form.Label>
          Account
          <span className="text-danger ms-1">*</span>
        </Form.Label>
        <Form.Select
          name="account_id"
          required
          value={formData.accountId}
          onChange={(e) => setFormData((prev) => ({ ...prev, accountId: e.target.value }))}
        >
          <option value="">(None)</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>{toDisplayText(account.username)}</option>
          ))}
        </Form.Select>
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Label>
          Label Branch
          <span className="text-danger ms-1">*</span>
        </Form.Label>
        <Form.Select
          name="label_branch_id"
          required
          value={formData.labelBranchId}
          onChange={(e) => setFormData((prev) => ({ ...prev, labelBranchId: e.target.value }))}
        >
          <option value="">(None)</option>
          {labelBranches.map((labelBranch) => (
            <option key={labelBranch.id} value={labelBranch.id}>{labelBranch.name}</option>
          ))}
        </Form.Select>
        {workType && <Form.Text className="text-muted">{BRANCH_HELPER_TEXTS[workType]}</Form.Text>}
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Check
          type="checkbox"
          label="Complete"
          checked={formData.isComplete}
          onChange={(e) => setFormData((prev) => ({ ...prev, isComplete: e.target.checked }))}
        />
      </Form.Group>

      <FrameModalForm
        defaultSTBoundsMulti={batchStBoundsMulti}
        isOpen={isOpen}
        onSTBoundsMultiChange={setBatchStBoundsMulti}
        sourceGroups={sourceGroups.map((sourceGroup) => ({
          id: sourceGroup.id,
          name: toDisplayText(sourceGroup.name),
          description: typeof sourceGroup.description === 'string' ? sourceGroup.description : undefined,
        }))}
        sourceLookups={[]}
      />
    </>
  );
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const session = await getCurrentSession(request);
  const token = session.get("token");
  if (!token) {
    clearUser(session);
    session.flash("error", "Your session has expired. Please log in again.");
    return redirectAndCommit("/login", session);
  }

  const projectId = params.projectId;
  if (projectId == null) return redirect("/projects");

  const taskId = params.taskId;
  if (taskId == null) return redirect(`/projects/${projectId}/tasks`);

  const workType: WorkType = params.workType === 'review' ? 'review' : 'annotate';

  let project: Project | undefined;
  try {
    const projectRes = await readProjectProjectsIdGet({
      auth: token.access_token,
      path: { id: Number.parseInt(projectId, 10) },
    });
    if (projectRes.error) throw projectRes.error;

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
    if (taskRes.error) throw taskRes.error;

    task = taskRes.data;
  } catch (e) {
    session.flash("error", `Failed to open task (id=${taskId}): ${e}`);
  }
  if (!task) return redirectAndCommit(`/projects/${project.id}/tasks`, session);

  const taskIdNum = Number.parseInt(taskId, 10);

  const framesRes = await listFramesFramesGet({
    auth: token.access_token,
    query: { task_id: taskIdNum, work_type: workType },
  });
  const dataset = framesRes.data ?? [];

  const accountsRes = await listAccountsAccountsGet({ auth: token.access_token });
  const accounts = accountsRes.data ?? [];

  const sourceGroupsRes = await listTaskSourceGroupsEditorTaskSourceGroupsGet({
    auth: token.access_token,
    query: { task_id: taskIdNum },
  });
  const sourceGroups = sourceGroupsRes.data ?? [];

  const labelBranchesRes = await listTaskLabelBranchesEditorTaskLabelBranchesGet({
    auth: token.access_token,
    query: { task_id: taskIdNum },
  });
  const labelBranches = labelBranchesRes.data ?? [];

  const loaderError = framesRes.error ?? accountsRes.error ?? sourceGroupsRes.error ?? labelBranchesRes.error;

  return { project, task, taskId, workType, dataset, accounts, sourceGroups, labelBranches, loaderError };
}

export async function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
  const loaderData = await serverLoader();
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

  const projectId = params.projectId;
  const taskId = params.taskId;
  const workType = params.workType as WorkType;

  if (projectId == null) return redirectAndCommit("/projects", session);
  if (taskId == null) return redirectAndCommit(`/projects/${projectId}/tasks`, session);
  if (!["annotate", "review"].includes(workType)) {
    return redirectAndCommit(`/projects/${projectId}/tasks/${taskId}`, session);
  }

  let project: Project | undefined;
  try {
    const projectRes = await readProjectProjectsIdGet({
      auth: token.access_token,
      path: { id: Number.parseInt(projectId, 10) },
    });
    if (projectRes.error) throw projectRes.error;

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
    if (taskRes.error) throw taskRes.error;

    task = taskRes.data;
  } catch (e) {
    session.flash("error", `Failed to open task (id=${taskId}): ${e}`);
  }
  if (!task) return redirectAndCommit(`/projects/${project.id}/tasks`, session);

  const formData = await request.formData();
  const actionType = formData.get('_action');

  if (actionType === 'create' || actionType === 'update') {
    const source_group_id = parseNullableInt(formData.get('source_group_id'));
    const label_branch_id = parseNullableInt(formData.get('label_branch_id'));
    const hasSTBoundsMulti = formData.has('st_bounds_multi');
    const stBoundsMulti = parseSTBoundsMulti(formData.get('st_bounds_multi'));
    const payload: FrameUpdate = {
      min_x: parseNullableNumber(formData.get('min_x')),
      min_y: parseNullableNumber(formData.get('min_y')),
      min_z: parseNullableNumber(formData.get('min_z')),
      max_x: parseNullableNumber(formData.get('max_x')),
      max_y: parseNullableNumber(formData.get('max_y')),
      max_z: parseNullableNumber(formData.get('max_z')),
      min_timestamp: parseNullableDateTime(formData.get('min_timestamp')),
      max_timestamp: parseNullableDateTime(formData.get('max_timestamp')),
      source_group_id,
      label_branch_id,
      is_complete: formData.get('is_complete') === 'true',
    };

    if (actionType === 'update') {
      const frameId = parseNullableInt(formData.get('id'));
      if (frameId == null) return { error: 'Frame id is required' };

      const res = await updateFrameFramesIdPatch({
        auth: token.access_token,
        path: { id: frameId },
        body: payload,
      });
      if (res.error) return { error: res.error };

      return { success: 'Frame updated successfully.' };
    }

    const account_id = parseNullableInt(formData.get('account_id'));
    if (account_id == null) return { error: 'Account is required' };
    if (source_group_id == null) return { error: 'Source group is required' };
    if (label_branch_id == null) return { error: 'Label branch is required' };

    const baseCreate: Omit<FrameCreate, 'min_x' | 'min_y' | 'min_z' | 'max_x' | 'max_y' | 'max_z' | 'min_timestamp' | 'max_timestamp'> = {
      work_type: workType,
      task_id: task.id,
      account_id,
      source_group_id,
      label_branch_id,
      is_complete: formData.get('is_complete') === 'true',
      last_viewed_at: null,
    };

    const createBodies = stBoundsMulti.length > 0
      ? stBoundsMulti.map((stBounds) => frameCreateFromBounds(stBounds, baseCreate))
      : [{
          ...(payload as FrameCreate),
          ...baseCreate,
        }];

    if (hasSTBoundsMulti && stBoundsMulti.length === 0) {
      return { error: 'Generate at least one spatiotemporal boundary.' };
    }

    const results = await Promise.all(
      createBodies.map((body) => createFrameFramesPost({
        auth: token.access_token,
        body,
      }))
    );

    const failed = results.find((result) => result.error);
    if (failed) {
      const successCount = results.filter((result) => result.error === undefined).length;
      const failureMessage = typeof failed.error === 'string' ? failed.error : JSON.stringify(failed.error);

      if (successCount > 0) {
        return { error: `${successCount} of ${createBodies.length} frames were created. First error: ${failureMessage}` };
      }

      return { error: failureMessage };
    }

    return {
      success: createBodies.length === 1
        ? 'Frame created successfully.'
        : `${createBodies.length} frames created successfully.`,
    };
  }

  if (actionType === 'delete') {
    const selectedIds = JSON.parse((formData.get('selectedIds') as string | null) ?? '[]') as number[];
    if (selectedIds.length === 0) return { error: 'Select at least one frame to delete' };

    const results = await Promise.all(
      selectedIds.map((id) => deleteFrameFramesIdDelete({
        auth: token.access_token,
        path: { id },
      }))
    );
    const failed = results.find((result) => result.error);
    if (failed) return { error: failed.error };

    return {
      success: selectedIds.length === 1
        ? 'Frame deleted successfully.'
        : `${selectedIds.length} frames deleted successfully.`,
    };
  }

  return { error: 'Unknown action' };
}

export function FrameTable({
  SG,
  dataset,
  accounts,
  sourceGroups,
  labelBranches,
  workType,
  actionData,
  viewOnly = false,
  containerId,
  loading = false,
  loadingText = 'Loading frames...',
  errorMessage,
}: {
  SG: typeof import('slickgrid-react');
  dataset: Frame[];
  accounts?: Account[];
  sourceGroups?: SourceGroup[];
  labelBranches?: LabelBranch[];
  workType?: WorkType;
  actionData?: FrameActionData;
  viewOnly?: boolean;
  containerId: string;
  loading?: boolean;
  loadingText?: string;
  errorMessage?: string | null;
}) {
  const [showModal, setShowModal] = useState(false);
  const [editingFrame, setEditingFrame] = useState<Frame | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [batchStBoundsMulti, setBatchStBoundsMulti] = useState<ReadonlyArray<PartialSTBounds>>([]);
  const [formData, setFormData] = useState<FrameFormState>({
    accountId: '',
    sourceGroupId: '',
    labelBranchId: '',
    minX: '',
    minY: '',
    minZ: '',
    maxX: '',
    maxY: '',
    maxZ: '',
    minTimestamp: '',
    maxTimestamp: '',
    isComplete: false,
  });
  const reactGridRef = useRef<SlickgridReactInstance | null>(null);

  const { Filters, SlickgridReact } = SG;

  const datasetOptions = getFrameOptionsFromDataset(dataset);
  const accountOptions = accounts ?? datasetOptions.accounts;
  const sourceGroupOptions = sourceGroups ?? datasetOptions.sourceGroups;
  const labelBranchOptions = labelBranches ?? datasetOptions.labelBranches;

  useEffect(() => {
    reactGridRef.current?.slickGrid.invalidate();
  }, [dataset]);

  useEffect(() => {
    if (!actionData) return;

    if (actionData.error) {
      setError(String(actionData.error));
      return;
    }

    if (actionData.success) {
      setShowModal(false);
      setShowDeleteModal(false);
      setError(null);
      reactGridRef.current?.gridService.setSelectedRows([]);
      setSelectedIds([]);
    }
  }, [actionData]);

  useEffect(() => {
    if (!errorMessage) return;
    setError(errorMessage);
  }, [errorMessage]);

  const columns: Column<Frame>[] = [
    {
      id: 'id',
      name: 'ID',
      field: 'id',
      type: 'integer',
      filterable: true,
      sortable: true,
    },
    {
      id: 'account_id',
      name: 'Account',
      field: 'account_id',
      formatter: (_row, _cell, _value, _columnDef, dataContext) => toDisplayText(dataContext.account.username),
      filterable: true,
      filter: {
        collection: accountOptions.map((account) => ({ value: account.id, label: toDisplayText(account.username) })),
        model: Filters.multipleSelect,
        operator: 'IN',
      },
      sortable: true,
    },
    {
      id: 'source_group_id',
      name: 'Source Group',
      field: 'source_group_id',
      formatter: (_row, _cell, _value, _columnDef, dataContext) => toDisplayText(dataContext.source_group?.name),
      filterable: true,
      filter: {
        collection: sourceGroupOptions.map((sourceGroup) => ({ value: sourceGroup.id, label: toDisplayText(sourceGroup.name) })),
        model: Filters.multipleSelect,
        operator: 'IN',
      },
      sortable: true,
    },
    {
      id: 'label_branch_id',
      name: 'Label Branch',
      field: 'label_branch_id',
      formatter: (_row, _cell, _value, _columnDef, dataContext) => dataContext.label_branch?.name ?? '',
      filterable: true,
      filter: {
        collection: labelBranchOptions.map((labelBranch) => ({ value: labelBranch.id, label: labelBranch.name })),
        model: Filters.multipleSelect,
        operator: 'IN',
      },
      sortable: true,
    },
    {
      id: 'min_coords',
      name: 'Min. Coords',
      field: 'min_x',
      formatter: (_row, _cell, _value, _columnDef, dataContext) => formatCoords(dataContext, 'min'),
    },
    {
      id: 'max_coords',
      name: 'Max. Coords',
      field: 'max_x',
      formatter: (_row, _cell, _value, _columnDef, dataContext) => formatCoords(dataContext, 'max'),
    },
    {
      id: 'min_timestamp',
      name: 'Min. Timestamp',
      field: 'min_timestamp',
      type: 'date',
      formatter: (_row, _cell, value) => formatDateTime(value as string | null | undefined),
      filterable: true,
      filter: { model: Filters.dateRange },
      sortable: true,
    },
    {
      id: 'max_timestamp',
      name: 'Max. Timestamp',
      field: 'max_timestamp',
      type: 'date',
      formatter: (_row, _cell, value) => formatDateTime(value as string | null | undefined),
      filterable: true,
      filter: { model: Filters.dateRange },
      sortable: true,
    },
    {
      id: 'last_viewed_at',
      name: 'Last Viewed',
      field: 'last_viewed_at',
      type: 'date',
      formatter: (_row, _cell, value) => formatDateTime(value as string | null | undefined),
      filterable: true,
      filter: { model: Filters.dateRange },
      sortable: true,
    },
    {
      id: 'is_complete',
      name: 'Complete',
      field: 'is_complete',
      formatter: (_row, _cell, value) => value ? 'Yes' : 'No',
      filterable: true,
      filter: {
        collection: [
          { value: true, label: 'Yes' },
          { value: false, label: 'No' },
        ],
        model: Filters.multipleSelect,
        operator: 'IN',
      },
      sortable: true,
    },
  ];

  const gridOptions: GridOption = {
    enableAutoResize: true,
    autoResize: { container: `#${containerId}` },
    enableSorting: true,
    enableFiltering: true,
    enableCellNavigation: true,
    enableCheckboxSelector: true,
    enableSelection: true,
    multiSelect: true,
  };

  function getAllSelectedItems() {
    return reactGridRef.current?.dataView.getAllSelectedItems() ?? [];
  }

  function onSelectAll() {
    const slickGrid = reactGridRef.current;
    const numFiltered = slickGrid?.dataView.getFilteredItemCount() ?? 0;
    slickGrid?.gridService.setSelectedRows(_.range(numFiltered));
  }

  function onDeselectAll() {
    reactGridRef.current?.gridService.setSelectedRows([]);
    setSelectedIds([]);
  }

  function onGridStateChanged() {
    setSelectedIds(getAllSelectedItems().map((item) => item.id));
  }

  function openFrameModal(frame: Frame | null) {
    setEditingFrame(frame);
    if (frame == null) {
      setBatchStBoundsMulti([]);
    }
    setFormData({
      accountId: frame ? String(frame.account_id) : '',
      sourceGroupId: frame?.source_group_id == null ? '' : String(frame.source_group_id),
      labelBranchId: frame?.label_branch_id == null ? '' : String(frame.label_branch_id),
      minX: frame?.min_x ?? '',
      minY: frame?.min_y ?? '',
      minZ: frame?.min_z ?? '',
      maxX: frame?.max_x ?? '',
      maxY: frame?.max_y ?? '',
      maxZ: frame?.max_z ?? '',
      minTimestamp: toDateTimeInputValue(frame?.min_timestamp),
      maxTimestamp: toDateTimeInputValue(frame?.max_timestamp),
      isComplete: frame?.is_complete ?? false,
    });
    setError(null);
    setShowModal(true);
  }

  const selectedFrame = selectedIds.length === 1
    ? dataset.find((frame) => frame.id === selectedIds[0]) ?? null
    : null;

  return (
    <>
      {error && (
        <Alert variant="danger" onClose={() => setError(null)} dismissible>
          {error}
        </Alert>
      )}

      <div className="mb-3 d-flex gap-2">
        <ButtonGroup className="justify-content-start me-auto">
          {!viewOnly && (
            <Button variant="primary" onClick={() => openFrameModal(null)}>Create Frames</Button>
          )}
          <Button
            variant="outline-primary"
            disabled={selectedFrame == null}
            onClick={() => selectedFrame && openFrameModal(selectedFrame)}
          >
            {viewOnly ? 'View Selected' : 'Edit Selected'}
          </Button>
          {!viewOnly && (
            <Button
              variant="outline-danger"
              disabled={selectedIds.length === 0}
              onClick={() => setShowDeleteModal(true)}
            >
              Delete Selected
            </Button>
          )}
        </ButtonGroup>
        <ButtonGroup className="justify-content-end">
          {selectedIds.length === 0 ? (
            <Button variant="outline-secondary" onClick={onSelectAll} disabled={loading || dataset.length === 0}>
              Select All
            </Button>
          ) : (
            <Button variant="secondary" onClick={onDeselectAll}>Deselect All</Button>
          )}
        </ButtonGroup>
      </div>

      <div className="slickgrid-container" id={containerId}>
        {loading ? (
          <div>{loadingText}</div>
        ) : (
          <SlickgridReact
            gridId={`${containerId}-grid`}
            columns={columns}
            options={gridOptions}
            dataset={dataset}
            onReactGridCreated={(e) => {
              reactGridRef.current = e.detail;
            }}
            onGridStateChanged={() => onGridStateChanged()}
          />
        )}
      </div>

      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>
            {viewOnly
              ? 'View Frame'
              : editingFrame
                ? 'Edit Frame'
                : 'Create Frame'}
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
              <Button variant="secondary" type="button" onClick={() => setShowModal(false)}>Close</Button>
            </Modal.Footer>
          </>
        ) : (
          <RouterForm method="post">
            <Modal.Body>
              <input type="hidden" name="_action" value={editingFrame ? 'update' : 'create'} />
              {editingFrame && <input type="hidden" name="id" value={editingFrame.id} />}

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
                />
              ) : (
                <FrameBatchCreateFields
                  formData={formData}
                  setFormData={setFormData}
                  accounts={accountOptions}
                  sourceGroups={sourceGroupOptions}
                  labelBranches={labelBranchOptions}
                  workType={workType}
                  isOpen={showModal && editingFrame == null}
                  batchStBoundsMulti={batchStBoundsMulti}
                  setBatchStBoundsMulti={setBatchStBoundsMulti}
                />
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" type="button" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button
                variant="primary"
                type="submit"
                disabled={editingFrame == null && batchStBoundsMulti.length === 0}
              >
                Save
              </Button>
            </Modal.Footer>
          </RouterForm>
        )}
      </Modal>

      {!viewOnly && (
        <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)}>
          <Modal.Header closeButton>
            <Modal.Title>Confirm Delete</Modal.Title>
          </Modal.Header>
          <RouterForm method="post">
            <Modal.Body>
              <input type="hidden" name="_action" value="delete" />
              <input type="hidden" name="selectedIds" value={JSON.stringify(selectedIds)} />
              <p>
                Are you sure you want to delete {selectedIds.length} selected {selectedIds.length === 1 ? 'frame' : 'frames'}?
              </p>
              <p className="text-muted small">This action cannot be undone.</p>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" type="button" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
              <Button variant="danger" type="submit">Delete</Button>
            </Modal.Footer>
          </RouterForm>
        </Modal>
      )}
    </>
  );
}

export function HydrateFallback() {
  return <div>Loading frames...</div>;
}

export default function Frames({ loaderData, actionData }: Route.ComponentProps) {
  const { SG, project, task, dataset, accounts, sourceGroups, labelBranches, workType, loaderError } = loaderData;

  return createPageContent({
    title: `${TITLES[workType]} - ${task.name} - ${project.name}`,
    header: <Breadcrumb className="fs-5">
      <Breadcrumb.Item href="/projects">Projects</Breadcrumb.Item>
      <Breadcrumb.Item href={`/projects/${project.id}`}>{project.name}</Breadcrumb.Item>
      <Breadcrumb.Item active>{task.name}</Breadcrumb.Item>
    </Breadcrumb>,
    main: (
      <FrameTable
        SG={SG}
        dataset={dataset}
        accounts={accounts}
        sourceGroups={sourceGroups}
        labelBranches={labelBranches}
        workType={workType}
        actionData={actionData}
        containerId="frames-grid-container"
      />
    ),
    alerts: loaderError ? { error: loaderError } : actionData,
  });
}
