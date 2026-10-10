import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { ThreeUtils } from "sta/common";

import {
  panControls2D,
  panControls3D,
  rotateControls3D,
} from "./CameraControls";
import { BaseSceneWindow } from "./SceneWindow.tsx";
import type { SceneWindowEventMap } from "./SceneWindow.tsx";

export type ViewMode = "2D" | "3D";

export interface MainWindowEventMap extends SceneWindowEventMap {
  "camera-update": { camera: THREE.Camera };
  "crosshair-change": {};
  "orbitTarget-change": {};
  "viewMode-change": { viewMode: ViewMode };
}

/**
 * Represents the main window of the application.
 *
 */
export class MainWindow extends BaseSceneWindow<MainWindowEventMap> {
  #dom: HTMLDivElement;

  /**
   * A DOM element which boundaries define the area in which to render this window.
   *
   * When this window is added to a {@link SceneDisplay}, this element will be
   * added as a sibling of its rendering canvas.
   */
  get dom() {
    return this.#dom;
  }

  /**
   * The camera used to render the 2D (top-down) view of the scene.
   */
  readonly camera2D: THREE.OrthographicCamera;

  /**
   * The camera used to render the 3D view of the scene.
   */
  readonly camera3D: THREE.PerspectiveCamera;

  /**
   * The size of each pixel of the top-down view in world space.
   *
   * A larger value leads to poorer resolution, but more area can be covered by the view.
   */
  readonly #UNITS_PER_PIXEL: number = 0.05;

  /**
   * The near plane for each camera.
   */
  readonly #NEAR: number = ThreeUtils.EPSILON;

  /**
   * The far plane for each camera.
   */
  readonly #FAR: number = 1 / ThreeUtils.EPSILON;

  /**
   * Updates each camera to fit the DOM element of this window.
   */
  updateCameraAspects = (): void => {
    const { width, height } = this.dom.getBoundingClientRect();

    const widthUnits = width * this.#UNITS_PER_PIXEL;
    const heightUnits = height * this.#UNITS_PER_PIXEL;

    this.camera2D.left = widthUnits / -2;
    this.camera2D.right = widthUnits / 2;
    this.camera2D.top = heightUnits / 2;
    this.camera2D.bottom = heightUnits / -2;
    this.camera2D.updateProjectionMatrix();

    this.camera3D.aspect = widthUnits / heightUnits;
    this.camera3D.updateProjectionMatrix();
  };

  #viewMode: ViewMode;

  /**
   * If `'2D'`, a top-down view of the scene is rendered; if `'3D'`, a three-dimensional
   * view of the scene is rendered.
   */
  get viewMode() {
    return this.#viewMode;
  }

  set viewMode(value) {
    if (this.#viewMode !== value) {
      this.#viewMode = value;

      this.#updateControlsEnabled();

      this.dispatchEvent({ type: "viewMode-change", viewMode: value });

      // Since the result of this.getCamera() changes
      this.dispatchEvent({
        type: "camera-update",
        camera: this.getCamera(),
      });
    }
  }

  #enableCameraControls: boolean;

  /**
   * `true` if the user can manipulate the camera; otherwise, `false`.
   */
  get enableCameraControls() {
    return this.#enableCameraControls;
  }

  set enableCameraControls(value) {
    if (this.#enableCameraControls !== value) {
      this.#enableCameraControls = value;

      this.#updateControlsEnabled();
    }
  }

  /**
   * The controls used to move the camera used to render the 2D (top-down) view of the scene.
   */
  readonly controls2D: OrbitControls;

  /**
   * The controls used to move the camera used to render the 3D view of the scene.
   */
  readonly controls3D: OrbitControls;

  /**
   * Updates whether each set of controls is enabled.
   */
  #updateControlsEnabled() {
    const { enableCameraControls, viewMode } = this;

