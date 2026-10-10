import * as THREE from "three";

import { MathUtils, ThreeUtils } from "sta/common";

import type { ScenePointerEvent } from "../display/SceneWindow.tsx";
import { SceneObjectsGroup } from "../tools/SceneObjects";
import { DragController } from "../tools/ScenePointer";

import type { Axis, DraggableBase } from "./DraggableBase";

/**
 * Defines each event that can be dispatched by {@link Controls}.
 */
export type ControlsEventMap = THREE.Object3DEventMap & {
  mouseDown: {};
  mouseUp: {};
  objectChange: {};
};

/**
 * Used to perform a type of transformation on `three.js` objects.
 */
export class Controls extends THREE.Object3D<ControlsEventMap> {
  /**
   * Contains the elements which can be dragged to apply the transformation.
   *
   * @protected
   */
  readonly draggableGroup: SceneObjectsGroup<DraggableBase>;

  /**
   * Interacts with the draggable elements in the scene.
   *
   * @protected
   */
  readonly elementDragger: DragController<DraggableBase>;

  /**
   * Raycasts the pointer to the rendered scene.
   */
  get raycaster(): THREE.Raycaster {
    return this.elementDragger.raycaster;
  }

  /**
   * Whether or not the set of controls is enabled.
   *
   * If the set of controls is disabled, it remains visible but cannot be interacted with.
   */
  #enabled = true;

  get enabled(): boolean {
    return this.#enabled;
  }

  set enabled(value: boolean) {
    if (this.enabled !== value) {
      this.#enabled = value;
    }
  }

  /**
   * Whether or not the `x`-axis helper should be visible. Default is `true`.
   */
  #showX = true;

  get showX(): boolean {
    return this.#showX;
  }

  set showX(value: boolean) {
    if (this.showX !== value) {
      this.#showX = value;

      this.updateVisibility();
    }
  }

  /**
   * Whether or not the `y`-axis helper should be visible. Default is `true`.
   */
  #showY = true;

  get showY(): boolean {
    return this.#showY;
  }

  set showY(value: boolean) {
    if (this.showY !== value) {
      this.#showY = value;

      this.updateVisibility();
    }
  }

  /**
   * Whether or not the `z`-axis helper should be visible. Default is `true`.
   */
  #showZ = true;

  get showZ(): boolean {
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
  isAxisVisible(axis: Axis): boolean {
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
  updateVisibility(): this {
    for (const element of this.draggableGroup.objects) {
      element.visible = element.axes.every((axis: Axis) =>
        this.isAxisVisible(axis),
      );
    }

    return this;
  }

  /**
   * The 3D object being controlled.
   */
  #object: THREE.Object3D | null = null;

  get object(): THREE.Object3D | null {
    return this.#object;
  }

  set object(value: THREE.Object3D | null) {
    if (this.object !== value) {
      this.#object = value;

      this.elementDragger.draggedObj = null;
    }
  }

  /**
   * The draggable element that is being hovered over.
   */
  get hoveredElement(): DraggableBase | null {
    const hoveredObj = this.elementDragger.hoveredObj;
    if (hoveredObj == null || !this.draggableGroup.has(hoveredObj)) return null;

    return hoveredObj;
  }

  /**
   * The draggable element that is being dragged.
   */
  get draggedElement(): DraggableBase | null {
    const draggedObj = this.elementDragger.draggedObj;
    if (draggedObj == null || !this.draggableGroup.has(draggedObj)) return null;

    return draggedObj;
  }

  /**
   * The position of the pointer in model space when the element being dragged was clicked.
   */
  #initPointerLocalPos: THREE.Vector3 | null = null;

  #initObjectState: THREE.Object3D | null = null;

  /**
   * The state of the 3D object being controlled in world space when it was first clicked.
   */
  get initObjectState(): THREE.Object3D | null {
    return this.#initObjectState;
  }

  /**
   * Whether or not dragging is currently performed.
   */
  get dragging(): boolean {
    return (
      this.object != null &&
      this.draggedElement != null &&
      this.#initPointerLocalPos != null &&
      this.#initObjectState != null
    );
  }

  /**
   * The axis or plane along which the transformation is taking place, or `null` if the
   * set of controls is not being used.
   */
  get axis_or_plane(): readonly Axis[] | null {
    return this.dragging ? (this.draggedElement?.axes ?? null) : null;
  }

  /**
   * The difference between the size of the set of controls and that of the 3D object being
   * controlled. The size is defined as the element-wise absolute value of the scale.
   */
  get sizeOffset(): THREE.Vector3 {
    return new THREE.Vector3();
  }

  /**
   * The difference between the scale of the set of controls and that of the 3D object being
   * controlled.
   */
  get scaleOffset(): THREE.Vector3 {
    const { scale, sizeOffset } = this;
    const s1 = MathUtils.sign1;

    return new THREE.Vector3(s1(scale.x), s1(scale.y), s1(scale.z)).multiply(
      sizeOffset,
    );
  }

  #onPickerDragStart = (event: { object: DraggableBase }) => {
    if (this.object == null) return;

    const draggedElement = event.object;
    if (!this.draggableGroup.has(draggedElement)) return;

    this.setInitState(draggedElement);

    this.dispatchEvent({ type: "mouseDown" });
  };

  #onPickerDragEnd = (event: { object: DraggableBase }) => {
    if (this.object == null) return;

    const draggedElement = event.object;
    if (!this.draggableGroup.has(draggedElement)) return;

    this.unsetInitState();

    this.dispatchEvent({ type: "mouseUp" });
  };

