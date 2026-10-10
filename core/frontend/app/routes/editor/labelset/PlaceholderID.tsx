import { Placeholder } from "./Placeholder";

/**
 * Identifies a label object: either the resolved id assigned by the server,
 * or a placeholder waiting for that id.
 */
export type UUID = string | Placeholder<string>;

/**
 * A shorter version of a {@link UUID} that can be displayed to the user for convenience.
 */
export class ShortUUID {
  /**
   * The reference unique identifier.
   */
  readonly id: UUID;

  /**
   * Creates a shorter version of the given {@link UUID}.
   */
  constructor(id: UUID) {
    this.id = id;
  }

  /**
   * Returns a string representation of this object.
   *
   * @returns The string representation of this object.
   */
  toString(): string {
    const { id } = this;
    const resolvedId = Placeholder.isPlaceholder(id) ? id.orElse("<...>") : id;

    return resolvedId.slice(-6);
  }
}
