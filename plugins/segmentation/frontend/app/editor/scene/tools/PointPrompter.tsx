import * as THREE from "three";

import type {
  InteractController,
  ScenePointerEvent,
  WindowPointer,
} from "sta/app/editor";

import type { PointCloudUtils } from "../utils";

/**
 * Defines each event that can be dispatched by {@link PointPrompter}.
 */
export interface PointPrompterEventMap {
  /** The event when prompting a point has been aborted. */
  abort: { vertex: THREE.Vector3; label: number };
  /** The event when a point has been prompted. */
  end: { vertex: THREE.Vector3; label: number };
}

/** The maximum distance between the raycast hit and a point for the hit to snap to the point. */
const MAX_SNAP_DISTANCE = 5;

/**
 * Captures point prompts by raycasting the point cloud, snapping each pointer
 * press to the nearest real point of the cloud.
 */
export class PointPrompter extends THREE.EventDispatcher<PointPrompterEventMap> {
  /**
   * The canvas where this object renders on.
   */
  readonly canvas: HTMLCanvasElement;

  readonly #context: CanvasRenderingContext2D;

  /**
   * The 2d context of this object is drawn.
   */
  get context(): CanvasRenderingContext2D {
    return this.#context;
  }

  /**
   * The pointer that is used to interact with the scene.
   */
  readonly pointer: WindowPointer;

  readonly #interactor: InteractController<unknown>;

  /**
   * Raycasts the pointer to the rendered scene.
   */
  get raycaster(): THREE.Raycaster {
    return this.#interactor.raycaster;
  }

  #pcdObj: THREE.Object3D | null = null;

  /** The `three.js` object displaying the point cloud to prompt against. */
  get pcdObj(): THREE.Object3D | null {
    return this.#pcdObj;
  }

  set pcdObj(value: THREE.Object3D | null) {
    if (this.#pcdObj !== value) {
      this.#pcdObj = value;
    }
  }

  #pcdUtils: PointCloudUtils | null = null;

  /** The copied point cloud of the current source in the frame. */
  get pcdUtils(): PointCloudUtils | null {
    return this.#pcdUtils;
  }

  set pcdUtils(value: PointCloudUtils | null) {
    if (this.#pcdUtils !== value) {
      this.#pcdUtils = value;
    }
  }

  #enabled = false;

  /**
   * `true` if this prompter is enabled; otherwise, `false`.
   *
   * If set to `false` while a point is being prompted, aborts the process.
   */
  get enabled(): boolean {
    return this.#enabled;
  }

  set enabled(value: boolean) {
    if (this.#enabled !== value) {
      this.#enabled = value;

      if (!value) {
        this.abort();
      }
    }
  }

  #strokeColor: THREE.Color = new THREE.Color("red");

  /**
   * The color display of each prompted point.
   */
  get strokeColor(): THREE.Color {
    return this.#strokeColor;
  }

  set strokeColor(value: THREE.Color) {
    if (value != null) {
      if (!this.#strokeColor.equals(value)) {
        this.#strokeColor = new THREE.Color(value);
      }
    }
  }

  #pointSize = 10;

  /**
   * The display size of each prompted point.
   */
  get pointSize(): number {
    return this.#pointSize;
  }

  set pointSize(value: number) {
    if (value != null) {
      if (this.#pointSize !== value) {
        this.#pointSize = value;
      }
    }
  }

