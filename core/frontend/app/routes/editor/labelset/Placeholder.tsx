import type { ConstructorOf } from "sta/common";
import { v4 as uuidv4 } from "uuid";

/**
 * Represents a placeholder value to be resolved.
 */
export class Placeholder<T extends {} | null> {
  /**
   * Tests whether an object is a placeholder value.
   */
  static isPlaceholder(obj: unknown): obj is Placeholder<any> {
    if (obj instanceof Placeholder) return true;

    const constructorName = (
      obj as { constructor?: { name?: string } } | null | undefined
    )?.constructor?.name;

    if (constructorName === "Placeholder") {
      // Add this fuzzy comparison because webpack might bundle the plugin in a way
      // such that the Placeholder defined here is a different than the one in the plugin
      console.warn(
        "Detected Placeholder object with a different prototype than the one in this library.",
      );

      return true;
    }

    return false;
  }

  /**
   * This allows us to differentiate instances of this class for debugging purposes.
   */
  static #idCounter = 0;

  /**
   * This allows us to differentiate instances of this class for debugging purposes.
   */
  #id: number;

  /** Stable key used when this placeholder is serialized for backend operations. */
  readonly wireKey: string;

  /**
   * A promise that resolves to the value of this placeholder.
   */
  readonly #promise: Promise<T>;

  /**
   * Resolves the promise of this placeholder.
   */
  #resolve!: (value: T | PromiseLike<T>) => void;

  /**
   * The resolved value, or `undefined` if it has yet to be resolved.
   */
  #value: T | undefined;

  /**
   * Creates a new placeholder value.
   */
  constructor(valueType?: ConstructorOf<T>) {
    this.#id = Placeholder.#idCounter++;
    this.wireKey = `{${uuidv4()}}`;

    this.#promise = new Promise((resolve) => {
      this.#resolve = resolve;
    });

    this.#value = undefined;
  }

  /** Tests whether this placeholder resolved to the supplied value. */
  hasValue(value: T): boolean {
    return this.#value === value;
  }

  /** Tests whether this placeholder has been resolved. */
  get isResolved(): boolean {
    return this.#value !== undefined;
  }

  /**
   * If this placeholder already has a value, returns it; otherwise, returns `fallback`.
   */
  orElse(fallback: T): T {
    if (this.#value !== undefined) {
      return this.#value;
    }

    return fallback;
  }

  /**
   * If this placeholder already has a value, returns it; otherwise, invokes
   * `fallback` to generate a fallback value.
   */
  orElseGet(fallback: () => T): T {
    if (this.#value !== undefined) {
      return this.#value;
    }

    return fallback();
  }

  /**
   * Returns a promise that resolves to the value in this placeholder.
   */
  getAsync(): Promise<T> {
    if (this.#value !== undefined) {
      return Promise.resolve(this.#value);
    }

    return this.#promise;
  }

  /**
   * Resolves this placeholder with the given value.
   */
  put(value: T): void {
    if (this.#value !== undefined) {
      throw new Error("This placeholder has already been resolved");
    }

    this.#value = value;
    this.#resolve(value);
  }

  /**
   * Returns a string representation of this object.
   */
  toString(): string {
    if (this.#value !== undefined) {
      const value = this.#value;
      if (typeof value === "string") return value;
      if (
        typeof value === "number" ||
        typeof value === "boolean" ||
        typeof value === "bigint"
      )
        return String(value);
      if (typeof value === "symbol" || typeof value === "function")
        return value.toString();
      try {
        return JSON.stringify(value);
      } catch {
        return `<Placeholder #${this.#id}>`;
      }
    }

    return `<Placeholder #${this.#id}>`;
  }

  /**
   * Used by the {@link JSON.stringify} method to enable the transformation of an object's
   * data for JavaScript Object Notation (JSON) serialization.
   */
  toJSON(): string {
    return this.wireKey;
  }
}
