import kdTreePackage from "kd-tree-javascript";
import type { kdTree as KdTree } from "kd-tree-javascript";
import { RBush3D, type BBox } from "rbush-3d";
import * as THREE from "three";

import type { PointBuffer } from "sta/app/editor";

import { ThreeUtils } from "sta/common";

import { distance } from "./VectorUtils";

const { kdTree } = kdTreePackage;

/**
 * a shallow copy of point cloud in the scene.
 */
export class PointCloudUtils {
  /**
   * A buffer containing the vertices of this point cloud.
   */
  readonly buffer: PointBuffer;

  /** A 3D R-tree used to restrict interactive selection queries. */
  readonly tree: RBush3D;

  /** The KD tree structure indexing this point cloud, built lazily on first use. */
  #kTree: KdTree<THREE.Vector3> | null = null;

  get kTree(): KdTree<THREE.Vector3> {
    if (this.#kTree == null) {
      this.#kTree = new kdTree(this.buffer.getCoords(), distance, [
        "x",
        "y",
        "z",
      ]);
    }

    return this.#kTree;
  }

  /** The logits of the mask predicted by the labeling assistant, if any. */
  #maskLogits: Float32Array | null = null;

  get maskLogits(): Float32Array | null {
    return this.#maskLogits;
  }

  set maskLogits(value: Float32Array | null) {
    this.#maskLogits = value;
  }

  /** Whether the labeling assistant has successfully encoded this point cloud. */
  #encoded = false;

  get encoded(): boolean {
    return this.#encoded;
  }

  /** Whether encoding this point cloud with the labeling assistant has finished. */
  #encodeFinished = false;

  /** Resolved once encoding this point cloud with the assistant has finished. */
  #encodeWaiters: (() => void)[] = [];

  /**
   * Marks the encoding of this point cloud by the labeling assistant as finished.
   *
   * Only the first call has any effect, so a superseded or retried encoding
   * cannot overwrite the outcome of the one this point cloud was issued with.
   *
   * @param success Whether the assistant encoded this point cloud successfully.
   */
  finishEncode(success: boolean): void {
    if (this.#encodeFinished) return;

    this.#encodeFinished = true;
    this.#encoded = success;

    for (const waiter of this.#encodeWaiters) waiter();
    this.#encodeWaiters = [];
  }

  /**
   * Waits until the encoding of this point cloud by the labeling assistant
   * has finished.
   *
   * @returns `true` if this point cloud was encoded successfully.
   */
  async whenEncoded(): Promise<boolean> {
    if (!this.#encodeFinished) {
      await new Promise<void>((resolve) => this.#encodeWaiters.push(resolve));
    }

    return this.#encoded;
  }

  /** Displays each point in this point cloud. */
  #points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;

  /** The coordinates of the point cloud in world space. */
  get position(): Readonly<THREE.Vector3> {
    return this.#points.position.clone();
  }

  set position(value: Readonly<THREE.Vector3>) {
    this.#points.position.copy(value);
  }

  /** Controls the display size of each point in this point cloud. */
  get pointSize(): number {
    return this.#points.material.size;
  }

  set pointSize(value: number) {
    this.#points.material.size = ThreeUtils.checkSize(value);
  }

  #pointsInNDC: THREE.Vector3[] = [];

  get pointsInNDC(): THREE.Vector3[] {
    return this.#pointsInNDC;
  }

  set pointsInNDC(value: THREE.Vector3[]) {
    this.#pointsInNDC = value;
  }

  /** The number of channels of this object, only corresponds to x,y,z channels. */
  static NUM_CHANNELS = Object.freeze(3);

  /**
   * Creates a new point cloud.
   */
  constructor(
    buffer: Readonly<PointBuffer>,
    position: Readonly<THREE.Vector3>,
    pointSize: number,
  ) {
    this.buffer = buffer.clone();
    this.tree = new RBush3D(16).load(
      buffer.getCoords().map(({ x, y, z }): BBox => ({
        minX: x,
        minY: y,
        minZ: z,
        maxX: x,
        maxY: y,
        maxZ: z,
      })),
    );

    const geometry = buffer.updateGeometry(
      new THREE.BufferGeometry(),
      "position",
    );

    const material = new THREE.PointsMaterial({
      vertexColors: true,
      sizeAttenuation: false,
    });

    this.#points = new THREE.Points(geometry, material);

    this.position = position;
    this.pointSize = pointSize;
  }

  /**
   * Filters the points of this point cloud according to the predicted mask logits.
   *
   * @param threshold The minimum logit value (inclusive) for a point to be kept.
   * @returns The coordinates of the points whose logit is at least `threshold`;
   * empty if no mask has been predicted yet.
   */
  filterMaskLogitsByThreshold(threshold: number): THREE.Vector3[] {
    const { buffer, maskLogits } = this;
    if (maskLogits == null) return [];

    return buffer.getCoords().filter((_, i) => maskLogits[i] >= threshold);
  }

  /**
   * Obtains the points of this point cloud as a flat float32 array
   * in database coordinates.
   */
  getPointsAsFloat32(): Float32Array<ArrayBuffer> {
    const { format } = this.buffer;
    const dbCoords = this.buffer
      .getCoords()
      .map((v) => format.toDatabaseCoords(v));

    const coordsArr = new Float32Array(dbCoords.length * 3);
    for (const [i, { x, y, z }] of dbCoords.entries()) {
      coordsArr.set([x, y, z], i * 3);
    }

    return coordsArr;
  }
}
