import * as THREE from "three";
import { z as zod } from "zod";

export type OptionalVector3Tuple = [
  number | null,
  number | null,
  number | null,
];

/**
 * A plain mutable record of a 3D vector's components.
 *
 * This is the state-boundary representation of a vector: it crosses into
 * React components and pane data (whose inputs edit the components in
 * place), and is converted to a three.js vector only at the imperative
 * application points.
 */
export interface Vector3XYZ {
  /**
   * The `x` value of the vector.
   */
  x: number;

  /**
   * The `y` value of the vector.
   */
  y: number;

  /**
   * The `z` value of the vector.
   */
  z: number;
}

/**
 * Represents a vector with its components optionally specified.
 */
export class OptionalVector3 {
  /**
   * The `x` value of the vector.
   */
  x: number | null;

  /**
   * The `y` value of the vector.
   */
  y: number | null;

  /**
   * The `z` value of the vector.
   */
  z: number | null;

  /**
   * Creates a new partial vector.
   */
  constructor(
    x: number | null = null,
    y: number | null = null,
    z: number | null = null,
  ) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  /**
   * Returns `true` if the components of this vector and `v` are strictly equal;
   * `false` otherwise.
   */
  equals(v: Readonly<OptionalVector3 | THREE.Vector3>): boolean {
    return this.x === v.x && this.y === v.y && this.z === v.z;
  }

  /**
   * Gets the `index`-th component of this vector.
   *
   * - If `index` equals `0` returns the `x` value.
   * - If `index` equals `1` returns the `y` value.
   * - If `index` equals `2` returns the `z` value.
   *
   * @returns The value of the component.
   */
  getComponent(index: number): number | null {
    if (index === 0) return this.x;
    if (index === 1) return this.y;
    if (index === 2) return this.z;

    throw new Error(`Invalid index: ${index}`);
  }

  /**
   * Sets the `index`-th component of this vector.
   *
   * - If `index` equals `0` sets the `x` value.
   * - If `index` equals `1` sets the `y` value.
   * - If `index` equals `2` sets the `z` value.
   *
   * @returns This object.
   */
  setComponent(index: number, value: number | null): this {
    if (index === 0) return this.setX(value);
    if (index === 1) return this.setY(value);
    if (index === 2) return this.setZ(value);

    throw new Error(`Invalid index: ${index}`);
  }

  /**
   * Replace this vector's `x` value with `x`.
   *
   * @returns This object.
   */
  setX(x: number | null): this {
    this.x = x;
    return this;
  }

  /**
   * Replace this vector's `y` value with `y`.
   *
   * @returns This object.
   */
  setY(y: number | null): this {
    this.y = y;
    return this;
  }

  /**
   * Replace this vector's `z` value with `z`.
   *
   * @returns This object.
   */
  setZ(z: number | null): this {
    this.z = z;
    return this;
  }

  /**
   * Sets the `x`, `y` and `z` components of this vector.
   *
   * @returns This object.
   */
  set(x: number | null, y: number | null, z: number | null): this {
    return this.setX(x).setY(y).setZ(z);
  }

  /**
   * Adds `v` to this vector.
   *
   * @returns This vector, modified in place. If a component is `null` in either
   * vector, that component is set to `null` in the result.
   */
  add(v: Readonly<OptionalVector3 | THREE.Vector3>): this {
    return this.zip(v, (a, b) => a + b);
  }

  /**
   * Adds the scalar value `s` to this vector's `x`, `y` and `z` values.
   *
   * @returns This vector, modified in place. If a component is `null` in this
   * vector, that component is set to `null` in the result.
   */
  addScalar(s: number): this {
    return this.map((c) => c + s);
  }

  /**
   * Subtracts `v` to this vector.
   *
   * @returns This vector, modified in place. If a component is `null` in either
   * vector, that component is set to `null` in the result.
   */
  sub(v: Readonly<OptionalVector3 | THREE.Vector3>): this {
    return this.zip(v, (a, b) => a - b);
  }

  /**
   * Subtracts the scalar value `s` to this vector's `x`, `y` and `z` values.
   *
   * @returns This vector, modified in place. If a component is `null` in this
   * vector, that component is set to `null` in the result.
   */
  subScalar(s: number): this {
    return this.map((c) => c - s);
  }

