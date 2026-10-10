import { z } from "zod";

import { Timestamp } from "../utils";

import { DecimalVector3Data, OptionalDecimalVector3Data } from "./vectors";

/**
 * Represents an interval along a coordinate axis.
 */
export class CoordBounds {
  static create(values: {
    min: number | null;
    max: number | null;
  }): CoordBounds {
    return new CoordBounds(values.min, values.max);
  }

  /**
   * The minimum coordinate, or `null` if unbounded.
   */
  readonly min: number | null;

  /**
   * The maximum coordinate, or `null` if unbounded.
   */
  readonly max: number | null;

  private constructor(min: number | null, max: number | null) {
    this.min = min;
    this.max = max;
    Object.freeze(this);
  }

  /**
   * The center coordinate, or `null` if either boundary is missing.
   */
  get center(): number | null {
    const { min, max } = this;
    if (min == null || max == null) return null;

    return (min + max) / 2;
  }

  /**
   * Tests if a point falls within this interval (inclusive).
   *
   * @returns `true` if the given point falls within this interval;
   * otherwise, `false`.
   */
  contains(point: number): boolean {
    return (
      (this.min == null || this.min <= point) &&
      (this.max == null || this.max >= point)
    );
  }
}

/**
 * Represents a set of boundaries in 3D space.
 */
export class SpatialBounds {
  static create(values: {
    xBounds: CoordBounds;
    yBounds: CoordBounds;
    zBounds: CoordBounds;
  }): SpatialBounds {
    return new SpatialBounds(values.xBounds, values.yBounds, values.zBounds);
  }

  readonly xBounds: CoordBounds;

  readonly yBounds: CoordBounds;

  readonly zBounds: CoordBounds;

  private constructor(
    xBounds: CoordBounds,
    yBounds: CoordBounds,
    zBounds: CoordBounds,
  ) {
    this.xBounds = xBounds;
    this.yBounds = yBounds;
    this.zBounds = zBounds;
    Object.freeze(this);
  }

  /**
   * Tests if a point falls within this set of boundaries (inclusive).
   *
   * @returns `true` if the given point falls within this set of boundaries;
   * otherwise, `false`.
   */
  contains(point: THREE.Vector3): boolean {
    return (
      this.xBounds.contains(point.x) &&
      this.yBounds.contains(point.y) &&
      this.zBounds.contains(point.z)
    );
  }
}

/**
 * For more details, refer to the corresponding Pydantic model on the backend.
 */
export class PartialSTBounds {
  static create(values: {
    min_coords: OptionalDecimalVector3Data;
    max_coords: OptionalDecimalVector3Data;
    min_timestamp: Timestamp | null;
    max_timestamp: Timestamp | null;
  }): PartialSTBounds {
    return new PartialSTBounds(values);
  }

  static readonly PLAIN_SCHEMA = z.object({
    min_coords: OptionalDecimalVector3Data.SCHEMA,
    max_coords: OptionalDecimalVector3Data.SCHEMA,
    min_timestamp: Timestamp.SCHEMA.nullable(),
    max_timestamp: Timestamp.SCHEMA.nullable(),
  });

  static readonly SCHEMA = this.PLAIN_SCHEMA.transform((data) =>
    this.create(data),
  );

  readonly min_coords: OptionalDecimalVector3Data;

  readonly max_coords: OptionalDecimalVector3Data;

  readonly min_timestamp: Timestamp | null;

  readonly max_timestamp: Timestamp | null;

  constructor(values: {
    min_coords: OptionalDecimalVector3Data;
    max_coords: OptionalDecimalVector3Data;
    min_timestamp: Timestamp | null;
    max_timestamp: Timestamp | null;
  }) {
    this.min_coords = values.min_coords;
    this.max_coords = values.max_coords;
    this.min_timestamp = values.min_timestamp;
    this.max_timestamp = values.max_timestamp;
    Object.freeze(this);
  }

