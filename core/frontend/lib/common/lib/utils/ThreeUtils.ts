import _ from "lodash";
import * as THREE from "three";

import * as MathUtils from "./MathUtils";

/**
 * The threshold used to check if a value is close enough to zero.
 */
export const EPSILON = 1e-7;

/**
 * Checks if two numbers are close to each other, i.e., the absolute difference between them is
 * equal to or less than a threshold.
 */
export function isAbsClose(
  a: number,
  b: number,
  tol: number = EPSILON,
): boolean {
  return Math.abs(a - b) <= tol;
}

/**
 * Checks if two numbers are close to each other, i.e., the relative difference between them is
 * equal to or less than a threshold.
 */
export function isRelClose(
  a: number,
  b: number,
  tol: number = EPSILON,
): boolean {
  return (1 - tol) * b <= a && a <= (1 + tol) * b;
}

/**
 * Checks if x,y,z coordinates of two vector3 are close to each other,
 * i.e., the absolute difference between them is
 * equal to or less than a threshold.
 */
export function isVectorClose(
  value: THREE.Vector3,
  other: THREE.Vector3,
  tol: number = EPSILON,
): boolean {
  const v = value.clone();
  const o = other.clone();

  return (
    isAbsClose(v.x, o.x, tol) &&
    isAbsClose(v.y, o.y, tol) &&
    isAbsClose(v.z, o.z, tol)
  );
}

/**
 * Applies a function to each element of a vector, modifying it in-place.
 */
export function mapVector3(
  v: THREE.Vector3,
  fn: (value: number) => number,
): THREE.Vector3 {
  return v.set(fn(v.x), fn(v.y), fn(v.z));
}

/**
 * Computes the element-wise sum of one or more matrices.
 */
export function sumMatrix3(
  mat: THREE.Matrix3,
  ...mats: THREE.Matrix3[]
): THREE.Matrix3 {
  const result = new THREE.Matrix3().multiplyScalar(0);
  const resultElements = result.elements;

  for (const m of [mat, ...mats]) {
    m.elements.forEach((e: number, i: number) => {
      MathUtils.assertIsNumeric(e);

      resultElements[i] += e;
    });
  }

  return result;
}

/**
 * Sets the attributes for a `three.js` geometry from an array of normals.
 */
export function setFromNormals(
  geometry: THREE.BufferGeometry,
  normals: THREE.Vector3[],
): THREE.BufferGeometry {
  const normal: number[] = [];

  for (let i = 0, l = normals.length; i < l; i++) {
    const c = normals[i];
    normal.push(c.x, c.y, c.z);
  }

  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));

  return geometry;
}

/**
 * Sets the attributes for a `three.js` geometry from an array of colors.
 */
export function setFromColors(
  geometry: THREE.BufferGeometry,
  colors: THREE.Color[],
): THREE.BufferGeometry {
  const color: number[] = [];

  for (let i = 0, l = colors.length; i < l; i++) {
    const c = colors[i];
    color.push(c.r, c.g, c.b);
  }

  geometry.setAttribute("color", new THREE.Float32BufferAttribute(color, 3));

  return geometry;
}

/**
 * Gets the normalized device coordinates of the pointer when an event is fired.
 */
export function getPointerNDC(
  domElement: HTMLElement,
  event: PointerEvent,
): { x: number; y: number } {
  if (domElement.ownerDocument.pointerLockElement) {
    return { x: 0, y: 0 };
  }

  const rect = domElement.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
    y: -(((event.clientY - rect.top) / rect.height) * 2 - 1),
  };
}

/**
 * Further normalizes a set of normalized device coordinates to relative coordinates,
 * which fall in the interval `[0, 1]`.
 */
export function getNDCRelPos(ndc: { x: number; y: number }): {
  x: number;
  y: number;
} {
  return {
    y: 1 - (ndc.y + 1) / 2,
    x: (ndc.x + 1) / 2,
  };
}

/**
 * Calculates the 3D points in world coordinates into camera space.
 * or (normalized device coordinates).
 */
export function worldCoordsToNDC(
  points: THREE.Vector3[],
  camera: THREE.Camera,
): THREE.Vector3[] {
  return points.map((point: THREE.Vector3) => point.clone().project(camera));
}

