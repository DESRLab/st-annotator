import * as THREE from "three";

export interface PolylineParams {
  pathCoords: readonly Readonly<THREE.Vector3>[];
  color: Readonly<THREE.Color>;
}

/**
 * Represents a sequence of connected line segments in the scene.
 */
export class Polyline {
  #path: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial> =
    new THREE.Line();

  #pathCoords: Readonly<THREE.Vector3>[];

  /**
   * The coordinates of each vertex, used to trace out the line segments.
   */
  get pathCoords(): readonly Readonly<THREE.Vector3>[] {
    return this.#pathCoords;
  }

  set pathCoords(value: readonly Readonly<THREE.Vector3>[]) {
    if (this.#pathCoords !== value) {
      this.#pathCoords = [...value];

      this.#updatePathVertices();
    }
  }

  /**
   * Updates the vertices of the `three.js` representation of this polyline.
   */
  #updatePathVertices() {
    const pathCoords = this.#pathCoords;
    const position = this.#path.geometry.getAttribute("position");
    const sizeChanged = pathCoords.length !== position.count;

    if (sizeChanged) {
      const oldPath = this.#path;
      const geometry = new THREE.BufferGeometry().setFromPoints(pathCoords);
      const material = oldPath.material.clone();
      this.#path = new THREE.Line(geometry, material);
      oldPath.geometry.dispose();
      oldPath.material.dispose();
    } else {
      pathCoords.forEach(({ x, y, z }, i) => {
        if (
          position.getX(i) !== x ||
          position.getY(i) !== y ||
          position.getZ(i) !== z
        ) {
          position.setXYZ(i, x, y, z);
          position.needsUpdate = true;
        }
      });
    }
  }

  /**
   * The display color of this polyline.
   */
  get color(): Readonly<THREE.Color> {
    return this.#path.material.color;
  }

  set color(value: Readonly<THREE.Color>) {
    this.#path.material.color.copy(value);
  }

  /**
   * Creates a new polyline.
   *
   * @param params The parameters of the polyline.
   */
  constructor(params: PolylineParams) {
    const pathCoords = [...params.pathCoords];
    this.#pathCoords = pathCoords;

    // Replaces this.#updatePathVertices
    const geometry = new THREE.BufferGeometry().setFromPoints(pathCoords);
    const material = new THREE.LineBasicMaterial({ color: params.color });
    this.#path = new THREE.Line(geometry, material);
  }

  /**
   * Returns a `three.js` representation of this object.
   *
   * Note that modifications to the `three.js` object may not be reflected in this object.
   */
  asObject3D(): THREE.Object3D {
    return this.#path;
  }

  dispose(): void {
    this.#path.geometry.dispose();
    this.#path.material.dispose();
  }

  /**
   * Performs raycasting against this object.
   *
   * @param raycaster The caster of the ray.
   * @param intersects If provided, the results are accumulated into
   * this array. Otherwise, a new one is instantiated.
   * @returns Refer to the `raycast` method of {@link THREE.Object3D}.
   */
  raycast(
    raycaster: THREE.Raycaster,
    intersects: THREE.Intersection[] = [],
  ): THREE.Intersection[] {
    return raycaster.intersectObject(this.#path, false, intersects);
  }
}
