import { z } from "zod";

import {
  ObjectClassSelectionState,
  type ObjectClassSelectionStateValues,
} from "sta/app/editor";
import { DecimalVector3Data, Timestamp } from "sta/common";

export interface QualityLevel {
  name: string;
  value: number | null;
  equals: (other: QualityLevel) => boolean;
  toJSON: () => number | null;
}

function makeLevel(name: string, value: number | null): QualityLevel {
  return {
    name: name,
    value: value,
    equals: (other: QualityLevel) => other.value === value,
    toJSON: () => value,
  };
}

export const DistinctiveLevel: Record<string, QualityLevel> = {
  Excellent: makeLevel("Excellent", 0),
  Satisfactory: makeLevel("Satisfactory", 1),
  Poor: makeLevel("Poor", 2),
  Unknown: makeLevel("Unknown", null),
};

export const OcclusionLevel: Record<string, QualityLevel> = {
  Excellent: makeLevel("Excellent", 0),
  Satisfactory: makeLevel("Satisfactory", 1),
  Poor: makeLevel("Poor", 2),
  Unknown: makeLevel("Unknown", null),
};

export function getDistinctiveLvByValue(
  value: number | null | undefined,
): QualityLevel {
  return (
    Object.values(DistinctiveLevel).find((level) => level.value === value) ??
    DistinctiveLevel.Unknown
  );
}

export function getOcclusionLvByValue(
  value: number | null | undefined,
): QualityLevel {
  return (
    Object.values(OcclusionLevel).find((level) => level.value === value) ??
    OcclusionLevel.Unknown
  );
}

/**
 * The fully resolved values a {@link SegmentationClassSelectionState} is built
 * from: the core selection fields plus this type's quality levels.
 */
export interface SegmentationClassSelectionStateValues extends ObjectClassSelectionStateValues {
  distinctive_lv: QualityLevel;
  occlusion_lv: QualityLevel;
}

/**
 * The core object-class selection adapter extended with this data type's
 * distinctive and occlusion levels, which arrive as nullable scalar ids and are
 * resolved to {@link QualityLevel} objects when the schema parses them.
 *
 * The extra levels are assigned in a constructor of its own rather than left to
 * the inherited one: an uninitialized field declaration is compiled to a
 * definition that runs after `super()` and would erase whatever the base
 * constructor stored. The base `create` is generic, so it builds and freezes
 * this subclass without a `create` of its own.
 */
export class SegmentationClassSelectionState extends ObjectClassSelectionState {
  static PLAIN_SCHEMA = ObjectClassSelectionState.PLAIN_SCHEMA.extend({
    distinctive_lv: z.number().nullable().optional(),
    occlusion_lv: z.number().nullable().optional(),
  });

  static SCHEMA = this.PLAIN_SCHEMA.transform((data) =>
    this.create({
      ...data,
      distinctive_lv: getDistinctiveLvByValue(data.distinctive_lv),
      occlusion_lv: getOcclusionLvByValue(data.occlusion_lv),
    }),
  );

  readonly distinctive_lv: QualityLevel;
  readonly occlusion_lv: QualityLevel;

  constructor(values: SegmentationClassSelectionStateValues) {
    super(values);
    this.distinctive_lv = values.distinctive_lv;
    this.occlusion_lv = values.occlusion_lv;
  }
}

/**
 * The fully resolved values a {@link LabelInstanceState} is built from.
 */
export interface LabelInstanceStateValues {
  id: string;
  is_black?: boolean | null;
  gt_class_id?: number | null;
}

/**
 * Adapter for the reduced `LabelInstanceBulkPublic` model returned by the
 * editor's bulk label endpoint. That endpoint carries the persisted class
 * assignment as a scalar foreign-key id (not the `ObjectClassPublic`
 * relationship object), so this schema must stay strict about it: a field that
 * silently falls back to `null` here reloads a classified frame as unclassified.
 */
export class LabelInstanceState {
  static PLAIN_SCHEMA = z.object({
    id: z.string(),
    is_black: z.boolean().nullable().optional(),
    gt_class_id: z.number().int().nullable().optional(),
  });

  static SCHEMA = this.PLAIN_SCHEMA.transform((data) => this.create(data));

  readonly id: string;
  readonly is_black: boolean | null | undefined;
  readonly gt_class_id: number | null | undefined;

  constructor(values: LabelInstanceStateValues) {
    this.id = values.id;
    this.is_black = values.is_black;
    this.gt_class_id = values.gt_class_id;
  }

  /**
   * Creates an immutable instance from fully resolved values.
   */
  static create(values: LabelInstanceStateValues): LabelInstanceState {
    return Object.freeze(new LabelInstanceState(values));
  }
}

/**
 * The fully resolved values a {@link LabelSelectionState} is built from.
 */
export interface LabelSelectionStateValues {
  id: string;
  entity_id?: string | null;
  timestamp: Timestamp | null;
  points: readonly DecimalVector3Data[] | Float32Array;
  quality_rank?: number | null;
  distinctive_lv: QualityLevel;
  occlusion_lv: QualityLevel;
  perceived_class_id?: number | null;
}

/**
 * Adapter for the reduced `LabelSelectionBulkPublic` model returned by the
 * editor's bulk label endpoint.
 */
export class LabelSelectionState {
  static PLAIN_SCHEMA = z.object({
    id: z.string(),
    entity_id: z.string().nullable().optional(),
    timestamp: z
      .string()
      .nullable()
      .optional()
      .transform((value) => (value == null ? null : new Timestamp(value))),
    points: z.union([
      z.array(DecimalVector3Data.SCHEMA),
      z.instanceof(Float32Array),
    ]),
    quality_rank: z.number().nullable().optional(),
    distinctive_lv: z
      .number()
      .nullable()
      .optional()
      .transform(getDistinctiveLvByValue),
    occlusion_lv: z
      .number()
      .nullable()
      .optional()
      .transform(getOcclusionLvByValue),
    perceived_class_id: z.number().int().nullable().optional(),
  });

  static SCHEMA = this.PLAIN_SCHEMA.transform((data) => this.create(data));

  readonly id: string;
  readonly entity_id: string | null | undefined;
  readonly timestamp: Timestamp | null;
  readonly points: readonly DecimalVector3Data[] | Float32Array;
  readonly quality_rank: number | null | undefined;
  readonly distinctive_lv: QualityLevel;
  readonly occlusion_lv: QualityLevel;
  readonly perceived_class_id: number | null | undefined;

  constructor(values: LabelSelectionStateValues) {
    this.id = values.id;
    this.entity_id = values.entity_id;
    this.timestamp = values.timestamp;
    this.points = values.points;
    this.quality_rank = values.quality_rank;
    this.distinctive_lv = values.distinctive_lv;
    this.occlusion_lv = values.occlusion_lv;
    this.perceived_class_id = values.perceived_class_id;
  }

  /**
   * Creates an immutable instance from fully resolved values.
   */
  static create(values: LabelSelectionStateValues): LabelSelectionState {
    return Object.freeze(new LabelSelectionState(values));
  }
}
