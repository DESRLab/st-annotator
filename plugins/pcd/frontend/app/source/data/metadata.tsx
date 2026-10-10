import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Breadcrumb,
  Button,
  ButtonGroup,
  Form,
  Modal,
  Row,
  Col,
} from "react-bootstrap";
import { Form as RouterForm, redirect, useActionData } from "react-router";
import type {
  Column,
  GridOption,
  MenuCommandItem,
  SlickgridReactInstance,
} from "slickgrid-react";

import {
  BatchSection,
  createSlickgridClientLoader,
  GridSelectionButtons,
  selectableConfig,
  syncRoutePaginationGrid,
  useRoutePaginationGridOptions,
} from "sta/app/components";
import { VectorInputFields, type VectorField } from "sta/app/components";
import {
  getGridPaginationRequest,
  GRID_PAGE_SIZES,
  listGridPage,
  loadAccessTokenSession,
  loadAuthenticatedSession,
  type GridPagination,
} from "sta/app/loaders";
import {
  blankAxesError,
  DecimalCoord,
  DecimalCoord3,
  DecimalSize,
  DecimalSize3,
  FileURI,
  SpatialBoundsOrder,
} from "sta/app/models";
import {
  deriveTimestampBoundsFromFilename,
  formatFixedDecimal,
  formatUnknown,
  normalizeError,
  parseOptionalInteger,
  SourceDataFilterForm,
  sortSourceGroups,
  toDateTimeInputValue,
  toOptionalCreateDateTimeValue,
  toOptionalUpdateDateTimeValue,
} from "sta/app/plugins";
import { createPageContent } from "sta/app/templates";
import {
  bulkCreateMetadatasSourceDataPcdMetadataBulkPost,
  bulkDeleteMetadatasSourceDataPcdMetadataBulkDelete,
  bulkUpdateMetadatasSourceDataPcdMetadataBulkPatch,
  createMetadataSourceDataPcdMetadataPost,
  deleteMetadataSourceDataPcdMetadataIdDelete,
  listGroupsSourceGroupsGet,
  listMetadataIdsSourceDataPcdMetadataIdsGet,
  listMetadatasSourceDataPcdMetadataGet,
  listSpecsSourceSpecPcdSpecsGet,
  readMetadataSourceDataPcdMetadataIdGet,
  type PointCloudMetadataPublic as PointCloudMetadata,
  type PointCloudMetadataSqlModel,
  type PointCloudMetadataUpdate,
  type SourceGroupPublic as SourceGroup,
  type UserRoles as User,
  updateMetadataSourceDataPcdMetadataIdPatch,
} from "sta/client";

import type { Route } from "./+types/metadata";

type SlickgridModule = typeof import("slickgrid-react");

/**
 * `auto_bounds` is the mode flag persisted on point-cloud metadata. When true the backend
 * recomputes the bounding box from the stored point cloud on every write; when false the
 * hand-set box is preserved across later writes and spec changes. Every create/update
 * states it so the mode survives a round-trip, while the six coordinates stay out unless
 * they were set by hand.
 */
function readAutoBoundsFlag(pointCloudMetadata: PointCloudMetadata): boolean {
  // A record with no stored flag predates the field, when bounds were always derived, so
  // default to automatic rather than freezing a box nobody hand-set.
  return pointCloudMetadata.auto_bounds ?? true;
}

interface PointCloudMetadataFormState {
  group_id: string;
  uri: string;
  weather: string;
  auto_bounds: string;
  auto_timestamp: string;
  timestamp_pattern: string;
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
}

type BatchPointCloudMetadataFormState = PointCloudMetadataFormState & {
  update_group: boolean;
  update_weather: boolean;
  update_auto_bounds: boolean;
  update_min_bounds: boolean;
  update_max_bounds: boolean;
  update_timestamps: boolean;
  update_translate: boolean;
  update_rotate: boolean;
  update_scale: boolean;
};

type BatchToggleKey = keyof Pick<
  BatchPointCloudMetadataFormState,
  | "update_group"
  | "update_weather"
  | "update_auto_bounds"
  | "update_min_bounds"
  | "update_max_bounds"
  | "update_timestamps"
  | "update_translate"
  | "update_rotate"
  | "update_scale"
>;

const EMPTY_FORM: PointCloudMetadataFormState = {
  group_id: "",
  uri: "",
  weather: "",
  auto_bounds: "true",
  auto_timestamp: "false",
  timestamp_pattern: "",
  min_x: "",
  min_y: "",
  min_z: "",
  max_x: "",
  max_y: "",
  max_z: "",
  min_timestamp: "",
  max_timestamp: "",
  translate_x: formatFixedDecimal("0", DecimalCoord.places),
  translate_y: formatFixedDecimal("0", DecimalCoord.places),
  translate_z: formatFixedDecimal("0", DecimalCoord.places),
  rotate_x: formatFixedDecimal("0", DecimalCoord.places),
  rotate_y: formatFixedDecimal("0", DecimalCoord.places),
  rotate_z: formatFixedDecimal("0", DecimalCoord.places),
  scale_x: formatFixedDecimal("1", DecimalSize.places),
  scale_y: formatFixedDecimal("1", DecimalSize.places),
  scale_z: formatFixedDecimal("1", DecimalSize.places),
};

const EMPTY_BATCH_FORM: BatchPointCloudMetadataFormState = {
  ...EMPTY_FORM,
  // Batch emits are driven by the per-group "Update ..." toggles below, so the
  // bounds seed blank and `auto_bounds` is carried only for shape compatibility.
  auto_bounds: "true",
  min_x: "",
  min_y: "",
  min_z: "",
  max_x: "",
  max_y: "",
  max_z: "",
  translate_x: "",
  translate_y: "",
  translate_z: "",
  rotate_x: "",
  rotate_y: "",
  rotate_z: "",
  scale_x: "",
  scale_y: "",
  scale_z: "",
  update_group: false,
  update_weather: false,
  update_auto_bounds: false,
  update_min_bounds: false,
  update_max_bounds: false,
  update_timestamps: false,
  update_translate: false,
  update_rotate: false,
  update_scale: false,
};

const MIN_BOUND_FIELDS: VectorField<keyof PointCloudMetadataFormState>[] = [
  { key: "min_x", label: "Min X", axis: "X" },
  { key: "min_y", label: "Min Y", axis: "Y" },
  { key: "min_z", label: "Min Z", axis: "Z" },
];

const MAX_BOUND_FIELDS: VectorField<keyof PointCloudMetadataFormState>[] = [
  { key: "max_x", label: "Max X", axis: "X" },
  { key: "max_y", label: "Max Y", axis: "Y" },
  { key: "max_z", label: "Max Z", axis: "Z" },
];

const TRANSLATE_FIELDS: VectorField<keyof PointCloudMetadataFormState>[] = [
  { key: "translate_x", label: "Translate X", axis: "X" },
  { key: "translate_y", label: "Translate Y", axis: "Y" },
  { key: "translate_z", label: "Translate Z", axis: "Z" },
];

const ROTATE_FIELDS: VectorField<keyof PointCloudMetadataFormState>[] = [
  { key: "rotate_x", label: "Rotate X", axis: "X" },
  { key: "rotate_y", label: "Rotate Y", axis: "Y" },
  { key: "rotate_z", label: "Rotate Z", axis: "Z" },
];

const SCALE_FIELDS: VectorField<keyof PointCloudMetadataFormState>[] = [
  { key: "scale_x", label: "Scale X", axis: "X" },
  { key: "scale_y", label: "Scale Y", axis: "Y" },
  { key: "scale_z", label: "Scale Z", axis: "Z" },
];

const BOUNDS_HELPER_TEXT = `${DecimalCoord3.helperText} A blank value stores no bound, which leaves that axis unbounded.`;

