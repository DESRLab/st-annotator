import * as THREE from "three";

import type { ScenePointerEvent, WindowPointer } from "sta/app/editor";
import { ThreeUtils } from "sta/common";

import { VectorUtils } from "../../utils";
import { SelectionCurator } from "../SelectionCurator";
import type { ParametricGeo } from "../SelectionCurator";

/**
 * Represents the stages of drawing a complete vector object.
 */
export type DrawStage = "begin" | "pause" | "abort" | "end";

/**
 * Creates parametric-based geometry to query selection of points.
 *
 * meant to be used for painting action.
 */
export class SelectionParametricCurator extends SelectionCurator<ParametricGeo> {
  /**
   * Represents the dom element of this object.
   * Displays a circular div.
   */
  readonly cursor: HTMLElement;

  #diameter = 40;

  get diameter(): number {
    return this.#diameter;
  }

  set diameter(value: number) {
    if (this.diameter !== value) {
      this.#diameter = value;
      this.render();
    }
  }

  #isPainting = false;

  /**
   * `true` if the cursor object representing the parametric
   * object has triggered for painting.
   */
  get isPainting(): boolean {
    return this.#isPainting;
  }

  set isPainting(value: boolean) {
    if (this.#isPainting !== value) {
      this.#isPainting = value;
    }
  }

  #enabled = false;

  /**
   * `true` if this creator is disabled; otherwise, `false`.
   *
   * If set to `true` while a bounding box is being created, aborts the process.
   */
  get enabled(): boolean {
    return this.#enabled;
  }

  set enabled(value: boolean) {
    if (this.#enabled !== value) {
      this.#enabled = value;

      this.render();
    }
  }

  get isCreating(): boolean {
    return this.isPainting;
  }

  /**
   * Updates how the cursor element to be displayed and positioned.
   *
   * @protected
   * @param pointerPixelPos The pointer position on window.
   */
  updateCursorPos(pointerPixelPos: THREE.Vector2): void {
    throw new Error("Not Implemented");
  }

  /**
   * Updates how the data of this object query to be stored.
   *
   * @protected
   * @param drawStage The stage of drawing of the object query
   * @param data The data to update the object query.
   */
  updateObjQueryState(
    drawStage: DrawStage,
    data: { centerNDC: THREE.Vector2 } | null,
  ): void {
    throw new Error("Not Implemented");
  }

  /**
   * Creates a new parametric-based object query creator.
   *
   * @param pointer The pointer that interacts with the objects.
   * @param raycaster Raycasts the pointer to this set of controls.
   * @param canvas The HTML canvas where this object draws in.
   * @param cursor The html element representing a cursor shape.
   */
  constructor(
    pointer: WindowPointer,
    raycaster: THREE.Raycaster,
    canvas: HTMLCanvasElement,
    cursor: HTMLElement,
  ) {
    const defaultObjData: ParametricGeo = {
      center: new THREE.Vector2(),
      radius: 0,
    };

    super(pointer, raycaster, canvas, defaultObjData);

    this.cursor = cursor;
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
    objQuery: ParametricGeo,
  ): THREE.Vector3[] {
    return points.filter((_, i) =>
      VectorUtils.isPointInCircle(ncdPoints[i], objQuery),
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
    objQuery: ParametricGeo,
  ): THREE.Vector3[] {
    const camera = this.raycaster.camera;
    const bufferNDC = ThreeUtils.worldCoordsToNDC([...buffer], camera);

    return buffer.filter((_, i) =>
      VectorUtils.isPointInCircle(bufferNDC[i], objQuery),
    );
  }

  /**
   * Triggered when the pointer is pressed down on this object's base element.
   *
   * @protected
   * @param event The corresponding pointer event.
   */
  onPointerDown = (event: ScenePointerEvent): void => {
    if (!this.enabled) return;
    if (event.buttons !== 1) return;

    this.isPainting = true;

    this.startDrawInContext(this.getPointerNDCPos(event));
  };

  /**
   * Triggered when pointer is moved on this object's base element.
   *
   * @protected
   * @param event The corresponding pointer event.
   */
  onPointerMove = (event: ScenePointerEvent): void => {
    if (!this.enabled) return;
    this.isPainting = event.buttons === 1;

    const pointerPixelPos = this.getPointerPixelPos(event);
    const pointerCenterNDCPos = this.getPointerNDCPos(event);
    this.updateCursorPos(pointerPixelPos);

    if (this.isPainting) {
      this.updateDrawInContext(pointerPixelPos);

      this.updateObjQueryState("begin", {
        centerNDC: pointerCenterNDCPos,
      });

      this.dispatchEvent({
        type: "begin",
        objQuery: this.newDrawnObjData,
      } as never);
    }
  };

  /**
   * Triggered when pointer is moved on this object's base element.
   *
   * @protected
   * @param event The corresponding pointer event.
   */
  onPointerUp = (event: ScenePointerEvent): void => {
    if (!this.enabled) return;
    if (event.buttons !== 0) return;

    this.isPainting = false;

    this.endDrawInContext();

    const pointerCenterNDCPos = this.getPointerNDCPos(event);

    this.updateObjQueryState("pause", { centerNDC: pointerCenterNDCPos });

    this.dispatchEvent({
      type: "pause",
      objQuery: this.newDrawnObjData,
    } as never);
  };

  /**
   * Aborts creating a vector object.
   *
   * @returns returns true if successfully is invoked.
   */
  abort(): boolean {
    this.clearCanvas();

    if (!this.isPainting) return false;

    this.render();

    this.updateObjQueryState("abort", null);

    this.dispatchEvent({
      type: "abort",
      objQuery: this.newDrawnObjData,
    } as never);

    return true;
  }

  /**
   *  Finishes creating using this tool.
   *
   * @returns returns true if successfully is invoked.
   */
  finish(): boolean {
    this.clearCanvas();

    if (!this.isPainting) return false;

    this.render();

    this.updateObjQueryState("end", null);

    this.dispatchEvent({
      type: "end",
      objQuery: this.newDrawnObjData,
    } as never);

    return true;
  }

  /**
   * finishes painting on 2d canvas context.
   *
   * @protected
   */
  endDrawInContext(): void {
    throw new Error("Not Implemented");
  }

  /**
   * Specifies how to render the cursor hmtl element
   * representing this parametric object query.
   *
   * @protected
   */
  render(): void {
    throw new Error("Not Implemented");
  }
}
