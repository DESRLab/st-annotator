import * as THREE from 'three';
import BiMap from 'ts-bidirectional-map';
import * as Collections from 'typescript-collections';

import { CollectionUtils } from '../../../../../../common/lib/utils';

/**
 * Defines each event that can be dispatched by {@link SceneObjectsGroup}.
 * 
 * @typedef {object} SceneObjectsGroupEventMap
 * @property {{}} change The event when the state of the group has been changed.
 */

/**
 * @template T The type of object to interact with.
 * @typedef {(obj: T, raycaster: THREE.Raycaster) => THREE.Intersection[]} RaycastFunction
 */

/**
 * @template T The type of object to interact with.
 * @typedef {object} SceneObjectsGroupParams
 * @property {Iterable<T>} objects Contains the objects to interact with.
 * @property {RaycastFunction<T>} raycastFunc A function which returns the intersection data between
 * the given object and ray. The results are sorted from closest to furthest.
 */

/**
 * Represents a collection of objects that can be interacted with.
 * 
 * @template T The type of object to interact with.
 * @augments THREE.EventDispatcher<SceneObjectsGroupEventMap>
 */
export class SceneObjectsGroup extends THREE.EventDispatcher {

    /**
     * @type {Iterable<T>}
     */
    #objects;

    /**
     * Contains the objects to interact with.
     * 
     * @type {Iterable<T>}
     */
    get objects() { return this.#objects; }

    set objects(value) {
        if (this.#objects !== value) {
            this.#objects = value;

            this.dispatchEvent({ type: 'change' });
        }
    }

    /**
     * @type {RaycastFunction<T>}
     */
    #raycastFunc;

    /**
     * A function which returns the intersection data between the given object and ray.
     * 
     * The results are sorted from closest to furthest.
     * 
     * @type {RaycastFunction<T>}
     */
    get raycastFunc() { return this.#raycastFunc; }

    set raycastFunc(value) {
        if (this.#raycastFunc !== value) {
            this.#raycastFunc = value;

            this.dispatchEvent({ type: 'change' });
        }
    }

    /**
     * Creates a new collection of objects that can be interacted with.
     * 
     * @param {SceneObjectsGroupParams<T>} params The attributes of the collection.
     */
    constructor(params) {
        super();

        this.#objects = params.objects;
        this.#raycastFunc = params.raycastFunc;
    }

    /**
     * Tests whether an object exists in this group.
     * 
     * @param {T} object The query object.
     * @returns {boolean} `true` if the given object exists; otherwise, `false`.
     */
    has(object) {
        return CollectionUtils.some(this.objects, (obj) => obj === object);
    }

    /**
     * Performs raycasting against this group.
     * 
     * @param {THREE.Raycaster} raycaster The raycaster that performs raycasting.
     * @returns {?T} The raycasted object, if any.
     */
    raycast(raycaster) {
        const { objects, raycastFunc } = this;

        /**
         * @type {?T}
         */
        let raycastedObj = null;
        let minDistance = Number.POSITIVE_INFINITY;

        for (const obj of objects) {
            const intersects = raycastFunc(obj, raycaster);
            const distance = intersects.at(0)?.distance ?? Number.POSITIVE_INFINITY;

            if (distance < minDistance) {
                [raycastedObj, minDistance] = [obj, distance];
            }
        }

        return raycastedObj;
    }
}

/**
 * Defines each event that can be dispatched by {@link SceneObjectsGroup}.
 * 
 * @typedef {object} SceneObjectsGroupsEventMap
 * @property {{}} change The event when the state of the collection has been changed.
 */

/**
 * @template T The type of object to interact with.
 * @typedef {object} GroupItem
 * @property {SceneObjectsGroup<T>} group The group to add.
 * @property {number} priority A priority that is assigned to the group. Those with higher
 * priority will be considered those with lower priority.
 */

/**
 * Note that each item should have a unique priority.
 * 
 * @template T The type of object to interact with.
 * @typedef {ReadonlyArray<GroupItem<T>>} GroupItems
 */

/**
 * Represents a collection of {@link SceneObjectsGroup}s.
 * 
 * @template T The type of object to interact with.
 * @augments THREE.EventDispatcher<SceneObjectsGroupsEventMap>
 */
export class SceneObjectsGroups extends THREE.EventDispatcher {

    /**
     * @type {BiMap<number, SceneObjectsGroup<T>>}
     */
    #groups = new BiMap();

    /**
     * @type {Collections.BSTree<number>}
     */
    #priorities = new Collections.BSTree((a, b) => Collections.util.defaultCompare(-a, -b));

    /**
     * Tests whether there exists a group of objects with the given priority.
     * 
     * @param {number} priority The query priority.
     * @returns {boolean} `true` if such a group exists; otherwise, `false`.
     */
    hasPriority(priority) {
        return this.#groups.has(priority);
    }

    /**
     * Gets the group with a given priority.
     * 
     * @param {number} priority The query priority.
     * @returns {SceneObjectsGroup<T> | undefined} The group with the given priority, or
     * `undefined` if it does not exist.
     */
    getGroupByPriority(priority) {
        return this.#groups.get(priority);
    }

    /**
     * Tests whether a given group of objects can be interacted with by this pointer.
     * 
     * @param {SceneObjectsGroup<T>} group The query group.
     * @returns {boolean} `true` if the group can be interacted with; otherwise, `false`.
     */
    hasGroup(group) {
        return this.#groups.hasValue(group);
    }

    /**
     * Gets the priority assigned to a group.
     * 
     * @param {SceneObjectsGroup<T>} group The query group.
     * @returns {number | undefined} The priority value of the given group, or
     * `undefined` if it does not exist.
     */
    getPriorityOfGroup(group) {
        return this.#groups.getKey(group);
    }

    /**
     * Adds a group of objects so that it can be interacted with by this pointer.
     * 
     * @param {SceneObjectsGroup<T>} group The group to add.
     * @param {number} priority A priority that is assigned to the group. Those with higher
     * priority will be considered those with lower priority.
     * @throws {Error} If there is already a group with the same priority.
     */
    addGroup(group, priority) {
        if (this.hasPriority(priority)) {
            throw new Error(`There is already a group with the given priority (${priority})`);
        }

        this.#groups.set(priority, group);
        this.#priorities.add(priority);

        group.addEventListener('change', this.#onGroupUpdate);
        this.#onGroupUpdate();
    }

    /**
     * Removes a group of objects so that it can no longer be interacted with by this pointer.
     * 
     * @param {SceneObjectsGroup<T>} group The group to remove.
     * @throws {Error} If there is no such group.
     */
    removeGroup(group) {
        const priority = this.getPriorityOfGroup(group);
        if (priority === undefined) {
            throw new Error(`There is no group with the given priority (${priority})`);
        }

        this.#groups.deleteValue(group);
        this.#priorities.remove(priority);

        group.removeEventListener('change', this.#onGroupUpdate);
        this.#onGroupUpdate();
    }

    /**
     * Iterates through each group in descending order of priority.
     * 
     * @yields {SceneObjectsGroup<T>} Each group contained in this collection.
     */
    * iterGroups() {
        for (const priority of this.#priorities.toArray()) {
            const group = this.getGroupByPriority(priority);
            if (group !== undefined) yield group;
        }
    }

    #onGroupUpdate = () => {
        this.dispatchEvent({ type: 'change' });
    };

    /**
     * Creates a new collection of {@link SceneObjectsGroup}s.
     * 
     * @param {GroupItems<T>} items An array containing each group and its
     * corresponding priority to include in the collection.
     * A shallow copy of this array is made to this object.
     */
    constructor(items = []) {
        super();

        for (const { group, priority } of items) {
            this.addGroup(group, priority);
        }
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        for (const group of [...this.#groups.values()]) {
            this.removeGroup(group);
        }
    }

    /**
     * Tests whether an object exists in this collection of groups.
     * 
     * @param {T} object The query object.
     * @returns {boolean} `true` if the given object exists; otherwise, `false`.
     */
    has(object) {
        return CollectionUtils.some(this.iterGroups(), (g) => g.has(object));
    }
}
