import _ from "lodash";
import * as THREE from "three";

import { WindowPointer } from "../tools/ScenePointer";

import { Controls, type ControlsEventMap } from "./Controls";
import { DraggableBase, type Axis } from "./DraggableBase";
import { ResizeControls } from "./ResizeControls";
import { RotateControls } from "./RotateControls";
import { TranslateControls } from "./TranslateControls";

export type Transformation = "translate" | "rotate" | "scale";

/**
 * Defines each event that can be dispatched by {@link TransformControls}.
 */
export interface TransformControlsEventMap {
  mouseDown: { mode: Transformation };
  mouseUp: { mode: Transformation };
  objectChange: {};
}

export interface CompositeControls {
  translate: TranslateControls;
  rotate: RotateControls;
  scale: ResizeControls;
}

/**
 * The listeners that {@link TransformControls} installs on a set of controls
 * to forward its events, kept so they can be removed on disposal.
 */
type ControlEventForwarders = {
  [T in "mouseDown" | "mouseUp" | "objectChange"]: THREE.EventListener<
    ControlsEventMap[T],
    T,
    Controls
  >;
};

/**
 * Used to perform various transformations of `three.js` objects.
 *
 */
export class TransformControls extends THREE.Object3D<
  THREE.Object3DEventMap & TransformControlsEventMap
