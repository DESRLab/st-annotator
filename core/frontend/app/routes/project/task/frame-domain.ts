import _ from "lodash";
import { z } from "zod";

import type {
  FrameCreate,
  FramePublicWithParents as Frame,
} from "../../../../client";
import { PartialSTBounds } from "sta/common";
import {
  applyDateFilterToQuery,
  applyInFilterToQuery,
  applyNumericFilterToQuery,
  applySortersToQuery,
  type GridQuery,
  type GridStateRequest,
} from "../../../loaders";
import {
  identifierArraySchema,
  jsonFormValueSchema,
  nullableDateTimeSchema,
  nullableIdentifierSchema,
  nullableNumberSchema,
  submittedBooleanSchema,
} from "../../../forms";

export const CLIENT_BULK_CREATE_THRESHOLD = 500;
export const CLIENT_BULK_CREATE_CHUNK_SIZE = 500;
export const FRAME_DELETE_CONCURRENCY = 10;

/**
 * The batch dialog's submission. `completion` is the value every selected frame
 * is written to, while `updateCompletion` is the opt-in that decides whether the
 * attribute is sent at all, so a dialog left unticked cannot overwrite anything.
 */
export const frameBatchFormSchema = z.object({
  selectedIds: identifierArraySchema,
  updateCompletion: submittedBooleanSchema,
  completion: submittedBooleanSchema,
});

const frameFormValuesSchema = z.object({
  sourceGroupId: nullableIdentifierSchema,
  labelBranchId: nullableIdentifierSchema,
  completionOnly: submittedBooleanSchema,
  stBoundsMulti: jsonFormValueSchema(
    z.array(PartialSTBounds.SCHEMA),
  ).optional(),
  minX: nullableNumberSchema,
  minY: nullableNumberSchema,
  minZ: nullableNumberSchema,
  maxX: nullableNumberSchema,
  maxY: nullableNumberSchema,
  maxZ: nullableNumberSchema,
  minTimestamp: nullableDateTimeSchema,
  maxTimestamp: nullableDateTimeSchema,
  isComplete: submittedBooleanSchema,
});

/**
 * Mirrors the backend's `PartialSTBounds` validators: each bound is otherwise
 * checked on its own, so an inverted pair would only be rejected by the API.
 * Empty fields mean "leave this bound unchanged" and cannot be compared.
 */
export const frameFormSchema = frameFormValuesSchema.superRefine(
  (form, ctx) => {
    const addInvertedNumberIssue = (
      min: number | null,
      max: number | null,
      path: [string],
      label: string,
    ) => {
      if (min === null || max === null || min <= max) return;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: `The minimum ${label} cannot be greater than the maximum ${label}.`,
      });
    };

    addInvertedNumberIssue(form.minX, form.maxX, ["minX"], "X coordinate");
    addInvertedNumberIssue(form.minY, form.maxY, ["minY"], "Y coordinate");
    addInvertedNumberIssue(form.minZ, form.maxZ, ["minZ"], "Z coordinate");

    const { minTimestamp, maxTimestamp } = form;
    if (
      minTimestamp !== null &&
      maxTimestamp !== null &&
      new Date(minTimestamp) > new Date(maxTimestamp)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minTimestamp"],
        message:
          "The minimum timestamp cannot be greater than the maximum timestamp.",
      });
    }
  },
);

const FRAME_SORTABLE_COLUMNS = new Set([
  "id",
  "account_id",
  "source_group_id",
  "label_branch_id",
  "min_timestamp",
  "max_timestamp",
  "last_viewed_at",
  "is_complete",
]);

export async function mapInBatches<T, R>(
  items: readonly T[],
  batchSize: number,
  operation: (item: T) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError("Batch size must be a positive integer.");
  }

  const results: R[] = [];
  for (let start = 0; start < items.length; start += batchSize) {
    results.push(
      ...(await Promise.all(
        items.slice(start, start + batchSize).map(operation),
      )),
    );
  }
  return results;
}

export function buildFramesQuery({
  filters,
  sorters,
}: GridStateRequest): GridQuery {
  const query: GridQuery = {};

  for (const filter of filters) {
    switch (filter.columnId) {
      case "id":
        applyNumericFilterToQuery(query, filter, "id");
        break;
      case "account_id":
        applyInFilterToQuery(query, filter, "account_id");
        break;
      case "source_group_id":
        applyInFilterToQuery(query, filter, "source_group_id");
        break;
      case "label_branch_id":
        applyInFilterToQuery(query, filter, "label_branch_id");
        break;
      case "min_timestamp":
        applyDateFilterToQuery(query, filter, "min_timestamp");
        break;
      case "max_timestamp":
        applyDateFilterToQuery(query, filter, "max_timestamp");
        break;
      case "last_viewed_at":
        applyDateFilterToQuery(query, filter, "last_viewed_at");
        break;
      case "is_complete":
        applyInFilterToQuery(query, filter, "is_complete");
        break;
    }
  }

  applySortersToQuery(query, sorters, FRAME_SORTABLE_COLUMNS);
  return query;
}

export function parseOptionalInteger(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function formatCoords(frame: Frame, prefix: "min" | "max") {
  const x = frame[`${prefix}_x`];
  const y = frame[`${prefix}_y`];
  const z = frame[`${prefix}_z`];
  return `(${x ?? "—"}, ${y ?? "—"}, ${z ?? "—"})`;
}

export function toDisplayText(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  if (typeof value === "symbol" || typeof value === "function") {
    return value.toString();
  }
  return "";
}

export function toDateTimeInputValue(value: string | null | undefined) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function frameCreateFromBounds(
  stBounds: PartialSTBounds,
  base: Omit<
    FrameCreate,
    | "min_x"
    | "min_y"
    | "min_z"
    | "max_x"
    | "max_y"
    | "max_z"
    | "min_timestamp"
    | "max_timestamp"
  >,
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

export function getFrameOptionsFromDataset(dataset: Frame[]) {
  return {
    accounts: _.uniqBy(
      dataset.map((frame) => frame.account),
      (account) => account.id,
    ),
    sourceGroups: _.uniqBy(
      dataset.flatMap((frame) =>
        frame.source_group ? [frame.source_group] : [],
      ),
      (sourceGroup) => sourceGroup.id,
    ),
    labelBranches: _.uniqBy(
      dataset.flatMap((frame) =>
        frame.label_branch ? [frame.label_branch] : [],
      ),
      (labelBranch) => labelBranch.id,
    ),
  };
}
