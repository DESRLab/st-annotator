import * as THREE from "three";

import type { ScenePointerEvent, WindowPointer } from "sta/app/editor";
import { ThreeUtils } from "sta/common";

import { VectorUtils } from "../../utils";
import { SelectionCurator } from "../SelectionCurator";
import type { VertexGeo } from "../SelectionCurator";

/**
 * Represents the stages of drawing a complete vector object.
 */
export type VertexDrawStage = "begin" | "resume" | "abort" | "end";

/**
 * Creates vertex-based geometry to query selection of points.
 */
export class SelectionVertexCurator extends SelectionCurator<VertexGeo> {
  get isCreating(): boolean {
    return this.newDrawnObjData.pixelVertices.length > 0;
  }

  #strokeWidth = 3;

  /**
   * The line width of vector object while creating the object.
   */
  get strokeWidth(): number {
    return this.#strokeWidth;
  }

  set strokeWidth(value: number) {
    if (value != null) {
      if (this.#strokeWidth !== value) {
        this.#strokeWidth = value;
      }
    }
  }

  /**
   * Whether a coordinates already exist in the polygon vertices.
   *
   * @param coords The newly registered coordinates from pointer position.
   * @returns Returns true if the coordinate exists in the vertices list.
   */
  isCoordsRepeated(coords: THREE.Vector2): boolean {
    return ThreeUtils.isCoordinatesInArray(
      this.newDrawnObjData.pixelVertices,
      coords,
    );
  }

  /**
   * @protected
   * @param drawStage The stage of drawing of the vector object being created.
   * @param data If given it updates the state of drawn object.
   */
  updateObjQueryState(
    drawStage: VertexDrawStage,
    data: {
      pointerPixelPos: THREE.Vector2;
      pointerNDCPos: THREE.Vector2;
    } | null,
  ): void {
    throw new Error("Not Implemented");
  }

  /**
   * Creates a new vertex-based object query creator.
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
    const defaultObjData: VertexGeo = {
      pixelVertices: [],
      ndcVertices: [],
    };

    super(pointer, raycaster, canvas, defaultObjData);
  }

  /**
   * Filters the points based on the object query drawn.
   *
   * @protected
   * @param points The points to filter in world space.
   * @param ncdPoints The points to filter in ncd space.
   * @param objQuery The object to apply filtering query.
   * @returns The resulted filtered points.
   */
  filterPoints(
    points: THREE.Vector3[],
    ncdPoints: THREE.Vector3[],
    objQuery: VertexGeo,
  ): THREE.Vector3[] {
    return points.filter((_, i) =>
      VectorUtils.isPointInPolygon(ncdPoints[i], objQuery),
    );
  }

  /**
   * Filters the points based on the object query drawn from buffer array.
   *
   * @param buffer The buffer array to query points from.
   * @param objQuery The object to apply filtering query.
   * @returns The resulted filtered points.
   */
  queryPointsFromBuffer(
    buffer: THREE.Vector3[],
    objQuery: VertexGeo,
  ): THREE.Vector3[] {
    const camera = this.raycaster.camera;
    const bufferNDC = ThreeUtils.worldCoordsToNDC([...buffer], camera);

    return buffer.filter((_, i) =>
      VectorUtils.isPointInPolygon(bufferNDC[i], objQuery),
    );
  }

  /**
   * Triggered when the pointer is pressed down on this object's base element.
   *
   * @protected
   * @param event The corresponding pointer event.
   */
  onPointerDown = (event: ScenePointerEvent): void => {
    const { enabled, isCreating } = this;
    if (!enabled) return;
    if (event.buttons !== 1) return;

    const pointerPixelPos = this.getPointerPixelPos(event);
    const pointerNDCPos = this.getPointerNDCPos(event);

    const drawStage: VertexDrawStage = isCreating ? "resume" : "begin";
    let data: {
      pointerPixelPos: THREE.Vector2;
      pointerNDCPos: THREE.Vector2;
    } | null = null;

    data = {
      pointerPixelPos,
      pointerNDCPos,
    };

    this.updateObjQueryState(drawStage, data);

    this.startDrawInContext(pointerPixelPos);
  };

  /**
   * Aborts creating a vector object.
   *
   * @returns returns true if successfully is invoked.
   */
  abort(): boolean {
    this.clearCanvas();

    if (!this.isCreating) return false;

    this.updateObjQueryState("abort", null);

    this.dispatchEvent({
      type: "abort",
      objQuery: this.newDrawnObjData,
    } as never);

    return true;
  }

  /**
   *  Finishes creating a vector object.
   *
   * @returns returns true if successfully is invoked.
   */
  finish(): boolean {
    if (!this.isCreating) return false;

    this.clearCanvas();

    const objQuery = this.newDrawnObjData;

    this.updateObjQueryState("end", null);

    this.dispatchEvent({ type: "end", objQuery: objQuery } as never);

    return true;
  }
}
