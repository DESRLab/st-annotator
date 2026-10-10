import { z } from "zod";

import { DecimalVector3Data } from "./vectors";

/**
 * For more details, refer to the corresponding Pydantic model on the backend.
 */
export class Transform {
  static create(values: {
    translation: DecimalVector3Data;
    rotation: DecimalVector3Data;
    scale: DecimalVector3Data;
  }): Transform {
    return new Transform(values);
  }

  static readonly PLAIN_SCHEMA = z.object({
    translation: DecimalVector3Data.SCHEMA,
    rotation: DecimalVector3Data.SCHEMA,
    scale: DecimalVector3Data.SCHEMA,
  });

  static readonly SCHEMA = this.PLAIN_SCHEMA.transform((data) =>
    this.create(data),
  );

  readonly translation: DecimalVector3Data;

  /**
   * Note that this represents extrisic rotation in X-Y-Z order,
   * whereas `three.js` uses intrinsic rotations.
   */
  readonly rotation: DecimalVector3Data;

  readonly scale: DecimalVector3Data;

  constructor(values: {
    translation: DecimalVector3Data;
    rotation: DecimalVector3Data;
    scale: DecimalVector3Data;
  }) {
    this.translation = values.translation;
    this.rotation = values.rotation;
    this.scale = values.scale;
    Object.freeze(this);
  }

  /** Compares translation, rotation, and scale by value. */
  equals(other: Transform): boolean {
    return (
      this.translation.equals(other.translation) &&
      this.rotation.equals(other.rotation) &&
      this.scale.equals(other.scale)
    );
  }

  /**
   * Deserializes an instance of this class from data parsed from a JSON string.
   *
   * @returns The resulting new instance.
   */
  static fromJSON(obj: unknown): Transform {
    return this.SCHEMA.parse(obj);
  }
}