/**
 * Sets the threshold when raycasting against points.
 */
export function setRaycasterPointsThreshold(
  raycaster: THREE.Raycaster,
  threshold: number,
): void {
  if (raycaster.params.Points == null) {
    raycaster.params.Points = { threshold };
  } else {
    raycaster.params.Points.threshold = threshold;
  }
}

/**
 * Sets the threshold when raycasting against lines.
 */
export function setRaycasterLineThreshold(
  raycaster: THREE.Raycaster,
  threshold: number,
): void {
  if (raycaster.params.Line == null) {
    raycaster.params.Line = { threshold };
  } else {
    raycaster.params.Line.threshold = threshold;
  }
}

/**
 * Updates a raycaster according to the position of the pointer when it is moved.
 */
export function updateRaycaster(
  raycaster: THREE.Raycaster,
  camera: THREE.Camera,
  domElement: HTMLElement,
  event: PointerEvent,
): THREE.Raycaster {
  const { x, y } = getPointerNDC(domElement, event);
  raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
  return raycaster;
}

/**
 * Checks that an inputted size is non-negative.
 */
export function checkSize(size: number): number {
  const isnan = Number.isNaN(size);

  if (isnan || size < 0) {
    console.error(`The size must be non-negative. Found: ${size}`);

    // Fallback value
    return isnan ? 0 : -size;
  }

  return size;
}

/**
 * Checks that an inputted opacity is in the range `[0, 1]`.
 */
export function checkOpacity(opacity: number): number {
  const isnan = Number.isNaN(opacity);

  if (isnan || opacity < 0 || opacity > 1) {
    console.error(`The opacity must be in the range [0, 1]. Found: ${opacity}`);

    // Fallback value
    return isnan ? 0 : _.clamp(opacity, 0, 1);
  }

  return opacity;
}

/**
 * Checks whether vector coordinates exists in an array.
 */
export function isCoordinatesInArray(
  array: readonly THREE.Vector[],
  point: THREE.Vector,
): boolean {
  return array.some((vec: THREE.Vector) => vec.equals(point));
}

/**
 * Performs a deep comparison between two array of vertices
 *  to determine if they are equivalent.
 */
export function areVerticesEqual(
  value: readonly THREE.Vector3[],
  other: readonly THREE.Vector3[],
): boolean {
  const serializedValue = value.map((vertex: THREE.Vector3) =>
    JSON.stringify(vertex),
  );
  const serializedOther = other.map((vertex: THREE.Vector3) =>
    JSON.stringify(vertex),
  );

  return _.isEqual(serializedValue, serializedOther);
}

/**
 * Gets the min and max coordinates of a given Vector3 array.
 */
export function findMinMax(value: readonly THREE.Vector3[]): {
  min: THREE.Vector3;
  max: THREE.Vector3;
} {
  const serializedValue = value.map((vertex: THREE.Vector3) => ({
    x: vertex.clone().x,
    y: vertex.clone().y,
    z: vertex.clone().z,
  }));

  const minX = _.minBy(serializedValue, (v) => v.x)?.x ?? 0;
  const minY = _.minBy(serializedValue, (v) => v.y)?.y ?? 0;
  const minZ = _.minBy(serializedValue, (v) => v.z)?.z ?? 0;
  const minCoords = new THREE.Vector3(minX, minY, minZ);

  const maxX = _.maxBy(serializedValue, (v) => v.x)?.x ?? 0;
  const maxY = _.maxBy(serializedValue, (v) => v.y)?.y ?? 0;
  const maxZ = _.maxBy(serializedValue, (v) => v.z)?.z ?? 0;
  const maxCoords = new THREE.Vector3(maxX, maxY, maxZ);

  return {
    min: minCoords,
    max: maxCoords,
  };
}

/**
 * Calculates the center point of vector3 array.
 */
export function findCenter(value: readonly THREE.Vector3[]): THREE.Vector3 {
  const center = new THREE.Vector3();

  value.forEach((vector: THREE.Vector3) => {
    center.add(vector.clone());
  });

  return center.divideScalar(value.length);
}
