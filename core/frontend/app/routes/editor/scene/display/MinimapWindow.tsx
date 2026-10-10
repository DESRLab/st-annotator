import { minBy } from "lodash";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { ThreeUtils, TypeUtils } from "sta/common";

import type { EditorConfig } from "../../config";

import { panControls2D } from "./CameraControls";
import type { MainWindow } from "./MainWindow.tsx";
import { BaseSceneWindow } from "./SceneWindow.tsx";
import type { SceneWindowEventMap } from "./SceneWindow.tsx";

export interface MinimapWindowEventMap extends SceneWindowEventMap {
  "camera-update": { camera: THREE.Camera };
  "markers-change": {};
}

export interface MinimapWindowRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

export interface MinimapMarkerSnapshot {
  camera2DTitle: string;
  camera3DColor: string;
  camera3DLeft: string;
  camera3DStrokeColor: string;
  camera3DTitle: string;
  camera3DTop: string;
  camera3DTransform: string;
}

/**
 * Represents the minimap window of the application.
 *
 */
export class MinimapWindow extends BaseSceneWindow<MinimapWindowEventMap> {
  /**
   * The configuration of the application.
   */
  readonly config: EditorConfig;

  /**
   * The main window containing the scene.
   */
  readonly mainWindow: MainWindow;

  #dom: HTMLDivElement;

  #rect: MinimapWindowRect = { top: 32, left: 32, width: 256, height: 256 };

  /**
   * A DOM element which boundaries define the area in which to render this window.
   *
   * When this window is added to a {@link SceneDisplay}, this element will be
   * added as a sibling of its rendering canvas.
   */
  get dom() {
    return this.#dom;
  }

  get rect(): MinimapWindowRect {
    return this.#rect;
  }

  setRect(rect: MinimapWindowRect): void {
    const previous = this.#rect;
    if (
      previous.top === rect.top &&
      previous.left === rect.left &&
      previous.width === rect.width &&
      previous.height === rect.height
    )
      return;

    this.#rect = rect;
    this.dispatchEvent({ type: "rect-change" });
  }

  /**
   * The camera used to render the 2D (top-down) view of the scene.
   */
  readonly camera2D: THREE.OrthographicCamera;

  /**
   * The size of each pixel of the top-down view in world space.
   *
   * A larger value leads to poorer resolution, but more area can be covered by the view.
   */
  readonly #UNITS_PER_PIXEL: number = 0.1;

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

