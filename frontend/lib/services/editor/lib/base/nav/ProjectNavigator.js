import * as THREE from 'three';

import { ArrayMapIndex } from './ArrayMapIndex';

/**
 * @typedef {import('../views').EditorViews} EditorViews
 */

/**
 * @typedef {import('../../../../project/lib').TaskState} TaskState
 */

/**
 * Defines each event that can be dispatched by {@link ProjectNavigator}.
 * 
 * @typedef {object} ProjectNavigatorEventMap
 * @property {{}} change The event when the state of the navigator has been updated.
 */

/**
 * @type {(task: TaskState) => number}
 */
const taskKeyFn = (task) => task.id;

export class TaskIndex extends ArrayMapIndex.withKeyFn(taskKeyFn) {}

/**
 * Navigates between tasks in a project.
 * 
 * @augments THREE.EventDispatcher<ProjectNavigatorEventMap>
 */
export class ProjectNavigator extends THREE.EventDispatcher {

    /**
     * The interface of the application with the server.
     * 
     * @readonly
     * @type {EditorViews}
     */
    views;

    /**
     * @type {TaskIndex}
     */
    #tasks;

    /**
     * The tasks available to the project, sorted in ascending order.
     * 
     * @type {TaskIndex}
     */
    get tasks() { return this.#tasks; }

    /**
     * The number of tasks available to the project.
     * 
     * @type {number}
     */
    get numTasks() { return this.tasks.size; }

    /**
     * @type {?TaskState}
     */
    #task;

    /**
     * The currently selected task, or `null` if none.
     * 
     * @type {?TaskState}
     */
    get task() { return this.#task; }

    set task(value) {
        if (this.#task !== value) {
            this.#task = (value != null && this.tasks.hasKeyOf(value)) ? value : null;

            this.dispatchEvent({ type: 'change' });
        }
    }

    /**
     * The unique identifier of the selected task;
     * set this property to select the corresponding task.
     * 
     * @type {?number}
     */
    get taskId() { return this.#getIdOfTask(this.task); }

    set taskId(value) { this.task = this.#getTaskFromId(value); }

    /**
     * Gets the corresponding task from its unique identifier.
     * 
     * @param {?number} taskId The query unique identifier, or `null` if none.
     * @returns {?TaskState} The requested task.
     */
    #getTaskFromId(taskId) {
        if (taskId == null) return null;

        return this.tasks.getByKey(taskId);
    }

    /**
     * Gets the unique identifier of a task.
     * 
     * @param {?TaskState} task The query task, or `null` if none.
     * @returns {?number} The requested unique identifier.
     */
    #getIdOfTask(task) {
        if (task == null) return null;

        return this.tasks.getKey(task);
    }

    /**
     * Creates a new navigator for a project with its index already loaded.
     * 
     * @param {EditorViews} views The interface of the application with the server.
     * @returns {Promise<ProjectNavigator>} A promise that resolves to the newly created
     * navigator.
     */
    static async create(views) {
        const nav = new ProjectNavigator(views);

        await nav.load();

        return nav;
    }

    /**
     * Creates a new navigator for a project.
     * 
     * @param {EditorViews} views The interface of the application with the server.
     */
    constructor(views) {
        super();

        this.views = views;

        this.#tasks = new TaskIndex();
    }

    /**
     * Loads the index of this navigator.
     */
    async load() {
        const tasks = await this.views.listTasks();

        this.#tasks = new TaskIndex(tasks);
        this.#task = this.#tasks.elements.at(0) ?? null;

        this.dispatchEvent({ type: 'change' });
    }
}
