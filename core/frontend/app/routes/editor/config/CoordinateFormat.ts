import type * as THREE from "three";

import type { OptionalVector3 } from "sta/common";

/**
 * Specifies a mapping between the coordinate system of the database and that of `three.js`,
 * where the name of the mapping is formed by iterating over the axes in `three.js` and
 * returning the corresponding axes in the database.
 *
 * For example, if `(1, 2, 3)` in `three.js` corresponds to `(3, 1, 2)` in the database,
 * the coordinate format is taken to be `ZXY`.
 *
 * This is a value-based class.
 */
export interface CoordinateFormatSpec {
  /**
   * Returns a string representation of an object.
   */
  toString(): string;

  /**
   * Converts a set of coordinates from `three.js` format into database format.
   */
  toDatabaseCoords<T extends Readonly<OptionalVector3> | THREE.Vector3>(
    threeCoords: T,
  ): T;

  /**
   * Converts a set of coordinates from database format into `three.js` format.
   */
  toThreeJSCoords<T extends Readonly<OptionalVector3> | THREE.Vector3>(
    dbCoords: T,
  ): T;
}

/**
 * Concrete implementation of {@link CoordinateFormatSpec}.
 */
export class CoordinateFormatSpecImpl implements CoordinateFormatSpec {
  /**
   * The name of this mapping.
   */
  readonly #name: string;

  /**
   * The index of the coordinate in database format that represents
   * the `x` coordinate in `three.js` format.
   */
  readonly #xIdx: number;

  /**
   * The index of the coordinate in database format that represents
   * the `y` coordinate in `three.js` format.
   */
  readonly #yIdx: number;

  /**
   * The index of the coordinate in database format that represents
   * the `z` coordinate in `three.js` format.
   */
  readonly #zIdx: number;

  /**
   * Creates a new mapping between the coordinate system of a database and that of `three.js`.
   *
   * @param name The name of the mapping.
   * @param xIdx The index of the coordinates in database format that represents
   * the `x` coordinate in `three.js` format.
   * @param yIdx The index of the coordinates in database format that represents
   * the `y` coordinate in `three.js` format.
   * @param zIdx The index of the coordinates in database format that represents
   * the `z` coordinate in `three.js` format.
   */
  constructor(name: string, xIdx: number, yIdx: number, zIdx: number) {
    this.#name = name;
    this.#xIdx = xIdx;
    this.#yIdx = yIdx;
    this.#zIdx = zIdx;

    Object.freeze(this);
  }

  /**
   * Returns a string representation of an object.
   */
  toString(): string {
    return `CoordinateFormat.${this.#name}`;
  }

  /**
   * Converts a set of coordinates from `three.js` format into database format.
   */
  toDatabaseCoords<T extends Readonly<OptionalVector3> | THREE.Vector3>(
    threeCoords: T,
  ): T {
    return threeCoords
      .clone()
      .setComponent(this.#xIdx, threeCoords.x ?? 0)
      .setComponent(this.#yIdx, threeCoords.y ?? 0)
      .setComponent(this.#zIdx, threeCoords.z ?? 0) as T;
  }

  /**
   * Converts a set of coordinates from database format into `three.js` format.
   */
  toThreeJSCoords<T extends Readonly<OptionalVector3> | THREE.Vector3>(
    dbCoords: T,
  ): T {
    const x = dbCoords.getComponent(this.#xIdx) ?? 0;
    const y = dbCoords.getComponent(this.#yIdx) ?? 0;
    const z = dbCoords.getComponent(this.#zIdx) ?? 0;

    return dbCoords.clone().set(x, y, z) as T;
  }
}

/**
 * Represents a mapping between the coordinate system of a database and that of `three.js`,
 * where the name of the mapping is formed by iterating over the axes in `three.js` and
 * returning the corresponding axes in the database.
 *
 * For example, if `(1, 2, 3)` in `three.js` corresponds to `(3, 1, 2)` in the database,
 * the coordinate format is taken to be `ZXY`.
 */
export const CoordinateFormat = Object.freeze({
  XYZ: new CoordinateFormatSpecImpl("XYZ", 0, 1, 2),
  XZY: new CoordinateFormatSpecImpl("XZY", 0, 2, 1),
  YXZ: new CoordinateFormatSpecImpl("YXZ", 1, 0, 2),
  YZX: new CoordinateFormatSpecImpl("YZX", 2, 0, 1),
  ZXY: new CoordinateFormatSpecImpl("ZXY", 1, 2, 0),
  ZYX: new CoordinateFormatSpecImpl("ZYX", 2, 1, 0),
} as const satisfies Record<string, CoordinateFormatSpec>);
