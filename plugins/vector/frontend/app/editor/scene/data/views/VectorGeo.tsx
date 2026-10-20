import * as THREE from "three";

import { ThreeUtils } from "sta/common";

export type Line = THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;

export type Point = THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;

export interface VectorGeoParams<G extends Line | Point> {
  geo: G;
  vectorCoords: readonly THREE.Vector3[];
}

/**
 * Represents any 3D vector object geometries.
 */
export abstract class VectorGeo<G extends Line | Point> {
  #geo: G;

  #center: Point | null = null;

  readonly #centerPoint = new THREE.Vector3();

  /** The centroid shared by the marker and relation endpoints. */
  get centerPoint(): Readonly<THREE.Vector3> {
    return this.#centerPoint;
  }

  #hidden = false;

  /** Adds a centroid handle to label geometry; transient control clones omit it. */
  enableCenter(): void {
    this.#center = new THREE.Points(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3()]),
      new THREE.PointsMaterial({
        color: this.color,
        size: 10,
        sizeAttenuation: false,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.#center.renderOrder = 1;
    this.#geo.add(this.#center);
    this.#updateCenter();
  }

  #updateCenter(): void {
    if (this.#center == null) return;
    const points = this.isClosed
      ? this.vectorCoords.slice(0, -1)
      : this.vectorCoords;
    this.#center.visible = points.length > 0;
    const center = this.#centerPoint.set(0, 0, 0);
    for (const point of points) center.add(point);
    if (points.length > 0) center.multiplyScalar(1 / points.length);
    const position = this.#center.geometry.getAttribute("position");
    position.setXYZ(0, center.x, center.y, center.z);
    position.needsUpdate = true;
    this.#center.geometry.computeBoundingSphere();
  }

  /** Hides the vector surface while retaining its centroid handle. */
  setHidden(hidden: boolean): void {
    this.#hidden = hidden;
    this.#geo.material.visible = !hidden;
  }

  dispose(): void {
    this.#center?.geometry.dispose();
    this.#center?.material.dispose();
    this.#center?.removeFromParent();
    this.#geo.geometry.dispose();
    this.#geo.material.dispose();
  }

  get geo(): G {
    return this.#geo;
  }

  set geo(value: G) {
    if (this.#geo !== value) {
      this.#geo.geometry.dispose();
      this.#geo.material.dispose();
      this.#geo = value;
      this.setHidden(this.#hidden);
      if (this.#center != null) this.#geo.add(this.#center);
    }
  }

  get isClosed(): boolean {
    const vectorCoords = this.#vectorCoords;
    const coordsLenght = vectorCoords.length;

    const firstCoords = vectorCoords.at(0);
    const lastCoords = vectorCoords.at(coordsLenght - 1);

    if (firstCoords == null || lastCoords == null) return false;

    return coordsLenght > 3 && firstCoords.equals(lastCoords);
  }

  #vectorCoords: THREE.Vector3[];

  /**
   * The coordinates of each vertex, used to shape this geometry.
   */
  get vectorCoords(): readonly THREE.Vector3[] {
    return this.#vectorCoords;
  }

  set vectorCoords(value: readonly THREE.Vector3[]) {
    if (value != null) {
      if (!ThreeUtils.areVerticesEqual(this.vectorCoords, value)) {
        this.#vectorCoords = [...value];

        this.updateVector();
        this.#updateCenter();
        this.#geo.geometry.computeBoundingBox();
        this.#geo.geometry.computeBoundingSphere();
      }
    }
  }

  /**
   * Updates the vertices of the `three.js` representation of this geometry.
   */
  protected abstract updateVector(): void;

  /**
   * The display color of this polyline.
   */
  get color(): THREE.Color {
    return this.#geo.material.color;
  }

  set color(value: THREE.Color) {
    this.#geo.material.color.copy(value);
    this.#center?.material.color.copy(value);
  }

  /**
   * Updates the display color of the `three.js` components of this vector geometry.
   */
  protected updateColor(): void {
    throw Error("Not Implemented");
  }

  /**
   * Creates a new vector geometry.
   */
  constructor(params: VectorGeoParams<G>) {
    this.#vectorCoords = [...params.vectorCoords];
    this.#geo = params.geo;
  }

  /**
   * Returns a `three.js` representation of this object.
   *
   * Note that modifications to the `three.js` object may not be reflected in this object.
   */
  asObject3D(): THREE.Object3D {
    return this.#geo;
  }

  /**
   * Returns a new instance of this object.
   */
  abstract clone(): VectorGeo<G>;

  /**
   * Performs raycasting against this object.
   */
  raycast(
    raycaster: THREE.Raycaster,
    intersects: THREE.Intersection[] = [],
  ): THREE.Intersection[] {
    const targets: THREE.Object3D[] = [];
    if (!this.#hidden) targets.push(this.#geo);
    if (this.#center?.visible) targets.push(this.#center);
    return raycaster.intersectObjects(targets, false, intersects);
  }
}

export interface VectorBuilderParams {
  vectorCoords: readonly Readonly<THREE.Vector3>[];
  color: Readonly<THREE.Color>;
}

/**
 * Creates the `three.js` elements of a vector geometry.
 */
export abstract class VectorBuilder {
  /**
   * Creates the vector geometry shape.
   */
  abstract createVector(params: VectorBuilderParams): VectorGeo<Line | Point>;
}
