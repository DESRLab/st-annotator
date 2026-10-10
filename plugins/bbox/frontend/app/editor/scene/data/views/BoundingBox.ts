import * as THREE from "three";

import { ThreeUtils } from "sta/common";

export interface BoundingBoxParams {
  position: Readonly<THREE.Vector3>;
  rotation: Readonly<THREE.Euler>;
  scale: Readonly<THREE.Vector3>;
  color: Readonly<THREE.Color>;
  opacity: number;
  showForwardIndicator?: boolean;
  showFrame?: boolean;
}

export interface BoundingBoxElements {
  center: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  faces: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  edges: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  forwardIndicatorFaces: THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshBasicMaterial
  >;
  forwardIndicatorEdges: THREE.LineSegments<
    THREE.BufferGeometry,
    THREE.LineBasicMaterial
  >;
}

/**
 * Represents a bounding box in the scene.
 *
 * The bounding box should have unit dimensions in model space, such that its scale is equal
 * to its size.
 */
export class BoundingBox {
  /**
   * A point located at the center of this bounding box.
   */
  #center: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> =
    new THREE.Points();

  /**
   * Displays the faces of this bounding box.
   */
  #faces: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> =
    new THREE.Mesh();

  /**
   * Displays the edges of this bounding box.
   */
  #edges: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> =
    new THREE.LineSegments();

  /**
   * The faces that indicate the forward direction of this bounding box.
   */
  #forwardIndicatorFaces: THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshBasicMaterial
  > = new THREE.Mesh();

  /**
   * The edges that indicate the forward direction of this bounding box.
   */
  #forwardIndicatorEdges: THREE.LineSegments<
    THREE.BufferGeometry,
    THREE.LineBasicMaterial
  > = new THREE.LineSegments();

  /**
   * Displays this bounding box.
   */
  readonly #box: THREE.Group;

  /**
   * The position of this bounding box in world space.
   */
  get position(): Readonly<THREE.Vector3> {
    return this.#box.position.clone();
  }

  set position(value: Readonly<THREE.Vector3>) {
    this.#box.position.copy(value);
  }

  /**
   * The rotation of this bounding box.
   */
  get rotation(): Readonly<THREE.Euler> {
    return this.#box.rotation.clone();
  }

  set rotation(value: Readonly<THREE.Euler>) {
    this.#box.rotation.copy(value);
  }

  /**
   * The scale of this bounding box.
   */
  get scale(): Readonly<THREE.Vector3> {
    return this.#box.scale.clone();
  }

  set scale(value: Readonly<THREE.Vector3>) {
    this.#box.scale.copy(value);
  }

  #color: THREE.Color;

  /**
   * The display color of this bounding box.
   */
  get color(): Readonly<THREE.Color> {
    return this.#color;
  }

  set color(value: Readonly<THREE.Color>) {
    if (!this.#color.equals(value)) {
      this.#color = value.clone();

      this.#updateColor();
    }
  }

  /**
   * Updates the display color of the `three.js` components of this bounding box.
   */
  #updateColor() {
    const color = this.#color;

    this.#center.material.color.copy(color);
    this.#faces.material.color.copy(color);
    this.#edges.material.color.copy(color);
    this.#forwardIndicatorFaces.material.color.copy(color);
    this.#forwardIndicatorEdges.material.color.copy(color);
  }

  #opacity: number;

  /**
   * The opacity of the faces in this bounding box.
   */
  get opacity(): number {
    return this.#opacity;
  }

  set opacity(value: number) {
    const cleanedValue = ThreeUtils.checkOpacity(value);

    if (this.opacity !== cleanedValue) {
      this.#opacity = cleanedValue;

      this.#updateOpacity();
    }
  }

  /**
   * Updates the opacity of the components of this object.
   */
  #updateOpacity() {
    const opacity = this.#opacity;

    this.#faces.material.opacity = opacity;
    this.#forwardIndicatorFaces.material.opacity = opacity;
  }

  #showForwardIndicator: boolean;

  /**
   * Whether the forward indicator of this bounding box is visible.
   */
  get showForwardIndicator(): boolean {
    return this.#showForwardIndicator;
  }

  set showForwardIndicator(value: boolean) {
    if (this.#showForwardIndicator !== value) {
      this.#showForwardIndicator = value;

      this.#updateVisibility();
    }
  }

  #showFrame: boolean;

  /**
   * Whether the faces and edges of this bounding box are visible.
   */
  get showFrame(): boolean {
    return this.#showFrame;
  }

  set showFrame(value: boolean) {
    if (this.#showFrame !== value) {
      this.#showFrame = value;

      this.#updateVisibility();
    }
  }

  /**
   * Updates the visibility of the components of this object.
   */
  #updateVisibility() {
    const { showForwardIndicator, showFrame } = this;

    this.#center.visible = true;
    this.#faces.visible = showFrame;
    this.#edges.visible = showFrame;
    this.#forwardIndicatorFaces.visible = showForwardIndicator && showFrame;
    this.#forwardIndicatorEdges.visible = showForwardIndicator && showFrame;
  }

  /**
   * Creates a new bounding box.
   *
   * @param params The parameters of the bounding box.
   * @param elements The `three.js` elements of the bounding box.
   */
  constructor(params: BoundingBoxParams, elements: BoundingBoxElements) {
    this.#center = elements.center;
    this.#faces = elements.faces;
    this.#edges = elements.edges;
    this.#forwardIndicatorFaces = elements.forwardIndicatorFaces;
    this.#forwardIndicatorEdges = elements.forwardIndicatorEdges;

    this.#box = new THREE.Group().add(
      this.#center,
      this.#faces,
      this.#edges,
      this.#forwardIndicatorFaces,
      this.#forwardIndicatorEdges,
    );

    this.position = params.position;
    this.rotation = params.rotation;
    this.scale = params.scale;

    this.#color = params.color;
    this.#updateColor();

    this.#opacity = params.opacity;
    this.#updateOpacity();

    this.#showForwardIndicator = params.showForwardIndicator ?? true;
    this.#showFrame = params.showFrame ?? true;
    this.#updateVisibility();
  }

  /**
   * Returns a `three.js` representation of this object.
   *
   * Note that modifications to the `three.js` object may not be reflected in this object.
   */
  asObject3D(): THREE.Object3D {
    return this.#box;
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
    const target = this.showFrame ? this.#faces : this.#center;
    return raycaster.intersectObject(target, false, intersects);
  }

  dispose(): void {
    for (const object of [
      this.#center,
      this.#faces,
      this.#edges,
      this.#forwardIndicatorFaces,
      this.#forwardIndicatorEdges,
    ]) {
      object.geometry.dispose();
      object.material.dispose();
    }
    this.#box.clear();
  }
}

