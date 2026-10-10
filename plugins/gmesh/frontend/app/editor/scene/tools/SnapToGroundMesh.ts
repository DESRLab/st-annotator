import * as THREE from "three";

import type { GroundMesh } from "../data";

/**
 * A helper class to maintain an object's elevation relative to a ground mesh in world space.
 */
export class SnapToGroundMesh {
  /** Whether to disable maintaining the object's elevation relative to the ground mesh. */
  disabled = false;

  /** The ground mesh to refer to when adjusting the elevation. */
  groundMesh: GroundMesh | null;

  /** The object whose elevation to adjust. */
  #obj3D: THREE.Object3D | null;

  /**
   * The relative height of the object relative to the ground mesh
   * when it was attached, in terms of world space.
   */
  #startWorldRelElevation: number | null = null;

  /**
   * Creates a new helper to maintain an object's elevation relative to a ground mesh.
   */
  constructor(groundMesh: GroundMesh | null) {
    this.groundMesh = groundMesh;
    this.#obj3D = null;
  }

  /**
   * Attachs an object, computing its elevation from the ground mesh.
   * When {@link SnapToGroundMesh#snapToMesh} is called, the elevation
   * of this object will be updated to equal this initial value.
   *
   * If the initial elevation cannot be computed at this moment, it is recomputed
   * whenever {@link SnapToGroundMesh#snapToMesh} is called.
   *
   */
  attach(obj3D: THREE.Object3D) {
    this.#obj3D = obj3D;
    this.#startWorldRelElevation = this.#computeWorldRelElevation(obj3D);
  }

  /**
   * Detaches the current object so that its elevation is no longer adjusted.
   *
   * This is a no-op if no object is currently attached.
   */
  detach() {
    this.#obj3D = null;
    this.#startWorldRelElevation = null;
  }

  /**
   * Calculates the projection of the center of an object on the ground mesh.
   *
   */
  #computeWorldProjectionOnMesh(obj3D: THREE.Object3D): THREE.Vector3 | null {
    const mesh = this.groundMesh;
    if (mesh == null) return null;

    const boxWorldPos = obj3D.localToWorld(new THREE.Vector3(0, 0, 0));
    const boxDownDir = obj3D
      .localToWorld(new THREE.Vector3(0, -0.5, 0))
      .sub(boxWorldPos)
      .normalize();
    const boxUpDir = obj3D
      .localToWorld(new THREE.Vector3(0, 0.5, 0))
      .sub(boxWorldPos)
      .normalize();

    const downRaycaster = new THREE.Raycaster(boxWorldPos, boxDownDir);
    const upRaycaster = new THREE.Raycaster(boxWorldPos, boxUpDir);
    const intersection =
      mesh.raycast(downRaycaster).at(0) ?? mesh.raycast(upRaycaster).at(0);

    return intersection?.point ?? null;
  }

  /**
   * Calculates the elevation of an object relative to the ground mesh.
   *
   * This assumes that both the object and ground mesh are attached to the same parent,
   * i.e., the scene.
   *
   */
  #computeWorldRelElevation(obj3D: THREE.Object3D): number | null {
    const mesh3D = this.groundMesh?.asObject3D();
    if (mesh3D == null) return null;

    const projWorld = this.#computeWorldProjectionOnMesh(obj3D);
    if (projWorld == null) return null;

    return obj3D.getWorldPosition(new THREE.Vector3()).y - projWorld.y;
  }

  /**
   * Adjust the elevation of the attached object to maintain its elevation relative to the
   * ground mesh.
   *
   * If the elevation of the object relative to the ground mesh has not been computed before,
   * computes it now.
   *
   * This is a no-op if this feature is disabled, or if there is no ground mesh or
   * attached object.
   */
  snapToMesh() {
    const obj3D = this.#obj3D;
    if (this.disabled || !this.groundMesh || !obj3D) return;

    if (this.#startWorldRelElevation == null) {
      this.#startWorldRelElevation = this.#computeWorldRelElevation(obj3D);
    }

    const startRelElevation = this.#startWorldRelElevation;
    const currentRelElevation = this.#computeWorldRelElevation(obj3D);

    if (startRelElevation != null && currentRelElevation != null) {
      // Update the world position directly

      const parent = obj3D.parent;
      if (parent) parent.remove(obj3D);

      obj3D.position.y += startRelElevation - currentRelElevation;

      if (parent) parent.attach(obj3D);
    }
  }
}
