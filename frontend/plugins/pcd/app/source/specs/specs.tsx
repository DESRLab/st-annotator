import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Breadcrumb, Button, ButtonGroup, Form, InputGroup, Modal } from 'react-bootstrap';
import { Form as RouterForm } from 'react-router';
import type { Column, GridOption, MenuCommandItem, SlickgridReactInstance } from 'slickgrid-react';

import { BatchSection } from '../../../../../app/components/BatchSection';
import { SelectMultiplePicker } from '../../../../../app/components/SelectMultiplePicker';
import { selectableConfig } from '../../../../../app/components/slickgrid/options';
import {
  bulkUpdateSpecsSourceSpecPcdSpecsBulkPatch,
  createSpecSourceSpecPcdSpecsPost,
  deleteSpecSourceSpecPcdSpecsIdDelete,
  listGroupsSourceGroupsGet,
  listSpecsSourceSpecPcdSpecsGet,
  type PointCloudConfig,
  type PointCloudSpecUpdate,
  type SourceGroupPublic as SourceGroup,
  type SourceSpecCreate as PointCloudSpecCreate,
  type SourceSpecPublic as PointCloudSpec,
  type UserRoles as User,
  updateSpecSourceSpecPcdSpecsIdPatch,
} from '../../../../../client';
import { clearUser, getCurrentSession, getUser, redirectAndCommit } from '../../../../../app/loaders';
import { expandOpenApiSchema, getOpenApiJson, type OpenAPIJSONSchema } from '../../../../../app/models/openapi';
import { Name } from '../../../../../app/models/types';
import { createPageContent } from '../../../../../app/templates';

import type { Route } from './+types/specs';


type PointCloudSpecFormState = {
  name: string;
  description: string;
  group_ids: number[];
  dtype: string;
  channel_headers: string;
  width: string;
  height: string;
  preprocessors: string;
};

type BatchPointCloudSpecFormState = PointCloudSpecFormState & {
  update_name: boolean;
  update_description: boolean;
  update_groups: boolean;
  update_config: boolean;
};

type BatchToggleKey = keyof Pick<
  BatchPointCloudSpecFormState,
  'update_name' | 'update_description' | 'update_groups' | 'update_config'
>;

const DEFAULT_CHANNEL_HEADERS = ['x', 'y', 'z', 'intensity'];
const DEFAULT_DTYPE = 'float32';
const DEFAULT_PREPROCESSORS = '[]';
const PREPROCESSOR_OP_NAMES = ['crop-box', 'crop-polygon', 'denoise', 'downsample-random', 'remove-bg'] as const;

const EMPTY_FORM: PointCloudSpecFormState = {
  name: '',
  description: '',
  group_ids: [],
  dtype: DEFAULT_DTYPE,
  channel_headers: DEFAULT_CHANNEL_HEADERS.join('\n'),
  width: '',
  height: '',
  preprocessors: DEFAULT_PREPROCESSORS,
};

const EMPTY_BATCH_FORM: BatchPointCloudSpecFormState = {
  ...EMPTY_FORM,
  name: '',
  description: '',
  group_ids: [],
  dtype: DEFAULT_DTYPE,
  channel_headers: DEFAULT_CHANNEL_HEADERS.join('\n'),
  width: '',
  height: '',
  preprocessors: DEFAULT_PREPROCESSORS,
  update_name: false,
  update_description: false,
  update_groups: false,
  update_config: false,
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

function trimFormValue(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '').trim();
}

function formatUnknown(value: unknown): string {
  return value == null ? '' : String(value);
}

function toOptionalCreateValue(value: string): string | undefined {
  return value.trim() === '' ? undefined : value.trim();
}

function toOptionalUpdateValue(value: string): string | null {
  return value.trim() === '' ? null : value.trim();
}

