import { useEffect, useRef, useState } from 'react';
import { Alert, Breadcrumb, Button, ButtonGroup, Col, Form, Modal, Row } from 'react-bootstrap';
import { Form as RouterForm, useActionData, useLoaderData } from 'react-router';
import type { Column, GridOption, MenuCommandItem, SlickgridReactInstance } from 'slickgrid-react';

import { BatchSection } from '../../../../../app/components/BatchSection';
import { VectorInputFields, type VectorField } from '../../../../../app/components/VectorInputFields';
import { selectableConfig } from '../../../../../app/components/slickgrid/options';
import {
  bulkDeleteMetadatasSourceDataGmeshMetadataBulkDelete,
  bulkUpdateMetadatasSourceDataGmeshMetadataBulkPatch,
  createMetadataSourceDataGmeshMetadataPost,
  deleteMetadataSourceDataGmeshMetadataIdDelete,
  listGroupsSourceGroupsGet,
  listMetadatasSourceDataGmeshMetadataGet,
  type GroundMeshMetadataSqlModel,
  type SourceGroupPublic as SourceGroup,
  type TransformSqlMixinUpdate,
  updateMetadataSourceDataGmeshMetadataIdPatch,
} from '../../../../../client';
import { clearUser, getCurrentSession, getUser, redirectAndCommit } from '../../../../../app/loaders';
import { DecimalCoord, DecimalCoord3, DecimalSize, DecimalSize3, FileURI } from '../../../../../app/models/types';
import { createPageContent } from '../../../../../app/templates';

import type { Route } from './+types/metadata';


type CurrentUser = {
  roles: string[];
};

type GroundMeshMetadata = {
  last_edit_at?: string | null;
  min_x?: string | null;
  min_y?: string | null;
  min_z?: string | null;
  max_x?: string | null;
  max_y?: string | null;
  max_z?: string | null;
  min_timestamp?: string | null;
  max_timestamp?: string | null;
  group_id: number;
  uri: unknown;
  translate_x?: string | null;
  translate_y?: string | null;
  translate_z?: string | null;
  rotate_x?: string | null;
  rotate_y?: string | null;
  rotate_z?: string | null;
  scale_x?: string | null;
  scale_y?: string | null;
  scale_z?: string | null;
  id: number;
  group: SourceGroup;
};

type GroundMeshMetadataFormState = {
  group_id: string;
  uri: string;
  min_x: string;
  min_y: string;
  min_z: string;
  max_x: string;
  max_y: string;
  max_z: string;
  min_timestamp: string;
  max_timestamp: string;
  translate_x: string;
  translate_y: string;
  translate_z: string;
  rotate_x: string;
  rotate_y: string;
  rotate_z: string;
  scale_x: string;
  scale_y: string;
  scale_z: string;
};

type BatchGroundMeshMetadataFormState = GroundMeshMetadataFormState & {
  update_group: boolean;
  update_uri: boolean;
  update_min_bounds: boolean;
  update_max_bounds: boolean;
  update_timestamps: boolean;
  update_translate: boolean;
  update_rotate: boolean;
  update_scale: boolean;
};

type BatchToggleKey = keyof Pick<
  BatchGroundMeshMetadataFormState,
  'update_group'
  | 'update_uri'
  | 'update_min_bounds'
  | 'update_max_bounds'
  | 'update_timestamps'
  | 'update_translate'
  | 'update_rotate'
  | 'update_scale'
>;

type LoaderData = {
  user: CurrentUser;
  dataset: GroundMeshMetadata[];
  sourceGroups: SourceGroup[];
  loaderError?: string;
};

type ActionData = {
  success?: string;
  error?: string;
};

type SlickgridModule = any;

const EMPTY_FORM: GroundMeshMetadataFormState = {
  group_id: '',
  uri: '',
  min_x: formatFixedDecimal('0', DecimalCoord.places),
  min_y: formatFixedDecimal('0', DecimalCoord.places),
  min_z: formatFixedDecimal('0', DecimalCoord.places),
  max_x: formatFixedDecimal('0', DecimalCoord.places),
  max_y: formatFixedDecimal('0', DecimalCoord.places),
  max_z: formatFixedDecimal('0', DecimalCoord.places),
  min_timestamp: '',
  max_timestamp: '',
  translate_x: formatFixedDecimal('0', DecimalCoord.places),
  translate_y: formatFixedDecimal('0', DecimalCoord.places),
  translate_z: formatFixedDecimal('0', DecimalCoord.places),
  rotate_x: formatFixedDecimal('0', DecimalCoord.places),
  rotate_y: formatFixedDecimal('0', DecimalCoord.places),
  rotate_z: formatFixedDecimal('0', DecimalCoord.places),
  scale_x: formatFixedDecimal('1', DecimalSize.places),
  scale_y: formatFixedDecimal('1', DecimalSize.places),
  scale_z: formatFixedDecimal('1', DecimalSize.places),
};

const EMPTY_BATCH_FORM: BatchGroundMeshMetadataFormState = {
  ...EMPTY_FORM,
  min_x: '',
  min_y: '',
  min_z: '',
  max_x: '',
  max_y: '',
  max_z: '',
  translate_x: '',
  translate_y: '',
  translate_z: '',
  rotate_x: '',
  rotate_y: '',
  rotate_z: '',
  scale_x: '',
  scale_y: '',
  scale_z: '',
  update_group: false,
  update_uri: false,
  update_min_bounds: false,
  update_max_bounds: false,
  update_timestamps: false,
  update_translate: false,
  update_rotate: false,
  update_scale: false,
};

const MIN_BOUND_FIELDS: VectorField<keyof GroundMeshMetadataFormState>[] = [
  { key: 'min_x', label: 'Min X', axis: 'X' },
  { key: 'min_y', label: 'Min Y', axis: 'Y' },
  { key: 'min_z', label: 'Min Z', axis: 'Z' },
];

