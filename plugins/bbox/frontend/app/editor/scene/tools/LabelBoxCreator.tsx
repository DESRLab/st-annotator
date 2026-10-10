import { min, max, median } from "mathjs";
import { SnapToGroundMesh, type GroundMesh } from "sta-gmesh/app";
import * as THREE from "three";

import type { ScenePointerEvent, WindowPointer } from "sta/app/editor";
import { HoverController } from "sta/app/editor";
import { OptionalVector3, TransformUtils } from "sta/common";

import type { ReadonlyLabelBox } from "../data";

// Types from external plugins that don't export type info through the alias
type PointCloud = InstanceType<typeof import("sta-pcd/app").PointCloud>;

/**
 * Gets the default size of a bounding box.
 *
 * @param box The bounding box being created.
 * @returns The default size (or `null` if not specified) along each dimension.
 */
function getDefaultSizeThreeJS(
  box: ReadonlyLabelBox,
): Readonly<OptionalVector3> {
  const refClass = box.perceivedClass ?? box.gtClass;
  if (refClass == null) return new OptionalVector3();

  return refClass.defaultSizeThreeJS;
}

/**
 * Updates the centroid and size of a bounding box in the `y` direction so that it contains
 * the points in a point cloud that fall within the box in the `x` and `z` plane.
 *
 * If the bounding box contains no points, its size in the `y` direction is set to a very small
 * value.
 *
 * For simplicity, the bounding box is assumed to be upright, i.e., it has no rotation about
 * the `x` and `z` axes.
 *
 * @param box The bounding box to update. It is modified by this method.
 * @param pcd The reference point cloud. `null` is equivalent to an empty point cloud.
 * @param applyDefaultSize If `true`, instead sets the size to the default value of its
 * class (along each dimension), and the `y`-centroid to the median of that of the points.
 * @param tol If `applyDefaultSize=false` and the `y`-size of the bounding box falls
 * outside the interval `[default.y / tol, default.y * tol]`, the `y`-size is clamped to this
 * interval, and the `y`-centroid is set to the median of that of the points.
 * @returns The updated bounding box.
 */
function autoContainY(
  box: ReadonlyLabelBox,
  pcd: PointCloud | null,
  applyDefaultSize: boolean,
  tol = 1.5,
): ReadonlyLabelBox {
  if (tol < 0) {
    throw new Error("Tolerance must be non-negative");
  }

  const obj3D = box.asObject3D();
  const { x: defaultX, y: defaultY, z: defaultZ } = getDefaultSizeThreeJS(box);

  if (applyDefaultSize) {
    if (defaultX != null) obj3D.scale.x = defaultX;
    if (defaultY != null) obj3D.scale.y = defaultY;
    if (defaultZ != null) obj3D.scale.z = defaultZ;
  }

  const worldToBox = obj3D.matrixWorld.clone().invert();
  const yCoordsInBox = (pcd?.buffer.getCoords() ?? [])
    .filter((v: any) => {
      const { x, z } = v.clone().applyMatrix4(worldToBox);
      return -0.5 <= x && x <= 0.5 && -0.5 <= z && z <= 0.5;
    })
    .map((v: any) => v.y);

  if (yCoordsInBox.length > 0) {
    const medianY = median(yCoordsInBox) as number;

    if (applyDefaultSize) {
      obj3D.position.y = medianY;
      // Scale has already been set above
    } else {
      const minY = min(yCoordsInBox) as number;
      const maxY = max(yCoordsInBox) as number;
      const sizeY = maxY - minY;

      const minSizeY =
        defaultY != null ? defaultY / tol : Number.NEGATIVE_INFINITY;
      const maxSizeY =
        defaultY != null ? defaultY * tol : Number.POSITIVE_INFINITY;

      if (sizeY < minSizeY) {
        obj3D.position.y = medianY;
        obj3D.scale.y = minSizeY;
      } else if (sizeY > maxSizeY) {
        obj3D.position.y = medianY;
        obj3D.scale.y = maxSizeY;
      } else {
        obj3D.position.y = (maxY + minY) / 2;
        obj3D.scale.y = sizeY;
      }
    }
  }

  return box;
}

export type LabelBoxDrawMode =
  "corner2corner" | "center2front" | "point2center" | "center2point";

export interface LabelBoxCreatorEventMap {
  begin: { box: ReadonlyLabelBox };
  abort: { box: ReadonlyLabelBox };
  end: { box: ReadonlyLabelBox; applyDefaultSize: boolean };
}

/**
 * Creates a bounding box along the `x`-`z` plane.
 *
 * When `begin` is called, a new box is created. This box is resized
 * according to the cursor's position until `finish` is called.
 */
