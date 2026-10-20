import * as THREE from "three";

import { DraggableElement } from "sta/app/editor";
import type { Axis } from "sta/app/editor";

/** A planar drag target for the vector's existing centroid marker. */
export class DraggablePlane extends DraggableElement {
  // Picking geometry only: the label already renders the centroid point.
  readonly #target: THREE.Points;

  readonly #plane: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  onStateChanged() {
    this.#plane.material.color.setColorName(
      this.state === "dragged"
        ? "white"
        : this.state === "hovered"
          ? "lightgray"
          : "gray",
    );
  }

  constructor(
    axes: readonly Axis[],
    draggableAxes: readonly Axis[],
    position: THREE.Vector3,
    height = 1,
    width = 1,
  ) {
    super(axes, draggableAxes, position);
    this.#target = new THREE.Points(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3()]),
      new THREE.PointsMaterial({ visible: false }),
    );
    this.#plane = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({
        color: "gray",
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide,
      }),
    );
    this.add(this.#plane, this.#target);
  }

  raycast(raycaster: THREE.Raycaster): THREE.Intersection[] {
    if (!this.visible) return [];
    const intersects = raycaster.intersectObjects(
      [this.#plane, this.#target],
      false,
    );
    for (const intersection of intersects) intersection.object = this;
    return intersects;
  }
}
