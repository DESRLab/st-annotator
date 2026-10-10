import * as THREE from "three";

import type { EditorConfig, WindowPointer } from "sta/app/editor";
import { ThreeUtils } from "sta/common";

import { GeoUtils } from "../../utils";
import type { ReadonlyLabelVector } from "../data";
import type { TransformerSettingsPaneControllerParams } from "../widgets";

import { TransformControls } from "./TransformControls";
import type { Transformation } from "./TransformControls";
export type { Transformation };

export type LocalTransform = Readonly<{
  vectorCoords: readonly THREE.Vector3[];
}>;

export interface UpdateTransformEvent {
  mode: string;
  obj: ReadonlyLabelVector;
  prevTransform: LocalTransform;
}

export interface VectorTransformerEventMap {
  begin: { obj: ReadonlyLabelVector };
  abort: { obj: ReadonlyLabelVector };
  checkpoint: UpdateTransformEvent;
  "settings-change": {};
}

export class VectorTransformer extends THREE.EventDispatcher<VectorTransformerEventMap> {
  readonly pointer;

  readonly raycaster;

  readonly config;

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

  #currentObj: ReadonlyLabelVector | null = null;

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
  #setState(obj: ReadonlyLabelVector | null) {
    if (obj == null) {
      this.#startTransform = null;
      this.#currentObj = null;
    } else {
      const currentObj = obj;

      this.#startTransform = {
        vectorCoords: obj.vectorCoords,
      };

      this.#currentObj = currentObj;
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
          this.abort();
        } else {
          this.select(this.#currentObj);
        }
      }

      this.render();
    }
  }

  /**
   * The controls for transforming vector object.
   */
  readonly #controls;

  /**
   * Whether an object is being transfromed.
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
  get disableMoveY() {
    return this.#controls.disableMoveY;
  }

  set disableMoveY(value) {
    this.#controls.disableMoveY = value;
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

    this.setControlsEnabled("vertex", isTransformSelected.vertex);
    this.setControlsEnabled("vertices", isTransformSelected.vertices);
  };

  /**
   * Creates a new object transformer.
   */
  constructor(
    config: EditorConfig,
    pointer: WindowPointer,
    raycaster: THREE.Raycaster,
  ) {
    super();

    this.config = config;
    this.pointer = pointer;
    this.raycaster = raycaster;

    this.#settingsInputtedData = {
      isTransformSelected: {
        vertex: true,
        vertices: true,
      },
    };
    this.#settingsPaneSettings = { disabled: false, hidden: false };

    this.#controls = new TransformControls(pointer, raycaster);

    this.#controls.addEventListener("mouseDown", this.#onControlsMouseDown);
    this.#controls.addEventListener("mouseUp", this.#onControlsMouseUp);
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose() {
    this.#controls.removeEventListener("mouseDown", this.#onControlsMouseDown);
    this.#controls.removeEventListener("mouseUp", this.#onControlsMouseUp);
    this.#controls.dispose();
  }

  #onControlsMouseDown = () => {
    if (this.disabled) return;

    const currentObj = this.#currentObj;
    if (currentObj == null) {
      throw new Error("No object being transformed");
    }

    this.#setState(currentObj);

    this.dispatchEvent({ type: "begin", obj: currentObj });
  };

  #onControlsMouseUp = (event: { mode: Transformation }) => {
    if (this.disabled) return;

    this.#checkpoint(event.mode);
  };

  /**
   * Saves the current transform of the object.
   */
  #checkpoint(mode: Transformation) {
    const startTransform = this.#startTransform;
    if (startTransform == null) {
      throw new Error("No object being transformed");
    }

    const currentObj = this.#currentObj;
    if (currentObj == null) {
      throw new Error("No object being transformed");
    }

    const format = this.config.coordinateFormat;
    const currentVertices = currentObj.vertices;
    const startVertices = startTransform.vectorCoords;

    const startVerticesInDB = startVertices.map((vertex) =>
      format.toDatabaseCoords(vertex),
    );

    if (ThreeUtils.areVerticesEqual(currentVertices, startVerticesInDB)) {
      // No transformation has been made, so this call is redundant
      return;
    }

    if (!GeoUtils.isValidVector(currentVertices, currentObj.vectorType)) {
      currentObj.rollbackCoords(startVertices);
      this.select(currentObj);
      return;
    }

    this.#setState(currentObj);

    this.dispatchEvent({
      type: "checkpoint",
      mode: mode,
      obj: currentObj,
      prevTransform: startTransform,
    });
  }

  /**
   * Selects an object to transform.
   */
  select(obj: ReadonlyLabelVector) {
    if (this.hasSelection) {
      this.deselect();
    }

    this.#setState(obj);

    if (!this.disabled) {
      this.#controls.object = obj.getGeo();
    }
  }

  /**
   * Deselects the object so it can no longer be transformed.
   *
   * This is a no-op if there is no selected box.
   */
  deselect() {
    if (!this.hasSelection) return;

    this.abort();

    this.#controls.object = null;

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

    this.#controls.object = null;

    currentObj.rollbackCoords(startTransform.vectorCoords);

    if (!this.disabled) {
      this.#controls.object = currentObj.getGeo();
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

  render() {
    this.#settingsInputtedData = {
      isTransformSelected: {
        vertex: this.isControlsEnabled("vertex"),
        vertices: this.isControlsEnabled("vertices"),
      },
    };
    this.#settingsPaneSettings = { disabled: this.disabled, hidden: false };
    this.#notifySettingsChange();
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
