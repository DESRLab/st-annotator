import _ from 'lodash';

/**
 * Represents any constructor that creates an object of type `T`.
 * 
 * @template T
 * @typedef {new (...args: any[]) => T} ConstructorOf
 */

/**
 * Expands a type so that it is more normalized.
 * 
 * @template T
 * @typedef {T extends unknown ? { [K in keyof T]: T[K] } : never} Expand
 * @see https://github.com/microsoft/TypeScript/issues/47980
 */

/**
 * Represents a type guard that checks whether the argument passed to the function is of type `T`.
 * 
 * @template T
 * @typedef {(obj: unknown) => obj is T} TypeGuard
 */

/**
 * Tests whether an object is not null-like.
 * 
 * @template T
 * @param {T | null | undefined} obj The object to test.
 * @returns {obj is T} `true` if the object is not null or undefined; otherwise, `false`.
 */
export function isNotNull(obj) {
    return obj != null;
}

/**
 * Tests whether an object has a given property.
 * 
 * @template {{}} T
 * @template {keyof T} K
 * @param {T} obj The object to test.
 * @param {K} key The key of the property.
 * @returns {obj is Required<Pick<T, K>>} `true` if the given property exists; otherwise, `false`.
 */
export function hasProp(obj, key) {
    return key in obj;
}

/**
 * Gets a property of an object if it exists; otherwise, returns the default value.
 * 
 * This is especially useful if the property can be `null` or `undefined`, which would
 * prevent optional chaining from distinguishing between a missing property and an
 * existing `null` or `undefined` value.
 * 
 * @template {{}} T
 * @template {keyof T} K
 * @param {T} obj The object to test.
 * @param {K} key The key of the property.
 * @param {Required<Pick<T, K>>[K]} defaultValue The default value.
 * @returns {Required<Pick<T, K>>[K]} The requested property; defaults to the given value.
 */
export function getPropOrDefault(obj, key, defaultValue) {
    return hasProp(obj, key) ? obj[key] : defaultValue;
}

/**
 * Indicates that an object should not be modified.
 * 
 * Note that this is not strictly enforced.
 * 
 * @template T
 * @typedef {Readonly<T>} Immutable
 */

/**
 * Helper function that casts `obj` to its immutable version.
 * 
 * This circumvents the problem where sometimes `A | B` fails to be matched with
 * `Immutable<A> | Immutable<B>`.
 * 
 * @template T
 * @param {T} obj The object to cast.
 * @returns {Immutable<T>} The object, now annotated with an immutable type.
 */
export function immutable(obj) {
    return obj;
}

/**
 * @template {ReadonlyArray<any>} Ts
 * @template [R={}]
 * @typedef {Ts extends [infer T0, ...infer TRest] ? IntersectN<TRest, R & T0> : R} IntersectN
 */

/**
 * Combines two objects into a single one using {@link _.merge}.
 * 
 * This function does not mutate the inputs.
 * 
 * @template {ReadonlyArray<any>} Ts
 * @param {[...Ts]} objs The first object.
 * @returns {IntersectN<Ts>} The combined object.
 * @see {@link _.merge}
 */
export function mergeObjects(...objs) {
    return _.merge({}, ...objs);
}

/**
 * @template T
 * @template {string | number | symbol} K
 * @typedef {T extends { [k in K]?: unknown } ? T[K] : never} GetOrNever
 */

/**
 * Access a type `TOuter` to produce `TInner` such that `_.get(TOuter, TPath)` returns `TInner`.
 * 
 * (See: {@link _.get})
 * 
 * @template TOuter
 * @template {ReadonlyArray<string>} TPath
 * @typedef {TPath extends [infer P0 extends string, ...infer PRest extends string[]]
 *     ? InnerObject<GetOrNever<TOuter, P0>, PRest>
 *     : TOuter} InnerObject
 */

/**
 * Extracts a wrapped `obj` from `outer` such that `_.get(outer, path)` returns `obj`.
 * 
 * This function does not mutate the inputs.
 * 
 * @template {{}} TOuter
 * @template {ReadonlyArray<string>} TPath
 * @param {TOuter} outer The object to extract from.
 * @param {[...TPath]} path The path from `outer` to `obj`.
 * @returns {InnerObject<TOuter, TPath>} The wrapped object.
 * @see {@link _.get}
 */
export function extractByPath(outer, path) {
    return _.get(outer, path);
}

/**
 * Wraps a type `TInner` to produce `TOuter` such that `_.get(TOuter, TPath)` returns `TInner`.
 * 
 * (See: {@link _.get})
 * 
 * @template TInner
 * @template {ReadonlyArray<string>} TPath
 * @typedef {TPath extends [infer P0 extends string, ...infer PRest extends string[]]
 *     ? { [K in P0]: OuterObject<TInner, PRest> }
 *     : TInner} OuterObject
 */

/**
 * Wraps an object `obj` to produce `outer` such that `_.get(outer, path)` returns `obj`.
 * 
 * This function does not mutate the inputs.
 * 
 * @template TInner
 * @template {ReadonlyArray<string>} TPath
 * @param {TInner} obj The object to wrap.
 * @param {[...TPath]} path The path from `outer` to `obj`.
 * @returns {OuterObject<TInner, TPath>} The wrapper object.
 * @see {@link _.get}
 */
export function wrapByPath(obj, path) {
    return _.set(/** @type {any} */ ({}), path, obj);
}
