import * as THREE from "three";

import type {
  CoordinateFormatSpec,
  InteractController,
  ScenePointerEvent,
  WindowPointer,
} from "sta/app/editor";
import { ThreeUtils } from "sta/common";

import type { VectorType } from "../../../../models";
import { GeoUtils } from "../../utils";

/**
 * Represents the stages of drawing a complete vector object.
 */
type DrawStage = "begin" | "resume" | "end";

interface VectorVerticesData {
  verticesPixelPos: THREE.Vector2[];
  verticesWorldPos: THREE.Vector3[];
}

/**
 * Defines each event that can be dispatched by {@link VectorCreator}.
 */
export interface VectorCreatorEventMap {
  begin: { vertices: readonly THREE.Vector3[] };
  resume: { vertices: readonly THREE.Vector3[] };
  abort: { vertices: readonly THREE.Vector3[] };
  end: { vertices: readonly THREE.Vector3[] };
}

/**
 * Creates a vector object along the `x`-`z` plane.
 */
export class VectorCreator extends THREE.EventDispatcher<VectorCreatorEventMap> {
  /**
   * The type of this tool.
   */
  get vectorType(): VectorType {
    throw new Error("Not implemented");
  }

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

  readonly format: CoordinateFormatSpec;

  readonly #interactor: InteractController<unknown>;

  /**
   * Raycasts the pointer to the rendered scene.
   */
  get raycaster(): THREE.Raycaster {
    return this.#interactor.raycaster;
  }

  #pcdObj: THREE.Object3D | null = null;

  /** The `three.js` object displaying the point cloud to place vertices against. */
  get pcdObj(): THREE.Object3D | null {
    return this.#pcdObj;
  }

  set pcdObj(value: THREE.Object3D | null) {
    if (this.#pcdObj !== value) {
      this.#pcdObj = value;
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

      if (!value) {
        this.abort();
      }
    }
  }

  #strokeColor = new THREE.Color("red");

  /**
   * The color display of stroke while creating a vector object.
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

  #strokeWidth = 3;

  /**
   * The line width of vector object while creating the object.
   */
  get strokeWidth(): number {
    return this.#strokeWidth;
  }

  set strokeWidth(value: number) {
    if (value != null) {
      if (this.#strokeWidth !== value) {
        this.#strokeWidth = value;
      }
    }
  }

  #isClosed: boolean;

  /**
   * @returns `true` if the vector object being created is closed form shape.
   */
  get isClosed(): boolean {
    return this.#isClosed;
  }

  /**
   * Gets the position of the pointer in world space by raycasting it a horizontal plane.
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
    const fallbackPos = camera.localToWorld(localPos);
    return fallbackPos;
  }

  /**
   * Gets the position of the pointer in world space by raycasting the scene
   * point cloud, falling back to a horizontal plane when there is no hit.
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
    const { pcdObj, raycaster } = this;

    if (pcdObj != null) {
      const [intersect] = raycaster.intersectObjects([pcdObj], false);
      if (intersect != null) {
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
  #getPointerPixelPos(event: ScenePointerEvent): THREE.Vector2 {
    const { pageX, pageY } = event;

    const x = pageX - this.canvas.offsetLeft;
    const y = pageY - this.canvas.offsetTop;

    return new THREE.Vector2(x, y);
  }

  #newVectorData: VectorVerticesData = {
    verticesPixelPos: [],
    verticesWorldPos: [],
  };

  get isCreating(): boolean {
    return this.newVectorWorldVertices.length > 0;
  }

  /**
   * The vertices of vector object undergoing creation, if any.
   */
  get newVectorWorldVertices(): readonly THREE.Vector3[] {
    return this.#newVectorData.verticesWorldPos;
  }

  /**
   * The vertices of vector object undergoing creation, if any.
   */
  get newVectorPixelVerices(): readonly THREE.Vector2[] {
    return this.#newVectorData.verticesPixelPos;
  }

