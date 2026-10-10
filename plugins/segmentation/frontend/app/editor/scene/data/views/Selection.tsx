import * as THREE from "three";

export interface SelectionParams {
  /** The points' coordinates of creating a selection. */
  pointsCoords: readonly Readonly<THREE.Vector3>[] | Float32Array;
  /** The size of the points of a selection. */
  pointSize: Readonly<number>;
  /** The color representation to display this selection. */
  color: Readonly<THREE.Color>;
  /** The opacity of selection points over source points. */
  opacity?: number;
  /** `false` (default) if center of a selection is visibile, otherwise, `true`. */
  showCenter?: boolean;
}

export class Selection {
  /** Displays this bounding box. */
  #selection: THREE.Group;

  #points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;

  #packedPointCoords: Float32Array;

  /** A point located at the center of this selection. */
  #center: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> =
    new THREE.Points();

  /** The coordinates of each vertex, used to shape this geometry. */
  get pointCoords(): readonly Readonly<THREE.Vector3>[] {
    const points: THREE.Vector3[] = [];
    for (let index = 0; index < this.#packedPointCoords.length; index += 3) {
      points.push(
        new THREE.Vector3(
          this.#packedPointCoords[index],
          this.#packedPointCoords[index + 1],
          this.#packedPointCoords[index + 2],
        ),
      );
    }
    return points;
  }

  set pointCoords(value: readonly Readonly<THREE.Vector3>[] | Float32Array) {
    const packed = Selection.#pack(value);
    if (
      packed.length !== this.#packedPointCoords.length ||
      packed.some(
        (coordinate, index) => coordinate !== this.#packedPointCoords[index],
      )
    ) {
      this.#packedPointCoords = packed;
      this.#centerPoint = Selection.#findCenter(packed);
      this.#updateSelection();
    }
  }

  get packedPointCoords(): Float32Array {
    return this.#packedPointCoords;
  }

