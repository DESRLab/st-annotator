import * as THREE from "three";

interface PolylineParams {
  /** The coordinates of each vertex, used to trace out the line segments. */
  pathCoords: readonly Readonly<THREE.Vector3>[];
  /** The display color of the polyline. */
  color: Readonly<THREE.Color>;
}

/**
 * Represents a sequence of connected line segments in the scene.
 */
export class Polyline {
  #path: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial> =
    new THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>();

  #pathCoords: Readonly<THREE.Vector3>[];

  /** The coordinates of each vertex, used to trace out the line segments. */
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
  #updatePathVertices(): void {
    const pathCoords = this.#pathCoords;
    const position = this.#path.geometry.getAttribute("position");
    const sizeChanged = pathCoords.length !== position.count;

    if (sizeChanged) {
      const geometry = new THREE.BufferGeometry().setFromPoints(pathCoords);
      const material = this.#path.material.clone();
      this.#path = new THREE.Line(geometry, material);
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

  /** The display color of this polyline. */
  get color(): Readonly<THREE.Color> {
    return this.#path.material.color;
  }

  set color(value: Readonly<THREE.Color>) {
    this.#path.material.color.copy(value);
  }

  /**
   * Creates a new polyline.
   */
  constructor(params: PolylineParams) {
    const pathCoords = [...params.pathCoords];
    this.#pathCoords = pathCoords;

    // Replaces this.#updatePathVertices
    const geometry = new THREE.BufferGeometry().setFromPoints(pathCoords);
    const material = new THREE.LineBasicMaterial({
      color: params.color as THREE.Color,
    });
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

  /**
   * Performs raycasting against this object.
   */
  raycast(
    raycaster: THREE.Raycaster,
    intersects: THREE.Intersection[] = [],
  ): THREE.Intersection[] {
    return raycaster.intersectObject(this.#path, false, intersects);
  }
}