function parseSelectedIds(value: string): number[] | null {
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

function parseGroupIds(value: string): number[] | null {
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

function parseOptionalInteger(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') {
    return undefined;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseChannelHeaders(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((header) => header.trim())
    .filter((header) => header.length > 0);
}

function formatChannelHeaders(value: string[] | undefined): string {
  return (value ?? []).join('\n');
}

type ChannelHeadersPillsInputProps = {
  name: string;
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
};

function ChannelHeadersPillsInput({ name, value, readOnly, onChange }: ChannelHeadersPillsInputProps) {
  const [draft, setDraft] = useState('');
  const channelHeaders = parseChannelHeaders(value);

  function updateHeaders(headers: string[]) {
    onChange(formatChannelHeaders(headers));
  }

  function addHeaders(rawValue: string) {
    const nextHeaders = parseChannelHeaders(rawValue);
    if (nextHeaders.length === 0) {
      return false;
    }

    updateHeaders([...channelHeaders, ...nextHeaders]);
    setDraft('');
    return true;
  }

  function removeHeader(index: number) {
    updateHeaders(channelHeaders.filter((_, itemIndex) => itemIndex !== index));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',' || event.key === 'Tab') {
      if (draft.trim() !== '') {
        event.preventDefault();
        addHeaders(draft);
      }
      return;
    }

    if (event.key === 'Backspace' && draft === '' && channelHeaders.length > 0) {
      event.preventDefault();
      removeHeader(channelHeaders.length - 1);
    }
  }

  function handleBlur() {
    if (draft.trim() !== '') {
      addHeaders(draft);
    }
  }

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <div className="border rounded p-2 bg-body-tertiary">
        <div className="d-flex flex-wrap gap-2 align-items-center">
          {channelHeaders.map((header, index) => (
            <Badge key={`${header}-${index}`} pill bg="secondary" className="d-inline-flex align-items-center gap-2 px-3 py-2">
              <span>{header}</span>
              {!readOnly && (
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  aria-label={`Remove ${header}`}
                  style={{ fontSize: '0.65rem' }}
                  onClick={() => removeHeader(index)}
                />
              )}
            </Badge>
          ))}
          {!readOnly && (
            <Form.Control
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              placeholder={channelHeaders.length === 0 ? 'Add a channel header' : 'Add another header'}
              className="border-0 bg-transparent flex-grow-1 px-1 py-1"
              style={{ minWidth: '12rem' }}
            />
          )}
          {readOnly && channelHeaders.length === 0 && <span className="text-muted">-</span>}
        </div>
      </div>
    </>
  );
}

function formatPreprocessors(value: PointCloudConfig['preprocessors'] | undefined): string {
  return JSON.stringify(value ?? [], null, 2);
}

function formatGroups(groups: SpecificationGroup[]): string {
  if (groups.length === 0) {
    return '-';
  }
  return groups.map((group) => formatUnknown(group.name)).join(', ');
}

function formatChannelCount(config: PointCloudConfig | null | undefined): string {
  if (!config) {
    return '-';
  }

  const channelCount = config.channel_headers.length;
  return String(channelCount);
}

type PointCloudPreprocessor = NonNullable<PointCloudConfig['preprocessors']>[number];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePreprocessors(value: string): { preprocessors?: PointCloudPreprocessor[]; error?: string } {
  const trimmed = value.trim();
  if (trimmed === '') {
    return { preprocessors: [] };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) {
      return { error: 'Config: Preprocessors must be a JSON array.' };
    }

    for (const [index, item] of parsed.entries()) {
      if (!isPlainObject(item)) {
        return { error: `Config: Preprocessor ${index + 1} must be an object.` };
      }

      if (typeof item.op_name !== 'string' || !PREPROCESSOR_OP_NAMES.includes(item.op_name as typeof PREPROCESSOR_OP_NAMES[number])) {
        return {
          error: `Config: Preprocessor ${index + 1} must use one of ${PREPROCESSOR_OP_NAMES.join(', ')}.`,
        };
      }

      if (!('op_params' in item)) {
        return { error: `Config: Preprocessor ${index + 1} must include op_params.` };
      }
    }

    return { preprocessors: parsed as PointCloudPreprocessor[] };
  } catch {
    return { error: 'Config: Preprocessors must be valid JSON.' };
  }
}

