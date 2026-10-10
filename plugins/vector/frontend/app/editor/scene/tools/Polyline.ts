import * as THREE from "three";

import type { CoordinateFormatSpec, WindowPointer } from "sta/app/editor";

import { VectorType } from "../../../../models";

import { VectorCreator } from "./VectorCreator";

export class PolylineCreator extends VectorCreator {
  /**
   * The type of this vector object being created.
   */
  static vectorType = VectorType.POLYLINE;

  get vectorType(): typeof VectorType.POLYLINE {
    return PolylineCreator.vectorType;
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
   * Begins drawing a polygon on 2d canvas context.
   */
  protected startDrawInContext(): void {
    if (!this.isCreating) return;

    this.context.beginPath();
    this.context.strokeStyle = this.strokeColor.getStyle();
    this.context.lineWidth = this.strokeWidth;

    const vertices = this.newVectorPixelVerices;

    for (const vertex of vertices) {
      this.context.lineTo(vertex.x, vertex.y);
    }

    this.context.stroke();
  }

  /**
   * Continues drawing a polygon on 2d canvas context while pointer is moving.
   *
   * @param pointerCoords The current pointer coordinates.
   */
  protected updateDrawInContext(pointerCoords: THREE.Vector2): void {
    if (!this.isCreating) return;

    this.clearCanvas();

    this.context.lineTo(pointerCoords.x, pointerCoords.y);

    this.context.stroke();
  }
}
