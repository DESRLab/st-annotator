import type { Equatable } from "./Equatable";

/**
 * Interface for hashable objects.
 */
export interface Hashable extends Equatable {
  /**
   * Hashes this object to a string so that it can be used as a key in a mapping.
   */
  hash(): string;

  /**
   * Tests whether two objects are equal to each other.
   *
   * This should agree with {@link hash}; that is, two equal objects must
   * have the same hash, although two objects with the same hash need not be equal.
   */
  equals(other: object): boolean;
}
