import * as THREE from "three";

/**
 * The `three.js` representation of the points prompted to the labeling assistant.
 *
 * The foreground and background markers are persistent children of a single
 * group; their geometries are replaced in place rather than the children being
 * recreated. This keeps the group's child identity stable so that per-window
 * visibility masks applied to the group's descendants remain valid, and it
 * lets this object dispose of every replaced geometry.
 */
export class PointPrompt {
  /** Groups the prompted points according to their foreground/background labels. */
  readonly #prompts: THREE.Group = new THREE.Group();

  /** Displays each foreground prompt. */
  readonly #positive: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;

  /** Displays each background prompt. */
  readonly #negative: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;

  #negColor: THREE.Color = new THREE.Color("red");

  /** The display color of each background prompt. */
  get negColor(): Readonly<THREE.Color> {
    return this.#negColor;
  }

  set negColor(value: Readonly<THREE.Color>) {
    if (!this.#negColor.equals(value)) {
      this.#negColor = value.clone();
      this.#negative.material.color = value.clone();
    }
  }

  #posColor: THREE.Color = new THREE.Color("green");

  /** The display color of each foreground prompt. */
  get posColor(): Readonly<THREE.Color> {
    return this.#posColor;
  }

  set posColor(value: Readonly<THREE.Color>) {
    if (!this.#posColor.equals(value)) {
      this.#posColor = value.clone();
      this.#positive.material.color = value.clone();
    }
  }

  /**
   * Creates a new set of prompt markers.
   */
  constructor() {
    this.#positive = PointPrompt.#makePoints(this.posColor);
    this.#negative = PointPrompt.#makePoints(this.negColor);

    this.#positive.visible = false;
    this.#negative.visible = false;

    this.#prompts.add(this.#positive, this.#negative);
  }

  static #makePoints(
    color: Readonly<THREE.Color>,
  ): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.PointsMaterial({
      size: 10,
      color: color.clone(),
      side: THREE.DoubleSide,
      sizeAttenuation: false,
    });

    return new THREE.Points(geometry, material);
  }

  /**
   * Replaces the geometry of a marker in place, disposing of the previous one.
   */
  static #setCoords(
    points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>,
    coords: THREE.Vector3[],
  ): void {
    points.geometry.dispose();
    points.geometry = new THREE.BufferGeometry().setFromPoints(coords);
    points.visible = coords.length > 0;
  }

  /**
   * Displays the coordinates of each prompted point according to its label.
   *
   * @param coords The coordinates of each prompted point.
   * @param labels The foreground (1) or background (0) label of each prompted point.
   */
  add(coords: readonly THREE.Vector3[], labels: readonly number[]): void {
    const posCoords: THREE.Vector3[] = [];
    const negCoords: THREE.Vector3[] = [];

    for (let i = 0; i < coords.length; i++) {
      if (labels[i] === 1) {
        posCoords.push(coords[i]);
      } else {
        negCoords.push(coords[i]);
      }
    }

    PointPrompt.#setCoords(this.#positive, posCoords);
    PointPrompt.#setCoords(this.#negative, negCoords);
  }

  /**
   * Resets the prompted points displayed by this object.
   */
  clear(): void {
    PointPrompt.#setCoords(this.#positive, []);
    PointPrompt.#setCoords(this.#negative, []);
  }

  /**
   * Returns a `three.js` representation of this object.
   *
   * Note that modifications to the `three.js` object may not be reflected in this object.
   */
  asObject3D(): THREE.Object3D {
    return this.#prompts;
  }

  /**
   * Performs raycasting against this object.
   */
  raycast(
    raycaster: THREE.Raycaster,
    intersects: THREE.Intersection[] = [],
  ): THREE.Intersection[] {
    return raycaster.intersectObject(this.#prompts, false, intersects);
  }

  /**
   * Disposes of the GPU resources of this object. Do not use it afterwards.
   */
  dispose(): void {
    this.#positive.geometry.dispose();
    this.#positive.material.dispose();
    this.#negative.geometry.dispose();
    this.#negative.material.dispose();

    this.#prompts.clear();
  }
}
