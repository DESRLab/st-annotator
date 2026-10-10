import * as THREE from "three";

import { DraggableElement } from "sta/app/editor";
import type { Axis } from "sta/app/editor";

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
   * Creates a new vertex in a {@link TransformControls} that can be dragged to resize an object.
   *
   * @param axes The axes along which transformation can take place when the
   * element is clicked and dragged, in terms of the model space of the object being transformed.
   * @param draggableAxes The axes along which this element can be dragged,
   * in terms of the model space of the object being transformed.
   * @param position The coordinates of the plane in model space, where the set
   * of controls has unit dimensions.
   * @param height The height of the plane.
   * @param width The width of the plane.
   */
  constructor(
    axes: readonly Axis[],
    draggableAxes: readonly Axis[],
    position: THREE.Vector3,
    height = 1,
    width = 1,
  ) {
    super(axes, draggableAxes, position);

    const planeMaterial = new THREE.MeshBasicMaterial({
      color: "gray",
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide,
    });
    this.#plane = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
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
      new THREE.PlaneGeometry(1, 0.5),
      axisMaterial,
    );
    this.#axisYHelper = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 1),
      axisMaterial,
    );
    this.add(this.#axisXHelper, this.#axisYHelper);
  }

  /**
   * Performs raycasting against this object.
   *
   * @param raycaster The caster of the ray.
   * @returns Refer to the `raycast` method of {@link THREE.Object3D}.
   */
  raycast(raycaster: THREE.Raycaster) {
    if (!this.visible) return [];

    const intersects = raycaster.intersectObject(this.#axisXHelper, false);

    if (intersects.length > 0) {
      intersects[0].object = this;
    }

    return intersects;
  }
}
