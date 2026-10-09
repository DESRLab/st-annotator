/**
 * @typedef {import('./SceneObjects').SceneObjectsGroupEventMap} SceneObjectsGroupEventMap
 */

/**
 * @typedef {import('./SceneObjects').SceneObjectsGroupsEventMap} SceneObjectsGroupsEventMap
 */

/**
 * @template T The type of object to interact with.
 * @typedef {import('./SceneObjects').SceneObjectsGroups<T>} SceneObjectsGroups
 */

/**
 * @template T The type of object to interact with.
 * @typedef {import('./SceneObjects').GroupItems<T>} GroupItems
 */

/**
 * @typedef {import('./ScenePointer').InteractControllerEventMap} InteractControllerEventMap
 */

/**
 * @template T The type of object to hover over.
 * @typedef {import('./ScenePointer').HoverController<T>} Hoverer
 */

/**
 * @template T The type of object to hover over.
 * @typedef {import('./ScenePointer').HoverControllerEventMap<T>} HoverControllerEventMap
 */

/**
 * @template T he type of object to select.
 * @typedef {import('./ScenePointer').SelectController<T>} Selector
 */

/**
 * @template T he type of object to select.
 * @typedef {import('./ScenePointer').SelectControllerEventMap<T>} SelectorEventMap
 */

/**
 * @template T he type of object to drag.
 * @typedef {import('./ScenePointer').DragController<T>} Dragger
 */

/**
 * @template T The type of object to drag.
 * @typedef {import('./ScenePointer').DragControllerEventMap<T>} DraggerEventMap
 */

/**
 * @template T The type of object to interact with.
 * @typedef {import('./ScenePointer').InteractorParams<T>} InteractorParams
 */

export { SceneObjectsGroup } from './SceneObjects';
export { InteractController, WindowPointer } from './ScenePointer';
