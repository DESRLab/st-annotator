import { DecimalCoord3, DecimalSize3, FileURI } from "sta/app/models";
import { normalizeError, toOptionalCreateDateTimeValue } from "sta/app/plugins";
import type {
  FileContextActionArgs,
  FileContextActionResult,
  FileRegistrationLookupArgs,
  FileRegistrationLookupResult,
} from "sta/app/plugins";
import {
  bulkCreateMetadatasSourceDataGmeshMetadataBulkPost,
  listMetadatasSourceDataGmeshMetadataGet,
  type GroundMeshMetadataSqlModel,
} from "sta/client";

export const IMPORT_GROUND_MESH_ACTION = "import_ground_mesh";

function trimFormValue(formData: FormData, name: string): string {
  const value = formData.get(name);
  return (typeof value === "string" ? value : "").trim();
}

function toOptionalCreateValue(value: string): string | undefined {
  return value.trim() === "" ? undefined : value.trim();
}

function parseGroupId(value: string): number | null {
  if (value.trim() === "") {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function validateGroundMeshMetadataVectors(formData: FormData): string | null {
  const translationError = DecimalCoord3.validate(
    {
      x: trimFormValue(formData, "translate_x"),
      y: trimFormValue(formData, "translate_y"),
      z: trimFormValue(formData, "translate_z"),
    },
    { allowEmpty: false },
  );
  if (translationError) {
    return `Translation: ${translationError}`;
  }

  const rotationError = DecimalCoord3.validate(
    {
      x: trimFormValue(formData, "rotate_x"),
      y: trimFormValue(formData, "rotate_y"),
      z: trimFormValue(formData, "rotate_z"),
    },
    { allowEmpty: false },
  );
  if (rotationError) {
    return `Rotation: ${rotationError}`;
  }

  const scaleError = DecimalSize3.validate(
    {
      x: trimFormValue(formData, "scale_x"),
      y: trimFormValue(formData, "scale_y"),
      z: trimFormValue(formData, "scale_z"),
    },
    { allowEmpty: false },
  );
  if (scaleError) {
    return `Scale: ${scaleError}`;
  }

  return null;
}

function createBulkPayloadFromPaths(
  formData: FormData,
  paths: string[],
): { data?: GroundMeshMetadataSqlModel[]; groupId?: number; error?: string } {
  if (paths.length === 0) {
    return { error: "Select at least one file to register." };
  }

  const groupId = parseGroupId(trimFormValue(formData, "group_id"));
  if (groupId == null) {
    return { error: "Source group is required." };
  }

  const vectorError = validateGroundMeshMetadataVectors(formData);
  if (vectorError) {
    return { error: vectorError };
  }

  const sharedData = {
    group_id: groupId,
    min_timestamp: toOptionalCreateDateTimeValue(
      trimFormValue(formData, "min_timestamp"),
    ),
    max_timestamp: toOptionalCreateDateTimeValue(
      trimFormValue(formData, "max_timestamp"),
    ),
    translate_x: toOptionalCreateValue(trimFormValue(formData, "translate_x")),
    translate_y: toOptionalCreateValue(trimFormValue(formData, "translate_y")),
    translate_z: toOptionalCreateValue(trimFormValue(formData, "translate_z")),
    rotate_x: toOptionalCreateValue(trimFormValue(formData, "rotate_x")),
    rotate_y: toOptionalCreateValue(trimFormValue(formData, "rotate_y")),
    rotate_z: toOptionalCreateValue(trimFormValue(formData, "rotate_z")),
    scale_x: toOptionalCreateValue(trimFormValue(formData, "scale_x")),
    scale_y: toOptionalCreateValue(trimFormValue(formData, "scale_y")),
    scale_z: toOptionalCreateValue(trimFormValue(formData, "scale_z")),
  } satisfies Omit<GroundMeshMetadataSqlModel, "uri">;

  const data: GroundMeshMetadataSqlModel[] = [];
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

async function getDuplicateGroundMeshAssignmentPaths(
  accessToken: string,
  groupId: number,
  paths: string[],
): Promise<string[]> {
  const normalizedPaths = Array.from(
    new Set(paths.map((path) => path.trim()).filter((path) => path !== "")),
  );
  if (normalizedPaths.length === 0) {
    return [];
  }

  const res = await listMetadatasSourceDataGmeshMetadataGet({
    auth: accessToken,
    query: { group_id: groupId },
  });
  if (res.error) {
    throw new Error(normalizeError(res.error));
  }

  const submittedPathSet = new Set(normalizedPaths);
  return (res.data ?? [])
    .map((metadata) => String(metadata.uri ?? "").trim())
    .filter((uri) => submittedPathSet.has(uri));
}

export async function importGroundMeshFiles({
  formData,
  accessToken,
}: FileContextActionArgs): Promise<FileContextActionResult> {
  const paths = formData
    .getAll("path")
    .filter(
      (value: FormDataEntryValue): value is string => typeof value === "string",
    );
  const payload = createBulkPayloadFromPaths(formData, paths);
  if (payload.error || !payload.data || payload.groupId == null) {
    return {
      error: payload.error ?? "Unable to import ground mesh metadata.",
    };
  }

  const duplicatePaths = await getDuplicateGroundMeshAssignmentPaths(
    accessToken,
    payload.groupId,
    paths,
  );
  if (duplicatePaths.length > 0) {
    return {
      error:
        duplicatePaths.length === 1
          ? `Ground mesh metadata for ${duplicatePaths[0]} is already assigned to this source group.`
          : `Ground mesh metadata for ${duplicatePaths.join(", ")} are already assigned to this source group.`,
    };
  }

  const res = await bulkCreateMetadatasSourceDataGmeshMetadataBulkPost({
    auth: accessToken,
    body: payload.data,
  });
  if (res.error) {
    return { error: normalizeError(res.error) };
  }

  return {
    success:
      paths.length === 1
        ? "Ground mesh metadata created successfully."
        : `${paths.length} ground mesh metadata entries created successfully.`,
  };
}

export async function listGroundMeshRegistrations({
  accessToken,
  paths,
}: FileRegistrationLookupArgs): Promise<FileRegistrationLookupResult> {
  const normalizedPaths = Array.from(
    new Set(paths.map((path) => path.trim()).filter((path) => path !== "")),
  );
  if (normalizedPaths.length === 0) {
    return {};
  }

  const res = await listMetadatasSourceDataGmeshMetadataGet({
    auth: accessToken,
  });
  if (res.error) {
    throw new Error(normalizeError(res.error));
  }

  const pathSet = new Set(normalizedPaths);
  const registrations: FileRegistrationLookupResult = {};
  for (const metadata of res.data ?? []) {
    const uri = String(metadata.uri ?? "").trim();
    if (!pathSet.has(uri)) {
      continue;
    }

    if (metadata.group?.name == null) {
      continue;
    }

    registrations[uri] ??= [];
    registrations[uri].push(String(metadata.group.name));
  }

  return registrations;
}