> {
  /**
   * The pointer that is used to interact with the scene.
   */
  readonly pointer: WindowPointer;

  /**
   * A set of controls for each type of transformation.
   */
  readonly #controls: CompositeControls;

  /**
   * Whether a set of controls is enabled.
   *
   * @param transformation The type of transformation performed by the
   * set of controls.
   * @returns `true` if the set of controls is enabled; otherwise, `false`.
   */
  isControlsEnabled(transformation: Transformation): boolean {
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
  setControlsEnabled(transformation: Transformation, isEnabled: boolean): void {
    this.#controls[transformation].enabled = isEnabled;

    this.#updateVisibility();
  }

  #disableMoveXZ = false;

  /**
   * Whether to disable moving the selected object along the `x` and `z` axis.
   */
  get disableMoveXZ(): boolean {
    return this.#disableMoveXZ;
  }

  set disableMoveXZ(value: boolean) {
    if (this.#disableMoveXZ !== value) {
      this.#disableMoveXZ = value;

      this.#updateVisibility();
    }
  }

  #disableMoveResizeY = false;

  /**
   * Whether to disable moving and resizing the selected object along the `y` axis.
   */
  get disableMoveResizeY(): boolean {
    return this.#disableMoveResizeY;
  }

  set disableMoveResizeY(value: boolean) {
    if (this.#disableMoveResizeY !== value) {
      this.#disableMoveResizeY = value;

      this.#updateVisibility();
    }
  }

  /**
   * Whether to disable resizing the selected object along any plane.
   */
  get disablePlaneResize(): boolean {
    return !this.#controls.scale.enablePlane;
  }

  set disablePlaneResize(value: boolean) {
    this.#controls.scale.enablePlane = !value;
  }

  /**
   * Updates the visibility of each set of controls.
   *
   * @returns This object.
   */
  #updateVisibility(): this {
    for (const [mode, controls] of Object.entries(this.#controls) as [
      Transformation,
      Controls,
    ][]) {
      controls.visible = controls.enabled && controls.object != null;

      switch (mode) {
        case "translate":
          controls.showX = !this.disableMoveXZ;
          controls.showY = !this.disableMoveResizeY;
          controls.showZ = !this.disableMoveXZ;
          break;
        case "rotate":
          controls.showX = false;
          controls.showY = true;
          controls.showZ = false;
          break;
        case "scale":
          controls.showX = true;
          controls.showY = !this.disableMoveResizeY;
          controls.showZ = true;
          break;
        default:
          throw new Error(`Invalid mode: ${mode}`);
      }
    }

    return this;
  }

  #object: THREE.Object3D | null = null;

  /**
   * The 3D object being controlled.
   */
  get object(): THREE.Object3D | null {
    return this.#object;
  }

  set object(value: THREE.Object3D | null) {
    if (this.object !== value) {
      this.#object = value;

      if (value == null) {
        for (const controls of Object.values(this.#controls) as Controls[]) {
          controls.detach();
        }
      } else {
        for (const controls of Object.values(this.#controls) as Controls[]) {
          controls.attach(value);
        }
      }

      this.#updateVisibility();
    }
  }

  /**
   * The type of transformation being applied, if any.
   */
  get mode(): Transformation | null {
    for (const [mode, controls] of Object.entries(this.#controls) as [
      Transformation,
      Controls,
    ][]) {
      if (mode === "translate" || mode === "rotate" || mode === "scale") {
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
    for (const controls of Object.values(this.#controls) as Controls[]) {
      if (controls.dragging && controls.axis_or_plane != null) {
        return controls.axis_or_plane;
      }
    }

    return null;
  }

  /**
   * Creates a new set of controls to transform an object.
   *
   * @param pointer The pointer that interacts with the set of controls.
   * @param raycaster Raycasts the pointer to the set of controls.
   * @param priority The priority of each set of controls in
   * `pointer`. These priority values should be unique.
   * @returns The newly created set of controls.
   */
  static create(
    pointer: WindowPointer,
    raycaster: THREE.Raycaster,
    priority: Record<Transformation, number>,
  ): TransformControls {
    const elements = {
      translate: TranslateControls.createElements(),
      rotate: RotateControls.createElements(),
      scale: ResizeControls.createElements(),
    };

    const groupItems = _.mapValues(elements, ({ draggableElements }, key) => ({
      group: Controls.createGroup(draggableElements),
      priority: priority[key as Transformation],
    }));

    const elementDragger = pointer.createDragController<DraggableBase>({
      groups: Object.values(groupItems),
      raycaster: raycaster,
    });

    return new TransformControls(
      {
        translate: new TranslateControls(
          groupItems.translate.group,
          elementDragger,
          elements.translate.visualElements,
        ),
        rotate: new RotateControls(
          groupItems.rotate.group,
          elementDragger,
          elements.rotate.visualElements,
        ),
        scale: new ResizeControls(
          groupItems.scale.group,
          elementDragger,
          elements.scale.visualElements,
        ),
      },
      pointer,
    );
  }

  /**
   * The event forwarders installed on each set of controls, keyed by the
   * controls they are attached to.
   */
  readonly #controlListeners = new Map<Controls, ControlEventForwarders>();

  /**
   * Creates a new set of controls to perform various transformation operations.
   *
   * @protected
   * @param controls A set of controls for each type of transformation.
   * @param pointer The pointer that interacts with the scene.
   */
  constructor(controls: CompositeControls, pointer: WindowPointer) {
    super();

    this.#controls = controls;
    this.pointer = pointer;

    for (const [mode, ctrls] of Object.entries(this.#controls) as [
      Transformation,
      Controls,
    ][]) {
      if (mode === "translate" || mode === "rotate" || mode === "scale") {
        const forwarders: ControlEventForwarders = {
          mouseDown: (e) => {
            if (this.object == null) return;

            this.dispatchEvent({ mode, ...e });
          },
          mouseUp: (e) => {
            if (this.object == null) return;

            this.dispatchEvent({ mode, ...e });
          },
          objectChange: (e) => {
            this.syncMatrix();

            this.dispatchEvent(e);
          },
        };

        ctrls.addEventListener("mouseDown", forwarders.mouseDown);
        ctrls.addEventListener("mouseUp", forwarders.mouseUp);
        ctrls.addEventListener("objectChange", forwarders.objectChange);

        this.#controlListeners.set(ctrls, forwarders);

        this.add(ctrls);
      } else {
        throw new Error(`Unhandled controls type: ${mode}`);
      }
    }

    this.#updateVisibility();
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose(): void {
    for (const [mode, ctrls] of Object.entries(this.#controls) as [
      Transformation,
      Controls,
    ][]) {
      if (mode === "translate" || mode === "rotate" || mode === "scale") {
        const forwarders = this.#controlListeners.get(ctrls);
        if (forwarders != null) {
          ctrls.removeEventListener("mouseDown", forwarders.mouseDown);
          ctrls.removeEventListener("mouseUp", forwarders.mouseUp);
          ctrls.removeEventListener("objectChange", forwarders.objectChange);

          this.#controlListeners.delete(ctrls);
        }

        // Assumes that this object owns the newly created controls
        // This is ensured by making the constructor protected
        ctrls.dispose();

        this.remove(ctrls);
      } else {
        throw new Error(`Unhandled controls type: ${mode}`);
      }
    }
  }

  /**
   * Updates the transform to match that of the current object being transformed.
   *
   * @returns This object.
   */
  syncMatrix(): this {
    for (const controls of Object.values(this.#controls) as Controls[]) {
      controls.syncMatrix();
    }

    return this;
  }

  /**
   * Sets the 3D object that should be transformed and ensures the controls UI is visible.
   *
   * @param object The 3D object that should be transformed.
   * @returns This object.
   */
  attach(object: THREE.Object3D): this {
    this.object = object;

    return this;
  }

  /**
   * Removes the current 3D object from the controls and ensures the helper UI is invisible.
   *
   * @returns This object.
   */
  detach(): this {
    this.object = null;

    return this;
  }

  /**
   * Sets whether to apply constraints to the controls, where applicable.
   *
   * @param value If `true`, applies the constraints.
   * @returns This object.
   */
  setApplyConstraints(value: boolean): this {
    this.#controls.translate.snapToAxis = value;
    this.#controls.scale.clipToAspect = value;

    return this;
  }
}