    this.controls2D.enabled = enableCameraControls && viewMode === "2D";
    this.controls3D.enabled = enableCameraControls && viewMode === "3D";
  }

  /**
   * A crosshair shown when the camera is being manipulated and the orbit target of
   * the camera is overriden.
   */
  #crosshairVisible = false;
  get crosshairVisible(): boolean {
    return this.#crosshairVisible;
  }

  #setCrosshairVisible(visible: boolean): void {
    if (this.#crosshairVisible === visible) return;
    this.#crosshairVisible = visible;
    this.dispatchEvent({ type: "crosshair-change" });
  }

  #overrideOrbitTarget:
    | ((defaultTarget: THREE.Vector3, camera: THREE.Camera) => THREE.Vector3)
    | null = null;

  /**
   * If given, the orbit target of the camera controls of this window is overriden with
   * the return value of this function, which accepts the default orbit target and
   * the state of the active camera.
   */
  get overrideOrbitTarget() {
    return this.#overrideOrbitTarget;
  }

  set overrideOrbitTarget(value) {
    if (this.#overrideOrbitTarget !== value) {
      this.#overrideOrbitTarget = value;
      this.dispatchEvent({ type: "orbitTarget-change" });
    }
  }

  /**
   * Prevents infinite recursion when updating the controls while handling
   * the `change` event of {@link OrbitControls}.
   *
   */
  #wrapChangeHandler(handler: () => void) {
    let isHandlingChange = false;

    return () => {
      if (isHandlingChange) return;

      try {
        isHandlingChange = true;

        handler();
      } finally {
        isHandlingChange = false;
      }
    };
  }

  /**
   * Handles the event when a set of controls begins to be manipulated.
   *
   */
  #handleControlsStart(controls: OrbitControls) {
    const overrideOrbitTarget = this.overrideOrbitTarget;
    if (overrideOrbitTarget == null) return;

    const newTarget = overrideOrbitTarget(
      controls.target.clone(),
      controls.object,
    );
    controls.target.copy(newTarget);

    this.#setCrosshairVisible(true);
  }

  #onControls2DStart = () => {
    this.#handleControlsStart(this.controls2D);
  };

  #onControls2DChange = this.#wrapChangeHandler(() => {
    // Keep the target of the two controls the same along the horizontal
    const panDelta2D = this.controls2D.target
      .clone()
      .sub(this.controls3D.target)
      .setY(0);
    const nextPos = this.controls3D.object.position.clone().add(panDelta2D);
    panControls2D(this.controls3D, nextPos);

    this.dispatchEvent({ type: "camera-update", camera: this.getCamera() });
  });

  #onControls2DEnd = () => {
    this.#setCrosshairVisible(false);

    this.dispatchEvent({ type: "camera-update", camera: this.getCamera() });
  };

  #onControls3DStart = () => {
    this.#handleControlsStart(this.controls3D);
  };

  #onControls3DChange = this.#wrapChangeHandler(() => {
    // Keep the target of the two controls the same along the horizontal
    const panDelta2D = this.controls3D.target
      .clone()
      .sub(this.controls2D.target)
      .setY(0);
    const nextPos = this.controls2D.object.position.clone().add(panDelta2D);
    panControls2D(this.controls2D, nextPos);

    this.dispatchEvent({ type: "camera-update", camera: this.getCamera() });
  });

  #onControls3DEnd = () => {
    this.#setCrosshairVisible(false);

    this.dispatchEvent({ type: "camera-update", camera: this.getCamera() });
  };

  #attachControls = () => {
    this.controls2D.addEventListener("start", this.#onControls2DStart);
    this.controls2D.addEventListener("change", this.#onControls2DChange);
    this.controls2D.addEventListener("end", this.#onControls2DEnd);
    this.controls3D.addEventListener("start", this.#onControls3DStart);
    this.controls3D.addEventListener("change", this.#onControls3DChange);
    this.controls3D.addEventListener("end", this.#onControls3DEnd);
  };

  #detachControls = () => {
    this.controls2D.removeEventListener("start", this.#onControls2DStart);
    this.controls2D.removeEventListener("change", this.#onControls2DChange);
    this.controls2D.removeEventListener("end", this.#onControls2DEnd);

    this.controls3D.removeEventListener("start", this.#onControls3DStart);
    this.controls3D.removeEventListener("change", this.#onControls3DChange);
    this.controls3D.removeEventListener("end", this.#onControls3DEnd);
  };

  /**
   * Creates a new main window.
   *
   */
  constructor(name: string, layerId: number, dom: HTMLDivElement) {
    super(name, layerId);

    this.#dom = dom;

    this.camera2D = new THREE.OrthographicCamera(
      -0.5,
      0.5,
      0.5,
      -0.5,
      this.#NEAR,
      this.#FAR,
    );
    this.camera2D.position.setY(25);
    this.camera2D.lookAt(0, 0, 0);
    this.camera2D.layers.set(layerId);

    this.camera3D = new THREE.PerspectiveCamera(30, 1, this.#NEAR, this.#FAR);
    this.camera3D.position.setY(25);
    this.camera3D.lookAt(0, 0, 0);
    this.camera3D.layers.set(layerId);

    this.#viewMode = "2D";
    this.#enableCameraControls = true;

    this.controls2D = new OrbitControls(this.camera2D, this.dom);
    this.controls2D.maxPolarAngle = 0;

    this.controls3D = new OrbitControls(this.camera3D, this.dom);
    this.controls3D.minDistance = ThreeUtils.EPSILON;

    this.#attachControls();
    this.#updateControlsEnabled();
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose() {
    this.#detachControls();
    this.controls2D.dispose();
    this.controls3D.dispose();
    super.dispose();
  }

  /**
   * Gets the camera used to render this window.
   *
   * This camera should be located in world space,
   * rather than being relative to the current frame.
   *
   * Unlike other attributes of this window, a different camera may be returned
   * each time this is called.
   */
  getCamera(): THREE.Camera {
    switch (this.viewMode) {
      case "2D":
        return this.camera2D;
      case "3D":
        return this.camera3D;
      default:
        throw new Error(`Unhandled viewMode: ${this.viewMode}`);
    }
  }

  /**
   * Gets the corresponding set of controls of {@link MainWindow#getCamera}.
   */
  getControls(): OrbitControls {
    switch (this.viewMode) {
      case "2D":
        return this.controls2D;
      case "3D":
        return this.controls3D;
      default:
        throw new Error(`Unhandled viewMode: ${this.viewMode}`);
    }
  }

  /**
   * Sets the pose of the 3D camera, updating the 2D camera to be directly
   * above the target.
   *
   */
  setPose3D(position3D: THREE.Vector3, target3D: THREE.Vector3) {
    // Avoid unintentional interactions between 2D and 3D controls
    this.#detachControls();

    try {
      this.#panCamera3D(position3D);
      rotateControls3D(this.controls3D, target3D);
    } finally {
      this.#attachControls();
    }

    this.dispatchEvent({ type: "camera-update", camera: this.getCamera() });
  }

  /**
   * Inner logic of {@link MainWindow#panCamera3D}.
   *
   */
  #panCamera3D(position3D: THREE.Vector3) {
    const delta3DTo2D = this.camera2D.position
      .clone()
      .sub(this.camera3D.position);
    const position2D = position3D.clone().add(delta3DTo2D);

    panControls3D(this.controls3D, position3D);
    panControls3D(this.controls2D, position2D);
  }

  /**
   * Pans the 3D camera to the given position, updating the 2D camera to
   * maintain its position and direction relative to the 3D camera.
   *
   */
  panCamera3D(position3D: THREE.Vector3) {
    // Avoid unintentional interactions between 2D and 3D controls
    this.#detachControls();

    try {
      this.#panCamera3D(position3D);
    } finally {
      this.#attachControls();
    }

    this.dispatchEvent({ type: "camera-update", camera: this.getCamera() });
  }
}
