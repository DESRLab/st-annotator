import * as THREE from "three";

import type { CoordinateFormatSpec, WindowPointer } from "sta/app/editor";

import { VectorType } from "../../../../models";

import { VectorCreator } from "./VectorCreator";

export class PointCreator extends VectorCreator {
  /**
   * The type of this vector object being created.
   */
  static vectorType = VectorType.POINT;

  get vectorType(): typeof VectorType.POINT {
    return PointCreator.vectorType;
  }

  /**
   * Creates a new vector object.
   *
   * @param format The configuration of the project.
   * @param pointer The pointer that interacts with the objects.
   * @param raycaster Raycasts the pointer to this set of controls.
   * @param canvas The HTML canvas where this object draws in.
   */
  constructor(
    format: CoordinateFormatSpec,
    pointer: WindowPointer,
    raycaster: THREE.Raycaster,
    canvas: HTMLCanvasElement,
  ) {
    super(format, pointer, raycaster, canvas, false);
  }

  /**
   * Begins drawing a point on 2d canvas context.
   */
  startDrawInContext() {
    if (!this.isCreating) return;

    const vertex = this.newVectorPixelVerices.at(0);

    const pointSize = this.strokeWidth * 5;

    if (vertex != null) {
      this.context.fillRect(vertex.x, vertex.y, pointSize, pointSize);
      this.context.fillStyle = this.strokeColor.getStyle();
    }
  }

  /**
   * Continues drawing a point on 2d canvas context while pointer is moving.
   *
   * @param pointerCoords The current pointer coordinates.
   */
  protected updateDrawInContext(pointerCoords: THREE.Vector2): void {
    this.finish();
  }
}
