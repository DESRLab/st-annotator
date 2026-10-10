import { z } from "zod";

import { ObjectClassSelectionState } from "sta/app/editor";
import { DecimalVector3Data, Timestamp } from "sta/common";

/**
 * GeoJSON geometry type used by vector labels.
 */
export const VectorType = {
  POINT: "Point",
  POLYGON: "Polygon",
  POLYLINE: "LineString",
} as const;

export type VectorType = (typeof VectorType)[keyof typeof VectorType];

/**
 * An object-class selection carrying the vector type's own level options.
 *
 * No fields are added, so the inherited constructor is reused as-is; the
 * overridden {@link SCHEMA} is what makes the base class's generic `create`
 * construct this class instead of `ObjectClassSelectionState`.
 */
export class VectorClassSelectionState extends ObjectClassSelectionState {
  static SCHEMA = this.PLAIN_SCHEMA.transform((data) => this.create(data));
}

/**
 * The fully resolved values a {@link LabelVectorState} is built from.
 */
export interface LabelVectorStateValues {
  id: string;
  timestamp: Timestamp | null;
  vertices: readonly DecimalVector3Data[];
  gt_class_id?: number | null;
  type: VectorType;
}

/**
 * Adapter for the reduced `LabelVectorBulkPublic` model returned by the
 * editor's bulk label endpoint. That endpoint carries the persisted class
 * assignment as a scalar foreign-key id (not the `ObjectClassPublic`
 * relationship object), so this schema must stay strict about it: a field that
 * silently falls back to `null` here reloads a classified frame as unclassified.
 */
export class LabelVectorState {
  static PLAIN_SCHEMA = z.object({
    id: z.string(),
    timestamp: z
      .string()
      .nullable()
      .optional()
      .transform((value) => (value == null ? null : new Timestamp(value))),
    vertices: z.array(DecimalVector3Data.SCHEMA),
    gt_class_id: z.number().int().nullable().optional(),
    type: z.nativeEnum(VectorType),
  });

  static SCHEMA = this.PLAIN_SCHEMA.transform((data) => this.create(data));

  readonly id: string;
  readonly timestamp: Timestamp | null;
  readonly vertices: readonly DecimalVector3Data[];
  readonly gt_class_id: number | null;
  readonly type: VectorType;

  constructor(values: LabelVectorStateValues) {
    this.id = values.id;
    this.timestamp = values.timestamp;
    this.vertices = values.vertices;
    // The schema keeps the scalar id optional to tolerate an omitted key; an
    // omitted assignment is the same unclassified label the backend encodes as
    // an explicit null.
    this.gt_class_id = values.gt_class_id ?? null;
    this.type = values.type;
  }

  /**
   * Creates an immutable instance from fully resolved values.
   */
  static create(values: LabelVectorStateValues): LabelVectorState {
    return Object.freeze(new LabelVectorState(values));
  }
}
