import type { TaskState } from "../models";

import type { EditorViews } from "../views";

import { ArrayMapIndex } from "./ArrayMapIndex";
import { Navigator } from "./Navigator";

export class TaskIndex extends ArrayMapIndex<number, TaskState> {
  /**
   * Creates a new index by copying from an existing array.
   *
   * @param elements The reference array containing the elements to index,
   * from which a shallow copy is made.
   */
  constructor(elements: readonly TaskState[] = []) {
    super((task) => task.id, elements);
  }
}

/**
 * Navigates between tasks in a project.
 */
export class ProjectNavigator extends Navigator<TaskState, TaskIndex> {
  #loadGeneration = 0;

  /**
   * The tasks available to the project, sorted in ascending order.
   */
  get tasks(): TaskIndex {
    return this.index;
  }

  /**
   * The number of tasks available to the project.
   */
  get numTasks(): number {
    return this.numElements;
  }

  /**
   * The currently selected task, or `null` if none.
   */
  get task(): TaskState | null {
    return this.selected;
  }

  set task(value: TaskState | null) {
    this.selected = value;
  }

  /**
   * The unique identifier of the selected task;
   * set this property to select the corresponding task.
   */
  get taskId(): number | null {
    return this.#getIdOfTask(this.task);
  }

  set taskId(value: number | null) {
    this.task = this.#getTaskFromId(value);
  }

  /**
   * Gets the corresponding task from its unique identifier.
   *
   * @param taskId The query unique identifier, or `null` if none.
   * @returns The requested task.
   */
  #getTaskFromId(taskId: number | null): TaskState | null {
    if (taskId == null) return null;

    return this.tasks.getByKey(taskId);
  }

  /**
   * Gets the unique identifier of a task.
   *
   * @param task The query task, or `null` if none.
   * @returns The requested unique identifier.
   */
  #getIdOfTask(task: TaskState | null): number | null {
    if (task == null) return null;

    return this.tasks.getKey(task);
  }

  protected hasElement(element: TaskState): boolean {
    return this.index.hasKeyOf(element);
  }

  protected createIndex(elements: readonly TaskState[]): TaskIndex {
    return new TaskIndex(elements);
  }

  /**
   * Creates a new navigator for a project with its index already loaded.
   *
   * @param views The interface of the application with the server.
   * @returns A promise that resolves to the newly created navigator.
   */
  static async create(views: EditorViews): Promise<ProjectNavigator> {
    const nav = new ProjectNavigator(views);

    await nav.load();

    return nav;
  }

  /**
   * Creates a new navigator for a project.
   *
   * @param views The interface of the application with the server.
   */
  constructor(views: EditorViews) {
    super(views, new TaskIndex());
  }

  /**
   * Loads the index of this navigator.
   */
  async load() {
    const generation = ++this.#loadGeneration;
    const tasks = await this.views.listTasks();
    if (generation !== this.#loadGeneration) return;

    this.setElements(tasks);
  }
}
