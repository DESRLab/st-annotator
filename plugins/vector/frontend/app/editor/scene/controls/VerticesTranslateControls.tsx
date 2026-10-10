import * as THREE from "three";

import type { WindowPointer } from "sta/app/editor";
import { ThreeUtils } from "sta/common";

import { Controls } from "./Controls";
import { DraggablePlane } from "./DraggablePlane";

/**
 * Used to perform translation of `three.js` objects along two axes.
 */
export class VerticesTranslateControls extends Controls<DraggablePlane> {
  /**
   * Creates the elements pf this set of cpntrols.
   *
   * @param vectorCoords The vertices of vector object
   * in threejs coordinates system.
   * @returns The requested elemetns.
   */
  static createElements(vectorCoords: readonly THREE.Vector3[]) {
    const draggableElements: DraggablePlane[] = [];

    const { min, max } = ThreeUtils.findMinMax(vectorCoords);
    const minCoords = min.clone();
    const maxCoords = max.clone();

    const width = maxCoords.clone().x - minCoords.clone().x;
    const height = maxCoords.clone().z - minCoords.clone().z;

    const centerCoords = maxCoords
      .clone()
      .add(minCoords.clone())
      .divideScalar(2);

    const draggablePlane = new DraggablePlane(
      ["X", "Z"],
      ["X", "Z"],
      centerCoords,
      height,
      width,
    );
    draggableElements.push(draggablePlane);

    return draggableElements;
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
    super(pointer, raycaster, priority);
  }

  /**
   * Applies the transform according to the position of the pointer.
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
    const { object, draggedElement, initObjectState } = this;

    if (draggedElement == null || object == null || initObjectState == null)
      return;

    const newPos = nextPointerWorldPos.clone();
    if (!this.isAxisVisible("X")) newPos.x = 0;
    if (!this.isAxisVisible("Y")) newPos.y = 0;
    if (!this.isAxisVisible("Z")) newPos.z = 0;

    draggedElement.position.copy(newPos);

    const deltaWorld = nextPointerWorldPos.clone().sub(initPointerWorldPos);

    if (!this.isAxisVisible("X")) deltaWorld.x = 0;
    if (!this.isAxisVisible("Y")) deltaWorld.y = 0;
    if (!this.isAxisVisible("Z")) deltaWorld.z = 0;

    const oldCoords = initObjectState.vectorCoords;
    const newCoords: THREE.Vector3[] = [];

    for (const vertex of oldCoords) {
      newCoords.push(vertex.clone().add(deltaWorld));
    }

    const obj3D = object.geo;
    obj3D.geometry.setFromPoints(newCoords);
    obj3D.geometry.getAttribute("position").needsUpdate = true;

    object.vectorCoords = newCoords;
  }

  /**
   * Updates the draggable elements to transform the vector object.
   *
   * @protected
   * @returns The updated element dragger.
   */
  createDraggables() {
    const object = this.object;
    if (object == null) {
      throw Error("No Object has been selected to create draggables");
    }

    return VerticesTranslateControls.createElements(object.vectorCoords);
  }
}