function buildConfigFromValues(values: Pick<PointCloudSpecFormState, 'dtype' | 'channel_headers' | 'width' | 'height' | 'preprocessors'>): { config?: PointCloudConfig; error?: string } {
  const dtype = values.dtype.trim();
  if (dtype === '') {
    return { error: 'Config: Data Type is required.' };
  }

  const channelHeaders = parseChannelHeaders(values.channel_headers);
  if (channelHeaders.length === 0) {
    return { error: 'Config: Provide at least one channel header.' };
  }

  const widthValue = values.width.trim();
  if (widthValue !== '' && parseOptionalInteger(widthValue) == null) {
    return { error: 'Config: Width must be an integer.' };
  }

  const heightValue = values.height.trim();
  if (heightValue !== '' && parseOptionalInteger(heightValue) == null) {
    return { error: 'Config: Height must be an integer.' };
  }

  const preprocessorResult = parsePreprocessors(values.preprocessors);
  if (preprocessorResult.error || !preprocessorResult.preprocessors) {
    return { error: preprocessorResult.error ?? 'Config: Preprocessors are invalid.' };
  }

  return {
    config: {
      dtype,
      channel_headers: channelHeaders,
      width: parseOptionalInteger(values.width),
      height: parseOptionalInteger(values.height),
      preprocessors: preprocessorResult.preprocessors,
    },
  };
}

function PointCloudSpecToFormState(source: PointCloudSpec): PointCloudSpecFormState {
  return {
    name: formatUnknown(source.name),
    description: source.description ?? '',
    group_ids: source.groups.map((group) => group.id),
    dtype: source.config?.dtype ?? DEFAULT_DTYPE,
    channel_headers: formatChannelHeaders(source.config?.channel_headers),
    width: source.config?.width == null ? '' : String(source.config.width),
    height: source.config?.height == null ? '' : String(source.config.height),
    preprocessors: formatPreprocessors(source.config?.preprocessors),
  };
}

function createPayloadFromFormData(formData: FormData): { data?: PointCloudSpecCreate; error?: string } {
  const name = trimFormValue(formData, 'name');
  if (!Name.regex.test(name)) {
    return { error: `Name: ${Name.helperText}` };
  }

  const groupIds = parseGroupIds(trimFormValue(formData, 'group_ids'));
  if (!groupIds || groupIds.length === 0) {
    return { error: 'Assign at least one source group.' };
  }

  const configResult = buildConfigFromValues({
    dtype: trimFormValue(formData, 'dtype'),
    channel_headers: trimFormValue(formData, 'channel_headers'),
    width: trimFormValue(formData, 'width'),
    height: trimFormValue(formData, 'height'),
    preprocessors: trimFormValue(formData, 'preprocessors'),
  });
  if (configResult.error || !configResult.config) {
    return { error: configResult.error ?? 'Config is required.' };
  }

  return {
    data: {
      name,
      description: trimFormValue(formData, 'description'),
      group_ids: groupIds,
      config: configResult.config,
    },
  };
}

function updatePayloadFromFormData(formData: FormData): { data?: PointCloudSpecUpdate; error?: string } {
  const name = trimFormValue(formData, 'name');
  if (!Name.regex.test(name)) {
    return { error: `Name: ${Name.helperText}` };
  }

  const groupIds = parseGroupIds(trimFormValue(formData, 'group_ids'));
  if (!groupIds) {
    return { error: 'Specification groups are invalid.' };
  }

  const configResult = buildConfigFromValues({
    dtype: trimFormValue(formData, 'dtype'),
    channel_headers: trimFormValue(formData, 'channel_headers'),
    width: trimFormValue(formData, 'width'),
    height: trimFormValue(formData, 'height'),
    preprocessors: trimFormValue(formData, 'preprocessors'),
  });
  if (configResult.error || !configResult.config) {
    return { error: configResult.error ?? 'Config is required.' };
  }

  return {
    data: {
      name,
      description: toOptionalUpdateValue(trimFormValue(formData, 'description')),
      group_ids: groupIds,
      config: configResult.config,
    },
  };
}

function batchPayloadFromFormData(formData: FormData): { data?: PointCloudSpecUpdate; error?: string } {
  const updateName = formData.get('update_name') === 'true';
  const updateDescription = formData.get('update_description') === 'true';
  const updateGroups = formData.get('update_groups') === 'true';
  const updateConfig = formData.get('update_config') === 'true';

  if (!updateName && !updateDescription && !updateGroups && !updateConfig) {
    return { error: 'Select at least one field group to update.' };
  }

  const data: PointCloudSpecUpdate = {};

  if (updateName) {
    const name = trimFormValue(formData, 'name');
    if (!Name.regex.test(name)) {
      return { error: `Name: ${Name.helperText}` };
    }
    data.name = name;
  }

  if (updateDescription) {
    data.description = toOptionalUpdateValue(trimFormValue(formData, 'description'));
  }

  if (updateGroups) {
    const groupIds = parseGroupIds(trimFormValue(formData, 'group_ids'));
    if (!groupIds) {
      return { error: 'Specification groups are invalid.' };
    }
    data.group_ids = groupIds;
  }

  if (updateConfig) {
    const configResult = buildConfigFromValues({
      dtype: trimFormValue(formData, 'dtype'),
      channel_headers: trimFormValue(formData, 'channel_headers'),
      width: trimFormValue(formData, 'width'),
      height: trimFormValue(formData, 'height'),
      preprocessors: trimFormValue(formData, 'preprocessors'),
    });
    if (configResult.error || !configResult.config) {
      return { error: configResult.error ?? 'Config is required.' };
    }
    data.config = configResult.config;
  }

  return { data };
}