const MAX_BOUND_FIELDS: VectorField<keyof GroundMeshMetadataFormState>[] = [
  { key: 'max_x', label: 'Max X', axis: 'X' },
  { key: 'max_y', label: 'Max Y', axis: 'Y' },
  { key: 'max_z', label: 'Max Z', axis: 'Z' },
];

const TRANSLATE_FIELDS: VectorField<keyof GroundMeshMetadataFormState>[] = [
  { key: 'translate_x', label: 'Translate X', axis: 'X' },
  { key: 'translate_y', label: 'Translate Y', axis: 'Y' },
  { key: 'translate_z', label: 'Translate Z', axis: 'Z' },
];

const ROTATE_FIELDS: VectorField<keyof GroundMeshMetadataFormState>[] = [
  { key: 'rotate_x', label: 'Rotate X', axis: 'X' },
  { key: 'rotate_y', label: 'Rotate Y', axis: 'Y' },
  { key: 'rotate_z', label: 'Rotate Z', axis: 'Z' },
];

const SCALE_FIELDS: VectorField<keyof GroundMeshMetadataFormState>[] = [
  { key: 'scale_x', label: 'Scale X', axis: 'X' },
  { key: 'scale_y', label: 'Scale Y', axis: 'Y' },
  { key: 'scale_z', label: 'Scale Z', axis: 'Z' },
];

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

function trimFormValue(formData: FormData, name: keyof GroundMeshMetadataFormState | 'id' | 'selectedIds'): string {
  return String(formData.get(name) ?? '').trim();
}

function toOptionalCreateValue(value: string): string | undefined {
  return value.trim() === '' ? undefined : value.trim();
}

function toOptionalUpdateValue(value: string): string | null {
  return value.trim() === '' ? null : value.trim();
}