export class LabelBoxCreator extends THREE.EventDispatcher<LabelBoxCreatorEventMap> {
  /**
   * The pointer that is used to interact with the scene.
   */
  readonly pointer: WindowPointer;

  readonly #interactor: HoverController<unknown>;

  /**
   * Raycasts the pointer to the rendered scene.
   */
  get raycaster(): THREE.Raycaster {
    return this.#interactor.raycaster;
  }

  /**
   * Maintains the elevation of the bounding box relative to the ground mesh.
   */
  #snapper: InstanceType<typeof SnapToGroundMesh>;

  /**
   * A reference ground mesh used to adjust the elevation during the
   * transformation process.
   */
  get groundMesh(): GroundMesh | null {
    return this.#snapper.groundMesh;
  }

  set groundMesh(value: GroundMesh | null) {
    this.#snapper.groundMesh = value;
  }

  /**
   * A reference point cloud used to adjust the position at the end of the
   * creation process.
   */
  pcd: PointCloud | null;

  #disabled = false;

  /**
   * `true` if this creator is disabled; otherwise, `false`.
   *
   * If set to `true` while a bounding box is being created, aborts the process.
   */
  get disabled(): boolean {
    return this.#disabled;
  }

  set disabled(value: boolean) {
    if (this.#disabled !== value) {
      this.#disabled = value;

      if (this.#newObjData != null) {
        if (value) {
          this.abort();
        }
      }
    }
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
  getPointerWorldPos(elevation = 0, fallbackDistance = 10): THREE.Vector3 {
    const { camera, ray } = this.raycaster;

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -elevation);
    const planeIntersect = ray.intersectPlane(plane, new THREE.Vector3());
    if (planeIntersect != null) return planeIntersect;

    const cameraWorldPos = camera.getWorldPosition(new THREE.Vector3());
    const cameraDir = camera.getWorldDirection(new THREE.Vector3());
    const fallbackPos = cameraWorldPos.add(
      cameraDir.multiplyScalar(fallbackDistance),
    );
    return fallbackPos;
  }

