import * as THREE from "three";

import type { Axis } from "./DraggableBase";
import { DraggableElement } from "./DraggableElement";

/**
 * Represents a vertex in a {@link TransformControls} that can be dragged to resize an object.
 */
export class DraggableVertex extends DraggableElement {
  /**
   * The vertex that can be dragged.
   */
  readonly #points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;

  /**
   * This method is invoked whenever the state of this element is changed.
   */
  onStateChanged() {
    switch (this.state) {
      case "none":
        this.#points.material.color.setColorName("gray");
        break;
      case "hovered":
        this.#points.material.color.setColorName("lightgray");
        break;
      case "dragged":
        this.#points.material.color.setColorName("white");
        break;
      default:
        throw new Error(`Invalid state: ${this.state}`);
    }
  }

  /**
   * Creates a new vertex in a {@link TransformControls} that can be dragged to resize an object.
   *
   * @param axes The axes along which transformation can take place when the
   * element is clicked and dragged, in terms of the model space of the object being transformed.
   * @param draggableAxes The axes along which this element can be dragged,
   * in terms of the model space of the object being transformed.
   * @param position The coordinates of the vertex in model space, where the set
   * of controls has unit dimensions.
   */
  constructor(
    axes: readonly Axis[],
    draggableAxes: readonly Axis[],
    position: THREE.Vector3,
  ) {
    super(axes, draggableAxes, position);

    const pointsBuffer = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
    ]);
    const pointsMaterial = new THREE.PointsMaterial({
      color: "gray",
      size: 10,
      sizeAttenuation: false,
    });
    const points = new THREE.Points(pointsBuffer, pointsMaterial);
    this.#points = points;
    this.add(points);
  }

  /**
   * Performs raycasting against this object.
   *
   * @param raycaster The caster of the ray.
   * @returns Refer to the `raycast` method of {@link THREE.Object3D}.
   */
  raycast(raycaster: THREE.Raycaster): THREE.Intersection[] {
    if (!this.visible) return [];

    const intersects = raycaster.intersectObject(this.#points, false);

    if (intersects.length > 0) {
      intersects[0].object = this;
    }

    return intersects;
  }
}
