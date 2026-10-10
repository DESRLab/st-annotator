import type { EditorViews } from "../views";

/**
 * Defines the minimal interface of an index managed by a {@link Navigator}.
 */
export interface NavigatorIndex<TElement> {
  /**
   * An array containing the elements.
   */
  readonly elements: readonly TElement[];

  /**
   * The number of elements in this index.
   */
  readonly size: number;
}

/**
 * Provides the common skeleton of a navigator, which indexes a collection
 * of elements and keeps track of the element that is currently selected.
 *
 * This base class provides the index storage along with element/count accessors,
 * a validated selection that falls back to `null` when the requested element
 * is not part of the index, and the rebuild-and-select-first step of loading.
 * Subclasses are responsible for fetching the elements to index and for
 * constructing the concrete index.
 */
export abstract class Navigator<
  TElement,
  TIndex extends NavigatorIndex<TElement>,
> {
  /**
   * The interface of the application with the server.
   */
  readonly views: EditorViews;

  #index: TIndex;

  /**
   * The index of the elements available for selection.
   */
  protected get index(): TIndex {
    return this.#index;
  }

  /**
   * The number of elements available for selection.
   */
  protected get numElements(): number {
    return this.#index.size;
  }

  #selected: TElement | null;

  /**
   * The currently selected element, or `null` if none.
   */
  protected get selected(): TElement | null {
    return this.#selected;
  }

  /**
   * Selects the given element; if it is not part of the index,
   * the selection falls back to `null`.
   */
  protected set selected(value: TElement | null) {
    if (this.#selected !== value) {
      this.#selected = value != null && this.hasElement(value) ? value : null;
    }
  }

  /**
   * Tests whether the given element exists in the index of this navigator.
   *
   * @param element The query element.
   * @returns `true` if the element exists; otherwise, `false`.
   */
  protected abstract hasElement(element: TElement): boolean;

  /**
   * Creates a new index from the given elements.
   *
   * @param elements The reference array containing the elements to index.
   * @returns The newly created index.
   */
  protected abstract createIndex(elements: readonly TElement[]): TIndex;

  /**
   * Creates a new navigator.
   *
   * @param views The interface of the application with the server.
   * @param initialIndex The initial index of this navigator.
   */
  protected constructor(views: EditorViews, initialIndex: TIndex) {
    this.views = views;

    this.#index = initialIndex;
    this.#selected = null;
  }

  /**
   * Rebuilds the index of this navigator with the given elements,
   * then selects the first element if there is any.
   *
   * @param elements The reference array containing the elements to index.
   */
  protected setElements(elements: readonly TElement[]): void {
    this.rebuildIndex(elements);
    this.#selected = this.#index.elements.at(0) ?? null;
  }

  /**
   * Rebuilds the index of this navigator with the given elements without
   * selecting anything. The previous selection is not validated against the
   * new index, so callers must assign `selected` immediately afterwards.
   *
   * @param elements The reference array containing the elements to index.
   */
  protected rebuildIndex(elements: readonly TElement[]): void {
    this.#index = this.createIndex(elements);
  }
}
