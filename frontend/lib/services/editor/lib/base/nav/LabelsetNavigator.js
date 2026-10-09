import * as THREE from 'three';

import { EditableBranch } from '../labelset';
import { ArrayMapIndex } from './ArrayMapIndex';

/**
 * @typedef {import('../views').EditorViews} EditorViews
 */

/**
 * Defines each event that can be dispatched by {@link LabelsetNavigator}.
 * 
 * @typedef {object} LabelsetNavigatorEventMap
 * @property {{}} change The event when the state of the navigator has been updated.
 */

/**
 * @augments {ArrayMapIndex<EditableBranch, EditableBranch>}
 */
export class LabelsetBranchIndex extends ArrayMapIndex {

    /**
     * Creates a new index by copying from an existing array.
     * 
     * @param {ReadonlyArray<EditableBranch>} elements The reference array containing
     * the elements to index, from which a shallow copy is made.
     */
    constructor(elements = []) {
        super((branch) => branch, elements);
    }
}

/**
 * Navigates between labelsets for a task, under a set of selectors.
 * 
 * @augments THREE.EventDispatcher<LabelsetNavigatorEventMap>
 */
export class LabelsetNavigator extends THREE.EventDispatcher {

    /**
     * The interface of the application with the server.
     * 
     * @readonly
     * @type {EditorViews}
     */
    views;

    /**
     * @type {?number}
     */
    #taskId;

    /**
     * The unique identifier of the currently active task.
     * 
     * @type {?number}
     */
    get taskId() { return this.#taskId; }

    /**
     * Enables storing the history of each branch even when a different task is loaded.
     * 
     * @type {Map<number, EditableBranch>}
     */
    #loadedBranches;

    /**
     * @type {LabelsetBranchIndex}
     */
    #branches;

    /**
     * The branches available to the task and match the selectors.
     * 
     * @type {LabelsetBranchIndex}
     */
    get branches() { return this.#branches; }

    /**
     * The number of branches available to the task and match the selectors.
     * 
     * @type {number}
     */
    get numBranches() { return this.branches.size; }

    /**
     * `true` if any branch has unsaved changes; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get hasUnsavedChanges() {
        return this.branches.elements.some((labelset) => labelset.hasUnsavedChanges);
    }

    /**
     * @type {?EditableBranch}
     */
    #branch;

    /**
     * The currently selected branch, or `null` if none.
     * 
     * @type {?EditableBranch}
     */
    get branch() { return this.#branch; }

    set branch(value) {
        if (this.#branch !== value) {
            this.#branch = (value != null && this.branches.hasKeyOf(value)) ? value : null;

            this.dispatchEvent({ type: 'change' });
        }
    }

    /**
     * Creates a new labelset navigator for a task, under a set of selectors,
     * with its index already loaded.
     * 
     * @param {EditorViews} views The interface of the application with the server.
     * @param {?number} taskId The unique identifier of the task under which each branch is
     * accessed.
     * @returns {Promise<LabelsetNavigator>} A promise that resolves to the newly created
     * navigator.
     */
    static async create(views, taskId) {
        const nav = new LabelsetNavigator(views);

        await nav.load(taskId);

        return nav;
    }

    /**
     * Creates a new labelsets navigator for a task, under a set of selectors.
     * 
     * @param {EditorViews} views The interface of the application with the server.
     */
    constructor(views) {
        super();

        this.views = views;

        this.#taskId = null;
        this.#loadedBranches = new Map();
        this.#branches = new LabelsetBranchIndex();
    }

    /**
     * Loads the index of this navigator.
     * 
     * @param {?number} taskId The unique identifier of the task under which each branch is
     * accessed.
     */
    async load(taskId) {
        const { views } = this;

        const rawBranches = (taskId == null) ? [] : await views.getLabelBranches(taskId);
        const branches = await Promise.all(rawBranches.map(async (data) => {
            let branch = this.#loadedBranches.get(data.id);
            if (branch != null) return branch;

            branch = await EditableBranch.create(views, data);
            this.#loadedBranches.set(data.id, branch);

            return branch;
        }));

        this.#taskId = taskId;
        this.#branches = new LabelsetBranchIndex(branches);
        this.#branch = this.#branches.elements.at(0) ?? null;

        this.dispatchEvent({ type: 'change' });
    }
}
