import * as THREE from "three";
import type { RBush3D } from "rbush-3d";

import { EventSubscriptions } from "sta/app/editor";

import type {
  InteractController,
  InteractControllerEventMap,
  ScenePointerEvent,
  WindowPointer,
} from "sta/app/editor";
import { ThreeUtils } from "sta/common";

import { VectorUtils } from "../utils";

export type ToolTypes = "polygon" | "box" | "lasso" | "brush";

export interface ParametricGeo {
  center: THREE.Vector2;
  radius: number;
}

export interface VertexGeo {
  pixelVertices: THREE.Vector2[];
  ndcVertices: THREE.Vector2[];
}

export type ObjQuery = ParametricGeo | VertexGeo;

export interface SelectionCuratorEventMap<T extends ObjQuery> {
  begin: THREE.Event<"begin"> & { objQuery: T };
  pause: THREE.Event<"pause"> & { objQuery: T };
  abort: THREE.Event<"abort"> & { objQuery: T };
  end: THREE.Event<"end"> & { objQuery: T };
}

/**
 * Draws a geometry with set of vertices along `x-z` plane to be used
 * to query a selection from point cloud.
 */
export class SelectionCurator<T extends ObjQuery> extends THREE.EventDispatcher<
  SelectionCuratorEventMap<T>
