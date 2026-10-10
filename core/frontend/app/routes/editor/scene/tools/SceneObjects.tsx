import * as THREE from "three";
import BiMap from "ts-bidirectional-map";
import * as Collections from "typescript-collections";

import { CollectionUtils } from "sta/common";

/**
 * Defines each event that can be dispatched by {@link SceneObjectsGroup}.
 */
export interface SceneObjectsGroupEventMap {
  change: {};
}

export type RaycastFunction<T> = (
  obj: T,
  raycaster: THREE.Raycaster,
) => THREE.Intersection[];

export interface SceneObjectsGroupParams<T> {
  objects: Iterable<T>;
  raycastFunc: RaycastFunction<T>;
}

/**
 * Represents a collection of objects that can be interacted with.
 */
export class SceneObjectsGroup<
  T,
> extends THREE.EventDispatcher<SceneObjectsGroupEventMap> {
  #objects: Iterable<T>;

  /** Contains the objects to interact with. */
  get objects(): Iterable<T> {
    return this.#objects;
  }

  set objects(value: Iterable<T>) {
    if (this.#objects !== value) {
      this.#objects = value;

      this.dispatchEvent({ type: "change" });
    }
  }

  #raycastFunc: RaycastFunction<T>;

  /**
   * A function which returns the intersection data between the given object and ray.
   *
   * The results are sorted from closest to furthest.
   */
  get raycastFunc(): RaycastFunction<T> {
    return this.#raycastFunc;
  }

  set raycastFunc(value: RaycastFunction<T>) {
    if (this.#raycastFunc !== value) {
      this.#raycastFunc = value;

      this.dispatchEvent({ type: "change" });
    }
  }

  /** Creates a new collection of objects that can be interacted with. */
  constructor(params: SceneObjectsGroupParams<T>) {
    super();

    this.#objects = params.objects;
    this.#raycastFunc = params.raycastFunc;
  }

  /** Tests whether an object exists in this group. */
  has(object: T): boolean {
    return CollectionUtils.some(this.objects, (obj: T) => obj === object);
  }

  /**
   * Performs raycasting against this group.
   *
   * @returns The raycasted object, if any.
   */
  raycast(raycaster: THREE.Raycaster): T | null {
    const { objects, raycastFunc } = this;

    let raycastedObj: T | null = null;
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
 * Defines each event that can be dispatched by {@link SceneObjectsGroups}.
 */
export interface SceneObjectsGroupsEventMap {
  change: {};
}

export interface GroupItem<T> {
  group: SceneObjectsGroup<T>;
  priority: number;
}

export type GroupItems<T> = readonly GroupItem<T>[];

/**
 * Represents a collection of {@link SceneObjectsGroup}s.
 *
 * Note that each item should have a unique priority.
 */
export class SceneObjectsGroups<
  T,
> extends THREE.EventDispatcher<SceneObjectsGroupsEventMap> {
  #groups = new BiMap<number, SceneObjectsGroup<T>>();

  #priorities: Collections.BSTree<number> = new Collections.BSTree<number>(
    (a: number, b: number) => Collections.util.defaultCompare(-a, -b),
  );

  /** Tests whether there exists a group of objects with the given priority. */
  hasPriority(priority: number): boolean {
    return this.#groups.has(priority);
  }

  /** Gets the group with a given priority. */
  getGroupByPriority(priority: number): SceneObjectsGroup<T> | undefined {
    return this.#groups.get(priority);
  }

  /** Tests whether a given group of objects can be interacted with by this pointer. */
  hasGroup(group: SceneObjectsGroup<T>): boolean {
    return this.#groups.hasValue(group);
  }

  /** Gets the priority assigned to a group. */
  getPriorityOfGroup(group: SceneObjectsGroup<T>): number | undefined {
    return this.#groups.getKey(group);
  }

  /**
   * Adds a group of objects so that it can be interacted with by this pointer.
   *
   * @throws {Error} If there is already a group with the same priority.
   */
  addGroup(group: SceneObjectsGroup<T>, priority: number): void {
    if (this.hasPriority(priority)) {
      throw new Error(
        `There is already a group with the given priority (${priority})`,
      );
    }

    this.#groups.set(priority, group);
    this.#priorities.add(priority);

    group.addEventListener("change", this.#onGroupUpdate);
    this.#onGroupUpdate();
  }

  /**
   * Removes a group of objects so that it can no longer be interacted with by this pointer.
   *
   * @throws {Error} If there is no such group.
   */
  removeGroup(group: SceneObjectsGroup<T>): void {
    const priority = this.getPriorityOfGroup(group);
    if (priority === undefined) {
      throw new Error(
        `There is no group with the given priority (${priority})`,
      );
    }

    this.#groups.deleteValue(group);
    this.#priorities.remove(priority);

    group.removeEventListener("change", this.#onGroupUpdate);
    this.#onGroupUpdate();
  }

  /** Iterates through each group in descending order of priority. */
  *iterGroups(): Generator<SceneObjectsGroup<T>> {
    for (const priority of this.#priorities.toArray()) {
      const group = this.getGroupByPriority(priority);
      if (group !== undefined) yield group;
    }
  }

  #onGroupUpdate = (): void => {
    this.dispatchEvent({ type: "change" });
  };

  /**
   * Creates a new collection of {@link SceneObjectsGroup}s.
   */
  constructor(items: GroupItems<T> = []) {
    super();

    for (const { group, priority } of items) {
      this.addGroup(group, priority);
    }
  }

  /** Disposes of this object. Do not use it afterwards. */
  dispose(): void {
    for (const group of [...this.#groups.values()]) {
      this.removeGroup(group);
    }
  }

  /** Tests whether an object exists in this collection of groups. */
  has(object: T): boolean {
    return CollectionUtils.some(this.iterGroups(), (g: SceneObjectsGroup<T>) =>
      g.has(object),
    );
  }
}
