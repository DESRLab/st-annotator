import _ from "lodash";

/**
 * Represents any constructor that creates an object of type `T`.
 */
export type ConstructorOf<T> = new (...args: any[]) => T;

/**
 * Expands a type so that it is more normalized.
 *
 * @see https://github.com/microsoft/TypeScript/issues/47980
 */
export type Expand<T> = T extends unknown ? { [K in keyof T]: T[K] } : never;

/**
 * Tests whether an object is not null-like.
 */
export function isNotNull<T>(obj: T | null | undefined): obj is T & {} {
  return obj != null;
}

/**
 * Tests whether an object has a given property.
 */
export function hasProp<T, K extends PropertyKey>(
  obj: T,
  key: K,
): obj is T & Record<K, unknown> {
  return key in (obj as object);
}

/**
 * Gets a property of an object if it exists; otherwise, returns the default value.
 *
 * This is especially useful if the property can be `null` or `undefined`, which would
 * prevent optional chaining from distinguishing between a missing property and an
 * existing `null` or `undefined` value.
 */
export function getPropOrDefault<T extends {}, K extends keyof T>(
  obj: T,
  key: K,
  defaultValue: Required<Pick<T, K>>[K],
): Required<Pick<T, K>>[K] {
  return hasProp(obj, key) ? obj[key] : defaultValue;
}

export type IntersectN<Ts extends readonly any[], R = {}> = Ts extends [
  infer T0,
  ...infer TRest,
]
  ? IntersectN<TRest, R & T0>
  : R;

/**
 * Combines two objects into a single one using {@link _.merge}.
 *
 * This function does not mutate the inputs.
 *
 * @see {@link _.merge}
 */
export function mergeObjects<Ts extends readonly any[]>(
  ...objs: [...Ts]
): IntersectN<Ts> {
  return _.merge({}, ...objs);
}

export type GetOrNever<T, K extends string | number | symbol> =
  T extends Partial<Record<K, unknown>> ? T[K] : never;

/**
 * Access a type `TOuter` to produce `TInner` such that `_.get(TOuter, TPath)` returns `TInner`.
 *
 * (See: {@link _.get})
 */
export type InnerObject<
  TOuter,
  TPath extends readonly string[],
> = TPath extends [infer P0 extends string, ...infer PRest extends string[]]
  ? InnerObject<GetOrNever<TOuter, P0>, PRest>
  : TOuter;
