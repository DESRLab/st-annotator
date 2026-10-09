import { Data } from 'dataclass';
import * as THREE from 'three';
import { z as zod } from 'zod';

/**
 * @typedef {[?number, ?number, ?number]} OptionalVector3Tuple
 */

/**
 * Represents a vector with its components optionally specified.
 */
export class OptionalVector3 {

    /**
     * The `x` value of the vector.
     * 
     * @type {?number}
     */
    x;

    /**
     * The `y` value of the vector.
     * 
     * @type {?number}
     */
    y;

    /**
     * The `z` value of the vector.
     * 
     * @type {?number}
     */
    z;

    /**
     * Creates a new partial vector.
     * 
     * @param {?number} x The `x` value of the vector. Defaults to `null`.
     * @param {?number} y The `y` value of the vector. Defaults to `null`.
     * @param {?number} z The `z` value of the vector. Defaults to `null`.
     */
    constructor(x = null, y = null, z = null) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    /**
     * Returns `true` if the components of this vector and `v` are strictly equal;
     * `false` otherwise.
     *
     * @param {Readonly<OptionalVector3 | THREE.Vector3>} v The vector to compare against.
     * @returns {boolean} `true` if the two vectors are equal; otherwise, `false`.
     */
    equals(v) {
        return this.x === v.x && this.y === v.y && this.z === v.z;
    }