  #updateVectorVertices(
    drawStage: DrawStage,
    data: {
      vertexWorldPos: THREE.Vector3;
      vertexPixelPos: THREE.Vector2;
    } | null,
  ) {
    let { verticesWorldPos, verticesPixelPos } = this.#newVectorData;

    if (data === null) {
      verticesPixelPos = [];
      verticesWorldPos = [];
    } else {
      const { vertexWorldPos, vertexPixelPos } = data;

      switch (drawStage) {
        case "begin":
          verticesPixelPos = new Array(vertexPixelPos);
          verticesWorldPos = new Array(vertexWorldPos);
          break;
        case "resume":
          if (!this.#isCoordsRepeated(vertexWorldPos)) {
            verticesPixelPos.push(vertexPixelPos);
            verticesWorldPos.push(vertexWorldPos);
          }
          break;
        case "end":
          if (this.isClosed) {
            if (verticesPixelPos[0].equals(vertexPixelPos)) {
              verticesPixelPos.push(vertexPixelPos);
              verticesWorldPos.push(vertexWorldPos);
            }
          }
          break;
        default:
          verticesPixelPos = [];
          verticesWorldPos = [];
      }
    }

    this.#newVectorData = { verticesPixelPos, verticesWorldPos };
  }

  /**
   * Whether a coordinates already exist in the polygon vertices.
   *
   * @param coords The newly registered coordinates from pointer position.
   * @returns Returns true if the coordinate exists in the vertices list.
   */
  #isCoordsRepeated(coords: THREE.Vector3): boolean {
    return ThreeUtils.isCoordinatesInArray(this.newVectorWorldVertices, coords);
  }

  /**
   * @returns True if number of registered vertices are valid based on vector obejct type.
   */
  isValidVector(): boolean {
    const { vectorType, newVectorWorldVertices, format } = this;
    const vertices = newVectorWorldVertices.map((vector) =>
      format.toDatabaseCoords(vector),
    );
    return GeoUtils.isValidVector(vertices, vectorType);
  }

  /**
   * Creates a new vector object.
   *
   * @param format The configuration of the project.
   * @param pointer The pointer that interacts with the objects.
   * @param raycaster Raycasts the pointer to this set of controls.
   * @param canvas The HTML canvas where this object draws in.
   * @param isClosed Whether the vector object being created is closed form.
   */
  constructor(
    format: CoordinateFormatSpec,
    pointer: WindowPointer,
    raycaster: THREE.Raycaster,
    canvas: HTMLCanvasElement,
    isClosed: boolean,
  ) {
    super();
    this.canvas = canvas;
    const context = this.canvas.getContext("2d");

    if (context == null) {
      throw Error("2D context is not supported.");
    }

    this.#isClosed = isClosed;
    this.#context = context;
    this.pointer = pointer;
    this.format = format;

    this.#interactor = pointer.createInteractor({ raycaster });

    this.#interactor.addEventListener("pointerdown", this.#onPointerDown);
    this.#interactor.addEventListener("pointermove", this.#onPointerMove);
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose() {
    this.#interactor.removeEventListener("pointermove", this.#onPointerMove);
    this.#interactor.removeEventListener("pointerdown", this.#onPointerDown);
    this.#interactor.dispose();
  }

  /**
   * Triggered when the pointer is pressed down on this object's base element.
   *
   * @param event The corresponding pointer event.
   */
  #onPointerDown = (event: ScenePointerEvent) => {
    const { enabled, context } = this;
    if (!enabled) return;
    if (context === null) return;
    if (event.button !== 0) return;

    const pointerPixelPos = this.#getPointerPixelPos(event);
    const pointerWorldPos = this.#getPointerWorldPosByIntersection();
    this.#updateState(pointerWorldPos, pointerPixelPos);
    this.startDrawInContext();
  };

  /**
   * Triggered when pointer is moved on this object's base element.
   *
   * @param event The corresponding pointer event.
   */
  #onPointerMove = (event: ScenePointerEvent) => {
    const { enabled, isCreating } = this;
    if (!enabled || !isCreating) return;

    const pointerCoords = this.#getPointerPixelPos(event);
    this.startDrawInContext();
    this.updateDrawInContext(pointerCoords);
  };

  /**
   * Begins creating a bbox.
   *
   * @param worldCoords The pointer world coordinates.
   * @param pixelCoords The pointer pixel coordinates.
   */
  #updateState(worldCoords: THREE.Vector3, pixelCoords: THREE.Vector2) {
    const { enabled, isCreating } = this;
    if (!enabled) return;

    const drawStage = isCreating ? "resume" : "begin";

    const data: {
      vertexWorldPos: THREE.Vector3;
      vertexPixelPos: THREE.Vector2;
    } | null = {
      vertexWorldPos: worldCoords,
      vertexPixelPos: pixelCoords,
    };

    this.#updateVectorVertices(drawStage, data);

    this.dispatchEvent({
      type: drawStage,
      vertices: this.newVectorWorldVertices,
    });
  }

  #endState() {
    const {
      enabled,
      isCreating,
      newVectorPixelVerices,
      newVectorWorldVertices,
    } = this;
    if (!enabled || !isCreating) return;

    const data: {
      vertexWorldPos: THREE.Vector3;
      vertexPixelPos: THREE.Vector2;
    } | null = {
      vertexWorldPos: newVectorWorldVertices[0],
      vertexPixelPos: newVectorPixelVerices[0],
    };

    this.#updateVectorVertices("end", data);
  }

  /**
   * Aborts creating a vector object.
   *
   * @returns returns true if successfully is invoked.
   */
  abort(): boolean {
    this.clearCanvas();

    if (!this.isCreating) return false;

    this.#updateVectorVertices("end", null);

    const { verticesWorldPos } = this.#newVectorData;
    this.dispatchEvent({ type: "abort", vertices: verticesWorldPos });

    return true;
  }

  /**
   *  Finishes creating a vector object.
   *
   * @returns returns true if successfully is invoked.
   */
  finish(): boolean {
    if (!this.isCreating) return false;

    this.#endState();

    if (this.isValidVector()) {
      const { verticesWorldPos } = this.#newVectorData;

      this.clearCanvas();

      this.#updateVectorVertices("end", null);

      this.dispatchEvent({ type: "end", vertices: verticesWorldPos });

      return true;
    }
    return this.abort();
  }

  /**
   * @protected
   */
  protected startDrawInContext(): void {
    throw Error("Not Implemented");
  }

  /**
   *
   * @param pointerCoords The current pointer coordinates.
   * @protected
   */
  protected updateDrawInContext(pointerCoords: THREE.Vector2): void {
    throw Error("Not Implemented");
  }

  clearCanvas() {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
