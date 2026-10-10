import { z } from "zod";

import {
  ObjectClassSelectionState,
  ObjectClassState,
  type ObjectClassSelectionStateValues,
  type ObjectClassStateValues,
} from "sta/app/editor";
import {
  DecimalVector3Data,
  OptionalDecimalVector3Data,
  Timestamp,
} from "sta/common";

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

export const DistinctiveLevel = {
  Excellent: makeLevel("Excellent", 0),
  Satisfactory: makeLevel("Satisfactory", 1),
  Poor: makeLevel("Poor", 2),
  Unknown: makeLevel("Unknown", null),
} as const;
export type DistinctiveLevel =
  (typeof DistinctiveLevel)[keyof typeof DistinctiveLevel];

export const OcclusionLevel = {
  Excellent: makeLevel("Excellent", 0),
  Satisfactory: makeLevel("Satisfactory", 1),
  Poor: makeLevel("Poor", 2),
  Unknown: makeLevel("Unknown", null),
} as const;
export type OcclusionLevel =
  (typeof OcclusionLevel)[keyof typeof OcclusionLevel];

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
 * Bounding-box geometry type.
 */
export const BoxType = Object.freeze({
  cuboid: "cuboid",
  cylinder: "cylinder",
} as const);
export type BoxType = (typeof BoxType)[keyof typeof BoxType];

function normalizeBBoxClass(obj: unknown): unknown {
  if (obj == null || typeof obj !== "object" || Array.isArray(obj)) {
    return obj;
  }

  const data = { ...obj } as Record<string, unknown>;
  data.default_size ??= {
    x: data.default_size_x ?? null,
    y: data.default_size_y ?? null,
    z: data.default_size_z ?? null,
  };
  return data;
}

/**
 * The fully resolved values a {@link BBoxClassState} is built from.
 */
export interface BBoxClassStateValues extends ObjectClassStateValues {
  default_size: OptionalDecimalVector3Data;
}

// @ts-expect-error - static SCHEMA override has different Zod type than base class
export class BBoxClassState extends ObjectClassState {
  static SCHEMA = z.preprocess(
    normalizeBBoxClass,
    ObjectClassState.PLAIN_SCHEMA.extend({
      default_size: OptionalDecimalVector3Data.SCHEMA,
    }).transform((data) => BBoxClassState.create(data)),
  );

  readonly default_size: OptionalDecimalVector3Data;

  constructor(values: BBoxClassStateValues) {
    super(values);
    this.default_size = values.default_size;
  }
}

/**
 * The fully resolved values a {@link BBoxClassSelectionState} is built from.
 */
export interface BBoxClassSelectionStateValues extends ObjectClassSelectionStateValues {
  objclasses: readonly BBoxClassState[];
  distinctive_lv: QualityLevel;
  occlusion_lv: QualityLevel;
}

// @ts-expect-error - static PLAIN_SCHEMA/SCHEMA overrides have different Zod types than the base class
export class BBoxClassSelectionState extends ObjectClassSelectionState {
  static PLAIN_SCHEMA = ObjectClassSelectionState.buildPlainSchema(
    BBoxClassState.SCHEMA,
  ).extend({
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

  /** Narrows the inherited object classes to the bbox-specific class. */
  declare readonly objclasses: readonly BBoxClassState[];
  readonly distinctive_lv: QualityLevel;
  readonly occlusion_lv: QualityLevel;

  constructor(values: BBoxClassSelectionStateValues) {
    super(values);
    this.distinctive_lv = values.distinctive_lv;
    this.occlusion_lv = values.occlusion_lv;
  }
}

/**
 * The fully resolved values a {@link LabelTrackState} is built from.
 */
export interface LabelTrackStateValues {
  id: string;
  is_black?: boolean | null;
  gt_class_id?: number | null;
}

/**
 * Adapter for the reduced `LabelTrackBulkPublic` model returned by the editor's
 * bulk label endpoint. That endpoint carries the persisted class assignment as
 * a scalar foreign-key id (not the `ObjectClassPublic` relationship object), so
 * this schema must stay strict about it: a field that silently falls back to
 * `null` here reloads a classified frame as unclassified.
 */
export class LabelTrackState {
  static PLAIN_SCHEMA = z.object({
    id: z.string(),
    is_black: z.boolean().nullable().optional(),
    gt_class_id: z.number().int().nullable().optional(),
  });

  static SCHEMA = this.PLAIN_SCHEMA.transform((data) => this.create(data));

  readonly id: string;
  readonly is_black: boolean | null | undefined;
  readonly gt_class_id: number | null | undefined;

  constructor(values: LabelTrackStateValues) {
    this.id = values.id;
    this.is_black = values.is_black;
    this.gt_class_id = values.gt_class_id;
  }

  /**
   * Creates an immutable instance from fully resolved values.
   */
  static create(values: LabelTrackStateValues): LabelTrackState {
    return Object.freeze(new LabelTrackState(values));
  }
}

/**
 * The fully resolved values a {@link LabelBoxState} is built from.
 */
export interface LabelBoxStateValues {
  id: string;
  entity_id?: string | null;
  timestamp: Timestamp | null;
  type: BoxType;
  center: DecimalVector3Data;
  angle: number | string;
  size: DecimalVector3Data;
  quality_rank?: number | null;
  distinctive_lv: QualityLevel;
  occlusion_lv: QualityLevel;
  perceived_class_id?: number | null;
}

export class LabelBoxState {
  static PLAIN_SCHEMA = z.object({
    id: z.string(),
    entity_id: z.string().nullable().optional(),
    timestamp: z
      .string()
      .nullable()
      .optional()
      .transform((value) => (value == null ? null : new Timestamp(value))),
    type: z.nativeEnum(BoxType),
    center: DecimalVector3Data.SCHEMA,
    angle: z.number().or(z.string()),
    size: DecimalVector3Data.SCHEMA,
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
  readonly type: BoxType;
  readonly center: DecimalVector3Data;
  readonly angle: number | string;
  readonly size: DecimalVector3Data;
  readonly quality_rank: number | null | undefined;
  readonly distinctive_lv: QualityLevel;
  readonly occlusion_lv: QualityLevel;
  readonly perceived_class_id: number | null | undefined;

  constructor(values: LabelBoxStateValues) {
    this.id = values.id;
    this.entity_id = values.entity_id;
    this.timestamp = values.timestamp;
    this.type = values.type;
    this.center = values.center;
    this.angle = values.angle;
    this.size = values.size;
    this.quality_rank = values.quality_rank;
    this.distinctive_lv = values.distinctive_lv;
    this.occlusion_lv = values.occlusion_lv;
    this.perceived_class_id = values.perceived_class_id;
  }

  /**
   * Creates an immutable instance from fully resolved values.
   */
  static create(values: LabelBoxStateValues): LabelBoxState {
    return Object.freeze(new LabelBoxState(values));
  }
}
