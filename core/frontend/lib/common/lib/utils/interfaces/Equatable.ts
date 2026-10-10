/**
 * Primitives whose equality checks are based on value rather than object identity.
 */
export type EquatablePrimitive = number | string | boolean;

export type EquatableValue = Equatable | EquatablePrimitive;

/**
 * Interface for objects that support rich equality checks.
 */
export interface Equatable {
  /**
   * Tests whether two objects are equal to each other.
   */
  equals(other: object): boolean;
}

export const Equatable = {
  /**
   * Tests whether two nullable values are equal to each other.
   */
  equalsNullable<T extends EquatableValue>(a: T | null, b: T | null): boolean {
    if (a == null) return b == null;
    if (b == null) return false;

    return typeof a === "object" && typeof b === "object"
      ? a.equals(b)
      : a === b;
  },
};