function parseGroupId(value: string): number | null {
  if (value.trim() === '') {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
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

function formatUnknown(value: unknown): string {
  return value == null ? '' : String(value);
}

function toDateTimeInputValue(value: string | null | undefined): string {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const pad = (input: number) => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoDateTimeValue(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function toOptionalCreateDateTimeValue(value: string): string | undefined {
  return value.trim() === '' ? undefined : toIsoDateTimeValue(value.trim());
}

function toOptionalUpdateDateTimeValue(value: string): string | null {
  return value.trim() === '' ? null : toIsoDateTimeValue(value.trim());
}

function formatFixedDecimal(value: string | null | undefined, places: number): string {
  if (value == null || value === '') {
    return '';
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? numericValue.toFixed(places)
    : String(value);
}

function validateGroundMeshMetadataVectors(formData: FormData): string | null {
  const minCoordsError = DecimalCoord3.validate({
    x: trimFormValue(formData, 'min_x'),
    y: trimFormValue(formData, 'min_y'),
    z: trimFormValue(formData, 'min_z'),
  }, { allowEmpty: false });
  if (minCoordsError) {
    return `Minimum coordinates: ${minCoordsError}`;
  }

  const maxCoordsError = DecimalCoord3.validate({
    x: trimFormValue(formData, 'max_x'),
    y: trimFormValue(formData, 'max_y'),
    z: trimFormValue(formData, 'max_z'),
  }, { allowEmpty: false });
  if (maxCoordsError) {
    return `Maximum coordinates: ${maxCoordsError}`;
  }

  const translationError = DecimalCoord3.validate({
    x: trimFormValue(formData, 'translate_x'),
    y: trimFormValue(formData, 'translate_y'),
    z: trimFormValue(formData, 'translate_z'),
  }, { allowEmpty: false });
  if (translationError) {
    return `Translation: ${translationError}`;
  }

  const rotationError = DecimalCoord3.validate({
    x: trimFormValue(formData, 'rotate_x'),
    y: trimFormValue(formData, 'rotate_y'),
    z: trimFormValue(formData, 'rotate_z'),
  }, { allowEmpty: false });
  if (rotationError) {
    return `Rotation: ${rotationError}`;
  }

  const scaleError = DecimalSize3.validate({
    x: trimFormValue(formData, 'scale_x'),
    y: trimFormValue(formData, 'scale_y'),
    z: trimFormValue(formData, 'scale_z'),
  }, { allowEmpty: false });
  if (scaleError) {
    return `Scale: ${scaleError}`;
  }

  return null;
}

function groundMeshMetadataToFormState(groundMeshMetadata: GroundMeshMetadata): GroundMeshMetadataFormState {
  return {
    group_id: String(groundMeshMetadata.group_id),
    uri: formatUnknown(groundMeshMetadata.uri),
    min_x: formatFixedDecimal(groundMeshMetadata.min_x, DecimalCoord.places),
    min_y: formatFixedDecimal(groundMeshMetadata.min_y, DecimalCoord.places),
    min_z: formatFixedDecimal(groundMeshMetadata.min_z, DecimalCoord.places),
    max_x: formatFixedDecimal(groundMeshMetadata.max_x, DecimalCoord.places),
    max_y: formatFixedDecimal(groundMeshMetadata.max_y, DecimalCoord.places),
    max_z: formatFixedDecimal(groundMeshMetadata.max_z, DecimalCoord.places),
    min_timestamp: toDateTimeInputValue(groundMeshMetadata.min_timestamp),
    max_timestamp: toDateTimeInputValue(groundMeshMetadata.max_timestamp),
    translate_x: formatFixedDecimal(groundMeshMetadata.translate_x, DecimalCoord.places),
    translate_y: formatFixedDecimal(groundMeshMetadata.translate_y, DecimalCoord.places),
    translate_z: formatFixedDecimal(groundMeshMetadata.translate_z, DecimalCoord.places),
    rotate_x: formatFixedDecimal(groundMeshMetadata.rotate_x, DecimalCoord.places),
    rotate_y: formatFixedDecimal(groundMeshMetadata.rotate_y, DecimalCoord.places),
    rotate_z: formatFixedDecimal(groundMeshMetadata.rotate_z, DecimalCoord.places),
    scale_x: formatFixedDecimal(groundMeshMetadata.scale_x, DecimalSize.places),
    scale_y: formatFixedDecimal(groundMeshMetadata.scale_y, DecimalSize.places),
    scale_z: formatFixedDecimal(groundMeshMetadata.scale_z, DecimalSize.places),
  };
}

function createPayloadFromFormData(formData: FormData): { data?: GroundMeshMetadataSqlModel; error?: string } {
  const createBasePayload = createBasePayloadFromFormData(formData);
  if (createBasePayload.error || !createBasePayload.data) {
    return { error: createBasePayload.error ?? 'Unable to create ground mesh metadata.' };
  }

  const uri = trimFormValue(formData, 'uri');
  const uriError = FileURI.validate(uri);
  if (uriError) {
    return { error: uriError };
  }

  return {
    data: {
      ...createBasePayload.data,
      uri,
    },
  };
}

function createBasePayloadFromFormData(formData: FormData): { data?: Omit<GroundMeshMetadataSqlModel, 'uri'>; error?: string } {
  const groupId = parseGroupId(trimFormValue(formData, 'group_id'));
  if (groupId == null) {
    return { error: 'Source group is required.' };
  }

  const vectorError = validateGroundMeshMetadataVectors(formData);
  if (vectorError) {
    return { error: vectorError };
  }

  return {
    data: {
      group_id: groupId,
      min_x: toOptionalCreateValue(trimFormValue(formData, 'min_x')),
      min_y: toOptionalCreateValue(trimFormValue(formData, 'min_y')),
      min_z: toOptionalCreateValue(trimFormValue(formData, 'min_z')),
      max_x: toOptionalCreateValue(trimFormValue(formData, 'max_x')),
      max_y: toOptionalCreateValue(trimFormValue(formData, 'max_y')),
      max_z: toOptionalCreateValue(trimFormValue(formData, 'max_z')),
      min_timestamp: toOptionalCreateDateTimeValue(trimFormValue(formData, 'min_timestamp')),
      max_timestamp: toOptionalCreateDateTimeValue(trimFormValue(formData, 'max_timestamp')),
      translate_x: toOptionalCreateValue(trimFormValue(formData, 'translate_x')),
      translate_y: toOptionalCreateValue(trimFormValue(formData, 'translate_y')),
      translate_z: toOptionalCreateValue(trimFormValue(formData, 'translate_z')),
      rotate_x: toOptionalCreateValue(trimFormValue(formData, 'rotate_x')),
      rotate_y: toOptionalCreateValue(trimFormValue(formData, 'rotate_y')),
      rotate_z: toOptionalCreateValue(trimFormValue(formData, 'rotate_z')),
      scale_x: toOptionalCreateValue(trimFormValue(formData, 'scale_x')),
      scale_y: toOptionalCreateValue(trimFormValue(formData, 'scale_y')),
      scale_z: toOptionalCreateValue(trimFormValue(formData, 'scale_z')),
    },
  };
}

function updatePayloadFromFormData(formData: FormData): { data?: TransformSqlMixinUpdate; error?: string } {
  const groupId = parseGroupId(trimFormValue(formData, 'group_id'));
  if (groupId == null) {
    return { error: 'Source group is required.' };
  }

  const uri = trimFormValue(formData, 'uri');
  const uriError = FileURI.validate(uri);
  if (uriError) {
    return { error: uriError };
  }

  const vectorError = validateGroundMeshMetadataVectors(formData);
  if (vectorError) {
    return { error: vectorError };
  }

  return {
    data: {
      group_id: groupId,
      uri,
      min_x: toOptionalUpdateValue(trimFormValue(formData, 'min_x')),
      min_y: toOptionalUpdateValue(trimFormValue(formData, 'min_y')),
      min_z: toOptionalUpdateValue(trimFormValue(formData, 'min_z')),
      max_x: toOptionalUpdateValue(trimFormValue(formData, 'max_x')),
      max_y: toOptionalUpdateValue(trimFormValue(formData, 'max_y')),
      max_z: toOptionalUpdateValue(trimFormValue(formData, 'max_z')),
      min_timestamp: toOptionalUpdateDateTimeValue(trimFormValue(formData, 'min_timestamp')),
      max_timestamp: toOptionalUpdateDateTimeValue(trimFormValue(formData, 'max_timestamp')),
      translate_x: toOptionalUpdateValue(trimFormValue(formData, 'translate_x')),
      translate_y: toOptionalUpdateValue(trimFormValue(formData, 'translate_y')),
      translate_z: toOptionalUpdateValue(trimFormValue(formData, 'translate_z')),
      rotate_x: toOptionalUpdateValue(trimFormValue(formData, 'rotate_x')),
      rotate_y: toOptionalUpdateValue(trimFormValue(formData, 'rotate_y')),
      rotate_z: toOptionalUpdateValue(trimFormValue(formData, 'rotate_z')),
      scale_x: toOptionalUpdateValue(trimFormValue(formData, 'scale_x')),
      scale_y: toOptionalUpdateValue(trimFormValue(formData, 'scale_y')),
      scale_z: toOptionalUpdateValue(trimFormValue(formData, 'scale_z')),
    },
  };
}

function batchPayloadFromFormData(formData: FormData): { data?: TransformSqlMixinUpdate; error?: string } {
  const updateGroup = formData.get('update_group') === 'true';
  const updateUri = formData.get('update_uri') === 'true';
  const updateMinBounds = formData.get('update_min_bounds') === 'true';
  const updateMaxBounds = formData.get('update_max_bounds') === 'true';
  const updateTimestamps = formData.get('update_timestamps') === 'true';
  const updateTranslate = formData.get('update_translate') === 'true';
  const updateRotate = formData.get('update_rotate') === 'true';
  const updateScale = formData.get('update_scale') === 'true';

  if (!updateGroup && !updateUri && !updateMinBounds && !updateMaxBounds && !updateTimestamps && !updateTranslate && !updateRotate && !updateScale) {
    return { error: 'Select at least one field group to update.' };
  }

  const data: TransformSqlMixinUpdate = {};

  if (updateGroup) {
    data.group_id = parseGroupId(trimFormValue(formData, 'group_id'));
  }
  if (updateUri) {
    const uri = toOptionalUpdateValue(trimFormValue(formData, 'uri'));
    if (uri != null) {
      const uriError = FileURI.validate(uri);
      if (uriError) {
        return { error: uriError };
      }
    }
    data.uri = uri;
  }
  if (updateMinBounds) {
    const minCoordsError = DecimalCoord3.validate({
      x: trimFormValue(formData, 'min_x'),
      y: trimFormValue(formData, 'min_y'),
      z: trimFormValue(formData, 'min_z'),
    }, { allowEmpty: true });
    if (minCoordsError) {
      return { error: `Minimum coordinates: ${minCoordsError}` };
    }
    data.min_x = toOptionalUpdateValue(trimFormValue(formData, 'min_x'));
    data.min_y = toOptionalUpdateValue(trimFormValue(formData, 'min_y'));
    data.min_z = toOptionalUpdateValue(trimFormValue(formData, 'min_z'));
  }
  if (updateMaxBounds) {
    const maxCoordsError = DecimalCoord3.validate({
      x: trimFormValue(formData, 'max_x'),
      y: trimFormValue(formData, 'max_y'),
      z: trimFormValue(formData, 'max_z'),
    }, { allowEmpty: true });
    if (maxCoordsError) {
      return { error: `Maximum coordinates: ${maxCoordsError}` };
    }
    data.max_x = toOptionalUpdateValue(trimFormValue(formData, 'max_x'));
    data.max_y = toOptionalUpdateValue(trimFormValue(formData, 'max_y'));
    data.max_z = toOptionalUpdateValue(trimFormValue(formData, 'max_z'));
  }
  if (updateTimestamps) {
    data.min_timestamp = toOptionalUpdateDateTimeValue(trimFormValue(formData, 'min_timestamp'));
    data.max_timestamp = toOptionalUpdateDateTimeValue(trimFormValue(formData, 'max_timestamp'));
  }
  if (updateTranslate) {
    const translationError = DecimalCoord3.validate({
      x: trimFormValue(formData, 'translate_x'),
      y: trimFormValue(formData, 'translate_y'),
      z: trimFormValue(formData, 'translate_z'),
    }, { allowEmpty: true });
    if (translationError) {
      return { error: `Translation: ${translationError}` };
    }
    data.translate_x = toOptionalUpdateValue(trimFormValue(formData, 'translate_x'));
    data.translate_y = toOptionalUpdateValue(trimFormValue(formData, 'translate_y'));
    data.translate_z = toOptionalUpdateValue(trimFormValue(formData, 'translate_z'));
  }
  if (updateRotate) {
    const rotationError = DecimalCoord3.validate({
      x: trimFormValue(formData, 'rotate_x'),
      y: trimFormValue(formData, 'rotate_y'),
      z: trimFormValue(formData, 'rotate_z'),
    }, { allowEmpty: true });
    if (rotationError) {
      return { error: `Rotation: ${rotationError}` };
    }
    data.rotate_x = toOptionalUpdateValue(trimFormValue(formData, 'rotate_x'));
    data.rotate_y = toOptionalUpdateValue(trimFormValue(formData, 'rotate_y'));
    data.rotate_z = toOptionalUpdateValue(trimFormValue(formData, 'rotate_z'));
  }
  if (updateScale) {
    const scaleError = DecimalSize3.validate({
      x: trimFormValue(formData, 'scale_x'),
      y: trimFormValue(formData, 'scale_y'),
      z: trimFormValue(formData, 'scale_z'),
    }, { allowEmpty: true });
    if (scaleError) {
      return { error: `Scale: ${scaleError}` };
    }
    data.scale_x = toOptionalUpdateValue(trimFormValue(formData, 'scale_x'));
    data.scale_y = toOptionalUpdateValue(trimFormValue(formData, 'scale_y'));
    data.scale_z = toOptionalUpdateValue(trimFormValue(formData, 'scale_z'));
  }

  return { data };
}

type GroundMeshMetadataFieldsProps<TState extends GroundMeshMetadataFormState> = {
  formData: TState;
  sourceGroups: SourceGroup[];
  readOnly: boolean;
  onChange: <K extends keyof GroundMeshMetadataFormState>(field: K, value: string) => void;
};

function GroundMeshMetadataFields<TState extends GroundMeshMetadataFormState>({
  formData,
  sourceGroups,
  readOnly,
  onChange,
}: GroundMeshMetadataFieldsProps<TState>) {
  return (
    <>
      <Form.Group className="mb-3">
        <Form.Label>
          Source Group
          <span className="text-danger ms-1">*</span>
        </Form.Label>
        <Form.Select
          name="group_id"
          value={formData.group_id}
          disabled={readOnly}
          onChange={(event) => onChange('group_id', event.target.value)}
        >
          <option value="">Select a source group</option>
          {sourceGroups.map((group) => (
            <option key={group.id} value={String(group.id)}>
              {String(group.name)}
            </option>
          ))}
        </Form.Select>
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Label>
          URI
          <span className="text-danger ms-1">*</span>
        </Form.Label>
        <Form.Control
          type="text"
          name="uri"
          value={formData.uri}
          readOnly={readOnly}
          required={true}
          onChange={(event) => onChange('uri', event.target.value)}
          placeholder="meshes/terrain.obj"
          title={FileURI.helperText}
        />
        {!readOnly && <Form.Text className="text-muted">{FileURI.helperText}</Form.Text>}
      </Form.Group>

      <Row>
        <Col md={6}>
          <Form.Group className="mb-3">
            <Form.Label>Min. Timestamp</Form.Label>
            <Form.Control
              type="datetime-local"
              step={1}
              name="min_timestamp"
              value={formData.min_timestamp}
              readOnly={readOnly}
              onChange={(event) => onChange('min_timestamp', event.target.value)}
            />
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group className="mb-3">
            <Form.Label>Max. Timestamp</Form.Label>
            <Form.Control
              type="datetime-local"
              step={1}
              name="max_timestamp"
              value={formData.max_timestamp}
              readOnly={readOnly}
              onChange={(event) => onChange('max_timestamp', event.target.value)}
            />
          </Form.Group>
        </Col>
      </Row>

      <VectorInputFields
        label="Min. Bounds"
        fields={MIN_BOUND_FIELDS}
        formData={formData}
        disabled={readOnly}
        helperText={DecimalCoord3.helperText}
        onChange={(field, value) => onChange(field as keyof GroundMeshMetadataFormState, value)}
      />

      <VectorInputFields
        label="Max. Bounds"
        fields={MAX_BOUND_FIELDS}
        formData={formData}
        disabled={readOnly}
        helperText={DecimalCoord3.helperText}
        onChange={(field, value) => onChange(field as keyof GroundMeshMetadataFormState, value)}
      />

      <VectorInputFields
        label="Translation"
        fields={TRANSLATE_FIELDS}
        formData={formData}
        disabled={readOnly}
        helperText={DecimalCoord3.helperText}
        onChange={(field, value) => onChange(field as keyof GroundMeshMetadataFormState, value)}
      />

      <VectorInputFields
        label="Rotation"
        fields={ROTATE_FIELDS}
        formData={formData}
        disabled={readOnly}
        helperText={DecimalCoord3.helperText}
        onChange={(field, value) => onChange(field as keyof GroundMeshMetadataFormState, value)}
      />

      <VectorInputFields
        label="Scale"
        fields={SCALE_FIELDS}
        formData={formData}
        disabled={readOnly}
        helperText={DecimalSize3.helperText}
        className="mb-0"
        onChange={(field, value) => onChange(field as keyof GroundMeshMetadataFormState, value)}
      />
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

  const user = getUser(session) as CurrentUser | null;
  if (!user) {
    session.flash('error', 'Your session has expired. Please log in again.');
    return redirectAndCommit('/login', session);
  }

  const [groundMeshMetadatasRes, sourceGroupsRes] = await Promise.all([
    listMetadatasSourceDataGmeshMetadataGet({ auth: token.access_token }),
    listGroupsSourceGroupsGet({ auth: token.access_token }),
  ]);

  const dataset = (groundMeshMetadatasRes.data ?? []) as GroundMeshMetadata[];
  const sourceGroups = (sourceGroupsRes.data ?? [])
    .slice()
    .sort((left, right) => String(left.name).localeCompare(String(right.name)));

  const loaderError = groundMeshMetadatasRes.error ?? sourceGroupsRes.error;

  return {
    user,
    dataset,
    sourceGroups,
    loaderError: loaderError ? normalizeError(loaderError) : undefined,
  };
}

export async function clientLoader({ serverLoader }: { serverLoader: () => Promise<LoaderData> }) {
  const loaderData = await serverLoader();
  const SG = await import('slickgrid-react');
  return { ...loaderData, SG };
}

clientLoader.hydrate = true as const;

export async function action({ request }: Route.LoaderArgs) {
  const session = await getCurrentSession(request);
  const token = session.get('token');
  if (!token) {
    clearUser(session);
    session.flash('error', 'Your session has expired. Please log in again.');
    return redirectAndCommit('/login', session);
  }

  const formData = await request.formData();
  const actionType = formData.get('_action');

  try {
    if (actionType === 'create') {
      const payload = createPayloadFromFormData(formData);
      if (payload.error || !payload.data) {
        return { error: payload.error ?? 'Unable to create ground mesh metadata.' };
      }

      const res = await createMetadataSourceDataGmeshMetadataPost({
        auth: token.access_token,
        body: payload.data,
      });
      if (res.error) {
        return { error: normalizeError(res.error) };
      }

      return { success: 'Ground mesh metadata created successfully.' };
    }

    if (actionType === 'update') {
      const id = Number.parseInt(trimFormValue(formData, 'id'), 10);
      if (Number.isNaN(id)) {
        return { error: 'A valid ground mesh ID is required.' };
      }

      const payload = updatePayloadFromFormData(formData);
      if (payload.error || !payload.data) {
        return { error: payload.error ?? 'Unable to update ground mesh metadata.' };
      }

      const res = await updateMetadataSourceDataGmeshMetadataIdPatch({
        auth: token.access_token,
        path: { id },
        body: payload.data,
      });
      if (res.error) {
        return { error: normalizeError(res.error) };
      }

      return { success: 'Ground mesh metadata updated successfully.' };
    }

    if (actionType === 'delete') {
      const id = Number.parseInt(trimFormValue(formData, 'id'), 10);
      if (Number.isNaN(id)) {
        return { error: 'A valid ground mesh ID is required.' };
      }

      const res = await deleteMetadataSourceDataGmeshMetadataIdDelete({
        auth: token.access_token,
        path: { id },
      });
      if (res.error) {
        return { error: normalizeError(res.error) };
      }

      return { success: 'Ground mesh metadata deleted successfully.' };
    }

    if (actionType === 'batch_update') {
      const selectedIds = parseSelectedIds(trimFormValue(formData, 'selectedIds'));
      if (!selectedIds || selectedIds.length === 0) {
        return { error: 'Select at least one ground mesh to update.' };
      }

      const payload = batchPayloadFromFormData(formData);
      if (payload.error || !payload.data) {
        return { error: payload.error ?? 'Unable to batch update ground meshes.' };
      }

      const res = await bulkUpdateMetadatasSourceDataGmeshMetadataBulkPatch({
        auth: token.access_token,
        body: { ids: selectedIds, data: payload.data },
      });
      if (res.error) {
        return { error: normalizeError(res.error) };
      }

      return {
        success: selectedIds.length === 1
          ? 'Ground mesh metadata updated successfully.'
          : `${selectedIds.length} ground mesh metadata entries updated successfully.`,
      };
    }

    if (actionType === 'batch_delete') {
      const selectedIds = parseSelectedIds(trimFormValue(formData, 'selectedIds'));
      if (!selectedIds || selectedIds.length === 0) {
        return { error: 'Select at least one ground mesh to delete.' };
      }

      const res = await bulkDeleteMetadatasSourceDataGmeshMetadataBulkDelete({
        auth: token.access_token,
        body: selectedIds,
      });
      if (res.error) {
        return { error: normalizeError(res.error) };
      }

      return {
        success: selectedIds.length === 1
          ? 'Ground mesh metadata deleted successfully.'
          : `${selectedIds.length} ground mesh metadata entries deleted successfully.`,
      };
    }

    return { error: 'Unknown action.' };
  } catch (error) {
    return { error: normalizeError(error) };
  }
}

function GroundMeshMetadataTable({
  SG,
  user,
  dataset,
  sourceGroups,
  actionData,
}: {
  SG: SlickgridModule;
  user: CurrentUser;
  dataset: GroundMeshMetadata[];
  sourceGroups: SourceGroup[];
  actionData?: ActionData;
}) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [gridOptions, setGridOptions] = useState<GridOption | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingGroundMeshMetadata, setEditingGroundMeshMetadata] = useState<GroundMeshMetadata | null>(null);
  const [showBatchEditModal, setShowBatchEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [groundMeshMetadataToDelete, setGroundMeshMetadataToDelete] = useState<GroundMeshMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<GroundMeshMetadataFormState>(EMPTY_FORM);
  const [batchFormData, setBatchFormData] = useState<BatchGroundMeshMetadataFormState>(EMPTY_BATCH_FORM);
  const reactGridRef = useRef<SlickgridReactInstance | null>(null);

  const { Filters, SlickgridReact } = SG;
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
      setEditingGroundMeshMetadata(null);
      setGroundMeshMetadataToDelete(null);
      setFormData(EMPTY_FORM);
      setBatchFormData(EMPTY_BATCH_FORM);
    }
  }, [actionData]);

  function getAllSelectedItems(): GroundMeshMetadata[] {
    const items = reactGridRef.current?.dataView.getAllSelectedItems() ?? [];
    return items.filter((item): item is GroundMeshMetadata => item != null);
  }

  function handleCreate() {
    setEditingGroundMeshMetadata(null);
    setFormData(EMPTY_FORM);
    setError(null);
    setShowModal(true);
  }

  function handleEdit(groundMeshMetadata: GroundMeshMetadata) {
    setEditingGroundMeshMetadata(groundMeshMetadata);
    setFormData(groundMeshMetadataToFormState(groundMeshMetadata));
    setError(null);
    setShowModal(true);
  }

  function handleDelete(groundMeshMetadata: GroundMeshMetadata) {
    setGroundMeshMetadataToDelete(groundMeshMetadata);
    setError(null);
    setShowDeleteModal(true);
  }

  function handleBatchEdit() {
    setBatchFormData(EMPTY_BATCH_FORM);
    setError(null);
    setShowBatchEditModal(true);
  }

  function handleBatchDelete() {
    setGroundMeshMetadataToDelete(null);
    setError(null);
    setShowDeleteModal(true);
  }

  function defineGrid() {
    const groupColumn: Column<GroundMeshMetadata> = {
      id: 'group',
      name: 'Group',
      field: 'group_id',
      formatter: (_row, _cell, _value, _columnDef, dataContext) => String(dataContext.group.name),
      filterable: true,
      filter: {
        collection: sourceGroups.map((group) => ({ value: group.id, label: String(group.name) })),
        model: Filters.multipleSelect,
        operator: 'IN_COLLECTION',
      } as never,
      sortable: true,
    };

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
      {
        id: 'id',
        name: 'ID',
        field: 'id',
        type: 'integer',
        filterable: true,
        sortable: true,
      },
      groupColumn,
      {
        id: 'uri',
        name: 'URI',
        field: 'uri',
        type: 'string',
        filterable: true,
        sortable: true,
        formatter: (_row, _cell, value) => formatUnknown(value),
      },
      {
        id: 'min_timestamp',
        name: 'Min',
        field: 'min_timestamp',
        type: 'string',
        columnGroup: 'Timestamp',
        filterable: true,
        sortable: true,
      },
      {
        id: 'max_timestamp',
        name: 'Max',
        field: 'max_timestamp',
        type: 'string',
        columnGroup: 'Timestamp',
        filterable: true,
        sortable: true,
      },
      {
        id: 'min_x',
        name: 'Min X',
        field: 'min_x',
        type: 'string',
        columnGroup: 'Spatial Bounds',
        filterable: false,
        sortable: false,
      },
      {
        id: 'min_y',
        name: 'Min Y',
        field: 'min_y',
        type: 'string',
        columnGroup: 'Spatial Bounds',
        filterable: false,
        sortable: false,
      },
      {
        id: 'min_z',
        name: 'Min Z',
        field: 'min_z',
        type: 'string',
        columnGroup: 'Spatial Bounds',
        filterable: false,
        sortable: false,
      },
      {
        id: 'max_x',
        name: 'Max X',
        field: 'max_x',
        type: 'string',
        columnGroup: 'Spatial Bounds',
        filterable: false,
        sortable: false,
      },
      {
        id: 'max_y',
        name: 'Max Y',
        field: 'max_y',
        type: 'string',
        columnGroup: 'Spatial Bounds',
        filterable: false,
        sortable: false,
      },
      {
        id: 'max_z',
        name: 'Max Z',
        field: 'max_z',
        type: 'string',
        columnGroup: 'Spatial Bounds',
        filterable: false,
        sortable: false,
      },
      {
        id: 'last_edit_at',
        name: 'Last Edited',
        field: 'last_edit_at',
        type: 'string',
        filterable: true,
        sortable: true,
      },
    ]);

    setGridOptions({
      ...(selectableConfig({ commandItems: commandItems as never, multiSelect: true }) as unknown as GridOption),
      autoResize: { container: '#grid-container' },
      createPreHeaderPanel: true,
      enableAutoResize: true,
      showPreHeaderPanel: true,
    });
  }

  function onSelectAll() {
    const numFiltered = reactGridRef.current?.dataView.getFilteredItemCount() ?? 0;
    reactGridRef.current?.gridService.setSelectedRows(
      Array.from({ length: numFiltered }, (_, index) => index),
    );
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

  function updateFormField<K extends keyof GroundMeshMetadataFormState>(field: K, value: string) {
    setFormData((previous) => ({ ...previous, [field]: value }));
  }

  function updateBatchField<K extends keyof GroundMeshMetadataFormState>(field: K, value: string) {
    setBatchFormData((previous) => ({ ...previous, [field]: value }));
  }

  function updateBatchToggle(field: BatchToggleKey, value: boolean) {
    setBatchFormData((previous) => ({ ...previous, [field]: value }));
  }

  useEffect(() => {
    defineGrid();
  }, [canManage, sourceGroups]);

  return (
    <>
      <div className="mb-3 d-flex gap-2">
        <ButtonGroup className="justify-content-start me-auto">
          <Button variant="primary" onClick={handleCreate}>Create Ground Mesh Metadata</Button>
          {canManage && selectedIds.length > 0 && (
            <>
              <Button variant="outline-primary" onClick={handleBatchEdit}>
                Batch Edit ({selectedIds.length})
              </Button>
              <Button variant="outline-danger" onClick={handleBatchDelete}>
                Batch Delete ({selectedIds.length})
              </Button>
            </>
          )}
        </ButtonGroup>
        <ButtonGroup className="justify-content-end">
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
            gridId="ground-mesh-grid"
            columns={columns}
            options={gridOptions}
            dataset={dataset}
            onReactGridCreated={(event: { detail: SlickgridReactInstance }) => reactGridReady(event.detail)}
            onGridStateChanged={() => onGridStateChanged()}
          />
        )}
      </div>

      <Modal show={showModal} onHide={() => setShowModal(false)} size="xl">
        <Modal.Header closeButton>
          <Modal.Title>
            {editingGroundMeshMetadata
              ? canManage ? 'Edit Ground Mesh Metadata' : 'View Ground Mesh Metadata'
              : 'Create Ground Mesh Metadata'}
          </Modal.Title>
        </Modal.Header>
        <RouterForm method="post">
          <Modal.Body>
            {error && <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>}

            <input type="hidden" name="_action" value={editingGroundMeshMetadata ? 'update' : 'create'} />
            {editingGroundMeshMetadata && <input type="hidden" name="id" value={editingGroundMeshMetadata.id} />}

            <GroundMeshMetadataFields
              formData={formData}
              sourceGroups={sourceGroups}
              readOnly={!canManage}
              onChange={updateFormField}
            />
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              {canManage ? 'Cancel' : 'Close'}
            </Button>
            {canManage && <Button variant="primary" type="submit">Save</Button>}
          </Modal.Footer>
        </RouterForm>
      </Modal>

      <Modal show={showBatchEditModal} onHide={() => setShowBatchEditModal(false)} size="xl">
        <Modal.Header closeButton>
          <Modal.Title>
            Batch Edit Ground Mesh Metadata ({selectedIds.length} selected)
          </Modal.Title>
        </Modal.Header>
        <RouterForm method="post">
          <Modal.Body>
            {error && <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>}

            <input type="hidden" name="_action" value="batch_update" />
            <input type="hidden" name="selectedIds" value={JSON.stringify(selectedIds)} />
            <input type="hidden" name="update_group" value={String(batchFormData.update_group)} />
            <input type="hidden" name="update_uri" value={String(batchFormData.update_uri)} />
            <input type="hidden" name="update_min_bounds" value={String(batchFormData.update_min_bounds)} />
            <input type="hidden" name="update_max_bounds" value={String(batchFormData.update_max_bounds)} />
            <input type="hidden" name="update_timestamps" value={String(batchFormData.update_timestamps)} />
            <input type="hidden" name="update_translate" value={String(batchFormData.update_translate)} />
            <input type="hidden" name="update_rotate" value={String(batchFormData.update_rotate)} />
            <input type="hidden" name="update_scale" value={String(batchFormData.update_scale)} />

            <BatchSection
              label="Update Source Group"
              checked={batchFormData.update_group}
              onToggle={(checked) => updateBatchToggle('update_group', checked)}
            >
              <Form.Select
                name="group_id"
                value={batchFormData.group_id}
                onChange={(event) => updateBatchField('group_id', event.target.value)}
              >
                <option value="">Clear group</option>
                {sourceGroups.map((group) => (
                  <option key={group.id} value={String(group.id)}>
                    {String(group.name)}
                  </option>
                ))}
              </Form.Select>
            </BatchSection>

            <BatchSection
              label="Update URI"
              checked={batchFormData.update_uri}
              onToggle={(checked) => updateBatchToggle('update_uri', checked)}
            >
              <Form.Control
                type="text"
                name="uri"
                value={batchFormData.uri}
                onChange={(event) => updateBatchField('uri', event.target.value)}
                placeholder="Leave empty to clear"
              />
            </BatchSection>

            <BatchSection
              label="Update Min. Bounds"
              checked={batchFormData.update_min_bounds}
              onToggle={(checked) => updateBatchToggle('update_min_bounds', checked)}
            >
              <VectorInputFields
                fields={MIN_BOUND_FIELDS}
                formData={batchFormData}
                disabled={false}
                helperText={DecimalCoord3.helperText}
                className="mb-0"
                onChange={(field, value) => updateBatchField(field as keyof GroundMeshMetadataFormState, value)}
              />
            </BatchSection>

            <BatchSection
              label="Update Max. Bounds"
              checked={batchFormData.update_max_bounds}
              onToggle={(checked) => updateBatchToggle('update_max_bounds', checked)}
            >
              <VectorInputFields
                fields={MAX_BOUND_FIELDS}
                formData={batchFormData}
                disabled={false}
                helperText={DecimalCoord3.helperText}
                className="mb-0"
                onChange={(field, value) => updateBatchField(field as keyof GroundMeshMetadataFormState, value)}
              />
            </BatchSection>

            <BatchSection
              label="Update Timestamp Range"
              checked={batchFormData.update_timestamps}
              onToggle={(checked) => updateBatchToggle('update_timestamps', checked)}
            >
              <Row>
                <Col md={6}>
                  <Form.Control
                    type="datetime-local"
                    step={1}
                    name="min_timestamp"
                    value={batchFormData.min_timestamp}
                    onChange={(event) => updateBatchField('min_timestamp', event.target.value)}
                  />
                </Col>
                <Col md={6}>
                  <Form.Control
                    type="datetime-local"
                    step={1}
                    name="max_timestamp"
                    value={batchFormData.max_timestamp}
                    onChange={(event) => updateBatchField('max_timestamp', event.target.value)}
                  />
                </Col>
              </Row>
            </BatchSection>

            <BatchSection
              label="Update Translation"
              checked={batchFormData.update_translate}
              onToggle={(checked) => updateBatchToggle('update_translate', checked)}
            >
              <VectorInputFields
                fields={TRANSLATE_FIELDS}
                formData={batchFormData}
                disabled={false}
                helperText={DecimalCoord3.helperText}
                className="mb-0"
                onChange={(field, value) => updateBatchField(field as keyof GroundMeshMetadataFormState, value)}
              />
            </BatchSection>

            <BatchSection
              label="Update Rotation"
              checked={batchFormData.update_rotate}
              onToggle={(checked) => updateBatchToggle('update_rotate', checked)}
            >
              <VectorInputFields
                fields={ROTATE_FIELDS}
                formData={batchFormData}
                disabled={false}
                helperText={DecimalCoord3.helperText}
                className="mb-0"
                onChange={(field, value) => updateBatchField(field as keyof GroundMeshMetadataFormState, value)}
              />
            </BatchSection>

            <BatchSection
              label="Update Scale"
              checked={batchFormData.update_scale}
              onToggle={(checked) => updateBatchToggle('update_scale', checked)}
            >
              <VectorInputFields
                fields={SCALE_FIELDS}
                formData={batchFormData}
                disabled={false}
                helperText={DecimalSize3.helperText}
                className="mb-0"
                onChange={(field, value) => updateBatchField(field as keyof GroundMeshMetadataFormState, value)}
              />
            </BatchSection>

            {!batchFormData.update_group
              && !batchFormData.update_uri
              && !batchFormData.update_min_bounds
              && !batchFormData.update_max_bounds
              && !batchFormData.update_timestamps
              && !batchFormData.update_translate
              && !batchFormData.update_rotate
              && !batchFormData.update_scale && (
              <Alert variant="info">Choose one or more field groups to apply to the selected ground mesh metadata entries.</Alert>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowBatchEditModal(false)}>Cancel</Button>
            <Button variant="primary" type="submit">Apply to {selectedIds.length} Ground Mesh Entries</Button>
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
            {groundMeshMetadataToDelete ? (
              <>
                <input type="hidden" name="_action" value="delete" />
                <input type="hidden" name="id" value={groundMeshMetadataToDelete.id} />
                <p>Are you sure you want to delete ground mesh <strong>{formatUnknown(groundMeshMetadataToDelete.uri)}</strong>?</p>
              </>
            ) : (
              <>
                <input type="hidden" name="_action" value="batch_delete" />
                <input type="hidden" name="selectedIds" value={JSON.stringify(selectedIds)} />
                <p>
                  Are you sure you want to delete {selectedIds.length} selected {selectedIds.length === 1 ? 'ground mesh entry' : 'ground mesh entries'}?
                </p>
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
  return <div>Loading ground mesh metadata...</div>;
}

export default function GroundMeshMetadatas() {
  const { SG: rawSG, user, dataset, sourceGroups, loaderError } = useLoaderData<typeof clientLoader>();
  const actionData = useActionData<typeof action>();
  const SG = rawSG as SlickgridModule;

  return createPageContent({
    title: 'Ground Mesh Metadata',
    header: <>
      <Breadcrumb className="mb-1">
        <Breadcrumb.Item href="/source/data">Data Storage</Breadcrumb.Item>
        <Breadcrumb.Item active>Ground Mesh Metadata</Breadcrumb.Item>
      </Breadcrumb>
      <h2 className="py-2">Ground Mesh Metadata</h2>
    </>,
    main: (
      <GroundMeshMetadataTable
        SG={SG}
        user={user}
        dataset={dataset}
        sourceGroups={sourceGroups}
        actionData={actionData}
      />
    ),
    alerts: loaderError ? { error: loaderError } : actionData,
  });
}