  /**
   * Multiplies `v` to this vector.
   *
   * @returns This vector, modified in place. If a component is `null` in either
   * vector, that component is set to `null` in the result.
   */
  multiply(v: Readonly<OptionalVector3 | THREE.Vector3>): this {
    return this.zip(v, (a, b) => a * b);
  }

  /**
   * Multiplies the scalar value `s` to this vector's `x`, `y` and `z` values.
   *
   * @returns This vector, modified in place. If a component is `null` in this
   * vector, that component is set to `null` in the result.
   */
  multiplyScalar(s: number): this {
    return this.map((c) => c * s);
  }

  /**
   * Divides `v` to this vector.
   *
   * @returns This vector, modified in place. If a component is `null` in either
   * vector, that component is set to `null` in the result.
   */
  divide(v: Readonly<OptionalVector3 | THREE.Vector3>): this {
    return this.zip(v, (a, b) => a / b);
  }

  /**
   * Divides the scalar value `s` to this vector's `x`, `y` and `z` values.
   *
   * @returns This vector, modified in place. If a component is `null` in this
   * vector, that component is set to `null` in the result.
   */
  divideScalar(s: number): this {
    return this.map((c) => c / s);
  }

  /**
   * Returns an array `[x, y, z]`, or copies `x`, `y` and `z` into the provided array.
   *
   * @returns The new or modified array.
   */
  toArray<T extends OptionalVector3Tuple = OptionalVector3Tuple>(
    array: T = [] as unknown as T,
    offset = 0,
  ): T {
    array[offset] = this.x;
    array[offset + 1] = this.y;
    array[offset + 2] = this.z;

    return array;
  }

  /**
   * Applies a function to each element of this vector, modifying it in-place.
   *
   * @param fn The function to apply.
   * @returns This object.
   */
  map(fn: (value: number) => number): this {
    const maybeNullFn = (c: number | null): number | null =>
      c == null ? null : fn(c);

    return this.set(
      maybeNullFn(this.x),
      maybeNullFn(this.y),
      maybeNullFn(this.z),
    );
  }

  /**
   * Applies a function to each element of a pair of vectors, modifying this vector in-place.
   *
   * @param v2 The second vector in the pair.
   * (The first vector is this object)
   * @param fn The function to apply.
   * @returns This object.
   */
  zip(
    v2: Readonly<OptionalVector3 | THREE.Vector3>,
    fn: (value1: number, value2: number) => number,
  ): this {
    const maybeNullFn = (a: number | null, b: number | null): number | null =>
      a == null || b == null ? null : fn(a, b);

    return this.set(
      maybeNullFn(this.x, v2.x),
      maybeNullFn(this.y, v2.y),
      maybeNullFn(this.z, v2.z),
    );
  }

  /**
   * Applies a function to each element of a pair of vectors, resulting in a new vector.
   *
   * @param v1 The first vector in the pair.
   * @param v2 The second vector in the pair.
   * @param fn The function to apply.
   * @returns The new vector.
   */
  static zip(
    v1: Readonly<OptionalVector3 | THREE.Vector3>,
    v2: Readonly<OptionalVector3 | THREE.Vector3>,
    fn: (value1: number | null, value2: number | null) => number | null,
  ): OptionalVector3 {
    return new OptionalVector3(fn(v1.x, v2.x), fn(v1.y, v2.y), fn(v1.z, v2.z));
  }

  /**
   * Returns a new vector with each missing component replaced by the corresponding
   * component of a reference vector.
   *
   * @param v The reference vector providing the fill value for
   * each component.
   * @returns The resulting vector which is fully specified.
   */
  fill(v: THREE.Vector3): THREE.Vector3 {
    return new THREE.Vector3(this.x ?? v.x, this.y ?? v.y, this.z ?? v.z);
  }

  /**
   * Returns a new vector with each missing component replaced by a scalar value.
   *
   * @param s The value to fill each missing component with.
   * @returns The resulting vector which is fully specified.
   */
  fillScalar(s: number): THREE.Vector3 {
    return new THREE.Vector3(this.x ?? s, this.y ?? s, this.z ?? s);
  }

