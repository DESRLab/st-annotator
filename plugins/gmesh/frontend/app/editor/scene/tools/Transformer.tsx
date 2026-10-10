import * as THREE from "three";

import { TransformControls } from "sta/app/editor";
import type { WindowPointer, Transformation } from "sta/app/editor";

import type { GroundMesh } from "../data";
import type { TransformerSettingsPaneControllerParams } from "../widgets/index.ts";

import { SnapToGroundMesh } from "./SnapToGroundMesh";

export type LocalTransform = Readonly<{
  position: Readonly<THREE.Vector3>;
  rotation: Readonly<THREE.Euler>;
  scale: Readonly<THREE.Vector3>;
}>;

export interface UpdateTransformEvent<T> {
  mode: string;
  obj: T;
  prevTransform: LocalTransform;
}

export interface TransformerEventMap<T> {
  begin: { obj: T };
  abort: { obj: T };
  checkpoint: UpdateTransformEvent<T>;
  "settings-change": {};
}

/**
 * Transforms an object using a gizmo.
 *
 */
export class Transformer<T> extends THREE.EventDispatcher<
  TransformerEventMap<T>
> {
  /**
   * A function which returns the `three.js` representation of an object.
   */
  readonly getObj3D;

  /**
   * Maintains the elevation of the object relative to the ground mesh.
   */
  #snapper;

  /**
   * A reference ground mesh used to adjust the elevation during the
   * transformation process.
   */
  get groundMesh() {
    return this.#snapper.groundMesh;
  }

  set groundMesh(value) {
    this.#snapper.groundMesh = value;
  }

  /**
   * The pose of the object at the beginning of the current transformation.
   * It is not modified during the transformation.
   */
  #startTransform: LocalTransform | null = null;

  /**
   * Whether an object is selected.
   */
  get hasSelection() {
    return this.#startTransform != null;
  }

  #currentObj: T | null = null;

  /**
   * The object to be transformed, if any.
   * It is modified during the transformation.
   */
  get selectedObj() {
    return this.#currentObj;
  }

  /**
   * Sets or unsets the stored state of an object.
   *
   * otherwise, unsets the state to finish transforming the current object.
   */
  #setState(obj: T | null) {
    if (obj == null) {
      this.#startTransform = null;

      this.#currentObj = null;
      this.#snapper.detach();
    } else {
      const obj3D = this.getObj3D(obj);

      this.#startTransform = {
        position: obj3D.position.clone(),
        rotation: obj3D.rotation.clone(),
        scale: obj3D.scale.clone(),
      };

      this.#currentObj = obj;
      this.#snapper.attach(obj3D);
    }
  }

  #disabled = true;

  /**
   * `true` if this transformer is disabled; otherwise, `false.`
   *
   * If set to `true` while an object is being transformed, aborts the process.
   */
  get disabled() {
    return this.#disabled;
  }

  set disabled(value) {
    if (this.#disabled !== value) {
      this.#disabled = value;

      if (this.#currentObj != null) {
        if (value) {
          // enabled -> disabled: Unattach the gizmo
          this.abort();
        } else {
          // disabled -> enabled: Reattach the gizmo
          this.select(this.#currentObj);
        }
      }

      this.render();
    }
  }

  /**
   * The controls for transforming the object.
   */
  readonly #controls;

  /**
   * Whether an object is being transformed.
   */
  get isTransforming() {
    return this.#controls.mode != null;
  }

  /**
   * Whether a set of controls is enabled.
   *
   * set of controls.
   */
  isControlsEnabled(transformation: Transformation): boolean {
    return this.#controls.isControlsEnabled(transformation);
  }

  /**
   * Sets whether a set of controls is enabled.
   *
   * set of controls.
   * it is disabled.
   */
  setControlsEnabled(transformation: Transformation, isEnabled: boolean) {
    const currentObj = this.#currentObj;

    this.deselect();

    this.#controls.setControlsEnabled(transformation, isEnabled);

    if (currentObj != null) {
      this.select(currentObj);
    }

    this.render();
  }

  /**
   * Toggles whether a set of controls is enabled.
   *
   * set of controls.
   */
  toggleControlsEnabled(transformation: Transformation) {
    this.setControlsEnabled(
      transformation,
      !this.isControlsEnabled(transformation),
    );
  }

  /**
   * Whether to disable moving the object along the `x` and `z` axis.
   *
   */
  get disableMoveXZ() {
    return this.#controls.disableMoveXZ;
  }

  set disableMoveXZ(value) {
    this.#controls.disableMoveXZ = value;
  }

  /**
   * Whether to disable moving and resizing the object along the `y` axis.
   *
   */
  get disableMoveResizeY() {
    return this.#controls.disableMoveResizeY;
  }

  set disableMoveResizeY(value) {
    this.#controls.disableMoveResizeY = value;
  }

  /**
   * Whether to disable resizing the object along any plane.
   */
  get disablePlaneResize() {
    return this.#controls.disablePlaneResize;
  }

  set disablePlaneResize(value) {
    this.#controls.disablePlaneResize = value;
  }

  /**
   * Whether to disable automatically adjusting the elevation of the object during
   * horizontal translation to maintain its elevation relative to the ground mesh.
   */
  get disableRelElevation() {
    return this.#snapper.disabled;
  }

  set disableRelElevation(value) {
    this.#snapper.disabled = value;
  }

  /**
   * Allows the user to update the settings of the gizmo.
   */
  #settingsInputtedData: TransformerSettingsPaneControllerParams["inputtedData"];

  #settingsPaneSettings: TransformerSettingsPaneControllerParams["settings"];

  /**
   * Handles the event when the user action is changed.
   *
   * The event to handle.
   */
  #onSettingsChange = (
    inputtedData: TransformerSettingsPaneControllerParams["inputtedData"],
  ) => {
    this.#settingsInputtedData = inputtedData;
    this.#notifySettingsChange();
    const { isTransformSelected } = inputtedData;

    this.setControlsEnabled("translate", isTransformSelected.translate);
    this.setControlsEnabled("rotate", isTransformSelected.rotate);
    this.setControlsEnabled("scale", isTransformSelected.scale);
  };

  #onControlsMouseDown = () => {
    if (this.disabled) return;

    const currentObj = this.#currentObj;
    if (currentObj == null) {
      throw new Error("No object being transformed");
    }

    this.#setState(currentObj);

    this.dispatchEvent({ type: "begin", obj: currentObj });
  };

  #onControlsObjectChange = () => {
    if (this.disabled) return;

    const controls = this.#controls;
    if (
      controls.mode === "translate" &&
      !(controls.axis_or_plane ?? []).includes("Y")
    ) {
      this.#snapper.snapToMesh();
    }
  };

  #onControlsMouseUp = (event: { mode: Transformation }) => {
    if (this.disabled) return;

    this.#checkpoint(event.mode);
  };

  /**
   * Creates a new object transformer.
   *
   * representation of an object.
   * adjust the elevation during the transformation process.
   */
  constructor(
    pointer: WindowPointer,
    raycaster: THREE.Raycaster,
    getObj3D: (obj: T) => THREE.Object3D,
    groundMesh: GroundMesh | null = null,
  ) {
    super();

    this.getObj3D = getObj3D;
    this.#snapper = new SnapToGroundMesh(groundMesh);

    this.#settingsInputtedData = {
      isTransformSelected: {
        translate: true,
        rotate: true,
        scale: true,
      },
    };
    this.#settingsPaneSettings = { disabled: false, hidden: false };

    this.#controls = TransformControls.create(pointer, raycaster, {
      rotate: 3,
      scale: 2,
      translate: 1,
    });
    this.#controls.addEventListener("mouseDown", this.#onControlsMouseDown);
    this.#controls.addEventListener(
      "objectChange",
      this.#onControlsObjectChange,
    );
    this.#controls.addEventListener("mouseUp", this.#onControlsMouseUp);
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose() {
    this.#controls.removeEventListener("mouseDown", this.#onControlsMouseDown);
    this.#controls.removeEventListener(
      "objectChange",
      this.#onControlsObjectChange,
    );
    this.#controls.removeEventListener("mouseUp", this.#onControlsMouseUp);
    this.#controls.dispose();
  }

  /**
   * Selects an object to transform.
   */
  select(obj: T) {
    if (this.hasSelection) {
      this.deselect();
    }

    this.#setState(obj);

    if (!this.disabled) {
      const obj3D = this.getObj3D(obj);
      this.#controls.attach(obj3D);
    }
  }

  /**
   * Rotates the heading of the object by 90 degrees anticlockwise.
   *
   * This is a no-op if there is no selected object, or if it is being transformed.
   */
  rotateHeading() {
    if (!this.hasSelection) return;
    if (this.isTransforming) return;

    const currentObj = this.#currentObj;
    if (currentObj == null) {
      throw new Error("No object being transformed");
    }

    const obj3D = this.getObj3D(currentObj);
    obj3D.rotation.y += Math.PI / 2;
    [obj3D.scale.x, obj3D.scale.z] = [obj3D.scale.z, obj3D.scale.x];

    this.#checkpoint("rotate-heading");
  }

  /**
   * Saves the current transform of the object.
   */
  #checkpoint(mode: Transformation | "rotate-heading") {
    const startTransform = this.#startTransform;
    if (startTransform == null) {
      throw new Error("No object being transformed");
    }

    const currentObj = this.#currentObj;
    if (currentObj == null) {
      throw new Error("No object being transformed");
    }

    const obj3D = this.getObj3D(currentObj);
    if (
      obj3D.position.equals(startTransform.position) &&
      obj3D.rotation.equals(startTransform.rotation) &&
      obj3D.scale.equals(startTransform.scale)
    ) {
      // No transformation has been made, so this call is redundant
      return;
    }

    this.#controls.syncMatrix();

    this.#setState(currentObj);

    this.dispatchEvent({
      type: "checkpoint",
      mode: mode,
      obj: currentObj,
      prevTransform: startTransform,
    });
  }

  /**
   * Deselects the object so it can no longer be transformed.
   *
   * This is a no-op if there is no selected box.
   */
  deselect() {
    if (!this.hasSelection) return;

    this.abort();

    this.#controls.detach();

    this.#setState(null);
  }

  /**
   * Aborts the current ongoing transformation.
   *
   * This is a no-op if no object is being transformed.
   */
  abort() {
    if (!this.isTransforming) return;

    const startTransform = this.#startTransform;
    if (startTransform == null) {
      throw new Error("No object being selected");
    }

    const currentObj = this.#currentObj;
    if (currentObj == null) {
      throw new Error("No object being transformed");
    }

    this.#controls.detach();

    const obj3D = this.getObj3D(currentObj);
    obj3D.position.copy(startTransform.position);
    obj3D.rotation.copy(startTransform.rotation);
    obj3D.scale.copy(startTransform.scale);

    if (!this.disabled) {
      this.#controls.attach(obj3D);
    }

    this.dispatchEvent({ type: "abort", obj: currentObj });
  }

  /**
   * Gets the `three.js` object representing the active controls.
   *
   * or if the transformer is disabled.
   */
  getControls(): THREE.Object3D | null {
    return this.hasSelection && !this.disabled ? this.#controls : null;
  }

  /**
   * Updates the DOM of this object to match its internal state.
   */
  render() {
    this.#settingsInputtedData = {
      isTransformSelected: {
        translate: this.isControlsEnabled("translate"),
        rotate: this.isControlsEnabled("rotate"),
        scale: this.isControlsEnabled("scale"),
      },
    };
    this.#settingsPaneSettings = { disabled: this.disabled, hidden: false };
    this.#notifySettingsChange();
  }

  /**
   * Sets whether to apply constraints to the controls, where applicable.
   */
  setApplyConstraints(value: boolean): this {
    this.#controls.setApplyConstraints(value);

    return this;
  }

  get settingsPaneParams(): Pick<
    TransformerSettingsPaneControllerParams,
    "inputtedData" | "settings"
  > {
    return {
      inputtedData: this.#settingsInputtedData,
      settings: this.#settingsPaneSettings,
    };
  }

  onSettingsInputChange = (
    inputtedData: TransformerSettingsPaneControllerParams["inputtedData"],
  ): void => {
    this.#onSettingsChange(inputtedData);
  };

  #notifySettingsChange(): void {
    this.dispatchEvent({ type: "settings-change" });
  }
}