> {
  get toolType(): ToolTypes {
    throw new Error("Not Implemented");
  }

  /**
   * The pointer that is used to interact with the scene.
   */
  readonly pointer: WindowPointer;

  /**
   * The canvas where this object renders on.
   */
  readonly canvas: HTMLCanvasElement;

  #context: CanvasRenderingContext2D;

  /**
   * The 2d context of this object is drawn.
   */
  get context(): CanvasRenderingContext2D {
    return this.#context;
  }

  #interactor: InteractController<unknown>;

  /**
   * Tracks the listener registrations of this object, released in {@link dispose}.
   */
  #subscriptions = new EventSubscriptions();

  /**
   * Raycasts the pointer to the rendered scene.
   */
  get raycaster(): THREE.Raycaster {
    return this.#interactor.raycaster;
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

      if (this.isCreating) {
        if (!value) {
          this.abort();
        }
      }
    }
  }

  #strokeColor: THREE.Color = new THREE.Color("red");

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

  /**
   * The object query being created.
   */
  #newDrawnObjData: T;

  get newDrawnObjData(): T {
    return this.#newDrawnObjData;
  }

  set newDrawnObjData(value: T) {
    if (this.#newDrawnObjData !== value) {
      this.#newDrawnObjData = value;
    }
  }

  /**
   * Whether a geometry object is being created to query the points
   * of a selection based on the drawn geometry object.
   */
  get isCreating(): boolean {
    throw new Error("Not Implemented");
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
   * Gets the normalized device coordinates of the pointer when an event is fired.
   *
   * @param event The event being fired.
   * @returns The normalized device coordinates as vector2.
   */
  getPointerNDCPos(event: PointerEvent): THREE.Vector2 {
    const pointerNDC = ThreeUtils.getPointerNDC(this.canvas, event);
    return new THREE.Vector2(pointerNDC.x, pointerNDC.y);
  }

  /**
   * Creates a new vector object.
   *
   * @param pointer The pointer that interacts with the objects.
   * @param raycaster Raycasts the pointer to this set of controls.
   * @param canvas The HTML canvas where this object draws in.
   * @param drawnObjData The data to store as state of drawn object.
   */
  constructor(
    pointer: WindowPointer,
    raycaster: THREE.Raycaster,
    canvas: HTMLCanvasElement,
    drawnObjData: T,
  ) {
    super();

    this.pointer = pointer;
    this.canvas = canvas;
    const context = this.canvas.getContext("2d");

    if (context == null) {
      throw Error("2D context is not supported.");
    }

    this.#context = context;
    this.#newDrawnObjData = drawnObjData;
    this.#interactor = pointer.createInteractor({ raycaster });

    this.#subscriptions.add<InteractControllerEventMap, "pointerdown">(
      this.#interactor,
      "pointerdown",
      this.#onPointerDownBound,
    );
    this.#subscriptions.add<InteractControllerEventMap, "pointermove">(
      this.#interactor,
      "pointermove",
      this.#onPointerMoveBound,
    );
    this.#subscriptions.add<InteractControllerEventMap, "pointerup">(
      this.#interactor,
      "pointerup",
      this.#onPointerUpBound,
    );
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose(): void {
    this.#subscriptions.dispose();
    this.#interactor.dispose();
  }

  /**
   * Clears anything that has been drawn into the 2d canvas context.
   */
  clearCanvas(): void {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Queries the point-cloud R-tree before applying the drawn screen-space query. */
  queryPointTree(tree: RBush3D, objQuery: T): THREE.Vector3[] {
    const camera = this.raycaster.camera;
    const { min, max } = VectorUtils.getCameraWorldFrustumMinMax(camera);
    const ptsToSearch = tree
      .search({
        minX: min.x,
        minY: min.y,
        minZ: min.z,
        maxX: max.x,
        maxY: max.y,
        maxZ: max.z,
      })
      .map(({ minX, minY, minZ }) => new THREE.Vector3(minX, minY, minZ));

    const ptsToSearchNDC = ThreeUtils.worldCoordsToNDC(
      [...ptsToSearch],
      camera,
    );

    return this.filterPoints(ptsToSearch, ptsToSearchNDC, objQuery);
  }

  /**
   * Filters the points based on the object query drawn.
   *
   * @protected
   * @param points The points to filter in world space.
   * @param ncdPoints The points to filter in ncd space.
   * @param objQuery The object to apply filtering query.
   * @returns The resulted filtered points.
   */
  filterPoints(
    points: THREE.Vector3[],
    ncdPoints: THREE.Vector3[],
    objQuery: T,
  ): THREE.Vector3[] {
    throw new Error("Not Implemented");
  }

  /**
   * Filters the points based on the object query drawn from buffer array.
   *
   * @param buffer The buffer array to query points from.
   * @param objQuery The object to apply filtering query.
   * @returns The resulted filtered points.
   */
  queryPointsFromBuffer(buffer: THREE.Vector3[], objQuery: T): THREE.Vector3[] {
    throw new Error("Not Implemented");
  }

  /**
   * Handles the interactor `pointerdown` event by delegating to {@link onPointerDown}.
   * Stored so that the same reference is removed in {@link dispose}.
   */
  #onPointerDownBound = (event: PointerEvent): void => {
    this.onPointerDown(event as unknown as ScenePointerEvent);
  };

  /**
   * Handles the interactor `pointermove` event by delegating to {@link onPointerMove}.
   * Stored so that the same reference is removed in {@link dispose}.
   */
  #onPointerMoveBound = (event: PointerEvent): void => {
    this.onPointerMove(event as unknown as ScenePointerEvent);
  };

  /**
   * Handles the interactor `pointerup` event by delegating to {@link onPointerUp}.
   * Stored so that the same reference is removed in {@link dispose}.
   */
  #onPointerUpBound = (event: PointerEvent): void => {
    this.onPointerUp(event as unknown as ScenePointerEvent);
  };

  /**
   * Triggered when pointer is moved on this object's base element.
   *
   * @protected
   * @param event The corresponding pointer event.
   */
  onPointerDown = (event: ScenePointerEvent): void => {
    throw new Error("Not Implemented");
  };

  /**
   * Triggered when pointer is moved on this object's base element.
   *
   * @protected
   * @param event The corresponding pointer event.
   */
  onPointerMove = (event: ScenePointerEvent): void => {
    throw new Error("Not Implemented");
  };

  /**
   * Triggered when pointer is moved on this object's base element.
   *
   * @protected
   * @param event The corresponding pointer event.
   */
  onPointerUp = (event: ScenePointerEvent): void => {
    throw new Error("Not Implemented");
  };

  /**
   * Begins drawing in a 2d canvas context.
   *
   * @param pointerCoords The current pointer coordinates.
   * @protected
   */
  startDrawInContext(pointerCoords: THREE.Vector2): void {
    throw Error("Not Implemented");
  }

  /**
   * Updates the display of drarwing into the 2d canvas context.
   *
   * @param pointerCoords The current pointer coordinates.
   * @protected
   */
  updateDrawInContext(pointerCoords: THREE.Vector2): void {
    throw Error("Not Implemented");
  }

  /**
   * Aborts creating a geometry.
   *
   * @returns returns true if successfully is invoked.
   */
  abort(): boolean {
    throw new Error("Not Implemented");
  }

  /**
   *  Finishes creating a geometry.
   *
   * @returns returns true if successfully is invoked.
   */
  finish(): boolean {
    throw new Error("Not Implemented");
  }
}