  #newObjData: Readonly<{
    drawMode: LabelBoxDrawMode;
    initPos: THREE.Vector3;
    box: ReadonlyLabelBox;
  }> | null = null;

  /**
   * Whether a bounding box is being created.
   */
  get isCreating(): boolean {
    return this.#newObjData != null;
  }

  /**
   * The bounding box undergoing creation, if any.
   */
  get newObj(): ReadonlyLabelBox | null {
    return this.#newObjData?.box ?? null;
  }

  /**
   * Sets or unsets the stored state of a bounding box.
   *
   * @param data If given, sets the state to begin creating this box; otherwise, unsets
   * the state to finish creating the current box.
   */
  #setState(
    data: { drawMode: LabelBoxDrawMode; box: ReadonlyLabelBox } | null,
  ) {
    if (data == null) {
      this.#newObjData = null;
      this.#snapper.detach();
    } else {
      const { drawMode, box } = data;
      const obj3D = box.asObject3D();

      const initPos = obj3D.position.clone();
      this.#newObjData = { drawMode, initPos, box };

      this.#snapper.attach(obj3D);
    }
  }

  #clipToAspect = false;

  /**
   * Whether or not resizing is clipped to match the initial aspect ratio.
   * Default is `false`.
   */
  get clipToAspect(): boolean {
    return this.#clipToAspect;
  }

  set clipToAspect(value: boolean) {
    if (this.clipToAspect !== value) {
      this.#clipToAspect = value;

      this.updateState();
    }
  }

  /**
   * Whether to disable automatically adjusting the elevation of the bounding box during
   * creation to maintain its elevation relative to the ground mesh.
   */
  get disableRelElevation(): boolean {
    return this.#snapper.disabled;
  }

  set disableRelElevation(value: boolean) {
    this.#snapper.disabled = value;
  }

  #onPointerMove = (event: ScenePointerEvent) => {
    this.updateState();
  };

  /**
   * Creates a new bounding box creator.
   *
   * @param pointer The pointer that interacts with the objects.
   * @param raycaster Raycasts the pointer to this set of controls.
   * @param groundMesh A reference ground mesh, which if provided, is used to
   * adjust the elevation during the transformation process.
   * @param pcd A reference point cloud, which if provided, is used to
   * adjust the position at the end of the creation process.
   */
  constructor(
    pointer: WindowPointer,
    raycaster: THREE.Raycaster,
    groundMesh: GroundMesh | null = null,
    pcd: PointCloud | null = null,
  ) {
    super();

    this.pointer = pointer;

    this.#interactor = pointer.createHoverController({ raycaster });
    this.#snapper = new SnapToGroundMesh(groundMesh);
    this.pcd = pcd;

    this.#interactor.addEventListener("pointermove", this.#onPointerMove);
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose() {
    this.#interactor.removeEventListener("pointermove", this.#onPointerMove);
  }

  /**
   * Updates the state of the bounding box being created.
   *
   * This is a no-op if the creator is disabled, or if no box is being created.
   */
  updateState = () => {
    if (this.disabled) return;
    if (this.#newObjData == null) return; // !this.isCreatingBox

    const { drawMode, initPos, box } = this.#newObjData;
    const new3D = box.asObject3D();

    // If the box has just been added to be scene, we need to initialize the stored elevation
    this.#snapper.snapToMesh();

    const newWorldPos = new3D.getWorldPosition(new THREE.Vector3());
    const nextPointerWorldPos = this.getPointerWorldPos(newWorldPos.y);

    const worldToLocal = new3D.matrixWorld.clone().invert();

    const nextPointerLocalPos = nextPointerWorldPos
      .clone()
      .applyMatrix4(worldToLocal);

    // Update transformation matrix
    switch (drawMode) {
      case "corner2corner":
        TransformUtils.resize(
          new3D,
          new THREE.Vector3(0.5, 0, -0.5), // Front corner in horizontal plane
          nextPointerLocalPos,
          this.clipToAspect ? { x: 1, z: 1 } : undefined,
        );
        break;
      case "center2front": {
        TransformUtils.resize(
          new3D,
          new THREE.Vector3(0, 0, -0.5), // Front
          nextPointerLocalPos,
          { x: 1, z: 1, mode: "avg" },
          new THREE.Vector3(),
        );

        const delta = nextPointerWorldPos.clone().sub(initPos);
        new3D.rotation.y = Math.atan2(delta.x, delta.z);
        break;
      }
      case "point2center": {
        TransformUtils.translate(
          new3D,
          new THREE.Vector3(), // Center
          nextPointerLocalPos,
        );

        const delta = nextPointerWorldPos.clone().sub(initPos);
        new3D.rotation.y = Math.atan2(-delta.x, -delta.z);
        break;
      }
      case "center2point": {
        TransformUtils.translate(
          new3D,
          new THREE.Vector3(), // Center
          nextPointerLocalPos,
        );

        const delta = nextPointerWorldPos.clone().sub(initPos);
        new3D.rotation.y = Math.atan2(delta.x, delta.z);
        break;
      }
      default:
        throw new Error(`Invalid drawMode: ${drawMode}`);
    }

    this.#snapper.snapToMesh();
  };

  /**
   * Begins creating a bounding box.
   *
   * This is a no-op if the creator is disabled, or if a bounding box is already being created.
   *
   * @param drawMode The mode of drawing the bounding box.
   * @param box A newly constructed bounding box.
   * @returns `true` if this operation was successfully invoked; otherwise, `false`.
   */
  begin(drawMode: LabelBoxDrawMode, box: ReadonlyLabelBox): boolean {
    if (this.disabled) return false;
    if (this.isCreating) return false;

    this.#setState({ drawMode, box });

    this.dispatchEvent({ type: "begin", box: box });

    return true;
  }

  /**
   * Stops creating a bounding box.
   *
   * This is a no-op if no box is being created.
   *
   * @returns `true` if this operation was successfully invoked; otherwise, `false`.
   */
  abort(): boolean {
    if (this.#newObjData == null) return false; // !this.isCreatingBox

    const { box } = this.#newObjData;
    this.#setState(null);

    this.dispatchEvent({ type: "abort", box: box });

    return true;
  }

  /**
   * `true` if the size of the bounding box is fixed during creation; otherwise, `false`.
   *
   * This is also `false` if no bounding box is being created.
   */
  get isSizeFixed(): boolean {
    const drawMode = this.#newObjData?.drawMode;

    return drawMode === "point2center" || drawMode === "center2point";
  }

  /**
   * Finishes creating a bounding box.
   *
   * This is a no-op if the creator is disabled, or if no box is being created.
   *
   * @param applyDefaultSize If `true` and the size of the bounding box is variable
   * (according to {@link LabelBoxCreator#isSizeFixed}), the size of the bounding box is set
   * to the default value as specified by its class, if it is available.
   * @returns `true` if this operation was successfully invoked; otherwise, `false`.
   */
  end(applyDefaultSize = false): boolean {
    if (this.disabled) return false;
    if (this.#newObjData == null) return false; // !this.isCreatingBox

    const { box } = this.#newObjData;

    if (this.isSizeFixed) {
      // The size of the bounding box is fixed
    } else {
      autoContainY(box, this.pcd, applyDefaultSize);
    }

    this.#setState(null);

    this.dispatchEvent({ type: "end", box: box, applyDefaultSize });

    return true;
  }
}
