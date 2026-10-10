import * as THREE from "three";

import type { CoordinateFormatSpec, WindowPointer } from "sta/app/editor";

import { VectorType } from "../../../../models";

import { VectorCreator } from "./VectorCreator";

export class PolygonCreator extends VectorCreator {
  /**
   * The type of this vector object being created.
   */
  static vectorType = VectorType.POLYGON;

  get vectorType(): typeof VectorType.POLYGON {
    return PolygonCreator.vectorType;
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
    super(format, pointer, raycaster, canvas, true);
  }

  /**
   * Begins drawing a polygon on 2d canvas context.
   */
  startDrawInContext() {
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

    const vertices = this.newVectorPixelVerices;

    this.clearCanvas();

    this.context.moveTo(vertices[0].x, vertices[0].y);
    this.context.lineTo(pointerCoords.x, pointerCoords.y);

    this.context.moveTo(
      vertices[vertices.length - 1].x,
      vertices[vertices.length - 1].y,
    );
    this.context.lineTo(pointerCoords.x, pointerCoords.y);

    this.context.stroke();
  }
}
