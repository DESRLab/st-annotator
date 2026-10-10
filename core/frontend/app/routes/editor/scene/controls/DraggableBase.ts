import * as THREE from "three";

/**
 * Enumerates each axis in 3-D space.
 */
export type Axis = "X" | "Y" | "Z";

/**
 * Enumerates each state a {@link DraggableBase} can be in.
 */
export type DraggableElementState = "none" | "hovered" | "dragged";

/**
 * Represents a draggable element in a {@link TransformControls}.
 */
export class DraggableBase extends THREE.Object3D {
  /**
   * The axes along which transformation can take place when this element is clicked and dragged,
   * in terms of the model space of the object being transformed.
   */
  readonly axes: readonly Axis[];

  /**
   * The state of this element.
   */
  #state: DraggableElementState = "none";

  get state(): DraggableElementState {
    return this.#state;
  }

  set state(value: DraggableElementState) {
    if (this.state !== value) {
      this.#state = value;
      this.onStateChanged();
    }
  }

  /**
   * This method is invoked whenever the state of this element is changed.
   */
  onStateChanged() {}

  /**
   * Creates a new draggable element.
   *
   * @param axes The axes along which transformation can take place when the
   * element is clicked and dragged, in terms of the model space of the object being transformed.
   */
  constructor(axes: readonly Axis[]) {
    super();

    this.axes = axes;
  }

  /**
   * Gets the coordinates of the pointer in world space while this element is being dragged.
   *
   * @param raycaster A raycaster that has already been calibrated to match the
   * current position of the pointer.
   * @returns The requested coordinates.
   */
  getPointerWorldPos(raycaster: THREE.Raycaster): THREE.Vector3 {
    throw new Error("Not implemented");
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
