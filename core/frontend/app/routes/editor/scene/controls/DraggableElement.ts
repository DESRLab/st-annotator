import * as THREE from "three";

import { DraggableBase } from "./DraggableBase";
import type { Axis } from "./DraggableBase";

/**
 * Represents a vertex in a {@link TransformControls} that can be dragged to resize an object.
 */
export class DraggableElement extends DraggableBase {
  /**
   * The axes along which this element can be dragged,
   * in terms of the model space of the object being transformed.
   */
  readonly draggableAxes: readonly Axis[];

  /**
   * This method is invoked whenever the state of this element is changed.
   */
  onStateChanged() {
    throw new Error("Not implemented");
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
    super(axes);

    this.draggableAxes = draggableAxes;

    this.position.copy(position);

    // Transform such that raycasting in getPointerWorldPos can always be done against the
    // x-axis or xy-plane in the model space of this element to find the pointer position.
    switch (this.draggableAxes.join("")) {
      case "X":
        break;
      case "Y":
        // +x -> +y axis
        this.rotation.set(0, 0, -Math.PI / 2);
        break;
      case "Z":
        // +x -> +z axis
        this.rotation.set(0, Math.PI / 2, 0);
        break;
      case "XY":
        break;
      case "YX":
        // +x+y -> +y+x plane
        this.rotation.set(0, Math.PI, Math.PI / 2, "ZYX");
        break;
      case "YZ":
        // +x+y -> +y+z plane
        this.rotation.set(0, -Math.PI / 2, -Math.PI / 2, "XYZ");
        break;
      case "ZY":
        // +x+y -> +z+y plane
        this.rotation.set(0, Math.PI / 2, 0);
        break;
      case "XZ":
        // +x+y -> +x+z plane
        this.rotation.set(-Math.PI / 2, 0, 0);
        break;
      case "ZX":
        // +x+y -> +z+x plane
        this.rotation.set(0, Math.PI / 2, Math.PI / 2, "ZYX");
        break;
      default:
        throw new Error(`Invalid axis/plane: ${draggableAxes}`);
    }
  }

  /**
   * Gets the coordinates of the pointer in world space while this element is being dragged.
   *
   * @param raycaster A raycaster that has already been calibrated to match the
   * current position of the pointer.
   * @returns The requested coordinates.
   */
  getPointerWorldPos(raycaster: THREE.Raycaster): THREE.Vector3 {
    const pointerRay = raycaster.ray;

    // The default value in case there is no intersection between the ray and this element
    const pointerWorldPos = this.position
      .clone()
      .applyMatrix4(this.matrixWorld);

    const draggableAxes = this.draggableAxes.join("");
    if (draggableAxes.length === 1) {
      const axisRay = new THREE.Ray(
        new THREE.Vector3(),
        new THREE.Vector3(1, 0, 0),
      ).applyMatrix4(this.matrixWorld);

      // https://stackoverflow.com/questions/58151978/threejs-how-to-calculate-the-closest-point-on-a-three-ray-to-another-three-ray
      const Nv = pointerRay.direction.clone().cross(axisRay.direction);
      const Na = pointerRay.direction.clone().cross(Nv).normalize();
      const Db = axisRay.direction.clone().normalize();
      const db =
        pointerRay.origin.clone().sub(axisRay.origin).dot(Na) / Db.dot(Na);
      const ptB = axisRay.origin.clone().add(Db.multiplyScalar(db));

      pointerWorldPos.copy(ptB);
    } else if (draggableAxes.length === 2) {
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0).applyMatrix4(
        this.matrixWorld,
      );

      pointerRay.intersectPlane(plane, pointerWorldPos);
    } else {
      throw new Error(`Invalid axis/plane: ${draggableAxes}`);
    }

    return pointerWorldPos;
  }

  /**
   * Performs raycasting against this object.
   *
   * @param raycaster The caster of the ray.
   * @returns Refer to the `raycast` method of {@link THREE.Object3D}.
   */
  raycast(raycaster: THREE.Raycaster): THREE.Intersection[] {
    throw new Error("Not implemented");
  }
}
