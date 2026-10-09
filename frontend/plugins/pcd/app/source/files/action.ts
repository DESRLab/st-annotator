import {
  bulkCreateMetadatasSourceDataPcdMetadataBulkPost,
  listMetadatasSourceDataPcdMetadataGet,
  type PointCloudMetadataSqlModel,
} from '../../../../../client';
import type {
  FileContextActionArgs,
  FileContextActionResult,
  FileRegistrationLookupArgs,
  FileRegistrationLookupResult,
} from '../../../../../app/plugins/source-files';
import { DecimalCoord3, DecimalSize3 } from '../../../../../app/models/types';
import { FileURI } from '../../../../../app/models/types';

export const IMPORT_POINT_CLOUD_ACTION = 'import_point_cloud';

function trimFormValue(
  formData: FormData,
  name:
    | 'group_id'
    | 'weather'
    | 'min_x'
    | 'min_y'
    | 'min_z'
    | 'max_x'
    | 'max_y'
    | 'max_z'
    | 'min_timestamp'
    | 'max_timestamp'
    | 'translate_x'
    | 'translate_y'
    | 'translate_z'
    | 'rotate_x'
    | 'rotate_y'
    | 'rotate_z'
    | 'scale_x'
    | 'scale_y'
    | 'scale_z',
): string {
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

function toIsoDateTimeValue(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function toOptionalCreateDateTimeValue(value: string): string | undefined {
  return value.trim() === '' ? undefined : toIsoDateTimeValue(value.trim());
}

function validatePointCloudMetadataVectors(formData: FormData): string | null {
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

function createBulkPayloadFromPaths(formData: FormData, paths: string[]): { data?: PointCloudMetadataSqlModel[]; groupId?: number; error?: string } {
  if (paths.length === 0) {
    return { error: 'Select at least one file to register.' };
  }

  const groupId = parseGroupId(trimFormValue(formData, 'group_id'));
  if (groupId == null) {
    return { error: 'Source group is required.' };
  }

  const vectorError = validatePointCloudMetadataVectors(formData);
  if (vectorError) {
    return { error: vectorError };
  }

  const sharedData = {
    group_id: groupId,
    weather: toOptionalUpdateValue(trimFormValue(formData, 'weather')),
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
  };

  const data: PointCloudMetadataSqlModel[] = [];
  for (const rawPath of paths) {
    const uri = rawPath.trim();
    const uriError = FileURI.validate(uri);
    if (uriError) {
      return { error: uriError };
    }

    data.push({
      ...sharedData,
      uri,
    });
  }

  return { data, groupId };
}

async function getDuplicatePointCloudAssignmentPaths(
  accessToken: string,
  groupId: number,
  paths: string[],
): Promise<string[]> {
  const normalizedPaths = Array.from(new Set(paths.map((path) => path.trim()).filter((path) => path !== '')));
  if (normalizedPaths.length === 0) {
    return [];
  }

  const res = await listMetadatasSourceDataPcdMetadataGet({
    auth: accessToken,
    query: { group_id: groupId },
  });
  if (res.error) {
    throw new Error(normalizeError(res.error));
  }

  const submittedPathSet = new Set(normalizedPaths);
  return (res.data ?? [])
    .map((metadata) => String(metadata.uri ?? '').trim())
    .filter((uri) => submittedPathSet.has(uri));
}

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

export async function importPointCloudFiles({ formData, accessToken }: FileContextActionArgs): Promise<FileContextActionResult> {
  const paths = formData.getAll('path').filter((value: FormDataEntryValue): value is string => typeof value === 'string');
  const payload = createBulkPayloadFromPaths(formData, paths);
  if (payload.error || !payload.data || payload.groupId == null) {
    return { error: payload.error ?? 'Unable to import point cloud metadata.' };
  }

  const duplicatePaths = await getDuplicatePointCloudAssignmentPaths(accessToken, payload.groupId, paths);
  if (duplicatePaths.length > 0) {
    return {
      error: duplicatePaths.length === 1
        ? `Point cloud metadata for ${duplicatePaths[0]} is already assigned to this source group.`
        : `Point cloud metadata for ${duplicatePaths.join(', ')} are already assigned to this source group.`,
    };
  }

  const res = await bulkCreateMetadatasSourceDataPcdMetadataBulkPost({
    auth: accessToken,
    body: payload.data,
  });
  if (res.error) {
    return { error: normalizeError(res.error) };
  }

  return {
    success: paths.length === 1
      ? 'Point cloud metadata created successfully.'
      : `${paths.length} point cloud metadata entries created successfully.`,
  };
}

export async function listPointCloudRegistrations({ accessToken, paths }: FileRegistrationLookupArgs): Promise<FileRegistrationLookupResult> {
  const normalizedPaths = Array.from(new Set(paths.map((path) => path.trim()).filter((path) => path !== '')));
  if (normalizedPaths.length === 0) {
    return {};
  }

  const res = await listMetadatasSourceDataPcdMetadataGet({ auth: accessToken });
  if (res.error) {
    throw new Error(normalizeError(res.error));
  }

  const pathSet = new Set(normalizedPaths);
  const registrations: FileRegistrationLookupResult = {};
  for (const metadata of res.data ?? []) {
    const uri = String(metadata.uri ?? '').trim();
    if (!pathSet.has(uri)) {
      continue;
    }

    const label = metadata.group?.name == null
      ? 'Point Cloud Metadata'
      : `Point Cloud Metadata: ${String(metadata.group.name)}`;
    registrations[uri] ??= [];
    registrations[uri].push(label);
  }

  return registrations;
}