    /**
     * Gets the `index`-th component of this vector.
     * 
     * - If `index` equals `0` returns the `x` value.
     * - If `index` equals `1` returns the `y` value.
     * - If `index` equals `2` returns the `z` value.
     * 
     * @param {number} index The index of the component.
     * @returns {?number} The value of the component.
     */
    getComponent(index) {
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
     * @param {number} index The index of the component.
     * @param {?number} value The value of the component.
     * @returns {this} This object.
     */
    setComponent(index, value) {
        if (index === 0) return this.setX(value);
        if (index === 1) return this.setY(value);
        if (index === 2) return this.setZ(value);

        throw new Error(`Invalid index: ${index}`);
    }

    /**
     * Replace this vector's `x` value with `x`.
     * 
     * @param {?number} x The value to set.
     * @returns {this} This object.
     */
    setX(x) {
        this.x = x;
        return this;
    }

    /**
     * Replace this vector's `y` value with `y`.
     * 
     * @param {?number} y The value to set.
     * @returns {this} This object.
     */
    setY(y) {
        this.y = y;
        return this;
    }

    /**
     * Replace this vector's `z` value with `z`.
     * 
     * @param {?number} z The value to set.
     * @returns {this} This object.
     */
    setZ(z) {
        this.z = z;
        return this;
    }

    /**
     * Sets the `x`, `y` and `z` components of this vector.
     * 
     * @param {?number} x The `x` value to set.
     * @param {?number} y The `y` value to set.
     * @param {?number} z The `z` value to set.
     * @returns {this} This object.
     */
    set(x, y, z) {
        return this.setX(x).setY(y).setZ(z);
    }

    /**
     * Adds `v` to this vector.
     * 
     * @param {Readonly<OptionalVector3 | THREE.Vector3>} v The other vector.
     * @returns {this} This vector, modified in place. If a component is `null` in either
     * vector, that component is set to `null` in the result.
     */
    add(v) {
        return this.zip(v, (a, b) => a + b);
    }

    /**
     * Adds the scalar value `s` to this vector's `x`, `y` and `z` values.
     * 
     * @param {number} s The scalar to add.
     * @returns {this} This vector, modified in place. If a component is `null` in this
     * vector, that component is set to `null` in the result.
     */
    addScalar(s) {
        return this.map((c) => c + s);
    }

    /**
     * Subtracts `v` to this vector.
     * 
     * @param {Readonly<OptionalVector3 | THREE.Vector3>} v The other vector.
     * @returns {this} This vector, modified in place. If a component is `null` in either
     * vector, that component is set to `null` in the result.
     */
    sub(v) {
        return this.zip(v, (a, b) => a - b);
    }

    /**
     * Subtracts the scalar value `s` to this vector's `x`, `y` and `z` values.
     * 
     * @param {number} s The scalar to subtract.
     * @returns {this} This vector, modified in place. If a component is `null` in this
     * vector, that component is set to `null` in the result.
     */
    subScalar(s) {
        return this.map((c) => c - s);
    }

    /**
     * Multiplies `v` to this vector.
     * 
     * @param {Readonly<OptionalVector3 | THREE.Vector3>} v The other vector.
     * @returns {this} This vector, modified in place. If a component is `null` in either
     * vector, that component is set to `null` in the result.
     */
    multiply(v) {
        return this.zip(v, (a, b) => a * b);
    }

    /**
     * Multiplies the scalar value `s` to this vector's `x`, `y` and `z` values.
     * 
     * @param {number} s The scalar to multiply.
     * @returns {this} This vector, modified in place. If a component is `null` in this
     * vector, that component is set to `null` in the result.
     */
    multiplyScalar(s) {
        return this.map((c) => c * s);
    }

    /**
     * Divides `v` to this vector.
     * 
     * @param {Readonly<OptionalVector3 | THREE.Vector3>} v The other vector.
     * @returns {this} This vector, modified in place. If a component is `null` in either
     * vector, that component is set to `null` in the result.
     */
    divide(v) {
        return this.zip(v, (a, b) => a / b);
    }

    /**
     * Divides the scalar value `s` to this vector's `x`, `y` and `z` values.
     * 
     * @param {number} s The scalar to divide.
     * @returns {this} This vector, modified in place. If a component is `null` in this
     * vector, that component is set to `null` in the result.
     */
    divideScalar(s) {
        return this.map((c) => c / s);
    }

    /**
     * Returns an array `[x, y, z]`, or copies `x`, `y` and `z` into the provided array.
     * 
     * @template {(?number)[]} [T=OptionalVector3Tuple]
     * @param {T} array An array to store this vector to. Defaults to a new empty array.
     * @param {number} offset Optional offset into the array. Defaults to `0`.
     * @returns {T} The new or modified array.
     */
    // @ts-expect-error
    toArray(array = [], offset = 0) {
        array[offset] = this.x;
        array[offset + 1] = this.y;
        array[offset + 2] = this.z;

        return array;
    }

    /**
     * Applies a function to each element of this vector, modifying it in-place.
     * 
     * @param {(value: number) => number} fn The function to apply.
     * @returns {this} This object.
     */
    map(fn) {
        /** @type {(c: ?number) => ?number} */
        const maybeNullFn = (c) => ((c == null) ? null : fn(c));

        return this.set(
            maybeNullFn(this.x),
            maybeNullFn(this.y),
            maybeNullFn(this.z),
        );
    }

    /**
     * Applies a function to each element of a pair of vectors, modifying this vector in-place.
     * 
     * @param {Readonly<OptionalVector3 | THREE.Vector3>} v2 The second vector in the pair.
     * (The first vector is this object)
     * @param {(value1: number, value2: number) => number} fn The function to apply.
     * @returns {this} This object.
     */
    zip(v2, fn) {
        /** @type {(a: ?number, b: ?number) => ?number} */
        const maybeNullFn = (a, b) => ((a == null || b == null) ? null : fn(a, b));

        return this.set(
            maybeNullFn(this.x, v2.x),
            maybeNullFn(this.y, v2.y),
            maybeNullFn(this.z, v2.z),
        );
    }

    /**
     * Applies a function to each element of a pair of vectors, resulting in a new vector.
     * 
     * @param {Readonly<OptionalVector3 | THREE.Vector3>} v1 The first vector in the pair.
     * @param {Readonly<OptionalVector3 | THREE.Vector3>} v2 The second vector in the pair.
     * @param {(value1: ?number, value2: ?number) => ?number} fn The function to apply.
     * @returns {OptionalVector3} The new vector.
     */
    static zip(v1, v2, fn) {
        return new OptionalVector3(fn(v1.x, v2.x), fn(v1.y, v2.y), fn(v1.z, v2.z));
    }

    /**
     * Returns a new vector with each missing component replaced by the corresponding
     * component of a reference vector.
     * 
     * @param {THREE.Vector3 | THREE.Vector3} v The reference vector providing the fill value for
     * each component.
     * @returns {THREE.Vector3} The resulting vector which is fully specified.
     */
    fill(v) {
        return new THREE.Vector3(
            this.x ?? v.x,
            this.y ?? v.y,
            this.z ?? v.z,
        );
    }

    /**
     * Returns a new vector with each missing component replaced by a scalar value.
     * 
     * @param {number} s The value to fill each missing component with.
     * @returns {THREE.Vector3} The resulting vector which is fully specified.
     */
    fillScalar(s) {
        return new THREE.Vector3(
            this.x ?? s,
            this.y ?? s,
            this.z ?? s,
        );
    }

    /**
     * Returns a new vector with the same `x`, `y` and `z` values as this one.
     * 
     * @returns {OptionalVector3} The new vector.
     */
    clone() {
        return new OptionalVector3(this.x, this.y, this.z);
    }

    /**
     * Copies the values of the passed vector's `x`, `y` and `z` properties to this vector.
     * 
     * @param {Readonly<OptionalVector3 | THREE.Vector3>} v The vector to copy from.
     * @returns {this} The new vector.
     */
    copy(v) {
        return this.set(v.x, v.y, v.z);
    }
}

/**
 * @template T
 */
class BaseVector3Data extends Data {

