import * as THREE from 'three';

import { ArrayMapIndex } from './ArrayMapIndex';

/**
 * @typedef {import('../../../../source/lib').SourceGroupState} SourceGroupState
 */

/**
 * @typedef {import('../views').EditorViews} EditorViews
 */

/**
 * Defines each event that can be dispatched by {@link SourcesetNavigator}.
 * 
 * @typedef {object} SourcesetNavigatorEventMap
 * @property {{}} change The event when the state of the navigator has been updated.
 */

/**
 * @augments {ArrayMapIndex<SourceGroupState, SourceGroupState>}
 */
export class SourceGroupIndex extends ArrayMapIndex {

    /**
     * Creates a new index by copying from an existing array.
     * 
     * @param {ReadonlyArray<SourceGroupState>} elements The reference array containing
     * the elements to index, from which a shallow copy is made.
     */
    constructor(elements = []) {
        super((group) => group, elements);
    }
}

/**
 * Navigates between sourcesets for a task, under a set of selectors.
 * 
 * @augments THREE.EventDispatcher<SourcesetNavigatorEventMap>
 */
export class SourcesetNavigator extends THREE.EventDispatcher {

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
     * @type {SourceGroupIndex}
     */
    #groups;

    /**
     * The groups available to the task and match the selectors.
     * 
     * @type {SourceGroupIndex}
     */
    get groups() { return this.#groups; }

    /**
     * The number of groups available to the task and match the selectors.
     * 
     * @type {number}
     */
    get numGroups() { return this.groups.size; }

    /**
     * @type {?SourceGroupState}
     */
    #group;

    /**
     * The currently selected group, or `null` if none.
     * 
     * @type {?SourceGroupState}
     */
    get group() { return this.#group; }

    set group(value) {
        if (this.#group !== value) {
            this.#group = (value != null && this.groups.hasKeyOf(value)) ? value : null;

            this.dispatchEvent({ type: 'change' });
        }
    }

    /**
     * Creates a new sourceset navigator for a task, under a set of selectors,
     * with its index already loaded.
     * 
     * @param {EditorViews} views The interface of the application with the server.
     * @param {?number} taskId The unique identifier of the task under which each group is
     * accessed.
     * @returns {Promise<SourcesetNavigator>} A promise that resolves to the newly created
     * navigator.
     */
    static async create(views, taskId) {
        const nav = new SourcesetNavigator(views);

        await nav.load(taskId);

        return nav;
    }

    /**
     * Creates a new sourcesets navigator for a task, under a set of selectors.
     * 
     * @param {EditorViews} views The interface of the application with the server.
     */
    constructor(views) {
        super();

        this.views = views;

        this.#taskId = null;
        this.#groups = new SourceGroupIndex();
    }

    /**
     * Loads the index of this navigator.
     * 
     * @param {?number} taskId The unique identifier of the task under which each group is
     * accessed.
     */
    async load(taskId) {
        const { views } = this;

        const groups = (taskId == null) ? [] : await views.getSourceGroups(taskId);

        this.#taskId = taskId;
        this.#groups = new SourceGroupIndex(groups);
        this.#group = this.#groups.elements.at(0) ?? null;

        this.dispatchEvent({ type: 'change' });
    }
}
