import * as THREE from "three";

import type { ScenePointerEvent, WindowPointer } from "sta/app/editor";

import { VectorUtils } from "../../utils";
import type { ToolTypes, VertexGeo } from "../SelectionCurator";

import { SelectionVertexCurator } from "./VertexQueryCreator";
import type { VertexDrawStage } from "./VertexQueryCreator";

/**
 * Draws a rectangle box with set of vertices along `x-z` plane to be used
 * to query a selection from point cloud.
 */
export class RectangleCurator extends SelectionVertexCurator {
  /**
   * The type of this object query.
   */
  static objQueryType: ToolTypes = "box";

  get toolType(): ToolTypes {
    return RectangleCurator.objQueryType;
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
      const startPixelPos = drawnObjData.pixelVertices.at(0);
      const startNDCPos = drawnObjData.ndcVertices.at(0);

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
          if (startPixelPos != null && startNDCPos != null) {
            drawnObjData.pixelVertices = VectorUtils.setRectangleCoords(
              startPixelPos,
              pointerPixelPos,
            );
            drawnObjData.ndcVertices = VectorUtils.setRectangleCoords(
              startNDCPos,
              pointerNDCPos,
            );
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
    if (event.buttons !== 1) return;

    const pointerPixelPos = this.getPointerPixelPos(event);
    const pointerNDCPos = this.getPointerNDCPos(event);

    const data: {
      pointerPixelPos: THREE.Vector2;
      pointerNDCPos: THREE.Vector2;
    } | null = {
      pointerPixelPos,
      pointerNDCPos,
    };

    this.updateObjQueryState("resume", data);
    this.updateDrawInContext(pointerPixelPos);
  };

  /**
   * Triggered when pointer is released this object's base element.
   *
   * @protected
   * @param event The corresponding pointer event.
   */
  onPointerUp = (event: ScenePointerEvent): void => {
    const { enabled, isCreating } = this;
    if (!enabled || !isCreating) return;
    if (event.buttons !== 0) return;

    this.finish();
  };

  /**
   * Begins drawing a polygon on 2d canvas context.
   *
   * @protected
   * @param pointerCoords The current pointer coordinates.
   */
  startDrawInContext(pointerCoords: THREE.Vector2): void {
    if (!this.isCreating) return;

    this.context.beginPath();
    this.context.strokeStyle = this.strokeColor.getStyle();
    this.context.lineWidth = this.strokeWidth;
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

    this.clearCanvas();

    const topLeftPos = newDrawnObjData.pixelVertices.at(0);
    if (topLeftPos != null) {
      const width = pointerCoords.x - topLeftPos.x;
      const height = pointerCoords.y - topLeftPos.y;

      this.startDrawInContext(pointerCoords);

      this.context.rect(topLeftPos.x, topLeftPos.y, width, height);
      this.context.stroke();
    }
  }
}
