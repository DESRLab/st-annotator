import * as THREE from "three";

import type { ColorBlender, PointBuffer } from "sta/app/editor";
import { ThreeUtils } from "sta/common";

/** Represents a point cloud in the scene. */
export class PointCloud {
  /** A buffer containing the vertices of this point cloud. */
  readonly buffer: Readonly<PointBuffer>;

  /** The name of each channel for every point in the point cloud. */
  readonly channelNames: readonly string[];

  /** The number of channels in each point. */
  get numChannels(): number {
    return this.channelNames.length;
  }

  /** Displays each point in this point cloud. */
  #points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;

  /** The coordinates of the point cloud in world space. */
  get position(): Readonly<THREE.Vector3> {
    return this.#points.position.clone();
  }

  set position(value: THREE.Vector3) {
    this.#points.position.copy(value);
  }

  #blender: ColorBlender;

  /** The function that computes the color of each point in this point cloud. */
  get blender(): ColorBlender {
    return this.#blender;
  }

  set blender(value: ColorBlender) {
    if (this.#blender !== value) {
      this.#blender = value;

      this.#updateColors();
    }
  }

  /** Updates the color of each point in the point cloud. */
  #updateColors() {
    const pointColors = this.#points.geometry.getAttribute("color");
    this.blender
      .getColors(this.buffer)
      .forEach((color: THREE.Color, i: number) => {
        pointColors.setXYZ(i, color.r, color.g, color.b);
      });
    pointColors.needsUpdate = true;
  }

  /** Controls the display size of each point in this point cloud. */
  get pointSize(): number {
    return this.#points.material.size;
  }

  set pointSize(value: number) {
    this.#points.material.size = ThreeUtils.checkSize(value);
  }

  /** Creates a new point cloud. */
  constructor(
    buffer: Readonly<PointBuffer>,
    channelNames: readonly string[],
    position: Readonly<THREE.Vector3>,
    blender: ColorBlender,
    pointSize: number,
  ) {
    this.buffer = buffer.clone();
    this.channelNames = [...channelNames];

    this.#blender = blender;

    const geometry = buffer.updateGeometry(
      new THREE.BufferGeometry(),
      "position",
    );

    // Replaces this.#updateColors
    ThreeUtils.setFromColors(geometry, blender.getColors(buffer));

    const material = new THREE.PointsMaterial({
      vertexColors: true,
      sizeAttenuation: false,
    });

    this.#points = new THREE.Points(geometry, material);

    this.position = position;
    this.pointSize = pointSize;
  }

  /** Creates a deep copy of this point cloud (detached from its parents). */
  clone(): PointCloud {
    return new PointCloud(
      this.buffer,
      this.channelNames,
      this.position,
      this.blender,
      this.pointSize,
    );
  }

  /**
   * Returns a `three.js` representation of this object.
   *
   * Note that modifications to the `three.js` object may not be reflected in this object.
   */
  asObject3D(): THREE.Object3D {
    return this.#points;
  }

  /** Performs raycasting against this object. */
  raycast(
    raycaster: THREE.Raycaster,
    intersects: THREE.Intersection[] = [],
  ): THREE.Intersection[] {
    return raycaster.intersectObject(this.#points, false, intersects);
  }

  dispose(): void {
    this.#points.geometry.dispose();
    this.#points.material.dispose();
  }
}
