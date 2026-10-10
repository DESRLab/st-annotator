export { SceneObjectsGroup } from "./SceneObjects";
export type {
  GroupItem,
  GroupItems,
  RaycastFunction,
  SceneObjectsGroupEventMap,
  SceneObjectsGroupParams,
  SceneObjectsGroups,
  SceneObjectsGroupsEventMap,
} from "./SceneObjects";
export {
  InteractController,
  WindowPointer,
  DragController,
  SelectController,
  HoverController,
} from "./ScenePointer";
export type {
  DragControllerEventMap,
  HoverControllerEventMap,
  InteractControllerEventMap,
  InteractorParams,
  SelectControllerEventMap,
  _DragEventMap,
  _HoverEventMap,
  _InteractChangeEventMap,
  _SelectEventMap,
} from "./ScenePointer";

export { Clipboard } from "./Clipboard.tsx";
export { ClipboardToolView } from "./Clipboard.react.tsx";
export type { ClipboardSource } from "./Clipboard.react.tsx";
export type {
  ClipboardEventMap,
  ClipboardImpl,
  ClipboardViewState,
} from "./Clipboard.tsx";

import type {
  SelectController,
  SelectControllerEventMap,
} from "./ScenePointer";

/** Alias for {@link SelectController}. */
export type Selector<T> = SelectController<T>;
/** Alias for {@link SelectControllerEventMap}. */
export type SelectorEventMap<T> = SelectControllerEventMap<T>;