    this.#updateMarkers();
  };

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
   * Updates whether each set of controls is enabled.
   */
  #updateControlsEnabled() {
    const { enableCameraControls } = this;

    this.controls2D.enabled = enableCameraControls;
  }

  /**
   * An indicator used to locate the 2D camera.
   */
  #markerSnapshot: MinimapMarkerSnapshot = {
    camera2DTitle: "",
    camera3DColor: "yellow",
    camera3DLeft: "50%",
    camera3DStrokeColor: "gold",
    camera3DTitle: "",
    camera3DTop: "50%",
    camera3DTransform: "translate(-50%, -50%)",
  };
  get markerSnapshot(): MinimapMarkerSnapshot {
    return this.#markerSnapshot;
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

  #onControlsChange = this.#wrapChangeHandler(() => {
    const mainWindow = this.mainWindow;

    panControls2D(mainWindow.controls2D, this.camera2D.position);

    this.#updateMarkers();

    this.dispatchEvent({ type: "camera-update", camera: this.getCamera() });
  });

  #onControlsEnd = () => {
    this.dispatchEvent({ type: "camera-update", camera: this.getCamera() });
  };

  #onMainWindowUpdate = () => {
    const mainWindow = this.mainWindow;

    panControls2D(this.controls2D, mainWindow.camera2D.position);

    this.#updateMarkers();
  };

  #updateMarkers = () => {
    const mainWindow = this.mainWindow;

    const camera2DTitle = `(${mainWindow.camera2D.position.x}, ${mainWindow.camera2D.position.z})`;
    const camera3DTitle = `(${mainWindow.camera3D.position.x}, ${mainWindow.camera3D.position.z})`;

    const is3DActive = mainWindow.viewMode === "3D";

    let camera3DColor = is3DActive ? "yellow" : "lightgray";
    const camera3DStrokeColor = is3DActive ? "gold" : "gray";
    let camera3DTop: string;
    let camera3DLeft: string;

    const camera3DNDC = mainWindow.camera3D.position
      .clone()
      .project(this.camera2D);
    const camera3DRelPos = ThreeUtils.getNDCRelPos(camera3DNDC);
    const camera3DRelCoords = new THREE.Vector3(
      camera3DRelPos.x,
      camera3DRelPos.y,
      0,
    );

    const isCamera3DInMinimap =
      0 <= camera3DRelCoords.x &&
      camera3DRelCoords.x <= 1 &&
      0 <= camera3DRelCoords.y &&
      camera3DRelCoords.y <= 1;

    if (isCamera3DInMinimap) {
      camera3DTop = `${camera3DRelCoords.y * 100}%`;
      camera3DLeft = `${camera3DRelCoords.x * 100}%`;
    } else {
      // Project a ray from the center to the camera,
      // then determine where it intersects the box
      const CENTER = new THREE.Vector3(0.5, 0.5, 0);
      const centerToNDC = camera3DRelCoords.clone().sub(CENTER).normalize();
      const ray = new THREE.Ray(CENTER, centerToNDC);
      const boxPlanes = [
        new THREE.Plane().setFromNormalAndCoplanarPoint(
          new THREE.Vector3().setX(-1),
          new THREE.Vector3().setX(0),
        ),
        new THREE.Plane().setFromNormalAndCoplanarPoint(
          new THREE.Vector3().setX(1),
          new THREE.Vector3().setX(1),
        ),
        new THREE.Plane().setFromNormalAndCoplanarPoint(
          new THREE.Vector3().setY(-1),
          new THREE.Vector3().setY(0),
        ),
        new THREE.Plane().setFromNormalAndCoplanarPoint(
          new THREE.Vector3().setY(1),
          new THREE.Vector3().setY(1),
        ),
      ];

      const intersects = boxPlanes
        .map((boxPlane) => ray.intersectPlane(boxPlane, new THREE.Vector3()))
        .filter(TypeUtils.isNotNull);
      const closestIntersect =
        minBy(intersects, (intersect: THREE.Vector3) =>
          intersect.distanceToSquared(CENTER),
        ) ?? CENTER;

      camera3DTop = `${closestIntersect.y * 100}%`;
      camera3DLeft = `${closestIntersect.x * 100}%`;

      // Override the fill color but keep the outline
      camera3DColor = "transparent";
    }

    const target3DNDC = mainWindow.controls3D.target
      .clone()
      .project(this.camera2D);
    const dir3DNDC = target3DNDC.clone().sub(camera3DNDC);
    const dir3DNDCAngle = Math.atan2(dir3DNDC.y, dir3DNDC.x);
    this.#markerSnapshot = {
      camera2DTitle,
      camera3DColor,
      camera3DLeft,
      camera3DStrokeColor,
      camera3DTitle,
      camera3DTop,
      camera3DTransform: `translate(-50%, -50%) rotate(${-dir3DNDCAngle}rad)`,
    };
    this.dispatchEvent({ type: "markers-change" });
  };

  /** Gets the coordinate tooltip content for a minimap pointer event. */
  getPointerTooltipContent(event: PointerEvent): string {
    const pointerNDC = ThreeUtils.getPointerNDC(this.#dom, event);

    // z=-1 corresponds to near plane
    const worldNDC = new THREE.Vector3(
      pointerNDC.x,
      pointerNDC.y,
      -1,
    ).unproject(this.camera2D);

    const worldNDCDb = this.config.coordinateFormat.toDatabaseCoords(worldNDC);

    return `(${worldNDCDb.x.toFixed(3)}, ${worldNDCDb.y.toFixed(3)})`;
  }

  /**
   * Creates a new main window.
   *
   */
  constructor(
    name: string,
    layerId: number,
    config: EditorConfig,
    mainWindow: MainWindow,
    dom: HTMLDivElement,
  ) {
    super(name, layerId);

    this.config = config;

    this.mainWindow = mainWindow;
    this.mainWindow.addEventListener("camera-update", this.#onMainWindowUpdate);

    this.#dom = dom;

    this.camera2D = new THREE.OrthographicCamera(
      -0.5,
      0.5,
      0.5,
      -0.5,
      this.#NEAR,
      this.#FAR,
    );
    this.camera2D.position.setY(50);
    this.camera2D.lookAt(0, 0, 0);
    this.camera2D.layers.set(layerId);

    this.#enableCameraControls = true;

    this.controls2D = new OrbitControls(this.camera2D, this.dom);
    this.controls2D.maxPolarAngle = 0;
    this.controls2D.enableRotate = false;
    this.controls2D.addEventListener("change", this.#onControlsChange);
    this.controls2D.addEventListener("end", this.#onControlsEnd);

    this.#updateControlsEnabled();
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose() {
    this.controls2D.removeEventListener("change", this.#onControlsChange);
    this.controls2D.removeEventListener("end", this.#onControlsEnd);
    this.controls2D.dispose();

    this.mainWindow.removeEventListener(
      "camera-update",
      this.#onMainWindowUpdate,
    );
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
    return this.camera2D;
  }

  /**
   * Gets the corresponding set of controls of {@link MinimapWindow#getCamera}.
   */
  getControls(): OrbitControls {
    return this.controls2D;
  }
}
