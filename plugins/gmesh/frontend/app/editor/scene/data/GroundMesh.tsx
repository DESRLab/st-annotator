import * as THREE from "three";

import type { ColorBlender, PointBuffer } from "sta/app/editor";
import { ThreeUtils } from "sta/common";

/**
 * Represents the ground mesh for a point cloud.
 */
export class GroundMesh {
  /**
   * A buffer containing the vertices of this mesh.
   */
  readonly verticesBuffer: Readonly<PointBuffer>;

  /**
   * The name of each channel for every point in the mesh.
   */
  readonly channelNames: readonly string[] = ["x", "y", "z"];

  /**
   * The number of channels in each point.
   */
  get numChannels(): number {
    return this.channelNames.length;
  }

  /**
   * A buffer containing the faces of this mesh.
   * Should have length `numFaces * 3`.
   */
  readonly facesBuffer: Readonly<Int32Array>;

  #mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

  /**
   * The position of this mesh in world space.
   */
  get position(): Readonly<THREE.Vector3> {
    return this.#mesh.position.clone();
  }

  set position(value: THREE.Vector3) {
    this.#mesh.position.copy(value);
  }

  #blender: ColorBlender;

  /**
   * The function that computes the color of each vertex in this ground mesh.
   */
  get blender(): ColorBlender {
    return this.#blender;
  }

  set blender(value: ColorBlender) {
    if (this.blender !== value) {
      this.#blender = value;

      this.#updateColors();
    }
  }

  /**
   * Updates the color of each vertex in the ground mesh.
   */
  #updateColors() {
    const vertexColors = this.#mesh.geometry.getAttribute("color");
    this.blender.getColors(this.verticesBuffer).forEach((color, i) => {
      vertexColors.setXYZ(i, color.r, color.g, color.b);
    });
    vertexColors.needsUpdate = true;
  }

  /**
   * The opacity of the material of this ground mesh.
   */
  get opacity(): number {
    return this.#mesh.material.opacity;
  }

  set opacity(value: number) {
    this.#mesh.material.opacity = ThreeUtils.checkOpacity(value);
  }

  /**
   * Whether to display this ground mesh as a wireframe.
   */
  get showWireframe(): boolean {
    return this.#mesh.material.wireframe;
  }

  set showWireframe(value: boolean) {
    this.#mesh.material.wireframe = value;
  }

  /**
   * Creates a new ground mesh.
   */
  constructor(
    verticesBuffer: Readonly<PointBuffer>,
    facesBuffer: Readonly<Int32Array>,
    position: Readonly<THREE.Vector3>,
    blender: ColorBlender,
    opacity: number,
    showWireframe = true,
  ) {
    this.verticesBuffer = verticesBuffer.clone();
    this.facesBuffer = facesBuffer.slice();
    this.#blender = blender;

    const facesBufferArr = Array.from(facesBuffer);

    let geometry = new THREE.BufferGeometry();
    geometry = verticesBuffer.updateGeometry(geometry, "position");

    if (facesBuffer.length % 3) {
      throw new Error(
        `Length of facesBuffer should be divisible by 3. Found: ${facesBuffer.length}`,
      );
    }

    geometry.setIndex(facesBufferArr);

    // Replaces this.#updateColors
    geometry = ThreeUtils.setFromColors(
      geometry,
      blender.getColors(verticesBuffer),
    );
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      vertexColors: true,
    });

    this.#mesh = new THREE.Mesh(geometry, material);

    this.position = position;
    this.opacity = opacity;
    this.showWireframe = showWireframe;
  }

  dispose(): void {
    this.#mesh.geometry.dispose();
    this.#mesh.material.dispose();
  }

  /**
   * Creates a deep copy of this mesh (detached from its parents).
   */
  clone(): GroundMesh {
    return new GroundMesh(
      this.verticesBuffer,
      this.facesBuffer,
      this.position,
      this.blender,
      this.opacity,
      this.showWireframe,
    );
  }

  /**
   * Returns a `three.js` representation of this object.
   * Note that modifications to the `three.js` object may not be reflected in this object.
   */
  asObject3D(): THREE.Object3D {
    return this.#mesh;
  }

  /**
   * Performs raycasting against this object.
   */
  raycast(
    raycaster: THREE.Raycaster,
    intersects: THREE.Intersection[] = [],
  ): THREE.Intersection[] {
    return raycaster.intersectObject(this.#mesh, false, intersects);
  }
}
