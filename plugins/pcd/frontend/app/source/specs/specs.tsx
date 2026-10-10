import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Breadcrumb,
  Button,
  ButtonGroup,
  Form,
  InputGroup,
  Modal,
} from "react-bootstrap";
import { Form as RouterForm, Link, useNavigation } from "react-router";
import type {
  Column,
  GridOption,
  MenuCommandItem,
  SlickgridReactInstance,
} from "slickgrid-react";

import {
  BatchSection,
  ConfigFieldTabs,
  GridSelectionButtons,
  SelectMultiplePicker,
  createSlickgridClientLoader,
  selectableConfig,
  type ConfigEditorState,
} from "sta/app/components";
import {
  jobsQueueHref,
  loadAccessTokenSession,
  loadAuthenticatedSession,
  reportedJobIds,
} from "sta/app/loaders";
import {
  expandOpenApiSchema,
  getOpenApiJson,
  type OpenAPIJSONSchema,
} from "sta/app/models";
import { Name } from "sta/app/models";
import { formatUnknown, normalizeError } from "sta/app/plugins";
import { createPageContent } from "sta/app/templates";
import {
  bulkDeleteSpecsSourceSpecPcdSpecsBulkDelete,
  bulkUpdateSpecsSourceSpecPcdSpecsBulkPatch,
  createSpecSourceSpecPcdSpecsPost,
  deleteSpecSourceSpecPcdSpecsIdDelete,
  listGroupsSourceGroupsGet,
  listSpecsSourceSpecPcdSpecsGet,
  type PointCloudConfig,
  type PointCloudSpecUpdate,
  type SourceSpecCreate as PointCloudSpecCreate,
  type SourceSpecPublic as PointCloudSpec,
  type SourceGroupPublic,
  type UserRoles as User,
  updateSpecSourceSpecPcdSpecsIdPatch,
} from "sta/client";

import type { Route } from "./+types/specs";
import {
  PreprocessorFields,
  formatPreprocessors,
  jsonFromPreprocessorDrafts,
  parsePreprocessors,
  preprocessorDrafts,
  type PreprocessorDrafts,
} from "./preprocessors";

interface PointCloudSpecFormState {
  name: string;
  description: string;
  group_ids: number[];
  dtype: string;
  channel_headers: string;
  width: string;
  height: string;
  preprocessors: string;
}

type BatchPointCloudSpecFormState = PointCloudSpecFormState & {
  update_name: boolean;
  update_description: boolean;
  update_groups: boolean;
  update_config: boolean;
};

type BatchToggleKey = keyof Pick<
  BatchPointCloudSpecFormState,
  "update_name" | "update_description" | "update_groups" | "update_config"
>;

const DEFAULT_CHANNEL_HEADERS = ["x", "y", "z", "intensity"];
const DEFAULT_DTYPE = "float32";
const DEFAULT_PREPROCESSORS = "[]";

/** A save's notice: how many queue rows it started, and where to read them. */
interface JobsNotice {
  count: number;
  href: string;
}

const EMPTY_FORM: PointCloudSpecFormState = {
  name: "",
  description: "",
  group_ids: [],
  dtype: DEFAULT_DTYPE,
  channel_headers: DEFAULT_CHANNEL_HEADERS.join("\n"),
  width: "",
  height: "",
  preprocessors: DEFAULT_PREPROCESSORS,
};

const EMPTY_BATCH_FORM: BatchPointCloudSpecFormState = {
  ...EMPTY_FORM,
  name: "",
  description: "",
  group_ids: [],
  dtype: DEFAULT_DTYPE,
  channel_headers: DEFAULT_CHANNEL_HEADERS.join("\n"),
  width: "",
  height: "",
  preprocessors: DEFAULT_PREPROCESSORS,
  update_name: false,
  update_description: false,
  update_groups: false,
  update_config: false,
};

function trimFormValue(formData: FormData, name: string): string {
  const value = formData.get(name);
  return (typeof value === "string" ? value : "").trim();
}

