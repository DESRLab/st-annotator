import * as THREE from "three";

import type { Axis } from "./DraggableBase";
import { DraggableElement } from "./DraggableElement";

/**
 * Represents a vertex in a {@link TransformControls} that can be dragged to resize an object.
 */
export class DraggablePlane extends DraggableElement {
  /**
   * The plane that can be dragged.
   */
  #plane: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

  /**
   * This method is invoked whenever the state of this element is changed.
   */
  onStateChanged() {
    switch (this.state) {
      case "none":
        this.#plane.material.color.setColorName("gray");
        break;
      case "hovered":
        this.#plane.material.color.setColorName("lightgray");
        break;
      case "dragged":
        this.#plane.material.color.setColorName("white");
        break;
      default:
        throw new Error(`Invalid state: ${this.state}`);
    }
  }

  /**
   * Displays the local `x` axis.
   */
  #axisXHelper: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

  /**
   * Displays the local `y` axis.
   */
  #axisYHelper: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

  /**
   * Tests whether the helper for an axis in {@link DraggablePlane#axes} is visible.
   *
   * @param axis The axis corresponding to the helper to set.
   * @returns If `true`, the corresponding axis helper is visible; otherwise, `false`.
   */
  getIsHelperVisible(axis: Axis): boolean {
    if (!this.axes.includes(axis)) {
      throw new Error(
        `The given axis (${axis}) is not included in this element`,
      );
    }

    if (axis === this.axes[0]) return this.#axisXHelper.visible;
    if (axis === this.axes[1]) return this.#axisYHelper.visible;

    throw new Error(`The axis helper for the given axis (${axis}) is missing`);
  }

  /**
   * Sets whether the helper for an axis in {@link DraggablePlane#axes} is visible.
   *
   * @param axis The axis corresponding to the helper to set.
   * @param value If `true`, shows the corresponding axis helper; otherwise, `false`.
   */
  setIsHelperVisible(axis: Axis, value: boolean) {
    if (!this.axes.includes(axis)) {
      throw new Error(
        `The given axis (${axis}) is not included in this element`,
      );
    }

    if (axis === this.axes[0]) {
      this.#axisXHelper.visible = value;
    } else if (axis === this.axes[1]) {
      this.#axisYHelper.visible = value;
    } else {
      throw new Error(
        `The axis helper for the given axis (${axis}) is missing`,
      );
    }
  }

  /**
   * Creates a new vertex in a {@link TransformControls} that can be dragged to resize an object.
   *
   * @param axes The axes along which transformation can take place when the
   * element is clicked and dragged, in terms of the model space of the object being transformed.
   * @param draggableAxes The axes along which this element can be dragged,
   * in terms of the model space of the object being transformed.
   * @param position The coordinates of the plane in model space, where the set
   * of controls has unit dimensions.
   */
  constructor(
    axes: readonly Axis[],
    draggableAxes: readonly Axis[],
    position: THREE.Vector3,
  ) {
    super(axes, draggableAxes, position);

    const planeMaterial = new THREE.MeshBasicMaterial({
      color: "gray",
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide,
    });
    this.#plane = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 0.001),
      planeMaterial,
    );
    this.add(this.#plane);

    const axisMaterial = new THREE.MeshBasicMaterial({
      color: "yellow",
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide,
    });
    this.#axisXHelper = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.05, 0.001),
      axisMaterial,
    );
    this.#axisYHelper = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 1, 0.001),
      axisMaterial,
    );
    this.add(this.#axisXHelper, this.#axisYHelper);
  }

  /**
   * Gets the closest axis in {@link DraggablePlane#axes} to the pointer.
   *
   * @param raycaster A raycaster that has already been calibrated to match the
   * current position of the pointer.
   * @returns The requested axis.
   */
  getClosestModelAxis(raycaster: THREE.Raycaster): Axis {
    const pointerWorldPos = this.getPointerWorldPos(raycaster);
    const worldToLocal = this.matrixWorld.clone().invert();
    const pointerLocalPos = pointerWorldPos.clone().applyMatrix4(worldToLocal);

    const [localX, localY] = this.axes;
    return Math.abs(pointerLocalPos.x) >= Math.abs(pointerLocalPos.y)
      ? localX
      : localY;
  }

  /**
   * Performs raycasting against this object.
   *
   * @param raycaster The caster of the ray.
   * @returns Refer to the `raycast` method of {@link THREE.Object3D}.
   */
  raycast(raycaster: THREE.Raycaster): THREE.Intersection[] {
    if (!this.visible) return [];

    const intersects = raycaster.intersectObject(this.#plane, false);

    if (intersects.length > 0) {
      intersects[0].object = this;
    }

    return intersects;
  }
}