  /**
   * Returns a new vector with the same `x`, `y` and `z` values as this one.
   *
   * @returns The new vector.
   */
  clone(): OptionalVector3 {
    return new OptionalVector3(this.x, this.y, this.z);
  }

  /**
   * Copies the values of the passed vector's `x`, `y` and `z` properties to this vector.
   *
   * @param v The vector to copy from.
   * @returns The new vector.
   */
  copy(v: Readonly<OptionalVector3 | THREE.Vector3>): this {
    return this.set(v.x, v.y, v.z);
  }
}

class BaseVector3Data<T> {
  readonly x: T;

  readonly y: T;

  readonly z: T;

  constructor(x: T, y: T, z: T) {
    this.x = x;
    this.y = y;
    this.z = z;
    Object.freeze(this);
  }

  /** Compares vector components by value. */
  equals(other: BaseVector3Data<T>): boolean {
    return this.x === other.x && this.y === other.y && this.z === other.z;
  }
}

export class OptionalDecimalVector3Data extends BaseVector3Data<string | null> {
  static create(values: {
    x: string | null;
    y: string | null;
    z: string | null;
  }) {
    return new this(values.x, values.y, values.z);
  }

  static readonly PLAIN_SCHEMA = zod.object({
    x: zod.number().pipe(zod.coerce.string()).or(zod.string()).nullable(),
    y: zod.number().pipe(zod.coerce.string()).or(zod.string()).nullable(),
    z: zod.number().pipe(zod.coerce.string()).or(zod.string()).nullable(),
  });

  static readonly SCHEMA = this.PLAIN_SCHEMA.transform((data) =>
    this.create(data),
  );

  /**
   * Deserializes an instance of this class from data parsed from a JSON string.
   *
   * @returns The resulting new instance.
   */
  static fromJSON(obj: unknown): OptionalDecimalVector3Data {
    return this.SCHEMA.parse(obj);
  }

  /**
   * Converts a domain object into a data object that can be JSON serialized.
   *
   * @param vector The domain object to convert.
   * @returns The resulting data object.
   */
  static fromOptionalVector3(
    vector: OptionalVector3,
  ): OptionalDecimalVector3Data {
    return OptionalDecimalVector3Data.create({
      x: vector.x?.toString() ?? null,
      y: vector.y?.toString() ?? null,
      z: vector.z?.toString() ?? null,
    });
  }

  /**
   * Creates a new instance with all components set to `null`.
   *
   * @returns The resulting instance.
   */
  static empty(): OptionalDecimalVector3Data {
    return OptionalDecimalVector3Data.create({ x: null, y: null, z: null });
  }

  /**
   * Converts this data object into a domain object with more functionality.
   *
   * @returns The resulting domain object.
   */
  toOptionalVector3(): OptionalVector3 {
    return this.toFloatData().toOptionalVector3();
  }

  /**
   * Converts this data object into its float equivalent.
   *
   * @returns The resulting float vector.
   */
  toFloatData(): OptionalVector3Data {
    return OptionalVector3Data.create({
      x: this.x == null ? null : Number(this.x),
      y: this.y == null ? null : Number(this.y),
      z: this.z == null ? null : Number(this.z),
    });
  }
}

export class DecimalVector3Data extends BaseVector3Data<string> {
  static create(values: { x: string; y: string; z: string }) {
    return new this(values.x, values.y, values.z);
  }

  static readonly PLAIN_SCHEMA = zod.object({
    x: zod.number().pipe(zod.coerce.string()).or(zod.string()),
    y: zod.number().pipe(zod.coerce.string()).or(zod.string()),
    z: zod.number().pipe(zod.coerce.string()).or(zod.string()),
  });

  static readonly SCHEMA = this.PLAIN_SCHEMA.transform((data) =>
    this.create(data),
  );

  /**
   * Deserializes an instance of this class from data parsed from a JSON string.
   *
   * @returns The resulting new instance.
   */
  static fromJSON(obj: unknown): DecimalVector3Data {
    return this.SCHEMA.parse(obj);
  }