function trimFormValue(
  formData: FormData,
  name: keyof PointCloudMetadataFormState | "id" | "selectedIds",
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

export function pointCloudMetadataToFormState(
  pointCloudMetadata: PointCloudMetadata,
): PointCloudMetadataFormState {
  return {
    group_id: String(pointCloudMetadata.group_id),
    uri: formatUnknown(pointCloudMetadata.uri),
    weather: pointCloudMetadata.weather ?? "",
    // Reopen in the mode the record was saved in. The stored box is always carried into
    // the inputs, so unticking the box starts an override from the current values.
    auto_bounds: readAutoBoundsFlag(pointCloudMetadata) ? "true" : "false",
    auto_timestamp: "false",
    timestamp_pattern: "",
    min_x: formatFixedDecimal(pointCloudMetadata.min_x, DecimalCoord.places),
    min_y: formatFixedDecimal(pointCloudMetadata.min_y, DecimalCoord.places),
    min_z: formatFixedDecimal(pointCloudMetadata.min_z, DecimalCoord.places),
    max_x: formatFixedDecimal(pointCloudMetadata.max_x, DecimalCoord.places),
    max_y: formatFixedDecimal(pointCloudMetadata.max_y, DecimalCoord.places),
    max_z: formatFixedDecimal(pointCloudMetadata.max_z, DecimalCoord.places),
    min_timestamp: toDateTimeInputValue(pointCloudMetadata.min_timestamp),
    max_timestamp: toDateTimeInputValue(pointCloudMetadata.max_timestamp),
    translate_x: formatFixedDecimal(
      pointCloudMetadata.translate_x,
      DecimalCoord.places,
    ),
    translate_y: formatFixedDecimal(
      pointCloudMetadata.translate_y,
      DecimalCoord.places,
    ),
    translate_z: formatFixedDecimal(
      pointCloudMetadata.translate_z,
      DecimalCoord.places,
    ),
    rotate_x: formatFixedDecimal(
      pointCloudMetadata.rotate_x,
      DecimalCoord.places,
    ),
    rotate_y: formatFixedDecimal(
      pointCloudMetadata.rotate_y,
      DecimalCoord.places,
    ),
    rotate_z: formatFixedDecimal(
      pointCloudMetadata.rotate_z,
      DecimalCoord.places,
    ),
    scale_x: formatFixedDecimal(pointCloudMetadata.scale_x, DecimalSize.places),
    scale_y: formatFixedDecimal(pointCloudMetadata.scale_y, DecimalSize.places),
    scale_z: formatFixedDecimal(pointCloudMetadata.scale_z, DecimalSize.places),
  };
}

function createPayloadFromFormData(formData: FormData): {
  data?: PointCloudMetadataSqlModel;
  error?: string;
} {
  const createBasePayload = createBasePayloadFromFormData(formData);
  if (createBasePayload.error || !createBasePayload.data) {
    return {
      error: createBasePayload.error ?? "Unable to create point cloud.",
    };
  }

  const uri = trimFormValue(formData, "uri");
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

function createBasePayloadFromFormData(formData: FormData): {
  data?: Omit<PointCloudMetadataSqlModel, "uri">;
  error?: string;
} {
  const groupId = parseGroupId(trimFormValue(formData, "group_id"));
  if (groupId == null) {
    return { error: "Source group is required." };
  }

  const manualBounds = trimFormValue(formData, "auto_bounds") !== "true";
  const vectorError = validatePointCloudMetadataVectors(formData, manualBounds);
  if (vectorError) {
    return { error: vectorError };
  }

  const data: Omit<PointCloudMetadataSqlModel, "uri"> = {
    group_id: groupId,
    weather: toOptionalUpdateValue(trimFormValue(formData, "weather")),
    // The mode is persisted rather than inferred from the request shape, so state it on
    // every write: this is the only way to switch derivation back on for a record whose
    // box was hand-set.
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

  if (trimFormValue(formData, "auto_timestamp") === "true") {
    const derived = deriveTimestampBoundsFromFilename(
      trimFormValue(formData, "uri"),
      trimFormValue(formData, "timestamp_pattern"),
    );
    data.min_timestamp = derived?.minTimestamp ?? null;
    data.max_timestamp = derived?.maxTimestamp ?? null;
  }

  // The six coordinates stay absent in automatic mode so that whatever the inputs happen
  // to hold cannot imply an override of the box the backend derives from the scan.
  if (manualBounds) {
    data.min_x = toOptionalCreateValue(trimFormValue(formData, "min_x"));
    data.min_y = toOptionalCreateValue(trimFormValue(formData, "min_y"));
    data.min_z = toOptionalCreateValue(trimFormValue(formData, "min_z"));
    data.max_x = toOptionalCreateValue(trimFormValue(formData, "max_x"));
    data.max_y = toOptionalCreateValue(trimFormValue(formData, "max_y"));
    data.max_z = toOptionalCreateValue(trimFormValue(formData, "max_z"));
  }

  return { data };
}

function createBulkPayloadFromPaths(
  formData: FormData,
  paths: string[],
): { data?: PointCloudMetadataSqlModel[]; error?: string } {
  if (paths.length === 0) {
    return { error: "Select at least one file to register." };
  }

  const createBasePayload = createBasePayloadFromFormData(formData);
  if (createBasePayload.error || !createBasePayload.data) {
    return {
      error: createBasePayload.error ?? "Unable to create point cloud.",
    };
  }

  const data: PointCloudMetadataSqlModel[] = [];
  for (const rawPath of paths) {
    const uri = rawPath.trim();
    const uriError = FileURI.validate(uri);
    if (uriError) {
      return { error: uriError };
    }

    data.push({
      ...createBasePayload.data,
      uri,
    });
  }

  return { data };
}

function updatePayloadFromFormData(formData: FormData): {
  data?: PointCloudMetadataUpdate;
  error?: string;
} {
  const groupId = parseGroupId(trimFormValue(formData, "group_id"));
  if (groupId == null) {
    return { error: "Source group is required." };
  }

  const uri = trimFormValue(formData, "uri");
  const uriError = FileURI.validate(uri);
  if (uriError) {
    return { error: uriError };
  }

  const manualBounds = trimFormValue(formData, "auto_bounds") !== "true";
  const vectorError = validatePointCloudMetadataVectors(formData, manualBounds);
  if (vectorError) {
    return { error: vectorError };
  }

  const data: PointCloudMetadataUpdate = {
    group_id: groupId,
    uri,
    weather: toOptionalUpdateValue(trimFormValue(formData, "weather")),
    // Always stated, so re-ticking the box on a record saved with a hand-set box switches
    // derivation back on instead of keeping the frozen values.
    auto_bounds: !manualBounds,
    min_timestamp: toOptionalUpdateDateTimeValue(
      trimFormValue(formData, "min_timestamp"),
    ),
    max_timestamp: toOptionalUpdateDateTimeValue(
      trimFormValue(formData, "max_timestamp"),
    ),
    translate_x: toOptionalUpdateValue(trimFormValue(formData, "translate_x")),
    translate_y: toOptionalUpdateValue(trimFormValue(formData, "translate_y")),
    translate_z: toOptionalUpdateValue(trimFormValue(formData, "translate_z")),
    rotate_x: toOptionalUpdateValue(trimFormValue(formData, "rotate_x")),
    rotate_y: toOptionalUpdateValue(trimFormValue(formData, "rotate_y")),
    rotate_z: toOptionalUpdateValue(trimFormValue(formData, "rotate_z")),
    scale_x: toOptionalUpdateValue(trimFormValue(formData, "scale_x")),
    scale_y: toOptionalUpdateValue(trimFormValue(formData, "scale_y")),
    scale_z: toOptionalUpdateValue(trimFormValue(formData, "scale_z")),
  };

  if (trimFormValue(formData, "auto_timestamp") === "true") {
    const derived = deriveTimestampBoundsFromFilename(
      uri,
      trimFormValue(formData, "timestamp_pattern"),
    );
    data.min_timestamp = derived?.minTimestamp ?? null;
    data.max_timestamp = derived?.maxTimestamp ?? null;
  }

  // The prefilled box stays out of an automatic update: sending it back would imply an
  // override and stop the backend recomputing it from the stored scan.
  if (manualBounds) {
    data.min_x = toOptionalUpdateValue(trimFormValue(formData, "min_x"));
    data.min_y = toOptionalUpdateValue(trimFormValue(formData, "min_y"));
    data.min_z = toOptionalUpdateValue(trimFormValue(formData, "min_z"));
    data.max_x = toOptionalUpdateValue(trimFormValue(formData, "max_x"));
    data.max_y = toOptionalUpdateValue(trimFormValue(formData, "max_y"));
    data.max_z = toOptionalUpdateValue(trimFormValue(formData, "max_z"));
  }

  return { data };
}

function batchPayloadFromFormData(formData: FormData): {
  data?: PointCloudMetadataUpdate;
  error?: string;
} {
  // A batch never rewrites `uri`: the column is unique per source group
  // (UniqueConstraint("uri", "group_id")), so stamping one path onto a multi-row
  // selection collides, and the grid is already scoped to a single group. The URI is
  // a per-record identity, edited only from the single-record form.
  const updateGroup = formData.get("update_group") === "true";
  const updateWeather = formData.get("update_weather") === "true";
  const updateAutoBounds = formData.get("update_auto_bounds") === "true";
  const updateMinBounds = formData.get("update_min_bounds") === "true";
  const updateMaxBounds = formData.get("update_max_bounds") === "true";
  const updateTimestamps = formData.get("update_timestamps") === "true";
  const updateTranslate = formData.get("update_translate") === "true";
  const updateRotate = formData.get("update_rotate") === "true";
  const updateScale = formData.get("update_scale") === "true";

  if (
    !updateGroup &&
    !updateWeather &&
    !updateAutoBounds &&
    !updateMinBounds &&
    !updateMaxBounds &&
    !updateTimestamps &&
    !updateTranslate &&
    !updateRotate &&
    !updateScale
  ) {
    return { error: "Select at least one field group to update." };
  }

  const data: PointCloudMetadataUpdate = {};

  if (updateGroup) {
    const groupId = parseGroupId(trimFormValue(formData, "group_id"));
    if (groupId === null) {
      return {
        error:
          "A source group is required; leave the box unticked to keep each point cloud's current group.",
      };
    }
    data.group_id = groupId;
  }
  if (updateWeather) {
    data.weather = toOptionalUpdateValue(trimFormValue(formData, "weather"));
  }
  if (updateAutoBounds) {
    data.auto_bounds = trimFormValue(formData, "auto_bounds") === "true";
    if (data.auto_bounds && (updateMinBounds || updateMaxBounds)) {
      return { error: "Choose derived bounds or manual bounds, not both." };
    }
  }
  if (updateMinBounds) {
    const minCoordsError = DecimalCoord3.validate(
      {
        x: trimFormValue(formData, "min_x"),
        y: trimFormValue(formData, "min_y"),
        z: trimFormValue(formData, "min_z"),
      },
      { allowEmpty: true },
    );
    if (minCoordsError) {
      return { error: `Minimum coordinates: ${minCoordsError}` };
    }
    data.min_x = toOptionalUpdateValue(trimFormValue(formData, "min_x"));
    data.min_y = toOptionalUpdateValue(trimFormValue(formData, "min_y"));
    data.min_z = toOptionalUpdateValue(trimFormValue(formData, "min_z"));
  }
  if (updateMaxBounds) {
    const maxCoordsError = DecimalCoord3.validate(
      {
        x: trimFormValue(formData, "max_x"),
        y: trimFormValue(formData, "max_y"),
        z: trimFormValue(formData, "max_z"),
      },
      { allowEmpty: true },
    );
    if (maxCoordsError) {
      return { error: `Maximum coordinates: ${maxCoordsError}` };
    }
    data.max_x = toOptionalUpdateValue(trimFormValue(formData, "max_x"));
    data.max_y = toOptionalUpdateValue(trimFormValue(formData, "max_y"));
    data.max_z = toOptionalUpdateValue(trimFormValue(formData, "max_z"));
  }
  if (updateTimestamps) {
    if (trimFormValue(formData, "auto_timestamp") !== "true") {
      data.min_timestamp = toOptionalUpdateDateTimeValue(
        trimFormValue(formData, "min_timestamp"),
      );
      data.max_timestamp = toOptionalUpdateDateTimeValue(
        trimFormValue(formData, "max_timestamp"),
      );
    }
  }
  if (updateTranslate) {
    const translation = {
      x: trimFormValue(formData, "translate_x"),
      y: trimFormValue(formData, "translate_y"),
      z: trimFormValue(formData, "translate_z"),
    };
    const translationFormatError = DecimalCoord3.validate(translation, {
      allowEmpty: true,
    });
    if (translationFormatError) {
      return { error: `Translation: ${translationFormatError}` };
    }
    const translationBlankError = blankAxesError(
      "Translation",
      translation,
      "point cloud",
    );
    if (translationBlankError) {
      return { error: translationBlankError };
    }
    data.translate_x = translation.x;
    data.translate_y = translation.y;
    data.translate_z = translation.z;
  }
  if (updateRotate) {
    const rotation = {
      x: trimFormValue(formData, "rotate_x"),
      y: trimFormValue(formData, "rotate_y"),
      z: trimFormValue(formData, "rotate_z"),
    };
    const rotationFormatError = DecimalCoord3.validate(rotation, {
      allowEmpty: true,
    });
    if (rotationFormatError) {
      return { error: `Rotation: ${rotationFormatError}` };
    }
    const rotationBlankError = blankAxesError(
      "Rotation",
      rotation,
      "point cloud",
    );
    if (rotationBlankError) {
      return { error: rotationBlankError };
    }
    data.rotate_x = rotation.x;
    data.rotate_y = rotation.y;
    data.rotate_z = rotation.z;
  }
  if (updateScale) {
    const scale = {
      x: trimFormValue(formData, "scale_x"),
      y: trimFormValue(formData, "scale_y"),
      z: trimFormValue(formData, "scale_z"),
    };
    const scaleFormatError = DecimalSize3.validate(scale, {
      allowEmpty: true,
    });
    if (scaleFormatError) {
      return { error: `Scale: ${scaleFormatError}` };
    }
    const scaleBlankError = blankAxesError("Scale", scale, "point cloud");
    if (scaleBlankError) {
      return { error: scaleBlankError };
    }
    data.scale_x = scale.x;
    data.scale_y = scale.y;
    data.scale_z = scale.z;
  }

  return { data };
}

interface PointCloudMetadataFieldsProps<
  TState extends PointCloudMetadataFormState,
> {
  eligibleSourceGroupIds: Set<number>;
  formData: TState;
  sourceGroups: SourceGroup[];
  readOnly: boolean;
  lockSourceGroup?: boolean;
  onChange: <K extends keyof PointCloudMetadataFormState>(
    field: K,
    value: string,
  ) => void;
}

function formatSourceGroupOptionLabel(
  group: SourceGroup,
  isEligible: boolean,
): string {
  return isEligible
    ? String(group.name)
    : `${String(group.name)} (missing point cloud source)`;
}

function PointCloudMetadataFields<TState extends PointCloudMetadataFormState>({
  eligibleSourceGroupIds,
  formData,
  sourceGroups,
  readOnly,
  lockSourceGroup = false,
  onChange,
}: PointCloudMetadataFieldsProps<TState>) {
  const selectedSourceGroup = sourceGroups.find(
    (group) => String(group.id) === formData.group_id,
  );
  const selectedSourceGroupLabel =
    selectedSourceGroup == null ? "" : String(selectedSourceGroup.name);

  return (
    <>
      <Form.Group className="mb-3">
        <Form.Label>
          Source Group
          <span className="text-danger ms-1">*</span>
        </Form.Label>
        {lockSourceGroup ? (
          <Form.Control
            aria-label="Source Group"
            value={selectedSourceGroupLabel}
            disabled
            readOnly
          />
        ) : (
          <Form.Select
            aria-label="Source Group"
            name="group_id"
            value={formData.group_id}
            disabled={readOnly}
            onChange={(event) => onChange("group_id", event.target.value)}
          >
            <option value="">Select a source group</option>
            {sourceGroups.map((group) => (
              <option
                key={group.id}
                value={String(group.id)}
                disabled={!eligibleSourceGroupIds.has(group.id)}
              >
                {formatSourceGroupOptionLabel(
                  group,
                  eligibleSourceGroupIds.has(group.id),
                )}
              </option>
            ))}
          </Form.Select>
        )}
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
          onChange={(event) => onChange("uri", event.target.value)}
          placeholder="point-clouds/scan.pcd"
          title={FileURI.helperText}
        />
        {!readOnly && (
          <Form.Text className="text-muted">{FileURI.helperText}</Form.Text>
        )}
      </Form.Group>

      <fieldset className="border rounded p-3 mb-3">
        <legend className="float-none w-auto px-2 fs-6 mb-2">
          Timestamp Range
        </legend>
        {!readOnly && (
          <Form.Group className="mb-3">
            <Form.Check
              type="checkbox"
              label="Detect timestamps from filename on save"
              checked={formData.auto_timestamp === "true"}
              onChange={(event) =>
                onChange(
                  "auto_timestamp",
                  event.target.checked ? "true" : "false",
                )
              }
            />
            <input
              type="hidden"
              name="auto_timestamp"
              value={formData.auto_timestamp}
            />
            {formData.auto_timestamp === "true" && (
              <Form.Control
                className="mt-2"
                name="timestamp_pattern"
                value={formData.timestamp_pattern}
                onChange={(event) =>
                  onChange("timestamp_pattern", event.target.value)
                }
                placeholder="Optional Python strftime pattern, e.g. scan_%Y%m%d_%H%M%S"
                aria-label="Filename timestamp pattern"
              />
            )}
          </Form.Group>
        )}
        <Row>
          <Col md={6}>
            <Form.Group className="mb-3">
              <Form.Label>Min. Timestamp</Form.Label>
              <Form.Control
                type="datetime-local"
                step={1}
                name="min_timestamp"
                value={formData.min_timestamp}
                readOnly={readOnly || formData.auto_timestamp === "true"}
                onChange={(event) =>
                  onChange("min_timestamp", event.target.value)
                }
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
                readOnly={readOnly || formData.auto_timestamp === "true"}
                onChange={(event) =>
                  onChange("max_timestamp", event.target.value)
                }
              />
            </Form.Group>
          </Col>
        </Row>
      </fieldset>

      <fieldset className="border rounded p-3 mb-3">
        <legend className="float-none w-auto px-2 fs-6 mb-2">
          Spatial Bounds
        </legend>
        <Form.Group className="mb-3">
          <Form.Check
            type="checkbox"
            id="pcd-metadata-auto-bounds"
            label="Derive spatial bounds from the point cloud"
            checked={formData.auto_bounds === "true"}
            disabled={readOnly}
            onChange={(event) =>
              onChange("auto_bounds", event.target.checked ? "true" : "false")
            }
          />
          <input
            type="hidden"
            name="auto_bounds"
            value={formData.auto_bounds}
          />
          <Form.Text className="text-muted d-block mt-2">
            The bounding box is recomputed from the stored point cloud, so it
            stays correct whenever the scan or its source configuration changes.
            Untick to set the bounds by hand instead; a hand-set box is then
            kept as it is across later edits.
          </Form.Text>
        </Form.Group>

        <VectorInputFields
          label="Min. Bounds"
          fields={MIN_BOUND_FIELDS}
          formData={formData}
          disabled={readOnly || formData.auto_bounds === "true"}
          helperText={BOUNDS_HELPER_TEXT}
          onChange={onChange}
        />

        <VectorInputFields
          label="Max. Bounds"
          fields={MAX_BOUND_FIELDS}
          formData={formData}
          disabled={readOnly || formData.auto_bounds === "true"}
          helperText={BOUNDS_HELPER_TEXT}
          onChange={onChange}
        />
      </fieldset>

      <fieldset className="border rounded p-3 mb-3">
        <legend className="float-none w-auto px-2 fs-6 mb-2">Transform</legend>
        <VectorInputFields
          label="Translation"
          fields={TRANSLATE_FIELDS}
          formData={formData}
          disabled={readOnly}
          helperText={DecimalCoord3.helperText}
          onChange={onChange}
        />

        <VectorInputFields
          label="Rotation"
          fields={ROTATE_FIELDS}
          formData={formData}
          disabled={readOnly}
          helperText={DecimalCoord3.helperText}
          onChange={onChange}
        />

        <VectorInputFields
          label="Scale"
          fields={SCALE_FIELDS}
          formData={formData}
          disabled={readOnly}
          helperText={DecimalSize3.helperText}
          className="mb-0"
          onChange={onChange}
        />
      </fieldset>

      <Form.Group className="mt-3 mb-0">
        <Form.Label>Weather</Form.Label>
        <Form.Control
          type="text"
          name="weather"
          value={formData.weather}
          maxLength={31}
          readOnly={readOnly}
          onChange={(event) => onChange("weather", event.target.value)}
          placeholder="sunny"
        />
      </Form.Group>
    </>
  );
}

export async function loader({ request }: Route.LoaderArgs) {
  const authenticated = await loadAuthenticatedSession(request);
  if (authenticated instanceof Response) return authenticated;
  const { token, user } = authenticated;

  const url = new URL(request.url);
  const requestedSourceGroupId = parseOptionalInteger(
    url.searchParams.get("group_id"),
  );

  const [sourceGroupsRes, pointCloudSpecsRes] = await Promise.all([
    listGroupsSourceGroupsGet({ auth: token.access_token }),
    listSpecsSourceSpecPcdSpecsGet({ auth: token.access_token }),
  ]);
  const sourceGroups = sortSourceGroups(sourceGroupsRes.data ?? []);
  const selectedSourceGroupId = sourceGroups.some(
    (group) => group.id === requestedSourceGroupId,
  )
    ? requestedSourceGroupId
    : null;

  const canonicalSearchParams = new URLSearchParams(url.searchParams);
  if (selectedSourceGroupId != null) {
    canonicalSearchParams.set("group_id", String(selectedSourceGroupId));
  } else {
    canonicalSearchParams.delete("group_id");
  }
  if (
    canonicalSearchParams.get("group_id") !== url.searchParams.get("group_id")
  ) {
    canonicalSearchParams.delete("page");
    canonicalSearchParams.delete("pageSize");
    return redirect(`${url.pathname}?${canonicalSearchParams.toString()}`);
  }

  const emptyPageRequest = getGridPaginationRequest(request);
  const pointCloudMetadatasRes =
    selectedSourceGroupId == null
      ? {
          data: [],
          error: undefined,
          pagination: {
            pageNumber: emptyPageRequest.pageNumber,
            pageSize: emptyPageRequest.pageSize,
            pageSizes: [...GRID_PAGE_SIZES],
            totalItems: 0,
          } satisfies GridPagination,
        }
      : await listGridPage(request, (pagination) =>
          listMetadatasSourceDataPcdMetadataGet({
            auth: token.access_token,
            query: { group_id: selectedSourceGroupId, ...pagination },
          }),
        );

  const dataset = pointCloudMetadatasRes.data ?? [];
  const allMetadataIdsRes =
    selectedSourceGroupId == null
      ? { data: [], error: undefined }
      : await listMetadataIdsSourceDataPcdMetadataIdsGet({
          auth: token.access_token,
          query: { group_id: selectedSourceGroupId },
        });
  const allSelectableIds = allMetadataIdsRes.data ?? [];
  const eligibleSourceGroupIds = Array.from(
    new Set(
      (pointCloudSpecsRes.data ?? []).flatMap((source) =>
        source.groups.map((group) => group.id),
      ),
    ),
  );

  const loaderError =
    pointCloudMetadatasRes.error ??
    allMetadataIdsRes.error ??
    sourceGroupsRes.error ??
    pointCloudSpecsRes.error;

  return {
    user,
    dataset,
    allSelectableIds,
    eligibleSourceGroupIds,
    sourceGroups,
    selectedSourceGroupId,
    pagination: pointCloudMetadatasRes.pagination,
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

  try {
    if (actionType === "create") {
      const payload = createPayloadFromFormData(formData);
      if (payload.error || !payload.data) {
        return {
          error: payload.error ?? "Unable to create point cloud.",
        };
      }

      const res = await createMetadataSourceDataPcdMetadataPost({
        auth: token.access_token,
        body: payload.data,
      });
      if (res.error) {
        return { error: normalizeError(res.error) };
      }

      return { success: "Point cloud created successfully." };
    }

    if (actionType === "bulk_create_from_files") {
      const paths = formData
        .getAll("path")
        .filter(
          (value: FormDataEntryValue): value is string =>
            typeof value === "string",
        );
      const payload = createBulkPayloadFromPaths(formData, paths);
      if (payload.error || !payload.data) {
        return {
          error: payload.error ?? "Unable to create point cloud metadata.",
        };
      }

      const res = await bulkCreateMetadatasSourceDataPcdMetadataBulkPost({
        auth: token.access_token,
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

    if (actionType === "update") {
      const id = Number.parseInt(trimFormValue(formData, "id"), 10);
      if (Number.isNaN(id)) {
        return { error: "A valid point cloud ID is required." };
      }

      const payload = updatePayloadFromFormData(formData);
      if (payload.error || !payload.data) {
        return {
          error: payload.error ?? "Unable to update point cloud.",
        };
      }

      const res = await updateMetadataSourceDataPcdMetadataIdPatch({
        auth: token.access_token,
        path: { id },
        body: {
          ...payload.data,
          issued_at: formData.get("issued_at") as string,
        },
      });
      if (res.error) {
        return { error: normalizeError(res.error) };
      }

      return { success: "Point cloud updated successfully." };
    }

    if (actionType === "delete") {
      const id = Number.parseInt(trimFormValue(formData, "id"), 10);
      if (Number.isNaN(id)) {
        return { error: "A valid point cloud ID is required." };
      }

      const res = await deleteMetadataSourceDataPcdMetadataIdDelete({
        auth: token.access_token,
        path: { id },
      });
      if (res.error) {
        return { error: normalizeError(res.error) };
      }

      return { success: "Point cloud metadata deleted successfully." };
    }

    if (actionType === "batch_update") {
      const selectedIds = parseSelectedIds(
        trimFormValue(formData, "selectedIds"),
      );
      if (!selectedIds || selectedIds.length === 0) {
        return { error: "Select at least one point cloud to update." };
      }

      const payload = batchPayloadFromFormData(formData);
      if (payload.error || !payload.data) {
        return {
          error: payload.error ?? "Unable to batch update point clouds.",
        };
      }

      if (
        formData.get("update_timestamps") === "true" &&
        trimFormValue(formData, "auto_timestamp") === "true"
      ) {
        const records = await Promise.all(
          selectedIds.map((id) =>
            readMetadataSourceDataPcdMetadataIdGet({
              auth: token.access_token,
              path: { id },
            }),
          ),
        );
        const failed = records.find(
          (record) => Boolean(record.error) || !record.data,
        );
        if (failed) {
          return {
            error: normalizeError(failed.error ?? "Unable to read metadata."),
          };
        }
        const groups = new Map<string | null, number[]>();
        for (const [index, record] of records.entries()) {
          const timestamp =
            deriveTimestampBoundsFromFilename(
              String(record.data?.uri ?? ""),
              trimFormValue(formData, "timestamp_pattern"),
            )?.minTimestamp ?? null;
          groups.set(timestamp, [
            ...(groups.get(timestamp) ?? []),
            selectedIds[index],
          ]);
        }
        let updatedCount = 0;
        for (const [timestamp, ids] of groups) {
          const res = await bulkUpdateMetadatasSourceDataPcdMetadataBulkPatch({
            auth: token.access_token,
            body: {
              ids,
              data: {
                ...payload.data,
                min_timestamp: timestamp,
                max_timestamp: timestamp,
              },
            },
          });
          if (res.error) {
            return {
              error:
                updatedCount === 0
                  ? normalizeError(res.error)
                  : `${updatedCount} of ${selectedIds.length} point clouds were updated before an error: ${normalizeError(res.error)}. Reload before retrying.`,
            };
          }
          updatedCount += ids.length;
        }
      } else {
        const res = await bulkUpdateMetadatasSourceDataPcdMetadataBulkPatch({
          auth: token.access_token,
          body: { ids: selectedIds, data: payload.data },
        });
        if (res.error) return { error: normalizeError(res.error) };
      }

      return {
        success:
          selectedIds.length === 1
            ? "Point cloud updated successfully."
            : `${selectedIds.length} point clouds updated successfully.`,
      };
    }

    if (actionType === "batch_delete") {
      const selectedIds = parseSelectedIds(
        trimFormValue(formData, "selectedIds"),
      );
      if (!selectedIds || selectedIds.length === 0) {
        return { error: "Select at least one point cloud to delete." };
      }

      const res = await bulkDeleteMetadatasSourceDataPcdMetadataBulkDelete({
        auth: token.access_token,
        body: selectedIds,
      });
      if (res.error) {
        return { error: normalizeError(res.error) };
      }

      return {
        success:
          selectedIds.length === 1
            ? "Point cloud metadata deleted successfully."
            : `${selectedIds.length} point cloud metadata entries deleted successfully.`,
      };
    }

    return { error: "Unknown action." };
  } catch (error) {
    return { error: normalizeError(error) };
  }
}

function PointCloudMetadataTable({
  SG,
  user,
  dataset,
  allSelectableIds,
  eligibleSourceGroupIds,
  sourceGroups,
  pagination,
  actionData,
  selectionEnabled,
  selectedSourceGroupId,
}: {
  SG: SlickgridModule;
  user: User;
  dataset: PointCloudMetadata[];
  allSelectableIds: number[];
  eligibleSourceGroupIds: number[];
  sourceGroups: SourceGroup[];
  pagination: GridPagination;
  actionData?: Route.ComponentProps["actionData"];
  selectionEnabled: boolean;
  selectedSourceGroupId: number | null;
}) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [gridOptions, setGridOptions] = useState<GridOption | undefined>(
    undefined,
  );
  const [gridOptionsSignature, setGridOptionsSignature] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingPointCloudMetadata, setEditingPointCloudMetadata] =
    useState<PointCloudMetadata | null>(null);
  const [showBatchEditModal, setShowBatchEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [pointCloudMetadataToDelete, setPointCloudMetadataToDelete] =
    useState<PointCloudMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] =
    useState<PointCloudMetadataFormState>(EMPTY_FORM);
  const [batchFormData, setBatchFormData] =
    useState<BatchPointCloudMetadataFormState>(EMPTY_BATCH_FORM);
  const reactGridRef = useRef<SlickgridReactInstance | null>(null);
  const selectionEnabledRef = useRef(selectionEnabled);
  const selectedAllIdsRef = useRef<number[] | null>(null);
  const eligibleSourceGroupIdSet = new Set(eligibleSourceGroupIds);

  const { SlickgridReact } = SG;
  const canManage = user.roles.includes("data-manager");
  const paginationGridOptions = useRoutePaginationGridOptions(
    pagination,
    dataset,
  );
  const gridSignature = [
    selectedSourceGroupId ?? "none",
    pagination.pageNumber,
    pagination.pageSize,
    pagination.totalItems,
    dataset.length,
    selectionEnabled ? "enabled" : "disabled",
    canManage ? "manage" : "readonly",
  ].join(":");
  const batchFieldsSelected =
    batchFormData.update_group ||
    batchFormData.update_weather ||
    batchFormData.update_auto_bounds ||
    batchFormData.update_min_bounds ||
    batchFormData.update_max_bounds ||
    batchFormData.update_timestamps ||
    batchFormData.update_translate ||
    batchFormData.update_rotate ||
    batchFormData.update_scale;

  useEffect(() => {
    selectionEnabledRef.current = selectionEnabled;
  }, [selectionEnabled]);

  useEffect(() => {
    reactGridRef.current?.slickGrid.invalidate();
    syncRoutePaginationGrid(reactGridRef.current, pagination);
    if (selectedAllIdsRef.current == null) {
      reactGridRef.current?.gridService.setSelectedRows([]);
      setSelectedIds([]);
      return;
    }

    selectedAllIdsRef.current = allSelectableIds;
    const numFiltered =
      reactGridRef.current?.dataView.getFilteredItemCount() ?? 0;
    reactGridRef.current?.gridService.setSelectedRows(
      Array.from({ length: numFiltered }, (_, index) => index),
    );
    setSelectedIds(allSelectableIds);
  }, [dataset, pagination, allSelectableIds]);

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
      setEditingPointCloudMetadata(null);
      setPointCloudMetadataToDelete(null);
      setFormData(EMPTY_FORM);
      setBatchFormData(EMPTY_BATCH_FORM);
    }
  }, [actionData]);

  function getAllSelectedItems(): PointCloudMetadata[] {
    const items = reactGridRef.current?.dataView.getAllSelectedItems() ?? [];
    return items.filter((item): item is PointCloudMetadata => item != null);
  }

  function getSelectedCount(): number {
    return selectedAllIdsRef.current?.length ?? getAllSelectedItems().length;
  }

  function handleCreate() {
    if (!selectionEnabledRef.current) {
      return;
    }

    setEditingPointCloudMetadata(null);
    setFormData({
      ...EMPTY_FORM,
      group_id:
        selectedSourceGroupId == null ? "" : String(selectedSourceGroupId),
    });
    setError(null);
    setShowModal(true);
  }

  function handleEdit(pointCloudMetadata: PointCloudMetadata) {
    if (!selectionEnabledRef.current) {
      return;
    }

    setEditingPointCloudMetadata(pointCloudMetadata);
    setFormData(pointCloudMetadataToFormState(pointCloudMetadata));
    setError(null);
    setShowModal(true);
  }

  function handleDelete(pointCloudMetadata: PointCloudMetadata) {
    if (!selectionEnabledRef.current) {
      return;
    }

    setPointCloudMetadataToDelete(pointCloudMetadata);
    setError(null);
    setShowDeleteModal(true);
  }

  function handleBatchEdit() {
    if (!selectionEnabledRef.current) {
      return;
    }

    setBatchFormData(EMPTY_BATCH_FORM);
    setError(null);
    setShowBatchEditModal(true);
  }

  function handleBatchDelete() {
    if (!selectionEnabledRef.current) {
      return;
    }

    setPointCloudMetadataToDelete(null);
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
        itemVisibilityOverride: () => !canManage || getSelectedCount() === 1,
      },
    ];

    if (canManage) {
      commandItems.push({
        command: "batch_edit",
        title: "Batch Edit Details",
        iconCssClass: "fas fa-layer-group fa-fw",
        itemVisibilityOverride: () => getSelectedCount() > 1,
        action: () => handleBatchEdit(),
      });
      commandItems.push({
        command: "batch_delete",
        title: "Batch Delete",
        iconCssClass: "fas fa-trash fa-fw",
        itemVisibilityOverride: () => getSelectedCount() > 1,
        action: () => handleBatchDelete(),
      });
      commandItems.push({
        command: "delete",
        title: "Delete",
        iconCssClass: "fas fa-trash fa-fw",
        action: (_event, args) => handleDelete(args.dataContext),
        itemVisibilityOverride: () => getSelectedCount() === 1,
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
        id: "uri",
        name: "URI",
        field: "uri",
        type: "string",
        filterable: true,
        sortable: true,
        formatter: (_row, _cell, value) => formatUnknown(value),
      },
      {
        id: "weather",
        name: "Weather",
        field: "weather",
        type: "string",
        filterable: true,
        sortable: true,
      },
      {
        id: "min_timestamp",
        name: "Min",
        field: "min_timestamp",
        type: "string",
        columnGroup: "Timestamp",
        filterable: true,
        sortable: true,
      },
      {
        id: "max_timestamp",
        name: "Max",
        field: "max_timestamp",
        type: "string",
        columnGroup: "Timestamp",
        filterable: true,
        sortable: true,
      },
      {
        id: "min_x",
        name: "Min X",
        field: "min_x",
        type: "string",
        columnGroup: "Spatial Bounds",
        filterable: false,
        sortable: false,
      },
      {
        id: "min_y",
        name: "Min Y",
        field: "min_y",
        type: "string",
        columnGroup: "Spatial Bounds",
        filterable: false,
        sortable: false,
      },
      {
        id: "min_z",
        name: "Min Z",
        field: "min_z",
        type: "string",
        columnGroup: "Spatial Bounds",
        filterable: false,
        sortable: false,
      },
      {
        id: "max_x",
        name: "Max X",
        field: "max_x",
        type: "string",
        columnGroup: "Spatial Bounds",
        filterable: false,
        sortable: false,
      },
      {
        id: "max_y",
        name: "Max Y",
        field: "max_y",
        type: "string",
        columnGroup: "Spatial Bounds",
        filterable: false,
        sortable: false,
      },
      {
        id: "max_z",
        name: "Max Z",
        field: "max_z",
        type: "string",
        columnGroup: "Spatial Bounds",
        filterable: false,
        sortable: false,
      },
      {
        id: "last_edit_at",
        name: "Last Edited",
        field: "last_edit_at",
        type: "string",
        filterable: true,
        sortable: true,
      },
    ]);

    setGridOptions({
      ...(selectableConfig({
        commandItems: commandItems as never,
        multiSelect: true,
      }) as unknown as GridOption),
      autoResize: { container: "#grid-container" },
      createPreHeaderPanel: true,
      enableAutoResize: true,
      showPreHeaderPanel: true,
      ...paginationGridOptions,
    });
    setGridOptionsSignature(gridSignature);
  }

  function onSelectCurrentPage() {
    selectedAllIdsRef.current = null;
    const numFiltered =
      reactGridRef.current?.dataView.getFilteredItemCount() ?? 0;
    reactGridRef.current?.gridService.setSelectedRows(
      Array.from({ length: numFiltered }, (_, index) => index),
    );
    setSelectedIds(dataset.map((item) => item.id));
  }

  function onSelectAll() {
    selectedAllIdsRef.current = allSelectableIds;
    const numFiltered =
      reactGridRef.current?.dataView.getFilteredItemCount() ?? 0;
    reactGridRef.current?.gridService.setSelectedRows(
      Array.from({ length: numFiltered }, (_, index) => index),
    );
    setSelectedIds(allSelectableIds);
  }

  function onDeselectAll() {
    selectedAllIdsRef.current = null;
    reactGridRef.current?.gridService.setSelectedRows([]);
    setSelectedIds([]);
  }

  function onGridStateChanged() {
    const selectedItems = getAllSelectedItems();
    if (selectedAllIdsRef.current && selectedItems.length === dataset.length) {
      setSelectedIds(selectedAllIdsRef.current);
      return;
    }

    selectedAllIdsRef.current = null;
    setSelectedIds(selectedItems.map((item) => item.id));
  }

  function reactGridReady(reactGrid: SlickgridReactInstance) {
    reactGridRef.current = reactGrid;
  }

  function updateFormField<K extends keyof PointCloudMetadataFormState>(
    field: K,
    value: string,
  ) {
    setFormData((previous) => ({ ...previous, [field]: value }));
  }

  function updateBatchField<K extends keyof PointCloudMetadataFormState>(
    field: K,
    value: string,
  ) {
    setBatchFormData((previous) => ({ ...previous, [field]: value }));
  }

  function updateBatchToggle(field: BatchToggleKey, value: boolean) {
    setBatchFormData((previous) => ({ ...previous, [field]: value }));
  }

  useEffect(() => {
    defineGrid();
  }, [
    canManage,
    sourceGroups,
    paginationGridOptions,
    selectionEnabled,
    gridSignature,
  ]);

  return (
    <>
      {selectionEnabled && (
        <>
          <div className="mb-3 d-flex gap-2">
            <ButtonGroup className="justify-content-start me-auto">
              {canManage && (
                <Button variant="primary" onClick={handleCreate}>
                  Create Point Cloud Metadata
                </Button>
              )}
            </ButtonGroup>
            <GridSelectionButtons
              selectedCount={selectedIds.length}
              currentPageCount={dataset.length}
              allSelectableCount={allSelectableIds.length}
              onSelectCurrentPage={onSelectCurrentPage}
              onSelectAll={onSelectAll}
              onDeselectAll={onDeselectAll}
            />
          </div>

          <div className="slickgrid-container" id="grid-container">
            {gridOptions && gridOptionsSignature === gridSignature && (
              <SlickgridReact
                key={gridSignature}
                gridId="point-cloud-grid"
                columns={columns}
                options={gridOptions}
                dataset={dataset}
                onReactGridCreated={(event) => reactGridReady(event.detail)}
                onGridStateChanged={() => onGridStateChanged()}
              />
            )}
          </div>
        </>
      )}

      <Modal show={showModal} onHide={() => setShowModal(false)} size="xl">
        <Modal.Header closeButton>
          <Modal.Title>
            {editingPointCloudMetadata
              ? canManage
                ? "Edit Point Cloud"
                : "View Point Cloud"
              : "Create Point Cloud"}
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
              value={editingPointCloudMetadata ? "update" : "create"}
            />
            {editingPointCloudMetadata && (
              <>
                <input
                  type="hidden"
                  name="id"
                  value={editingPointCloudMetadata.id}
                />
                <input
                  type="hidden"
                  name="issued_at"
                  value={editingPointCloudMetadata.last_edit_at ?? ""}
                />
              </>
            )}
            {formData.group_id !== "" && (
              <input type="hidden" name="group_id" value={formData.group_id} />
            )}

            <PointCloudMetadataFields
              eligibleSourceGroupIds={eligibleSourceGroupIdSet}
              formData={formData}
              sourceGroups={sourceGroups}
              readOnly={!canManage}
              lockSourceGroup={true}
              onChange={updateFormField}
            />
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              {canManage ? "Cancel" : "Close"}
            </Button>
            {canManage && (
              <Button variant="primary" type="submit">
                Save
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
            Batch Edit Point Clouds ({selectedIds.length} selected)
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
              name="update_group"
              value={String(batchFormData.update_group)}
            />
            <input
              type="hidden"
              name="update_weather"
              value={String(batchFormData.update_weather)}
            />
            <input
              type="hidden"
              name="update_auto_bounds"
              value={String(batchFormData.update_auto_bounds)}
            />
            <input
              type="hidden"
              name="update_min_bounds"
              value={String(batchFormData.update_min_bounds)}
            />
            <input
              type="hidden"
              name="update_max_bounds"
              value={String(batchFormData.update_max_bounds)}
            />
            <input
              type="hidden"
              name="update_timestamps"
              value={String(batchFormData.update_timestamps)}
            />
            <input
              type="hidden"
              name="update_translate"
              value={String(batchFormData.update_translate)}
            />
            <input
              type="hidden"
              name="update_rotate"
              value={String(batchFormData.update_rotate)}
            />
            <input
              type="hidden"
              name="update_scale"
              value={String(batchFormData.update_scale)}
            />

            <BatchSection
              label="Update Source Group"
              checked={batchFormData.update_group}
              onToggle={(checked) => updateBatchToggle("update_group", checked)}
            >
              <Form.Select
                name="group_id"
                value={batchFormData.group_id}
                onChange={(event) =>
                  updateBatchField("group_id", event.target.value)
                }
              >
                <option value="">Select a source group</option>
                {sourceGroups.map((group) => (
                  <option
                    key={group.id}
                    value={String(group.id)}
                    disabled={!eligibleSourceGroupIdSet.has(group.id)}
                  >
                    {formatSourceGroupOptionLabel(
                      group,
                      eligibleSourceGroupIdSet.has(group.id),
                    )}
                  </option>
                ))}
              </Form.Select>
              <Form.Text className="text-muted">
                Replaces the source group of every selected point cloud.
              </Form.Text>
              <div className="text-danger small">
                A point cloud must belong to a source group, so this cannot be
                left empty. Leave the box unticked to keep each file&rsquo;s
                current group.
              </div>
            </BatchSection>

            <BatchSection
              label="Update Weather"
              checked={batchFormData.update_weather}
              onToggle={(checked) =>
                updateBatchToggle("update_weather", checked)
              }
            >
              <Form.Control
                type="text"
                name="weather"
                value={batchFormData.weather}
                maxLength={31}
                onChange={(event) =>
                  updateBatchField("weather", event.target.value)
                }
                placeholder="Leave empty to clear"
              />
              <Form.Text className="text-muted">
                Replaces the weather of every selected point cloud. Leave it
                empty to clear the value on all of them.
              </Form.Text>
            </BatchSection>

            <BatchSection
              label="Update Bounds Derivation"
              checked={batchFormData.update_auto_bounds}
              onToggle={(checked) =>
                updateBatchToggle("update_auto_bounds", checked)
              }
            >
              <Form.Check
                type="checkbox"
                label="Derive spatial bounds from point clouds"
                checked={batchFormData.auto_bounds === "true"}
                onChange={(event) =>
                  updateBatchField(
                    "auto_bounds",
                    event.target.checked ? "true" : "false",
                  )
                }
              />
              <input
                type="hidden"
                name="auto_bounds"
                value={batchFormData.auto_bounds}
              />
              <Form.Text className="text-muted">
                Turn off to keep each selected point cloud's current bounds by
                hand. Turn on to re-derive each one from its scan.
              </Form.Text>
            </BatchSection>

            <BatchSection
              label="Update Min. Bounds"
              checked={batchFormData.update_min_bounds}
              onToggle={(checked) =>
                updateBatchToggle("update_min_bounds", checked)
              }
            >
              <VectorInputFields
                fields={MIN_BOUND_FIELDS}
                formData={batchFormData}
                disabled={false}
                helperText={DecimalCoord3.helperText}
                className="mb-0"
                onChange={updateBatchField}
              />
              <Form.Text className="text-muted">
                Replaces the minimum bound of every selected point cloud. A
                blank value stores no bound, which leaves that axis unbounded.
              </Form.Text>
              <div className="text-danger small">
                Setting a bound here stores it by hand, so it also stops the box
                being re-derived from the scan for every selected point cloud.
              </div>
            </BatchSection>

            <BatchSection
              label="Update Max. Bounds"
              checked={batchFormData.update_max_bounds}
              onToggle={(checked) =>
                updateBatchToggle("update_max_bounds", checked)
              }
            >
              <VectorInputFields
                fields={MAX_BOUND_FIELDS}
                formData={batchFormData}
                disabled={false}
                helperText={DecimalCoord3.helperText}
                className="mb-0"
                onChange={updateBatchField}
              />
              <Form.Text className="text-muted">
                Replaces the maximum bound of every selected point cloud. A
                blank value stores no bound, which leaves that axis unbounded.
              </Form.Text>
              <div className="text-danger small">
                Setting a bound here stores it by hand, so it also stops the box
                being re-derived from the scan for every selected point cloud.
              </div>
            </BatchSection>

            <BatchSection
              label="Update Timestamp Range"
              checked={batchFormData.update_timestamps}
              onToggle={(checked) =>
                updateBatchToggle("update_timestamps", checked)
              }
            >
              <Form.Check
                type="checkbox"
                label="Detect timestamps from each filename"
                checked={batchFormData.auto_timestamp === "true"}
                onChange={(event) =>
                  updateBatchField(
                    "auto_timestamp",
                    event.target.checked ? "true" : "false",
                  )
                }
              />
              <input
                type="hidden"
                name="auto_timestamp"
                value={batchFormData.auto_timestamp}
              />
              {batchFormData.auto_timestamp === "true" && (
                <Form.Control
                  className="my-2"
                  name="timestamp_pattern"
                  value={batchFormData.timestamp_pattern}
                  onChange={(event) =>
                    updateBatchField("timestamp_pattern", event.target.value)
                  }
                  placeholder="Optional Python strftime pattern, e.g. scan_%Y%m%d_%H%M%S"
                  aria-label="Filename timestamp pattern"
                />
              )}
              <Row>
                <Col md={6}>
                  <Form.Control
                    type="datetime-local"
                    step={1}
                    name="min_timestamp"
                    value={batchFormData.min_timestamp}
                    disabled={batchFormData.auto_timestamp === "true"}
                    onChange={(event) =>
                      updateBatchField("min_timestamp", event.target.value)
                    }
                  />
                </Col>
                <Col md={6}>
                  <Form.Control
                    type="datetime-local"
                    step={1}
                    name="max_timestamp"
                    value={batchFormData.max_timestamp}
                    disabled={batchFormData.auto_timestamp === "true"}
                    onChange={(event) =>
                      updateBatchField("max_timestamp", event.target.value)
                    }
                  />
                </Col>
              </Row>
              <Form.Text className="text-muted d-block mt-2">
                {batchFormData.auto_timestamp === "true"
                  ? "Each selected filename supplies its own range; unrecognized names receive no timestamps."
                  : "Replaces the timestamp range of every selected point cloud. Leave a field empty to clear it on all of them."}
              </Form.Text>
            </BatchSection>

            <BatchSection
              label="Update Translation"
              checked={batchFormData.update_translate}
              onToggle={(checked) =>
                updateBatchToggle("update_translate", checked)
              }
            >
              <VectorInputFields
                fields={TRANSLATE_FIELDS}
                formData={batchFormData}
                disabled={false}
                helperText={DecimalCoord3.helperText}
                className="mb-0"
                onChange={updateBatchField}
              />
              <Form.Text className="text-muted">
                Replaces the translation of every selected point cloud.
              </Form.Text>
              <div className="text-danger small">
                Every component is required, so this cannot be left empty.
              </div>
            </BatchSection>

            <BatchSection
              label="Update Rotation"
              checked={batchFormData.update_rotate}
              onToggle={(checked) =>
                updateBatchToggle("update_rotate", checked)
              }
            >
              <VectorInputFields
                fields={ROTATE_FIELDS}
                formData={batchFormData}
                disabled={false}
                helperText={DecimalCoord3.helperText}
                className="mb-0"
                onChange={updateBatchField}
              />
              <Form.Text className="text-muted">
                Replaces the rotation of every selected point cloud.
              </Form.Text>
              <div className="text-danger small">
                Every component is required, so this cannot be left empty.
              </div>
            </BatchSection>

            <BatchSection
              label="Update Scale"
              checked={batchFormData.update_scale}
              onToggle={(checked) => updateBatchToggle("update_scale", checked)}
            >
              <VectorInputFields
                fields={SCALE_FIELDS}
                formData={batchFormData}
                disabled={false}
                helperText={DecimalSize3.helperText}
                className="mb-0"
                onChange={updateBatchField}
              />
              <Form.Text className="text-muted">
                Replaces the scale of every selected point cloud.
              </Form.Text>
              <div className="text-danger small">
                Every component is required, so this cannot be left empty.
              </div>
            </BatchSection>

            {!batchFieldsSelected && (
              <Alert variant="info">
                Choose one or more field groups to apply to the selected point
                clouds.
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
              disabled={!batchFieldsSelected}
            >
              Apply to {selectedIds.length} Point Clouds
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
            {pointCloudMetadataToDelete ? (
              <>
                <input type="hidden" name="_action" value="delete" />
                <input
                  type="hidden"
                  name="id"
                  value={pointCloudMetadataToDelete.id}
                />
                <p>
                  Are you sure you want to delete point cloud{" "}
                  <strong>
                    {formatUnknown(pointCloudMetadataToDelete.uri)}
                  </strong>
                  ?
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
                  {selectedIds.length === 1 ? "point cloud" : "point clouds"}?
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
  return <div>Loading point clouds...</div>;
}

export default function PointCloudMetadatas({
  loaderData,
}: Route.ComponentProps) {
  const {
    SG,
    user,
    dataset,
    allSelectableIds,
    eligibleSourceGroupIds,
    sourceGroups,
    selectedSourceGroupId,
    pagination,
    loaderError,
  } = loaderData;
  const actionData = useActionData<typeof action>();
  const [sourceGroupValue, setSourceGroupValue] = useState(
    selectedSourceGroupId == null ? "" : String(selectedSourceGroupId),
  );
  const sourceDataLoaded =
    selectedSourceGroupId != null && sourceGroupValue !== "";

  useEffect(() => {
    setSourceGroupValue(
      selectedSourceGroupId == null ? "" : String(selectedSourceGroupId),
    );
  }, [selectedSourceGroupId]);

  return createPageContent({
    title: "Point Clouds",
    header: (
      <>
        <Breadcrumb className="mb-1">
          <Breadcrumb.Item href="/source/data">Data Storage</Breadcrumb.Item>
          <Breadcrumb.Item active>Point Cloud Metadata</Breadcrumb.Item>
        </Breadcrumb>
        <h2 className="py-2">Point Cloud Metadata</h2>
      </>
    ),
    main: (
      <>
        <SourceDataFilterForm
          controlIdPrefix="pcd"
          sourceGroups={sourceGroups}
          selectedSourceGroupId={selectedSourceGroupId}
          onSourceGroupValueChange={setSourceGroupValue}
        />
        <PointCloudMetadataTable
          SG={SG}
          user={user}
          dataset={dataset}
          allSelectableIds={allSelectableIds}
          eligibleSourceGroupIds={eligibleSourceGroupIds}
          sourceGroups={sourceGroups}
          pagination={pagination}
          actionData={actionData}
          selectionEnabled={sourceDataLoaded}
          selectedSourceGroupId={selectedSourceGroupId}
        />
      </>
    ),
    alerts: loaderError ? { error: loaderError } : actionData,
  });
}
