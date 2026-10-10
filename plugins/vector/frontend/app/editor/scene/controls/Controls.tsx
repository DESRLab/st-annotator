import * as THREE from "three";

import {
  DragController,
  SceneObjectsGroup,
  WindowPointer,
} from "sta/app/editor";
import type { DraggableBase, Axis } from "sta/app/editor";

import { VectorGeo } from "../data/views";
import type { Line, Point } from "../data/views";

export type { Axis };

/**
 * Defines each event that can be dispatched by {@link Controls}.
 */
export interface ControlsEventMap {
  mouseDown: {};
  mouseUp: {};
  objectChange: { obj: VectorGeo<Line | Point> };
}

/**
 * Used to perform a type of transformation on `three.js` objects.
 */
export abstract class Controls<
  T extends DraggableBase = DraggableBase,
> extends THREE.Object3D<THREE.Object3DEventMap & ControlsEventMap> {
  pointer: WindowPointer;

  raycaster: THREE.Raycaster;

  priority: number;

  /**
   * The position of the pointer in model space when the element being dragged was clicked.
   */
  #initPointerWorldPos: THREE.Vector3 | null = null;

  /**
   * The state of the 3D object being controlled in world space when it was first clicked.
   */
  #initObjectState: VectorGeo<Line | Point> | null = null;

  get initObjectState() {
    return this.#initObjectState;
  }

  /**
   * Contains the elements which can be dragged to apply the transformation.
   */
  #draggableGroup: SceneObjectsGroup<T> | null = null;

  get draggableGroup() {
    return this.#draggableGroup;
  }

  set draggableGroup(value: SceneObjectsGroup<T> | null) {
    if (this.draggableGroup !== value) {
      this.clear();

      this.#draggableGroup = value;

      if (value != null) {
        this.add(...value.objects);
        value.raycastFunc = (obj: T, raycaster: THREE.Raycaster) =>
          this.visible && this.enabled ? obj.raycast(raycaster) : [];
      }
    }
  }

  /**
   * Interacts with the draggable elements in the scene.
   */
  #elementDragger: DragController<T> | null = null;

  get elementDragger() {
    return this.#elementDragger;
  }

  set elementDragger(value: DragController<T> | null) {
    if (this.elementDragger !== value) {
      const previous = this.#elementDragger;
      previous?.removeEventListener("dragin", this.#onPickerDragStart);
      previous?.removeEventListener("dragout", this.#onPickerDragEnd);
      previous?.removeEventListener("pointermove", this.#onPointerMove);
      previous?.dispose();

      this.#elementDragger = value;

      this.#elementDragger?.addEventListener("dragin", this.#onPickerDragStart);
      this.#elementDragger?.addEventListener("dragout", this.#onPickerDragEnd);
      this.#elementDragger?.addEventListener(
        "pointermove",
        this.#onPointerMove,
      );
    }
  }

  #enabled = true;

  /**
   * Whether or not the set of controls is enabled.
   *
   * If the set of controls is disabled, it remains visible but cannot be interacted with.
   */
  get enabled() {
    return this.#enabled;
  }

  set enabled(value: boolean) {
    if (this.enabled !== value) {
      this.#enabled = value;
    }
  }

  #showX = true;

  /**
   * Whether or not the `x`-axis helper should be visible. Default is `true`.
   */
  get showX() {
    return this.#showX;
  }

  set showX(value: boolean) {
    if (this.showX !== value) {
      this.#showX = value;

      this.updateVisibility();
    }
  }

  #showY = false;

  /**
   * Whether or not the `y`-axis helper should be visible. Default is `true`.
   */
  get showY() {
    return this.#showY;
  }

  set showY(value: boolean) {
    if (this.showY !== value) {
      this.#showY = value;

      this.updateVisibility();
    }
  }

  #showZ = true;

  /**
   * Whether or not the `z`-axis helper should be visible. Default is `true`.
   */
  get showZ() {
    return this.#showZ;
  }

  set showZ(value: boolean) {
    if (this.showZ !== value) {
      this.#showZ = value;

      this.updateVisibility();
    }
  }

  /**
   * Whether or not the elements along an axis are visible.
   *
   * @param axis The axis to test.
   * @returns `true` if the elements along the given axis are visible;
   * otherwise, `false`.
   */
  isAxisVisible(axis: Axis) {
    switch (axis) {
      case "X":
        return this.showX;
      case "Y":
        return this.showY;
      case "Z":
        return this.showZ;
      default:
        throw new Error(`Invalid axis: ${axis}`);
    }
  }

  /**
   * Updates the visibility of the components of the set of controls.
   *
   * @protected
   * @returns This object.
   */
  updateVisibility() {
    if (this.draggableGroup == null) return this;

    for (const element of this.draggableGroup.objects) {
      element.visible = element.axes.every((axis: Axis) =>
        this.isAxisVisible(axis),
      );
    }

    return this;
  }

  #object: VectorGeo<Line | Point> | null = null;

  /**
   * The 3D object being controlled.
   */
  get object() {
    return this.#object;
  }

  set object(value: VectorGeo<Line | Point> | null) {
    if (this.#object === value) return;
    this.#object = value;

    if (value == null) {
      this.#initObjectState = null;
      this.detach();
    } else {
      this.#initObjectState = value.clone();
      this.#setUp();
      this.attach(value.asObject3D());
    }

    if (this.elementDragger != null) {
      this.elementDragger.draggedObj = null;
    }
  }

  /**
   * Sets up the configuration of the set of controls.
   */
  #setUp() {
    const { pointer, raycaster, priority } = this;

    const draggableElements = this.createDraggables();
    const draggableGroup = Controls.createGroup(draggableElements);

    this.draggableGroup = draggableGroup;
    this.elementDragger = pointer.createDragController({
      groups: [{ group: draggableGroup, priority: priority }],
      raycaster: raycaster,
    });
  }

  /**
   * Updates the draggable elements to transform the vector object.
   *
   * @protected
   * @returns The updated element dragger.
   */
  createDraggables(): Iterable<T> {
    throw Error("Not Implemented");
  }

  /**
   * The draggable element that is being hovered over.
   */
  get hoveredElement(): T | null {
    const hoveredObj = this.elementDragger?.hoveredObj;
    if (hoveredObj == null || !this.draggableGroup?.has(hoveredObj))
      return null;

    return hoveredObj;
  }

  /**
   * The draggable element that is being dragged.
   */
  get draggedElement(): T | null {
    const draggedObj = this.elementDragger?.draggedObj;
    if (draggedObj == null || !this.draggableGroup?.has(draggedObj))
      return null;

    return draggedObj;
  }

  /**
   * Whether or not dragging is currently performed.
   */
  get dragging() {
    return this.object != null && this.draggedElement != null;
  }

  /**
   * The axis or plane along which the transformation is taking place, or `null` if the
   * set of controls is not being used.
   */
  get axis_or_plane(): readonly Axis[] | null {
    return this.dragging ? (this.draggedElement?.axes ?? null) : null;
  }

  #onPickerDragStart = (event: { object: T }) => {
    if (this.object == null) return;

    const draggedElement = event.object;
    if (!this.draggableGroup?.has(draggedElement)) return;

    this.setInitState(draggedElement);

    this.dispatchEvent({ type: "mouseDown" });
  };

  #onPickerDragEnd = (event: { object: T }) => {
    if (this.object == null) return;

    const draggedElement = event.object;
    if (!this.draggableGroup?.has(draggedElement)) return;

    this.unsetInitState();

    this.dispatchEvent({ type: "mouseUp" });
  };

  #onPointerMove = () => {
    this.updateState();
  };

  /**
   * Creates a new group that can be passed into {@link Controls#constructor}.
   *
   * @param draggableElements The elements which can be dragged to
   * apply the transformation.
   * @returns A group that contains the given elements.
   */
  static createGroup<D extends DraggableBase>(draggableElements: Iterable<D>) {
    return new SceneObjectsGroup({
      objects: draggableElements,
      // This is a dummy function that gets overwritten when the
      // set of controls is constructed
      raycastFunc: (obj: D, raycaster: THREE.Raycaster) =>
        obj.raycast(raycaster),
    });
  }

  /**
   * Creates a new object transformer.
   *
   * @param pointer The pointer that interacts with the set of controls.
   * @param raycaster Raycasts the pointer to the set of controls.
   * @param priority The priority of the set of controls.
   */
  constructor(
    pointer: WindowPointer,
    raycaster: THREE.Raycaster,
    priority: number,
  ) {
    super();

    this.pointer = pointer;
    this.raycaster = raycaster;
    this.priority = priority;
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose() {
    this.elementDragger = null;
  }

  /**
   * Sets the state when the element being dragged was clicked.
   *
   * This is a no-op if no object is being transformed.
   *
   * @protected
   * @param element The element being dragged.
   * @returns This object.
   */
  setInitState(element: T) {
    if (this.object == null) return this;

    const raycaster = this.raycaster;
    this.#initPointerWorldPos = element.getPointerWorldPos(raycaster);
    this.#initObjectState = this.object.clone();

    return this;
  }

  /**
   * Unets the state when the element being dragged was clicked.
   *
   * @protected
   * @returns This object.
   */
  unsetInitState() {
    this.#initPointerWorldPos = null;
    this.#initObjectState = null;

    return this;
  }

  /**
   * Updates the state of the set of controls as well as the object being transformed.
   *
   * This is a no-op if the set of controls is disabled.
   *
   * @protected
   * @returns This object.
   */
  updateState() {
    if (!this.enabled) return this;

    const { object, draggedElement, hoveredElement, draggableGroup } = this;

    if (
      object != null &&
      draggedElement != null &&
      this.#initPointerWorldPos != null &&
      draggableGroup != null
    ) {
      const nextPointerWorldPos = draggedElement.getPointerWorldPos(
        this.raycaster,
      );
      const initPointerWorldPos = this.#initPointerWorldPos.clone();
      this.applyTransform(initPointerWorldPos, nextPointerWorldPos);

      this.dispatchEvent({ type: "objectChange", obj: object });

      for (const element of draggableGroup.objects) {
        if (element === draggedElement) {
          element.state = "dragged";
        } else if (element === hoveredElement) {
          element.state = "hovered";
        } else {
          element.state = "none";
        }
      }
    }
    return this;
  }

  /**
   * Sets the transform according to the position of the pointer.
   *
   * @protected
   * @param initPointerWorldPos The position of the pointer in model space when
   * the element was clicked.
   * @param nextPointerWorldPos The current position of the pointer in model
   * space.
   */
  applyTransform(
    initPointerWorldPos: THREE.Vector3,
    nextPointerWorldPos: THREE.Vector3,
  ) {
    throw new Error("Not implemented");
  }

  /**
   * Sets the 3D object that should be transformed and ensures the controls UI is visible.
   *
   * @param object The 3D object that should be transformed.
   * @returns This object.
   */
  attach(object: THREE.Object3D) {
    this.updateVisibility();
    this.visible = true;

    return this;
  }

  /**
   * Removes the current 3D object from the controls and ensures the helper UI is invisible.
   *
   * @returns This object.
   */
  detach() {
    this.visible = false;

    return this;
  }
}
