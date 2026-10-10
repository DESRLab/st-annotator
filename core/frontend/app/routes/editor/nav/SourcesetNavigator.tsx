import type { SourceGroupState } from "../models";

import type { EditorViews } from "../views";

import { ArrayMapIndex } from "./ArrayMapIndex";
import { Navigator } from "./Navigator";

export class SourceGroupIndex extends ArrayMapIndex<
  SourceGroupState,
  SourceGroupState
> {
  /**
   * Creates a new index by copying from an existing array.
   *
   * @param elements The reference array containing
   * the elements to index, from which a shallow copy is made.
   */
  constructor(elements: readonly SourceGroupState[] = []) {
    super((group) => group, elements);
  }
}

/**
 * Navigates between sourcesets for a task, under a set of selectors.
 */
export class SourcesetNavigator extends Navigator<
  SourceGroupState,
  SourceGroupIndex
> {
  #loadGeneration = 0;

  #taskId: number | null;

  /**
   * The unique identifier of the currently active task.
   */
  get taskId(): number | null {
    return this.#taskId;
  }

  /**
   * The groups available to the task and match the selectors.
   */
  get groups(): SourceGroupIndex {
    return this.index;
  }

  /**
   * The number of groups available to the task and match the selectors.
   */
  get numGroups(): number {
    return this.numElements;
  }

  /**
   * The currently selected group, or `null` if none.
   */
  get group(): SourceGroupState | null {
    return this.selected;
  }

  set group(value: SourceGroupState | null) {
    this.selected = value;
  }

  protected hasElement(element: SourceGroupState): boolean {
    return this.index.hasKeyOf(element);
  }

  protected createIndex(
    elements: readonly SourceGroupState[],
  ): SourceGroupIndex {
    return new SourceGroupIndex(elements);
  }

  /**
   * Creates a new sourceset navigator for a task, under a set of selectors,
   * with its index already loaded.
   *
   * @param views The interface of the application with the server.
   * @param taskId The unique identifier of the task under which each group is
   * accessed.
   * @returns A promise that resolves to the newly created navigator.
   */
  static async create(
    views: EditorViews,
    taskId: number | null,
  ): Promise<SourcesetNavigator> {
    const nav = new SourcesetNavigator(views);

    await nav.load(taskId);

    return nav;
  }

  /**
   * Creates a new sourcesets navigator for a task, under a set of selectors.
   *
   * @param views The interface of the application with the server.
   */
  constructor(views: EditorViews) {
    super(views, new SourceGroupIndex());

    this.#taskId = null;
  }

  /**
   * Loads the index of this navigator.
   *
   * @param taskId The unique identifier of the task under which each group is
   * accessed.
   */
  async load(taskId: number | null) {
    const generation = ++this.#loadGeneration;
    const groups =
      taskId == null ? [] : await this.views.getSourceGroups(taskId);
    if (generation !== this.#loadGeneration) return;

    this.#taskId = taskId;
    this.setElements(groups);
  }
}
