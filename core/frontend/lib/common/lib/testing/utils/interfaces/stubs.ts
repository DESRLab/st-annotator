/**
 * Stub implementation of Equatable for testing.
 */
export class EquatableStub {
  /**
   * Tests whether two objects are equal to each other.
   *
   * @param other The object to compare against.
   * @returns `true` if the two objects are equal; otherwise, `false`.
   */
  equals(other: object): boolean {
    return this === other;
  }
}

/**
 * Stub implementation of Hashable for testing.
 */
export class HashableStub extends EquatableStub {
  static #maxId = 0;

  #id = 0;

  constructor() {
    super();

    this.#id = HashableStub.#maxId;

    HashableStub.#maxId += 1;
  }

  /**
   * Hashes this object to a string so that it can be used as a key in a mapping.
   *
   * @returns The resulting hash.
   */
  hash(): string {
    return this.#id.toString();
  }
}