type PointCloudSpecFieldsProps<TState extends PointCloudSpecFormState> = {
  formData: TState;
  sourceGroups: SpecificationGroup[];
  preprocessorSchema: OpenAPIJSONSchema;
  readOnly: boolean;
  onChange: <K extends Exclude<keyof PointCloudSpecFormState, 'group_ids'>>(field: K, value: string) => void;
  onGroupsChange: (groupIds: number[]) => void;
};

function PointCloudSpecFields<TState extends PointCloudSpecFormState>({
  formData,
  sourceGroups,
  preprocessorSchema,
  readOnly,
  onChange,
  onGroupsChange,
}: PointCloudSpecFieldsProps<TState>) {
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
        <Form.Label>
          Source Groups
          <span className="text-danger ms-1">*</span>
        </Form.Label>
        <input type="hidden" name="group_ids" value={JSON.stringify(formData.group_ids)} />
        <SelectMultiplePicker
          items={sourceGroups.map((group) => ({ id: group.id, label: formatUnknown(group.name) }))}
          value={formData.group_ids}
          onChange={onGroupsChange}
          disabled={readOnly}
        />
        {!readOnly && <Form.Text className="text-muted">Assign one or more source groups.</Form.Text>}
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
        <Form.Label>
          Data Type
          <span className="text-danger ms-1">*</span>
        </Form.Label>
        <Form.Control
          type="text"
          name="dtype"
          value={formData.dtype}
          readOnly={readOnly}
          onChange={(event) => onChange('dtype', event.target.value)}
        />
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Label>
          Channel Headers
          <span className="text-danger ms-1">*</span>
        </Form.Label>
        <ChannelHeadersPillsInput
          name="channel_headers"
          value={formData.channel_headers}
          readOnly={readOnly}
          onChange={(value) => onChange('channel_headers', value)}
        />
        {!readOnly && <Form.Text className="text-muted">Press Enter, Tab, or comma to add each channel header.</Form.Text>}
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Label>Dimensions</Form.Label>
        <InputGroup>
          <InputGroup.Text>Width</InputGroup.Text>
          <Form.Control
            type="number"
            step={1}
            name="width"
            value={formData.width}
            readOnly={readOnly}
            onChange={(event) => onChange('width', event.target.value)}
          />
          <InputGroup.Text>Height</InputGroup.Text>
          <Form.Control
            type="number"
            step={1}
            name="height"
            value={formData.height}
            readOnly={readOnly}
            onChange={(event) => onChange('height', event.target.value)}
          />
        </InputGroup>
      </Form.Group>

      <Form.Group className="mb-0">
        <Form.Label>Preprocessors (JSON)</Form.Label>
        <Form.Control
          as="textarea"
          rows={10}
          name="preprocessors"
          value={formData.preprocessors}
          readOnly={readOnly}
          onChange={(event) => onChange('preprocessors', event.target.value)}
        />
        <Form.Text className="text-muted">
          Provide a JSON array of preprocessors. Supported op names: {PREPROCESSOR_OP_NAMES.join(', ')}.
        </Form.Text>
        <Form.Text
          className="link-primary text-decoration-underline d-block"
          style={{ cursor: 'pointer' }}
          onClick={() => navigator.clipboard.writeText(JSON.stringify(preprocessorSchema, null, 2))}
          title="Click to copy schema"
        >
          Click here to copy the preprocessor JSON schema to your clipboard
        </Form.Text>
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

  const [sourcesRes, sourceGroupsRes] = await Promise.all([
    listSpecsSourceSpecPcdSpecsGet({ auth: token.access_token }),
    listGroupsSourceGroupsGet({ auth: token.access_token }),
  ]);
  const openApiJson = await getOpenApiJson();
  const preprocessorSchema = expandOpenApiSchema(
    openApiJson,
    openApiJson.components.schemas.PointCloudConfig?.properties?.preprocessors ?? {},
  );

  const dataset = (sourcesRes.data ?? []).slice().sort((left, right) =>
    formatUnknown(left.name).localeCompare(formatUnknown(right.name))
  );
  const sourceGroups = (sourceGroupsRes.data ?? []).slice().sort((left, right) =>
    formatUnknown(left.name).localeCompare(formatUnknown(right.name))
  );
  const loaderError = sourcesRes.error ?? sourceGroupsRes.error;

  return {
    user,
    dataset,
    sourceGroups,
    preprocessorSchema,
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
      return { error: payload.error ?? 'Unable to create point cloud source.' };
    }

    const res = await createSpecSourceSpecPcdSpecsPost({
      auth: token.access_token,
      body: payload.data,
    });
    if (res.error) {
      return { error: normalizeError(res.error) };
    }

    return { success: 'Point cloud source created successfully.' };
  }

  if (actionType === 'update') {
    const id = Number.parseInt(trimFormValue(formData, 'id'), 10);
    if (Number.isNaN(id)) {
      return { error: 'A valid point cloud source ID is required.' };
    }

    const payload = updatePayloadFromFormData(formData);
    if (payload.error || !payload.data) {
      return { error: payload.error ?? 'Unable to update point cloud source.' };
    }

    const res = await updateSpecSourceSpecPcdSpecsIdPatch({
      auth: token.access_token,
      path: { id },
      body: payload.data,
    });
    if (res.error) {
      return { error: normalizeError(res.error) };
    }

    return { success: 'Point cloud source updated successfully.' };
  }

  if (actionType === 'delete') {
    const id = Number.parseInt(trimFormValue(formData, 'id'), 10);
    if (Number.isNaN(id)) {
      return { error: 'A valid point cloud source ID is required.' };
    }

    const res = await deleteSpecSourceSpecPcdSpecsIdDelete({
      auth: token.access_token,
      path: { id },
    });
    if (res.error) {
      return { error: normalizeError(res.error) };
    }

    return { success: 'Point cloud source deleted successfully.' };
  }

  if (actionType === 'batch_update') {
    const selectedIds = parseSelectedIds(trimFormValue(formData, 'selectedIds'));
    if (!selectedIds || selectedIds.length === 0) {
      return { error: 'Select at least one point cloud source to update.' };
    }

    const payload = batchPayloadFromFormData(formData);
    if (payload.error || !payload.data) {
      return { error: payload.error ?? 'Unable to batch update point cloud sources.' };
    }

    const res = await bulkUpdateSpecsSourceSpecPcdSpecsBulkPatch({
      auth: token.access_token,
      body: { ids: selectedIds, data: payload.data },
    });
    if (res.error) {
      return { error: normalizeError(res.error) };
    }

    return {
      success: selectedIds.length === 1
        ? 'Point cloud source updated successfully.'
        : `${selectedIds.length} point cloud sources updated successfully.`,
    };
  }

  if (actionType === 'batch_delete') {
    const selectedIds = parseSelectedIds(trimFormValue(formData, 'selectedIds'));
    if (!selectedIds || selectedIds.length === 0) {
      return { error: 'Select at least one point cloud source to delete.' };
    }

    const results = await Promise.all(
      selectedIds.map((id) => deleteSpecSourceSpecPcdSpecsIdDelete({
        auth: token.access_token,
        path: { id },
      }))
    );
    const firstError = results.find((result) => result.error)?.error;
    if (firstError) {
      return { error: normalizeError(firstError) };
    }

    return {
      success: selectedIds.length === 1
        ? 'Point cloud source deleted successfully.'
        : `${selectedIds.length} point cloud sources deleted successfully.`,
    };
  }

  return { error: 'Unknown action.' };
}