    /**
     * @readonly
     * @type {T}
     */
    x;

    /**
     * @readonly
     * @type {T}
     */
    y;

    /**
     * @readonly
     * @type {T}
     */
    z;
}

/**
 * @augments BaseVector3Data<?string>
 */
export class OptionalDecimalVector3Data extends BaseVector3Data {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = zod.object({
        x: zod.number().pipe(zod.coerce.string()).or(zod.string()).nullable(),
        y: zod.number().pipe(zod.coerce.string()).or(zod.string()).nullable(),
        z: zod.number().pipe(zod.coerce.string()).or(zod.string()).nullable(),
    });

    /**
     * @readonly
     */
    static SCHEMA = this.PLAIN_SCHEMA
        .transform((data) => this.create(data));

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {OptionalDecimalVector3Data} The resulting new instance.
     */
    static fromJSON(obj) {
        return this.SCHEMA.parse(obj);
    }

    /**
     * Converts a domain object into a data object that can be JSON serialized.
     * 
     * @param {OptionalVector3} vector The domain object to convert.
     * @returns {OptionalDecimalVector3Data} The resulting data object.
     */
    static fromOptionalVector3(vector) {
        return OptionalDecimalVector3Data.create({
            x: vector.x?.toString() ?? null,
            y: vector.y?.toString() ?? null,
            z: vector.z?.toString() ?? null,
        });
    }

    /**
     * Creates a new instance with all components set to `null`.
     * 
     * @returns {OptionalDecimalVector3Data} The resulting instance.
     */
    static empty() {
        return OptionalDecimalVector3Data.create({ x: null, y: null, z: null });
    }

    /**
     * Converts this data object into a domain object with more functionality.
     * 
     * @returns {OptionalVector3} The resulting domain object.
     */
    toOptionalVector3() {
        return this.toFloatData().toOptionalVector3();
    }

    /**
     * Converts this data object into its float equivalent.
     * 
     * @returns {OptionalVector3Data} The resulting float vector.
     */
    toFloatData() {
        // eslint-disable-next-line no-use-before-define
        return OptionalVector3Data.create({
            x: this.x == null ? null : Number(this.x),
            y: this.y == null ? null : Number(this.y),
            z: this.z == null ? null : Number(this.z),
        });
    }
}

/**
 * @augments BaseVector3Data<string>
 */
export class DecimalVector3Data extends BaseVector3Data {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = zod.object({
        x: zod.number().pipe(zod.coerce.string()).or(zod.string()),
        y: zod.number().pipe(zod.coerce.string()).or(zod.string()),
        z: zod.number().pipe(zod.coerce.string()).or(zod.string()),
    });

    /**
     * @readonly
     */
    static SCHEMA = this.PLAIN_SCHEMA
        .transform((data) => this.create(data));

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {DecimalVector3Data} The resulting new instance.
     */
    static fromJSON(obj) {
        return this.SCHEMA.parse(obj);
    }

