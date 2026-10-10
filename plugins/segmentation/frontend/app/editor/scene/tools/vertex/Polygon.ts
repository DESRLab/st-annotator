import * as THREE from "three";

import type { ScenePointerEvent, WindowPointer } from "sta/app/editor";

import type { ToolTypes, VertexGeo } from "../SelectionCurator";

import { SelectionVertexCurator } from "./VertexQueryCreator";
import type { VertexDrawStage } from "./VertexQueryCreator";

/**
 * Draws a polygon with set of vertices along `x-z` plane to be used
 * to query a selection from point cloud.
 */
export class PolygonCurator extends SelectionVertexCurator {
  /**
   * The type of this object query.
   */
  static objQueryType: ToolTypes = "polygon";

  get toolType(): ToolTypes {
    return PolygonCurator.objQueryType;
  }

  /**
   * Updates how the data of this object query to be stored.
   *
   * @protected
   * @param drawStage The stage of drawing of the object query.
   * @param data If given it updates the state of drawn object.
   */
  updateObjQueryState(
    drawStage: VertexDrawStage,
    data: {
      pointerPixelPos: THREE.Vector2;
      pointerNDCPos: THREE.Vector2;
    } | null,
  ): void {
    let drawnObjData = this.newDrawnObjData;

    const defaultObjData: VertexGeo = {
      pixelVertices: [],
      ndcVertices: [],
    };

    if (data === null) {
      drawnObjData = defaultObjData;
    } else {
      const { pointerPixelPos, pointerNDCPos } = data;

      switch (drawStage) {
        case "begin":
          drawnObjData.pixelVertices = new Array(pointerPixelPos);
          drawnObjData.ndcVertices = new Array(pointerNDCPos);

          this.dispatchEvent({
            type: drawStage,
            objQuery: drawnObjData,
          } as never);
          break;
        case "resume":
          if (!this.isCoordsRepeated(pointerPixelPos)) {
            drawnObjData.pixelVertices.push(pointerPixelPos);
            drawnObjData.ndcVertices.push(pointerNDCPos);
          }
          break;
        default:
          drawnObjData = defaultObjData;
      }
    }
    this.newDrawnObjData = drawnObjData;
  }

  /**
   * Creates a new vector object.
   *
   * @param pointer The pointer that interacts with the objects.
   * @param raycaster Raycasts the pointer to this set of controls.
   * @param canvas The HTML canvas where this object draws in.
   */
  constructor(
    pointer: WindowPointer,
    raycaster: THREE.Raycaster,
    canvas: HTMLCanvasElement,
  ) {
    super(pointer, raycaster, canvas);
  }

  /**
   * Triggered when pointer is moved on this object's base element.
   *
   * @protected
   * @param event The corresponding pointer event.
   */
  onPointerMove = (event: ScenePointerEvent): void => {
    const { enabled, isCreating } = this;
    if (!enabled || !isCreating) return;

    const pointerCoords = this.getPointerPixelPos(event);
    this.startDrawInContext(pointerCoords);
    this.updateDrawInContext(pointerCoords);
  };

  /**
   * Triggered when pointer is released this object's base element.
   *
   * @protected
   * @param event The corresponding pointer event.
   */
  onPointerUp = (event: ScenePointerEvent): void => {};

  /**
   * Begins drawing a polygon on 2d canvas context.
   *
   * @protected
   * @param pointerCoords The current pointer coordinates.
   */
  startDrawInContext(pointerCoords: THREE.Vector2): void {
    const { isCreating, newDrawnObjData } = this;
    if (!isCreating) return;

    this.context.beginPath();
    this.context.strokeStyle = this.strokeColor.getStyle();
    this.context.lineWidth = this.strokeWidth;

    const vertices = newDrawnObjData.pixelVertices;

    for (const vertex of vertices) {
      this.context.lineTo(vertex.x, vertex.y);
    }

    this.context.stroke();
  }

  /**
   * Continues drawing a polygon on 2d canvas context while pointer is moving.
   *
   * @protected
   * @param pointerCoords The current pointer coordinates.
   */
  updateDrawInContext(pointerCoords: THREE.Vector2): void {
    const { isCreating, newDrawnObjData } = this;
    if (!isCreating) return;

    const vertices = newDrawnObjData.pixelVertices;

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