function PointCloudSpecsTable({
  SG,
  user,
  dataset,
  sourceGroups,
  preprocessorSchema,
  actionData,
}: {
  SG: typeof import('slickgrid-react');
  user: User;
  dataset: PointCloudSpec[];
  sourceGroups: SpecificationGroup[];
  preprocessorSchema: OpenAPIJSONSchema;
  actionData?: Route.ComponentProps['actionData'];
}) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [gridOptions, setGridOptions] = useState<GridOption | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingSpecification, setEditingSpecification] = useState<PointCloudSpec | null>(null);
  const [showBatchEditModal, setShowBatchEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [sourceToDelete, setSpecificationToDelete] = useState<PointCloudSpec | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<PointCloudSpecFormState>(EMPTY_FORM);
  const [batchFormData, setBatchFormData] = useState<BatchPointCloudSpecFormState>(EMPTY_BATCH_FORM);
  const reactGridRef = useRef<SlickgridReactInstance | null>(null);

  const { SlickgridReact } = SG;
  const canManage = user.roles.includes('data-manager');

  useEffect(() => {
    reactGridRef.current?.gridService.setSelectedRows([]);
    setSelectedIds([]);
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
      setShowBatchEditModal(false);
      setShowDeleteModal(false);
      setEditingSpecification(null);
      setSpecificationToDelete(null);
      setFormData(EMPTY_FORM);
      setBatchFormData(EMPTY_BATCH_FORM);
    }
  }, [actionData]);

  function getAllSelectedItems(): PointCloudSpec[] {
    const items = reactGridRef.current?.dataView.getAllSelectedItems() ?? [];
    return items.filter((item): item is PointCloudSpec => item != null);
  }

  function handleCreate() {
    setEditingSpecification(null);
    setFormData(EMPTY_FORM);
    setError(null);
    setShowModal(true);
  }

  function handleEdit(source: PointCloudSpec) {
    setEditingSpecification(source);
    setFormData(PointCloudSpecToFormState(source));
    setError(null);
    setShowModal(true);
  }

  function handleDelete(source: PointCloudSpec) {
    setSpecificationToDelete(source);
    setError(null);
    setShowDeleteModal(true);
  }

  function handleBatchEdit() {
    setBatchFormData(EMPTY_BATCH_FORM);
    setError(null);
    setShowBatchEditModal(true);
  }

  function handleBatchDelete() {
    setSpecificationToDelete(null);
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
        id: 'groups',
        name: 'Groups',
        field: 'groups',
        type: 'string',
        filterable: false,
        sortable: false,
        formatter: (_row, _cell, _value, _columnDef, dataContext) => formatGroups(dataContext.groups),
      },
      {
        id: 'dtype',
        name: 'Data Type',
        field: 'config',
        type: 'string',
        filterable: false,
        sortable: false,
        formatter: (_row, _cell, _value, _columnDef, dataContext) => dataContext.config?.dtype ?? '-',
      },
      {
        id: 'channels',
        name: '# Channels',
        field: 'config',
        type: 'string',
        filterable: false,
        sortable: false,
        formatter: (_row, _cell, _value, _columnDef, dataContext) => formatChannelCount(dataContext.config),
      },
      {
        id: 'preprocessors',
        name: '# Preprocessors',
        field: 'config',
        type: 'integer',
        filterable: false,
        sortable: false,
        formatter: (_row, _cell, _value, _columnDef, dataContext) => String(dataContext.config?.preprocessors?.length ?? 0),
      },
    ]);

    setGridOptions({
      ...(selectableConfig({ commandItems: commandItems as never, multiSelect: true }) as unknown as GridOption),
      autoResize: { container: '#grid-container' },
      enableAutoResize: true,
    });
  }

  function onSelectAll() {
    const numFiltered = reactGridRef.current?.dataView.getFilteredItemCount() ?? 0;
    reactGridRef.current?.gridService.setSelectedRows(Array.from({ length: numFiltered }, (_, index) => index));
  }

  function onDeselectAll() {
    reactGridRef.current?.gridService.setSelectedRows([]);
  }

  function onGridStateChanged() {
    setSelectedIds(getAllSelectedItems().map((item) => item.id));
  }

  function reactGridReady(reactGrid: SlickgridReactInstance) {
    reactGridRef.current = reactGrid;
  }

  function updateFormField<K extends Exclude<keyof PointCloudSpecFormState, 'group_ids'>>(field: K, value: string) {
    setFormData((previous) => ({ ...previous, [field]: value }));
  }

  function updateFormGroups(groupIds: number[]) {
    setFormData((previous) => ({ ...previous, group_ids: groupIds }));
  }

  function updateBatchField<K extends Exclude<keyof PointCloudSpecFormState, 'group_ids'>>(field: K, value: string) {
    setBatchFormData((previous) => ({ ...previous, [field]: value }));
  }

  function updateBatchGroups(groupIds: number[]) {
    setBatchFormData((previous) => ({ ...previous, group_ids: groupIds }));
  }

  function updateBatchToggle(field: BatchToggleKey, value: boolean) {
    setBatchFormData((previous) => ({ ...previous, [field]: value }));
  }

  useEffect(() => {
    defineGrid();
  }, [canManage]);

  return (
    <>
      <div className="mb-3 text-muted">
        Parse and preprocess point clouds assigned to each source group.
      </div>
  
      <div className="mb-3 d-flex gap-2">
        <ButtonGroup className='justify-content-start me-auto'>
          <Button variant="primary" onClick={handleCreate}>Create Point Cloud Specification</Button>
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
        {gridOptions && (
          <SlickgridReact
            gridId="point-cloud-source-grid"
            columns={columns}
            options={gridOptions}
            dataset={dataset}
            onReactGridCreated={(event) => reactGridReady(event.detail)}
            onGridStateChanged={() => onGridStateChanged()}
          />
        )}
      </div>

      <Modal show={showModal} onHide={() => setShowModal(false)} size="xl">
        <Modal.Header closeButton>
          <Modal.Title>
            {editingSpecification
              ? canManage ? 'Edit Point Cloud Specification' : 'View Point Cloud Specification'
              : 'Create Point Cloud Specification'}
          </Modal.Title>
        </Modal.Header>
        <RouterForm method="post">
          <Modal.Body>
            {error && <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>}

            <input type="hidden" name="_action" value={editingSpecification ? 'update' : 'create'} />
            {editingSpecification && <input type="hidden" name="id" value={editingSpecification.id} />}

            <PointCloudSpecFields
              formData={formData}
              sourceGroups={sourceGroups}
              preprocessorSchema={preprocessorSchema}
              readOnly={!canManage}
              onChange={updateFormField}
              onGroupsChange={updateFormGroups}
            />
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>{canManage ? 'Cancel' : 'Close'}</Button>
            {canManage && <Button variant="primary" type="submit">Save</Button>}
          </Modal.Footer>
        </RouterForm>
      </Modal>

      <Modal show={showBatchEditModal} onHide={() => setShowBatchEditModal(false)} size="xl">
        <Modal.Header closeButton>
          <Modal.Title>Batch Edit Point Cloud Specifications ({selectedIds.length} selected)</Modal.Title>
        </Modal.Header>
        <RouterForm method="post">
          <Modal.Body>
            {error && <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>}

            <input type="hidden" name="_action" value="batch_update" />
            <input type="hidden" name="selectedIds" value={JSON.stringify(selectedIds)} />
            <input type="hidden" name="update_name" value={String(batchFormData.update_name)} />
            <input type="hidden" name="update_description" value={String(batchFormData.update_description)} />
            <input type="hidden" name="update_groups" value={String(batchFormData.update_groups)} />
            <input type="hidden" name="update_config" value={String(batchFormData.update_config)} />
            <input type="hidden" name="group_ids" value={JSON.stringify(batchFormData.group_ids)} />

            <BatchSection
              label="Update Name"
              checked={batchFormData.update_name}
              onToggle={(checked) => updateBatchToggle('update_name', checked)}
            >
              <Form.Control
                type="text"
                name="name"
                value={batchFormData.name}
                onChange={(event) => updateBatchField('name', event.target.value)}
                placeholder="Name"
              />
              <Form.Text className="text-muted d-block mt-2">{Name.helperText}</Form.Text>
            </BatchSection>

            <BatchSection
              label="Update Description"
              checked={batchFormData.update_description}
              onToggle={(checked) => updateBatchToggle('update_description', checked)}
            >
              <Form.Control
                as="textarea"
                rows={3}
                name="description"
                value={batchFormData.description}
                onChange={(event) => updateBatchField('description', event.target.value)}
                placeholder="Leave empty to clear"
              />
            </BatchSection>

            <BatchSection
              label="Update Source Groups"
              checked={batchFormData.update_groups}
              onToggle={(checked) => updateBatchToggle('update_groups', checked)}
            >
              <SelectMultiplePicker
                items={sourceGroups.map((group) => ({ id: group.id, label: formatUnknown(group.name) }))}
                value={batchFormData.group_ids}
                onChange={updateBatchGroups}
              />
            </BatchSection>

            <BatchSection
              label="Update Config"
              checked={batchFormData.update_config}
              onToggle={(checked) => updateBatchToggle('update_config', checked)}
            >
              <Form.Group className="mb-3">
                <Form.Label>Data Type</Form.Label>
                <Form.Control
                  type="text"
                  name="dtype"
                  value={batchFormData.dtype}
                  onChange={(event) => updateBatchField('dtype', event.target.value)}
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Channel Headers</Form.Label>
                <ChannelHeadersPillsInput
                  name="channel_headers"
                  value={batchFormData.channel_headers}
                  readOnly={false}
                  onChange={(value) => updateBatchField('channel_headers', value)}
                />
                <Form.Text className="text-muted">Press Enter, Tab, or comma to add each channel header.</Form.Text>
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Dimensions</Form.Label>
                <InputGroup>
                  <InputGroup.Text>Width</InputGroup.Text>
                  <Form.Control
                    type="number"
                    step={1}
                    name="width"
                    value={batchFormData.width}
                    onChange={(event) => updateBatchField('width', event.target.value)}
                  />
                  <InputGroup.Text>Height</InputGroup.Text>
                  <Form.Control
                    type="number"
                    step={1}
                    name="height"
                    value={batchFormData.height}
                    onChange={(event) => updateBatchField('height', event.target.value)}
                  />
                </InputGroup>
              </Form.Group>
              <Form.Group className="mb-0">
                <Form.Label>Preprocessors (JSON)</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={10}
                  name="preprocessors"
                  value={batchFormData.preprocessors}
                  onChange={(event) => updateBatchField('preprocessors', event.target.value)}
                />
                <Form.Text className="text-muted">
                  Provide a JSON array of preprocessors. Supported op names: {PREPROCESSOR_OP_NAMES.join(', ')}.
                </Form.Text>
                <Form.Text
                  className="link-primary text-decoration-underline d-block"
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigator.clipboard.writeText(JSON.stringify(preprocessorSchema, null, 2))}
                  title="Click to copy schema"
                >
                  Click here to copy the preprocessor JSON schema to your clipboard
                </Form.Text>
              </Form.Group>
            </BatchSection>

            {!batchFormData.update_name
              && !batchFormData.update_description
              && !batchFormData.update_groups
              && !batchFormData.update_config && (
              <Alert variant="info">Choose one or more field groups to apply to the selected point cloud sources.</Alert>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowBatchEditModal(false)}>Cancel</Button>
            <Button variant="primary" type="submit">Apply to {selectedIds.length} Point Cloud Specifications</Button>
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
            {sourceToDelete ? (
              <>
                <input type="hidden" name="_action" value="delete" />
                <input type="hidden" name="id" value={sourceToDelete.id} />
                <p>Are you sure you want to delete point cloud source <strong>{formatUnknown(sourceToDelete.name)}</strong>?</p>
              </>
            ) : (
              <>
                <input type="hidden" name="_action" value="batch_delete" />
                <input type="hidden" name="selectedIds" value={JSON.stringify(selectedIds)} />
                <p>Are you sure you want to delete {selectedIds.length} selected {selectedIds.length === 1 ? 'point cloud source' : 'point cloud sources'}?</p>
              </>
            )}
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
  return <div>Loading point cloud sources...</div>;
}

export default function PointCloudSpecs({ loaderData, actionData }: Route.ComponentProps) {
  const { SG, user, dataset, sourceGroups, preprocessorSchema, loaderError } = loaderData;

  return createPageContent({
    title: 'Point Cloud Specifications',
    header: <>
      <Breadcrumb className="mb-1">
        <Breadcrumb.Item href="/source/specs">Source Specifications</Breadcrumb.Item>
        <Breadcrumb.Item active>Point Cloud Specifications</Breadcrumb.Item>
      </Breadcrumb>
      <h2 className="py-2">Point Cloud Specifications</h2>
    </>,
    main: (
      <PointCloudSpecsTable
        SG={SG}
        user={user}
        dataset={dataset}
        sourceGroups={sourceGroups}
        preprocessorSchema={preprocessorSchema}
        actionData={actionData}
      />
    ),
    alerts: loaderError ? { error: loaderError } : actionData,
  });
}