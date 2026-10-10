import * as THREE from "three";

import { WindowPointer } from "sta/app/editor";
import type { Axis } from "sta/app/editor";

import { VectorGeo } from "../data/views";
import type { Line, Point } from "../data/views";

import type { ControlsEventMap } from "./Controls";
import { VertexTranslateControls } from "./VertexTranslateControls";
import { VerticesTranslateControls } from "./VerticesTranslateControls";

export type Transformation = "vertex" | "vertices";

/**
 * Defines each event that can be dispatched by {@link TransformControls}.
 */
export interface TransformControlsEventMap {
  mouseDown: { mode: Transformation };
  mouseUp: { mode: Transformation };
  objectChange: { obj: VectorGeo<Line | Point> };
}

interface CompositeControls {
  vertex: VertexTranslateControls;
  vertices: VerticesTranslateControls;
}

/**
 * Used to perform vertex transformation of three.js objects.
 */
export class TransformControls extends THREE.Object3D<
  THREE.Object3DEventMap & TransformControlsEventMap
> {
  /**
   * The pointer that is used to interact with the scene.
   */
  pointer: WindowPointer;

  /**
   * A set of controls for each type of transformation.
   */
  #controls: CompositeControls;

  /**
   * Whether a set of controls is enabled.
   *
   * @param transformation The type of transformation performed by the
   * set of controls.
   * @returns `true` if the set of controls is enabled; otherwise, `false`.
   */
  isControlsEnabled(transformation: Transformation) {
    return this.#controls[transformation].enabled;
  }

  /**
   * Sets whether a set of controls is enabled.
   *
   * @param transformation The type of transformation performed by the
   * set of controls.
   * @param isEnabled If `true`, the given set of controls is enabled; otherwise,
   * it is disabled.
   */
  setControlsEnabled(transformation: Transformation, isEnabled: boolean) {
    this.#controls[transformation].enabled = isEnabled;

    this.#updateVisibility();
  }

  #disableMoveXZ = false;

  /**
   * Whether to disable moving the bounding box along the `x` and `z` axis.
   */
  get disableMoveXZ() {
    return this.#disableMoveXZ;
  }

  set disableMoveXZ(value: boolean) {
    if (this.#disableMoveXZ !== value) {
      this.#disableMoveXZ = value;

      this.#updateVisibility();
    }
  }

  #disableMoveY = false;

  /**
   * Whether to disable moving and resizing the bounding box along the `y` axis.
   */
  get disableMoveY() {
    return this.#disableMoveY;
  }

  set disableMoveY(value: boolean) {
    if (this.#disableMoveY !== value) {
      this.#disableMoveY = value;

      this.#updateVisibility();
    }
  }

  /**
   * Updates the visibility of each set of controls.
   *
   * @returns This object.
   */
  #updateVisibility() {
    for (const controls of Object.values(this.#controls)) {
      controls.visible = controls.enabled && controls.object != null;

      controls.showX = !this.disableMoveXZ;
      controls.showY = !this.disableMoveY;
      controls.showZ = !this.disableMoveXZ;
    }

    return this;
  }

  #object: VectorGeo<Line | Point> | null = null;

  /**
   * The 3D object being controlled.
   */
  get object() {
    return this.#object;
  }

  set object(value: VectorGeo<Line | Point> | null) {
    if (this.object !== value) {
      this.#object = value;

      this.clear();

      for (const controls of Object.values(this.#controls)) {
        controls.object = value;
        this.add(controls);
      }

      this.#updateVisibility();
    }
  }

  /**
   * The type of transformation being applied, if any.
   */
  get mode(): Transformation | null {
    for (const [mode, controls] of Object.entries(this.#controls)) {
      if (mode === "vertex" || mode === "vertices") {
        if (controls.dragging && controls.axis_or_plane != null) {
          return mode;
        }
      } else {
        throw new Error(`Unhandled controls type: ${mode}`);
      }
    }

    return null;
  }

  /**
   * The axis or plane along which the transformation is taking place, or `null` if
   * no transformation is taking place.
   */
  get axis_or_plane(): readonly Axis[] | null {
    for (const controls of Object.values(this.#controls)) {
      if (controls.dragging && controls.axis_or_plane != null) {
        return controls.axis_or_plane;
      }
    }

    return null;
  }

  /**
   * Creates a new control to perform vertex translation of a vector object.
   *
   * @param pointer The pointer that interacts with the set of controls.
   * @param raycaster Raycasts the pointer to the set of controls.
   */
  constructor(pointer: WindowPointer, raycaster: THREE.Raycaster) {
    super();

    const vertexControls = new VertexTranslateControls(pointer, raycaster, 2);
    const verticesControls = new VerticesTranslateControls(
      pointer,
      raycaster,
      1,
    );

    this.#controls = {
      vertex: vertexControls,
      vertices: verticesControls,
    };

    this.pointer = pointer;

    const controlsEntries: [
      Transformation,
      THREE.EventDispatcher<THREE.Object3DEventMap & ControlsEventMap>,
    ][] = [
      ["vertex", vertexControls],
      ["vertices", verticesControls],
    ];

    for (const [mode, ctrls] of controlsEntries) {
      ctrls.addEventListener("mouseDown", (e) => {
        if (this.object == null) return;

        this.dispatchEvent({ mode, ...e });
      });
      ctrls.addEventListener("mouseUp", (e) => {
        if (this.object == null) return;

        this.dispatchEvent({ mode, ...e });
      });
      ctrls.addEventListener("objectChange", (e) => {
        this.#onObjectChange(e);

        this.dispatchEvent(e);
      });
    }

    this.#updateVisibility();
  }

  #onObjectChange(event: ControlsEventMap["objectChange"]) {
    const mode = this.mode;
    const controls = this.#controls;
    switch (mode) {
      case "vertex":
        if (controls.vertices.enabled) {
          this.#controls.vertices.object = event.obj;
        }
        break;
      case "vertices":
        if (controls.vertex.enabled) {
          this.#controls.vertex.object = event.obj;
        }
        break;
      default:
        throw Error(`Unhandled transformation mode ${mode}`);
    }
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose() {
    for (const [mode, ctrls] of Object.entries(this.#controls)) {
      if (mode === "vertex" || mode === "vertices") {
        // Assumes that this object owns the newly created controls
        // This is ensured by making the constructor protected
        ctrls.dispose();

        this.remove(ctrls);
      } else {
        throw new Error(`Unhandled controls type: ${mode}`);
      }
    }
  }
}