  static #pack(
    value: readonly Readonly<THREE.Vector3>[] | Float32Array,
  ): Float32Array {
    if (value instanceof Float32Array) return value;
    const packed = new Float32Array(value.length * 3);
    value.forEach((point, index) => {
      packed[index * 3] = point.x;
      packed[index * 3 + 1] = point.y;
      packed[index * 3 + 2] = point.z;
    });
    return packed;
  }

  static #findCenter(points: Float32Array): THREE.Vector3 {
    const center = new THREE.Vector3();
    const count = points.length / 3;
    for (let index = 0; index < points.length; index += 3) {
      center.x += points[index];
      center.y += points[index + 1];
      center.z += points[index + 2];
    }
    return count === 0 ? center : center.multiplyScalar(1 / count);
  }

  #showCenter: boolean;

  /** Whether the center this selection is visible. */
  get showCenter(): boolean {
    return this.#showCenter;
  }

  set showCenter(value: boolean) {
    if (this.#showCenter !== value) {
      this.#showCenter = value;

      this.#updateVisibility();
    }
  }

  /**
   * Updates the visibility of the components of this object.
   */
  #updateVisibility(): void {
    this.#center.visible = this.showCenter;
    this.#points.visible = !this.showCenter;
  }

  /**
   * Updates the point coordinates representing this object.
   */
  #updateSelection(): void {
    this.#points.geometry.dispose();
    this.#points.material.dispose();
    this.#center.geometry.dispose();
    this.#center.material.dispose();
    this.#points = this.#makePoints();
    this.#center = this.#makeCenter();

    this.#selection = new THREE.Group().add(this.#points, this.#center);

    this.#updateVisibility();
  }

  #color: Readonly<THREE.Color>;

  /** The display color of this bounding box. */
  get color(): Readonly<THREE.Color> {
    return this.#color;
  }

  set color(value: Readonly<THREE.Color>) {
    if (!(this.#color as THREE.Color).equals(value)) {
      this.#color = (value as THREE.Color).clone();

      this.#updateColor();
    }
  }

  /**
   * Updates the display color of the `three.js` components of this selection.
   */
  #updateColor(): void {
    const color = this.#color as THREE.Color;

    this.#center.material.color.copy(color);
    this.#points.material.color.copy(color);
  }

  /** The size of points in a selection. */
  #pointSize: number;

  #opacity: number;

  /** Opacity of the selection points over the source point cloud. */
  get opacity(): number {
    return this.#opacity;
  }

  set opacity(value: number) {
    if (this.#opacity === value) return;
    this.#opacity = value;
    const material = this.#points.material;
    material.opacity = value;
    const transparent = value < 1;
    if (material.transparent !== transparent) {
      material.transparent = transparent;
      material.needsUpdate = true;
    }
    material.depthWrite = !transparent;
  }

  /** Controls the display size of the points in this point cloud selection. */
  get pointSize(): number {
    return this.#pointSize;
  }

  set pointSize(value: number) {
    if (this.#pointSize !== value) {
      this.#pointSize = value;

      this.#updatePointSize();
    }
  }

  /**
   * Updates the point size of belonging to this selection.
   */
  #updatePointSize(): void {
    const pointSize = this.#pointSize;

    this.#points.material.size = pointSize;
  }

  #centerPoint: THREE.Vector3;

  /** The center of this selections. */
  get centerPoint(): Readonly<THREE.Vector3> {
    return this.#centerPoint;
  }

  /**
   * Creates the `three.js` object representing the center of a selection.
   */
  #makeCenter(): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
    const centerPoint = this.centerPoint.clone();

    const point = new THREE.BufferGeometry().setFromPoints([centerPoint]);
    const material = new THREE.PointsMaterial({
      color: (this.color as THREE.Color).clone(),
      size: 10,
      sizeAttenuation: false,
    });

    return new THREE.Points(point, material);
  }

  /**
   * Creates the `three.js` object representing the points of a selection.
   */
  #makePoints(): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
    const { pointSize, color } = this;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.#packedPointCoords, 3),
    );
    const material = new THREE.PointsMaterial({
      color: (color as THREE.Color).clone(),
      transparent: this.#opacity < 1,
      opacity: this.#opacity,
      depthWrite: this.#opacity >= 1,
      sizeAttenuation: false,
      size: pointSize,
    });

    return new THREE.Points(geometry, material);
  }

  /**
   * Constructs new instance of this object.
   */
  constructor(params: SelectionParams) {
    this.#packedPointCoords = Selection.#pack(params.pointsCoords);
    this.#centerPoint = Selection.#findCenter(this.#packedPointCoords);
    this.#showCenter = params.showCenter ?? false;
    this.#color = params.color;
    this.#pointSize = params.pointSize;
    this.#opacity = params.opacity ?? 0.5;

    this.#center = this.#makeCenter();
    this.#points = this.#makePoints();
    this.#selection = new THREE.Group().add(this.#center, this.#points);

    this.#updateVisibility();
  }

  /**
   * Returns a `three.js` representation of this object.
   *
   * Note that modifications to the `three.js` object may not be reflected in this object.
   */
  asObject3D(): THREE.Object3D {
    return this.#selection;
  }

  /**
   * Returns a `three.js` representation of the center point of this object.
   *
   * Note that modifications to the `three.js` object may not be reflected in this object.
   */
  centerAsObject3D(): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
    return this.#center;
  }

  /**
   * Performs raycasting against this object.
   */
  raycast(
    raycaster: THREE.Raycaster,
    intersects: THREE.Intersection[] = [],
  ): THREE.Intersection[] {
    const target = this.showCenter ? this.#center : this.#points;
    return raycaster.intersectObject(target, false, intersects);
  }

  dispose(): void {
    this.#points.geometry.dispose();
    this.#points.material.dispose();
    this.#center.geometry.dispose();
    this.#center.material.dispose();
    this.#selection.clear();
  }
}