/**
 * Creates the `three.js` elements of a bounding box.
 */
export class BoundingBoxBuilder {
  /**
   * Creates the `three.js` object representing the center of a bounding box.
   *
   * @param color The color of the bounding box.
   * @returns The resulting object.
   */
  makeCenter(
    color: THREE.Color,
  ): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
    const point = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
    ]);
    const material = new THREE.PointsMaterial({
      color: color,
      size: 10,
      sizeAttenuation: false,
    });

    return new THREE.Points(point, material);
  }

  /**
   * Creates the `three.js` object representing the faces of a bounding box.
   *
   * @param color The color of the bounding box.
   * @param opacity The opacity of the faces in the bounding box.
   * @returns The resulting object.
   */
  makeFaces(
    color: THREE.Color,
    opacity: number,
  ): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
    throw new Error("Not implemented");
  }

  /**
   * Creates the `three.js` object representing the edges of a bounding box.
   *
   * @param faces The faces of the bounding box.
   * @returns The resulting object.
   */
  makeEdges(
    faces: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>,
  ): THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> {
    const edges = new THREE.EdgesGeometry(faces.geometry);
    const material = new THREE.LineBasicMaterial({
      color: faces.material.color,
    });

    return new THREE.LineSegments(edges, material);
  }

  /**
   * Creates the `three.js` object representing the faces indicating the forward direction of
   * a bounding box.
   *
   * @param color The color of the bounding box.
   * @param opacity The opacity of the faces in the bounding box.
   * @returns The resulting object.
   */
  makeForwardIndicatorFaces(
    color: THREE.Color,
    opacity: number,
  ): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
    throw new Error("Not implemented");
  }

  /**
   * Creates the `three.js` object representing the edges indicating the forward direction of
   * a bounding box.
   *
   * @param forwardIndicatorFaces The faces indicating the forward direction of the bounding box.
   * @returns The resulting object.
   */
  makeForwardIndicatorEdges(
    forwardIndicatorFaces: THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshBasicMaterial
    >,
  ): THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> {
    const edges = new THREE.EdgesGeometry(forwardIndicatorFaces.geometry);
    const material = new THREE.LineBasicMaterial({
      color: forwardIndicatorFaces.material.color,
    });

    return new THREE.LineSegments(edges, material);
  }

  /**
   * Creates a new bounding box.
   *
   * @param params The parameters of the bounding box.
   * @returns The newly created bounding box.
   */
  createBox(params: BoundingBoxParams): BoundingBox {
    const dummyColor = new THREE.Color("black");
    const dummyOpacity = 0;

    const center = this.makeCenter(dummyColor);
    const faces = this.makeFaces(dummyColor, dummyOpacity);
    const edges = this.makeEdges(faces);
    const forwardIndicatorFaces = this.makeForwardIndicatorFaces(
      dummyColor,
      dummyOpacity,
    );
    const forwardIndicatorEdges = this.makeForwardIndicatorEdges(
      forwardIndicatorFaces,
    );
    const elements = {
      center,
      faces,
      edges,
      forwardIndicatorFaces,
      forwardIndicatorEdges,
    };

    return new BoundingBox(params, elements);
  }
}