  /** Compares all spatial and temporal bounds by value. */
  equals(other: PartialSTBounds): boolean {
    return (
      this.min_coords.equals(other.min_coords) &&
      this.max_coords.equals(other.max_coords) &&
      this.min_timestamp?.getTime() === other.min_timestamp?.getTime() &&
      this.max_timestamp?.getTime() === other.max_timestamp?.getTime()
    );
  }

  /**
   * Deserializes an instance of this class from data parsed from a JSON string.
   *
   * @returns The resulting new instance.
   */
  static fromJSON(obj: unknown): PartialSTBounds {
    return this.SCHEMA.parse(obj);
  }

  /**
   * Creates a new instance with no boundaries.
   *
   * @returns The resulting instance.
   */
  static empty(): PartialSTBounds {
    return PartialSTBounds.create({
      min_coords: OptionalDecimalVector3Data.empty(),
      max_coords: OptionalDecimalVector3Data.empty(),
      min_timestamp: null,
      max_timestamp: null,
    });
  }

  /**
   * Obtains the spatial component of this set of boundaries.
   *
   * @returns The spatial boundaries.
   */
  getSpatialBounds(): SpatialBounds {
    const minCoords = this.min_coords.toOptionalVector3();
    const maxCoords = this.max_coords.toOptionalVector3();

    return SpatialBounds.create({
      xBounds: CoordBounds.create({ min: minCoords.x, max: maxCoords.x }),
      yBounds: CoordBounds.create({ min: minCoords.y, max: maxCoords.y }),
      zBounds: CoordBounds.create({ min: minCoords.z, max: maxCoords.z }),
    });
  }

  /**
   * Obtains the time component of this set of boundaries.
   *
   * @returns The timestamp boundaries.
   */
  getTimestampBounds(): CoordBounds {
    return CoordBounds.create({
      min: this.min_timestamp?.getTime() ?? null,
      max: this.max_timestamp?.getTime() ?? null,
    });
  }
}

/**
 * For more details, refer to the corresponding Pydantic model on the backend.
 */
export class STBounds {
  static create(values: {
    min_coords: DecimalVector3Data;
    max_coords: DecimalVector3Data;
    min_timestamp: Timestamp;
    max_timestamp: Timestamp;
  }): STBounds {
    return new STBounds(values);
  }

  static readonly PLAIN_SCHEMA = z.object({
    min_coords: DecimalVector3Data.SCHEMA,
    max_coords: DecimalVector3Data.SCHEMA,
    min_timestamp: Timestamp.SCHEMA,
    max_timestamp: Timestamp.SCHEMA,
  });

  static readonly SCHEMA = this.PLAIN_SCHEMA.transform((data) =>
    this.create(data),
  );

  readonly min_coords: DecimalVector3Data;

  readonly max_coords: DecimalVector3Data;

  readonly min_timestamp: Timestamp;

  readonly max_timestamp: Timestamp;

  constructor(values: {
    min_coords: DecimalVector3Data;
    max_coords: DecimalVector3Data;
    min_timestamp: Timestamp;
    max_timestamp: Timestamp;
  }) {
    this.min_coords = values.min_coords;
    this.max_coords = values.max_coords;
    this.min_timestamp = values.min_timestamp;
    this.max_timestamp = values.max_timestamp;
    Object.freeze(this);
  }

  /** Compares all spatial and temporal bounds by value. */
  equals(other: STBounds): boolean {
    return (
      this.min_coords.equals(other.min_coords) &&
      this.max_coords.equals(other.max_coords) &&
      this.min_timestamp.getTime() === other.min_timestamp.getTime() &&
      this.max_timestamp.getTime() === other.max_timestamp.getTime()
    );
  }

  /**
   * Deserializes an instance of this class from data parsed from a JSON string.
   *
   * @returns The resulting new instance.
   */
  static fromJSON(obj: unknown): STBounds {
    return this.SCHEMA.parse(obj);
  }
}