  /**
   * Gets the position of the pointer in world space by raycasting it to a horizontal plane.
   *
   * @param elevation The elevation of the horizontal plane in world space.
   * @param fallbackDistance If the direction of the camera is parallel to the plane,
   * this parameter specifies how far the pointer should be from the camera.
   * @returns The requested position. If the direction of the camera is parallel
   * to the plane, instead returns a position that is `fallbackDistance` in front of the camera.
   */
  #getPointerWorldPos(elevation = 0, fallbackDistance = 10): THREE.Vector3 {
    const { camera, ray } = this.raycaster;

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -elevation);
    const planeIntersect = ray.intersectPlane(plane, new THREE.Vector3());
    if (planeIntersect != null) return planeIntersect;

    const localPos = ray.origin
      .clone()
      .add(ray.direction.clone().multiplyScalar(fallbackDistance));

    return camera.localToWorld(localPos);
  }

  /**
   * Gets the position of the pointer in world space by raycasting the point cloud and
   * snapping the hit to the nearest real point of the cloud.
   *
   * @param elevation The elevation of the fallback horizontal plane in world space.
   * @param fallbackDistance If the point cloud cannot be raycast,
   * this parameter specifies how far the pointer should be from the camera.
   * @returns The requested position.
   */
  #getPointerWorldPosByIntersection(
    elevation = 0,
    fallbackDistance = 10,
  ): THREE.Vector3 {
    const { pcdObj, raycaster, pcdUtils } = this;

    if (pcdObj != null && pcdUtils != null) {
      const [intersect] = raycaster.intersectObjects([pcdObj], false);

      if (intersect != null) {
        const [nearest] = pcdUtils.kTree.nearest(
          intersect.point,
          1,
          MAX_SNAP_DISTANCE,
        );

        if (nearest != null) {
          return nearest[0].clone();
        }

        return intersect.point.clone();
      }
    }

    return this.#getPointerWorldPos(elevation, fallbackDistance);
  }

  /**
   * Calculates the pointer coordinates on canvas.
   *
   * @param event The mouse/pointer event.
   * @returns The pixel coordinates of pointer position on HTML canvas.
   */
  getPointerPixelPos(event: ScenePointerEvent): THREE.Vector2 {
    const { pageX, pageY } = event;

    const x = pageX - this.canvas.offsetLeft;
    const y = pageY - this.canvas.offsetTop;

    return new THREE.Vector2(x, y);
  }

  /**
   * The point being prompted and its related metadata.
   */
  #newPromptData: {
    vertexPixelPos: THREE.Vector2;
    vertexWorldPos: THREE.Vector3;
    label: number;
  } = {
    vertexPixelPos: new THREE.Vector2(),
    vertexWorldPos: new THREE.Vector3(),
    label: -1,
  };

  /** Whether this prompter accepted the current pointer gesture's press. */
  #isPrompting = false;

  /**
   * Creates a new point prompter.
   *
   * @param pointer The pointer that interacts with the objects.
   * @param raycaster Raycasts the pointer against the point cloud.
   * @param canvas The HTML canvas where this object draws in.
   */
  constructor(
    pointer: WindowPointer,
    raycaster: THREE.Raycaster,
    canvas: HTMLCanvasElement,
  ) {
    super();

    this.canvas = canvas;
    const context = this.canvas.getContext("2d");

    if (context == null) {
      throw Error("2D context is not supported.");
    }

    this.#context = context;
    this.pointer = pointer;

    this.#interactor = pointer.createInteractor({ raycaster });

    this.#interactor.addEventListener("pointerdown", this.#onPointerEvent);
    this.#interactor.addEventListener("pointerup", this.#onPointerEvent);
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose(): void {
    this.#interactor.removeEventListener("pointerup", this.#onPointerEvent);
    this.#interactor.removeEventListener("pointerdown", this.#onPointerEvent);

    // The interactor is created through WindowPointer.createInteractor(),
    // whose callers are responsible for disposing it.
    this.#interactor.dispose();
  }

  #onPointerEvent = (event: Event): void => {
    const pointerEvent = event as ScenePointerEvent;

    if (pointerEvent.type === "pointerdown") {
      this.#onPointerDown(pointerEvent);
    } else if (pointerEvent.type === "pointerup") {
      this.#onPointerUp(pointerEvent);
    }
  };

  /**
   * Checks whether the coordinates of a prompted point are valid numbers.
   */
  isValidPoint(vertex: Readonly<THREE.Vector3>): boolean {
    return (
      Number.isFinite(vertex.x) &&
      Number.isFinite(vertex.y) &&
      Number.isFinite(vertex.z)
    );
  }

  /**
   * Triggered when the pointer is pressed down on this object's base element.
   */
  #onPointerDown = (event: ScenePointerEvent): void => {
    const { enabled, context } = this;
    if (!enabled) return;
    if (context == null) return;
    if (event.button !== 0 && event.button !== 2) return;

    const label = event.button === 0 ? 1 : 0;

    this.#newPromptData = {
      vertexPixelPos: this.getPointerPixelPos(event),
      vertexWorldPos: this.#getPointerWorldPosByIntersection(),
      label: label,
    };
    this.#isPrompting = true;

    this.startDrawInContext();
  };

  /**
   * Triggered when the pointer is released on this object's base element.
   */
  #onPointerUp = (event: ScenePointerEvent): void => {
    const { enabled, context } = this;
    if (!enabled) return;
    if (context == null) return;
    if (!this.#isPrompting) return;
    this.#isPrompting = false;

    const { vertexWorldPos, label } = this.#newPromptData;

    if (this.isValidPoint(vertexWorldPos)) {
      this.clearCanvas();

      this.#newPromptData = {
        vertexPixelPos: new THREE.Vector2(),
        vertexWorldPos: new THREE.Vector3(),
        label: -1,
      };

      this.dispatchEvent({
        type: "end",
        vertex: vertexWorldPos,
        label: label,
      });
    } else {
      this.abort();
    }
  };

  /**
   * Aborts prompting a point.
   */
  abort(): void {
    this.clearCanvas();
    this.#isPrompting = false;

    this.#newPromptData = {
      vertexPixelPos: new THREE.Vector2(),
      vertexWorldPos: new THREE.Vector3(),
      label: -1,
    };

    const { vertexWorldPos, label } = this.#newPromptData;

    this.dispatchEvent({
      type: "abort",
      vertex: vertexWorldPos,
      label: label,
    });
  }

  /**
   * Begins drawing a point on the 2d canvas context.
   */
  startDrawInContext(): void {
    const vertex = this.#newPromptData.vertexPixelPos;

    this.context.fillStyle = this.strokeColor.getStyle();
    this.context.fillRect(vertex.x, vertex.y, this.pointSize, this.pointSize);
  }

  /**
   * Clears anything that has been drawn into the 2d canvas context.
   */
  clearCanvas(): void {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
