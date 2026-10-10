import {
  DecimalCoord3,
  DecimalSize3,
  FileURI,
  SpatialBoundsOrder,
} from "sta/app/models";
import {
  normalizeError,
  toOptionalCreateDateTimeValue,
  deriveTimestampBoundsFromFilename,
} from "sta/app/plugins";
import type {
  FileContextActionArgs,
  FileContextActionResult,
  FileRegistrationLookupArgs,
  FileRegistrationLookupResult,
} from "sta/app/plugins";
import {
  bulkCreateMetadatasSourceDataPcdMetadataBulkPost,
  listMetadatasSourceDataPcdMetadataGet,
  type PointCloudMetadataSqlModel,
} from "sta/client";

export const IMPORT_POINT_CLOUD_ACTION = "import_point_cloud";

type SharedPointCloudData = Omit<PointCloudMetadataSqlModel, "uri">;

function trimFormValue(
  formData: FormData,
  name:
    | "group_id"
    | "weather"
    | "auto_bounds"
    | "auto_timestamp"
    | "timestamp_pattern"
    | "min_x"
    | "min_y"
    | "min_z"
    | "max_x"
    | "max_y"
    | "max_z"
    | "min_timestamp"
    | "max_timestamp"
    | "translate_x"
    | "translate_y"
    | "translate_z"
    | "rotate_x"
    | "rotate_y"
    | "rotate_z"
    | "scale_x"
    | "scale_y"
    | "scale_z",
): string {
  const value = formData.get(name);
  return (typeof value === "string" ? value : "").trim();
}

function toOptionalCreateValue(value: string): string | undefined {
  return value.trim() === "" ? undefined : value.trim();
}

function toOptionalUpdateValue(value: string): string | null {
  return value.trim() === "" ? null : value.trim();
}

function parseGroupId(value: string): number | null {
  if (value.trim() === "") {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function validatePointCloudMetadataVectors(
  formData: FormData,
  manualBounds: boolean,
): string | null {
  if (manualBounds) {
    // A blank component is an answer, not a gap: it stores no bound, and every spatial
    // filter treats a missing bound as unbounded on that axis. So only the format of a
    // typed value is checked here, plus the one cross-axis rule the columns cannot hold.
    const minCoords = {
      x: trimFormValue(formData, "min_x"),
      y: trimFormValue(formData, "min_y"),
      z: trimFormValue(formData, "min_z"),
    };
    const maxCoords = {
      x: trimFormValue(formData, "max_x"),
      y: trimFormValue(formData, "max_y"),
      z: trimFormValue(formData, "max_z"),
    };

    const minCoordsError = DecimalCoord3.validate(minCoords, {
      allowEmpty: true,
    });
    if (minCoordsError) {
      return `Minimum coordinates: ${minCoordsError}`;
    }

    const maxCoordsError = DecimalCoord3.validate(maxCoords, {
      allowEmpty: true,
    });
    if (maxCoordsError) {
      return `Maximum coordinates: ${maxCoordsError}`;
    }

    const boundsOrderError = SpatialBoundsOrder.validate(minCoords, maxCoords);
    if (boundsOrderError) {
      return boundsOrderError;
    }
  }

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
): { data?: PointCloudMetadataSqlModel[]; groupId?: number; error?: string } {
  if (paths.length === 0) {
    return { error: "Select at least one file to register." };
  }

  const groupId = parseGroupId(trimFormValue(formData, "group_id"));
  if (groupId == null) {
    return { error: "Source group is required." };
  }

  const manualBounds = trimFormValue(formData, "auto_bounds") !== "true";
  const deriveTimestamp = trimFormValue(formData, "auto_timestamp") === "true";
  const timestampPattern = trimFormValue(formData, "timestamp_pattern");

  const vectorError = validatePointCloudMetadataVectors(formData, manualBounds);
  if (vectorError) {
    return { error: vectorError };
  }

  const sharedData: SharedPointCloudData = {
    group_id: groupId,
    weather: toOptionalUpdateValue(trimFormValue(formData, "weather")),
    // Stated on every write rather than left to the model default, so the create
    // payload means the same thing as an update one: this is how a hand-set box is
    // later switched back to derived.
    auto_bounds: !manualBounds,
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
  };

  // Omitting the six coordinates is what asks the backend to derive them by reading
  // the stored point cloud, so they must stay absent unless bounds were set by hand.
  if (manualBounds) {
    sharedData.min_x = toOptionalCreateValue(trimFormValue(formData, "min_x"));
    sharedData.min_y = toOptionalCreateValue(trimFormValue(formData, "min_y"));
    sharedData.min_z = toOptionalCreateValue(trimFormValue(formData, "min_z"));
    sharedData.max_x = toOptionalCreateValue(trimFormValue(formData, "max_x"));
    sharedData.max_y = toOptionalCreateValue(trimFormValue(formData, "max_y"));
    sharedData.max_z = toOptionalCreateValue(trimFormValue(formData, "max_z"));
  }

  const data: PointCloudMetadataSqlModel[] = [];
  for (const rawPath of paths) {
    const uri = rawPath.trim();
    const uriError = FileURI.validate(uri);
    if (uriError) {
      return { error: uriError };
    }

    const filenameBounds = deriveTimestamp
      ? deriveTimestampBoundsFromFilename(uri, timestampPattern)
      : null;

    data.push({
      ...sharedData,
      uri,
      ...(deriveTimestamp && {
        min_timestamp: filenameBounds?.minTimestamp ?? null,
        max_timestamp: filenameBounds?.maxTimestamp ?? null,
      }),
    });
  }

  return { data, groupId };
}

async function getDuplicatePointCloudAssignmentPaths(
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

  const res = await listMetadatasSourceDataPcdMetadataGet({
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

export async function importPointCloudFiles({
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
      error: payload.error ?? "Unable to import point cloud metadata.",
    };
  }

  const duplicatePaths = await getDuplicatePointCloudAssignmentPaths(
    accessToken,
    payload.groupId,
    paths,
  );
  if (duplicatePaths.length > 0) {
    return {
      error:
        duplicatePaths.length === 1
          ? `Point cloud metadata for ${duplicatePaths[0]} is already assigned to this source group.`
          : `Point cloud metadata for ${duplicatePaths.join(", ")} are already assigned to this source group.`,
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
    success:
      paths.length === 1
        ? "Point cloud metadata created successfully."
        : `${paths.length} point cloud metadata entries created successfully.`,
  };
}

export async function listPointCloudRegistrations({
  accessToken,
  paths,
}: FileRegistrationLookupArgs): Promise<FileRegistrationLookupResult> {
  const normalizedPaths = Array.from(
    new Set(paths.map((path) => path.trim()).filter((path) => path !== "")),
  );
  if (normalizedPaths.length === 0) {
    return {};
  }

  const res = await listMetadatasSourceDataPcdMetadataGet({
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