    /**
     * Converts a domain object into a data object that can be JSON serialized.
     * 
     * @param {THREE.Vector3} vector The domain object to convert.
     * @returns {DecimalVector3Data} The resulting data object.
     */
    static fromVector3(vector) {
        return DecimalVector3Data.create({
            x: vector.x.toString(),
            y: vector.y.toString(),
            z: vector.z.toString(),
        });
    }

    /**
     * Converts this data object into a domain object with more functionality.
     * 
     * @returns {THREE.Vector3} The resulting domain object.
     */
    toVector3() {
        return this.toFloatData().toVector3();
    }

    /**
     * Converts this data object into its float equivalent.
     * 
     * @returns {Vector3Data} The resulting float vector.
     */
    toFloatData() {
        // eslint-disable-next-line no-use-before-define
        return Vector3Data.create({
            x: Number(this.x),
            y: Number(this.y),
            z: Number(this.z),
        });
    }
}

/**
 * @augments BaseVector3Data<?number>
 */
export class OptionalVector3Data extends BaseVector3Data {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = zod.object({
        x: zod.number().nullable(),
        y: zod.number().nullable(),
        z: zod.number().nullable(),
    });

    /**
     * @readonly
     */
    static SCHEMA = this.PLAIN_SCHEMA
        .transform((data) => this.create(data));

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {OptionalVector3Data} The resulting new instance.
     */
    static fromJSON(obj) {
        return this.SCHEMA.parse(obj);
    }

    /**
     * Converts a domain object into a data object that can be JSON serialized.
     * 
     * @param {OptionalVector3} vector The domain object to convert.
     * @returns {OptionalVector3Data} The resulting data object.
     */
    static fromOptionalVector3(vector) {
        return OptionalVector3Data.create({
            x: vector.x,
            y: vector.y,
            z: vector.z,
        });
    }

    /**
     * Creates a new instance with all components set to `null`.
     * 
     * @returns {OptionalVector3Data} The resulting instance.
     */
    static empty() {
        return OptionalVector3Data.create({ x: null, y: null, z: null });
    }

    /**
     * Converts this data object into a domain object with more functionality.
     * 
     * @returns {OptionalVector3} The resulting domain object.
     */
    toOptionalVector3() {
        return new OptionalVector3(
            this.x,
            this.y,
            this.z,
        );
    }

    /**
     * Converts this data object into its decimal equivalent.
     * 
     * @returns {OptionalDecimalVector3Data} The resulting decimal vector.
     */
    toDecimalData() {
        return OptionalDecimalVector3Data.create({
            x: this.x?.toString() ?? null,
            y: this.y?.toString() ?? null,
            z: this.z?.toString() ?? null,
        });
    }
}

/**
 * @augments BaseVector3Data<number>
 */
export class Vector3Data extends BaseVector3Data {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = zod.object({
        x: zod.number(),
        y: zod.number(),
        z: zod.number(),
    });

    /**
     * @readonly
     */
    static SCHEMA = this.PLAIN_SCHEMA
        .transform((data) => this.create(data));

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {Vector3Data} The resulting new instance.
     */
    static fromJSON(obj) {
        return this.SCHEMA.parse(obj);
    }

    /**
     * Converts a domain object into a data object that can be JSON serialized.
     * 
     * @param {THREE.Vector3} vector The domain object to convert.
     * @returns {Vector3Data} The resulting data object.
     */
    static fromVector3(vector) {
        return Vector3Data.create({
            x: vector.x,
            y: vector.y,
            z: vector.z,
        });
    }

    /**
     * Converts this data object into a domain object with more functionality.
     * 
     * @returns {THREE.Vector3} The resulting domain object.
     */
    toVector3() {
        return new THREE.Vector3(
            this.x,
            this.y,
            this.z,
        );
    }

    /**
     * Converts this data object into its decimal equivalent.
     * 
     * @returns {DecimalVector3Data} The resulting decimal vector.
     */
    toDecimalData() {
        return DecimalVector3Data.create({
            x: this.x.toString(),
            y: this.y.toString(),
            z: this.z.toString(),
        });
    }
}
