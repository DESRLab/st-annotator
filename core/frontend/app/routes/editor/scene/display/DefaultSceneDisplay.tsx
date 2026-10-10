import { OptionalVector3 } from "sta/common";

import type { NavFrameEvent, SceneContext } from "../SceneContext";

import { MainWindow } from "./MainWindow.tsx";
import { MinimapWindow } from "./MinimapWindow.tsx";
import { BaseSceneDisplay } from "./SceneDisplay.tsx";

// A type alias, not an interface: the alias's implicit string index
// signature is what lets it satisfy the WindowMapper
// (Record<string, SceneWindow>) constraints used across the editor.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type DefaultWindowMapper = { main: MainWindow; minimap: MinimapWindow };

/** React-owned DOM elements used by the default scene display. */
export interface DefaultSceneDisplayElements {
  canvas: HTMLCanvasElement;
  displayDom: HTMLDivElement;
  mainWindowDom: HTMLDivElement;
  minimapWindowDom: HTMLDivElement;
}

/**
 * Represents the default display of the application.
 *
 */
export class DefaultSceneDisplay extends BaseSceneDisplay<DefaultWindowMapper> {
  /**
   * Handles the event when the context navigates to a different frame.
   *
   */
  #onNavFrame = (event: NavFrameEvent) => {
    const { prevFrame, frame } = event;
    const {
      coordinateFormat,
      initCameraPosition: initDbPosition,
      initCameraTarget: initDbTarget,
    } = this.context.config;

    if (prevFrame != null && frame != null) {
      const prevThreePosition = this.windows.main.camera2D.position;
      const prevDbPosition =
        coordinateFormat.toDatabaseCoords(prevThreePosition);
      const { xBounds, yBounds } = frame.st_bounds.getSpatialBounds();

      // No need to pan the camera
      if (
        xBounds.contains(prevDbPosition.x) &&
        yBounds.contains(prevDbPosition.y)
      )
        return;
    }

    const dbCenter = frame?.getSpatialCenter() ?? new OptionalVector3();
    const threeCenter = coordinateFormat.toThreeJSCoords(dbCenter);

    const initThreePosition = coordinateFormat.toThreeJSCoords(initDbPosition);
    const initThreeTarget = coordinateFormat.toThreeJSCoords(initDbTarget);

    this.setMainCameraPose(
      threeCenter.clone().fillScalar(0).add(initThreePosition),
      threeCenter.clone().fillScalar(0).add(initThreeTarget),
    );
  };

  /**
   * Creates a new default display.
   *
   */
  constructor(
    context: SceneContext<any>,
    elements: DefaultSceneDisplayElements,
  ) {
    const mainWindow = new MainWindow("Main", 0, elements.mainWindowDom);
    const minimapWindow = new MinimapWindow(
      "Minimap",
      1,
      context.config,
      mainWindow,
      elements.minimapWindowDom,
    );

    super(
      context as SceneContext<DefaultWindowMapper>,
      {
        main: mainWindow,
        minimap: minimapWindow,
      },
      { canvas: elements.canvas, dom: elements.displayDom },
    );

    this.context.addEventListener("nav-frame", this.#onNavFrame);
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose() {
    this.context.removeEventListener("nav-frame", this.#onNavFrame);

    super.dispose();
  }

  /**
   * Set the position and target of the cameras used to render the main window.
   *
   * The other cameras are also updated accordingly.
   *
   */
  setMainCameraPose(position: THREE.Vector3, target: THREE.Vector3) {
    // This should update the minimap automatically
    this.windows.main.setPose3D(position, target);
  }

  /**
   * Set the position of the cameras used to render the main window.
   *
   * The other cameras are also updated accordingly.
   *
   * The orbit target of each camera is also updated accordingly as if the
   * camera was panned.
   *
   */
  panMainCamera(position: THREE.Vector3) {
    // This should update the minimap automatically
    this.windows.main.panCamera3D(position);
  }
}