  /**
   * Converts a domain object into a data object that can be JSON serialized.
   *
   * @param vector The domain object to convert.
   * @returns The resulting data object.
   */
  static fromVector3(vector: THREE.Vector3): DecimalVector3Data {
    return DecimalVector3Data.create({
      x: vector.x.toString(),
      y: vector.y.toString(),
      z: vector.z.toString(),
    });
  }

  /**
   * Converts this data object into a domain object with more functionality.
   *
   * @returns The resulting domain object.
   */
  toVector3(): THREE.Vector3 {
    return this.toFloatData().toVector3();
  }

  /**
   * Converts this data object into its float equivalent.
   *
   * @returns The resulting float vector.
   */
  toFloatData(): Vector3Data {
    return Vector3Data.create({
      x: Number(this.x),
      y: Number(this.y),
      z: Number(this.z),
    });
  }
}

export class OptionalVector3Data extends BaseVector3Data<number | null> {
  static create(values: {
    x: number | null;
    y: number | null;
    z: number | null;
  }) {
    return new this(values.x, values.y, values.z);
  }

  static readonly PLAIN_SCHEMA = zod.object({
    x: zod.number().nullable(),
    y: zod.number().nullable(),
    z: zod.number().nullable(),
  });

  static readonly SCHEMA = this.PLAIN_SCHEMA.transform((data) =>
    this.create(data),
  );

  /**
   * Deserializes an instance of this class from data parsed from a JSON string.
   *
   * @returns The resulting new instance.
   */
  static fromJSON(obj: unknown): OptionalVector3Data {
    return this.SCHEMA.parse(obj);
  }

  /**
   * Converts a domain object into a data object that can be JSON serialized.
   *
   * @param vector The domain object to convert.
   * @returns The resulting data object.
   */
  static fromOptionalVector3(vector: OptionalVector3): OptionalVector3Data {
    return OptionalVector3Data.create({
      x: vector.x,
      y: vector.y,
      z: vector.z,
    });
  }

  /**
   * Creates a new instance with all components set to `null`.
   *
   * @returns The resulting instance.
   */
  static empty(): OptionalVector3Data {
    return OptionalVector3Data.create({ x: null, y: null, z: null });
  }

  /**
   * Converts this data object into a domain object with more functionality.
   *
   * @returns The resulting domain object.
   */
  toOptionalVector3(): OptionalVector3 {
    return new OptionalVector3(this.x, this.y, this.z);
  }

  /**
   * Converts this data object into its decimal equivalent.
   *
   * @returns The resulting decimal vector.
   */
  toDecimalData(): OptionalDecimalVector3Data {
    return OptionalDecimalVector3Data.create({
      x: this.x?.toString() ?? null,
      y: this.y?.toString() ?? null,
      z: this.z?.toString() ?? null,
    });
  }
}

export class Vector3Data extends BaseVector3Data<number> {
  static create(values: { x: number; y: number; z: number }) {
    return new this(values.x, values.y, values.z);
  }

  static readonly PLAIN_SCHEMA = zod.object({
    x: zod.number(),
    y: zod.number(),
    z: zod.number(),
  });

  static readonly SCHEMA = this.PLAIN_SCHEMA.transform((data) =>
    this.create(data),
  );

  /**
   * Deserializes an instance of this class from data parsed from a JSON string.
   *
   * @returns The resulting new instance.
   */
  static fromJSON(obj: unknown): Vector3Data {
    return this.SCHEMA.parse(obj);
  }

  /**
   * Converts a domain object into a data object that can be JSON serialized.
   *
   * @param vector The domain object to convert.
   * @returns The resulting data object.
   */
  static fromVector3(vector: THREE.Vector3): Vector3Data {
    return Vector3Data.create({
      x: vector.x,
      y: vector.y,
      z: vector.z,
    });
  }

  /**
   * Converts this data object into a domain object with more functionality.
   *
   * @returns The resulting domain object.
   */
  toVector3(): THREE.Vector3 {
    return new THREE.Vector3(this.x, this.y, this.z);
  }

  /**
   * Converts this data object into its decimal equivalent.
   *
   * @returns The resulting decimal vector.
   */
  toDecimalData(): DecimalVector3Data {
    return DecimalVector3Data.create({
      x: this.x.toString(),
      y: this.y.toString(),
      z: this.z.toString(),
    });
  }
}
