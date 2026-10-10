import { EditableBranch } from "../labelset";
import type { EditorViews } from "../views";

import { ArrayMapIndex } from "./ArrayMapIndex";
import { Navigator } from "./Navigator";

export class LabelsetBranchIndex extends ArrayMapIndex<
  EditableBranch,
  EditableBranch
> {
  /**
   * Creates a new index by copying from an existing array.
   *
   * @param elements The reference array containing
   * the elements to index, from which a shallow copy is made.
   */
  constructor(elements: readonly EditableBranch[] = []) {
    super((branch) => branch, elements);
  }
}

/**
 * Navigates between labelsets for a task, under a set of selectors.
 */
export class LabelsetNavigator extends Navigator<
  EditableBranch,
  LabelsetBranchIndex
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
   * Enables storing the history of each branch even when a different task is loaded.
   */
  #loadedBranches: Map<number, EditableBranch>;

  /**
   * The branches available to the task and match the selectors.
   */
  get branches(): LabelsetBranchIndex {
    return this.index;
  }

  /**
   * The number of branches available to the task and match the selectors.
   */
  get numBranches(): number {
    return this.numElements;
  }

  /**
   * `true` if any branch has unsaved changes; otherwise, `false`.
   */
  get hasUnsavedChanges(): boolean {
    return this.branches.elements.some(
      (labelset) => labelset.hasUnsavedChanges,
    );
  }

  /**
   * The currently selected branch, or `null` if none.
   */
  get branch(): EditableBranch | null {
    return this.selected;
  }

  set branch(value: EditableBranch | null) {
    this.selected = value;
  }

  protected hasElement(element: EditableBranch): boolean {
    return this.index.hasKeyOf(element);
  }

  protected createIndex(
    elements: readonly EditableBranch[],
  ): LabelsetBranchIndex {
    return new LabelsetBranchIndex(elements);
  }

  /**
   * Creates a new labelset navigator for a task, under a set of selectors,
   * with its index already loaded.
   *
   * @param views The interface of the application with the server.
   * @param taskId The unique identifier of the task under which each branch is
   * accessed.
   * @returns A promise that resolves to the newly created navigator.
   */
  static async create(
    views: EditorViews,
    taskId: number | null,
  ): Promise<LabelsetNavigator> {
    const nav = new LabelsetNavigator(views);

    await nav.load(taskId);

    return nav;
  }

  /**
   * Creates a new labelsets navigator for a task, under a set of selectors.
   *
   * @param views The interface of the application with the server.
   */
  constructor(views: EditorViews) {
    super(views, new LabelsetBranchIndex());

    this.#taskId = null;
    this.#loadedBranches = new Map();
  }

  /**
   * Loads the index of this navigator.
   *
   * @param taskId The unique identifier of the task under which each branch is
   * accessed.
   */
  async load(taskId: number | null) {
    const generation = ++this.#loadGeneration;
    const rawBranches =
      taskId == null ? [] : await this.views.getLabelBranches(taskId);
    const branches = await Promise.all(
      rawBranches.map(async (data) => {
        let branch = this.#loadedBranches.get(data.id);
        if (branch != null) return branch;

        branch = await EditableBranch.create(this.views, data);
        this.#loadedBranches.set(data.id, branch);

        return branch;
      }),
    );
    if (generation !== this.#loadGeneration) return;

    this.#taskId = taskId;
    this.setElements(branches);
  }
}