  #onPointerMove = (_event: ScenePointerEvent) => {
    this.updateState();
  };

  /**
   * Creates a group that can be passed into {@link Controls#constructor}.
   *
   * @param draggableElements The elements which can be dragged to
   * apply the transformation.
   * @returns A group that contains the given elements.
   */
  static createGroup(
    draggableElements: Iterable<DraggableBase>,
  ): SceneObjectsGroup<DraggableBase> {
    return new SceneObjectsGroup({
      objects: draggableElements,
      // This is a dummy function that gets overwritten when the
      // set of controls is constructed
      raycastFunc: (
        obj: DraggableBase,
        raycaster: THREE.Raycaster,
      ): THREE.Intersection[] => obj.raycast(raycaster),
    });
  }

  /**
   * Creates a new set of controls to perform a type of transformation.
   *
   * @param draggableGroup Contains the elements which
   * can be dragged to apply the transformation.
   * @param elementDragger Drags the elements in `draggableGroup`.
   * @param visualElements The elements that cannot be dragged
   * but are displayed alongside the draggable ones.
   */
  constructor(
    draggableGroup: SceneObjectsGroup<DraggableBase>,
    elementDragger: DragController<DraggableBase>,
    visualElements: Iterable<THREE.Object3D> = [],
  ) {
    super();

    this.visible = false;
    this.add(...draggableGroup.objects, ...visualElements);

    this.draggableGroup = draggableGroup;
    this.draggableGroup.raycastFunc = (
      obj: DraggableBase,
      raycaster: THREE.Raycaster,
    ) => (this.visible && this.enabled ? obj.raycast(raycaster) : []);

    this.elementDragger = elementDragger;
    this.elementDragger.addEventListener("dragin", this.#onPickerDragStart);
    this.elementDragger.addEventListener("dragout", this.#onPickerDragEnd);
    this.elementDragger.addEventListener("pointermove", this.#onPointerMove);
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose() {
    this.elementDragger.removeEventListener("dragin", this.#onPickerDragStart);
    this.elementDragger.removeEventListener("dragout", this.#onPickerDragEnd);
    this.elementDragger.removeEventListener("pointermove", this.#onPointerMove);
    this.elementDragger.dispose();

    // Transform controls construct and own their render resources. three.js
    // does not release these automatically when objects leave the scene.
    this.traverse((object) => {
      const renderObject = object as THREE.Object3D & {
        geometry?: THREE.BufferGeometry;
        material?: THREE.Material | THREE.Material[];
      };
      renderObject.geometry?.dispose();
      const materials = Array.isArray(renderObject.material)
        ? renderObject.material
        : renderObject.material == null
          ? []
          : [renderObject.material];
      for (const material of materials) material.dispose();
    });
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
  setInitState(element: DraggableBase): this {
    if (this.object == null) return this;

    const raycaster = this.raycaster;
    const initPointerWorldPos = element.getPointerWorldPos(raycaster);
    const worldToLocal = this.matrixWorld.clone().invert();

    this.#initPointerLocalPos = initPointerWorldPos.applyMatrix4(worldToLocal);
    this.#initObjectState = this.object.clone();

    return this;
  }

  /**
   * Unets the state when the element being dragged was clicked.
   *
   * @protected
   * @returns This object.
   */
  unsetInitState(): this {
    this.#initPointerLocalPos = null;
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
  updateState(): this {
    if (!this.enabled) return this;

    const { object, draggedElement, hoveredElement } = this;

    if (
      object != null &&
      draggedElement != null &&
      this.#initPointerLocalPos != null &&
      this.#initObjectState != null
    ) {
      // this.dragging
      const nextPointerWorldPos = draggedElement.getPointerWorldPos(
        this.raycaster,
      );

      const worldToLocal = this.matrixWorld.clone().invert();

      const initPointerLocalPos = this.#initPointerLocalPos;
      const nextPointerLocalPos = nextPointerWorldPos
        .clone()
        .applyMatrix4(worldToLocal);

      // Update transformation matrix
      this.adjustMatrix(initPointerLocalPos, nextPointerLocalPos);

      object.position.copy(this.position);
      object.rotation.copy(this.rotation);
      object.scale.copy(this.scale.clone().sub(this.scaleOffset));
      object.updateMatrixWorld();

      // Make the gizmo selectable regardless of scale
      const minScale = Math.min(...object.scale.toArray());
      ThreeUtils.setRaycasterPointsThreshold(this.raycaster, minScale * 0.1);

      this.dispatchEvent({ type: "objectChange" });
    }

    for (const element of this.draggableGroup.objects) {
      if (element === draggedElement) {
        element.state = "dragged";
      } else if (element === hoveredElement) {
        element.state = "hovered";
      } else {
        element.state = "none";
      }
    }

    return this;
  }

  /**
   * Updates the transform according to the position of the pointer.
   *
   * @protected
   * @param initPointerLocalPos The position of the pointer in model space when
   * the element was clicked.
   * @param nextPointerLocalPos The current position of the pointer in model
   * space.
   */
  adjustMatrix(
    initPointerLocalPos: THREE.Vector3,
    nextPointerLocalPos: THREE.Vector3,
  ) {
    throw new Error("Not implemented");
  }

  /**
   * Updates the transform to match that of the current object being transformed.
   *
   * @returns This object.
   */
  syncMatrix(): this {
    const object = this.object;
    if (object == null) return this;

    this.position.copy(object.position);
    this.rotation.copy(object.rotation);

    // Set scale first before adding offset since its sign is based on the scale
    // of this object rather than that of the transformed object
    this.scale.copy(object.scale).add(this.scaleOffset);

    this.updateMatrixWorld();

    return this;
  }

  /**
   * Sets the 3D object that should be transformed and ensures the controls UI is visible.
   *
   * @param object The 3D object that should be transformed.
   * @returns This object.
   */
  attach(object: THREE.Object3D): this {
    this.object = object;

    this.syncMatrix();

    this.updateVisibility();
    this.visible = true;

    return this;
  }

  /**
   * Removes the current 3D object from the controls and ensures the helper UI is invisible.
   *
   * @returns This object.
   */
  detach(): this {
    this.object = null;
    this.visible = false;

    return this;
  }
}
