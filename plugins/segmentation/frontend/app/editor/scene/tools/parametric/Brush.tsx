import { max } from "mathjs";
import { default as React } from "react";
import * as THREE from "three";

import type { WindowPointer } from "sta/app/editor";

import { BrushCursorView } from "./Brush.react.tsx";
import type { BrushCursorModel } from "./Brush.react.tsx";
import { SelectionParametricCurator } from "./ParametricQueryCreator";
import type { DrawStage } from "./ParametricQueryCreator";

export class BrushCurator extends SelectionParametricCurator {
  #cursorModel: BrushCursorModel = {
    diameter: "40px",
    enabled: false,
    left: "0px",
    top: "0px",
  };

  get cursorView(): React.JSX.Element {
    return <BrushCursorView cursor={this.#cursorModel} />;
  }

  #renderCursor(): void {
    this.dispatchEvent({ type: "cursor-change" } as never);
  }

  #centers: THREE.Vector2[] = [];

  /**
   * The type of this object query.
   */
  static objQueryType = "brush" as const;

  get toolType() {
    return BrushCurator.objQueryType;
  }

  #hue = 0.5;

  /**
   * The hue number of this object's painting color effect.
   */
  get hue(): number {
    return this.#hue;
  }

  set hue(value: number) {
    if (this.#hue !== value) {
      this.#hue = value;
    }
  }

  /**
   * Updates how the cursor element to be displayed and positioned.
   */
  updateCursorPos(pointerPixelPos: THREE.Vector2): void {
    this.#cursorModel = {
      ...this.#cursorModel,
      top: `${pointerPixelPos.y - this.diameter / 2}px`,
      left: `${pointerPixelPos.x - this.diameter / 2}px`,
    };
    this.#renderCursor();
  }

  /**
   * Updates how the data of this object query to be stored.
   */
  updateObjQueryState(
    drawStage: DrawStage,
    data: { centerNDC: THREE.Vector2 } | null,
  ): void {
    let objDrawnData = this.newDrawnObjData;
    const { canvas, diameter } = this;

    const defaultObjData = { center: new THREE.Vector2(), radius: 0 };

    if (data === null) {
      objDrawnData = defaultObjData;
    } else {
      const rect = canvas.getBoundingClientRect();
      const radiusNDC = diameter / max(rect.width, rect.height);

      if (drawStage === "begin" || drawStage === "pause") {
        objDrawnData.center = data.centerNDC;
        objDrawnData.radius = radiusNDC;
      } else {
        objDrawnData = defaultObjData;
      }
    }

    this.newDrawnObjData = objDrawnData;
  }

  /**
   * Creates a new circular brush object query creator.
   */
  constructor(
    pointer: WindowPointer,
    raycaster: THREE.Raycaster,
    canvas: HTMLCanvasElement,
    cursor: HTMLDivElement,
  ) {
    super(pointer, raycaster, canvas, cursor);

    this.#renderCursor();
  }

  /**
   * Begins drawing in a 2d canvas context.
   */
  startDrawInContext(pointerCoords: THREE.Vector2): void {
    const { isPainting, strokeColor, hue, diameter } = this;
    if (!isPainting) return;

    const rgbStyle = strokeColor.getStyle().slice(4, -1).split(",");
    const rgbaStyle = `rgba(${rgbStyle[0]},${rgbStyle[1]},${rgbStyle[2]},${hue})`;

    this.context.lineJoin = this.context.lineCap = "round";
    this.context.fillStyle = rgbaStyle;

    this.context.beginPath();
    this.context.arc(
      pointerCoords.x,
      pointerCoords.y,
      diameter / 2,
      0,
      2 * Math.PI,
    );
    this.context.fill();
  }

  /**
   * Continues painting on 2d canvas context while pointer is moving.
   */
  updateDrawInContext(pointerPos: THREE.Vector2): void {
    const { isPainting, diameter } = this;
    if (!isPainting) return;

    this.clearCanvas();

    const radius = diameter / 2;
    this.#centers.push(pointerPos);

    const centers = this.#centers;

    for (const center of centers) {
      this.context.beginPath();
      this.context.arc(center.x, center.y, radius, 0, 2 * Math.PI);
      this.context.fill();
    }
  }

  /**
   * finishes painting on 2d canvas context.
   */
  endDrawInContext(): void {
    this.clearCanvas();
    this.#centers = [];
  }

  /**
   * updates the view of this object's cursor element.
   */
  render(): void {
    this.#cursorModel = {
      ...this.#cursorModel,
      enabled: this.enabled,
      diameter: `${this.diameter}px`,
    };
    this.#renderCursor();
  }
}