function parseSelectedIds(value: string): number[] | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      !Array.isArray(parsed) ||
      !parsed.every((item) => typeof item === "number")
    ) {
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
    if (
      !Array.isArray(parsed) ||
      !parsed.every((item) => typeof item === "number")
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function parseOptionalInteger(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") {
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
  return (value ?? []).join("\n");
}

interface ChannelHeadersPillsInputProps {
  name: string;
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
}

function ChannelHeadersPillsInput({
  name,
  value,
  readOnly,
  onChange,
}: ChannelHeadersPillsInputProps) {
  const [draft, setDraft] = useState("");
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
    setDraft("");
    return true;
  }

  function removeHeader(index: number) {
    updateHeaders(channelHeaders.filter((_, itemIndex) => itemIndex !== index));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === "," || event.key === "Tab") {
      if (draft.trim() !== "") {
        event.preventDefault();
        addHeaders(draft);
      }
      return;
    }

    if (
      event.key === "Backspace" &&
      draft === "" &&
      channelHeaders.length > 0
    ) {
      event.preventDefault();
      removeHeader(channelHeaders.length - 1);
    }
  }

  function handleBlur() {
    if (draft.trim() !== "") {
      addHeaders(draft);
    }
  }

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <div className="border rounded p-2 bg-body-tertiary">
        <div className="d-flex flex-wrap gap-2 align-items-center">
          {channelHeaders.map((header, index) => (
            <Badge
              key={`${header}-${index}`}
              pill
              bg="secondary"
              className="d-inline-flex align-items-center gap-2 px-3 py-2"
            >
              <span>{header}</span>
              {!readOnly && (
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  aria-label={`Remove ${header}`}
                  style={{ fontSize: "0.65rem" }}
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
              placeholder={
                channelHeaders.length === 0
                  ? "Add a channel header"
                  : "Add another header"
              }
              className="border-0 bg-transparent flex-grow-1 px-1 py-1"
              style={{ minWidth: "12rem" }}
            />
          )}
          {readOnly && channelHeaders.length === 0 && (
            <span className="text-muted">-</span>
          )}
        </div>
      </div>
    </>
  );
}

function formatGroups(groups: SourceGroupPublic[]): string {
  if (groups.length === 0) {
    return "-";
  }
  return groups.map((group) => formatUnknown(group.name)).join(", ");
}

function formatChannelCount(
  config: PointCloudConfig | null | undefined,
): string {
  if (!config) {
    return "-";
  }

  const channelCount = config.channel_headers.length;
  return String(channelCount);
}

function buildConfigFromValues(
  values: Pick<
    PointCloudSpecFormState,
    "dtype" | "channel_headers" | "width" | "height" | "preprocessors"
  >,
): { config?: PointCloudConfig; error?: string } {
  const dtype = values.dtype.trim();
  if (dtype === "") {
    return { error: "Config: Data Type is required." };
  }

  const channelHeaders = parseChannelHeaders(values.channel_headers);
  if (channelHeaders.length === 0) {
    return { error: "Config: Provide at least one channel header." };
  }

  const widthValue = values.width.trim();
  if (widthValue !== "" && parseOptionalInteger(widthValue) == null) {
    return { error: "Config: Width must be an integer." };
  }

  const heightValue = values.height.trim();
  if (heightValue !== "" && parseOptionalInteger(heightValue) == null) {
    return { error: "Config: Height must be an integer." };
  }

  const preprocessorResult = parsePreprocessors(values.preprocessors);
  if (preprocessorResult.error || !preprocessorResult.preprocessors) {
    return {
      error: preprocessorResult.error ?? "Config: Preprocessors are invalid.",
    };
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

function PointCloudSpecToFormState(
  source: PointCloudSpec,
): PointCloudSpecFormState {
  return {
    name: formatUnknown(source.name),
    description: source.description ?? "",
    group_ids: source.groups.map((group) => group.id),
    dtype: source.config?.dtype ?? DEFAULT_DTYPE,
    channel_headers: formatChannelHeaders(source.config?.channel_headers),
    width: source.config?.width == null ? "" : String(source.config.width),
    height: source.config?.height == null ? "" : String(source.config.height),
    preprocessors: formatPreprocessors(source.config?.preprocessors),
  };
}

/**
 * Names the selected groups that a *different* specification already owns.
 *
 * A source group holds at most one specification per data type (the generated
 * link table declares `group_id` unique), so the backend rejects the whole
 * write with a 409 and rolls the assignment back. Surfacing the owner here lets
 * the form say so at the picker instead of flashing a message at the top of a
 * scrolled modal after the round trip.
 */
export function describeGroupOwnerConflicts(
  groupIds: number[],
  specs: readonly PointCloudSpec[],
  currentSpecId: number | null,
): string | null {
  const selected = new Set(groupIds);
  const conflicts = specs
    .filter((spec) => spec.id !== currentSpecId)
    .flatMap((spec) =>
      spec.groups
        .filter((group) => selected.has(group.id))
        .map((group) => ({
          group: formatUnknown(group.name),
          owner: formatUnknown(spec.name),
        })),
    );

  if (conflicts.length === 0) {
    return null;
  }

  return `Each source group can hold only one point cloud specification. Unassign ${conflicts
    .map((conflict) => `${conflict.group} from ${conflict.owner}`)
    .join("; ")} first.`;
}

/**
 * Whether a batch group assignment can hold at all.
 *
 * Replacing the groups of more than one specification with the same list would
 * hand every listed group to several specifications, which the single
 * specification-per-group rule forbids; the backend rejects it outright.
 */
export function describeBatchGroupConflicts(
  specIds: number[],
  groupIds: number[],
  specs: readonly PointCloudSpec[],
): string | null {
  if (groupIds.length === 0) {
    return null;
  }
  if (specIds.length > 1) {
    return "Groups can only be assigned to one specification at a time, because each source group holds a single point cloud specification.";
  }
  return describeGroupOwnerConflicts(groupIds, specs, specIds.at(0) ?? null);
}

function createPayloadFromFormData(formData: FormData): {
  data?: PointCloudSpecCreate;
  error?: string;
} {
  const name = trimFormValue(formData, "name");
  if (!Name.regex.test(name)) {
    return { error: `Name: ${Name.helperText}` };
  }

  const groupIds = parseGroupIds(trimFormValue(formData, "group_ids"));
  if (!groupIds) {
    return { error: "Specification groups are invalid." };
  }

  const configResult = buildConfigFromValues({
    dtype: trimFormValue(formData, "dtype"),
    channel_headers: trimFormValue(formData, "channel_headers"),
    width: trimFormValue(formData, "width"),
    height: trimFormValue(formData, "height"),
    preprocessors: trimFormValue(formData, "preprocessors"),
  });
  if (configResult.error || !configResult.config) {
    return { error: configResult.error ?? "Config is required." };
  }

  return {
    data: {
      name,
      description: trimFormValue(formData, "description"),
      group_ids: groupIds,
      config: configResult.config,
    },
  };
}

function updatePayloadFromFormData(formData: FormData): {
  data?: PointCloudSpecUpdate;
  error?: string;
} {
  const name = trimFormValue(formData, "name");
  if (!Name.regex.test(name)) {
    return { error: `Name: ${Name.helperText}` };
  }

  const groupIds = parseGroupIds(trimFormValue(formData, "group_ids"));
  if (!groupIds) {
    return { error: "Specification groups are invalid." };
  }

  const configResult = buildConfigFromValues({
    dtype: trimFormValue(formData, "dtype"),
    channel_headers: trimFormValue(formData, "channel_headers"),
    width: trimFormValue(formData, "width"),
    height: trimFormValue(formData, "height"),
    preprocessors: trimFormValue(formData, "preprocessors"),
  });
  if (configResult.error || !configResult.config) {
    return { error: configResult.error ?? "Config is required." };
  }

  return {
    data: {
      name,
      description: trimFormValue(formData, "description"),
      group_ids: groupIds,
      config: configResult.config,
    },
  };
}

function batchPayloadFromFormData(formData: FormData): {
  data?: PointCloudSpecUpdate;
  error?: string;
} {
  const updateName = formData.get("update_name") === "true";
  const updateDescription = formData.get("update_description") === "true";
  const updateGroups = formData.get("update_groups") === "true";
  const updateConfig = formData.get("update_config") === "true";

  if (!updateName && !updateDescription && !updateGroups && !updateConfig) {
    return { error: "Select at least one field group to update." };
  }

  const data: PointCloudSpecUpdate = {};

  if (updateName) {
    const name = trimFormValue(formData, "name");
    if (!Name.regex.test(name)) {
      return { error: `Name: ${Name.helperText}` };
    }
    data.name = name;
  }

  if (updateDescription) {
    data.description = trimFormValue(formData, "description");
  }

  if (updateGroups) {
    const groupIds = parseGroupIds(trimFormValue(formData, "group_ids"));
    if (!groupIds) {
      return { error: "Specification groups are invalid." };
    }
    data.group_ids = groupIds;
  }

  if (updateConfig) {
    const configResult = buildConfigFromValues({
      dtype: trimFormValue(formData, "dtype"),
      channel_headers: trimFormValue(formData, "channel_headers"),
      width: trimFormValue(formData, "width"),
      height: trimFormValue(formData, "height"),
      preprocessors: trimFormValue(formData, "preprocessors"),
    });
    if (configResult.error || !configResult.config) {
      return { error: configResult.error ?? "Config is required." };
    }
    data.config = configResult.config;
  }

  return { data };
}

interface PointCloudSpecFieldsProps<TState extends PointCloudSpecFormState> {
  formData: TState;
  sourceGroups: SourceGroupPublic[];
  preprocessorSchema: OpenAPIJSONSchema;
  readOnly: boolean;
  groupConflict: string | null;
  onChange: <K extends Exclude<keyof PointCloudSpecFormState, "group_ids">>(
    field: K,
    value: string,
  ) => void;
  onGroupsChange: (groupIds: number[]) => void;
}

function PointCloudSpecFields<TState extends PointCloudSpecFormState>({
  formData,
  sourceGroups,
  preprocessorSchema,
  readOnly,
  groupConflict,
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
          onChange={(event) => onChange("name", event.target.value)}
        />
        {!readOnly && (
          <Form.Text className="text-muted">{Name.helperText}</Form.Text>
        )}
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Label>Source Groups</Form.Label>
        <input
          type="hidden"
          name="group_ids"
          value={JSON.stringify(formData.group_ids)}
        />
        <SelectMultiplePicker
          items={sourceGroups.map((group) => ({
            id: group.id,
            label: formatUnknown(group.name),
          }))}
          value={formData.group_ids}
          onChange={onGroupsChange}
          disabled={readOnly}
        />
        {!readOnly && groupConflict && (
          <div className="text-danger small">{groupConflict}</div>
        )}
        {!readOnly && (
          <Form.Text className="text-muted">
            A specification parses the data of every group it lists, and a group
            can only be listed by one specification at a time. Leave this empty
            to keep the specification unassigned.
          </Form.Text>
        )}
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Label>Description</Form.Label>
        <Form.Control
          as="textarea"
          rows={3}
          name="description"
          value={formData.description}
          readOnly={readOnly}
          onChange={(event) => onChange("description", event.target.value)}
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
          onChange={(event) => onChange("dtype", event.target.value)}
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
          onChange={(value) => onChange("channel_headers", value)}
        />
        {!readOnly && (
          <Form.Text className="text-muted">
            Press Enter, Tab, or comma to add each channel header.
          </Form.Text>
        )}
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
            onChange={(event) => onChange("width", event.target.value)}
          />
          <InputGroup.Text>Height</InputGroup.Text>
          <Form.Control
            type="number"
            step={1}
            name="height"
            value={formData.height}
            readOnly={readOnly}
            onChange={(event) => onChange("height", event.target.value)}
          />
        </InputGroup>
      </Form.Group>

      <ConfigFieldTabs
        label="Preprocessors"
        name="preprocessors"
        text={formData.preprocessors}
        onTextChange={(text) => onChange("preprocessors", text)}
        parse={preprocessorDrafts}
        format={jsonFromPreprocessorDrafts}
        emptyValue={[]}
        schema={preprocessorSchema}
        readOnly={readOnly}
        editor={preprocessorEditor}
      />
    </>
  );
}

/** The preprocessor cards shown on the field tab of the raw-text editor. */
function preprocessorEditor({
  value,
  disabled,
  onChange,
}: ConfigEditorState<PreprocessorDrafts>) {
  return (
    <PreprocessorFields
      drafts={value}
      disabled={disabled}
      onChange={onChange}
    />
  );
}

export async function loader({ request }: Route.LoaderArgs) {
  const authenticated = await loadAuthenticatedSession(request);
  if (authenticated instanceof Response) return authenticated;
  const { token, user } = authenticated;

  const [sourcesRes, sourceGroupsRes] = await Promise.all([
    listSpecsSourceSpecPcdSpecsGet({ auth: token.access_token }),
    listGroupsSourceGroupsGet({ auth: token.access_token }),
  ]);
  const openApiJson = await getOpenApiJson();
  const preprocessorSchema = expandOpenApiSchema(
    openApiJson,
    openApiJson.components.schemas.PointCloudConfig?.properties
      ?.preprocessors ?? {},
  );

  const dataset = (sourcesRes.data ?? [])
    .slice()
    .sort((left, right) =>
      formatUnknown(left.name).localeCompare(formatUnknown(right.name)),
    );
  const sourceGroups = (sourceGroupsRes.data ?? [])
    .slice()
    .sort((left, right) =>
      formatUnknown(left.name).localeCompare(formatUnknown(right.name)),
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

export const clientLoader =
  createSlickgridClientLoader<Route.ClientLoaderArgs>();

export async function action({ request }: Route.ActionArgs) {
  const authenticated = await loadAccessTokenSession(request);
  if (authenticated instanceof Response) return authenticated;
  const { token } = authenticated;

  const formData = await request.formData();
  const actionType = formData.get("_action");

  if (actionType === "create") {
    const payload = createPayloadFromFormData(formData);
    if (payload.error || !payload.data) {
      return {
        error: payload.error ?? "Unable to create point cloud source.",
      };
    }

    const res = await createSpecSourceSpecPcdSpecsPost({
      auth: token.access_token,
      body: payload.data,
    });
    if (res.error) {
      return { error: normalizeError(res.error), resyncGroups: true };
    }

    return {
      success: "Point cloud source created successfully.",
      queuedJobIds: reportedJobIds(res),
    };
  }

  if (actionType === "update") {
    const id = Number.parseInt(trimFormValue(formData, "id"), 10);
    if (Number.isNaN(id)) {
      return { error: "A valid point cloud source ID is required." };
    }

    const payload = updatePayloadFromFormData(formData);
    if (payload.error || !payload.data) {
      return {
        error: payload.error ?? "Unable to update point cloud source.",
      };
    }

    const res = await updateSpecSourceSpecPcdSpecsIdPatch({
      auth: token.access_token,
      path: { id },
      body: {
        ...payload.data,
        issued_at: trimFormValue(formData, "issued_at"),
      },
    });
    if (res.error) {
      return { error: normalizeError(res.error), resyncGroups: true };
    }

    return {
      success: "Point cloud source updated successfully.",
      queuedJobIds: reportedJobIds(res),
    };
  }

  if (actionType === "delete") {
    const id = Number.parseInt(trimFormValue(formData, "id"), 10);
    if (Number.isNaN(id)) {
      return { error: "A valid point cloud source ID is required." };
    }

    const res = await deleteSpecSourceSpecPcdSpecsIdDelete({
      auth: token.access_token,
      path: { id },
    });
    if (res.error) {
      return { error: normalizeError(res.error) };
    }

    return {
      success: "Point cloud source deleted successfully.",
      queuedJobIds: reportedJobIds(res),
    };
  }

  if (actionType === "batch_update") {
    const selectedIds = parseSelectedIds(
      trimFormValue(formData, "selectedIds"),
    );
    if (!selectedIds || selectedIds.length === 0) {
      return {
        error: "Select at least one point cloud source to update.",
      };
    }

    const payload = batchPayloadFromFormData(formData);
    if (payload.error || !payload.data) {
      return {
        error: payload.error ?? "Unable to batch update point cloud sources.",
      };
    }

    const res = await bulkUpdateSpecsSourceSpecPcdSpecsBulkPatch({
      auth: token.access_token,
      body: { ids: selectedIds, data: payload.data },
    });
    if (res.error) {
      return { error: normalizeError(res.error) };
    }

    return {
      success:
        selectedIds.length === 1
          ? "Point cloud source updated successfully."
          : `${selectedIds.length} point cloud sources updated successfully.`,
      queuedJobIds: reportedJobIds(res),
    };
  }

  if (actionType === "batch_delete") {
    const selectedIds = parseSelectedIds(
      trimFormValue(formData, "selectedIds"),
    );
    if (!selectedIds || selectedIds.length === 0) {
      return {
        error: "Select at least one point cloud source to delete.",
      };
    }

    const res = await bulkDeleteSpecsSourceSpecPcdSpecsBulkDelete({
      auth: token.access_token,
      body: selectedIds,
    });
    if (res.error) {
      return { error: normalizeError(res.error) };
    }

    return {
      success:
        selectedIds.length === 1
          ? "Point cloud source deleted successfully."
          : `${selectedIds.length} point cloud sources deleted successfully.`,
      queuedJobIds: reportedJobIds(res),
    };
  }

  return { error: "Unknown action." };
}

function PointCloudSpecsTable({
  SG,
  user,
  dataset,
  sourceGroups,
  preprocessorSchema,
  actionData,
}: {
  SG: typeof import("slickgrid-react");
  user: User;
  dataset: PointCloudSpec[];
  sourceGroups: SourceGroupPublic[];
  preprocessorSchema: OpenAPIJSONSchema;
  actionData?: Route.ComponentProps["actionData"];
}) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [gridOptions, setGridOptions] = useState<GridOption | undefined>(
    undefined,
  );
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingSpecification, setEditingSpecification] =
    useState<PointCloudSpec | null>(null);
  const [showBatchEditModal, setShowBatchEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [sourceToDelete, setSpecificationToDelete] =
    useState<PointCloudSpec | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobsNotice, setJobsNotice] = useState<JobsNotice | null>(null);
  const [formData, setFormData] = useState<PointCloudSpecFormState>(EMPTY_FORM);
  const [batchFormData, setBatchFormData] =
    useState<BatchPointCloudSpecFormState>(EMPTY_BATCH_FORM);
  const reactGridRef = useRef<SlickgridReactInstance | null>(null);

  const { SlickgridReact } = SG;
  const canManage = user.roles.includes("data-manager");
  const navigation = useNavigation();
  const isBusy = navigation.state !== "idle";

  const groupConflict = describeGroupOwnerConflicts(
    formData.group_ids,
    dataset,
    editingSpecification?.id ?? null,
  );
  const batchGroupConflict = batchFormData.update_groups
    ? describeBatchGroupConflicts(selectedIds, batchFormData.group_ids, dataset)
    : null;
  const batchFieldsSelected =
    batchFormData.update_name ||
    batchFormData.update_description ||
    batchFormData.update_groups ||
    batchFormData.update_config;

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
      // A rejected write changed nothing, so the picker must stop showing the
      // groups that were just refused. Client-side validation failures never
      // reach the backend and keep the draft as typed.
      if (actionData.resyncGroups) {
        setFormData((previous) => ({
          ...previous,
          group_ids: editingSpecification
            ? editingSpecification.groups.map((group) => group.id)
            : [],
        }));
      }
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
      // The write reports what the queue took on, so a save that started nothing says
      // nothing rather than sending the reader to a list with no row of theirs in it.
      const queued = actionData.queuedJobIds ?? [];
      setJobsNotice(
        queued.length > 0
          ? { count: queued.length, href: jobsQueueHref(queued) }
          : null,
      );
    }
    // Only the arrival of a new action result may drive this state: re-running
    // on an open form would replay the previous submission.
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
        command: "edit",
        title: canManage ? "Edit Details" : "View Details",
        iconCssClass: canManage
          ? "fas fa-edit fa-fw"
          : "fas fa-info-circle fa-fw",
        action: (_event, args) => handleEdit(args.dataContext),
        // A read-only user has no batch command to take its place, and viewing
        // the right-clicked row is not the narrowing the gate exists to stop.
        itemVisibilityOverride: () =>
          !canManage || getAllSelectedItems().length === 1,
      },
    ];

    if (canManage) {
      commandItems.push({
        command: "batch_edit",
        title: "Batch Edit Details",
        iconCssClass: "fas fa-layer-group fa-fw",
        action: () => handleBatchEdit(),
        itemVisibilityOverride: () => getAllSelectedItems().length > 1,
      });
      commandItems.push({
        command: "batch_delete",
        title: "Batch Delete",
        iconCssClass: "fas fa-trash fa-fw",
        action: () => handleBatchDelete(),
        itemVisibilityOverride: () => getAllSelectedItems().length > 1,
      });
      commandItems.push({
        command: "delete",
        title: "Delete",
        iconCssClass: "fas fa-trash fa-fw",
        action: (_event, args) => handleDelete(args.dataContext),
        itemVisibilityOverride: () => getAllSelectedItems().length === 1,
      });
    }

    setColumns([
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
        formatter: (_row, _cell, value) => formatUnknown(value),
      },
      {
        id: "groups",
        name: "Groups",
        field: "groups",
        type: "string",
        filterable: false,
        sortable: false,
        formatter: (_row, _cell, _value, _columnDef, dataContext) =>
          formatGroups(dataContext.groups),
      },
      {
        id: "dtype",
        name: "Data Type",
        field: "config",
        type: "string",
        filterable: false,
        sortable: false,
        formatter: (_row, _cell, _value, _columnDef, dataContext) =>
          dataContext.config?.dtype ?? "-",
      },
      {
        id: "channels",
        name: "# Channels",
        field: "config",
        type: "string",
        filterable: false,
        sortable: false,
        formatter: (_row, _cell, _value, _columnDef, dataContext) =>
          formatChannelCount(dataContext.config),
      },
      {
        id: "preprocessors",
        name: "# Preprocessors",
        field: "config",
        type: "integer",
        filterable: false,
        sortable: false,
        formatter: (_row, _cell, _value, _columnDef, dataContext) =>
          String(dataContext.config?.preprocessors?.length ?? 0),
      },
    ]);

    setGridOptions({
      ...(selectableConfig({
        commandItems: commandItems as never,
        multiSelect: true,
      }) as unknown as GridOption),
      autoResize: { container: "#grid-container" },
      enableAutoResize: true,
    });
  }

  function onSelectAll() {
    const numFiltered =
      reactGridRef.current?.dataView.getFilteredItemCount() ?? 0;
    reactGridRef.current?.gridService.setSelectedRows(
      Array.from({ length: numFiltered }, (_, index) => index),
    );
    setSelectedIds(dataset.map((item) => item.id));
  }

  function onDeselectAll() {
    reactGridRef.current?.gridService.setSelectedRows([]);
    setSelectedIds([]);
  }

  function onGridStateChanged() {
    setSelectedIds(getAllSelectedItems().map((item) => item.id));
  }

  function reactGridReady(reactGrid: SlickgridReactInstance) {
    reactGridRef.current = reactGrid;
  }

  function updateFormField<
    K extends Exclude<keyof PointCloudSpecFormState, "group_ids">,
  >(field: K, value: string) {
    setFormData((previous) => ({ ...previous, [field]: value }));
  }

  function updateFormGroups(groupIds: number[]) {
    setFormData((previous) => ({ ...previous, group_ids: groupIds }));
  }

  function updateBatchField<
    K extends Exclude<keyof PointCloudSpecFormState, "group_ids">,
  >(field: K, value: string) {
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
      {jobsNotice && (
        <Alert
          variant="info"
          dismissible
          className="mb-3"
          onClose={() => setJobsNotice(null)}
        >
          {jobsNotice.count === 1
            ? "Started 1 background job to re-derive the spatial bounds this save changed."
            : `Started ${jobsNotice.count} background jobs to re-derive the spatial bounds this save changed.`}{" "}
          <Link to={jobsNotice.href}>View them in the job queue</Link>.
        </Alert>
      )}

      <div className="mb-3 text-muted">
        Parse and preprocess point clouds assigned to each source group.
      </div>

      <div className="mb-3 d-flex gap-2">
        <ButtonGroup className="justify-content-start me-auto">
          {canManage && (
            <Button variant="primary" onClick={handleCreate}>
              Create Point Cloud Specification
            </Button>
          )}
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
              ? canManage
                ? "Edit Point Cloud Specification"
                : "View Point Cloud Specification"
              : "Create Point Cloud Specification"}
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
              value={editingSpecification ? "update" : "create"}
            />
            {editingSpecification && (
              <>
                <input
                  type="hidden"
                  name="id"
                  value={editingSpecification.id}
                />
                <input
                  type="hidden"
                  name="issued_at"
                  value={editingSpecification.last_edit_at ?? ""}
                />
              </>
            )}

            <PointCloudSpecFields
              formData={formData}
              sourceGroups={sourceGroups}
              preprocessorSchema={preprocessorSchema}
              readOnly={!canManage}
              groupConflict={groupConflict}
              onChange={updateFormField}
              onGroupsChange={updateFormGroups}
            />
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              {canManage ? "Cancel" : "Close"}
            </Button>
            {canManage && (
              <Button
                variant="primary"
                type="submit"
                disabled={isBusy || groupConflict !== null}
              >
                {isBusy ? "Saving…" : "Save"}
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
            Batch Edit Point Cloud Specifications ({selectedIds.length}{" "}
            selected)
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
              name="update_name"
              value={String(batchFormData.update_name)}
            />
            <input
              type="hidden"
              name="update_description"
              value={String(batchFormData.update_description)}
            />
            <input
              type="hidden"
              name="update_groups"
              value={String(batchFormData.update_groups)}
            />
            <input
              type="hidden"
              name="update_config"
              value={String(batchFormData.update_config)}
            />
            <input
              type="hidden"
              name="group_ids"
              value={JSON.stringify(batchFormData.group_ids)}
            />

            <BatchSection
              label="Update Name"
              checked={batchFormData.update_name}
              onToggle={(checked) => updateBatchToggle("update_name", checked)}
            >
              <Form.Control
                type="text"
                name="name"
                value={batchFormData.name}
                onChange={(event) =>
                  updateBatchField("name", event.target.value)
                }
                placeholder="Name"
              />
              <Form.Text className="text-muted d-block mt-2">
                Replaces the name of every selected specification.
              </Form.Text>
              <Form.Text className="text-muted d-block">
                {Name.helperText}
              </Form.Text>
            </BatchSection>

            <BatchSection
              label="Update Description"
              checked={batchFormData.update_description}
              onToggle={(checked) =>
                updateBatchToggle("update_description", checked)
              }
            >
              <Form.Control
                as="textarea"
                rows={3}
                name="description"
                value={batchFormData.description}
                onChange={(event) =>
                  updateBatchField("description", event.target.value)
                }
                placeholder="Leave empty to clear"
              />
              <Form.Text className="text-muted">
                Replaces the description of every selected specification. Leave
                it empty to clear the value on all of them.
              </Form.Text>
            </BatchSection>

            <BatchSection
              label="Update Source Groups"
              checked={batchFormData.update_groups}
              onToggle={(checked) =>
                updateBatchToggle("update_groups", checked)
              }
            >
              <SelectMultiplePicker
                items={sourceGroups.map((group) => ({
                  id: group.id,
                  label: formatUnknown(group.name),
                }))}
                value={batchFormData.group_ids}
                onChange={updateBatchGroups}
              />
              {batchGroupConflict && (
                <div className="text-danger small">{batchGroupConflict}</div>
              )}
              <Form.Text className="text-muted">
                Every selected specification ends up with exactly this list, and
                the same list is applied to all of them. Assigning groups
                replaces what each selected specification currently lists, and
                clearing every group leaves them unassigned.
              </Form.Text>
            </BatchSection>

            <BatchSection
              label="Update Config"
              checked={batchFormData.update_config}
              onToggle={(checked) =>
                updateBatchToggle("update_config", checked)
              }
            >
              <Form.Text className="text-muted d-block mb-3">
                Replaces the whole data configuration of every selected
                specification with the values below.
              </Form.Text>
              <Form.Group className="mb-3">
                <Form.Label>Data Type</Form.Label>
                <Form.Control
                  type="text"
                  name="dtype"
                  value={batchFormData.dtype}
                  onChange={(event) =>
                    updateBatchField("dtype", event.target.value)
                  }
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Channel Headers</Form.Label>
                <ChannelHeadersPillsInput
                  name="channel_headers"
                  value={batchFormData.channel_headers}
                  readOnly={false}
                  onChange={(value) =>
                    updateBatchField("channel_headers", value)
                  }
                />
                <Form.Text className="text-muted">
                  Press Enter, Tab, or comma to add each channel header.
                </Form.Text>
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
                    onChange={(event) =>
                      updateBatchField("width", event.target.value)
                    }
                  />
                  <InputGroup.Text>Height</InputGroup.Text>
                  <Form.Control
                    type="number"
                    step={1}
                    name="height"
                    value={batchFormData.height}
                    onChange={(event) =>
                      updateBatchField("height", event.target.value)
                    }
                  />
                </InputGroup>
              </Form.Group>
              <ConfigFieldTabs
                label="Preprocessors"
                name="preprocessors"
                text={batchFormData.preprocessors}
                onTextChange={(text) => updateBatchField("preprocessors", text)}
                parse={preprocessorDrafts}
                format={jsonFromPreprocessorDrafts}
                emptyValue={[]}
                schema={preprocessorSchema}
                editor={preprocessorEditor}
              />
            </BatchSection>

            {!batchFieldsSelected && (
              <Alert variant="info">
                Choose one or more field groups to apply to the selected point
                cloud sources.
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
                isBusy || !batchFieldsSelected || batchGroupConflict !== null
              }
            >
              {isBusy
                ? "Applying…"
                : `Apply to ${selectedIds.length} Point Cloud Specifications`}
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
            {sourceToDelete ? (
              <>
                <input type="hidden" name="_action" value="delete" />
                <input type="hidden" name="id" value={sourceToDelete.id} />
                <p>
                  Are you sure you want to delete point cloud source{" "}
                  <strong>{formatUnknown(sourceToDelete.name)}</strong>?
                </p>
              </>
            ) : (
              <>
                <input type="hidden" name="_action" value="batch_delete" />
                <input
                  type="hidden"
                  name="selectedIds"
                  value={JSON.stringify(selectedIds)}
                />
                <p>
                  Are you sure you want to delete {selectedIds.length} selected{" "}
                  {selectedIds.length === 1
                    ? "point cloud source"
                    : "point cloud sources"}
                  ?
                </p>
              </>
            )}
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
              Delete
            </Button>
          </Modal.Footer>
        </RouterForm>
      </Modal>
    </>
  );
}

export function HydrateFallback() {
  return <div>Loading point cloud sources...</div>;
}

export default function PointCloudSpecs({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { SG, user, dataset, sourceGroups, preprocessorSchema, loaderError } =
    loaderData;

  return createPageContent({
    title: "Point Cloud Specifications",
    header: (
      <>
        <Breadcrumb className="mb-1">
          <Breadcrumb.Item href="/source/specs">
            Source Specifications
          </Breadcrumb.Item>
          <Breadcrumb.Item active>Point Cloud Specifications</Breadcrumb.Item>
        </Breadcrumb>
        <h2 className="py-2">Point Cloud Specifications</h2>
      </>
    ),
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
