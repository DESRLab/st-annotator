import BiMap from "ts-bidirectional-map";

import { Placeholder } from "./Placeholder";

/**
 * A {@link BiMap} whose keys may be unresolved {@link Placeholder}s: once a
 * placeholder key resolves, lookups by the resolved key also find its value.
 */
export class BiMapWithPlaceholderLookup<
  KResolved extends {} | null,
  V,
> extends BiMap<KResolved | Placeholder<KResolved>, V> {
  // Placeholder aliases replace their unresolved keys logically, so they do
  // not add entries beyond the backing bimap's existing size.
  readonly #resolvedPlaceholders = new Map<KResolved, Placeholder<KResolved>>();
  readonly #placeholderResolutions = new Map<
    Placeholder<KResolved>,
    KResolved
  >();

  get(key: KResolved | Placeholder<KResolved>): V | undefined {
    if (!Placeholder.isPlaceholder(key)) {
      // A real key added after a placeholder resolves takes precedence.
      if (super.has(key)) return super.get(key);
      // @ts-expect-error - isPlaceholder narrows key but TS can't infer it
      const resolvedKey = this.#resolvedPlaceholders.get(key);
      if (resolvedKey !== undefined) return super.get(resolvedKey);
    }

    return super.get(key);
  }

  has(key: KResolved | Placeholder<KResolved>): boolean {
    if (super.has(key)) return true;
    if (Placeholder.isPlaceholder(key)) return false;
    // @ts-expect-error - isPlaceholder narrows key but TS can't infer it
    return this.#resolvedPlaceholders.has(key);
  }

  getKey(value: V): KResolved | Placeholder<KResolved> | undefined {
    const key = super.getKey(value);
    if (key == null || !Placeholder.isPlaceholder(key)) return key;
    return this.#placeholderResolutions.get(key) ?? key;
  }

  #listenToResolve(key: Placeholder<KResolved>): void {
    void key.getAsync().then((resolvedKey) => {
      // Resolution may complete after the placeholder was removed.
      if (!super.has(key)) return;
      this.#resolvedPlaceholders.set(resolvedKey, key);
      this.#placeholderResolutions.set(key, resolvedKey);
    });
  }

  #removePlaceholderResolution(key: KResolved | Placeholder<KResolved>): void {
    if (!Placeholder.isPlaceholder(key)) return;
    const resolved = this.#placeholderResolutions.get(key);
    if (resolved === undefined) return;
    if (this.#resolvedPlaceholders.get(resolved) === key)
      this.#resolvedPlaceholders.delete(resolved);
    this.#placeholderResolutions.delete(key);
  }

  #pruneRemovedPlaceholders(): void {
    for (const placeholder of this.#placeholderResolutions.keys()) {
      if (!super.has(placeholder))
        this.#removePlaceholderResolution(placeholder);
    }
  }

  set(key: KResolved | Placeholder<KResolved>, value: V): this {
    if (Placeholder.isPlaceholder(key)) {
      this.#listenToResolve(key);
    } else {
      // A concrete key supersedes an entry previously stored through the
      // placeholder that resolved to it; the two are one logical key.
      // @ts-expect-error - isPlaceholder narrows key but TS can't infer it
      const placeholder = this.#resolvedPlaceholders.get(key);
      if (placeholder !== undefined) {
        this.#removePlaceholderResolution(placeholder);
        super.delete(placeholder);
      }
    }

    super.set(key, value);
    this.#pruneRemovedPlaceholders();
    return this;
  }

  delete(key: KResolved | Placeholder<KResolved>): void {
    if (!Placeholder.isPlaceholder(key)) {
      // @ts-expect-error - isPlaceholder narrows key but TS can't infer it
      const placeholder = this.#resolvedPlaceholders.get(key);
      if (placeholder !== undefined) key = placeholder;
    }
    this.#removePlaceholderResolution(key);
    super.delete(key);
  }

  deleteValue(value: V): void {
    const key = super.getKey(value);
    if (key !== undefined) this.#removePlaceholderResolution(key);
    super.deleteValue(value);
  }

  clear(): void {
    super.clear();
    this.#resolvedPlaceholders.clear();
    this.#placeholderResolutions.clear();
  }
}
